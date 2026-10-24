// The hero curve: one street transformer's load over the last hours and the forecast ahead, its limit in both
// directions, the share Gridzilla can steer, and teal pins where a signal went out, so the room can watch the hill
// get flattened after Gridzilla acts.
//
// Drawing: hand-rolled SVG. Paths live in data space (hours, kW) inside one group whose CSS transform maps them to
// pixels; when "now" moves, only that transform changes and glides with a CSS transition, so a 3 s poll never
// redraws or flickers the curve.
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { History, State } from "../api";
import { COLORS, MODE_WORDS, hhmm, loadColor, loadPct, nice, pathOf } from "../model";
import { Ticker } from "./ui";
import { bandPath, linePath, niceStep, signalMarks, unwrapForecast, unwrapHistory, type Mark } from "./curve/series";

const FUTURE_H = 3;

/** Continuous sim clock: s.sim_hour wraps at 24, this keeps counting. `anchor` is the zero of the path data and only
 *  moves on a big jump; `snap` says "move without animation" (first frame, restart, anchor reset). */
function useClock(raw: number) {
  const ref = useRef<{ raw: number; t: number; anchor: number; snap: boolean } | null>(null);
  const prev = ref.current;
  if (!prev) ref.current = { raw, t: raw, anchor: raw, snap: true };
  else if (prev.raw !== raw) {
    let d = (((raw - prev.raw) % 24) + 24) % 24;
    if (d > 12) d -= 24;
    const t = prev.t + d;
    const reset = Math.abs(t - prev.anchor) > 36;
    ref.current = { raw, t, anchor: reset ? t : prev.anchor, snap: reset || Math.abs(d) > 1 };
  }
  return ref.current!;
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0, rem: 14 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 14;
      setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height), rem });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

function status(pct: number | null, kw: number | null) {
  if (pct == null || kw == null) return "No reading yet";
  const p = Math.abs(pct);
  if (p >= 100) return kw < 0 ? "Too much power flowing back" : "Over the limit";
  if (p >= 85) return kw < 0 ? "Close to the limit for power flowing back" : "Close to the limit";
  return kw < 0 ? "Power flowing back, inside the limit" : "Inside the limit";
}

export default function HeroCurve({ s, history, node }: { s: State; history: History | null; node: string }) {
  const clock = useClock(s.sim_hour);
  const [panel, { w: panelW, h: panelH }] = useSize<HTMLDivElement>();
  const compact = panelH > 0 && (panelH < 460 || panelW < 560);
  const tn = node && s.tree[node] ? s.tree[node] : null;

  if (!tn)
    return (
      <div className="panel flex h-full min-h-0 flex-col items-center justify-center gap-2 p-5 text-center">
        <div className="text-[1.1rem] font-semibold">Street transformer load</div>
        <div className="text-dim">Waiting for the grid to report its first street transformer...</div>
      </div>
    );

  const agg = s.aggregates[node];
  const kw = agg?.total_kw ?? null;
  const pct = loadPct(s, node, kw);
  const col = loadColor(pct);
  const rating = tn.rating_kw ?? null;
  const reverse = rating != null ? tn.reverse_kw ?? rating : null;
  const steer = agg?.program_kw ?? null;
  const acting = pathOf(s, node)
    .map((n) => s.active[n])
    .filter(Boolean)
    .pop();

  const name = nice(node);
  const steerLine =
    !acting && steer != null && steer > 0.5 ? (
      <span className="truncate text-[0.9rem] text-signal">
        Gridzilla can steer <span className="num font-semibold">{Math.round(steer).toLocaleString("en-US")} kW</span> of this
      </span>
    ) : null;
  const actingChip = acting ? (
    <span className="inline-flex min-w-0 items-center gap-2 rounded-full bg-signal/12 px-2.5 py-1 text-[0.8rem] font-medium text-signal shadow-[inset_0_0_0_1px_rgb(51_225_201/0.35)]">
      <span className="live-dot shrink-0 text-signal" />
      <span className="truncate">Gridzilla is acting: {MODE_WORDS[acting.mode]?.title ?? acting.mode}</span>
    </span>
  ) : null;
  const pctChip =
    pct != null ? (
      <span className="num whitespace-nowrap rounded-full px-2.5 py-0.5 text-[0.86rem] font-semibold" style={{ color: col, background: `${col}1f`, boxShadow: `inset 0 0 0 1px ${col}55` }}>
        {Math.abs(pct)} % of limit
      </span>
    ) : null;

  return (
    <div ref={panel} className="panel flex h-full min-h-0 flex-col p-4 sm:p-5">
      {compact ? (
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[0.86rem] font-medium text-dim">Street transformer load</div>
            <div className="flex min-w-0 items-center gap-3">
              <span className="truncate text-[1.3rem] font-semibold leading-tight tracking-[-0.02em]">{name}</span>
              {actingChip ?? (panelW > 520 ? steerLine : null)}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <div className="num flex items-baseline gap-1 leading-none" style={{ color: kw == null ? undefined : col }}>
              <Ticker value={kw == null ? null : Math.round(kw)} className="text-[1.9rem] font-semibold" />
              <span className="text-[0.9rem] font-medium text-dim">kW</span>
            </div>
            {pctChip}
          </div>
        </header>
      ) : (
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[0.9rem] font-medium text-dim">Street transformer load</div>
            <div className="mt-0.5 truncate text-[1.6rem] font-semibold leading-tight tracking-[-0.02em]">{name}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              {actingChip ?? steerLine}
              {rating != null && <span className="tech hidden md:inline">{node} · limit {rating.toLocaleString("en-US")} kW each way</span>}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="num flex items-baseline justify-end gap-1.5 leading-none" style={{ color: kw == null ? undefined : col }}>
              <Ticker value={kw == null ? null : Math.round(kw)} className="text-[2.6rem] font-semibold" />
              <span className="text-[1rem] font-medium text-dim">kW</span>
            </div>
            <div className="mt-1.5 flex justify-end">{pctChip}</div>
            <div className="mt-1 text-[0.9rem] text-dim">{status(pct, kw)}</div>
          </div>
        </header>
      )}
      <Chart s={s} history={history} node={node} clock={clock} rating={rating} reverse={reverse} liveColor={col} compact={compact} />
    </div>
  );
}

