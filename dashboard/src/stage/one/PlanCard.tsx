// The side card "plan": dad's diet plan (SHAPE) for tonight, numbers only (the one curve on the stage is the hero chart,
// STAGE.md 1): the street's peak before -> after the plan and the kWh of car charging moved into the night, both at
// display size, then the whole city in one line. The plan unplugs the cars at 07:00 (platform flatten.py EV_UNPLUG_H),
// so cars_full reads "full by seven", the pitch's words. Sources: /api/flatten?node=<tf> for the street, /api/flatten?node=region:at
// for the city (useFlatten, every 5 s). No reading = a grey "Waiting" line, never a made-up value. Every number carries
// data-src/data-val (qa/README.md).
//
// The shell's card (Stage.tsx, data-card="plan") owns the surface and padding; this part fills it.
// Layout by the card's own width: the two facts side by side from 24rem, stacked below. A number pair never wraps.
import { useFlatten } from "../../api";
import { P, loadTone } from "../palette";
import Counter from "../kit/Counter";
import type { StoryState } from "../useStory";

const Arrow = () => (
  <span className="gzPlan-arrow" aria-hidden>
    →
  </span>
);

const CSS = `
.gzPlan{container-type:inline-size;min-width:0;display:flex;flex-direction:column;gap:.5rem;--gzP-b:.9375rem;--gzP-d:clamp(1.75rem,14cqi,2.75rem)}
.gzPlan-title{margin:0;font-size:clamp(1.125rem,.9rem + .45vw,1.75rem);line-height:1.1;font-weight:600;letter-spacing:.007em}
.gzPlan-facts{display:grid;grid-template-columns:minmax(0,1fr);gap:.875rem 1.5rem;align-items:start;margin-top:.25rem}
.gzPlan-fact{min-width:0;display:flex;flex-direction:column;gap:.3rem}
.gzPlan-num{display:flex;flex-wrap:nowrap;align-items:baseline;column-gap:.3em;white-space:nowrap;
  font-size:var(--gzP-d);line-height:1.05;font-weight:600;letter-spacing:-.015em}
.gzPlan-unit{margin-left:.08em;font-size:.5em;font-weight:600;color:${P.secondary};letter-spacing:0}
.gzPlan-arrow{font-size:.7em;font-weight:600;color:${P.tertiary}}
.gzPlan-cap{margin:0;text-wrap:pretty;font-size:var(--gzP-b);line-height:1.35;color:${P.secondary};letter-spacing:-.016em}
.gzPlan-cap .gzPlan-arrow{margin:0 .1em;font-size:1em}
.gzPlan-b{margin:0;font-size:var(--gzP-b);line-height:1.35;color:${P.ink};letter-spacing:-.022em}
.gzPlan-city{margin:0;font-size:var(--gzP-b);line-height:1.35;color:${P.secondary};letter-spacing:-.022em}
.gzPlan-city b{font-weight:600;color:${P.ink}}
.gzPlan-nw{white-space:nowrap}
.gzPlan-foot{margin:0;font-size:.875rem;line-height:1.43;color:${P.tertiary};letter-spacing:-.016em}
.gzPlan-wait{margin:0;font-size:clamp(1.125rem,.9rem + .45vw,1.75rem);line-height:1.2;font-weight:600;color:${P.tertiary}}
@container (min-width:24rem){
  .gzPlan{--gzP-b:1rem;--gzP-d:clamp(1.75rem,8.5cqi,3.25rem)}
  .gzPlan-facts{grid-template-columns:max-content minmax(0,1fr)}
}
/* The quiet footnote only where a wide card has the room; one screen at 1440x900 needs every line. */
@container (max-width:33.99rem){
  .gzPlan-foot{display:none}
}
`;

/** One rounding for every "% of the limit" figure (the chart's apex label reads the same Math.round). */
const pct = (v: number) => String(Math.round(v));

/** The noon side of the plan: the deepest backflow without and with the plan, as % of the backflow limit, with the slot
 *  index of each minimum so G2 can trace it. Null when the "without" curve stays inside the backflow limit. */
function backflow(naive: number[], planned: number[], reverse: number) {
  if (!(reverse > 0) || !naive.length) return null;
  let iN = 0;
  for (let i = 1; i < naive.length; i++) if (naive[i] < naive[iN]) iN = i;
  if (naive[iN] >= -reverse) return null;
  let iP = 0;
  for (let i = 1; i < planned.length; i++) if (planned[i] < planned[iP]) iP = i;
  const planKw = planned.length ? Math.max(0, -planned[iP]) : 0;
  return { naivePct: (-naive[iN] / reverse) * 100, planPct: (planKw / reverse) * 100, iN, iP: planKw > 0 ? iP : -1 };
}

