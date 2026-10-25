// One small chart per signal, in the console's chart grammar (blue with Gridzilla over a soft fill, grey dashed without,
// orange eaten peak, red dashed limit) with the signal's own effect drawn in its tone (var(--tone), set by the
// tone-* class around it). SUPPORT, ABSORB and RELEASE draw the real Atzgersdorf plan; PREPARE, STRETCH and RECOVER
// are schematic shapes (the plan has no battery or islanding series) and carry the word "Schematic" in the corner.
// Plain SVG, no chart library: it scales with its tile; `compact` is the phone card's smaller drawing.
import type { ReactNode } from "react";
import { STREET } from "../../data/street";
import { CAP_FROM, CAP_KW, CAP_TO, EXPORT_CAP_KW, NOON_TO, PLAN, hhmm, type Pt, type Word } from "./signals";

interface Geo { W: number; H: number; l: number; r: number; t: number; b: number; t0: number; t1: number; y0: number; y1: number }

const x = (g: Geo, t: number) => g.l + ((t - g.t0) / (g.t1 - g.t0)) * (g.W - g.l - g.r);
const y = (g: Geo, v: number) => g.t + ((g.y1 - v) / (g.y1 - g.y0)) * (g.H - g.t - g.b);
const f = (n: number) => n.toFixed(1);

type Series = { t: number; v: number }[];
const line = (g: Geo, s: Series) => "M" + s.map((p) => `${f(x(g, p.t))},${f(y(g, p.v))}`).join("L");
const toZero = (g: Geo, s: Series) => `${line(g, s)}L${f(x(g, s[s.length - 1].t))},${f(y(g, 0))}L${f(x(g, s[0].t))},${f(y(g, 0))}Z`;

/** The band where hi(t) > lo(t), cut exactly where the two cross, as one path. */
function band(g: Geo, pts: Pt[], hi: (p: Pt) => number, lo: (p: Pt) => number, keep: (p: Pt) => boolean = () => true) {
  const runs: { t: number; a: number; b: number }[][] = [];
  let cur: { t: number; a: number; b: number }[] | null = null;
  pts.forEach((p, i) => {
    const d = keep(p) ? hi(p) - lo(p) : -1;
    if (i > 0) {
      const q = pts[i - 1];
      const dq = keep(q) ? hi(q) - lo(q) : -1;
      if (dq > 0 !== d > 0) {
        const k = dq / (dq - d);
        const t = q.t + k * (p.t - q.t);
        const v = lo(q) + k * (lo(p) - lo(q));
        if (cur) { cur.push({ t, a: v, b: v }); runs.push(cur); cur = null; } else cur = [{ t, a: v, b: v }];
      }
    }
    if (d > 0) (cur ??= []).push({ t: p.t, a: hi(p), b: lo(p) });
  });
  if (cur) runs.push(cur);
  return runs
    .filter((r) => r.length > 1)
    .map((r) => `M${r.map((p) => `${f(x(g, p.t))},${f(y(g, p.a))}`).join("L")}L${[...r].reverse().map((p) => `${f(x(g, p.t))},${f(y(g, p.b))}`).join("L")}Z`)
    .join("");
}

const geo = (compact: boolean, t0: number, t1: number, y0: number, y1: number, ticks = true): Geo =>
  compact ? { W: 320, H: 150, l: 6, r: 6, t: 10, b: 22, t0, t1, y0, y1 } : { W: 640, H: 250, l: ticks ? 58 : 10, r: 10, t: 16, b: 28, t0, t1, y0, y1 };

const S = {
  with: { stroke: "var(--color-chart-with)" },
  withFill: { fill: "var(--color-chart-with)" },
  without: { stroke: "var(--color-chart-without)" },
  eaten: { fill: "var(--color-chart-eaten)" },
  limit: { stroke: "var(--color-chart-limit)" },
  tone: { stroke: "var(--tone)" },
  toneFill: { fill: "var(--tone)" },
};

