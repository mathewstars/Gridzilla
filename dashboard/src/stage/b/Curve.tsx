// Stage B's "with and without Gridzilla" chart, built to never collide: the legend is HTML above the plot (it wraps,
// never overlaps), and the only text inside the SVG is the axis. Y ticks are thinned to the plot height, time labels
// are placed greedily ("Now" first) and any label that would touch another one is dropped. Minimum plot height is set
// by the card, so a short window scrolls the page instead of squashing the chart.
import { useMemo } from "react";
import type { History, State } from "../../api";
import { hhmm } from "../../model";
import { niceStep, signalMarks, unwrapForecast, unwrapHistory } from "../../components/curve/series";
import { P } from "../palette";
import { smoothBand, smoothPath } from "../kit/smooth";
import { fmtNum } from "../kit/Counter";
import { useBox } from "./Cards";

const PAST = 6;
const FUTURE = 2;

function Key({ kind, children }: { kind: "base" | "total" | "limit" | "fc" | "gap"; children: React.ReactNode }) {
  const sw = kind === "total" ? 3.5 : 2.5;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <svg width="22" height="10" aria-hidden className="shrink-0">
        {kind === "gap" ? (
          <rect x="1" y="1" width="20" height="8" rx="2" fill={P.green} fillOpacity={0.38} />
        ) : (
          <line
            x1="2" x2="20" y1="5" y2="5" strokeLinecap="round" strokeWidth={sw}
            stroke={kind === "base" ? P.tertiary : kind === "total" ? P.blue : kind === "limit" ? P.red : P.ink}
            strokeOpacity={kind === "fc" ? 0.35 : 1}
            strokeDasharray={kind === "base" ? "5 4" : kind === "fc" ? "3 4" : undefined}
          />
        )}
      </svg>
      {children}
    </span>
  );
}

