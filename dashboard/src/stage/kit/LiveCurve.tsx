// THE money shot: one street transformer over the last hours and the time ahead. "Without Gridzilla" (the simulator's
// counterfactual, baseline_kw) is a grey dashed line; "With Gridzilla" (total_kw) is the bold line that bends down under
// the limit; the gap between them is filled green. The limit is a red line, the line turns red only where it really is
// over the limit.
//
// Stage mode (design/STAGE.md 7.1) adds dad's diet plan as the hero idea: from Now on the plan's "without" hill
// (naive_kw, grey dashed) and its target shape (planned_kw, "the plan", a green line that sits flat on the ceiling L),
// plus the active signal's time-limited window as a band in the plot and a bar under the hours. The colours follow the
// pitch sentence "blue is with Gridzilla, grey is without, orange is the peak eaten": the measured line is Apple blue,
// the eaten peak (where "without" sits further from zero than "with", same direction) is a flat low-opacity orange, red
// is only ever the limit line. The legend sits above the plot as wrapping HTML, names only (values live on the lines).
//
// Labels never collide: the chart measures its own box, every label gets a real text box, and they are placed in
// priority order (axis ticks, then Limit, Now, the signal window, Plan, Without, Gridzilla acted); a label with no free
// spot is dropped, never nudged off its anchor. In stage mode the lines themselves block labels too.
//
// Motion with purpose only: the time axis pans linearly with grid time, the newest segment of the line grows to each new
// reading (no full redraw), the scale glides when the peak grows, the plan redraws when a new plan round lands.
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import type { FlattenPlan, History, Signal, State } from "../../api";
import { hhmm, loadPct, nice } from "../../model";
import { signalMarks, unwrapForecast, unwrapHistory, niceStep, type HistPt } from "../../components/curve/series";
import { P } from "../palette";
import Counter, { fmtNum } from "./Counter";
import { smoothBand, smoothPath } from "./smooth";
import { useTweens } from "./tween";
import { placeLabels, textW, useBox, type LabelReq, type Rect } from "./layout";
import { apex, plateauStart, signalWindow, slicePlan, unwrapPlan } from "./plan";

type Variant = "hero" | "card";

/** Continuous grid clock: s.sim_hour wraps at 24, this keeps counting. `snap` = jump without gliding (first frame, a
 *  scenario restart, a clock jump of more than an hour). */
function useClock(raw: number) {
  const ref = useRef<{ raw: number; t: number; snap: boolean; n: number } | null>(null);
  const prev = ref.current;
  if (!prev) ref.current = { raw, t: raw, snap: true, n: 0 };
  else if (prev.raw !== raw) {
    let d = (((raw - prev.raw) % 24) + 24) % 24;
    if (d > 12) d -= 24;
    ref.current = { raw, t: prev.t + d, snap: Math.abs(d) > 1, n: prev.n + 1 };
  }
  return ref.current!;
}

/** Value of `key` at time t, straight-line between the two readings around it. */
function at(pts: HistPt[], t: number, key: "total" | "base"): number | null {
  if (!pts.length) return null;
  if (t >= pts[pts.length - 1].t) return pts[pts.length - 1][key];
  for (let i = pts.length - 1; i > 0; i--) {
    const a = pts[i - 1];
    const b = pts[i];
    if (a.t <= t && t <= b.t) {
      const va = a[key];
      const vb = b[key];
      if (va == null || vb == null) return vb ?? va;
      const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
      return va + (vb - va) * k;
    }
  }
  return pts[0][key];
}

/** How much load Gridzilla keeps off this transformer: right now (`kw`, null without a baseline or while it is not
 *  acting) and the biggest gap of the last `pastH` hours with its grid hour. Both count either direction. */
export function keptOff(s: State, history: History | null, node: string, pastH = 6) {
  const hist = unwrapHistory(history, node, s.sim_hour, s.sim_hour).filter((p) => p.t >= s.sim_hour - pastH);
  const rating = s.tree[node]?.rating_kw ?? 0;
  const min = Math.max(1, rating * 0.02);
  const gap = (p: HistPt) => (p.base == null || Math.sign(p.base) !== Math.sign(p.total) && Math.abs(p.total) > 1 ? 0 : Math.abs(p.base) - Math.abs(p.total));
  const last = hist[hist.length - 1];
  const now = last && last.base != null ? gap(last) : null;
  let peak = 0;
  let peakH: number | null = null;
  for (const p of hist) {
    const g = gap(p);
    if (g > peak) {
      peak = g;
      peakH = p.t;
    }
  }
  return {
    kw: now != null && now >= min ? now : null,
    peak: peak >= min ? peak : 0,
    peakH: peak >= min ? peakH : null,
    hasBaseline: hist.some((p) => p.base != null),
  };
}

/** Forward distance on a 24 h clock, in [0, 24). */
const fwd24 = (from: number, to: number) => (((to - from) % 24) + 24) % 24;

/** Stage history on the continuous clock: the platform keeps one reading per grid hour or so (steps of 0.97 to 1.3 h)
 *  and its day loop skips 00:00 to 02:00, so a gap up to 3 grid hours still belongs to the same run (the classic unwrap
 *  cut the past at every step over 1 h, which left the chart with a stub that changed length poll by poll). A reading
 *  repeated at the same grid minute (the clock waiting at the end of a day) keeps the newer one. Walks back `backH`. */
function unwrapStage(history: History | null, node: string, tNow: number, nowH: number, backH: number): HistPt[] {
  const raw = (node && history?.nodes?.[node]) || [];
  if (!raw.length) return [];
  const out: HistPt[] = [];
  let lastGap = fwd24(raw[raw.length - 1].h, nowH);
  if (lastGap > 12) lastGap = 0;
  let t = tNow - lastGap;
  for (let i = raw.length - 1; i >= 0; i--) {
    const p = raw[i];
    if (i < raw.length - 1) {
      const dt = fwd24(p.h, raw[i + 1].h);
      if (dt > 3) break;
      if (dt < 0.02) continue;
      t -= dt;
    }
    out.push({ t, total: p.total_kw, program: p.program_kw, other: p.other_kw, base: p.baseline_kw ?? null });
    if (tNow - t > backH) break;
  }
  return out.reverse();
}

/** 0 and one round value for the stage's y axis: the biggest 1-2-5 step inside the domain that is not the limit
 *  (the limit has its own label), so the plot always carries a magnitude. */
function stageTicks(lo: number, hi: number, limits: number[]): number[] {
  const side = hi >= -lo ? hi : lo;
  const m = Math.abs(side) * 0.92;
  if (!(m > 0)) return [0];
  const cands: number[] = [];
  for (let e = Math.floor(Math.log10(m)); e >= Math.floor(Math.log10(m)) - 1; e--) for (const f of [5, 2, 1]) cands.push(f * 10 ** e);
  const ok = cands.filter((v) => v <= m && limits.every((l) => Math.abs(Math.abs(l) - v) > Math.max(1, Math.abs(l) * 0.12)));
  const r = ok.length ? ok[0] : null;
  return r == null ? [0] : side >= 0 ? [0, r] : [-r, 0];
}