function Frame({ g, compact, label, xTicks, yTicks = [], unit = "kW", schematic, children }: { g: Geo; compact: boolean; label: string; xTicks: { t: number; text: string }[]; yTicks?: number[]; unit?: string; schematic?: boolean; children: ReactNode }) {
  const fs = compact ? 11 : 12;
  return (
    <svg className="sw-chart" viewBox={`0 0 ${g.W} ${g.H}`} width="100%" role="img" aria-label={label}>
      {yTicks.map((v) => (
        <g key={v}>
          <line className="sw-grid" x1={g.l} x2={g.W - g.r} y1={y(g, v)} y2={y(g, v)} />
          {!compact && (
            <text className="sw-tick" x={g.l - 10} y={y(g, v) + 4} textAnchor="end" fontSize={fs}>
              {v} {unit}
            </text>
          )}
        </g>
      ))}
      {children}
      {xTicks.map((k) => (
        <text key={k.text} className="sw-tick" x={x(g, k.t)} y={g.H - 6} textAnchor="middle" fontSize={fs}>
          {k.text}
        </text>
      ))}
      {schematic && (
        <text className="sw-tick" x={g.W - g.r} y={g.H - 6} textAnchor="end" fontSize={fs}>
          Schematic
        </text>
      )}
    </svg>
  );
}

const clockTicks = (from: number, to: number, every: number) => {
  const out: { t: number; text: string }[] = [];
  for (let h = Math.ceil(from / every) * every; h <= to; h += every) if (h > from + 0.3 && h < to - 0.3) out.push({ t: h, text: hhmm(h) });
  return out;
};
const slice = (from: number, to: number) => PLAN.filter((p) => p.t >= from - 1e-6 && p.t <= to + 1e-6);
const sOf = (pts: Pt[], k: "with" | "without"): Series => pts.map((p) => ({ t: p.t, v: p[k] }));

/** The evening: the street held at the plan's cap, the peak above it eaten. */
function Support({ compact, label }: { compact: boolean; label: string }) {
  const pts = slice(15, 25);
  const g = geo(compact, pts[0].t, pts[pts.length - 1].t, 0, 300);
  const fs = compact ? 11 : 12;
  return (
    <Frame g={g} compact={compact} label={label} xTicks={clockTicks(g.t0, g.t1, compact ? 6 : 3)} yTicks={[0, 100, 200, 300]}>
      <line x1={g.l} x2={g.W - g.r} y1={y(g, STREET.ratingKw)} y2={y(g, STREET.ratingKw)} style={S.limit} strokeWidth={1.5} strokeDasharray="6 6" opacity={0.7} />
      <path d={band(g, pts, (p) => p.without, (p) => p.with)} style={S.eaten} fillOpacity={0.6} />
      <path d={toZero(g, sOf(pts, "with"))} style={S.withFill} fillOpacity={0.18} />
      <path d={line(g, sOf(pts, "without"))} style={S.without} fill="none" strokeWidth={2} strokeDasharray="6 5" />
      <path d={line(g, sOf(pts, "with"))} style={S.with} fill="none" strokeWidth={compact ? 2.5 : 3} strokeLinejoin="round" />
      {/* the signal's effect: the cap the street is held to */}
      <line x1={x(g, CAP_FROM)} x2={x(g, CAP_TO)} y1={y(g, CAP_KW) + 5} y2={y(g, CAP_KW) + 5} style={S.tone} strokeWidth={3} strokeLinecap="round" />
      {!compact && (
        <>
          <text className="sw-label" x={x(g, CAP_TO) + 8} y={y(g, CAP_KW) + 9} fontSize={fs}>Cap {Math.round(CAP_KW)} kW</text>
          <text className="sw-label" x={g.W - g.r} y={y(g, STREET.ratingKw) - 8} textAnchor="end" fontSize={fs}>Limit {STREET.ratingKw} kW</text>
        </>
      )}
    </Frame>
  );
}

