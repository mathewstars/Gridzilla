// After the hackathon: the same agent flow runs the owner's own house every day (added 26 October 2026, one day after the
// pitch; restructured 27 October, the owner: "fix that wall of text, more graphics and structured", then "still too long,
// make normal text only caption, and say more in smaller"). Four layers: the loop as a four-node strip (collect, advise,
// plan, act, each with its real timing), the advisor panel (DeepSeek, self-hosted on the team's DGX Spark: what it sees,
// what it may turn, what it never does; the owner asked for this to be explicit), six device tiles (one number, a
// one-line caption in normal type, the detail in small print), then the owner's words in three sentences with the link
// to his home dashboard. Everything here is what the home optimizer (homeopt, in the owner's home-auto repo) actually does
// as of 27 October 2026 (HOMEOPT.md there is the source); nothing is invented. Priced on the real bill (fixed-price SSE
// contract, SSD DD5 two-tariff distribution), not on the OKTE spot market, since 26 October; the Model 3 over the Tesla
// Fleet API since 27 October (charge state, position, return prediction into the plan).
import type { Icon } from "@phosphor-icons/react";
import { ArrowDown, ArrowRight, BatteryCharging, Brain, Car, Eye, Function, Lightning, Plugs, Prohibit, Receipt, SlidersHorizontal, Thermometer, WaveSine, WifiHigh } from "@phosphor-icons/react";
import { Intro, Section, Title } from "../ui/Section";
import { Reveal } from "../ui/Reveal";
import { PillLink } from "../ui/Button";
import { LINKS } from "../lib/links";

/** The loop, every 15 minutes: what each step does and how fast it runs. */
const LOOP: { icon: Icon; name: string; when: string; text: string }[] = [
  { icon: WifiHigh, name: "Collect", when: "every 10 s", text: "Cerbo GX over Modbus; ViCare, emodul, the Tesla and the weather on their own clocks" },
  { icon: Brain, name: "Advise", when: "hourly", text: "DeepSeek judges the forecast, the house and the car and turns five bounded knobs; a guard clamps them" },
  { icon: Function, name: "Plan", when: "20 ms", text: "A linear program schedules the next 36 hours in 15-minute slots" },
  { icon: Lightning, name: "Act", when: "every minute", text: "Node-RED on the Cerbo, ViCare, emodul and the charger apply the slot" },
];

/** The advisor, in three columns: what it reads, what it may turn, what it never does. */
const ADVISOR: { icon: Icon; head: string; items: string[] }[] = [
  { icon: Eye, head: "It sees", items: ["Weather and solar forecast", "Tomorrow's prices", "Battery, tank and room state", "The car: where it is, its 24 h track, whether it is getting closer", "Its own advice of the last 24 h", "The last plan and the savings ledger"] },
  { icon: SlidersHorizontal, head: "It turns, within bounds", items: ["Solar confidence 0.3 to 1.0", "Battery reserve 20 to 60 %", "Hot-water boost, yes or no", "Room pre-heat, yes or no", "Its own car call: the chance the car is back and plugged in by 18:00, 0 to 1", "One sentence for the owner, two for the log"] },
  { icon: Prohibit, head: "It never", items: ["Writes to a device", "Sets a setpoint or a power", "Moves a knob past its range", "Moves a knob faster than the step limit", "Runs without the guard", "Blocks the plan: if the call fails, the program runs on the last advice or none"] },
];

