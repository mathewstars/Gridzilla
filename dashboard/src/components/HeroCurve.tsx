// The hero curve: one street transformer's load over the last hours and the forecast ahead, its limit in both
// directions, the share Gridzilla can steer, and small ink markers on the time axis where a signal went out, so the room
// can watch the hill get flattened after Gridzilla acts.
//
// Drawing: hand-rolled SVG in the Apple white system (DESIGN.md). Monochrome; red only for the part of the curve beyond a
// limit. Paths live in data space (hours, kW) inside one group whose transform maps them to pixels; when "now" moves,
// only that transform changes (0.25 s ease-out), so a 3 s poll never redraws or flickers the curve.
import { useEffect, useRef, useState } from "react";
import type { History, State } from "../api";
import { COLORS, MODE_WORDS, hhmm, loadPct, nice, pathOf } from "../model";
import { Badge, Ticker } from "./ui";
import { bandPath, linePath, markLabel, niceStep, signalMarks, unwrapForecast, unwrapHistory } from "./curve/series";

const FUTURE_H = 3;
const INK = COLORS.take;
const RED = COLORS.crit;
const TERTIARY = COLORS.muted;
const FILL = COLORS.fill;
const EASE = "transform 0.25s cubic-bezier(0,0,0.5,1)";

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

export default function HeroCurve({ s, history, node }: { s: State; history: History | null; node: string }) {
  const clock = useClock(s.sim_hour);
  const [panel, { w: panelW, h: panelH }] = useSize<HTMLDivElement>();
  const compact = panelH > 0 && (panelH < 440 || panelW < 520);
  const tn = node && s.tree[node] ? s.tree[node] : null;

  if (!tn)
    return (
      <div className="panel flex h-full min-h-0 flex-col items-center justify-center gap-1 p-6 text-center">
        <div className="t-title">Street transformer load</div>
        <div className="t-small">Waiting for the grid to report its first street transformer...</div>
      </div>
    );

  const agg = s.aggregates[node];
  const kw = agg?.total_kw ?? null;
  const pct = loadPct(s, node, kw);
  const over = pct != null && Math.abs(pct) >= 100;
  const rating = tn.rating_kw ?? null;
  const reverse = rating != null ? tn.reverse_kw ?? rating : null;
  const steer = agg?.program_kw ?? null;
  const acting = pathOf(s, node)
    .map((n) => s.active[n])
    .filter(Boolean)
    .pop();

  // One quiet line under the name: what Gridzilla is doing here, or how much of this load it could steer.
  const sub = acting ? (
    <span className="text-ink">Gridzilla is acting: {MODE_WORDS[acting.mode]?.title ?? acting.mode}</span>
  ) : steer != null && Math.abs(steer) > 0.5 ? (
    <span>
      Gridzilla can steer <span className="tabular-nums">{Math.round(Math.abs(steer)).toLocaleString("en-US")} kW</span> of this
    </span>
  ) : null;
  const pctLine =
    pct == null ? "No reading yet" : `${Math.abs(pct)} % of its limit${kw != null && kw < 0 ? ", flowing back" : ""}`;

  return (
    <div ref={panel} className={`panel flex h-full min-h-0 flex-col ${compact ? "px-5 pb-3 pt-4" : "px-6 pb-4 pt-5"}`}>
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="t-small">Street transformer load</span>
            {over && <Badge alert>Over the limit</Badge>}
          </div>
          <h2 className={`${compact ? "t-title" : "t-headline"} mt-0.5 text-ink`}>{nice(node)}</h2>
          {sub && <div className="t-small mt-0.5">{sub}</div>}
        </div>
        <div className="shrink-0 text-right">
          <div className="flex items-baseline justify-end gap-1.5" style={{ color: over ? RED : INK }}>
            <Ticker
              value={kw == null ? null : Math.round(kw)}
              className={compact ? "text-[2.25rem] font-semibold leading-none tracking-[-0.015em]" : "t-num leading-none"}
            />
            <span className={`${compact ? "text-[1.0625rem]" : "text-[1.3125rem]"} font-semibold tracking-[-0.01em] text-secondary`}>kW</span>
          </div>
          <div className="t-small mt-1 tabular-nums">{pctLine}</div>
        </div>
      </header>
      <Chart s={s} history={history} node={node} clock={clock} rating={rating} reverse={reverse} live={over ? RED : INK} compact={compact} />
    </div>
  );
}