type Placed = Map<string, Rect>;
type XYPt = [number, number];

/** A short legend swatch: solid, dashed, a filled square or the signal bar. */
function Swatch({ color, dashed, width, kind = "line", opacity }: { color: string; dashed?: boolean; width?: number; kind?: "line" | "fill" | "bar"; opacity?: number }) {
  if (kind === "fill")
    return <span className="inline-block shrink-0 rounded-[0.2em]" style={{ width: "0.9em", height: "0.9em", background: color, opacity: opacity ?? 0.45 }} aria-hidden />;
  if (kind === "bar")
    return (
      <svg width="1.6em" height="0.6em" viewBox="0 0 24 8" className="shrink-0" aria-hidden>
        <rect x="1" y="1" width="11" height="6" rx="3" fill={P.ink} />
        <rect x="13" y="1" width="10" height="6" rx="3" fill={P.fill} />
      </svg>
    );
  return (
    <svg width="1.6em" height="0.6em" viewBox="0 0 24 8" className="shrink-0" aria-hidden>
      <line x1="2" x2="22" y1="4" y2="4" stroke={color} strokeWidth={width ?? 3} strokeLinecap="round" strokeDasharray={dashed ? "4 4" : undefined} />
    </svg>
  );
}

/** One legend entry: key, label in secondary, live value in ink. */
function Key({ swatch, label, children }: { swatch: ReactNode; label: string; children?: ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-[0.4em] whitespace-nowrap">
      {swatch}
      <span style={{ color: P.secondary }}>{label}</span>
      {children != null && (
        <span className="font-semibold" style={{ color: P.ink }}>
          {children}
        </span>
      )}
    </span>
  );
}

/** Rects along a polyline (only between x0 and x1, the visible plot), so labels keep clear of the line itself. */
function trace(out: Rect[], pts: XYPt[], r: number, x0: number, x1: number) {
  const step = Math.max(3, r * 1.5);
  const put = (x: number, y: number) => x >= x0 && x <= x1 && out.push({ x: x - r, y: y - r, w: 2 * r, h: 2 * r });
  for (let i = 0; i < pts.length; i++) {
    const [xa, ya] = pts[i];
    put(xa, ya);
    if (i + 1 < pts.length) {
      const [xb, yb] = pts[i + 1];
      const n = Math.floor(Math.hypot(xb - xa, yb - ya) / step);
      for (let j = 1; j < n; j++) put(xa + ((xb - xa) * j) / n, ya + ((yb - ya) * j) / n);
    }
  }
}