/** The six things under control: one number, a caption, the detail in small print. */
const DEVICES: { icon: Icon; name: string; n: string; what: string; cap: string; small: string }[] = [
  { icon: BatteryCharging, name: "Battery", n: "79 kWh", what: "22 × Dyness B3", cap: "Room for the sun comes first.", small: "On a day with forecast surplus the battery must have space for 90 % of it by the first sunny slot, so a clear tomorrow is never pre-empted by charging from the grid at night. Leftover energy is valued at the cheapest quartile, never more." },
  { icon: Car, name: "Tesla Model 3", n: "95 %", what: "comes home from Žilina range", cap: "Charge state and position drive the plan.", small: "Fleet API: charge state, charge limit, plugged, position. At home and plugged in, the gap to the limit is charged in the cheapest quarter-hours before departure. Heading home, it is planned in from its ETA. Away, it is planned back by 18:00 with the gap weighted by a return chance (Žilina range 95 %, Bratislava 80 %, further 0); a day without getting closer and it drops off the plan. The advisor gives its own return chance from the car's day, and the plan prefers it. Polled at most hourly, never woken." },
  { icon: Thermometer, name: "Heat pump", n: "3 h", what: "hot-water reserve, Vitocal", cap: "Boosts when the plan says so.", small: "Via ViCare: setpoint up and a one-time charge when the plan heats water, back to normal otherwise. The tank always keeps the next three hours of draw. Heat demand is a lumped house model with the pump's COP against outside temperature." },
  { icon: WaveSine, name: "Rooms", n: "8", what: "TECH zones via emodul", cap: "Each within its own band.", small: "The floor slab stores heat: the plan may push a room up or down inside the owner's band for 45 minutes at a time when that is cheaper. The two bedrooms have no upward band at all and are never heated above their sleeping setpoint." },
  { icon: Receipt, name: "The bill", n: "2", what: "tariffs, fixed price", cap: "The real tariff, not the spot market.", small: "A fixed-price contract with two-tariff distribution and VAT; export is valued as the virtual-battery credit, the cheap-tariff energy you will not have to buy later. Each day's net cost is booked against a baseline run on the same inputs: ESS self-consumption, heat pump on demand, car as soon as plugged." },
  { icon: Plugs, name: "The agent", n: "180 s", what: "to owner mode", cap: "The hackathon flow, on the real Cerbo.", small: "Node-RED on the Cerbo GX writes the ESS grid setpoint, measured loads minus solar plus the planned battery power, and the charge and discharge ceilings. It snapshots the owner's settings on the first write and restores them 180 s after the last command, on pause, or when the optimizer goes quiet." },
];

export default function AtHome() {
  return (
    <Section id="home">
      <Reveal>
        <Title className="plant-title max-w-[22ch]">One day later, the same agent runs the house.</Title>
        <Intro>Since 26 October the Blatnica plant is a daily user of the hackathon stack.</Intro>
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
                <p className="m-0 text-[13px] leading-[1.45] text-secondary">{text}</p>
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

      {/* the advisor: who it is, then three columns */}
      <Reveal delay={0.06}>
        <div className="mt-4 md:mt-5 rounded-card bg-ground p-5 md:p-8">
          <div className="flex flex-col gap-2 md:flex-row md:items-baseline md:justify-between md:gap-8">
            <h3 className="m-0 text-[20px] font-semibold leading-[1.2] tracking-[-0.015em] text-ink md:text-[24px]">The advisor is a model. The controller is a program.</h3>
            <p className="m-0 text-[13px] leading-[1.45] text-secondary md:max-w-[46ch] md:text-right">
              DeepSeek, self-hosted on the team's NVIDIA DGX Spark, the same gateway Gridzilla used at the hackathon. No cloud, no vendor account.
            </p>
          </div>
          <ul className="m-0 mt-6 grid list-none grid-cols-1 gap-6 p-0 md:mt-8 md:grid-cols-3 md:gap-8">
            {ADVISOR.map(({ icon: I, head, items }) => (
              <li key={head} className="min-w-0">
                <div className="flex items-center gap-2.5 text-ink">
                  <I size={20} weight="regular" aria-hidden="true" className="shrink-0 text-secondary" />
                  <h4 className="m-0 text-[15px] font-semibold leading-[1.2] md:text-[16px]">{head}</h4>
                </div>
                <ul className="m-0 mt-3 grid list-none gap-1.5 p-0">
                  {items.map((t) => (
                    <li key={t} className="flex gap-2 text-[13px] leading-[1.45] text-secondary">
                      <span className="mt-[9px] size-1 shrink-0 rounded-full bg-tertiary" aria-hidden="true" />
                      {t}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <p className="m-0 mt-6 text-[13px] leading-[1.45] text-tertiary md:mt-8">
            Hourly, told to stay consistent with its own day unless something material changed. Per call the guard allows the reserve to move 10 points, the solar confidence 0.2 and the car call 0.3, so a flip-flopping model can only drift. The last advice survives a restart.
          </p>
        </div>
      </Reveal>

      {/* the six devices: three columns from 1024, two on a tablet, one on the phone */}
      <ul className="m-0 mt-4 md:mt-5 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
        {DEVICES.map(({ icon: I, name, n, what, cap, small }, i) => (
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
              <p className="m-0 text-[15px] font-medium leading-[1.4] text-ink md:text-[16px]">{cap}</p>
              <p className="m-0 -mt-1 text-[13px] leading-[1.45] text-tertiary">{small}</p>
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