/** Diet plan for tonight. Props: `st` from useStory (the street on stage is `st.tf`). */
export default function PlanCard({ st }: { st: StoryState }) {
  const street = useFlatten(st.tf);
  const city = useFlatten("region:at");
  const p = street.plan;
  const c = city.plan;
  const fs = `flatten:${st.tf}`;
  const fc = "flatten:region:at";
  // Sunny noon: when solar pushing back past the backflow limit is the worse side, the pair names that side instead.
  const tn = st.tf ? st.s?.tree?.[st.tf] : undefined;
  const revSrc = tn?.reverse_kw != null ? `state/tree/${st.tf}/reverse_kw` : `${fs}/plan/rating_kw`;
  const back = p ? backflow(p.naive_kw ?? [], p.planned_kw ?? [], tn?.reverse_kw ?? p.rating_kw) : null;
  const showBack = !!p && !!back && back.naivePct > p.peak_naive_pct;

  return (
    <div className="gzPlan">
      <style>{CSS}</style>
      <h2 className="gzPlan-title">Diet plan for tonight</h2>
      {p ? (
        <>
          <div className="gzPlan-facts">
            <div className="gzPlan-fact">
              {showBack && back ? (
                <>
                  <div
                    className="gzPlan-num"
                    aria-label={`Backflow at noon: ${pct(back.naivePct)} % of the backflow limit without the plan, ${pct(back.planPct)} % with it`}
                  >
                    <span style={{ color: loadTone(back.naivePct) }}>
                      <Counter
                        value={back.naivePct}
                        format={pct}
                        duration={0}
                        src="derived"
                        from={`(0 - ${fs}/plan/naive_kw/${back.iN}) / ${revSrc} * 100`}
                      />
                      <span className="gzPlan-unit">%</span>
                    </span>
                    <Arrow />
                    <span style={{ color: loadTone(back.planPct) }}>
                      <Counter
                        value={back.planPct}
                        format={pct}
                        duration={0}
                        src="derived"
                        from={back.iP >= 0 ? `(0 - ${fs}/plan/planned_kw/${back.iP}) / ${revSrc} * 100` : "0"}
                      />
                      <span className="gzPlan-unit">%</span>
                    </span>
                  </div>
                  <p className="gzPlan-cap gzPlan-nw">
                    Backflow without <Arrow /> with the plan
                  </p>
                </>
              ) : (
                <>
                  <div className="gzPlan-num" aria-label={`Tonight's peak: ${pct(p.peak_naive_pct)} % of the limit without the plan, ${pct(p.peak_plan_pct)} % with it`}>
                    <span style={{ color: loadTone(p.peak_naive_pct) }}>
                      <Counter value={p.peak_naive_pct} format={pct} duration={0} src={`${fs}/plan/peak_naive_pct`} />
                      <span className="gzPlan-unit">%</span>
                    </span>
                    <Arrow />
                    <span style={{ color: loadTone(p.peak_plan_pct) }}>
                      <Counter value={p.peak_plan_pct} format={pct} duration={0} src={`${fs}/plan/peak_plan_pct`} />
                      <span className="gzPlan-unit">%</span>
                    </span>
                  </div>
                  <p className="gzPlan-cap gzPlan-nw">
                    Peak without <Arrow /> with the plan
                  </p>
                </>
              )}
            </div>
            {p.shifted_kwh >= 0.5 ? (
              <div className="gzPlan-fact">
                <div className="gzPlan-num" style={{ color: P.ink }}>
                  <span>
                    <Counter value={p.shifted_kwh} src={`${fs}/plan/shifted_kwh`} />
                    <span className="gzPlan-unit">kWh</span>
                  </span>
                </div>
                <p className="gzPlan-cap">
                  car charging moved to the night, {p.cars_full ? "cars full by seven" : "not every car full by seven"}
                </p>
              </div>
            ) : (
              // A street where no car charges tonight: nothing to move, and the plan says so instead of "0 kWh".
              <p className="gzPlan-b">{p.ev_houses ? "No car charging to move on this street tonight." : "No cars on this street to move."}</p>
            )}
          </div>
          {c ? (
            <p className="gzPlan-city">
              Whole city{" "}
              <b className="gzPlan-nw">
                <Counter value={c.peak_naive_kw / 1000} decimals={1} src={`${fc}/plan/peak_naive_kw`} scale={0.001} />
                <span className="gzPlan-arrow" style={{ margin: "0 0.25em", fontSize: "1em" }} aria-hidden>
                  →
                </span>
                <Counter value={c.peak_plan_kw / 1000} decimals={1} src={`${fc}/plan/peak_plan_kw`} scale={0.001} />
                {"\u00a0"}MW
              </b>{" "}
              at the peak,{" "}
              <span className="gzPlan-nw">
                <Counter value={c.houses} src={`${fc}/plan/houses`} />
                {"\u00a0"}homes
              </span>
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
