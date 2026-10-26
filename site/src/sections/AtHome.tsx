// After the hackathon: the same agent flow runs the owner's own house every day (added 26 October 2026, one day after the
// pitch). Left: the owner's words. Right: what runs, as facts with Phosphor icons, and four small numbers. Everything here is
// what the home optimizer (homeopt, in the owner's home-auto repo) actually did on its first evening; nothing is invented.
import type { Icon } from "@phosphor-icons/react";
import { BatteryCharging, Car, Plugs, Thermometer } from "@phosphor-icons/react";
import { Section, Title } from "../ui/Section";
import { Reveal } from "../ui/Reveal";

const RUNS: { icon: Icon; text: string }[] = [
  { icon: BatteryCharging, text: "22 × Dyness B3, 79 kWh: planned every 15 minutes against OKTE spot prices; on a clear forecast it leaves room for the sun instead of charging from the grid at night" },
  { icon: Thermometer, text: "Vitocal heat pump: hot-water boosts and room offsets within per-room bands via ViCare and the TECH room controller; the two bedrooms are never heated above their sleeping setpoint" },
  { icon: Car, text: "Victron EV Charging Station, 11 kW: charges in the cheapest quarter-hours before the morning departure" },
  { icon: Plugs, text: "The hackathon's Node-RED agent on the Cerbo GX applies the ESS limits and hands everything back to the owner 180 s after the last command" },
];

const NUMBERS: { n: string; what: string }[] = [
  { n: "15 min", what: "planning step, OKTE day-ahead" },
  { n: "20 ms", what: "to solve the 36-hour plan" },
  { n: "4", what: "actuators under control" },
  { n: "180 s", what: "to owner mode if the optimizer goes quiet" },
];

export default function AtHome() {
  return (
    <Section id="home">
      <Reveal>
        <Title className="plant-title max-w-[22ch]">One day later, the same agent runs the house.</Title>
      </Reveal>
      <div className="mt-6 md:mt-12 grid items-start gap-10 lg:grid-cols-2 lg:gap-16 xl:gap-24">
        <Reveal>
          <figure className="card m-0 flex flex-col gap-6 p-6 md:p-8">
            <blockquote className="m-0 t-lead text-balance text-ink">
              “The hackathon ended on Saturday. On Sunday evening the Blatnica house was no longer the demo plant but a daily user of the same stack: the agent flow on the Cerbo, the signed command path, the advisor-proposes-guard-disposes pattern. Its first plan did what I would have done by hand, and said why: hold the battery at its floor, no grid charging tonight, let the clear morning fill it before the evening price spike.”
            </blockquote>
            <figcaption className="m-0 text-[15px] leading-[1.5] text-secondary">
              <span className="font-semibold text-ink">Matej Stafurik</span>, owner of the Blatnica plant, victronlab.sk. The optimizer, DeepSeek as the advisor and a linear program as the planner, lives in his home-automation repo next to the sprinklers and the chicken guard.
            </figcaption>
          </figure>
        </Reveal>
        <Reveal delay={0.08}>
          <div className="flex flex-col gap-6">
            <ul className="card m-0 grid list-none gap-4 p-6 md:p-8">
              {RUNS.map(({ icon: I, text }) => (
                <li key={text} className="flex items-start gap-3 text-[15px] leading-[1.45] text-ink md:text-[16px]">
                  <I size={22} weight="regular" aria-hidden="true" className="mt-px shrink-0 text-secondary" />
                  {text}
                </li>
              ))}
            </ul>
            <dl className="m-0 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {NUMBERS.map(({ n, what }) => (
                <div key={what} className="rounded-card bg-ground p-4">
                  <dt className="m-0 font-display text-[26px] font-semibold leading-none tracking-[-0.02em] text-ink t-num md:text-[30px]">{n}</dt>
                  <dd className="m-0 mt-2 text-[13px] leading-[1.35] text-secondary">{what}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
