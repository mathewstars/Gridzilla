// Slide 4: the monster eats peaks (1:35, 40 s, Peter). One big curve from the live diet plan for Vienna
// (/api/flatten?node=region:at), snapshotted once at mount: the street without Gridzilla heads past its limit at six,
// the orange slice above the plan level is eaten, the energy reappears as green in the night, the plan draws flat.
// Line draw-in adapted from 21st.dev "Line graph" by @motiondotdev (id 24687): pathLength draw-in, hover dropped.
import { useEffect, useId, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useFlatten } from "../../api";
import type { FlattenPlan } from "../../api";
import { P } from "../../stage/palette";
import type { SlideProps } from "../types";
import "./slide4.css";

const EASE = [0.25, 0.1, 0.3, 1] as const;

// Window on the x axis: clock 15:30 to 08:30 next morning, 17 hours.
const W_START = 15.5;
const W_HOURS = 17;
const TICKS = [16, 18, 20, 22, 0, 2, 4, 6, 8];

// Chart geometry inside the 1180x620 svg (canvas x 120..1300, y 300..920).
const X0 = 40;
const X1 = 1160;
const Y0 = 120;
const Y1 = 540;
const TICK_Y = 596;

interface Pt { off: number; naive: number; planned: number }
interface Snap {
  live: boolean;
  runs: Pt[][]; // continuous runs in window order (a new run where the plan's own 24 h wrap breaks the clock)
  level: number; // plan level, % of the limit
  peakNaive: number;
  peakPlan: number;
  houses: number | null;
  carsFull: boolean;
}

const offOf = (h: number) => (((h - W_START) % 24) + 24) % 24;

function fromPlan(p: FlattenPlan): Snap | null {
  const r = p.rating_kw;
  const n = Math.min(p.hours.length, p.naive_kw.length, p.planned_kw.length);
  if (!r || n < 8) return null;
  const rows: (Pt & { i: number })[] = [];
  for (let i = 0; i < n; i++) {
    const off = offOf(p.hours[i]);
    if (off <= W_HOURS + 0.01) rows.push({ i, off, naive: (p.naive_kw[i] / r) * 100, planned: (p.planned_kw[i] / r) * 100 });
  }
  rows.sort((a, b) => a.off - b.off);
  const runs: Pt[][] = [];
  let cur: Pt[] = [];
  rows.forEach((row, k) => {
    if (k > 0 && row.i !== rows[k - 1].i + 1) {
      if (cur.length) runs.push(cur);
      cur = [];
    }
    cur.push({ off: row.off, naive: row.naive, planned: row.planned });
  });
  if (cur.length) runs.push(cur);
  if (!runs.some((run) => run.length > 1)) return null;
  return {
    live: true,
    runs,
    level: (p.level_kw / r) * 100,
    peakNaive: Math.round(p.peak_naive_pct),
    peakPlan: Math.round(p.peak_plan_pct),
    houses: p.houses,
    carsFull: p.cars_full,
  };
}

// Hand-made illustration (shown only with the word "Illustration" on the slide) for when the plan is not reachable.
const IL_NAIVE: [number, number][] = [[15.5, 5], [16, 6], [16.5, 9], [17, 40], [17.5, 85], [18, 101], [18.5, 109], [19, 104], [19.5, 92], [20, 74], [20.5, 60], [21, 35], [22, 22], [23, 16], [24, 13], [26, 12], [28, 12], [29, 13], [30, 26], [30.5, 30], [31, 28], [31.5, 18], [32, 8], [32.5, 2]];
const IL_PLAN: [number, number][] = [[15.5, 5], [16, 6], [16.5, 9], [17, 38], [17.5, 60], [18, 70], [18.5, 72], [19, 72], [19.5, 72], [20, 70], [20.5, 66], [21, 62], [22, 56], [23, 52], [24, 46], [25, 38], [26, 30], [27, 22], [28, 16], [29, 14], [30, 27], [30.5, 31], [31, 29], [31.5, 19], [32, 8], [32.5, 2]];
function lerpAt(keys: [number, number][], h: number) {
  for (let k = 1; k < keys.length; k++) {
    if (h <= keys[k][0]) {
      const [h0, v0] = keys[k - 1];
      const [h1, v1] = keys[k];
      return v0 + ((h - h0) / (h1 - h0)) * (v1 - v0);
    }
  }
  return keys[keys.length - 1][1];
}
function illustration(): Snap {
  const run: Pt[] = [];
  for (let k = 0; k <= W_HOURS * 4; k++) {
    const h = W_START + k / 4;
    run.push({ off: k / 4, naive: lerpAt(IL_NAIVE, h), planned: lerpAt(IL_PLAN, h) });
  }
  return { live: false, runs: [run], level: 72, peakNaive: 109, peakPlan: 72, houses: null, carsFull: true };
}

