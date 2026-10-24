// The stage's brain, shared by A and B: one hook that polls the platform, picks the most interesting transformer on its
// own, tells the story phase (calm, building, acting, flattened) and listens for the invisible presenter keys.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BLATNICA_DEVICE,
  meterDevice,
  post,
  useFlatten,
  useGridState,
  useHistory,
  useWeather,
  type Household,
  type RecentSignal,
  type Signal,
  type State,
  type Weather,
} from "../api";
import { allTfs, feederOf, headline, housesOf, loadPct, nice, pathOf, type House } from "../model";

export type Phase = "calm" | "building" | "acting" | "flattened";

export interface Story {
  phase: Phase;
  /** kW the transformer carries less than it would without Gridzilla (in the direction of its load). */
  gapKw: number;
  /** Worst of the forecast peak and the load right now, signed % of the limit (negative = solar flowing back). */
  peakPct: number;
  /** The limit in the direction of the flow: rating for import, reverse rating for solar backflow. */
  limitKw: number;
  /** Wall clock ms of the newest signal that reached this transformer, null when none. */
  actedAt: number | null;
  /** Load now with Gridzilla and without it, signed % of the limit. */
  nowPct: number | null;
  basePct: number | null;
  /** The signal covering this transformer right now (its own, its feeder's or its substation's). */
  signal: Signal | null;
  /** Houses here follow the SHAPE flattening plan. */
  shaped: boolean;
  /** Homes on this street and how many follow the signal (when one covers it) or else the diet plan. ONE count for the
   *  headline, the hero, P2 and the AI card. Null while the households of this street have not shipped. */
  street: Street | null;
  /** Gridzilla is taking load off this street right now: someone follows and the gap is worth saying. */
  helping: boolean;
  /** The newest signal on this street (or above it) that has ended, for the small "last one" lines. */
  last: { node: string; sig: RecentSignal } | null;
}

export interface Street {
  homes: number;
  follow: number;
  /** What the followers follow: the signal covering the street, else the diet plan. */
  what: "signal" | "plan";
  /** G2 formulas (qa/README.md) for the two counts. */
  homesFrom: string;
  followFrom: string;
}

/** Homes per simulated household (8). */
export const homesRatio = (s: State) => (s.summary && s.summary.households ? s.summary.houses / s.summary.households : 8);

/** Homes on tf: online simulated households x their weight, a real home counts once. Followers follow the active
 *  signal (telemetry mode under a signal, or acked applied/partial for its seq) or, with no signal, the diet plan
 *  (telemetry.shape). */
export function streetOf(s: State, tf: string, sig: Signal | null): Street | null {
  const r = homesRatio(s);
  const hs = Object.values(s.households ?? {}).filter((h) => h.tf === tf && h.telemetry);
  if (!hs.length) return null;
  const w = (h: Household) => (h.real ? 1 : h.represents || r);
  // Under the signal: the house's own telemetry says it runs a signal mode (not "owner"), or it acked this very seq
  // applied/partial. The ack alone is not enough: houses also ack the SHAPE plan (another seq), which overwrites it.
  const under = (h: Household) => h.telemetry?.mode != null && h.telemetry.mode !== "owner";
  const acked = (h: Household) => !!sig && h.ack?.seq === sig.seq && (h.ack.status === "applied" || h.ack.status === "partial");
  const fol = (h: Household) => (sig ? under(h) || acked(h) : !!h.telemetry?.shape);
  const HH = "state/households/*";
  const sum = (f: string) => `sum(${HH}[tf = ${tf} and real = false and ${f}]/represents) + count(${HH}[tf = ${tf} and real = true and ${f}])`;
  // The same "or" as two disjoint parts for qa/truth.mjs: in a signal mode, plus owner-or-no-mode houses that acked it.
  const ack = sig ? `ack/seq = ${sig.seq} and ack/status in applied,partial` : "";
  const folF = sig
    ? `${sum("telemetry/mode and telemetry/mode != owner")} + ${sum(`telemetry and telemetry/mode = owner and ${ack}`)} + ${sum(`telemetry and telemetry/mode = null and ${ack}`)}`
    : sum("telemetry/shape = true");
  return {
    homes: hs.reduce((a, h) => a + w(h), 0),
    follow: hs.filter(fol).reduce((a, h) => a + w(h), 0),
    what: sig ? "signal" : "plan",
    homesFrom: sum("telemetry"),
    followFrom: folF,
  };
}

