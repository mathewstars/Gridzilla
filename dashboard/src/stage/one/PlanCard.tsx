// The side card "plan": dad's diet plan (SHAPE) for tonight, from B's PlanCard (stage/b/Cards.tsx). The street's peak
// before -> after the plan, the kWh of car charging moved into the night, cars full by morning, a mini shape chart
// (grey dashed "every car at once" hill against the flat green plan, red limit) and the whole city in one line.
// Sources: /api/flatten?node=<tf> for the street, /api/flatten?node=region:at for the city (useFlatten, every 5 s).
// No reading = a grey "Waiting" line, never a made-up value. Every number carries data-src/data-val (qa/README.md).
//
// The shell's card (Stage.tsx, data-card="plan") owns the surface and padding; this part fills it.
// Layout by the card's own width: pair and chart side by side from 24rem, stacked below; the pair stacks below 22rem.
import { useEffect, useMemo, useRef, useState } from "react";
import { useFlatten, type FlattenPlan } from "../../api";
import { hhmm } from "../../model";
import { P, loadTone } from "../palette";
import Counter from "../kit/Counter";
import type { StoryState } from "../useStory";


/** Size of an element, kept fresh with a ResizeObserver (the chart box is sized by CSS, never by its drawing). */
function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box] as const;
}

/** The next 24 h of the plan as a shape: the green wash is the energy the plan moves (the eaten hill above the plateau
 *  and the filled night valley under it). No text inside the plot, so nothing can collide; the hero chart carries axes. */
function ShapeChart({ p }: { p: FlattenPlan }) {
  const [ref, { w, h }] = useBox<HTMLDivElement>();
  const n = Math.min(p.naive_kw.length, p.planned_kw.length);
  const paths = useMemo(() => {
    if (n < 2 || w < 40 || h < 24) return null;
    const naive = p.naive_kw.slice(0, n);
    const plan = p.planned_kw.slice(0, n);
    const hi = Math.max(p.rating_kw * 1.08, ...naive, ...plan);
    const lo = Math.min(0, ...naive, ...plan);
    const pad = 3;
    const x = (i: number) => (i / (n - 1)) * w;
    const y = (v: number) => pad + (1 - (v - lo) / (hi - lo || 1)) * (h - 2 * pad);
    const line = (a: number[]) => a.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
    const back = plan.map((_, j) => n - 1 - j);
    const wash = `${line(naive)}${back.map((i) => `L${x(i).toFixed(1)},${y(plan[i]).toFixed(1)}`).join("")}Z`;
    return { naive: line(naive), plan: line(plan), wash, limit: y(p.rating_kw) };
  }, [p, n, w, h]);
  const start = p.hours[0];
  const label = `Next 24 hours from ${start != null ? hhmm(start) : "now"}: without the plan the street peaks at ${p.peak_naive_pct} % of its limit, with the plan ${p.peak_plan_pct} %`;
  return (
    <div ref={ref} className="gzPlan-chart" role="img" aria-label={label}>
      {paths && (
        <svg width={w} height={h} aria-hidden>
          <path d={paths.wash} fill={P.green} fillOpacity={0.12} stroke="none" />
          <line x1={0} x2={w} y1={paths.limit} y2={paths.limit} stroke={P.red} strokeWidth={1.5} />
          <path d={paths.naive} fill="none" stroke={P.tertiary} strokeWidth={1.75} strokeDasharray="5 4" strokeLinejoin="round" />
          <path d={paths.plan} fill="none" stroke={P.green} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      )}
    </div>
  );
}

const Arrow = () => (
  <span className="gzPlan-arrow" aria-hidden>
    →
  </span>
);