function Chart({
  s, history, node, clock, rating, reverse, live, compact,
}: {
  s: State;
  history: History | null;
  node: string;
  clock: { t: number; anchor: number; snap: boolean };
  rating: number | null;
  reverse: number | null;
  live: string;
  compact: boolean;
}) {
  const [box, { w, h, rem }] = useSize<HTMLDivElement>();
  const { t: tNow, anchor: A, snap } = clock;
  const narrow = w > 0 && w < 520;

  const hist = unwrapHistory(history, node, tNow, s.sim_hour);
  const fc = unwrapForecast(s, node, tNow);
  const marks = signalMarks(s, node, tNow);

  const span = hist.length ? tNow - hist[0].t : 0;
  const past = narrow ? (span < 2.5 ? 3 : 6) : span < 2.5 ? 3 : span < 5.5 ? 6 : 9;
  const shown = hist.filter((p) => p.t >= tNow - past - 0.5);

  // Geometry: axis text a step above t-caption so it reads from the back of the room; same tertiary grey.
  const fs = 0.8125 * rem;
  const M = { l: 0, r: 4, t: Math.round(fs * 1.9), b: Math.round(fs * 1.9) };
  const ph = Math.max(10, h - M.t - M.b);
  const bottom = M.t + ph;

  // Y domain: always show both limits, grow to fit the data, round to a tick step so it rarely moves. Fixed pixel room
  // above the top limit (its label) and under the bottom one (the lane for signal markers).
  const vals: number[] = [0];
  shown.forEach((p) => vals.push(p.total, p.other, p.base ?? p.total));
  fc.forEach((p) => vals.push(p.total));
  let hi = Math.max(...vals) * 1.04;
  let lo = Math.min(...vals) * 1.04;
  if (rating != null) hi = Math.max(hi, rating);
  if (reverse != null) lo = Math.min(lo, -reverse);
  if (hi - lo < 1) hi = lo + 10;
  const step = niceStep(hi - lo, Math.max(1.5, Math.min(5, ph / (fs * 4.5))));
  const q = step / 4; // domain rounds to a quarter step: stable between polls without wasting space
  hi = Math.ceil(hi / q) * q;
  lo = Math.floor(lo / q) * q;
  const padT = fs * 1.6;
  const padB = fs * 2;
  const k = Math.max(1, ph - padT - padB) / (hi - lo);
  const yMax = hi + padT / k;
  const yMin = lo - padB / k;
  const yPx = (v: number) => M.t + padT + (hi - v) * k;

  // Y ticks: plain numbers, "kW" on the top one only. The left margin is as wide as the longest label, so none is cut.
  const yTicks: number[] = [];
  for (let v = Math.ceil(yMin / step) * step; v <= yMax + 1e-6; v += step) yTicks.push(Math.round(v * 100) / 100);
  const topTick = yTicks[yTicks.length - 1];
  const fmtK = (v: number) => (v < 0 ? "\u2212" : "") + Math.abs(v).toLocaleString("en-US") + (v === topTick ? " kW" : "");
  M.l = Math.ceil(Math.max(...yTicks.map((v) => fmtK(v).length)) * fs * 0.6 + fs * 0.9);
  const pw = Math.max(10, w - M.l - M.r);
  const right = M.l + pw;
  const pph = pw / (past + FUTURE_H);
  const nowX = M.l + past * pph;
  const tx = nowX - (tNow - A) * pph;
  const y0 = yPx(0);

  // Only the horizontal shift moves, as a short ease-out state change; y changes are rare and snap.
  const xStyle = { transform: `translate(${tx}px, 0px)`, transition: snap ? "none" : EASE };
  const xy = (t: number, v: number): [number, number] => [(t - A) * pph, yPx(v)];

  const last = hist[hist.length - 1];
  const fcLine = last && fc.length ? [{ t: last.t, v: last.total }, ...fc.filter((p) => p.t > last.t).map((p) => ({ t: p.t, v: p.total }))] : fc.map((p) => ({ t: p.t, v: p.total }));
  const P = {
    steer: bandPath(hist.map((p) => ({ t: p.t, lo: p.other, hi: p.total })), xy),
    total: linePath(hist.map((p) => ({ t: p.t, v: p.total })), xy),
    fc: linePath(fcLine, xy),
    base: linePath(hist.filter((p) => p.base != null).map((p) => ({ t: p.t, v: p.base! })), xy),
  };

  // Red belongs only where the curve (or the forecast) actually crosses a limit.
  const seen = [...shown.map((p) => p.total), ...fc.map((p) => p.total)];
  const overUp = rating != null && seen.some((v) => v >= rating);
  const overDown = reverse != null && seen.some((v) => v <= -reverse);


  // X ticks (hh:mm): only those whose label fits fully inside the card and stays clear of "now".
  const xStep = [0.5, 1, 2, 3, 4, 6].find((st) => st * pph >= fs * 5.5) ?? 6;
  const half = fs * 1.6;
  const xTicks: number[] = [];
  for (let t = Math.ceil((tNow - past) / xStep) * xStep; t <= tNow + FUTURE_H + 1e-6; t += xStep) {
    const x = nowX + (t - tNow) * pph;
    if (x - half >= 0 && x + half <= w) xTicks.push(t);
  }

  // Signal markers on the time axis, newest first; a label only where it fits without touching the next one.
  const pins = marks.filter((m) => m.t >= tNow - past - 0.25 && m.t <= tNow + 0.1);
  const labels = new Map<string, { side: 1 | -1 }>();
  let fence = right;
  [...pins].reverse().forEach((m) => {
    const x = nowX + (m.t - tNow) * pph;
    const lw = markLabel(m).length * fs * 0.52 + fs;
    const side: 1 | -1 = x + lw > fence - fs ? -1 : 1;
    const x0 = side === 1 ? x : x - lw;
    const x1 = side === 1 ? x + lw : x;
    if (x1 < fence - fs && x0 >= M.l) {
      labels.set(m.key, { side });
      fence = x0;
    }
  });

  // Direction words sit just right of "now" when the forecast side has room, else against the right edge.
  const dirLeft = right - nowX >= fs * 8;
  const dirX = dirLeft ? nowX + fs * 0.5 : right - fs * 0.4;
  const dirAnchor = dirLeft ? "start" : "end";

  const ready = w > 0 && h > 0;
  const halo = { stroke: "#fff", strokeWidth: 4, paintOrder: "stroke" as const, strokeLinejoin: "round" as const };
  const axisText = { fontSize: fs, fill: TERTIARY, fontVariantNumeric: "tabular-nums" as const };
  const plot = `hc-${node.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <>
      <div className={`relative min-h-0 flex-1 ${compact ? "mt-2" : "mt-3"}`}>
        <div ref={box} className="absolute inset-0">
          {ready && (
            <svg width={w} height={h} className="block select-none" role="img" aria-label={`Load on ${nice(node)} over time, with its limits and forecast`}>
              <defs>
                <clipPath id={`${plot}-plot`}>
                  <rect x={M.l} y={M.t} width={pw} height={ph} />
                </clipPath>
                <clipPath id={`${plot}-over`}>
                  {rating != null && <rect x={-1e6} y={-1e5} width={2e6} height={1e5 + yPx(rating)} />}
                  {reverse != null && <rect x={-1e6} y={yPx(-reverse)} width={2e6} height={1e5} />}
                  {rating == null && <rect x={0} y={0} width={0} height={0} />}
                </clipPath>
              </defs>

              {/* a very light flat red tint beyond a limit, only when the curve goes there */}
              {overUp && rating != null && <rect x={M.l} y={M.t} width={pw} height={Math.max(0, yPx(rating) - M.t)} fill={RED} fillOpacity={0.045} />}
              {overDown && reverse != null && <rect x={M.l} y={yPx(-reverse)} width={pw} height={Math.max(0, bottom - yPx(-reverse))} fill={RED} fillOpacity={0.045} />}

              {/* y labels and the zero line */}
              {yTicks.map((v) => (
                <text key={`y${v}`} x={M.l - fs * 0.7} y={yPx(v) + fs * 0.35} textAnchor="end" style={axisText}>
                  {fmtK(v)}
                </text>
              ))}
              <line x1={M.l} x2={right} y1={y0} y2={y0} stroke="#d2d2d7" strokeWidth={1} />

              {/* the share Gridzilla can steer (flat grey), the total load (ink), the forecast (dashed ink) */}
              <g clipPath={`url(#${plot}-plot)`}>
                <g style={xStyle}>
                  <path d={P.steer} fill={FILL} />
                  <path d={P.fc} fill="none" stroke={INK} strokeOpacity={0.7} strokeWidth={2} strokeDasharray="6 6" strokeLinecap="round" />
                  <path d={P.fc} fill="none" stroke={RED} strokeWidth={2} strokeDasharray="6 6" strokeLinecap="round" clipPath={`url(#${plot}-over)`} />
                  {/* without Gridzilla: what the same houses would have drawn; the gap to the ink line is the product */}
                  <path d={P.base} fill="none" stroke={TERTIARY} strokeWidth={1.75} strokeDasharray="5 4" strokeLinejoin="round" />
                  <path d={P.total} fill="none" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
                  <path d={P.total} fill="none" stroke={RED} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#${plot}-over)`} />
                </g>
              </g>

              {/* limits in both directions, thin and labelled in plain words */}
              {rating != null && (
                <g>
                  <line x1={M.l} x2={right} y1={yPx(rating)} y2={yPx(rating)} stroke={RED} strokeWidth={1.25} />
                  <text x={M.l + fs * 0.6} y={yPx(rating) - fs * 0.5} style={{ ...axisText, fill: RED, fontWeight: 600 }} {...halo}>
                    Limit {rating.toLocaleString("en-US")} kW
                  </text>
                </g>
              )}
              {reverse != null && (
                <g>
                  <line x1={M.l} x2={right} y1={yPx(-reverse)} y2={yPx(-reverse)} stroke={RED} strokeWidth={1.25} />
                  <text x={M.l + fs * 0.6} y={yPx(-reverse) - fs * 0.5} style={{ ...axisText, fill: RED, fontWeight: 600 }} {...halo}>
                    {narrow ? "Limit, flowing back" : "Limit for power flowing back"}
                  </text>
                </g>
              )}

              {/* direction in words, not colours: above zero the street takes power from the grid, below it gives power back */}
              <text x={dirX} y={y0 - fs * 0.55} textAnchor={dirAnchor} style={axisText} {...halo}>
                ↑ Taking power
              </text>
              <text x={dirX} y={y0 + fs * 1.25} textAnchor={dirAnchor} style={axisText} {...halo}>
                ↓ Giving back
              </text>

              {/* now: a thin line, the time above it, the forecast to its right */}
              <line x1={nowX} x2={nowX} y1={M.t - fs * 0.3} y2={bottom} stroke={INK} strokeOpacity={0.35} strokeWidth={1} />
              <text x={nowX - fs * 0.5} y={M.t - fs * 0.6} textAnchor="end" style={{ ...axisText, fill: INK, fontWeight: 600 }}>
                Now {hhmm(s.sim_hour)}
              </text>
              <text x={nowX + fs * 0.5} y={M.t - fs * 0.6} style={axisText}>
                Forecast
              </text>
              {last && (
                <circle
                  r={4.5}
                  fill={live}
                  stroke="#fff"
                  strokeWidth={2}
                  style={{ transform: `translate(${nowX}px, ${yPx(last.total)}px)`, transition: snap ? "none" : EASE }}
                />
              )}

              {/* no history yet: say so in the past half, clear of the now line and the direction words */}
              {hist.length < 2 && (
                <text x={(M.l + nowX) / 2} y={(y0 + yPx(rating != null ? rating / 2 : yMax / 2)) / 2} textAnchor="middle" style={{ ...axisText, fill: COLORS.give }}>
                  Collecting the first minutes of data...
                </text>
              )}

              {/* x axis: hh:mm under the plot */}
              <g style={xStyle}>
                {xTicks.map((t) => (
                  <text key={`x${t}`} x={(t - A) * pph} y={bottom + fs * 1.45} textAnchor="middle" style={axisText}>
                    {hhmm(t)}
                  </text>
                ))}
              </g>

              {/* signals: a small ink marker on the time axis, a bar for how long the allowed box lasts, a short label */}
              <g clipPath={`url(#${plot}-plot)`}>
                <g style={xStyle}>
                  {pins.map((m) => {
                    const x = (m.t - A) * pph;
                    const lab = labels.get(m.key);
                    const by = m.by === "ai" ? "Autopilot" : "Operator";
                    return (
                      <g key={m.key}>
                        <title>{`${by} sent "${MODE_WORDS[m.mode]?.title ?? m.mode}" at ${hhmm(m.t)}${m.seq != null ? ` (signal ${m.seq})` : ""}`}</title>
                        {m.durH > 0 && <rect x={x} y={bottom - 3} width={m.durH * pph} height={3} fill={INK} />}
                        <line x1={x} x2={x} y1={bottom - fs * 1.1} y2={bottom} stroke={INK} strokeWidth={1.5} />
                        <circle cx={x} cy={bottom - fs * 1.1} r={3.5} fill={INK} />
                        {lab && (
                          <text
                            x={lab.side === 1 ? x + fs * 0.55 : x - fs * 0.55}
                            y={bottom - fs * 0.75}
                            textAnchor={lab.side === 1 ? "start" : "end"}
                            style={{ ...axisText, fill: INK, fontWeight: 500 }}
                            {...halo}
                          >
                            {markLabel(m)}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              </g>
            </svg>
          )}
        </div>
      </div>
      <Legend />
    </>
  );
}

/** Three keys: everything else (limits, now, forecast, signals) is labelled on the chart itself. */
function Legend() {
  const item = "inline-flex items-center gap-2 whitespace-nowrap";
  return (
    <div className="t-caption mt-2 flex flex-wrap items-center gap-x-5 gap-y-1">
      <span className={item}>
        <span className="h-[2.5px] w-5 rounded-full bg-ink" />
        With Gridzilla (measured)
      </span>
      <span className={item}>
        <svg width="20" height="4" aria-hidden><line x1="0" x2="20" y1="2" y2="2" stroke={TERTIARY} strokeWidth="1.75" strokeDasharray="5 4" /></svg>
        Without Gridzilla
      </span>
      <span className={item}>
        <span className="h-3 w-4 rounded-[3px] bg-fill" />
        Houses Gridzilla can steer
      </span>
    </div>
  );
}