/** Newest ended signal on the transformer or any node above it. */
export function lastOn(s: State, tf: string): { node: string; sig: RecentSignal } | null {
  const path = new Set(pathOf(s, tf));
  let best: { node: string; sig: RecentSignal } | null = null;
  for (const [n, r] of Object.entries(s.recent ?? {})) {
    if (!path.has(n) || !r.ended_at) continue;
    if (!best || Date.parse(r.ended_at) > Date.parse(best.sig.ended_at as string)) best = { node: n, sig: r };
  }
  return best;
}

// Timing of the self-playing stage (real seconds).
const MIN_STAY_MS = 45_000; // stay at least this long on a transformer
const MAX_STAY_MS = 120_000; // then move on even if the story stalls
const SETTLED_MS = 20_000; // a flattened curve has been on screen long enough
const MANUAL_MS = 120_000; // an arrow-key pick sticks this long
const ACTING_MS = 20_000; // a signal this fresh counts as "acting"
const SCENARIOS = ["normal", "cold-evening", "sunny-noon", "live-weather"];

const abs = (v: number | null | undefined) => Math.abs(v ?? 0);

/** Newest active signal on the transformer or any node above it. */
export function signalOn(s: State, tf: string): Signal | null {
  const path = new Set(pathOf(s, tf));
  let best: Signal | null = null;
  for (const [n, sig] of Object.entries(s.active ?? {})) {
    if (path.has(n) && (!best || sig.seq > best.seq)) best = sig;
  }
  return best;
}

/** Wall clock ms of the newest signal (active, recently ended, or sent by the autopilot) that reached this transformer. */
function lastActed(s: State, tf: string): number | null {
  const path = new Set(pathOf(s, tf));
  let t = 0;
  const seen = (iso: string | null | undefined) => {
    const ms = iso ? Date.parse(iso) : NaN;
    if (Number.isFinite(ms) && ms > t) t = ms;
  };
  Object.entries(s.active ?? {}).forEach(([n, sig]) => path.has(n) && seen(sig.issued_at));
  Object.entries(s.recent ?? {}).forEach(([n, sig]) => path.has(n) && seen(sig.issued_at));
  (s.autopilot?.history ?? []).forEach((d) => d.verdict === "sent" && d.mode !== "RELEASE" && d.segment && path.has(d.segment) && seen(d.at));
  return t || null;
}

/** Story numbers for any transformer. */
export function storyOf(s: State, tf: string): Story {
  const a = s.aggregates?.[tf];
  const t = s.tree[tf];
  const total = a?.total_kw ?? null;
  const base = a?.baseline_kw ?? null;
  const limitKw = (total ?? 0) < 0 ? t?.reverse_kw ?? t?.rating_kw ?? 0 : t?.rating_kw ?? 0;
  const nowPct = loadPct(s, tf, total);
  const basePct = base != null ? loadPct(s, tf, base) : null;
  const fc = s.forecast_peak?.[tf]?.pct ?? s.autopilot?.hotspots?.[tf]?.pct ?? null;
  const peakPct = abs(fc) >= abs(nowPct) ? fc ?? nowPct ?? 0 : nowPct ?? 0;
  const gapKw = base != null && total != null ? Math.round((Math.abs(base) - Math.abs(total)) * 10) / 10 : 0;
  const signal = signalOn(s, tf);
  const street = streetOf(s, tf, signal);
  const plan = signal ? null : street;
  const shaped = plan ? plan.follow > 0 : street ? Object.values(s.households ?? {}).some((h) => h.tf === tf && h.telemetry?.shape) : !!s.shape?.enabled && (s.summary?.shaped ?? 0) > 0;
  const actedAt = lastActed(s, tf);
  const nowMs = Date.parse(s.now) || Date.now();
  const ap = s.autopilot;
  const aiOnIt = !!ap?.busy && !!ap.target && (ap.target.hot?.includes(tf) || pathOf(s, tf).includes(ap.target.node));
  const trigger = ap?.trigger_pct ?? 85;
  const gapPct = limitKw ? (100 * gapKw) / limitKw : 0;
  let phase: Phase = "calm";
  if (aiOnIt || (actedAt != null && nowMs - actedAt < ACTING_MS)) phase = "acting";
  else if ((signal || shaped) && gapPct > 3 && abs(nowPct) < 100) phase = "flattened";
  else if (abs(peakPct) >= trigger || abs(basePct) >= 100 || abs(nowPct) >= trigger) phase = "building";
  // Someone on this street follows (households shipped), or the households are not here yet and a signal or the plan runs.
  const following = street ? street.follow > 0 : !!signal || shaped;
  const helping = following && gapKw >= Math.max(1, limitKw * 0.02);
  return { phase, gapKw, peakPct, limitKw, actedAt, nowPct, basePct, signal, shaped, street, helping, last: lastOn(s, tf) };
}