// Polygons of the band where a(t) > b(t), with exact crossings, as one svg path.
function band(xs: number[], a: number[], b: number[], yOf: (v: number) => number, keep: (x: number) => boolean) {
  const polys: [number, number, number][][] = [];
  let cur: [number, number, number][] | null = null;
  for (let i = 0; i < xs.length; i++) {
    const d = a[i] - b[i];
    if (i > 0) {
      const dp = a[i - 1] - b[i - 1];
      if (dp > 0 !== d > 0) {
        const f = dp / (dp - d);
        const xc = xs[i - 1] + f * (xs[i] - xs[i - 1]);
        const vc = b[i - 1] + f * (b[i] - b[i - 1]);
        if (cur) {
          cur.push([xc, vc, vc]);
          polys.push(cur);
          cur = null;
        } else cur = [[xc, vc, vc]];
      }
    }
    if (d > 0) (cur ??= []).push([xs[i], a[i], b[i]]);
  }
  if (cur) polys.push(cur);
  return polys
    .filter((poly) => poly.length > 1 && keep((poly[0][0] + poly[poly.length - 1][0]) / 2))
    .map((poly) => {
      const top = poly.map(([x, t]) => `${x.toFixed(1)},${yOf(t).toFixed(1)}`);
      const bot = [...poly].reverse().map(([x, , u]) => `${x.toFixed(1)},${yOf(u).toFixed(1)}`);
      return `M${top.join("L")}L${bot.join("L")}Z`;
    })
    .join("");
}

export default function Slide4({ freeze }: SlideProps) {
  const reduced = useReducedMotion();
  const still = freeze === "end" || !!reduced;
  const { plan, failed } = useFlatten("region:at");
  const [snap, setSnap] = useState<Snap | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  // Snapshot the first live plan once; the curve animates from it and does not move on later polls.
  useEffect(() => {
    if (plan && (!snap || !snap.live)) {
      const s = fromPlan(plan);
      if (s) setSnap(s);
    }
  }, [plan, snap]);
  useEffect(() => {
    const t = window.setTimeout(() => setTimedOut(true), 2500);
    return () => window.clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!snap && (failed || timedOut)) setSnap(illustration());
  }, [snap, failed, timedOut]);

  return (
    <div className="p-slide" data-slide="4">
      <h1 className="p-head-xl s4-head">The monster eats peaks.</h1>
      <p className="p-sub p-secondary s4-sub">Every street, every evening.</p>
      {snap && <Chart key={snap.live ? "live" : "illustration"} snap={snap} still={still} />}
    </div>
  );
}