function Chart({
  s, history, node, clock, rating, reverse, liveColor, compact,
}: {
  s: State;
  history: History | null;
  node: string;
  clock: { t: number; anchor: number; snap: boolean };
  rating: number | null;
  reverse: number | null;
  liveColor: string;
  compact: boolean;
}) {
  const [box, { w, h, rem }] = useSize<HTMLDivElement>();
  const reduce = useReducedMotion();
  const id = useMemo(() => `hc${Math.random().toString(36).slice(2, 8)}`, []);
  const { t: tNow, anchor: A, snap } = clock;
  const narrow = w > 0 && w < 560;

  const hist = useMemo(() => unwrapHistory(history, node, tNow, s.sim_hour), [history, node, tNow, s.sim_hour]);
  const fc = useMemo(() => unwrapForecast(s, node, tNow), [s, node, tNow]);
  const marks = useMemo(() => signalMarks(s, node, tNow), [s, node, tNow]);

  const span = hist.length ? tNow - hist[0].t : 0;
  const past = narrow ? (span < 2.5 ? 3 : 6) : span < 2.5 ? 3 : span < 5.5 ? 6 : 9;
  const shown = hist.filter((p) => p.t >= tNow - past - 0.5);

  // Geometry
  const fs = 0.9 * rem; // axis text in px
  const M = { l: Math.round(fs * 4.2), r: 12, t: Math.round(fs * 0.8), b: Math.round(fs * 2.3) };
  const pw = Math.max(10, w - M.l - M.r);
  const ph = Math.max(10, h - M.t - M.b);
  const right = M.l + pw;
  const bottom = M.t + ph;
  const pph = pw / (past + FUTURE_H);
  const nowX = M.l + past * pph;

  // Y domain: always show both limits, grow to fit the data, round to a tick step so it rarely moves.
  const vals: number[] = [0];
  shown.forEach((p) => vals.push(p.total, p.other));
  fc.forEach((p) => vals.push(p.total));
  let hi = Math.max(...vals) * 1.06;
  let lo = Math.min(...vals) * 1.06;
  if (rating != null) hi = Math.max(hi, rating * 1.22);
  if (reverse != null) lo = Math.min(lo, -reverse * 1.22);
  if (hi - lo < 1) hi = lo + 10;
  const step = niceStep(hi - lo, Math.max(1.5, Math.min(6, ph / (fs * 4))));
  const q = step / 4; // domain rounds to a quarter step: stable between polls without wasting space
  const yMax = Math.ceil(hi / q) * q;
  const yMin = Math.floor(lo / q) * q;
  const k = ph / (yMax - yMin);
  const yPx = (v: number) => M.t + (yMax - v) * k;
  const tx = nowX - (tNow - A) * pph;

  // Only the horizontal glide is animated (a pure translate stays crisp); y changes are rare and snap.
  const tr = reduce || snap ? "none" : "transform 3s linear";
  const xStyle = { transform: `translate(${tx}px, 0px)`, transition: tr };
  const yStyle = (v: number) => ({ transform: `translateY(${yPx(v)}px)` });
  const xy = (t: number, v: number): [number, number] => [(t - A) * pph, yPx(v)];
  const y0 = yPx(0);

  // Paths in pixels, x relative to the anchor (the gliding group adds tx)
  const P = (() => {
    const last = hist[hist.length - 1];
    const fcLine = last && fc.length ? [{ t: last.t, v: last.total }, ...fc.filter((p) => p.t > last.t).map((p) => ({ t: p.t, v: p.total }))] : fc.map((p) => ({ t: p.t, v: p.total }));
    return {
      other: bandPath(hist.map((p) => ({ t: p.t, lo: 0, hi: p.other })), xy),
      prog: bandPath(hist.map((p) => ({ t: p.t, lo: p.other, hi: p.total })), xy),
      otherLine: linePath(hist.map((p) => ({ t: p.t, v: p.other })), xy),
      total: linePath(hist.map((p) => ({ t: p.t, v: p.total })), xy),
      fc: linePath(fcLine, xy),
    };
  })();

  // Y ticks
  const yTicks: number[] = [];
  for (let v = Math.ceil(yMin / step) * step; v <= yMax + 1e-6; v += step) yTicks.push(Math.round(v * 100) / 100);
  const topTick = yTicks[yTicks.length - 1];

  // X ticks (hh:mm), in the gliding group
  const xStep = [0.5, 1, 2, 3, 4, 6].find((st) => st * pph >= fs * 5.6) ?? 6;
  const xTicks: number[] = [];
  for (let t = Math.floor((tNow - past - xStep) / xStep) * xStep; t <= tNow + FUTURE_H + xStep; t += xStep) {
    if (Math.abs((t - tNow) * pph) > fs * 5.8) xTicks.push(t);
  }

  // Pins: newest first, a flag label only where it fits
  const flagH = Math.round(fs * 1.7);
  const pinMarks = marks.filter((m) => m.t >= tNow - past - 1 && m.t <= tNow + 0.1);
  const flags = new Map<string, { side: 1 | -1; w: number }>();
  let fence = Infinity;
  [...pinMarks].reverse().forEach((m) => {
    const x = nowX + (m.t - tNow) * pph;
    const label = MODE_WORDS[m.mode]?.title ?? m.mode;
    const fw = label.length * fs * 0.6 + fs * 1.6;
    const side: 1 | -1 = x + 6 + fw > right ? -1 : 1;
    const x0 = side === 1 ? x : x - fw - 6;
    const x1 = side === 1 ? x + fw + 6 : x;
    if (x1 < fence - 6 && x0 > M.l - 4) {
      flags.set(m.key, { side, w: fw });
      fence = x0;
    }
  });

  const last = hist[hist.length - 1];
  const ready = w > 0 && h > 0;
  const fmtK = (v: number) => (Math.abs(v) >= 1000 ? v.toLocaleString("en-US") : String(v)) + (v === topTick ? " kW" : "");

  return (
    <>
    <div className={`relative min-h-0 flex-1 ${compact ? "mt-2" : "mt-4"}`}>
      <div ref={box} className="absolute inset-0">
        {ready && (
          <svg width={w} height={h} className="block select-none" role="img" aria-label={`Load on ${nice(node)} over time, with its limits and forecast`}>
            <defs>
              <clipPath id={`${id}-plot`}>
                <rect x={M.l} y={M.t} width={pw} height={ph} />
              </clipPath>
              <clipPath id={`${id}-lane`}>
                <rect x={M.l} y={M.t} width={pw} height={ph} />
              </clipPath>
              {/* data space: y = -kW */}
              <clipPath id={`${id}-pos`}>
                <rect x={-1e6} y={-1e5} width={2e6} height={1e5 + y0} />
              </clipPath>
              <clipPath id={`${id}-neg`}>
                <rect x={-1e6} y={y0} width={2e6} height={1e5} />
              </clipPath>
              <clipPath id={`${id}-over`}>
                {rating != null && <rect x={-1e6} y={-1e5} width={2e6} height={1e5 + yPx(rating)} />}
                {reverse != null && <rect x={-1e6} y={yPx(-reverse)} width={2e6} height={1e5} />}
                {rating == null && <rect x={0} y={0} width={0} height={0} />}
              </clipPath>
              <linearGradient id={`${id}-zu`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={-fs * 7}>
                <stop offset="0" stopColor={COLORS.crit} stopOpacity="0.17" />
                <stop offset="1" stopColor={COLORS.crit} stopOpacity="0.02" />
              </linearGradient>
              <linearGradient id={`${id}-zd`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={fs * 7}>
                <stop offset="0" stopColor={COLORS.crit} stopOpacity="0.17" />
                <stop offset="1" stopColor={COLORS.crit} stopOpacity="0.02" />
              </linearGradient>
              <linearGradient id={`${id}-fade`} x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor="white" stopOpacity="0" />
                <stop offset="0.035" stopColor="white" stopOpacity="1" />
                <stop offset="0.965" stopColor="white" stopOpacity="1" />
                <stop offset="1" stopColor="white" stopOpacity="0" />
              </linearGradient>
              <mask id={`${id}-xmask`} maskUnits="userSpaceOnUse" x={M.l - 30} y={bottom} width={pw + 60} height={M.b}>
                <rect x={M.l - 30} y={bottom} width={pw + 60} height={M.b} fill={`url(#${id}-fade)`} />
              </mask>
            </defs>

            {/* forecast region */}
            <rect x={nowX} y={M.t} width={Math.max(0, right - nowX)} height={ph} fill="rgb(255 255 255 / 0.028)" />
            <text x={right - 10} y={M.t + fs * 1.5} textAnchor="end" fill="#8a97ab" style={{ fontSize: fs, fontWeight: 500 }}>
              Forecast
            </text>

            {/* grid + y labels */}
            {yTicks.map((v) => (
              <g key={`y${v}`} style={yStyle(v)}>
                <line x1={M.l} x2={right} y1={0} y2={0} stroke="white" strokeOpacity={v === 0 ? 0.16 : 0.045} strokeWidth={1} />
                <text x={M.l - 10} y={fs * 0.35} textAnchor="end" fill={v === 0 ? "#b4bfce" : "#8a97ab"} className="num" style={{ fontSize: fs }}>
                  {fmtK(v)}
                </text>
              </g>
            ))}

            {/* overload zones beyond the limits */}
            <g clipPath={`url(#${id}-plot)`}>
              {rating != null && (
                <g style={yStyle(rating)}>
                  <rect x={M.l} y={-4000} width={pw} height={4000} fill={COLORS.crit} fillOpacity={0.035} />
                  <rect x={M.l} y={-fs * 7} width={pw} height={fs * 7} fill={`url(#${id}-zu)`} />
                </g>
              )}
              {reverse != null && (
                <g style={yStyle(-reverse)}>
                  <rect x={M.l} y={0} width={pw} height={4000} fill={COLORS.crit} fillOpacity={0.035} />
                  <rect x={M.l} y={0} width={pw} height={fs * 7} fill={`url(#${id}-zd)`} />
                </g>
              )}
            </g>

            {/* signal ribbons (behind the curve) */}
            <g clipPath={`url(#${id}-plot)`}>
              <g style={xStyle}>
                {pinMarks
                  .filter((m) => m.durH > 0)
                  .map((m) => (
                    <g key={`r${m.key}`}>
                      <rect x={(m.t - A) * pph} y={M.t} width={m.durH * pph} height={ph} fill={COLORS.signal} fillOpacity={0.055} />
                      <rect x={(m.t - A) * pph} y={M.t} width={m.durH * pph} height={3} fill={COLORS.signal} fillOpacity={0.75} />
                    </g>
                  ))}
              </g>
            </g>

            {/* the curve */}
            <g clipPath={`url(#${id}-plot)`}>
              <g style={xStyle}>
                <path d={P.other} fill={COLORS.take} fillOpacity={0.16} clipPath={`url(#${id}-pos)`} />
                <path d={P.other} fill={COLORS.give} fillOpacity={0.2} clipPath={`url(#${id}-neg)`} />
                <path d={P.prog} fill={COLORS.signal} fillOpacity={0.26} />
                <path d={P.otherLine} fill="none" stroke={COLORS.take} strokeOpacity={0.55} strokeWidth={1.2} clipPath={`url(#${id}-pos)`} />
                <path d={P.otherLine} fill="none" stroke={COLORS.give} strokeOpacity={0.7} strokeWidth={1.2} clipPath={`url(#${id}-neg)`} />
                <path d={P.fc} fill="none" stroke="#c9d4e2" strokeOpacity={0.6} strokeWidth={2.2} strokeDasharray="7 7" strokeLinecap="round" />
                <path d={P.fc} fill="none" stroke={COLORS.crit} strokeOpacity={0.85} strokeWidth={2.2} strokeDasharray="7 7" strokeLinecap="round" clipPath={`url(#${id}-over)`} />
              </g>
              <g style={{ filter: "drop-shadow(0 0 6px rgb(238 243 249 / 0.35))" }}>
                <g style={xStyle}>
                  <path d={P.total} fill="none" stroke="#eef3f9" strokeWidth={3.2} strokeLinejoin="round" strokeLinecap="round" />
                </g>
              </g>
              <g style={{ filter: "drop-shadow(0 0 8px rgb(255 77 94 / 0.7))" }}>
                <g style={xStyle}>
                  <path d={P.total} fill="none" stroke={COLORS.crit} strokeWidth={3.4} strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#${id}-over)`} />
                </g>
              </g>
            </g>

            {/* limit lines, labelled */}
            {rating != null && (
              <g style={yStyle(rating)}>
                <line x1={M.l} x2={right} y1={0} y2={0} stroke={COLORS.crit} strokeOpacity={0.9} strokeWidth={1.6} />
                <text x={M.l + 10} y={-fs * 0.6} fill="#ff8a95" stroke="#0b111a" strokeWidth={4} paintOrder="stroke" strokeLinejoin="round" style={{ fontSize: fs * 1.02, fontWeight: 600 }}>
                  Limit {rating.toLocaleString("en-US")} kW
                </text>
              </g>
            )}
            {reverse != null && (
              <g style={yStyle(-reverse)}>
                <line x1={M.l} x2={right} y1={0} y2={0} stroke={COLORS.crit} strokeOpacity={0.9} strokeWidth={1.6} />
                <text x={M.l + 10} y={fs * 1.45} fill="#ff8a95" stroke="#0b111a" strokeWidth={4} paintOrder="stroke" strokeLinejoin="round" style={{ fontSize: fs * 1.02, fontWeight: 600 }}>
                  {narrow ? "Limit, flowing back" : "Limit for power flowing back"}
                </text>
              </g>
            )}

            {/* now */}
            <line x1={nowX} x2={nowX} y1={M.t} y2={bottom} stroke="#eef3f9" strokeOpacity={0.5} strokeWidth={1.4} />
            {last && (
              <g style={{ transform: `translate(${nowX}px, ${yPx(last.total)}px)`, transition: reduce || snap ? "none" : "transform 1.2s cubic-bezier(0.16,1,0.3,1)" }}>
                {!reduce && (
                  <motion.circle r={7} fill={liveColor} initial={{ opacity: 0.5, scale: 1 }} animate={{ opacity: 0, scale: 2.4 }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }} />
                )}
                <circle r={5.5} fill={liveColor} stroke="#05080d" strokeWidth={2} />
              </g>
            )}

            {/* x axis: gliding hh:mm ticks with a fixed "Now" pill */}
            <g mask={`url(#${id}-xmask)`}>
              <g style={xStyle}>
                {xTicks.map((t) => (
                  <text key={`x${t}`} x={(t - A) * pph} y={bottom + fs * 1.65} textAnchor="middle" fill="#8a97ab" className="num" style={{ fontSize: fs }}>
                    {hhmm(t)}
                  </text>
                ))}
              </g>
            </g>
            <g transform={`translate(${nowX}, ${bottom + fs * 1.15})`}>
              <rect x={-fs * 3.4} y={-fs * 0.85} width={fs * 6.8} height={fs * 1.7} rx={fs * 0.85} fill="#eef3f9" />
              <text y={fs * 0.36} textAnchor="middle" fill="#05080d" className="num" style={{ fontSize: fs, fontWeight: 650 }}>
                Now {hhmm(s.sim_hour)}
              </text>
            </g>

            {/* signal pins */}
            <g clipPath={`url(#${id}-lane)`}>
              <g style={xStyle}>
                {pinMarks.map((m) => (
                  <Pin key={m.key} m={m} x={(m.t - A) * pph} top={M.t} bottom={bottom} fs={fs} flagH={flagH} flag={flags.get(m.key)} reduce={!!reduce} />
                ))}
              </g>
            </g>
          </svg>
        )}
        {ready && hist.length < 2 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" style={{ paddingLeft: M.l, paddingRight: M.r, paddingTop: M.t, paddingBottom: M.b }}>
            <div className="flex items-center gap-2.5 rounded-full bg-deck-2/90 px-4 py-2 text-[0.9rem] text-dim shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06),0_10px_30px_-10px_rgb(0_0_0/0.8)]">
              <span className="live-dot text-signal" />
              Collecting the first minutes of data...
            </div>
          </div>
        )}
      </div>
    </div>
    <Legend narrow={narrow || compact} hasLimit={rating != null} />
    </>
  );
}