// ------------------------------------------------------------------ the moment's wording

export type DayPart = "night" | "morning" | "midday" | "afternoon" | "evening";

/** ONE place that words the moment: the grid hour, which way the power flows and the sky. The top bar's scenario label
 *  and weather, the headline and the chart title all read it, so they can never contradict each other. */
export interface Moment {
  /** Grid hour, 0..24. */
  hour: number;
  part: DayPart;
  /** Solar is flowing back on the street on screen (with or without Gridzilla). */
  backflow: boolean;
  /** The weather at this grid hour (platform weather.py grid_view). Under the strong-sun scenario in daylight `word` is
   *  "Sunny", so the top bar never says "Cloudy" over a forced-sunny grid. */
  sky: { i: number; temp: number; word: string | null } | null;
  /** The headline may say "sun": solar is flowing back and the sky we show is not overcast. */
  sun: boolean;
  /** The scenario in plain words, named by what it changes (cold, sun), never by a time of day the clock may not show. */
  scenario: string | null;
  /** The hero chart's title. */
  title: string;
}

// Named by what the platform scenario changes (it scales load and solar, it never moves the grid clock), so the label
// never promises a time of day the clock does not show ("Cold evening" next to 07:33).
const SCENARIO_LABEL: Record<string, string> = {
  normal: "Normal day",
  "cold-evening": "Cold weather",
  "sunny-noon": "Strong sun",
  "live-weather": "Live weather",
};

const partOf = (h: number): DayPart => (h < 5 ? "night" : h < 11 ? "morning" : h < 14 ? "midday" : h < 17 ? "afternoon" : h < 22 ? "evening" : "night");

/** The moment on `tf` (or the grid when none is on screen) at the grid hour of this poll. */
export function momentOf(s: State, tf: string | null, w: Weather | null): Moment {
  const hour = (((s.sim_hour ?? 0) % 24) + 24) % 24;
  const part = partOf(hour);
  const a = tf ? s.aggregates?.[tf] : undefined;
  const backflow = (a?.total_kw ?? 0) < 0 || (a?.baseline_kw ?? 0) < 0;
  const name = s.scenario?.name || null;
  // The simulated sun is up between 06 and 18 (platform other_profile_kw); sunny-noon multiplies it by 5.
  const sunUp = hour > 6 && hour < 18;
  const forcedSun = name === "sunny-noon" && sunUp;
  const gv = w?.grid_view ?? [];
  const hh = Math.floor(hour);
  const i = gv.findIndex((g) => g && Math.round(g.h) % 24 === hh && Number.isFinite(g.temp_c));
  let sky: Moment["sky"] = null;
  let overcast = false;
  if (i >= 0) {
    const g = gv[i];
    const word = g.cloud_pct >= 70 ? "Cloudy" : g.cloud_pct >= 30 ? "Partly cloudy" : g.sun_wm2 > 50 ? "Sunny" : "Clear";
    overcast = g.cloud_pct >= 70 && !forcedSun;
    // Strong-sun scenario in daylight: the grid's sky is forced sunny, so say so instead of leaving a bare temperature.
    sky = { i, temp: g.temp_c, word: forcedSun && g.cloud_pct >= 30 ? "Sunny" : word };
  }
  const n = (tf && nice(tf)) || "this street";
  const title = !tf
    ? "The street with and without Gridzilla"
    : backflow
      ? `Keeping ${n}'s solar inside the backflow limit`
      : hour >= 15
        ? `Eating the evening peak on ${n}`
        : hour < 6
          ? `Tonight's plan for ${n}`
          : `Getting ${n} ready for the evening peak`;
  return {
    hour,
    part,
    backflow,
    sky,
    sun: backflow && !overcast && part !== "night",
    scenario: name ? SCENARIO_LABEL[name] ?? name.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()) : null,
    title,
  };
}

/** Every transformer by how much of a story it tells right now. The worst peak wins: the higher of tonight's forecast
 *  peak, the load without Gridzilla and the load now (either direction). A "would have gone over, did not" case and the
 *  autopilot's own worst transformer get a bonus, a small solar backflow never beats an evening peak. Exported so a
 *  stage can show the runner-up. */
