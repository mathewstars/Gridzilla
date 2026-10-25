// The with/without chart for one street (src/data/street.ts), in the console's chart grammar: kW ticks and quiet
// gridlines, Gridzilla in blue with a soft fill, the same street without it dashed grey, the peak Gridzilla eats in
// orange, the transformer's limit dashed red. `compact` draws a crop of it with no axes or tooltip (the ABSORB cell).
// Loaded lazily (recharts is its own chunk) and drawn once it is 30 % on screen, so the lines draw in where people see
// them; under reduced motion it is drawn at once, still.
import { useMemo, useRef } from "react";
import { useInView, useReducedMotion } from "motion/react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipProps } from "recharts";
import { STREET } from "../data/street";
import "../styles/sections-a.css";

// the chart data colours are the theme's tokens (--color-chart-*), read once from the page: SVG attributes need plain
// values. Ticks, gridlines and the zero line take their tokens through sections-a.css (.street-chart).
const token = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
const chartColours = () => ({
  with: token("--color-chart-with", "#0a84ff"),
  without: token("--color-chart-without", "#8e8e93"),
  eaten: token("--color-chart-eaten", "#ff9f0a"),
  limit: token("--color-chart-limit", "#ff453a"),
});
const STEP_H = 0.25;

interface Pt { t: number; clock: number; without: number; with: number; eaten: [number, number] }

const hhmm = (h: number) => {
  const m = Math.round((((h % 24) + 24) % 24) * 60);
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
export const kw = (v: number) => `${Math.round(v)} kW`;

const POINTS: Pt[] = STREET.rows.map(([clock, without, w], i) => ({
  t: i * STEP_H,
  clock,
  without,
  with: w,
  // the band between the two lines where the street without Gridzilla draws more (the evening peak it eats)
  eaten: without > w && without > 0 ? [w, without] : [w, w],
}));

function Tip({ active, payload }: TooltipProps<number, string>) {
  const p = active && payload?.[0]?.payload as Pt | undefined;
  if (!p) return null;
  return (
    <div className="tile px-4 py-3 text-[15px] leading-snug lg:text-[14px]">
      <div className="t-num font-semibold text-ink">{hhmm(p.clock)}</div>
      <div className="t-num mt-1 text-secondary">
        With Gridzilla <span className="font-medium text-ink">{kw(p.with)}</span>
      </div>
      <div className="t-num text-secondary">
        Without <span className="font-medium text-ink">{kw(p.without)}</span>
      </div>
    </div>
  );
}

export default function StreetChart({ compact = false, from = 0, to = 24, label }: { compact?: boolean; from?: number; to?: number; label: string }) {
  // axis labels: 14 px below 1024 (the phone pass), 13 as before on a desktop
  const tickPx = typeof window !== "undefined" && innerWidth < 1024 ? 14 : 13;
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const seen = useInView(ref, { once: true, amount: 0.3 });
  const draw = !!reduce || seen;
  const C = useMemo(chartColours, []);

  const g = useMemo(() => {
    const data = POINTS.filter((p) => p.t >= from && p.t <= to);
    const t0 = data[0].t;
    const t1 = data[data.length - 1].t;
    // clock ticks every three hours, never on the very edges
    const ticks: number[] = [];
    const start = data[0].clock;
    for (let h = Math.ceil(start / 3) * 3; h < start + (t1 - t0) + 0.01; h += 3) {
      const off = t0 + (h - start);
      if (off > t0 + 0.6 && off < t1 - 0.6) ticks.push(off);
    }
    return { data, t0, t1, ticks, start };
  }, [from, to]);

  const anim = { isAnimationActive: !reduce, animationDuration: 1100, animationEasing: "ease-out" as const };
  const clockAt = (t: number) => hhmm(g.start + (t - g.t0));

  return (
    <div ref={ref} className="street-chart h-full w-full" role="img" aria-label={label}>
      {draw && (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={g.data} margin={compact ? { top: 6, right: 4, bottom: 6, left: 4 } : { top: 12, right: 8, bottom: 0, left: 0 }}>
            {!compact && <CartesianGrid vertical={false} />}
            <XAxis
              dataKey="t"
              type="number"
              domain={[g.t0, g.t1]}
              ticks={g.ticks}
              tickFormatter={clockAt}
              hide={compact}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: tickPx }}
              tickMargin={10}
            />
            <YAxis
              domain={compact ? ["dataMin - 8", "dataMax + 8"] : [-100, 300]}
              ticks={compact ? undefined : [-100, 0, 100, 200, 300]}
              tickFormatter={(v: number) => `${v} kW`}
              hide={compact}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: tickPx }}
              width={64}
            />
            {compact && <ReferenceLine y={0} className="gz-zero" strokeWidth={1.5} />}
            {!compact && <ReferenceLine y={STREET.ratingKw} stroke={C.limit} strokeWidth={1.5} strokeDasharray="6 6" />}
            {/* drawn bottom up: the eaten band, the street without Gridzilla, then Gridzilla's line on top */}
            <Area type="monotone" dataKey="eaten" stroke="none" fill={C.eaten} fillOpacity={0.6} activeDot={false} {...anim} />
            <Line type="monotone" dataKey="without" stroke={C.without} strokeWidth={2} strokeDasharray="6 5" dot={false} activeDot={false} {...anim} />
            <Area type="monotone" dataKey="with" stroke={C.with} strokeWidth={compact ? 2.5 : 3} fill={C.with} fillOpacity={0.2} strokeLinejoin="round" activeDot={compact ? false : { r: 4.5, fill: C.with, strokeWidth: 0 }} {...anim} />
            {!compact && <Tooltip content={<Tip />} cursor={{ stroke: C.without, strokeWidth: 1, strokeDasharray: "3 4" }} isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
