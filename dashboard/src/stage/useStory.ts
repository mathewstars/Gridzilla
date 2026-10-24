// The stage's brain, shared by A and B: one hook that polls the platform, picks the most interesting transformer on its
// own, tells the story phase (calm, building, acting, flattened) and listens for the invisible presenter keys.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BLATNICA_DEVICE,
  meterDevice,
  post,
  useGridState,
  useHistory,
  useWeather,
  type Signal,
  type State,
} from "../api";
import { allTfs, feederOf, headline, housesOf, loadPct, pathOf, type House } from "../model";

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
  (s.autopilot?.history ?? []).forEach((d) => d.verdict === "sent" && d.segment && path.has(d.segment) && seen(d.at));
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
  const tfHouses = Object.values(s.households ?? {}).filter((h) => h.tf === tf && h.telemetry);
  const shaped = tfHouses.length
    ? tfHouses.some((h) => h.telemetry?.shape)
    : !!s.shape?.enabled && (s.summary?.shaped ?? 0) > 0;
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
  return { phase, gapKw, peakPct, limitKw, actedAt, nowPct, basePct, signal, shaped };
}

/** Every transformer by how much of a story it tells right now. Covered transformers with a real with-vs-without gap
 *  come first (largest gap wins, a "would have gone over, did not" case wins outright); then the worst peak. Exported
 *  so a stage can show the runner-up. */
export function rankTfs(s: State) {
  return allTfs(s)
    .map((tf) => {
      const st = storyOf(s, tf);
      const gapPct = st.limitKw ? (100 * st.gapKw) / st.limitKw : 0;
      const saved = abs(st.basePct) >= 100 && abs(st.nowPct) < 100;
      const covered = (st.signal || st.shaped) && gapPct > 5;
      // Ties lean to the transformer that would sit closest to its limit without Gridzilla.
      const score = covered ? 1000 + gapPct + abs(st.basePct) / 2 + (saved ? 100 : 0) : Math.max(abs(st.peakPct), abs(st.nowPct));
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

/** Runs the whole stage. No visible controls: presenter keys are 1-4 scenarios, arrows previous/next transformer,
 *  F full screen. */
export function useStory() {
  const [pick, setPick] = useState<Pick>(EMPTY);
  const recentTfs = useRef<string[]>([]);
  const grid = useGridState(pick.feeder, pick.tf);
  const s = grid.data;

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

  // The households on the transformer ship once the feeder is on screen.
  const tf = pick.tf && s?.tree[pick.tf] ? pick.tf : "";
  const feeder = tf && s ? feederOf(s, tf) : "";
  const meters = useMemo(
    () =>
      Object.values(s?.households ?? {})
        .filter((h) => h.tf === tf)
        .map(meterDevice)
        .slice(0, 12),
    [s, tf],
  );
  const history = useHistory(tf ? [tf, feeder] : [], [...meters, BLATNICA_DEVICE]);
  const weather = useWeather();

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
    /** True while an arrow-key pick holds the stage. */
    manual: pick.manualUntil > Date.now(),
  };
}

export type StoryState = ReturnType<typeof useStory>;
