// THE money shot: one street transformer over the last hours and the forecast ahead. "Without Gridzilla" (the
// simulator's counterfactual, baseline_kw) is a grey dashed line that keeps climbing; "With Gridzilla" (total_kw) is the
// bold ink line that bends down under the limit; the gap between them is filled flat Apple green and its size is the big
// number on top. The limit is a red line in both directions, the line turns red only where it really is over the limit.
//
// Labels never collide: the chart measures its own box, every label gets a real text box, and they are placed in
// priority order (Now, the newest signal, axis ticks, Forecast); a label with no free spot is dropped. The series and
// the limit are named in a legend row under the plot (HTML, wraps), so no label ever sits on a line. Below 360 x 200 px
// only the essentials stay in the plot: the two lines, the limit line and Now.
//
// Motion with purpose only: the time axis pans linearly with grid time, the newest segment of the line grows to each new
// reading (no full redraw), the scale glides when the peak grows, and every number ticks. Built from curve/series.ts.
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import type { History, State } from "../../api";
import { hhmm, loadPct, nice } from "../../model";
import { signalMarks, unwrapForecast, unwrapHistory, niceStep, type HistPt } from "../../components/curve/series";
import { P } from "../palette";
import Counter, { fmtNum } from "./Counter";
import { smoothBand, smoothPath } from "./smooth";
import { useTweens } from "./tween";
import { placeLabels, textW, useBox, type LabelReq, type Rect } from "./layout";

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


type Placed = Map<string, Rect>;

/** A short legend swatch: solid, dashed or the limit line. */
function Swatch({ color, dashed, width }: { color: string; dashed?: boolean; width: number }) {
  return (
    <svg width="1.6em" height="0.6em" viewBox="0 0 24 8" className="shrink-0" aria-hidden>
      <line x1="2" x2="22" y1="4" y2="4" stroke={color} strokeWidth={width} strokeLinecap="round" strokeDasharray={dashed ? "4 4" : undefined} />
    </svg>
  );
}