export function rankTfs(s: State) {
  const worst = s.autopilot?.target?.worst ?? null;
  return allTfs(s)
    .map((tf) => {
      const st = storyOf(s, tf);
      const fc = abs(s.forecast_peak?.[tf]?.pct);
      const saved = abs(st.basePct) >= 100 && abs(st.nowPct) < 100;
      const covered = !!(st.signal || st.shaped) && st.gapKw > Math.max(1, st.limitKw * 0.03);
      const score = Math.max(fc, abs(st.basePct), abs(st.nowPct)) + (saved ? 40 : 0) + (tf === worst ? 25 : 0) + (covered ? 10 : 0);
      return { tf, score };
    })
    .sort((a, b) => b.score - a.score);
}

interface Pick {
  tf: string;
  feeder: string;
  at: number; // when we moved here
  manualUntil: number;
  settledSince: number | null; // first poll that saw the story flattened or calm
  repickAt: number; // after a scenario key: pick afresh once the new scenario shows in the data
}

const EMPTY: Pick = { tf: "", feeder: "", at: 0, manualUntil: 0, settledSince: null, repickAt: 0 };
const SCENARIO_SETTLE_MS = 4_000;
/** A newly picked street goes on screen once its last hours and its diet plan have landed, so no card ever shows an
 *  empty chart frame; it waits at most this long, then shows with what is there. */
const HOLD_MS = 2_500;

/** The lowest node above both (a feeder, a substation or the region), so one state payload carries both streets. */
function commonNode(tree: Record<string, { parent: string | null }>, a: string, b: string) {
  const up = new Set<string>();
  for (let c: string | null = a; c && tree[c]; c = tree[c].parent) up.add(c);
  for (let c: string | null = b; c && tree[c]; c = tree[c].parent) if (up.has(c)) return c;
  return "all";
}

/** Runs the whole stage. No visible controls: presenter keys are 1-4 scenarios, arrows previous/next transformer,
 *  F full screen. */
