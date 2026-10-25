// The problem: the editorial statement, one short paragraph set off to the right, then the real with/without chart for
// one street, full width on a tile, its legend in words and its caption in words under it. The numbers in the
// caption are the chart's own (src/data/street.ts); the measured 511 to 325 kW lives in Proof.
import { lazy, Suspense } from "react";
import { Intro, Section, Title } from "../ui/Section";
import { Reveal } from "../ui/Reveal";
import { STREET } from "../data/street";
import "../styles/sections-a.css";

const StreetChart = lazy(() => import("../charts/StreetChart"));

const r = (v: number) => Math.round(v);

/** The legend in words, each with a short sample of its line, as in the console. */
const LEGEND = [
  { label: "With Gridzilla", swatch: "h-[3px] rounded-full bg-chart-with" },
  { label: "Without Gridzilla", swatch: "border-t-2 border-dashed border-chart-without" },
  { label: "Peak eaten", swatch: "h-2.5 rounded-[3px] bg-chart-eaten/40" },
  { label: `Limit, ${STREET.ratingKw} kW`, swatch: "border-t-2 border-dashed border-chart-limit" },
];

export default function Problem() {
  return (
    <Section id="problem">
      <Reveal>
        <Title className="max-w-[24ch]">Home batteries are now the largest storage fleet in Europe. The grid operator cannot see or use a single one.</Title>
        <Intro>
          At six in the evening the street transformer hits its rating. Today the operator can only curtail solar, cut the street, or buy a bigger transformer.
        </Intro>
      </Reveal>

      <Reveal as="figure" className="m-0 mt-6 md:mt-12" amount={0.2}>
        <div className="tile p-6 md:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="m-0 text-[19px] font-semibold tracking-[-0.015em] md:text-[21px]">{STREET.name}, one street transformer</h3>
              <p className="m-0 mt-1 text-[15px] text-secondary">{STREET.houses} houses, the next 24 hours as the platform plans them</p>
            </div>
            <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0 text-[15px] text-secondary lg:text-[14px]">
              {LEGEND.map((l) => (
                <li key={l.label} className="flex items-center gap-2 whitespace-nowrap">
                  <span className={`inline-block w-5 ${l.swatch}`} aria-hidden="true" />
                  {l.label}
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-6 h-[300px] md:mt-8 md:h-[400px] lg:h-[400px]">
            <Suspense fallback={null}>
              <StreetChart
                label={`Load on the ${STREET.name} street transformer over 24 hours: without Gridzilla the evening peaks at ${r(STREET.peakWithoutKw)} kW, with Gridzilla at ${r(STREET.peakWithKw)} kW, under a ${STREET.ratingKw} kW limit.`}
              />
            </Suspense>
          </div>
        </div>
        <figcaption className="mx-auto mt-5 max-w-[60ch] text-center text-[14px] text-secondary md:mt-6 md:text-[15px]">
          One street in {STREET.name}, from the platform&rsquo;s plan: the evening peak drops from {r(STREET.peakWithoutKw)} to {r(STREET.peakWithKw)} kW, under its {STREET.ratingKw} kW transformer. Same houses, same cars, same weather.
        </figcaption>
      </Reveal>
    </Section>
  );
}
