// After the hackathon: the same agent flow runs the owner's own house every day (added 26 October 2026, one day after the
// pitch; restructured 27 October, the owner: "fix that wall of text, more graphics and structured"). Three layers: the
// 15-minute loop as a four-node strip (collect, advise, plan, act, each with its real timing), six device tiles (one
// number, one line each: battery, heat pump, rooms, the Tesla, the bill, the agent on the Cerbo), then the owner's words
// cut to three sentences, with the link to his home dashboard. Everything here is what the home optimizer (homeopt, in
// the owner's home-auto repo) actually does; nothing is invented. Since 26 October the house is priced on its real bill
// (fixed-price SSE contract, SSD DD5 two-tariff distribution), not on the OKTE spot market; since 27 October the Model 3
// is read over the Tesla Fleet API (SoC, charge limit, location) and its gap to the limit is the plan's EV energy.
// The dashboard, home.stafurik.com/energy, shows the plan, the prices and the ledger publicly.
import type { Icon } from "@phosphor-icons/react";
import { ArrowDown, ArrowRight, BatteryCharging, Brain, Car, Function, Lightning, Plugs, Receipt, Thermometer, WaveSine, WifiHigh } from "@phosphor-icons/react";
import { Intro, Section, Title } from "../ui/Section";
import { Reveal } from "../ui/Reveal";
import { PillLink } from "../ui/Button";
import { LINKS } from "../lib/links";

/** The loop, every 15 minutes: what each step reads or writes and how fast it runs. */
const LOOP: { icon: Icon; name: string; when: string; text: string }[] = [
  { icon: WifiHigh, name: "Collect", when: "every 10 s", text: "Cerbo GX over Modbus; ViCare, emodul, the Tesla and the weather on their own clocks" },
  { icon: Brain, name: "Advise", when: "every 30 min", text: "DeepSeek reads forecasts, prices and storage and sets four knobs; a guard clamps them" },
  { icon: Function, name: "Plan", when: "20 ms", text: "A linear program schedules the next 36 hours in 15-minute slots" },
  { icon: Lightning, name: "Act", when: "every minute", text: "Node-RED on the Cerbo, ViCare, emodul and the charger apply the slot" },
];

/** The six things under control: one number and one line each. */
const DEVICES: { icon: Icon; name: string; n: string; what: string; text: string }[] = [
  { icon: BatteryCharging, name: "Battery", n: "79 kWh", what: "22 × Dyness B3", text: "On a clear forecast the plan leaves room for the sun instead of charging from the grid at night." },
  { icon: Car, name: "Tesla Model 3", n: "300 m", what: "home radius, Fleet API", text: "State of charge, charge limit and location. Plugged in at home, the gap to the limit is charged in the cheapest quarter-hours before departure. The car is never woken." },
  { icon: Thermometer, name: "Heat pump", n: "3 h", what: "hot-water reserve, Vitocal", text: "Hot-water boosts via ViCare when the plan says so; the tank always keeps the next three hours." },
  { icon: WaveSine, name: "Rooms", n: "8", what: "TECH zones via emodul", text: "Each room moves within its own band. The two bedrooms are never heated above their sleeping setpoint." },
  { icon: Receipt, name: "The bill", n: "2", what: "tariffs, fixed price", text: "A fixed-price contract with two-tariff distribution, not the spot market. Each day's saving is booked against what the ESS would have done on its own." },
  { icon: Plugs, name: "The agent", n: "180 s", what: "to owner mode", text: "The hackathon's Node-RED agent on the Cerbo GX applies the ESS limits and hands everything back 180 s after the last command." },
];

export default function AtHome() {
  return (
    <Section id="home">
      <Reveal>
        <Title className="plant-title max-w-[22ch]">One day later, the same agent runs the house.</Title>
        <Intro>
          Since 26 October the Blatnica plant is a daily user of the hackathon stack: the signed command path, the agent on the Cerbo, the advisor that proposes and the guard that disposes.
        </Intro>
      </Reveal>

      {/* the loop: four nodes in a row from 768, an arrow between them; one column with down arrows on the phone */}
      <Reveal delay={0.05}>
        <ol className="m-0 mt-10 md:mt-14 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] md:items-stretch md:gap-2 lg:gap-3" aria-label="The loop, every 15 minutes">
          {LOOP.map(({ icon: I, name, when, text }, i) => (
            <li key={name} className="contents">
              <div className="card m-0 flex flex-col gap-3 p-5 md:p-6">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-ground text-ink" aria-hidden="true">
                    <I size={22} weight="regular" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="m-0 text-[17px] font-semibold leading-[1.2] text-ink md:text-[18px]">{name}</h3>
                    <p className="t-num m-0 mt-0.5 text-[13px] leading-[1.3] text-secondary">{when}</p>
                  </div>
                </div>
                <p className="m-0 text-[14px] leading-[1.45] text-secondary md:text-[15px]">{text}</p>
              </div>
              {i < LOOP.length - 1 && (
                <span className="flex items-center justify-center text-tertiary" aria-hidden="true">
                  <ArrowDown size={18} weight="bold" className="md:hidden" />
                  <ArrowRight size={18} weight="bold" className="max-md:hidden" />
                </span>
              )}
            </li>
          ))}
        </ol>
      </Reveal>

      {/* the six devices: three columns from 1024, two on a tablet, one on the phone */}
      <ul className="m-0 mt-4 md:mt-5 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
        {DEVICES.map(({ icon: I, name, n, what, text }, i) => (
          <Reveal as="li" key={name} delay={0.04 * i} className="min-w-0">
            <div className="flex h-full flex-col gap-4 rounded-card bg-ground p-5 md:p-6">
              <div className="flex items-center gap-2.5 text-ink">
                <I size={22} weight="regular" aria-hidden="true" className="shrink-0 text-secondary" />
                <h3 className="m-0 text-[15px] font-semibold leading-[1.2] md:text-[16px]">{name}</h3>
              </div>
              <div>
                <p className="t-num m-0 font-display text-[34px] font-semibold leading-none tracking-[-0.02em] text-ink md:text-[40px]">{n}</p>
                <p className="m-0 mt-1.5 text-[13px] leading-[1.35] text-secondary">{what}</p>
              </div>
              <p className="m-0 text-[14px] leading-[1.45] text-secondary md:text-[15px]">{text}</p>
            </div>
          </Reveal>
        ))}
      </ul>

      {/* the owner's words, three sentences, and the way to the house */}
      <Reveal delay={0.08}>
        <figure className="card m-0 mt-4 md:mt-5 flex flex-col gap-6 p-6 md:flex-row md:items-end md:justify-between md:gap-10 md:p-8">
          <div className="flex flex-col gap-5">
            <blockquote className="m-0 t-lead max-w-[48ch] text-balance text-ink">
              “The hackathon ended on Saturday. On Sunday evening the house was no longer the demo plant but a daily user of the same stack. Its first plan did what I would have done by hand, and said why.”
            </blockquote>
            <figcaption className="m-0 text-[15px] leading-[1.5] text-secondary">
              <span className="font-semibold text-ink">Matej Stafurik</span>, owner of the Blatnica plant, victronlab.sk. The plan, the prices and the savings ledger are public on his home dashboard.
            </figcaption>
          </div>
          <PillLink href={LINKS.home} tone="secondary" className="shrink-0 self-start md:self-end">
            See the house live
          </PillLink>
        </figure>
      </Reveal>
    </Section>
  );
}