const CSS = `
.gzPlan{container-type:inline-size;min-width:0;display:flex;flex-direction:column;gap:.25rem}
.gzPlan-title{margin:0;font-size:clamp(1.125rem,.9rem + .45vw,1.75rem);line-height:1.1;font-weight:600;letter-spacing:.007em}
.gzPlan-top{display:grid;grid-template-columns:minmax(0,1fr);grid-template-areas:"pair" "cap" "chart";gap:.25rem 1.25rem;align-items:start}
.gzPlan-pair{grid-area:pair;display:flex;flex-direction:column;align-items:flex-start;column-gap:.3em;row-gap:.2em;
  font-size:clamp(1.75rem,12cqi,2.75rem);line-height:1;font-weight:600;letter-spacing:-.015em}
.gzPlan-pair>span{white-space:nowrap}
.gzPlan-unit{margin-left:.08em;font-size:.5em;font-weight:600;color:${P.secondary};letter-spacing:0}
.gzPlan-arrow{margin-right:.25em;font-size:.7em;font-weight:600;color:${P.tertiary}}
.gzPlan-cap .gzPlan-arrow{margin:0 .1em;font-size:1em}
.gzPlan-chart{grid-area:chart;position:relative;min-width:0;height:4.5rem;margin-top:.375rem}
.gzPlan-chart>svg{position:absolute;inset:0;display:block}
.gzPlan-cap{grid-area:cap;margin:0;font-size:var(--gzP-b);line-height:1.3;color:${P.secondary};letter-spacing:-.016em}
.gzPlan-b{margin:0;font-size:var(--gzP-b);line-height:1.35;color:${P.ink};letter-spacing:-.022em}
.gzPlan-b b{font-weight:600}
.gzPlan-city{margin:0;font-size:var(--gzP-b);line-height:1.35;color:${P.secondary};letter-spacing:-.022em}
.gzPlan-city b{font-weight:600;color:${P.ink}}
.gzPlan-foot{margin:0;font-size:.875rem;line-height:1.43;color:${P.tertiary};letter-spacing:-.016em}
.gzPlan-wait{margin:0;font-size:clamp(1.125rem,.9rem + .45vw,1.75rem);line-height:1.2;font-weight:600;color:${P.tertiary}}
.gzPlan{--gzP-b:.9375rem}
@container (min-width:22rem){
  .gzPlan-pair{flex-direction:row;flex-wrap:wrap;align-items:baseline}
}
/* Wide: the chart stands beside the pair and its caption, as tall as both. The caption adds no width of its own
   (contain), so the pair alone sets the left column and the caption wraps under it. */
@container (min-width:24rem){
  .gzPlan-top{grid-template-columns:minmax(max-content,13.5rem) minmax(0,1fr);grid-template-areas:"pair chart" "cap chart";align-items:start}
  .gzPlan-cap{contain:inline-size}
  .gzPlan-chart{height:auto;min-height:3.5rem;align-self:stretch;margin-top:0}
  .gzPlan{--gzP-b:1rem}
}
/* The quiet footnote only where a wide card has the room; one screen at 1440x900 needs every line. */
@container (max-width:33.99rem){
  .gzPlan-foot{display:none}
}
`;

/** Diet plan for tonight. Props: `st` from useStory (the street on stage is `st.tf`). */
export default function PlanCard({ st }: { st: StoryState }) {
  const street = useFlatten(st.tf);
  const city = useFlatten("region:at");
  const p = street.plan;
  const c = city.plan;
  const fs = `flatten:${st.tf}`;
  const fc = "flatten:region:at";

  return (
    <div className="gzPlan">
      <style>{CSS}</style>
      <h2 className="gzPlan-title">Diet plan for tonight</h2>
      {p ? (
        <>
          <div className="gzPlan-top">
            <div className="gzPlan-pair" aria-label={`Tonight's peak: ${p.peak_naive_pct} % of the limit without the plan, ${p.peak_plan_pct} % with it`}>
              <span style={{ color: loadTone(p.peak_naive_pct) }}>
                <Counter value={p.peak_naive_pct} src={`${fs}/plan/peak_naive_pct`} />
                <span className="gzPlan-unit">%</span>
              </span>
              <span style={{ color: loadTone(p.peak_plan_pct) }}>
                <Arrow />
                <Counter value={p.peak_plan_pct} src={`${fs}/plan/peak_plan_pct`} />
                <span className="gzPlan-unit">%</span>
              </span>
            </div>
            <p className="gzPlan-cap">
              Peak without <Arrow /> with the plan
            </p>
            <ShapeChart p={p} />
          </div>
          {p.shifted_kwh >= 0.5 ? (
            <p className="gzPlan-b">
              <b>
                <Counter value={p.shifted_kwh} src={`${fs}/plan/shifted_kwh`} />
                {"\u00a0"}kWh
              </b>{" "}
              of car charging moved into the night, {p.cars_full ? "every car full by morning." : "not every car full by morning."}
            </p>
          ) : (
            // A street where no car charges tonight: nothing to move, and the plan says so instead of "0 kWh".
            <p className="gzPlan-b">{p.ev_houses ? "No car charging to move on this street tonight." : "No cars on this street to move."}</p>
          )}
          {c ? (
            <p className="gzPlan-city">
              Whole city{" "}
              <b>
                <Counter value={c.peak_naive_kw / 1000} decimals={1} src={`${fc}/plan/peak_naive_kw`} scale={0.001} />
                <span className="gzPlan-arrow" style={{ marginLeft: "0.25em", fontSize: "1em" }} aria-hidden>
                  →
                </span>
                <Counter value={c.peak_plan_kw / 1000} decimals={1} src={`${fc}/plan/peak_plan_kw`} scale={0.001} />
                {"\u00a0"}MW
              </b>{" "}
              at the peak, <Counter value={c.houses} src={`${fc}/plan/houses`} />
              {"\u00a0"}homes
            </p>
          ) : (
            <p className="gzPlan-city" style={{ color: P.tertiary }}>
              Whole city: waiting for its plan
            </p>
          )}
          {street.data && (
            <p className="gzPlan-foot">
              New plan every{" "}
              <span data-src="deck" data-label="platform setting">
                2
              </span>{" "}
              hours, round <Counter value={street.data.rounds} src={`${fs}/rounds`} />
            </p>
          )}
        </>
      ) : (
        <p className="gzPlan-wait">
          {street.data && !street.data.enabled
            ? "The diet plan is switched off"
            : street.missing
              ? "No diet plan on this platform"
              : "Waiting for the diet plan"}
        </p>
      )}
    </div>
  );
}