export default function LiveCurve({
  s,
  history,
  node,
  height,
  variant = "hero",
  header = true,
  ground,
}: {
  s: State;
  history: History | null;
  /** The transformer on screen, e.g. "tf:mauer-2". */
  node: string;
  /** CSS height; hero fills its parent (100%), card defaults to 22rem. The plot never gets shorter than 9rem. */
  height?: number | string;
  variant?: Variant;
  /** Big "kept off the street" number and the transformer name above the chart (default on). */
  header?: boolean;
  /** Colour behind the chart, used as the thin halo that keeps line labels readable (default white). */
  ground?: string;
}) {
  const hero = variant === "hero";
  const PAST = hero ? 6 : 4;
  const FUTURE = hero ? 2 : 1.5;
  const clock = useClock(s.sim_hour);
  const [plot, { w: W, h: H, rem }] = useBox<HTMLDivElement>();
  const tn = node ? s.tree[node] : undefined;
  const rating = tn?.rating_kw ?? null;
  const reverse = rating != null ? tn?.reverse_kw ?? rating : null;

  const hist = useMemo(() => unwrapHistory(history, node, clock.t, s.sim_hour), [history, node, clock.t, s.sim_hour]);
  const fc = useMemo(() => unwrapForecast(s, node, clock.t), [s, node, clock.t]);
  const marks = useMemo(() => signalMarks(s, node, clock.t), [s, node, clock.t]);
  const last = hist[hist.length - 1];
  const hasBase = hist.some((p) => p.base != null);

  // Scale: everything visible plus the limit, and the reverse limit once power flows back.
  const vis = hist.filter((p) => p.t >= clock.t - PAST - 0.5);
  const vals = [
    ...vis.map((p) => p.total),
    ...vis.flatMap((p) => (p.base == null ? [] : [p.base])),
    ...fc.filter((p) => p.t <= clock.t + FUTURE + 0.3).map((p) => p.total),
  ];
  const vMax = vals.length ? Math.max(...vals) : 0;
  const vMin = vals.length ? Math.min(...vals) : 0;
  // Only the limit in the flow direction: solar backflow when the street pushes back more than it draws.
  const lim = rating ?? Math.max(10, vMax);
  const backflow = reverse != null && -vMin > Math.max(0, vMax);
  const showRev = backflow;
  const showImp = !backflow;
  const span = Math.max(vMax, 0) - Math.min(vMin, 0) || 1;
  const hiT = backflow ? Math.max(vMax, 0) + span * 0.08 : Math.max(lim * 1.08, vMax + span * 0.08);
  const loT = backflow ? Math.min(-(reverse as number) * 1.08, vMin - span * 0.08) : Math.min(0, vMin - span * 0.05);

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
    { to: loT, ms: 900 },
    { to: hiT, ms: 900 },
  ]);

  const big = keptOff(s, history, node, PAST);
  const kw = s.aggregates[node]?.total_kw ?? last?.total ?? null;
  const pct = loadPct(s, node, kw);
  const over = pct != null && Math.abs(pct) >= 100;
  const kwFmt = (v: number) => fmtNum(Math.round(v) || 0);

  // ---- sizes, all from the chart's own box (not the window)
  const k = rem / 16;
  const compact = W < 360 || H < 200;
  const fs = Math.max(12, Math.min(hero ? 30 : 15 * k, W / 44, H / 10));
  const fsAxis = Math.max(11, fs * 0.86);
  const lh = Math.ceil(fs * 1.3);
  const lhA = Math.ceil(fsAxis * 1.3);
  const swTotal = hero ? Math.max(3, Math.min(6, W / 280)) : 3.25 * k;
  const swBase = hero ? swTotal * 0.85 : 2.5 * k;
  const swLim = hero ? Math.max(2, swTotal * 0.6) : 2 * k;
  const halo = ground ?? P.card;
  const g = rem * 0.4;

  // ---- geometry (px): top row for Now and the signal, bottom row for the hours, kW on the right
  const showX = H >= 120;
  const padT = lh + Math.round(fs * 0.5);
  const padB = showX ? lhA + Math.round(fsAxis * 0.45) : 4;
  const padL = Math.round(rem * 0.25);
  const ph = Math.max(1, H - padT - padB);
  const yCount = Math.max(2, Math.min(hero ? 5 : 4, Math.floor(ph / (lhA * 2.2))));
  const yStep = niceStep(hiT - loT || 1, yCount);
  const ticksOf = (a: number, b: number) => {
    const out: number[] = [];
    for (let v = Math.ceil(a / yStep) * yStep; v <= b + 1e-9; v += yStep) out.push(Math.round(v * 1000) / 1000);
    return out;
  };
  const tickTxt = (v: number, top: boolean) => `${kwFmt(v)}${top ? " kW" : ""}`;
  const tgt = ticksOf(loT, hiT);
  const padR = Math.ceil(Math.max(rem * 2, ...tgt.map((v, i) => textW(tickTxt(v, i === tgt.length - 1), fsAxis)))) + Math.round(rem * 0.7);

  // The window starts where the history starts (at most PAST hours back), so the curve fills the width.
  const firstT = hist.length ? hist[0].t : view - PAST;
  const past = Math.min(PAST, Math.max(2, view - firstT + 0.25));
  const tL = view - past;
  const tR = view + FUTURE;
  const pw = Math.max(1, W - padL - padR);
  const x = (t: number) => padL + ((t - tL) / (tR - tL)) * pw;
  const y = (v: number) => padT + ((hi - v) / (hi - lo || 1)) * ph;
  const ready = W > 0 && H > 0;

  const shown = hist.filter((p) => p.t >= tL - 0.8 && p.t <= head);
  const headTot = at(hist, head, "total");
  const headBase = at(hist, head, "base");
  if (shown.length && headTot != null && head > shown[shown.length - 1].t)
    shown.push({ ...shown[shown.length - 1], t: head, total: headTot, base: headBase });

  const totalPts = shown.map((p) => [x(p.t), y(p.total)] as [number, number]);
  const baseRun = shown.filter((p) => p.base != null);
  const basePts = baseRun.map((p) => [x(p.t), y(p.base as number)] as [number, number]);
  const shaving = (p: HistPt) => p.base != null && Math.abs(p.total) < Math.abs(p.base) && (Math.sign(p.base) === Math.sign(p.total) || Math.abs(p.total) <= 1);
  const band = smoothBand(
    baseRun.map((p) => [x(p.t), y(shaving(p) ? (p.base as number) : p.total)]),
    baseRun.map((p) => [x(p.t), y(p.total)]),
  );
  const fcPts = fc.filter((p) => p.t >= view - 0.05 && p.t <= tR + 0.3).map((p) => [x(p.t), y(p.total)] as [number, number]);
  if (fcPts.length && headTot != null && last && view - head < 0.6) fcPts.unshift([x(head), y(headTot)]);

  // Signals that went out, clustered (one per half hour); the newest one is named on the top row.
  const seen: number[] = [];
  const pins = marks.filter((m) => {
    if (m.t < tL || m.t > view + 0.05) return false;
    if (seen.some((t) => Math.abs(t - m.t) < 0.5)) return false;
    seen.push(m.t);
    return true;
  });
  const latest = pins[pins.length - 1];

  const yTicks = ticksOf(lo, hi);
  // Hours thin out by the pixels they get: every 1, 2, 3, 4 or 6 hours.
  const wHour = textW("00:00", fsAxis);
  const hourPx = pw / (past + FUTURE);
  const tStep = [1, 2, 3, 4, 6].find((st) => hourPx * st >= wHour * 1.7) ?? 6;
  const tTicks: number[] = [];
  if (showX) for (let t = Math.ceil(tL / tStep) * tStep; t <= tR; t += tStep) tTicks.push(t);

  const nowX = x(view);
  const endX = shown.length ? x(shown[shown.length - 1].t) : nowX;
  const clipId = `over-${node.replace(/[^a-z0-9]/gi, "")}-${variant}`;
  const hasLine = headTot != null && shown.length > 1;
  const yB = hasLine && headBase != null && basePts.length > 1 ? y(headBase) : null;
  const limV = rating == null ? null : showImp ? rating : -(reverse as number);

  // ---- label layout: priority order, first free spot wins, the rest drop out
  const bounds: Rect = { x: 0, y: 0, w: W, h: H };
  const topY = Math.round(fs * 0.1);
  const reqs: LabelReq[] = [];
  const blocked: Rect[] = [];
  const dot = (cx: number, cy: number, r: number) => blocked.push({ x: cx - r, y: cy - r, w: 2 * r, h: 2 * r });
  if (ready) {
    if (hasLine) dot(x(head), y(headTot as number), swTotal * 1.8);
    for (const m of pins) {
      const v = at(hist, m.t, "total");
      if (v != null) dot(x(m.t), y(v), swTotal * 1.6);
    }

    // 1. Now
    const nowW = textW("Now ", fs, 600) + textW(hhmm(view), fs, 400);
    reqs.push({ id: "now", w: nowW, h: lh, spots: [{ x: nowX + g, y: topY }, { x: nowX - g - nowW, y: topY }] });
    // 2. The newest signal, on the top row beside its line
    if (latest && !compact) {
      [`Gridzilla acted ${hhmm(latest.t)}`, `Acted ${hhmm(latest.t)}`].forEach((t, i) => {
        const w = textW(t, fs, 600);
        const mx = x(latest.t);
        reqs.push({ id: i ? "sigS" : "sig", group: "sig", w, h: lh, spots: [{ x: mx - g - w, y: topY }, { x: mx + g, y: topY }] });
      });
    }
    // 3. Axis ticks: kW on the right, hours along the bottom
    yTicks.forEach((v, i) => {
      const t = tickTxt(v, i === yTicks.length - 1);
      reqs.push({ id: `y${v}`, w: textW(t, fsAxis), h: lhA, spots: [{ x: padL + pw + Math.round(rem * 0.5), y: y(v) - lhA / 2 }] });
    });
    tTicks.forEach((t) => {
      const w = textW(hhmm(t), fsAxis);
      reqs.push({ id: `t${t}`, w, h: lhA, bounds: { x: padL, y: 0, w: pw, h: H }, spots: [{ x: x(t) - w / 2, y: H - padB + Math.round(fsAxis * 0.3) }] });
    });
    // 4. Forecast, top right
    if (fcPts.length > 1 && !compact) {
      const w = textW("Forecast", fsAxis);
      reqs.push({ id: "fc", w, h: lhA, spots: [{ x: padL + pw - w - g * 0.5, y: topY + (lh - lhA) / 2 }] });
    }
    if (!shown.length) {
      const t1 = tn ? `Waiting for the first readings from ${nice(node)}` : "Waiting for the grid to report a street transformer";
      [t1, "Waiting for readings"].forEach((t, i) => {
        const w = textW(t, fs);
        reqs.push({ id: i ? "waitS" : "wait", group: "wait", w, h: lh, spots: [{ x: padL + (pw - w) / 2, y: padT + ph / 2 - lh / 2 }] });
      });
    }
  }
  const placed: Placed = ready ? placeLabels(reqs, bounds, blocked) : new Map();
  const label = (id: string, size: number, fill: string, children: ReactNode, opts: { weight?: number; halo?: boolean } = {}) => {
    const b = placed.get(id);
    if (!b) return null;
    return (
      <text
        key={id}
        x={b.x}
        y={b.y + b.h / 2}
        dy="0.35em"
        fontSize={size}
        fontWeight={opts.weight ?? 600}
        fill={fill}
        stroke={opts.halo ? halo : undefined}
        strokeWidth={opts.halo ? Math.max(3, rem * 0.3) : undefined}
        paintOrder={opts.halo ? "stroke" : undefined}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {children}
      </text>
    );
  };

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

  const legendFs = Math.max(13, Math.min(26, (W || 600) / 56));
  const limitWord = limV == null ? null : showRev ? `Limit ${kwFmt(reverse as number)} kW flowing back` : `Limit ${kwFmt(rating as number)} kW`;

  return (
    <div className={`flex min-h-0 min-w-0 flex-col ${hero ? "" : "panel p-5"}`} style={{ height: height ?? (hero ? "100%" : "22rem") }}>
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
      <div ref={plot} className="relative min-h-[9rem] min-w-0 flex-1">
        {ready && (
          <svg width={W} height={H} className="absolute inset-0 block" role="img" aria-label={`Load on ${nice(node)} with and without Gridzilla`}>
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

            {/* scale: faint grid lines */}
            {yTicks.map((v) => (
              <line key={`g${v}`} x1={padL} x2={padL + pw} y1={y(v)} y2={y(v)} stroke={P.ink} strokeOpacity={v === 0 ? 0.16 : 0.06} strokeWidth={1} />
            ))}

            <g clipPath={`url(#${clipId}-plot)`}>
              {/* the gap Gridzilla keeps off the street */}
              {band && <path d={band} fill={P.green} fillOpacity={0.38} />}
              {/* without Gridzilla */}
              {basePts.length > 1 && (
                <path d={smoothPath(basePts)} fill="none" stroke={P.tertiary} strokeWidth={swBase} strokeDasharray={`${swBase * 3} ${swBase * 2.2}`} strokeLinecap="round" strokeLinejoin="round" />
              )}
              {/* forecast ahead */}
              {fcPts.length > 1 && (
                <path d={smoothPath(fcPts)} fill="none" stroke={P.ink} strokeOpacity={0.28} strokeWidth={swBase * 0.8} strokeDasharray={`${swBase * 1.6} ${swBase * 2}`} strokeLinecap="round" />
              )}
              {/* with Gridzilla, red only where it really is over the limit */}
              {totalPts.length > 1 && (
                <>
                  <path d={smoothPath(totalPts)} fill="none" stroke={P.blue} strokeWidth={swTotal} strokeLinecap="round" strokeLinejoin="round" />
                  {rating != null && (
                    <path d={smoothPath(totalPts)} fill="none" stroke={P.red} strokeWidth={swTotal} strokeLinecap="round" strokeLinejoin="round" clipPath={`url(#${clipId})`} />
                  )}
                </>
              )}
              {/* where a signal went out */}
              {pins.map((m) => {
                const v = at(hist, m.t, "total");
                return v == null ? null : <circle key={m.key} cx={x(m.t)} cy={y(v)} r={swTotal * 1.25} fill={P.blue} stroke="#fff" strokeWidth={swTotal * 0.6} />;
              })}
            </g>

            {/* the limit in the flow direction */}
            {limV != null && <line x1={padL} x2={padL + pw} y1={y(limV)} y2={y(limV)} stroke={P.red} strokeWidth={swLim} />}

            {/* the newest signal: a dashed line down to the reading */}
            {latest && !compact && (() => {
              const v = at(hist, latest.t, "total");
              const mx = x(latest.t);
              return <line x1={mx} x2={mx} y1={padT - fs * 0.4} y2={v == null ? H - padB : y(v)} stroke={P.ink} strokeOpacity={0.35} strokeWidth={1.25 * k} strokeDasharray={`${2 * k} ${3 * k}`} />;
            })()}

            {/* the gap at the head */}
            {yB != null && headBase != null && headTot != null && Math.abs(yB - y(headTot)) > swTotal * 2 && shaving({ t: head, total: headTot, base: headBase, program: 0, other: 0 }) && (
              <line x1={endX} x2={endX} y1={yB} y2={y(headTot)} stroke={P.green} strokeWidth={swTotal * 0.9} strokeLinecap="round" />
            )}

            {/* the head of the line: a ring pulses each time a new reading lands */}
            {hasLine && (
              <g>
                <circle key={`pulse-${last?.t ?? 0}`} cx={x(head)} cy={y(headTot as number)} r={swTotal * 1.4} fill="none" stroke={P.blue} strokeWidth={swTotal * 0.5}>
                  <animate attributeName="r" from={swTotal * 1.4} to={swTotal * 5} dur="1.4s" repeatCount="1" fill="freeze" />
                  <animate attributeName="stroke-opacity" from="0.6" to="0" dur="1.4s" repeatCount="1" fill="freeze" />
                </circle>
                <circle cx={x(head)} cy={y(headTot as number)} r={swTotal * 1.4} fill={P.blue} stroke={halo} strokeWidth={swTotal * 0.5} />
              </g>
            )}

            {/* now */}
            <line x1={nowX} x2={nowX} y1={padT - fs * 0.4} y2={H - padB} stroke={P.ink} strokeOpacity={0.22} strokeWidth={1.25 * k} />

            {/* every label, already placed without overlap */}
            {label("now", fs, P.ink, <>Now <tspan fontWeight={400} fill={P.secondary}>{hhmm(view)}</tspan></>)}
            {latest && (label("sig", fs, P.ink, `Gridzilla acted ${hhmm(latest.t)}`) ?? label("sigS", fs, P.ink, `Acted ${hhmm(latest.t)}`))}
            {yTicks.map((v, i) => label(`y${v}`, fsAxis, P.secondary, tickTxt(v, i === yTicks.length - 1), { weight: 400 }))}
            {tTicks.map((t) => label(`t${t}`, fsAxis, P.secondary, hhmm(t), { weight: 400 }))}
            {label("fc", fsAxis, P.tertiary, "Forecast", { weight: 400 })}
            {label("wait", fs, P.secondary, tn ? `Waiting for the first readings from ${nice(node)}` : "Waiting for the grid to report a street transformer", { weight: 400 }) ??
              label("waitS", fs, P.secondary, "Waiting for readings", { weight: 400 })}
          </svg>
        )}
      </div>
      {(
        <div className="flex flex-wrap items-center gap-x-[1.1em] gap-y-1 pt-[0.5em]" style={{ fontSize: legendFs, lineHeight: 1.25, color: P.secondary }}>
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
              <span className="inline-block shrink-0 rounded-[0.2em]" style={{ width: "0.9em", height: "0.9em", background: P.green, opacity: 0.45 }} aria-hidden />
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
      )}
    </div>
  );
}