export default function LiveCurve({
  s,
  history,
  node,
  height,
  variant = "hero",
  header = true,
  ground,
  stage = false,
  plan,
  signal,
  span,
  legend,
  minPlot,
  planSrc = "flatten",
}: {
  s: State;
  history: History | null;
  /** The transformer on screen, e.g. "tf:mauer-2". */
  node: string;
  /** CSS height; hero fills its parent (100%), card defaults to 22rem, stage grows with its flex parent. */
  height?: number | string;
  variant?: Variant;
  /** Big "kept off the street" number and the transformer name above the chart (default on). */
  header?: boolean;
  /** Colour behind the chart, used as the thin halo that keeps line labels readable (default white). */
  ground?: string;
  /** The one-stage look (STAGE.md 7.1): ink line, direct labels, legend above, the plan instead of the forecast. */
  stage?: boolean;
  /** The diet plan for `node` (useFlatten(node).plan). From Now on it replaces the forecast: grey hill + green target. */
  plan?: FlattenPlan | null;
  /** The signal covering `node` right now (signalOn): its valid_from..valid_to window on the time axis. */
  signal?: Signal | null;
  /** Hours before and after Now. `narrow` is used while the plot is under 480 px wide (phones). */
  span?: { past: number; future: number; narrow?: { past: number; future: number } };
  /** Legend row position (default: below, stage: above). */
  legend?: "above" | "below" | "none";
  /** CSS min-height of the plot (default 9rem). */
  minPlot?: string;
  /** window.__gz key the plan payload is kept under, for data-src (default "flatten"). */
  planSrc?: string;
}) {
  const hero = variant === "hero";
  const clock = useClock(s.sim_hour);
  const [plot, { w: W, h: H, rem }] = useBox<HTMLDivElement>();
  const sp0 = span ?? { past: hero ? 6 : 4, future: hero ? 2 : 1.5 };
  const sp = W > 0 && W < 480 && sp0.narrow ? sp0.narrow : sp0;
  const PAST = sp.past;
  const FUTURE = sp.future;
  const tn = node ? s.tree[node] : undefined;
  const agg = node ? s.aggregates[node] : undefined;
  const rating = tn?.rating_kw ?? agg?.rating_kw ?? null;
  const reverse = rating != null ? tn?.reverse_kw ?? rating : null;
  const lineC = P.blue;
  const washO = stage ? 0.22 : 0.38;
  /** Stage: the eaten peak is orange (the pitch's word for it); classic: the kept-off gap stays green. */
  const washC = stage ? P.orange : P.green;
  const legendAt = legend ?? (stage ? "above" : "below");

  const hist = useMemo(
    () => (stage ? unwrapStage(history, node, clock.t, s.sim_hour, PAST + 1.5) : unwrapHistory(history, node, clock.t, s.sim_hour)),
    [stage, history, node, clock.t, s.sim_hour, PAST],
  );
  const usePlan = stage && !!plan;
  const fc = useMemo(() => (usePlan ? [] : unwrapForecast(s, node, clock.t)), [usePlan, s, node, clock.t]);
  const planPts = useMemo(() => (usePlan && plan ? unwrapPlan(plan, s.sim_hour, clock.t) : []), [usePlan, plan, s.sim_hour, clock.t]);
  const marks = useMemo(() => signalMarks(s, node, clock.t), [s, node, clock.t]);
  const win = useMemo(() => (stage ? signalWindow(s, signal, clock.t) : null), [stage, s, signal, clock.t]);
  const last = hist[hist.length - 1];
  const hasBase = hist.some((p) => p.base != null);

  // Scale: everything visible plus the limit, and the reverse limit once power flows back.
  const vis = hist.filter((p) => p.t >= clock.t - PAST - 0.5);
  const futVis = slicePlan(planPts, clock.t, clock.t + FUTURE + 0.3);
  const vals = [
    ...vis.map((p) => p.total),
    ...vis.flatMap((p) => (p.base == null ? [] : [p.base])),
    ...fc.filter((p) => p.t <= clock.t + FUTURE + 0.3).map((p) => p.total),
    ...futVis.flatMap((p) => [p.naive, p.planned]),
  ];
  const vMax = vals.length ? Math.max(...vals) : 0;
  const vMin = vals.length ? Math.min(...vals) : 0;
  const lim = rating ?? Math.max(10, vMax);
  const span_ = Math.max(vMax, 0) - Math.min(vMin, 0) || 1;
  // Which limits to draw: classic = only the one in the flow direction; stage = import, plus the reverse limit when the
  // street pushes back more than half of it (noon export).
  const backflow = reverse != null && -vMin > Math.max(0, vMax);
  const showImp = stage ? !(backflow && vMax <= 0) : !backflow;
  const showRev = stage ? reverse != null && vMin < -0.5 * reverse : backflow;
  const hiT = stage
    ? (showImp ? Math.max(lim, vMax) : Math.max(vMax, 0) + span_ * 0.08) * (showImp ? 1.08 : 1)
    : backflow
      ? Math.max(vMax, 0) + span_ * 0.08
      : Math.max(lim * 1.08, vMax + span_ * 0.08);
  const loT = showRev
    ? Math.min(-(reverse as number) * 1.08, vMin - span_ * 0.08)
    : Math.min(0, vMin - span_ * (stage ? 0.06 : 0.05));

  // Head of the line: glides to the newest reading; a jump (restart, other transformer) lands at once.
  const headTo = last?.t ?? clock.t;
  const prevHead = useRef<{ node: string; t: number } | null>(null);
  const headSnap = !prevHead.current || prevHead.current.node !== node || Math.abs(headTo - prevHead.current.t) > 1.5;
  useEffect(() => {
    prevHead.current = { node, t: headTo };
  }, [node, headTo]);

  const [view, head, lo, hi] = useTweens([
    { to: clock.t, ms: 3000, linear: true, snap: clock.snap },
    { to: headTo, ms: 4000, linear: true, snap: headSnap || clock.snap },
    { to: loT, ms: 800 },
    { to: hiT, ms: 800 },
  ]);

  const big = keptOff(s, history, node, PAST);
  const kw = agg?.total_kw ?? last?.total ?? null;
  const pct = loadPct(s, node, kw);
  const over = pct != null && Math.abs(pct) >= 100;
  const kwFmt = (v: number) => fmtNum(Math.round(v) || 0);

  // ---- sizes, all from the chart's own box (not the window)
  const k = rem / 16;
  const compact = W < 360 || H < 200;
  const fs = stage ? Math.max(13, rem * (compact ? 0.875 : 1)) : Math.max(12, Math.min(hero ? 30 : 15 * k, W / 44, H / 10));
  const fsAxis = stage ? Math.max(12, rem * 0.875) : Math.max(11, fs * 0.86);
  const lh = Math.ceil(fs * 1.3);
  const lhA = Math.ceil(fsAxis * 1.3);
  const swTotal = stage ? Math.max(2.5, rem * 0.19) : hero ? Math.max(3, Math.min(6, W / 280)) : 3.25 * k;
  const swBase = stage ? swTotal * 0.8 : hero ? swTotal * 0.85 : 2.5 * k;
  const swLim = stage ? Math.max(1.5, rem * 0.1) : hero ? Math.max(2, swTotal * 0.6) : 2 * k;
  const halo = ground ?? P.card;
  const g = rem * 0.4;

  // ---- geometry (px): top row for Now and the signal, then the plot, the hours, and in stage mode the window bar
  const showX = H >= 120;
  const winBar = Math.max(6, Math.round(rem * 0.375));
  const winRow = win ? Math.max(lhA, winBar) + Math.round(fsAxis * 0.4) : 0;
  const padT = lh + Math.round(fs * 0.5);
  const tickRow = showX ? lhA + Math.round(fsAxis * 0.45) : 4;
  const padB = tickRow + winRow;
  const padL = Math.round(rem * 0.25);
  const ph = Math.max(1, H - padT - padB);
  const plotB = padT + ph;
  const yCount = stage ? 2 : Math.max(2, Math.min(hero ? 5 : 4, Math.floor(ph / (lhA * 2.2))));
  const yStep = niceStep(hiT - loT || 1, yCount);
  const ticksOf = (a: number, b: number) => {
    const out: number[] = [];
    for (let v = Math.ceil(a / yStep) * yStep; v <= b + 1e-9; v += yStep) out.push(Math.round(v * 1000) / 1000);
    return out;
  };
  const tickTxt = (v: number, top: boolean) => `${kwFmt(v)}${top ? " kW" : ""}`;
  const limVals = [...(showImp && rating != null ? [rating] : []), ...(showRev && reverse != null ? [-reverse] : [])];
  const ticksFor = (a: number, b: number) => (stage ? stageTicks(a, b, limVals) : ticksOf(a, b));
  /** Stage: the unit rides on the round value, never on 0. */
  const unitOn = (v: number, i: number, n: number) => (stage ? v !== 0 : i === n - 1);
  const tgt = ticksFor(loT, hiT);
  const padR = Math.ceil(Math.max(rem * 2, ...tgt.map((v, i) => textW(tickTxt(v, unitOn(v, i, tgt.length)), fsAxis)))) + Math.round(rem * 0.7);

  // The window starts where the history starts (at most PAST hours back), so the curve fills the width.
  const firstT = hist.length ? hist[0].t : view - PAST;
  // Stage: the domain is fixed at now - PAST whatever data is there (STAGE.md 7.1), so the picture never rescales.
  const past = stage ? PAST : Math.min(PAST, Math.max(2, view - firstT + 0.25));
  const tL = view - past;
  const tR = view + FUTURE;
  const pw = Math.max(1, W - padL - padR);
  const x = (t: number) => padL + ((t - tL) / (tR - tL)) * pw;
  const y = (v: number) => padT + ((hi - v) / (hi - lo || 1)) * ph;
  const ready = W > 0 && H > 0;

  const shown = hist.filter((p) => p.t >= tL - 0.8 && p.t <= head);
  // A series with fewer than two readings is not drawn at all (no lone dot, no legend entry).
  const realN = shown.length;
  const headTot = at(hist, head, "total");
  const headBase = at(hist, head, "base");
  if (shown.length && headTot != null && head > shown[shown.length - 1].t)
    shown.push({ ...shown[shown.length - 1], t: head, total: headTot, base: headBase });

  const totalPts = !stage || realN > 1 ? shown.map((p) => [x(p.t), y(p.total)] as XYPt) : [];
  const baseRun = !stage || realN > 1 ? shown.filter((p) => p.base != null) : [];
  const basePts = baseRun.map((p) => [x(p.t), y(p.base as number)] as XYPt);
  const shaving = (p: HistPt) => p.base != null && Math.abs(p.total) < Math.abs(p.base) && (Math.sign(p.base) === Math.sign(p.total) || Math.abs(p.total) <= 1);
  const band = smoothBand(
    baseRun.map((p) => [x(p.t), y(shaving(p) ? (p.base as number) : p.total)]),
    baseRun.map((p) => [x(p.t), y(p.total)]),
  );
  const fcPts = fc.filter((p) => p.t >= view - 0.05 && p.t <= tR + 0.3).map((p) => [x(p.t), y(p.total)] as XYPt);
  if (fcPts.length && headTot != null && last && view - head < 0.6) fcPts.unshift([x(head), y(headTot)]);

  // The plan from Now on: grey hill, green target, the moved energy between them.
  const fut = slicePlan(planPts, view, tR + 0.3);
  // The plan continues from the live line: its first grid hour eases from the measured values at the head (with and
  // without) onto the plan's own slots, so neither line jumps at Now. Labels and numbers keep the plan's own values.
  const BLEND = 1;
  const anchorT = headTot != null && realN > 1 ? head : null;
  const anchorP = anchorT != null && fut.length ? (headTot as number) - fut[0].planned : 0;
  const anchorN = anchorT != null && fut.length ? (headBase ?? (headTot as number)) - fut[0].naive : 0;
  // The plan's first slot can sit a hair after Now (its start rounded up): the ease counts from that first slot, and the
  // head itself joins the two so the line never shows a step.
  const t0f = fut.length ? fut[0].t : view;
  const ease = (t: number) => (anchorT == null ? 0 : Math.max(0, 1 - (t - t0f) / BLEND));
  const drawn = fut.map((p) => ({ t: p.t, naive: p.naive + anchorN * ease(p.t), planned: p.planned + anchorP * ease(p.t) }));
  if (anchorT != null && drawn.length && anchorT < t0f - 0.01) drawn.unshift({ t: anchorT, naive: headBase ?? (headTot as number), planned: headTot as number });
  const naivePts = drawn.map((p) => [x(p.t), y(p.naive)] as XYPt);
  const planLine = drawn.map((p) => [x(p.t), y(p.planned)] as XYPt);
  // Only the peak eaten is shaded: where the plan holds the street below the "without" hill (or the solar backflow
  // under the "without" dip). Where the plan sits above it (car charging moved into the night) the band closes to 0.
  const eatsPlan = (p: { naive: number; planned: number }) =>
    Math.abs(p.planned) < Math.abs(p.naive) && (Math.sign(p.naive) === Math.sign(p.planned) || Math.abs(p.planned) <= 1);
  const planBand = fut.length > 1 ? smoothBand(drawn.map((p) => [x(p.t), y(eatsPlan(p) ? p.naive : p.planned)] as XYPt), planLine) : "";
  const level = plan?.level_kw ?? null;
  const plateau = usePlan && level != null ? plateauStart(fut, level) : null;
  const top = usePlan ? apex(fut) : null;
  const topIsPeak = !!(top && plan && Math.abs(top.naive - plan.peak_naive_kw) < Math.max(1, plan.peak_naive_kw * 0.01) && top.naive > top.planned + 1);

  // Signals that went out, clustered (one per half hour); the newest one is named on the top row.
  const seen: number[] = [];
  const pins = marks.filter((m) => {
    if (m.t < tL || m.t > view + 0.05) return false;
    if (seen.some((t) => Math.abs(t - m.t) < 0.5)) return false;
    seen.push(m.t);
    return true;
  });
  const latest = pins[pins.length - 1];

  const yTicks = ticksFor(lo, hi);
  // Hours thin out by the pixels they get (stage: every 3 or 6 hours, on the hour).
  const wHour = textW("00:00", fsAxis);
  const hourPx = pw / (past + FUTURE);
  const steps = stage ? [3, 6, 12] : [1, 2, 3, 4, 6];
  const tStep = steps.find((st) => hourPx * st >= wHour * 1.7) ?? steps[steps.length - 1];
  const tTicks: number[] = [];
  if (showX) for (let t = Math.ceil(tL / tStep) * tStep; t <= tR; t += tStep) tTicks.push(t);

  const nowX = x(view);
  const endX = shown.length ? x(shown[shown.length - 1].t) : nowX;
  const clipId = `over-${node.replace(/[^a-z0-9]/gi, "")}-${variant}${stage ? "-s" : ""}`;
  const hasLine = headTot != null && shown.length > 1 && (!stage || realN > 1);
  const yB = hasLine && headBase != null && basePts.length > 1 ? y(headBase) : null;
  const limV = rating == null ? null : showImp ? rating : -(reverse as number);
  const winX = win ? { a: Math.max(padL, x(win.t0)), b: Math.min(padL + pw, x(win.t1)) } : null;
  const winOn = !!(winX && winX.b > winX.a + 1);

  // ---- label layout: priority order, first free spot wins, the rest drop out
  const bounds: Rect = { x: 0, y: 0, w: W, h: H };
  const inPlot: Rect = { x: padL, y: 0, w: pw, h: plotB };
  const topY = Math.round(fs * 0.1);
  const reqs: LabelReq[] = [];
  const blocked: Rect[] = [];
  const yPlaced: Placed = new Map();
  const dot = (cx: number, cy: number, r: number) => blocked.push({ x: cx - r, y: cy - r, w: 2 * r, h: 2 * r });
  const wPair = (a: string, b: string, size: number) => textW(a, size, 400) + textW(b, size, 600);
  const limTxt = rating != null ? `${kwFmt(rating)} kW` : "";
  const revTxt = reverse != null ? `${kwFmt(reverse)} kW` : "";
  const planTxt = level != null ? `${kwFmt(level)} kW` : "";
  const topTxt = plan ? `${fmtNum(plan.peak_naive_pct)} %` : "";
  if (ready) {
    if (hasLine) dot(x(head), y(headTot as number), swTotal * 1.8);
    for (const m of pins) {
      const v = at(hist, m.t, "total");
      if (v != null) dot(x(m.t), y(v), swTotal * 1.6);
    }
    if (stage) {
      // The lines block labels, so a label never sits on a line.
      const r = swTotal / 2 + 3;
      trace(blocked, totalPts, r, padL, padL + pw);
      trace(blocked, basePts, r, padL, padL + pw);
      trace(blocked, naivePts, r, padL, padL + pw);
      trace(blocked, planLine, r, padL, padL + pw);
      if (showImp && rating != null) blocked.push({ x: padL, y: y(rating) - swLim / 2, w: pw, h: swLim });
      if (showRev && reverse != null) blocked.push({ x: padL, y: y(-reverse) - swLim / 2, w: pw, h: swLim });
      blocked.push({ x: nowX - 1, y: padT - fs * 0.4, w: 2, h: plotB - padT + fs * 0.4 });
      if (winOn && winX) blocked.push({ x: winX.a, y: plotB + tickRow + (winRow - winBar) / 2, w: winX.b - winX.a, h: winBar });
    }

    if (stage) {
      // 0. Axis ticks first: kW on the right, hours along the bottom
      // The kW ticks keep 12 px of air around them, so no label reads on into "500 kW".
      // They are placed on their own first, then block everything else with that padding.
      const yReqs: LabelReq[] = yTicks.map((v, i) => {
        const t = tickTxt(v, unitOn(v, i, yTicks.length));
        return { id: `y${v}`, w: textW(t, fsAxis), h: lhA, spots: [{ x: padL + pw + Math.round(rem * 0.5), y: y(v) - lhA / 2 }] };
      });
      placeLabels(yReqs, bounds, []).forEach((r, id) => {
        yPlaced.set(id, r);
        blocked.push({ x: r.x - 12, y: r.y - 4, w: r.w + 12, h: r.h + 8 });
      });
      tTicks.forEach((t) => {
        const w = textW(hhmm(t), fsAxis);
        reqs.push({ id: `t${t}`, w, h: lhA, bounds: { x: padL, y: 0, w: pw, h: H }, spots: [{ x: x(t) - w / 2, y: plotB + Math.round(fsAxis * 0.3) }] });
      });
      // 1b. The backflow limit, named as such, as important as the limit itself
      if (showRev && reverse != null) {
        const ly = y(-reverse);
        [wPair("Backflow limit ", revTxt, fs), textW(revTxt, fs, 600)].forEach((w, i) => {
          const xr = padL + pw - w - g * 0.5;
          const xs = [xr, ...[1, 2, 3, 4, 5, 6].map((j) => padL + (pw * (7 - j)) / 7 - w / 2), padL + g * 0.5];
          const above = ly - swLim / 2 - 3 - lh;
          const below = ly + swLim / 2 + 3;
          reqs.push({ id: i ? "revS" : "rev", group: "rev", w, h: lh, bounds: inPlot, spots: [...xs.map((x) => ({ x, y: above })), ...xs.map((x) => ({ x, y: below }))] });
        });
      }
      // 1. Limit, right end above the line (else below, else at the left end)
      if (showImp && rating != null) {
        const ly = y(rating);
        [wPair("Limit ", limTxt, fs), textW(limTxt, fs, 600)].forEach((w, i) => {
          // right end first, then sliding left along the line, above before below: the limit always finds a spot
          const xr = padL + pw - w - g * 0.5;
          const xs = [xr, ...[1, 2, 3, 4, 5, 6].map((j) => padL + (pw * (7 - j)) / 7 - w / 2), padL + g * 0.5];
          const above = ly - swLim / 2 - 3 - lh;
          const below = ly + swLim / 2 + 3;
          reqs.push({ id: i ? "limS" : "lim", group: "lim", w, h: lh, bounds: inPlot, spots: [...xs.map((x) => ({ x, y: above })), ...xs.map((x) => ({ x, y: below }))] });
        });
      }
    }

    // Now
    [["Now ", hhmm(clock.t)], ["Now", ""]].forEach(([a, b], i) => {
      const nowW = textW(a, fs, 600) + (b ? textW(b, fs, 400) : 0);
      if (!stage && i) return;
      reqs.push({ id: i ? "nowS" : "now", group: "now", w: nowW, h: lh, spots: [{ x: nowX + g, y: topY }, { x: nowX - g - nowW, y: topY }] });
    });

    if (stage && winOn && winX && win) {
      // The signal window: beside its bar under the hours
      const wy = plotB + tickRow + (winRow - lhA) / 2;
      [`Signal #${win.seq} until ${hhmm(win.t1)}`, `Until ${hhmm(win.t1)}`].forEach((t, i) => {
        const w = textW(t, fsAxis, i ? 400 : 400);
        reqs.push({ id: i ? "winS" : "win", group: "win", w, h: lhA, spots: [{ x: winX.b + g, y: wy }, { x: winX.a - g - w, y: wy }] });
      });
    }

    if (stage && !compact) {
      // Plan, on the start of its flat ceiling
      if (plateau && level != null) {
        const px = x(plateau.t);
        const py = y(level);
        const w = wPair("The plan ", planTxt, fs);
        const gapY = swTotal / 2 + 3;
        // the flat run: from its first slot while the plan stays on L
        let endT = plateau.t;
        for (const p of fut) if (p.t >= plateau.t && Math.abs(p.planned - level) < Math.max(0.5, level * 0.005)) endT = p.t;
        const mx = (px + x(endT)) / 2 - w / 2;
        const below = py + gapY;
        const above = py - gapY - lh;
        reqs.push({ id: "plan", w, h: lh, bounds: inPlot, spots: [{ x: px, y: below }, { x: mx, y: below }, { x: px - w, y: below }, { x: px, y: above }, { x: mx, y: above }, { x: px - w, y: above }] });
      }
      // Without, at the top of the hill the plan flattens
      if (top && topIsPeak) {
        const ax = x(top.t);
        const ay = y(top.naive);
        [wPair("Peak without Gridzilla ", topTxt, fs), wPair("Peak without ", topTxt, fs)].forEach((w, i) => {
          const gy = swBase / 2 + 3;
          reqs.push({
            id: i ? "topS" : "top",
            group: "top",
            w,
            h: lh,
            bounds: inPlot,
            spots: [{ x: ax - w / 2, y: ay - gy - lh }, { x: ax + g, y: ay - gy - lh }, { x: ax - g - w, y: ay - gy - lh }, { x: ax + g * 1.5, y: ay - lh / 2 }, { x: ax - g * 1.5 - w, y: ay - lh / 2 }],
          });
        });
      }
    }

    // The newest signal, on the top row beside its line
    if (latest && !compact && (!stage || view - latest.t >= 0.5)) {
      [`Gridzilla acted ${hhmm(latest.t)}`, `Acted ${hhmm(latest.t)}`].forEach((t, i) => {
        const w = textW(t, fs, 600);
        const mx = x(latest.t);
        reqs.push({ id: i ? "sigS" : "sig", group: "sig", w, h: lh, spots: [{ x: mx - g - w, y: topY }, { x: mx + g, y: topY }] });
      });
    }

    if (!stage) {
      // Axis ticks: kW on the right, hours along the bottom
      yTicks.forEach((v, i) => {
        const t = tickTxt(v, i === yTicks.length - 1);
        reqs.push({ id: `y${v}`, w: textW(t, fsAxis), h: lhA, spots: [{ x: padL + pw + Math.round(rem * 0.5), y: y(v) - lhA / 2 }] });
      });
      tTicks.forEach((t) => {
        const w = textW(hhmm(t), fsAxis);
        reqs.push({ id: `t${t}`, w, h: lhA, bounds: { x: padL, y: 0, w: pw, h: H }, spots: [{ x: x(t) - w / 2, y: plotB + Math.round(fsAxis * 0.3) }] });
      });
      // Forecast, top right
      if (fcPts.length > 1 && !compact) {
        const w = textW("Forecast", fsAxis);
        reqs.push({ id: "fc", w, h: lhA, spots: [{ x: padL + pw - w - g * 0.5, y: topY + (lh - lhA) / 2 }] });
      }
    }
    if (!shown.length) {
      const t1 = tn ? `Waiting for the first readings from ${nice(node)}` : "Waiting for the grid to report a street transformer";
      [t1, "Waiting for readings"].forEach((t, i) => {
        const w = textW(t, fs);
        reqs.push({ id: i ? "waitS" : "wait", group: "wait", w, h: lh, spots: [{ x: padL + (pw - w) / 2, y: padT + ph / 2 - lh / 2 }] });
      });
    }
  }
  const placed: Placed = ready ? placeLabels(reqs, bounds, blocked, stage ? 8 : 4) : new Map();
  yPlaced.forEach((r, id) => placed.set(id, r));
  const label = (
    id: string,
    size: number,
    fill: string,
    children: ReactNode,
    opts: { weight?: number; halo?: boolean; src?: string; val?: number | null } = {},
  ) => {
    const b = placed.get(id);
    if (!b) return null;
    const useHalo = opts.halo ?? stage;
    return (
      <text
        key={id}
        x={b.x}
        y={b.y + b.h / 2}
        dy="0.35em"
        fontSize={size}
        fontWeight={opts.weight ?? 600}
        fill={fill}
        stroke={useHalo ? halo : undefined}
        strokeWidth={useHalo ? Math.max(3, rem * 0.3) : undefined}
        paintOrder={useHalo ? "stroke" : undefined}
        style={{ fontVariantNumeric: "tabular-nums" }}
        data-src={opts.src}
        data-val={opts.src && opts.val != null ? String(opts.val) : undefined}
      >
        {children}
      </text>
    );
  };
  /** "Limit 630 kW": the word in secondary, the value in ink. */
  const pair = (a: string, b: string) => (
    <>
      <tspan fontWeight={400} fill={P.secondary}>
        {a}
      </tspan>
      {b}
    </>
  );

  // Header: the gap as the one big number, else the load itself.
  const gapKw = big.kw ?? (big.peak || null);
  const headLine =
    gapKw != null ? (
      <>
        <div className={`${hero ? "t-hero" : "text-[2.5rem] leading-none font-semibold tracking-[-0.03em]"} flex flex-wrap items-baseline gap-x-2`} style={{ color: P.green, letterSpacing: "-0.03em" }}>
          <Counter value={-gapKw} />
          <span style={{ fontSize: "0.5em", letterSpacing: "-0.01em" }}>kW</span>
        </div>
        <div className={hero ? "t-headline mt-1" : "t-title mt-1"} style={{ color: P.ink }}>
          {big.kw != null ? "kept off the street right now" : `kept off the street at ${hhmm(big.peakH ?? s.sim_hour)}`}
        </div>
      </>
    ) : (
      <>
        <div className={`${hero ? "t-hero" : "text-[2.5rem] leading-none font-semibold"} flex flex-wrap items-baseline gap-x-2`} style={{ color: over ? P.red : P.ink, letterSpacing: "-0.03em" }}>
          <Counter value={kw == null ? null : Math.abs(kw)} />
          <span style={{ fontSize: "0.5em", letterSpacing: "-0.01em" }}>kW</span>
        </div>
        <div className={hero ? "t-headline mt-1" : "t-title mt-1"} style={{ color: P.ink }}>
          {kw == null ? "waiting for the first reading" : kw < 0 ? "flowing back from the street now" : over ? "over the limit now" : "on this transformer now, inside the limit"}
        </div>
      </>
    );

  const limitWord = limV == null ? null : showRev && !showImp ? `Limit ${kwFmt(reverse as number)} kW flowing back` : `Limit ${kwFmt(rating as number)} kW`;
  const src = (p: string) => `state/aggregates/${node}/${p}`;
  // The state poll sends the tree only on its first answer (api.ts useGridState), so state/tree/... is gone from the
  // payload on screen after 3 s: a backflow limit equal to the rating traces to the aggregate, which every poll carries.
  const revSrc =
    agg?.rating_kw != null && (tn?.reverse_kw == null || tn.reverse_kw === agg.rating_kw)
      ? src("rating_kw")
      : tn?.reverse_kw != null
        ? `state/tree/${node}/reverse_kw`
        : "axis";
  const winLabelShown = placed.has("win") || placed.has("winS");

  // Stage legend: names only. The values sit where they belong: the limits and the plan on their lines in the plot,
  // the loads with and without in the hero card, so the legend never repeats a number. One "Limit" names the red line(s).
  const keyLim = (rating != null && showImp) || (reverse != null && showRev);
  const stageLegend = (
    <div
      className="flex flex-wrap items-center gap-x-[1.25em] gap-y-[0.35em]"
      style={{ fontSize: `clamp(0.875rem, 0.8rem + 0.25vw, 1.125rem)`, lineHeight: 1.3, paddingBottom: legendAt === "above" ? "0.75em" : 0, paddingTop: legendAt === "below" ? "0.6em" : 0 }}
    >
      {totalPts.length > 1 && <Key swatch={<Swatch color={lineC} width={3.5} />} label={basePts.length > 1 ? "With Gridzilla" : "Load now"} />}
      {(basePts.length > 1 || naivePts.length > 1) && <Key swatch={<Swatch color={P.tertiary} width={3} dashed />} label="Without" />}
      {(!!band || !!planBand) && <Key swatch={<Swatch color={washC} kind="fill" opacity={washO + 0.08} />} label="Peak eaten" />}
      {usePlan && level != null && planLine.length > 1 && <Key swatch={<Swatch color={P.green} width={3.5} />} label="The plan" />}
      {keyLim && <Key swatch={<Swatch color={P.red} width={2.5} />} label="Limit" />}
      {win && winOn && !winLabelShown && (
        <Key swatch={<Swatch color={P.ink} kind="bar" />} label="Signal until">
          <span data-src="axis">{hhmm(win.t1)}</span>
        </Key>
      )}
    </div>
  );

  const classicLegend = (
    <div className="flex flex-wrap items-center gap-x-[1.1em] gap-y-1 pt-[0.5em]" style={{ fontSize: Math.max(13, Math.min(26, (W || 600) / 56)), lineHeight: 1.25, color: P.secondary }}>
      <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold" style={{ color: P.blue }}>
        <Swatch color={P.blue} width={3.5} />
        {hasBase ? "With Gridzilla" : "Load"}
      </span>
      {hasBase && (
        <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold">
          <Swatch color={P.tertiary} width={3} dashed />
          Without Gridzilla
        </span>
      )}
      {hasBase && (
        <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold">
          <Swatch color={P.green} kind="fill" />
          Kept off the street
        </span>
      )}
      {limitWord && (
        <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold" style={{ color: P.red }}>
          <Swatch color={P.red} width={2.5} />
          {limitWord}
        </span>
      )}
    </div>
  );
  const legendEl = legendAt === "none" ? null : stage ? stageLegend : classicLegend;

  const aria =
    usePlan && plan
      ? `${nice(node)}: tonight's peak would reach ${plan.peak_naive_pct} % of the limit without Gridzilla, ${plan.peak_plan_pct} % with the plan`
      : `Load on ${nice(node)} with and without Gridzilla`;

  return (
    <div
      className={`flex min-h-0 min-w-0 flex-col ${hero || stage ? "" : "panel p-5"}`}
      style={stage && height == null ? { flex: "1 1 auto" } : { height: height ?? (hero ? "100%" : "22rem") }}
    >
      {header && (
        <header className={hero ? "mb-4 flex flex-wrap items-end justify-between gap-x-8 gap-y-2" : "mb-2 flex flex-col-reverse gap-2"}>
          <div className="min-w-0">{headLine}</div>
          {tn && (
            <div className={`min-w-0 ${hero ? "text-right" : ""}`}>
              <div className={hero ? "t-headline" : "t-title"}>{nice(node)}</div>
              <div className={hero ? "t-body mt-1" : "t-small mt-0.5"} style={{ color: over ? P.red : P.secondary }}>
                <Counter value={kw == null ? null : Math.abs(kw)} /> kW now
                {pct != null && (
                  <>
                    , <Counter value={Math.abs(pct)} /> % of its limit{kw != null && kw < 0 ? ", flowing back" : ""}
                  </>
                )}
              </div>
            </div>
          )}
        </header>
      )}
      {legendAt === "above" && legendEl}
      <div ref={plot} className="relative min-w-0 flex-1" style={{ minHeight: minPlot ?? "9rem" }}>
        {ready && (
          <svg width={W} height={H} className="absolute inset-0 block" role="img" aria-label={aria}>
            <defs>
              <clipPath id={`${clipId}-plot`}>
                <rect x={padL} y={0} width={pw} height={H} />
              </clipPath>
              {rating != null && (
                <clipPath id={clipId}>
                  {showImp && <rect x={padL} y={0} width={pw} height={Math.max(0, y(rating))} />}
                  {showRev && <rect x={padL} y={y(-(reverse as number))} width={pw} height={Math.max(0, H - y(-(reverse as number)))} />}
                </clipPath>
              )}
            </defs>

            {/* the signal's time-limited window, a faint band behind everything */}
            {stage && winOn && winX && <rect x={winX.a} y={padT - fs * 0.4} width={winX.b - winX.a} height={plotB - padT + fs * 0.4} fill={P.ink} fillOpacity={0.04} />}

            {/* scale: faint grid lines */}
            {yTicks.map((v) => (
              <line key={`g${v}`} x1={padL} x2={padL + pw} y1={y(v)} y2={y(v)} stroke={P.ink} strokeOpacity={v === 0 ? 0.16 : 0.06} strokeWidth={1} />
            ))}

            <g clipPath={`url(#${clipId}-plot)`}>
              {/* the peak eaten: kept off in the past, planned away from Now on (flat fill, no gradient) */}
              {band && <path d={band} fill={washC} fillOpacity={washO} />}
              {planBand && <path d={planBand} fill={washC} fillOpacity={washO} />}
              {/* without Gridzilla: measured counterfactual, then the plan's hill, grey dashed (red is only the limit) */}
              {basePts.length > 1 && (
                <path d={smoothPath(basePts)} fill="none" stroke={P.tertiary} strokeWidth={swBase} strokeDasharray={`${swBase * 3} ${swBase * 2.2}`} strokeLinecap="round" strokeLinejoin="round" />
              )}
              {naivePts.length > 1 && (
                <path d={smoothPath(naivePts)} fill="none" stroke={P.tertiary} strokeWidth={swBase} strokeDasharray={`${swBase * 3} ${swBase * 2.2}`} strokeLinecap="round" strokeLinejoin="round" />
              )}
              {/* forecast ahead (only without a plan) */}
              {fcPts.length > 1 && (
                <path d={smoothPath(fcPts)} fill="none" stroke={P.ink} strokeOpacity={0.28} strokeWidth={swBase * 0.8} strokeDasharray={`${swBase * 1.6} ${swBase * 2}`} strokeLinecap="round" />
              )}
              {/* the diet plan: the target shape the street is pulled onto */}
              {planLine.length > 1 && <path d={smoothPath(planLine)} fill="none" stroke={P.green} strokeWidth={swTotal} strokeLinecap="round" strokeLinejoin="round" />}
              {/* with Gridzilla; classic mode turns it red where it is over the limit, the stage keeps red for the limit */}
              {totalPts.length > 1 && (
                <>
                  <path d={smoothPath(totalPts)} fill="none" stroke={lineC} strokeWidth={swTotal} strokeLinecap="round" strokeLinejoin="round" />
                  {rating != null && !stage && (
                    <path d={smoothPath(totalPts)} fill="none" stroke={P.red} strokeWidth={swTotal} strokeLinecap="round" strokeLinejoin="round" clipPath={`url(#${clipId})`} />
                  )}
                </>
              )}
              {/* where a signal went out */}
              {(!stage || totalPts.length > 1) && pins.map((m) => {
                const v = at(hist, m.t, "total");
                return v == null ? null : <circle key={m.key} cx={x(m.t)} cy={y(v)} r={swTotal * 1.25} fill={lineC} stroke={halo} strokeWidth={swTotal * 0.6} />;
              })}
            </g>

            {/* the limits */}
            {stage ? (
              <>
                {showImp && rating != null && <line x1={padL} x2={padL + pw} y1={y(rating)} y2={y(rating)} stroke={P.red} strokeWidth={swLim} />}
                {showRev && reverse != null && <line x1={padL} x2={padL + pw} y1={y(-reverse)} y2={y(-reverse)} stroke={P.red} strokeWidth={swLim} />}
              </>
            ) : (
              limV != null && <line x1={padL} x2={padL + pw} y1={y(limV)} y2={y(limV)} stroke={P.red} strokeWidth={swLim} />
            )}

            {/* the newest signal: a dashed line down to the reading */}
            {latest && !compact && (!stage || placed.has("sig") || placed.has("sigS")) && (() => {
              const v = at(hist, latest.t, "total");
              const mx = x(latest.t);
              return <line x1={mx} x2={mx} y1={padT - fs * 0.4} y2={v == null ? plotB : y(v)} stroke={P.ink} strokeOpacity={0.35} strokeWidth={1.25 * k} strokeDasharray={`${2 * k} ${3 * k}`} />;
            })()}

            {/* the gap at the head */}
            {yB != null && headBase != null && headTot != null && Math.abs(yB - y(headTot)) > swTotal * 2 && shaving({ t: head, total: headTot, base: headBase, program: 0, other: 0 }) && (
              <line x1={endX} x2={endX} y1={yB} y2={y(headTot)} stroke={stage ? P.orange : P.green} strokeWidth={swTotal * 0.9} strokeLinecap="round" />
            )}

            {/* the head of the line: a ring pulses each time a new reading lands */}
            {hasLine && (
              <g>
                <circle key={`pulse-${last?.t ?? 0}`} cx={x(head)} cy={y(headTot as number)} r={swTotal * 1.4} fill="none" stroke={lineC} strokeWidth={swTotal * 0.5}>
                  <animate attributeName="r" from={swTotal * 1.4} to={swTotal * 5} dur="1.4s" repeatCount="1" fill="freeze" />
                  <animate attributeName="stroke-opacity" from="0.6" to="0" dur="1.4s" repeatCount="1" fill="freeze" />
                </circle>
                <circle cx={x(head)} cy={y(headTot as number)} r={swTotal * 1.4} fill={lineC} stroke={halo} strokeWidth={swTotal * 0.5} />
              </g>
            )}

            {/* now */}
            <line x1={nowX} x2={nowX} y1={padT - fs * 0.4} y2={plotB} stroke={P.ink} strokeOpacity={stage ? 0.25 : 0.22} strokeWidth={stage ? 1 : 1.25 * k} />

            {/* the signal window bar under the hours: elapsed ink, remaining fill, a surface gap at Now */}
            {stage && winOn && winX && (() => {
              const by = plotB + tickRow + (winRow - winBar) / 2;
              const split = Math.min(winX.b, Math.max(winX.a, nowX));
              const r = winBar / 2;
              return (
                <g>
                  {split - winX.a > 1 && <rect x={winX.a} y={by} width={Math.max(winBar, split - winX.a - 1)} height={winBar} rx={r} fill={P.ink} />}
                  {winX.b - split > 1 && <rect x={Math.min(winX.b - winBar, split + 1)} y={by} width={Math.max(winBar, winX.b - split - 1)} height={winBar} rx={r} fill={P.fill} />}
                </g>
              );
            })()}

            {/* every label, already placed without overlap */}
            <g data-src="axis">
              {yTicks.map((v, i) => label(`y${v}`, fsAxis, stage ? P.tertiary : P.secondary, tickTxt(v, unitOn(v, i, yTicks.length)), { weight: 400, halo: false }))}
              {tTicks.map((t) => label(`t${t}`, fsAxis, stage ? P.tertiary : P.secondary, hhmm(t), { weight: 400, halo: false }))}
              {label("now", fs, P.ink, <>Now <tspan fontWeight={400} fill={P.secondary}>{hhmm(clock.t)}</tspan></>) ?? label("nowS", fs, P.ink, "Now")}
              {latest && (label("sig", fs, P.ink, `Gridzilla acted ${hhmm(latest.t)}`) ?? label("sigS", fs, P.ink, `Acted ${hhmm(latest.t)}`))}
              {label("fc", fsAxis, P.tertiary, "Forecast", { weight: 400 })}
              {win && label("winS", fsAxis, P.secondary, `Until ${hhmm(win.t1)}`, { weight: 400, halo: false })}
            </g>
            {stage && rating != null &&
              (label("lim", fs, P.ink, pair("Limit ", limTxt), { src: agg?.rating_kw != null ? src("rating_kw") : "axis", val: rating }) ??
                label("limS", fs, P.ink, limTxt, { src: agg?.rating_kw != null ? src("rating_kw") : "axis", val: rating }))}
            {stage && showRev && reverse != null &&
              (label("rev", fs, P.ink, pair("Backflow limit ", revTxt), { src: revSrc, val: reverse }) ?? label("revS", fs, P.ink, revTxt, { src: revSrc, val: reverse }))}
            {win && label("win", fsAxis, P.secondary, `Signal #${win.seq} until ${hhmm(win.t1)}`, { weight: 400, halo: false, src: `state/active/${win.key}/seq`, val: win.seq })}
            {level != null && label("plan", fs, P.ink, pair("The plan ", planTxt), { src: `${planSrc}/plan/level_kw`, val: level })}
            {plan && (label("top", fs, P.ink, pair("Peak without Gridzilla ", topTxt), { src: `${planSrc}/plan/peak_naive_pct`, val: plan.peak_naive_pct }) ??
              label("topS", fs, P.ink, pair("Peak without ", topTxt), { src: `${planSrc}/plan/peak_naive_pct`, val: plan.peak_naive_pct }))}
            {label("wait", fs, P.secondary, tn ? `Waiting for the first readings from ${nice(node)}` : "Waiting for the grid to report a street transformer", { weight: 400 }) ??
              label("waitS", fs, P.secondary, "Waiting for readings", { weight: 400 })}
          </svg>
        )}
      </div>
      {legendAt === "below" && legendEl}
      {usePlan && plan && <PlanTable plan={plan} hist={hist} planPts={planPts} tL={tL} view={view} tR={tR} />}
    </div>
  );
}