export function useStory() {
  const [pick, setPick] = useState<Pick>(EMPTY);
  /** The street on screen. `pick` is where the stage is going; it shows once its data is in (see HOLD_MS). */
  const [shown, setShown] = useState<{ tf: string; feeder: string }>({ tf: "", feeder: "" });
  const [, setHoldTick] = useState(0);
  const recentTfs = useRef<string[]>([]);
  const treeRef = useRef<State["tree"] | null>(null);
  // While moving between streets on different feeders, ask for the households of both (their common node).
  const moving = !!shown.tf && !!pick.tf && shown.tf !== pick.tf && shown.feeder !== pick.feeder;
  const hh = moving && treeRef.current ? commonNode(treeRef.current, pick.feeder, shown.feeder) : pick.feeder;
  const grid = useGridState(hh, pick.tf);
  const s = grid.data;
  if (s) treeRef.current = s.tree;

  // The first pick comes straight from the first state, in this very render: no extra poll, no extra frame.
  if (s && !pick.tf) {
    const best = rankTfs(s)[0];
    if (best) {
      recentTfs.current = [best.tf];
      setPick({ ...EMPTY, tf: best.tf, feeder: feederOf(s, best.tf), at: Date.now() });
    }
  }

  const move = useCallback((tf: string, s: State, manual: boolean) => {
    const now = Date.now();
    recentTfs.current = [tf, ...recentTfs.current.filter((x) => x !== tf)].slice(0, 4);
    setPick({ tf, feeder: feederOf(s, tf), at: now, manualUntil: manual ? now + MANUAL_MS : 0, settledSince: null, repickAt: 0 });
  }, []);

  // Auto-pick on every poll: first pick, then move on when the story has played.
  useEffect(() => {
    if (!s) return;
    const now = Date.now();
    if (!pick.tf || !s.tree[pick.tf] || (pick.repickAt && now >= pick.repickAt)) {
      const best = rankTfs(s)[0];
      if (best) move(best.tf, s, false);
      return;
    }
    if (pick.repickAt) return; // waiting for the new scenario to show
    if (pick.manualUntil > now) return;
    const st = storyOf(s, pick.tf);
    const settled = st.phase === "calm" || st.phase === "flattened";
    if (settled && pick.settledSince == null) setPick((p) => ({ ...p, settledSince: now }));
    if (!settled && pick.settledSince != null) setPick((p) => ({ ...p, settledSince: null }));
    const stay = now - pick.at;
    if (stay < MIN_STAY_MS) return;
    const done =
      st.phase === "calm" || (st.phase === "flattened" && pick.settledSince != null && now - pick.settledSince >= SETTLED_MS) || stay >= MAX_STAY_MS;
    if (!done) return;
    const next = rankTfs(s).find((r) => !recentTfs.current.includes(r.tf));
    if (next && next.tf !== pick.tf) move(next.tf, s, false);
    else setPick((p) => ({ ...p, at: now, settledSince: null })); // nothing better: stay and look again later
  }, [s, pick, move]);

  // Presenter keys, invisible on screen.
  const sRef = useRef<State | null>(null);
  sRef.current = s;
  const pickRef = useRef(pick);
  pickRef.current = pick;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      const cur = sRef.current;
      if (/^[1-4]$/.test(e.key)) {
        post(`scenario/${SCENARIOS[+e.key - 1]}`).catch(() => {});
        // New scenario, new story: let the next poll pick afresh.
        setPick((p) => ({ ...p, manualUntil: 0, repickAt: Date.now() + SCENARIO_SETTLE_MS }));
        recentTfs.current = [];
      } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && cur) {
        const tfs = allTfs(cur);
        if (!tfs.length) return;
        const i = tfs.indexOf(pickRef.current.tf);
        const step = e.key === "ArrowRight" ? 1 : -1;
        move(tfs[(i + step + tfs.length) % tfs.length], cur, true);
        e.preventDefault();
      } else if (e.key === "f" || e.key === "F") {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else document.documentElement.requestFullscreen().catch(() => {});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move]);

  // State, history and the diet plan of the picked street are fetched together, the moment it is picked; the street on
  // screen keeps its own history in the same request until the new one goes on.
  const target = pick.tf && s?.tree[pick.tf] ? pick.tf : "";
  const targetFeeder = target && s ? feederOf(s, target) : "";
  const tf = shown.tf && s?.tree[shown.tf] ? shown.tf : "";
  const feeder = tf && s ? feederOf(s, tf) : "";
  const meters = useMemo(
    () =>
      [tf, target]
        .filter((t, i, a) => t && a.indexOf(t) === i)
        .flatMap((t) =>
          Object.values(s?.households ?? {})
            .filter((h) => h.tf === t)
            .map(meterDevice)
            .slice(0, 12),
        ),
    [s, tf, target],
  );
  const histNodes = [target, targetFeeder, ...(tf && tf !== target ? [tf, feeder] : [])].filter((n, i, a) => n && a.indexOf(n) === i);
  const history = useHistory(target ? histNodes : [], [...meters, BLATNICA_DEVICE]);
  const plan = useFlatten(target || null);
  const weather = useWeather();

  // Put the picked street on screen once its history, its plan and its households are in, or after HOLD_MS anyway.
  if (target && target !== shown.tf && s) {
    const histIn = history.asked.includes(target);
    const planIn = plan.data != null || plan.failed;
    const hhIn = grid.hhOf === "all" || (grid.hhOf != null && grid.hhOf !== "" && pathOf(s, target).includes(grid.hhOf));
    if ((histIn && planIn && hhIn) || Date.now() - pick.at >= HOLD_MS) setShown({ tf: target, feeder: targetFeeder });
  }
  const waiting = !!target && target !== shown.tf;
  useEffect(() => {
    if (!waiting) return;
    const id = window.setTimeout(() => setHoldTick((n) => n + 1), Math.max(0, pick.at + HOLD_MS - Date.now()) + 20);
    return () => window.clearTimeout(id);
  }, [waiting, pick.at]);

  // One house to follow: keep the same one while it stays under a signal.
  const houseKey = useRef<string | null>(null);
  const house: House | null = useMemo(() => {
    if (!s || !tf) return null;
    const hs = housesOf(s, tf).sort((a, b) => a.key.localeCompare(b.key));
    const keep = hs.find((h) => h.key === houseKey.current && h.online && (h.underSignal || !hs.some((x) => x.underSignal)));
    const h = keep ?? hs.find((x) => x.online && x.underSignal) ?? hs.find((x) => x.online) ?? hs[0] ?? null;
    houseKey.current = h?.key ?? null;
    return h;
  }, [s, tf]);

  const story = useMemo(() => (s && tf ? storyOf(s, tf) : null), [s, tf]);
  const head = useMemo(() => (s ? headline(s) : null), [s]);
  const wx = weather.available ? weather.data : null;
  const moment = useMemo(() => (s ? momentOf(s, tf || null, wx) : null), [s, tf, wx]);

  return {
    s,
    loading: !s && !grid.error,
    error: grid.error,
    history: history.data,
    weather,
    feeder,
    tf,
    house,
    headline: head,
    story,
    /** The moment's wording (momentOf): headline, chart title and top bar all read it. */
    moment,
    /** True while an arrow-key pick holds the stage. */
    manual: pick.manualUntil > Date.now(),
  };
}

export type StoryState = ReturnType<typeof useStory>;