/** Noon: the street sends back only up to its export cap; the rest goes into the batteries. */
function Absorb({ compact, label }: { compact: boolean; label: string }) {
  const pts = slice(PLAN[0].t, NOON_TO + 0.5);
  const g = geo(compact, pts[0].t, pts[pts.length - 1].t, -110, 60);
  const fs = compact ? 11 : 12;
  const mid = pts[Math.round(pts.length * 0.45)];
  return (
    <Frame g={g} compact={compact} label={label} xTicks={clockTicks(g.t0, g.t1, 2)} yTicks={[-100, -50, 0, 50]}>
      <path d={band(g, pts, (p) => p.with, (p) => p.without, (p) => p.with <= 0)} style={S.toneFill} fillOpacity={0.3} />
      <path d={toZero(g, sOf(pts, "with"))} style={S.withFill} fillOpacity={0.18} />
      <path d={line(g, sOf(pts, "without"))} style={S.without} fill="none" strokeWidth={2} strokeDasharray="6 5" />
      <path d={line(g, sOf(pts, "with"))} style={S.with} fill="none" strokeWidth={compact ? 2.5 : 3} strokeLinejoin="round" />
      <line x1={g.l} x2={x(g, NOON_TO)} y1={y(g, -EXPORT_CAP_KW) - 5} y2={y(g, -EXPORT_CAP_KW) - 5} style={S.tone} strokeWidth={3} strokeLinecap="round" />
      <text className="sw-label" x={x(g, mid.t)} y={y(g, (mid.with + mid.without) / 2) + 4} textAnchor="middle" fontSize={fs}>stored</text>
      {!compact && (
        <text className="sw-label" x={g.l + 8} y={y(g, -EXPORT_CAP_KW) - 14} fontSize={fs}>Export cap {Math.round(EXPORT_CAP_KW)} kW</text>
      )}
    </Frame>
  );
}

const ease = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));

/** Schematic: the battery filled to 90 % by 17:00 inside the warning window. */
function Prepare({ compact, label }: { compact: boolean; label: string }) {
  const g = geo(compact, 11, 19, 0, 100);
  const fs = compact ? 11 : 12;
  const soc: Series = [];
  for (let t = 11; t <= 19.001; t += 0.125) soc.push({ t, v: 22 + 68 * ease((t - 12) / 5) });
  return (
    <Frame g={g} compact={compact} label={label} xTicks={[12, 15, 17].map((t) => ({ t, text: hhmm(t) }))} yTicks={[0, 50, 100]} unit="%" schematic>
      <rect x={x(g, 12)} y={g.t} width={x(g, 17) - x(g, 12)} height={g.H - g.t - g.b} style={S.toneFill} fillOpacity={0.1} />
      <line x1={g.l} x2={g.W - g.r} y1={y(g, 90)} y2={y(g, 90)} style={S.tone} strokeWidth={1.5} strokeDasharray="6 5" />
      <path d={line(g, soc)} style={S.tone} fill="none" strokeWidth={compact ? 2.5 : 3} strokeLinejoin="round" />
      <text className="sw-label" x={x(g, 12) + 8} y={y(g, 90) - 8} fontSize={fs}>90 % by 17:00</text>
    </Frame>
  );
}

/** Schematic: the street dark, the house islanded (nothing from the grid) and rationing its own load. */
function Stretch({ compact, label }: { compact: boolean; label: string }) {
  const g = geo(compact, 16, 24, 0, 1.1, false);
  const fs = compact ? 11 : 12;
  const usual = (t: number) => 0.35 + 0.5 * Math.exp(-((t - 19.2) ** 2) / 3);
  const dark = (t: number) => t >= 18 && t <= 21;
  const us: Series = [], grid: Series = [], rationed: Series = [];
  for (let t = 16; t <= 24.001; t += 0.125) {
    us.push({ t, v: usual(t) });
    grid.push({ t, v: dark(t) ? 0 : usual(t) });
    if (dark(t)) rationed.push({ t, v: usual(t) * 0.45 });
  }
  return (
    <Frame g={g} compact={compact} label={label} xTicks={[18, 21].map((t) => ({ t, text: hhmm(t) }))} yTicks={[0]} schematic>
      <rect x={x(g, 18)} y={g.t} width={x(g, 21) - x(g, 18)} height={g.H - g.t - g.b} style={S.toneFill} fillOpacity={0.12} />
      <path d={line(g, us)} style={S.without} fill="none" strokeWidth={2} strokeDasharray="6 5" />
      <path d={toZero(g, grid)} style={S.withFill} fillOpacity={0.18} />
      <path d={line(g, grid)} style={S.with} fill="none" strokeWidth={compact ? 2.5 : 3} strokeLinejoin="round" />
      <path d={line(g, rationed)} style={S.tone} fill="none" strokeWidth={compact ? 2.5 : 3} strokeLinecap="round" />
      <text className="sw-label" x={(x(g, 18) + x(g, 21)) / 2} y={g.t + fs + 4} textAnchor="middle" fontSize={fs}>street dark</text>
      {!compact && (
        <text className="sw-label" x={x(g, 21) + 8} y={y(g, usual(21) * 0.45) + 4} fontSize={fs}>rationed, from the battery</text>
      )}
    </Frame>
  );
}

