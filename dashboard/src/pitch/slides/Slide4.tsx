// Slide 4: the monster eats peaks (1:35, 40 s, Peter). One big curve from the live diet plan for Vienna
// (/api/flatten?node=region:at), snapshotted once at mount: the next 24 hours from now, one continuous line (the plan
// starts at the sim's now, which can be any hour, so a fixed clock window would stitch two days together). Without
// Gridzilla the evening heads past the limit; the orange slice is the peak Gridzilla eats and stays on screen; green
// is the car charging the plan moves into the night; the plan draws over it in ink.
// Line draw-in adapted from 21st.dev "Line graph" by @motiondotdev (id 24687): pathLength draw-in, hover dropped.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { animate, motion, useReducedMotion } from "motion/react";
import { useFlatten } from "../../api";
import type { FlattenPlan } from "../../api";
import { P } from "../../stage/palette";
import type { SlideProps } from "../types";
import "./slide4.css";

const EASE = [0.25, 0.1, 0.3, 1] as const;

// The illustration's window (only when the plan is not reachable): clock 15:30 to 08:30, 17 hours.
const IL_START = 15.5;
const IL_HOURS = 17;

// Chart geometry inside the 1180x620 svg (canvas x 120..1300, y 300..920).
const X0 = 40;
const X1 = 1160;
const Y0 = 120;
const Y1 = 540;
const TICK_Y = 596;

interface Pt { off: number; naive: number; planned: number }
interface Snap {
  live: boolean;
  start: number; // clock hour at the left edge
  hours: number; // hours across the chart
  runs: Pt[][]; // continuous runs in time order
  level: number; // plan level, % of the limit
  peakNaive: number;
  peakPlan: number;
  houses: number | null;
  carsFull: boolean;
}