export default function BCurve({ s, history, node }: { s: State; history: History | null; node: string }) {
  const [ref, { w: W, h: H }] = useBox<HTMLDivElement>();
  const now = s.sim_hour;
  const hist = useMemo(() => unwrapHistory(history, node, now, now), [history, node, now]);
  const fc = useMemo(() => unwrapForecast(s, node, now), [s, node, now]);
  const marks = useMemo(() => signalMarks(s, node, now), [s, node, now]);
  const tn = s.tree[node];
  const rating = tn?.rating_kw ?? null;
  const reverse = rating != null ? tn?.reverse_kw ?? rating : null;
  const hasBase = hist.some((p) => p.base != null);

  const rem = typeof window === "undefined" ? 16 : parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const fs = Math.round(rem * 0.875);
  // At least two hours back even right after a restart, so "Now" never sits on the left edge.
  const tL = Math.max(now - PAST, Math.min(hist.length ? hist[0].t : now - PAST, now - 2));
  const tR = now + FUTURE;
  const vis = hist.filter((p) => p.t >= tL - 0.3);
  const fcv = fc.filter((p) => p.t >= now - 0.05 && p.t <= tR + 0.3);
  const vals = [...vis.map((p) => p.total), ...vis.flatMap((p) => (p.base == null ? [] : [p.base])), ...fcv.map((p) => p.total)];
  const vMax = vals.length ? Math.max(...vals) : 0;
  const vMin = vals.length ? Math.min(...vals) : 0;
  const backflow = reverse != null && -vMin > Math.max(0, vMax);
  const lim = backflow ? -(reverse as number) : rating;
  const span = Math.max(vMax, 0) - Math.min(vMin, 0) || 1;
  const hi = backflow ? Math.max(vMax, 0) + span * 0.08 : Math.max((rating ?? vMax) * 1.08, vMax + span * 0.08, 1);
  const lo = backflow ? Math.min(-(reverse as number) * 1.08, vMin - span * 0.08) : Math.min(0, vMin - span * 0.05);

  // Axis gutter sized from the widest tick label; time row under the plot.
  const kw = (v: number) => fmtNum(Math.round(v) || 0);
  const padT = fs * 0.8;
  const padB = fs * 2.5;
  const ph = Math.max(1, H - padT - padB);
  const nTicks = Math.max(2, Math.min(5, Math.floor(ph / (fs * 2.4))));
  const yStep = niceStep(hi - lo, nTicks);
  const yTicks: number[] = [];
  for (let v = Math.ceil(lo / yStep) * yStep; v <= hi + 1e-9; v += yStep) yTicks.push(Math.round(v * 1000) / 1000);
  const tickText = (v: number, i: number) => `${kw(v)}${i === yTicks.length - 1 ? " kW" : ""}`;
  const gutter = Math.max(...yTicks.map((v, i) => tickText(v, i).length), 3) * fs * 0.6 + fs * 0.6;
  const padL = 2;
  const pw = Math.max(1, W - padL - gutter);
  const x = (t: number) => padL + ((t - tL) / (tR - tL || 1)) * pw;
  const y = (v: number) => padT + ((hi - v) / (hi - lo || 1)) * ph;
  const ready = W > 40 && H > 40;

  const totalPts = vis.map((p) => [x(p.t), y(p.total)] as [number, number]);
  const baseRun = vis.filter((p) => p.base != null);
  const basePts = baseRun.map((p) => [x(p.t), y(p.base as number)] as [number, number]);
  const shaving = (p: { base: number | null; total: number }) =>
    p.base != null && Math.abs(p.total) < Math.abs(p.base) && (Math.sign(p.base) === Math.sign(p.total) || Math.abs(p.total) <= 1);
  const band = baseRun.length > 1
    ? smoothBand(baseRun.map((p) => [x(p.t), y(shaving(p) ? (p.base as number) : p.total)]), baseRun.map((p) => [x(p.t), y(p.total)]))
    : null;
  const fcPts = fcv.map((p) => [x(p.t), y(p.total)] as [number, number]);
  const last = vis[vis.length - 1];
  if (fcPts.length && last) fcPts.unshift([x(last.t), y(last.total)]);
  const pins = marks.filter((m) => m.t >= tL && m.t <= now + 0.05);

  // Time labels: "Now" is placed first, whole hours after it; one that would touch a placed label drops out.
  const nowX = x(now);
  const labW = (t: string) => t.length * fs * 0.6;
  const placed: [number, number][] = [];
  const free = (cx: number, wd: number) =>
    cx - wd / 2 >= padL && cx + wd / 2 <= padL + pw && placed.every(([a, b]) => cx + wd / 2 + fs * 0.8 < a || cx - wd / 2 - fs * 0.8 > b);
  const tLabels: { x: number; text: string; now?: boolean }[] = [];
  const nowText = `Now ${hhmm(now)}`;
  const nowLabX = Math.min(Math.max(nowX, padL + labW(nowText) / 2), padL + pw - labW(nowText) / 2);
  if (free(nowLabX, labW(nowText))) {
    placed.push([nowLabX - labW(nowText) / 2, nowLabX + labW(nowText) / 2]);
    tLabels.push({ x: nowLabX, text: nowText, now: true });
  }
  const step = pw / (tR - tL || 1) > labW("00:00") * 1.6 ? 1 : 2;
  for (let t = Math.ceil(tL / step) * step; t <= tR; t += step) {
    const lx = x(t);
    const text = hhmm(t);
    if (free(lx, labW(text))) {
      placed.push([lx - labW(text) / 2, lx + labW(text) / 2]);
      tLabels.push({ x: lx, text });
    }
  }
  const clip = `b-over-${node.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="t-small flex flex-wrap gap-x-4 gap-y-1">
        {hasBase && <Key kind="base">Without Gridzilla</Key>}
        <Key kind="total">{hasBase ? "With Gridzilla" : "Load"}</Key>
        {hasBase && <Key kind="gap">Kept off the street</Key>}
        {lim != null && <Key kind="limit">Limit {kw(Math.abs(lim))} kW{backflow ? " flowing back" : ""}</Key>}
        {fcPts.length > 1 && <Key kind="fc">Forecast</Key>}
      </div>
      <div ref={ref} className="relative min-h-[12rem] flex-1">
        {ready && (
          <svg width={W} height={H} className="absolute inset-0 block" role="img" aria-label="Load on this street with and without Gridzilla">
            <defs>
              <clipPath id={`${clip}-plot`}>
                <rect x={padL} y={0} width={pw} height={H} />
              </clipPath>
              {lim != null && (
                <clipPath id={clip}>
                  {backflow ? <rect x={padL} y={y(lim)} width={pw} height={Math.max(0, H - y(lim))} /> : <rect x={padL} y={0} width={pw} height={Math.max(0, y(lim))} />}
                </clipPath>
              )}
            </defs>
            {yTicks.map((v, i) => (
              <g key={`y${v}`}>
                <line x1={padL} x2={padL + pw} y1={y(v)} y2={y(v)} stroke={P.ink} strokeOpacity={v === 0 ? 0.16 : 0.06} />
                <text x={padL + pw + fs * 0.5} y={y(v)} dy="0.35em" fontSize={fs} fill={P.secondary} style={{ fontVariantNumeric: "tabular-nums" }}>
                  {tickText(v, i)}
                </text>
              </g>
            ))}
            <rect x={nowX} y={padT} width={Math.max(0, padL + pw - nowX)} height={ph} fill={P.ink} fillOpacity={0.025} />
            <g clipPath={`url(#${clip}-plot)`}>
              {band && <path d={band} fill={P.green} fillOpacity={0.38} />}
              {basePts.length > 1 && <path d={smoothPath(basePts)} fill="none" stroke={P.tertiary} strokeWidth={2.5} strokeDasharray="7 5" strokeLinecap="round" />}
              {fcPts.length > 1 && <path d={smoothPath(fcPts)} fill="none" stroke={P.ink} strokeOpacity={0.3} strokeWidth={2} strokeDasharray="3 4" strokeLinecap="round" />}
              {totalPts.length > 1 && (
                <>
                  <path d={smoothPath(totalPts)} fill="none" stroke={P.blue} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
                  {lim != null && <path d={smoothPath(totalPts)} fill="none" stroke={P.red} strokeWidth={3.5} strokeLinecap="round" clipPath={`url(#${clip})`} />}
                </>
              )}
              {pins.map((m) => {
                const p = vis.reduce<typeof last | undefined>((a, b) => (!a || Math.abs(b.t - m.t) < Math.abs(a.t - m.t) ? b : a), undefined);
                return p ? <circle key={m.key} cx={x(m.t)} cy={y(p.total)} r={4.5} fill={P.blue} stroke="#fff" strokeWidth={2} /> : null;
              })}
            </g>
            {lim != null && <line x1={padL} x2={padL + pw} y1={y(lim)} y2={y(lim)} stroke={P.red} strokeWidth={2} />}
            <line x1={nowX} x2={nowX} y1={padT} y2={padT + ph} stroke={P.ink} strokeOpacity={0.25} strokeWidth={1.25} />
            {last && <circle cx={x(last.t)} cy={y(last.total)} r={5.5} fill={P.blue} stroke="#fff" strokeWidth={2} />}
            {tLabels.map((l) => (
              <text key={l.text} x={l.x} y={padT + ph + fs * 1.8} textAnchor="middle" fontSize={fs} fontWeight={l.now ? 600 : 400} fill={l.now ? P.ink : P.secondary} style={{ fontVariantNumeric: "tabular-nums" }}>
                {l.text}
              </text>
            ))}
            {!vis.length && (
              <text x={padL + pw / 2} y={padT + ph / 2} textAnchor="middle" fontSize={fs} fill={P.secondary}>
                Waiting for the first readings
              </text>
            )}
          </svg>
        )}
      </div>
    </div>
  );
}