/** Schematic: houses coming back one by one on their own ramps, never in one step. */
function Recover({ compact, label }: { compact: boolean; label: string }) {
  const g = geo(compact, 0, 1, 0, 1.15, false);
  const fs = compact ? 11 : 12;
  const starts = [0.04, 0.15, 0.24, 0.36, 0.47, 0.6];
  const levels = [0.92, 0.78, 0.86, 0.7, 0.95, 0.82];
  return (
    <Frame g={g} compact={compact} label={label} xTicks={[]} yTicks={[0]} schematic>
      {starts.map((s, i) => {
        const pts: Series = [];
        for (let t = 0; t <= 1.0001; t += 0.01) pts.push({ t, v: levels[i] * ease((t - s) / 0.24) });
        return <path key={s} d={line(g, pts)} style={S.tone} fill="none" strokeWidth={compact ? 1.5 : 2} opacity={0.55 + i * 0.07} />;
      })}
      <text className="sw-label" x={g.l} y={g.H - 6} fontSize={fs}>street back</text>
      {!compact && <text className="sw-label" x={g.l} y={g.t + fs} fontSize={fs}>each line one house</text>}
    </Frame>
  );
}

/** The cap lifting at the end of the plan's evening: after it the street follows its own curve. */
function Release({ compact, label }: { compact: boolean; label: string }) {
  const pts = slice(20, 26);
  const g = geo(compact, pts[0].t, pts[pts.length - 1].t, 0, 300);
  const fs = compact ? 11 : 12;
  return (
    <Frame g={g} compact={compact} label={label} xTicks={clockTicks(g.t0, g.t1, compact ? 3 : 2)} yTicks={[0, 100, 200, 300]}>
      <line x1={g.l} x2={g.W - g.r} y1={y(g, STREET.ratingKw)} y2={y(g, STREET.ratingKw)} style={S.limit} strokeWidth={1.5} strokeDasharray="6 6" opacity={0.7} />
      <path d={band(g, pts, (p) => p.without, (p) => p.with)} style={S.eaten} fillOpacity={0.6} />
      <path d={toZero(g, sOf(pts, "with"))} style={S.withFill} fillOpacity={0.18} />
      <path d={line(g, sOf(pts, "without"))} style={S.without} fill="none" strokeWidth={2} strokeDasharray="6 5" />
      <path d={line(g, sOf(pts, "with"))} style={S.with} fill="none" strokeWidth={compact ? 2.5 : 3} strokeLinejoin="round" />
      {/* the cap, up to the moment it lifts */}
      <line x1={g.l} x2={x(g, CAP_TO)} y1={y(g, CAP_KW) - 6} y2={y(g, CAP_KW) - 6} style={S.tone} strokeWidth={3} strokeLinecap="round" />
      <line x1={x(g, CAP_TO)} x2={x(g, CAP_TO)} y1={y(g, CAP_KW) - 16} y2={y(g, 0)} style={S.tone} strokeWidth={1} strokeDasharray="3 4" />
      {!compact && (
        <text className="sw-label" x={x(g, CAP_TO) + 8} y={y(g, CAP_KW) - 12} fontSize={fs}>cap lifted after {hhmm(CAP_TO)}</text>
      )}
    </Frame>
  );
}

const SCENES: Record<Word, (p: { compact: boolean; label: string }) => ReactNode> = {
  SUPPORT: Support,
  ABSORB: Absorb,
  PREPARE: Prepare,
  STRETCH: Stretch,
  RECOVER: Recover,
  RELEASE: Release,
};

export default function SignalChart({ word, label, compact = false }: { word: Word; label: string; compact?: boolean }) {
  const Scene = SCENES[word];
  return <Scene compact={compact} label={label} />;
}