function Chart({ snap, still }: { snap: Snap; still: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const g = useMemo(() => {
    const all = snap.runs.flat();
    const hi = Math.max(100, ...all.map((p) => p.naive), ...all.map((p) => p.planned)) + 14;
    const lo = Math.min(0, ...all.map((p) => p.naive), ...all.map((p) => p.planned)) - 2;
    const x = (off: number) => X0 + (off / W_HOURS) * (X1 - X0);
    const y = (v: number) => Y0 + ((hi - v) / (hi - lo)) * (Y1 - Y0);
    const line = (key: "naive" | "planned") =>
      snap.runs.map((run) => "M" + run.map((p) => `${x(p.off).toFixed(1)},${y(p[key]).toFixed(1)}`).join("L")).join("");
    // The evening peak of the street without Gridzilla.
    const peak = all.reduce((m, p) => (p.naive > m.naive ? p : m), all[0]);
    const peakX = x(peak.off);
    const orange = snap.runs
      .map((run) => band(run.map((p) => x(p.off)), run.map((p) => p.naive), run.map(() => snap.level), y, () => true))
      .join("");
    // The night valley: where the plan draws more than the street would have (the cars charging later).
    const green = snap.runs
      .map((run) => band(run.map((p) => x(p.off)), run.map((p) => p.planned), run.map((p) => Math.max(p.naive, 0)), y, (cx) => cx > peakX))
      .join("");
    const valueAt = (off: number, key: "naive" | "planned") => {
      let best = all[0];
      for (const p of all) if (Math.abs(p.off - off) < Math.abs(best.off - off)) best = p;
      return best[key];
    };
    const maxIn = (a: number, b: number) => {
      const inside = all.filter((p) => p.off >= a && p.off <= b);
      return inside.length ? Math.max(...inside.map((p) => Math.max(p.naive, p.planned))) : 0;
    };
    // "With Gridzilla" sits above the plan where it runs highest over the street (the start of the night valley).
    let withOff = peak.off + 3;
    let gap = -Infinity;
    for (const p of all) {
      if (p.off > peak.off + 1.5 && p.off < W_HOURS - 7 && p.planned - p.naive > gap) {
        gap = p.planned - p.naive;
        withOff = p.off;
      }
    }
    const withSpan = 230 / ((X1 - X0) / W_HOURS);
    const withY = y(maxIn(withOff - 0.25, withOff + withSpan)) - 22;
    // "07:00, every car full": a dot on the plan at seven, the label right-aligned so it stays on the canvas.
    const sevenOff = offOf(7);
    const sevenX = x(sevenOff);
    const sevenY = y(valueAt(sevenOff, "planned"));
    const fullRight = Math.min(X1, sevenX + 70);
    const fullSpan = 310 / ((X1 - X0) / W_HOURS);
    const fullY = y(maxIn(offOf(7) - fullSpan + 1, offOf(7) + 1.2)) - 34;
    const peakLabelX = Math.max(X0, peakX - 60);
    return {
      x, y, hi, lo, naive: line("naive"), planned: line("planned"), orange, green, peak, peakX, peakLabelX,
      withX: x(withOff), withY, sevenX, sevenY, fullRight, fullY,
    };
  }, [snap]);

  const T = (delay: number, duration: number) => (still ? { duration: 0 } : { delay, duration, ease: EASE });
  const init = <V,>(v: V) => (still ? false : v);
  const peakFrac = (g.peakX - X0) / (X1 - X0);
  const tPeak = 0.6 + 2.6 * Math.min(1, peakFrac * 0.9) + 0.25;
  const limitY = g.y(100);
  const zeroY = g.y(0);
  const src = "flatten:region:at/plan";

  return (
    <>
      <svg className="s4-chart" viewBox="0 0 1180 620" width={1180} height={620} aria-label="Load on the grid in percent of its limit, 15:30 to 08:30">
        <defs>
          <clipPath id={`s4r${uid}`}>
            <motion.rect x={0} y={0} height={620} initial={init({ width: X0 })} animate={{ width: 1180 }} transition={T(0.6, 2.6)} />
          </clipPath>
          <clipPath id={`s4a${uid}`}>
            <rect x={0} y={0} width={1180} height={limitY} />
          </clipPath>
        </defs>

        {/* Axes: the zero line and the clock, quiet. */}
        <motion.g initial={init({ opacity: 0 })} animate={{ opacity: 1 }} transition={T(0.1, 0.6)}>
          <line x1={X0} x2={X1} y1={zeroY} y2={zeroY} stroke={P.fill} strokeWidth={2} />
          {TICKS.map((h) => {
            const tx = g.x(offOf(h));
            return (
              <text key={h} className="s4-tick" x={tx} y={TICK_Y} textAnchor="middle">
                {String(h).padStart(2, "0")}:00
              </text>
            );
          })}
        </motion.g>

        {/* The limit, red, with its name at the right end. */}
        <motion.g initial={init({ opacity: 0 })} animate={{ opacity: 1 }} transition={T(0.2, 0.6)}>
          <line x1={X0} x2={X1} y1={limitY} y2={limitY} stroke={P.red} strokeWidth={2} />
          <text className="s4-label" x={X1} y={limitY - 16} textAnchor="end">
            Limit
          </text>
        </motion.g>

        {/* The peak building (orange) above the plan level, then eaten into the level. */}
        <motion.g initial={init({ opacity: 0 })} animate={{ opacity: 1 }} transition={T(3.8, 0.5)}>
          <motion.path
            d={g.orange}
            fill={P.orange}
            fillOpacity={0.8}
            style={{ originY: 1 }}
            initial={init({ scaleY: 1 })}
            animate={{ scaleY: 0 }}
            transition={T(5.0, 1.2)}
          />
        </motion.g>

        {/* The energy moved into the night (green), growing from the bottom as the peak is eaten. */}
        <motion.path
          d={g.green}
          fill={P.green}
          fillOpacity={0.5}
          style={{ originY: 1 }}
          initial={init({ scaleY: 0 })}
          animate={{ scaleY: 1 }}
          transition={T(5.0, 1.2)}
        />

        {/* Without Gridzilla: tertiary dashed, its stretch over the limit red. Drawn left to right. */}
        <g clipPath={`url(#s4r${uid})`}>
          <path d={g.naive} fill="none" stroke={P.tertiary} strokeWidth={3} strokeDasharray="10 8" strokeLinejoin="round" />
          <g clipPath={`url(#s4a${uid})`}>
            <path d={g.naive} fill="none" stroke={P.red} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
          </g>
        </g>

        {/* With Gridzilla: the plan, ink. */}
        <motion.path
          d={g.planned}
          fill="none"
          stroke={P.ink}
          strokeWidth={4}
          strokeLinejoin="round"
          strokeLinecap="round"
          initial={init({ pathLength: 0 })}
          animate={{ pathLength: 1 }}
          transition={T(6.8, 1.8)}
        />

        {/* Direct labels. */}
        <motion.g initial={init({ opacity: 0 })} animate={{ opacity: 1 }} transition={T(tPeak, 0.6)}>
          <text className="s4-label" x={g.peakLabelX} y={g.y(g.peak.naive) - 66}>
            Without Gridzilla
          </text>
          <text className="s4-note" x={g.peakLabelX} y={g.y(g.peak.naive) - 26}>
            18:00, the cars come home
          </text>
        </motion.g>
        <motion.g initial={init({ opacity: 0 })} animate={{ opacity: 1 }} transition={T(8.0, 0.6)}>
          <text className="s4-label" x={g.withX} y={g.withY}>
            With Gridzilla
          </text>
        </motion.g>
        {snap.carsFull && (
          <motion.g initial={init({ opacity: 0 })} animate={{ opacity: 1 }} transition={T(8.8, 0.6)}>
            <circle cx={g.sevenX} cy={g.sevenY} r={11} fill={P.green} stroke="#ffffff" strokeWidth={4} />
            <text className="s4-note" x={g.fullRight} y={g.fullY} textAnchor="end">
              07:00, every car full
            </text>
          </motion.g>
        )}
      </svg>

      {!snap.live && <p className="p-title s4-illu">Illustration</p>}

      <div className="s4-nums">
        <motion.div initial={init({ opacity: 0, y: 24 })} animate={{ opacity: 1, y: 0 }} transition={T(tPeak, 0.7)}>
          <div
            className="p-display p-num"
            style={{ color: P.red }}
            data-src={snap.live ? `${src}/peak_naive_pct` : "illustration"}
            data-val={snap.peakNaive}
          >
            {snap.peakNaive}
            <span className="p-unit">%</span>
          </div>
          <p className="p-small p-secondary s4-num-label">without Gridzilla</p>
        </motion.div>
        <motion.div initial={init({ opacity: 0, y: 24 })} animate={{ opacity: 1, y: 0 }} transition={T(7.6, 0.7)}>
          <div
            className="p-display p-num p-ink"
            data-src={snap.live ? `${src}/peak_plan_pct` : "illustration"}
            data-val={snap.peakPlan}
          >
            {snap.peakPlan}
            <span className="p-unit">%</span>
          </div>
          <p className="p-small p-secondary s4-num-label">with Gridzilla, tonight's plan</p>
        </motion.div>
      </div>

      <motion.p className="p-small p-tertiary s4-foot" initial={init({ opacity: 0 })} animate={{ opacity: 1 }} transition={T(0.4, 0.6)}>
        {snap.live && snap.houses != null ? (
          <>
            Tonight's plan for Vienna:{" "}
            <span className="p-num" data-src={`${src}/houses`} data-val={snap.houses}>
              {snap.houses.toLocaleString("en-US")}
            </span>{" "}
            homes, renewed every two hours from the real weather. Live.
          </>
        ) : (
          <>Illustration: the live plan is not reachable right now. The shapes are drawn by hand.</>
        )}
      </motion.p>
    </>
  );
}
