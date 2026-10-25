// The real plant: the title centred over a split of two equal halves (round 4), the words left and the tile right, both
// centred against each other; on the phone the words come first and the tile under them. The tile is a still: the real plant's last reading as the console's Blatnica
// card showed it on 25 October 2026 at 15:41 (the console capture public/shots/console.webp as of commit 1158cd3,
// "live, updated 6 s ago"), labelled with that
// date and time, never polled (owner, round 3: "we do not care if it is live"). State of charge as a ring in green,
// grid kW with its direction in words, the mode as one small badge, the car charger and the heat pump; under it the
// plant's fixed facts with Phosphor icons. Spec section 7.
import type { ReactNode } from "react";
import type { Icon } from "@phosphor-icons/react";
import { BatteryCharging, Car, Plugs, Thermometer } from "@phosphor-icons/react";
import { Section, Title } from "../ui/Section";
import { Reveal } from "../ui/Reveal";
import "../styles/proof-plant.css";

/** The last reading, copied from the console capture (never invented): grid + import, battery %, car charger, heat pump. */
const READING = { when: "25 October 2026, 15:41", soc: 48, gridKw: 0.09, evKw: 0.0, evState: "idle", hpKw: 3.0, mode: "Owner" };

/** The plant's fixed facts, under the reading. */
const FACTS: { icon: Icon; text: string }[] = [
  { icon: Plugs, text: "Victron Cerbo GX and MultiPlus-II" },
  { icon: BatteryCharging, text: "Battery, owner floor 20 %" },
  { icon: Car, text: "Victron EV Charging Station, 11 kW" },
  { icon: Thermometer, text: "Viessmann Vitocal heat pump via ViCare" },
];

const fmtKw = (v: number) => `${Math.abs(v).toFixed(2)} kW`;

/** State of charge as a ring (the console's load ring, in green): a faint track, a round-capped arc, the number inside. */
function SocRing({ soc }: { soc: number }) {
  const S = 132, W = 10, r = (S - W) / 2, m = S / 2;
  const pct = Math.max(0, Math.min(100, soc));
  // one lap drawn from 12 o'clock clockwise, so the arc needs no rotation (nothing is left transformed)
  const lap = `M${m},${m - r}A${r},${r} 0 1 1 ${m - 0.01},${m - r}`;
  return (
    <div className="relative grid size-[112px] shrink-0 place-items-center md:size-[132px]">
      <svg viewBox={`0 0 ${S} ${S}`} className="absolute inset-0 size-full" aria-hidden="true">
        <circle cx={m} cy={m} r={r} fill="none" stroke="var(--color-fill)" strokeWidth={W} />
        {pct > 0 && (
          <path
            d={lap}
            pathLength={100}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={W}
            strokeLinecap="round"
            strokeDasharray={`${pct} 100`}
            className="transition-[stroke-dasharray] duration-700 ease-[var(--ease-out-expo)] motion-reduce:transition-none"
          />
        )}
      </svg>
      <p className="m-0 whitespace-nowrap font-display text-[28px] font-semibold leading-none tracking-[-0.02em] text-ink t-num md:text-[34px]">
        {soc.toFixed(0)}
        <span className="text-[0.55em] font-medium">{" "}%</span>
      </p>
    </div>
  );
}

/** One line of the reading: what it is in secondary, the value in ink. */
const Line = ({ children }: { children: ReactNode }) => <p className="m-0 text-[15px] leading-[1.45] text-secondary md:text-[17px]">{children}</p>;
const B = ({ children }: { children: ReactNode }) => <span className="font-semibold text-ink t-num">{children}</span>;

function Grid({ kw }: { kw: number }) {
  if (kw > 0.05) return <Line>Taking <B>{fmtKw(kw)}</B> from the grid</Line>;
  if (kw < -0.05) return <Line>Sending <B>{fmtKw(kw)}</B> back to the grid</Line>;
  return <Line>Balanced with the grid, <B>{fmtKw(kw)}</B></Line>;
}

function Tile() {
  const r = READING;
  return (
    <div className="card flex flex-col gap-7 p-6 md:gap-8 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="m-0 text-[15px] font-medium text-ink">Blatnica, Slovakia</p>
        <p className="m-0 text-[15px] text-secondary t-num">Last reading, {r.when}</p>
      </div>

      <div className="flex items-center gap-6 md:gap-8">
        <div className="flex flex-col items-center gap-2">
          <SocRing soc={r.soc} />
          <p className="m-0 text-[13px] text-secondary">Battery</p>
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <Grid kw={r.gridKw} />
          <Line>
            Mode{" "}
            <span className="ml-1 inline-flex h-7 items-center rounded-pill bg-fill px-3 align-middle text-[13px] font-semibold text-ink">{r.mode}</span>
          </Line>
          <Line>
            Car charger <B>{r.evKw.toFixed(1)} kW</B>, {r.evState}
          </Line>
          <Line>
            Heat pump <B>{r.hpKw.toFixed(1)} kW</B>
          </Line>
        </div>
      </div>

      <ul className="m-0 grid list-none gap-x-6 gap-y-3 rounded-card bg-ground p-5 sm:grid-cols-2 md:p-6 lg:grid-cols-1 xl:grid-cols-2">
        {FACTS.map(({ icon: I, text }) => (
          <li key={text} className="flex items-start gap-3 text-[15px] leading-[1.35] text-ink">
            <I size={20} weight="regular" aria-hidden="true" className="mt-px shrink-0 text-secondary" />
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function RealPlant() {
  return (
    <Section id="plant">
      <Reveal>
        <Title className="plant-title max-w-[20ch]">Two real devices, one house in Blatnica, Slovakia.</Title>
      </Reveal>
      <div className="mt-12 grid items-center gap-12 lg:grid-cols-2 lg:gap-16 xl:gap-24">
        <Reveal>
          <p className="t-lead mx-auto my-0 max-w-[44ch] text-balance text-center text-secondary lg:mx-0 lg:text-left">
            During the hackathon, 23 to 25 October, a Victron plant (Cerbo GX, MultiPlus-II, battery, EV Charging Station) and a Viessmann Vitocal heat pump through the ViCare cloud ran on this house. A signed message went out over a public broker, the battery and the heat pump moved, signed acks came back.
          </p>
          <p className="mx-auto mb-0 mt-6 max-w-[52ch] text-center text-[15px] leading-[1.5] text-secondary lg:mx-0 lg:text-left">
            The battery sat at 20 % during the hackathon, so live demos leaned on the heat pump and the car charger.
          </p>
        </Reveal>
        <Reveal delay={0.08}>
          <Tile />
        </Reveal>
      </div>
    </Section>
  );
}
