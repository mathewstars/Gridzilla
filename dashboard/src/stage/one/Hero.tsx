// The claim a judge reads first (design/STAGE.md section 2): the story sentence, the ONE hero figure "kW taken off this
// street right now", the load ring (inner lap with Gridzilla, outer lap without) and the without / with / limit numbers.
// Fills the shell's "story" card. Sizes follow the card (container queries in hero.css), never the window, so it reads
// the same at every size class. Every number carries data-src / data-val (qa/README.md).
import { motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import type { History, State } from "../../api";
import { hhmm, nice } from "../../model";
import { P, loadTone } from "../palette";
import type { Moment, Story, StoryState } from "../useStory";
import Counter, { fmtNum } from "../kit/Counter";
import LoadRing from "../kit/LoadRing";
import "./hero.css";

const EASE = [0.25, 0.1, 0.3, 1] as const;

/** A unit at half size after its number, like apple.com "33 hours". */
const Unit = ({ children }: { children: ReactNode }) => <span className="gzH-unit">{children}</span>;

/** Absolute value with a real formatting, for numbers whose sign the words already say ("flowing back"). */
const absFmt = (d = 0) => (v: number) => fmtNum(Math.abs(v), d);

interface Taken {
  kw: number;
  back: boolean;
  /** G2 formula over the payload, so the gate can recompute the figure. */
  from: string;
  /** Grid hour of a past peak (null = right now) and where that hour lives in the payload. */
  at: number | null;
  atSrc: string | null;
  /** Wall-clock stamp of the history sample (past gaps only), so the same event can be kept across polls. */
  ts?: string;
}

/** kW taken off this street right now (both directions), from the aggregates of this poll. */
function gapNow(s: State, tf: string, min: number): Taken | null {
  const a = s.aggregates?.[tf];
  const A = `state/aggregates/${tf}`;
  if (!a || a.baseline_kw == null || a.total_kw == null) return null;
  // Noon: both are negative (solar pushed back); "taken off" is then the backflow Gridzilla soaked up.
  const back = a.baseline_kw < 0;
  const kw = back ? a.total_kw - a.baseline_kw : a.baseline_kw - a.total_kw;
  return kw >= min ? { kw, back, from: back ? `${A}/total_kw - ${A}/baseline_kw` : `${A}/baseline_kw - ${A}/total_kw`, at: null, atSrc: null } : null;
}

/** The biggest gap of the last 6 grid hours: never the hero, only the small "earlier" line. One fixed past event: the
 *  sample `keep` (shown before) stays while it is in the window, unless a clearly bigger gap appears, so its hh:mm never
 *  drifts from poll to poll. Solar backflow counts only when it was a real share (>= `backMin` kW) of the reverse limit. */
function gapPast(s: State, history: History | null, tf: string, min: number, backMin: number, keep: string | null): Taken | null {
  // By wall clock so a scenario jump of the grid clock cannot pull in an old day.
  const pts = history?.nodes?.[tf] ?? [];
  const now = Date.parse(s.now);
  const x = s.autopilot?.sim_x || 1;
  let best: Taken | null = null;
  let kept: Taken | null = null;
  pts.forEach((p, i) => {
    if (p.baseline_kw == null || !Number.isFinite(now)) return;
    const age = ((now - Date.parse(p.ts)) / 3_600_000) * x;
    if (!(age >= 0 && age <= 6)) return;
    const back = p.baseline_kw < 0;
    if (back && p.total_kw > 1) return; // flipped direction: not a like-for-like gap
    if (back && -p.baseline_kw < backMin) return; // a trickle of backflow is no solar story
    const kw = back ? p.total_kw - p.baseline_kw : p.baseline_kw - p.total_kw;
    if (kw < min) return;
    const H = `history/nodes/${tf}/${i}`;
    const rec: Taken = { kw, back, from: back ? `${H}/total_kw - ${H}/baseline_kw` : `${H}/baseline_kw - ${H}/total_kw`, at: p.h, atSrc: `${H}/h`, ts: p.ts };
    if (keep != null && p.ts === keep) kept = rec;
    if (!best || kw > (best as Taken).kw) best = rec;
  });
  const b = best as Taken | null;
  const k = kept as Taken | null;
  return k && (!b || b.kw <= k.kw * 1.1 + 1) ? k : b;
}

/** The big sentence (STORY.md wording), from the same story state as the hero figure, P1, P2 and the AI card, and the
 *  same moment (useStory momentOf) as the top bar and the chart title: "sun" only while the sky shown is not overcast. */
function sentence(st: Story, name: string, nowTaken: Taken | null, m: Moment | null) {
  const over = Math.abs(st.nowPct ?? 0) >= 100;
  if (nowTaken?.back) return m?.sun ? `Gridzilla is soaking up ${name}'s ${m.part} sun.` : `Gridzilla is soaking up ${name}'s solar backflow.`;
  if (nowTaken) return st.signal ? `Gridzilla is flattening the peak on ${name}.` : `Gridzilla is putting ${name} on a diet.`;
  if (st.phase === "acting") return `Gridzilla is stepping in on ${name}.`;
  if (over) return `${name} is over its limit.`;
  if (st.phase === "building") return (st.nowPct ?? st.peakPct) < 0 ? `Solar is pushing ${name} backwards.` : `The peak is building on ${name}.`;
  const plan = st.street?.what === "plan" && st.street.follow > 0;
  return plan ? `${name} is on its diet plan.` : `${name} needs no help right now.`;
}

/** Small key glyphs, so colour never stands alone: a ring arc for the two laps, a short line for the limit. */
function Arc({ color, faint }: { color: string; faint?: boolean }) {
  return (
    <svg className="gzH-key" viewBox="0 0 16 16" aria-hidden>
      <path d="M8 2.5a5.5 5.5 0 1 1-5.5 5.5" fill="none" stroke={color} strokeOpacity={faint ? 0.55 : 1} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
function Bar({ color }: { color: string }) {
  return (
    <svg className="gzH-key" viewBox="0 0 16 16" aria-hidden>
      <path d="M2 8h12" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** One of the three numbers under the hero: label with its key, then the value. */
function Stat({ k, label, children }: { k: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="gzH-stat">
      <div className="gzH-stat-l">
        {k}
        <span>{label}</span>
      </div>
      <div className="gzH-stat-v">{children}</div>
    </div>
  );
}

/** Backflow share of the reverse limit that starts the solar story, and the share under which it may end (after 45 s). */
const SOLAR_IN = 0.15;
const SOLAR_OUT = 0.1;
const SOLAR_HOLD_MS = 45_000;

export default function Hero({ st }: { st: StoryState }) {
  const { s, tf, story, history } = st;
  // Story memory across polls: the solar story latch (hysteresis + hold) and the one "earlier" event shown.
  const solar = useRef({ tf: "", on: false, since: 0 });
  const earlier = useRef<{ tf: string; ts: string } | null>(null);
  // No fade on the first paint: the headline is on screen at full strength from the start.
  const painted = useRef(false);
  useEffect(() => {
    painted.current = true;
  }, []);
  if (!s || !tf || !story) {
    return (
      <div className="gzH">
        <p className="gzH-wait">{st.error ? "The grid platform is not answering yet." : "Connecting to the grid."}</p>
      </div>
    );
  }

  const name = nice(tf);
  const A = `state/aggregates/${tf}`;
  const agg = s.aggregates?.[tf];
  const base = agg?.baseline_kw ?? null;
  const total = agg?.total_kw ?? null;
  const back = (total ?? 0) < 0;
  const t = s.tree?.[tf];
  // The limit in the direction of the flow. aggregates.rating_kw stays in every poll (the tree only ships once).
  const limitKw = story.limitKw || agg?.rating_kw || t?.rating_kw || 0;
  const reverseDiffers = back && t?.reverse_kw != null && t.reverse_kw !== t.rating_kw;
  const limitSrc = reverseDiffers ? `state/tree/${tf}/reverse_kw` : `${A}/rating_kw`;
  const pct = agg?.load_pct ?? story.nowPct;
  const basePct = story.basePct;

  const min = Math.max(1, limitKw * 0.02);
  // The solar story only when the backflow without Gridzilla is a real share of the reverse limit: on at 15 %, off under
  // 10 % and never within 45 s of switching on, so the headline does not flip from poll to poll.
  const revKw = t?.reverse_kw ?? t?.rating_kw ?? agg?.rating_kw ?? limitKw;
  const backShare = base != null && base < 0 && revKw > 0 ? -base / revKw : 0;
  const latch = solar.current;
  if (latch.tf !== tf) Object.assign(latch, { tf, on: false, since: 0 });
  const clock = Date.now();
  if (!latch.on && backShare >= SOLAR_IN) Object.assign(latch, { on: true, since: clock });
  else if (latch.on && backShare < SOLAR_OUT && clock - latch.since >= SOLAR_HOLD_MS) latch.on = false;
  // ONE story truth: the hero claims kW "right now" only while someone on this street follows and the gap is real.
  // While the solar story holds, any real soaked-up kW keeps it (no flip on a dip under the 2 % floor).
  const raw = story.helping ? gapNow(s, tf, min) : latch.on ? gapNow(s, tf, 0.5) : null;
  const nowTaken = raw && raw.back ? (latch.on ? raw : null) : raw;
  const keep = earlier.current?.tf === tf ? earlier.current.ts : null;
  const past = nowTaken ? null : gapPast(s, history, tf, min, SOLAR_IN * revKw, keep);
  if (past?.ts) earlier.current = { tf, ts: past.ts };
  // With Gridzilla above without (load moved earlier, e.g. batteries filling): say so, never a bare reversed pair.
  const extra = !nowTaken && base != null && total != null && base >= 0 && total - base >= min ? total - base : null;
  const line = sentence(story, name, nowTaken, st.moment);
  const loadAbs = Math.abs(pct ?? 0);
  const word = loadAbs >= 100 ? "Over its\u00a0limit" : loadAbs >= (s.autopilot?.trigger_pct ?? 85) ? "Near its\u00a0limit" : "Inside its\u00a0limit";
  const fp = s.forecast_peak?.[tf] ?? null;
  const trigger = s.autopilot?.trigger_pct ?? 85;

  return (
    <div className="gzH">
      {/* No exit fades: a new street or sentence replaces the old at once and settles in 0.25 s, so a screenshot never
          catches the only headline half-faded. Nothing animates on the first paint. */}
      <motion.div
        key={tf}
        className="gzH-in"
        initial={painted.current ? { opacity: 0.6 } : false}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25, ease: EASE }}
      >
          <div className="gzH-head">
              <motion.h1
                key={line}
                className="gzH-line"
                initial={painted.current ? { opacity: 0.6, y: 4 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: EASE }}
              >
                {line}
              </motion.h1>
            <p className="gzH-place">
              {name} street transformer{back ? ", solar flowing back" : ""}
            </p>
          </div>

          <div className="gzH-fig">
            {nowTaken ? (
              <div className="gzH-claim">
                <div className="gzH-big">
                  <Counter value={nowTaken.kw} src="derived" from={nowTaken.from} style={{ fontVariantNumeric: "proportional-nums" }} />
                  <Unit>kW</Unit>
                </div>
                <p className="gzH-cap">{nowTaken.back ? "less solar pushed back right now" : "taken off this street right now"}</p>
              </div>
            ) : (
              <div className="gzH-claim">
                <p className="gzH-state">{word}</p>
                {pct != null && (
                  <p className="gzH-cap">
                    <span className="gzH-n">
                      <Counter value={pct} format={absFmt()} src={agg?.load_pct != null ? `${A}/load_pct` : "derived"} from={agg?.load_pct != null ? undefined : `${A}/total_kw / ${limitSrc} * 100`} />
                      <span className="gzH-u">%</span>
                    </span>
                    {" of its limit right now"}
                  </p>
                )}
                {fp && Math.abs(fp.pct) >= trigger && (
                  <p className="gzH-note">
                    {"Forecast peak "}
                    <span style={{ color: loadTone(fp.pct) }} className="gzH-strong">
                      <Counter value={fp.pct} format={absFmt()} src={`state/forecast_peak/${tf}/pct`} />
                      {"\u00a0%"}
                    </span>
                    {" at "}
                    <span data-src={`state/forecast_peak/${tf}/h`}>{hhmm(fp.h)}</span>
                  </p>
                )}
                {extra != null && (
                  <p className="gzH-note">
                    {"+"}
                    <Counter value={extra} src="derived" from={`${A}/total_kw - ${A}/baseline_kw`} />
                    {"\u00a0kW now: load moved ahead of the peak"}
                  </p>
                )}
                {past && (
                  <p className="gzH-note">
                    {"Earlier: "}
                    <Counter value={past.kw} src="derived" from={past.from} />
                    {past.back ? "\u00a0kW less solar pushed back at " : "\u00a0kW taken off at "}
                    <span data-src={past.atSrc ?? undefined}>{hhmm(past.at as number)}</span>
                  </p>
                )}
              </div>
            )}

            {/* Ring: its centre number is the load with Gridzilla, so the wrapper carries the source. */}
            <div className="gzH-ring" data-src={agg?.load_pct != null ? `${A}/load_pct` : "derived"} data-from={agg?.load_pct != null ? undefined : `${A}/total_kw / ${A}/rating_kw * 100`} data-val={pct != null ? String(pct) : undefined}>
              {/* No line inside the ring: at this size it would fall under the smallest type; the % sits in the stats too. */}
              <LoadRing pct={pct} withoutPct={basePct} size={480} sublabel={null} />
            </div>
          </div>

          <div className="gzH-stats">
            <Stat k={<Arc color={loadTone(basePct)} faint={Math.abs(basePct ?? 0) < 100} />} label="Without Gridzilla">
              <span className="gzH-pair">
                <span>
                  <Counter value={base} format={absFmt()} src={`${A}/baseline_kw`} />
                  <Unit>kW</Unit>
                </span>
                {basePct != null && (
                  <span className="gzH-pct">
                    <Counter value={basePct} format={absFmt()} src="derived" from={`${A}/baseline_kw / ${limitSrc} * 100`} />
                    <Unit>%</Unit>
                  </span>
                )}
              </span>
            </Stat>
            <Stat k={<Arc color={loadTone(pct)} />} label="With Gridzilla">
              <span className="gzH-pair">
                <span>
                  <Counter value={total} format={absFmt()} src={`${A}/total_kw`} />
                  <Unit>kW</Unit>
                </span>
                {pct != null && (
                  <span className="gzH-pct">
                    <Counter value={pct} format={absFmt()} src={agg?.load_pct != null ? `${A}/load_pct` : "derived"} from={agg?.load_pct != null ? undefined : `${A}/total_kw / ${limitSrc} * 100`} />
                    <Unit>%</Unit>
                  </span>
                )}
              </span>
            </Stat>
            <Stat k={<Bar color={P.red} />} label={back ? "Backflow limit" : "Limit"}>
              <Counter value={limitKw || null} src={limitSrc} />
              <Unit>kW</Unit>
            </Stat>
          </div>
      </motion.div>
    </div>
  );
}