/** Hours from the left edge to the next time the clock shows hour h. */
const offOf = (start: number, h: number) => (((h - start) % 24) + 24) % 24;
const hhmm = (h: number) => {
  const m = Math.round((((h % 24) + 24) % 24) * 4) * 15;
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

function fromPlan(p: FlattenPlan): Snap | null {
  const r = p.rating_kw;
  const n = Math.min(p.hours.length, p.naive_kw.length, p.planned_kw.length);
  if (!r || n < 8) return null;
  const step = 24 / 96;
  const run: Pt[] = [];
  for (let i = 0; i < n; i++) run.push({ off: i * step, naive: (p.naive_kw[i] / r) * 100, planned: (p.planned_kw[i] / r) * 100 });
  return {
    live: true,
    start: p.hours[0],
    hours: (n - 1) * step,
    runs: [run],
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
  for (let k = 0; k <= IL_HOURS * 4; k++) {
    const h = IL_START + k / 4;
    run.push({ off: k / 4, naive: lerpAt(IL_NAIVE, h), planned: lerpAt(IL_PLAN, h) });
  }
  return { live: false, start: IL_START, hours: IL_HOURS, runs: [run], level: 72, peakNaive: 109, peakPlan: 72, houses: null, carsFull: true };
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

export default function Slide4({ freeze, step }: SlideProps) {
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
      {snap && <Chart key={snap.live ? "live" : "illustration"} snap={snap} still={still} withG={step >= 1} />}
    </div>
  );
}

/** Step 0: the street without Gridzilla heads past the limit (red). Step 1 (Right): the Gridzilla line bends under it,
 *  the eaten peak and the moved charging fill in, and the big number drops from red to green. */
function Chart({ snap, still, withG }: { snap: Snap; still: boolean; withG: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const g = useMemo(() => {
    const all = snap.runs.flat();
    const hi = Math.max(100, ...all.map((p) => p.naive), ...all.map((p) => p.planned)) + 14;
    const lo = Math.min(0, ...all.map((p) => p.naive), ...all.map((p) => p.planned)) - 2;
    const H = snap.hours;
    const x = (off: number) => X0 + (off / H) * (X1 - X0);
    const y = (v: number) => Y0 + ((hi - v) / (hi - lo)) * (Y1 - Y0);
    const line = (key: "naive" | "planned") =>
      snap.runs.map((run) => "M" + run.map((p) => `${x(p.off).toFixed(1)},${y(p[key]).toFixed(1)}`).join("L")).join("");
    // The evening peak of the street without Gridzilla.
    const peak = all.reduce((m, p) => (p.naive > m.naive ? p : m), all[0]);
    const peakX = x(peak.off);
    // The peak Gridzilla eats: where the street without it draws more than the plan.
    const orange = snap.runs
      .map((run) => band(run.map((p) => x(p.off)), run.map((p) => p.naive), run.map((p) => p.planned + 0.5), y, () => true))
      .join("");
    // The car charging moved into the night: where the plan draws more than the street would have.
    const green = snap.runs
      .map((run) => band(run.map((p) => x(p.off)), run.map((p) => p.planned), run.map((p) => Math.max(p.naive, 0) + 0.5), y, () => true))
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
    const pxPerH = (X1 - X0) / H;
    // "Without Gridzilla" over the hill; "With Gridzilla" just under the ink line at the same moment.
    const peakLabelX = Math.min(Math.max(X0, peakX - 60), X1 - 420);
    const withX = Math.min(Math.max(X0, peakX - 60), X1 - 260);
    const withY = y(Math.min(...all.filter((p) => x(p.off) >= withX - 10 && x(p.off) <= withX + 190).map((p) => p.planned))) + 58;
    // "07:00, every car full": a dot on the plan at seven when seven is on the chart, its label kept on the canvas.
    const sevenOff = offOf(snap.start, 7);
    const showSeven = snap.carsFull && sevenOff > 0.6 && sevenOff < H - 0.6;
    const sevenX = x(sevenOff);
    const sevenY = y(valueAt(sevenOff, "planned"));
    const fullRight = Math.min(X1, Math.max(X0 + 330, sevenX + 70));
    const fullSpan = 310 / pxPerH;
    const fullY = y(maxIn(sevenOff - fullSpan + 1, sevenOff + 1.2)) - 34;
    // Clock ticks every three hours, never on the very edges.
    const ticks: { off: number; h: number }[] = [];
    for (let h = Math.ceil(snap.start / 3) * 3; h < snap.start + H + 0.01; h += 3) {
      const off = h - snap.start;
      if (off > 0.7 && off < H - 0.7) ticks.push({ off, h: h % 24 });
    }
    const peakClock = (snap.start + peak.off) % 24;
    const peakNote = peakClock >= 16 && peakClock < 21.5 ? `${hhmm(peakClock)}, the cars come home` : `${hhmm(peakClock)}, the peak`;
    return {
      x, y, hi, lo, naive: line("naive"), planned: line("planned"), orange, green, peak, peakX, peakLabelX, peakNote,
      withX, withY, showSeven, sevenX, sevenY, fullRight, fullY, ticks,
    };
  }, [snap]);

  const T = (delay: number, duration: number) => (still ? { duration: 0 } : { delay, duration, ease: EASE });
  // Step 1's moves, timed from the key press.
  const on = (v: number) => (withG ? v : 0);
  const init = <V,>(v: V) => (still ? false : v);
  const peakFrac = (g.peakX - X0) / (X1 - X0);
  const tPeak = 0.6 + 2.6 * Math.min(1, peakFrac * 0.9) + 0.25;
  const limitY = g.y(100);
  const zeroY = g.y(0);
  const src = "flatten:region:at/plan";

  return (
    <>
      <svg className="s4-chart" viewBox="0 0 1180 620" width={1180} height={620} aria-label={`Load on the grid in percent of its limit, the next ${Math.round(snap.hours)} hours from ${hhmm(snap.start)}`}>
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
          <g data-src="axis">
            {g.ticks.map((t) => (
              <text key={t.off} className="s4-tick" x={g.x(t.off)} y={TICK_Y} textAnchor="middle">
                {String(t.h).padStart(2, "0")}:00
              </text>
            ))}
          </g>
        </motion.g>

        {/* The limit, red, with its name at the right end. */}
        <motion.g initial={init({ opacity: 0 })} animate={{ opacity: 1 }} transition={T(0.2, 0.6)}>
          <line x1={X0} x2={X1} y1={limitY} y2={limitY} stroke={P.red} strokeWidth={2} />
          {/* "Limit" at whichever end of the line the peak's label leaves free. */}
          <text className="s4-label" x={g.peakX > (X0 + X1) / 2 ? X0 : X1} y={limitY - 16} textAnchor={g.peakX > (X0 + X1) / 2 ? "start" : "end"}>
            Limit
          </text>
        </motion.g>

        {/* The peak Gridzilla eats (orange, stays), then the car charging moved into the night (green). */}
        <motion.path
          d={g.orange}
          fill={P.orange}
          fillOpacity={0.35}
          initial={{ opacity: 0 }}
          animate={{ opacity: on(1) }}
          transition={T(0.1, 0.6)}
        />
        <motion.path
          d={g.green}
          fill={P.green}
          fillOpacity={0.35}
          initial={{ opacity: 0 }}
          animate={{ opacity: on(1) }}
          transition={T(1.6, 0.8)}
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
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: on(1), opacity: on(1) }}
          transition={T(0.2, 1.8)}
        />

        {/* Direct labels. */}
        <motion.g initial={init({ opacity: 0 })} animate={{ opacity: 1 }} transition={T(tPeak, 0.6)}>
          <text className="s4-label" x={g.peakLabelX} y={g.y(g.peak.naive) - 66}>
            Without Gridzilla
          </text>
          <text className="s4-note" data-src="axis" x={g.peakLabelX} y={g.y(g.peak.naive) - 26}>
            {g.peakNote}
          </text>
        </motion.g>
        <motion.g initial={{ opacity: 0 }} animate={{ opacity: on(1) }} transition={T(1.8, 0.6)}>
          <text className="s4-label" x={g.withX} y={g.withY}>
            With Gridzilla
          </text>
        </motion.g>
        {g.showSeven && (
          <motion.g initial={{ opacity: 0 }} animate={{ opacity: on(1) }} transition={T(2.4, 0.6)}>
            <circle cx={g.sevenX} cy={g.sevenY} r={11} fill={P.green} stroke="var(--p-bg)" strokeWidth={4} />
            <text className="s4-note" data-src="axis" x={g.fullRight} y={g.fullY} textAnchor="end">
              07:00, every car full
            </text>
          </motion.g>
        )}
      </svg>

      {!snap.live && <p className="p-title s4-illu">Illustration</p>}

      <div className="s4-nums">
        <motion.div initial={init({ opacity: 0, y: 24 })} animate={{ opacity: 1, y: 0 }} transition={T(tPeak, 0.7)}>
          <Morph from={snap.peakNaive} to={snap.peakPlan} live={snap.live} still={still} go={withG} src={src} />
        </motion.div>
      </div>

      <motion.p className="p-small p-tertiary s4-foot" initial={init({ opacity: 0 })} animate={{ opacity: 1 }} transition={T(0.4, 0.6)}>
        {snap.live && snap.houses != null ? (
          <>
            <span data-src="deck" data-label="the plan's horizon">The next 24 hours for Vienna:</span>{" "}
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

/** The moment of the slide: the peak without Gridzilla, red, counts down to the plan's peak and turns green when the
 *  presenter brings in the Gridzilla line (`go`, step 1). The way down stays as a small line. */
function Morph({ from, to, live, still, go, src }: { from: number; to: number; live: boolean; still: boolean; go: boolean; src: string }) {
  const num = useRef<HTMLSpanElement>(null);
  const [withG, setWithG] = useState(go && still);
  useEffect(() => {
    const show = (v: number) => {
      if (num.current) num.current.textContent = String(Math.round(v));
    };
    if (!go) {
      show(from);
      setWithG(false);
      return;
    }
    if (still) {
      show(to);
      setWithG(true);
      return;
    }
    show(from);
    const t = window.setTimeout(() => setWithG(true), 200);
    const a = animate(from, to, { delay: 0.2, duration: 1.6, ease: EASE, onUpdate: show });
    return () => {
      window.clearTimeout(t);
      a.stop();
    };
  }, [from, to, still, go]);
  return (
    <>
      <div
        className={`p-display p-num s4-morph${withG ? " is-with" : ""}`}
        data-src={live ? `${src}/${withG ? "peak_plan_pct" : "peak_naive_pct"}` : "illustration"}
        data-val={withG ? to : from}
        aria-label={`${withG ? to : from} %`}
      >
        <span ref={num}>{withG ? to : from}</span>
        <span className="p-unit">%</span>
      </div>
      <p className="p-small p-secondary s4-num-label">{withG ? "with Gridzilla, tonight's plan" : "without Gridzilla"}</p>
      <p className={`p-small p-secondary s4-num-from${withG ? " is-on" : ""}`}>
        down from{" "}
        <span className="p-num" data-src={live ? `${src}/peak_naive_pct` : "illustration"} data-val={from}>
          {from}
        </span>{" "}
        % without it
      </p>
    </>
  );
}