/** Screen-reader twin of the chart: measured hourly for the past, the plan hourly ahead. */
function PlanTable({ plan, hist, planPts, tL, view, tR }: { plan: FlattenPlan; hist: HistPt[]; planPts: ReturnType<typeof unwrapPlan>; tL: number; view: number; tR: number }) {
  const rows: { t: number; w: number | null; wo: number | null; p: number | null }[] = [];
  for (let t = Math.ceil(tL); t <= Math.floor(view); t++) rows.push({ t, w: at(hist, t, "total"), wo: at(hist, t, "base"), p: null });
  for (const p of planPts) if (p.t > view && p.t <= tR && Math.abs(p.t - Math.round(p.t)) < 0.13) rows.push({ t: p.t, w: null, wo: p.naive, p: p.planned });
  const f = (v: number | null) => (v == null ? "" : `${Math.round(v)} kW`);
  // The 1px sr-only box sits on a div: a table grows to its content's width, which made phone pages 418 px wide.
  return (
    <div className="sr-only">
    <table>
      <caption>
        Peak {plan.peak_naive_pct} % of the limit without Gridzilla, {plan.peak_plan_pct} % with the plan
      </caption>
      <thead>
        <tr>
          <th>Time</th>
          <th>With Gridzilla</th>
          <th>Without Gridzilla</th>
          <th>The plan</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.t}>
            <td>{hhmm(r.t)}</td>
            <td>{f(r.w)}</td>
            <td>{f(r.wo)}</td>
            <td>{f(r.p)}</td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}