function Pin({
  m, x, top, bottom, fs, flagH, flag, reduce,
}: {
  m: Mark;
  x: number;
  top: number;
  bottom: number;
  fs: number;
  flagH: number;
  flag?: { side: 1 | -1; w: number };
  reduce: boolean;
}) {
  const label = MODE_WORDS[m.mode]?.title ?? m.mode;
  const fy = top + 8;
  return (
    <motion.g
      initial={reduce ? false : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
    >
      <title>{`${m.by === "ai" ? "Autopilot" : "Operator"} sent "${label}" at ${hhmm(m.t)}${m.seq != null ? ` (signal ${m.seq})` : ""}`}</title>
      <line x1={x} x2={x} y1={fy + flagH} y2={bottom} stroke={COLORS.signal} strokeOpacity={0.55} strokeWidth={1.4} strokeDasharray="3 4" />
      {flag && (
        <g transform={`translate(${flag.side === 1 ? x + 6 : x - 6 - flag.w}, ${fy})`}>
          <rect width={flag.w} height={flagH} rx={flagH / 2} fill="#0d2a2a" stroke={COLORS.signal} strokeOpacity={0.6} strokeWidth={1} />
          <text x={flag.w / 2} y={flagH / 2 + fs * 0.36} textAnchor="middle" fill={COLORS.signal} style={{ fontSize: fs, fontWeight: 600 }}>
            {label}
          </text>
        </g>
      )}
      <circle cx={x} cy={fy + flagH / 2} r={4.5} fill={COLORS.signal} style={{ filter: "drop-shadow(0 0 5px rgb(51 225 201 / 0.9))" }} />
    </motion.g>
  );
}

function Legend({ narrow, hasLimit }: { narrow: boolean; hasLimit: boolean }) {
  const item = "inline-flex items-center gap-2 whitespace-nowrap";
  const block = (c: string, o: number) => <span className="h-3 w-4 rounded-[3px]" style={{ background: c, opacity: o }} />;
  return (
    <div className={`mt-2 flex items-center gap-x-5 gap-y-1.5 text-[0.86rem] text-dim ${narrow ? "h-[1.3rem] flex-wrap overflow-hidden" : "flex-wrap"}`}>
      <span className={item}>
        <span className="h-[3px] w-5 rounded-full bg-fg shadow-[0_0_6px_rgb(238_243_249/0.5)]" />
        Total load
      </span>
      <span className={item}>
        {block(COLORS.signal, 0.55)}
        Houses Gridzilla can steer
      </span>
      <span className={item}>
        <span className="flex h-3 w-4 overflow-hidden rounded-[3px] opacity-60">
          <span className="w-1/2" style={{ background: COLORS.take }} />
          <span className="w-1/2" style={{ background: COLORS.give }} />
        </span>
        Other houses
      </span>
      <span className={item}>
        <span className="w-5 border-t-2 border-dashed border-[#c9d4e2]/70" />
        Forecast
      </span>
      {!narrow && (
        <span className={item}>
          <span className="h-2.5 w-2.5 rounded-full bg-signal shadow-[0_0_6px_rgb(51_225_201/0.9)]" />
          Gridzilla signal
        </span>
      )}
      {!narrow && hasLimit && (
        <span className={item}>
          {block(COLORS.crit, 0.5)}
          Over the limit
        </span>
      )}
    </div>
  );
}
