// THE money shot: one street transformer over the last hours and the forecast ahead. "Without Gridzilla" (the
// simulator's counterfactual, baseline_kw) is a grey dashed line that keeps climbing; "With Gridzilla" (total_kw) is the
// bold ink line that bends down under the limit; the gap between them is filled flat Apple green and its size is the big
// number on top. The limit is a red line in both directions, the line turns red only where it really is over the limit.
//
// Motion with purpose only: the time axis pans linearly with grid time, the newest segment of the line grows to each new
// reading (no full redraw), the scale glides when the peak grows, and every number ticks. Built from curve/series.ts.
import { useEffect, useMemo, useRef, useState } from "react";
import type { History, State } from "../../api";
import { hhmm, loadPct, nice } from "../../model";
import { signalMarks, unwrapForecast, unwrapHistory, niceStep, type HistPt } from "../../components/curve/series";
import { P } from "../palette";
import Counter, { fmtNum } from "./Counter";
import { smoothBand, smoothPath } from "./smooth";
import { useTweens } from "./tween";

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

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0, rem: 16 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height), rem });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
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
  /** CSS height; hero fills its parent (100%), card defaults to 22rem. */
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
  const [plot, { w: W, h: H, rem }] = useSize<HTMLDivElement>();
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

  // 4 px at 1440 wide, about 6 px at 2560.
  const vw = typeof window === "undefined" ? 1440 : window.innerWidth;
  const swTotal = hero ? Math.max(3.5, 4 + ((vw - 1440) * 2) / 1120) : 3.25 * (rem / 16);
  const swBase = hero ? swTotal * 0.85 : 2.5 * (rem / 16);
  const fs = hero ? Math.max(18, Math.min(30, vw / 72)) : 0.8125 * rem;
  const fsAxis = hero ? Math.max(16, Math.min(26, vw / 80)) : 0.75 * rem;

  // ---- geometry (px)
  const k = rem / 16;
  const halo = ground ?? P.card;
  const padT = rem * 2.4;
  const padB = rem * 2.9;
  const padL = rem * 0.25;
  const padR = hero ? fsAxis * 4 : rem * 3.6;
  // The window starts where the history starts (at most PAST hours back), so the curve fills the width.
  const firstT = hist.length ? hist[0].t : view - PAST;
  const past = Math.min(PAST, Math.max(2, view - firstT + 0.25));
  const tL = view - past;
  const tR = view + FUTURE;
  const pw = Math.max(1, W - padL - padR);
  const ph = Math.max(1, H - padT - padB);
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

  // Stroke weights scale with the projector.

  // Signals that went out, clustered (one per half hour); the newest one is named on the axis.
  const seen: number[] = [];
  const pins = marks.filter((m) => {
    if (m.t < tL || m.t > view + 0.05) return false;
    if (seen.some((t) => Math.abs(t - m.t) < 0.5)) return false;
    seen.push(m.t);
    return true;
  });
  const latest = pins[pins.length - 1];

  const yStep = niceStep(hi - lo, hero ? 4 : 3);
  const yTicks: number[] = [];
  for (let v = Math.ceil(lo / yStep) * yStep; v <= hi; v += yStep) yTicks.push(Math.round(v * 1000) / 1000);
  const tStep = pw / (past + FUTURE) > fsAxis * 4.5 ? 1 : 2;
  const tTicks: number[] = [];
  for (let t = Math.ceil(tL / tStep) * tStep; t <= tR; t += tStep) if (x(t) > padL + fsAxis * 1.6 && x(t) < padL + pw - fsAxis * 1.6) tTicks.push(t);

  const nowX = x(view);
  const endX = shown.length ? x(shown[shown.length - 1].t) : nowX;
  const baseAbove = headBase != null && headTot != null && y(headBase) < y(headTot);
  const clipId = `over-${node.replace(/[^a-z0-9]/gi, "")}-${variant}`;
  const kwFmt = (v: number) => fmtNum(Math.round(v) || 0);

  // Header: the gap as the one big number, else the load itself.
  const gapKw = big.kw ?? (big.peak || null);
  const headLine =
    gapKw != null ? (
      <>
        <div className={`${hero ? "t-hero" : "text-[2.5rem] leading-none font-semibold tracking-[-0.03em]"} flex items-baseline gap-2`} style={{ color: P.green, letterSpacing: "-0.03em" }}>
          <Counter value={-gapKw} />
          <span style={{ fontSize: "0.5em", letterSpacing: "-0.01em" }}>kW</span>
        </div>
        <div className={hero ? "t-headline mt-1" : "t-title mt-1"} style={{ color: P.ink }}>
          {big.kw != null ? "kept off the street right now" : `kept off the street at ${hhmm(big.peakH ?? s.sim_hour)}`}
        </div>
      </>
    ) : (
      <>
        <div className={`${hero ? "t-hero" : "text-[2.5rem] leading-none font-semibold"} flex items-baseline gap-2`} style={{ color: over ? P.red : P.ink, letterSpacing: "-0.03em" }}>
          <Counter value={kw == null ? null : Math.abs(kw)} />
          <span style={{ fontSize: "0.5em", letterSpacing: "-0.01em" }}>kW</span>
        </div>
        <div className={hero ? "t-headline mt-1" : "t-title mt-1"} style={{ color: P.ink }}>
          {kw == null ? "waiting for the first reading" : kw < 0 ? "flowing back from the street now" : over ? "over the limit now" : "on this transformer now, inside the limit"}
        </div>
      </>
    );

  return (
    <div
      className={`flex min-h-0 flex-col ${hero ? "" : "panel p-5"}`}
      style={{ height: height ?? (hero ? "100%" : "22rem") }}
    >
      {header && (
        <header className={hero ? "mb-4 flex flex-wrap items-end justify-between gap-x-8 gap-y-2" : "mb-2 flex flex-col-reverse gap-2"}>
          <div className="min-w-0">{headLine}</div>
          {tn && (
            <div className={hero ? "text-right" : ""}>
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
      <div ref={plot} className="relative min-h-0 flex-1">
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

            {/* scale: faint grid lines, kW on the right */}
            {yTicks.map((v) => (
              <g key={`y${v}`}>
                <line x1={padL} x2={padL + pw} y1={y(v)} y2={y(v)} stroke={P.ink} strokeOpacity={v === 0 ? 0.16 : 0.06} strokeWidth={1} />
                <text x={padL + pw + rem * 0.6} y={y(v)} dy="0.35em" fontSize={fsAxis} fill={P.secondary} style={{ fontVariantNumeric: "tabular-nums" }}>
                  {kwFmt(v)}
                  {v === yTicks[yTicks.length - 1] ? " kW" : ""}
                </text>
              </g>
            ))}
            {tTicks.map((t) => (
              <text key={`t${t}`} x={x(t)} y={H - padB + fsAxis * 1.6} textAnchor="middle" fontSize={fsAxis} fill={P.secondary} style={{ fontVariantNumeric: "tabular-nums" }}>
                {hhmm(t)}
              </text>
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
                return v == null ? null : (
                  <circle key={m.key} cx={x(m.t)} cy={y(v)} r={swTotal * 1.25} fill={P.blue} stroke="#fff" strokeWidth={swTotal * 0.6} />
                );
              })}
            </g>

            {/* the limit in the flow direction, named at the right end above the line */}
            {rating != null && showImp && (
              <g>
                <line x1={padL} x2={padL + pw} y1={y(rating)} y2={y(rating)} stroke={P.red} strokeWidth={hero ? 3 : 2 * k} />
                <text x={padL + rem * 0.3} y={y(rating) - fs * 0.45} fontSize={fs} fontWeight={600} fill={P.red} stroke={halo} strokeWidth={rem * 0.3} paintOrder="stroke">
                  Limit {kwFmt(rating)} kW
                </text>
              </g>
            )}
            {showRev && (
              <g>
                <line x1={padL} x2={padL + pw} y1={y(-(reverse as number))} y2={y(-(reverse as number))} stroke={P.red} strokeWidth={hero ? 3 : 2 * k} />
                <text x={padL + rem * 0.3} y={y(-(reverse as number)) - fs * 0.45} fontSize={fs} fontWeight={600} fill={P.red} stroke={halo} strokeWidth={rem * 0.3} paintOrder="stroke">
                  Limit {kwFmt(reverse as number)} kW flowing back
                </text>
              </g>
            )}

            {/* the head of the line: a ring pulses each time a new reading lands */}
            {headTot != null && shown.length > 1 && (
              <g>
                <circle key={`pulse-${last?.t ?? 0}`} cx={x(head)} cy={y(headTot)} r={swTotal * 1.4} fill="none" stroke={P.blue} strokeWidth={swTotal * 0.5}>
                  <animate attributeName="r" from={swTotal * 1.4} to={swTotal * 5} dur="1.4s" repeatCount="1" fill="freeze" />
                  <animate attributeName="stroke-opacity" from="0.6" to="0" dur="1.4s" repeatCount="1" fill="freeze" />
                </circle>
                <circle cx={x(head)} cy={y(headTot)} r={swTotal * 1.4} fill={P.blue} stroke={halo} strokeWidth={swTotal * 0.5} />
              </g>
            )}

            {/* now */}
            <line x1={nowX} x2={nowX} y1={padT - rem * 0.9} y2={H - padB} stroke={P.ink} strokeOpacity={0.22} strokeWidth={1.25 * k} />
            <text x={nowX + rem * 0.45} y={padT - rem * 0.9} dy="0.8em" fontSize={fs} fontWeight={600} fill={P.ink}>
              Now <tspan fontWeight={400} fill={P.secondary} style={{ fontVariantNumeric: "tabular-nums" }}>{hhmm(view)}</tspan>
            </text>
            {fcPts.length > 1 && nowX + rem * 6 < padL + pw && (
              <text x={padL + pw - rem * 0.2} y={padT - rem * 0.9} dy="0.8em" textAnchor="end" fontSize={fsAxis} fill={P.tertiary}>
                Forecast
              </text>
            )}

            {/* newest signal, named on the top row (ends left of its line so it never meets "Now") */}
            {latest && (() => {
              const mx = x(latest.t);
              const label = `Gridzilla acted ${hhmm(latest.t)}`;
              const wEst = label.length * fs * 0.52;
              const left = mx - rem * 0.45 - wEst > padL;
              const v = at(hist, latest.t, "total");
              return (
                <g>
                  <line x1={mx} x2={mx} y1={padT - rem * 0.9} y2={v == null ? H - padB : y(v)} stroke={P.ink} strokeOpacity={0.35} strokeWidth={1.25 * k} strokeDasharray={`${2 * k} ${3 * k}`} />
                  <text x={left ? mx - rem * 0.45 : mx + rem * 0.45} y={padT - rem * 0.9} dy="0.8em" textAnchor={left ? "end" : "start"} fontSize={fs} fontWeight={600} fill={P.ink}>
                    {label}
                  </text>
                </g>
              );
            })()}

            {/* the gap at the head, and direct labels in the open space right of the newest reading (outer line's label outward) */}
            {headTot != null && shown.length > 1 && (() => {
              const yT = y(headTot);
              const yB = headBase != null && basePts.length > 1 ? y(headBase) : null;
              const apart = yB != null && Math.abs(yB - yT) > fs * 1.2;
              const room = padL + pw - endX > fs * 9;
              const lx = room ? endX + rem * 0.6 : endX - rem * 0.6;
              const lab = (text: string, yy: number, fill: string) => (
                <text x={lx} y={yy} dy="0.35em" textAnchor={room ? "start" : "end"} fontSize={fs} fontWeight={600} fill={fill} stroke={halo} strokeWidth={rem * 0.3} paintOrder="stroke">
                  {text}
                </text>
              );
              return (
                <g>
                  {yB != null && headBase != null && Math.abs(yB - yT) > swTotal * 2 && shaving({ t: head, total: headTot, base: headBase, program: 0, other: 0 }) && (
                    <line x1={endX} x2={endX} y1={yB} y2={yT} stroke={P.green} strokeWidth={swTotal * 0.9} strokeLinecap="round" />
                  )}
                  {apart && yB != null ? (
                    <>
                      {lab("Without Gridzilla", yB + (baseAbove ? -fs * 0.6 - swBase : fs * 0.6 + swBase), P.secondary)}
                      {lab("With Gridzilla", yT + (baseAbove ? fs * 0.9 + swTotal : -fs * 0.9 - swTotal), P.blue)}
                    </>
                  ) : (
                    lab(hasBase ? "With Gridzilla" : "Load", yT - fs * 0.9 - swTotal, P.blue)
                  )}
                </g>
              );
            })()}

            {!shown.length && (
              <text x={padL + pw / 2} y={padT + ph / 2} textAnchor="middle" fontSize={fs} fill={P.secondary}>
                {tn ? `Waiting for the first readings from ${nice(node)}` : "Waiting for the grid to report a street transformer"}
              </text>
            )}
          </svg>
        )}
      </div>
    </div>
  );
}
