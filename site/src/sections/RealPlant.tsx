// The real plant: a split, the live tile left and the words right; on the phone the words come first and the tile under
// them. The tile never looks empty (owner's round 2, data/gz-site/round2.md item 3): the live part on top (state of
// charge as a ring, grid kW with its direction in words, the mode as one small badge, the heat pump when the plant
// sends it, how long ago it was read) and under it the plant's fixed facts with Phosphor icons. While the first
// reading is on its way, or when the server or the plant cannot be reached, the same layout shows quiet dashes where
// the numbers go and one line saying it retries (lib/live.ts polls every 30 s); never a spinner, never old numbers.
// The accent live dot is the page's one loop (1.6 s breathe), shown only while the reading is fresh. Spec section 7.
import { useEffect, useState, type ReactNode } from "react";
import type { Icon } from "@phosphor-icons/react";
import { BatteryCharging, Car, Plugs, Thermometer } from "@phosphor-icons/react";
import { Section, Title } from "../ui/Section";
import { Reveal } from "../ui/Reveal";
import { useLivePlant, type Live, type Plant } from "../lib/live";
import "../styles/proof-plant.css";

/** The plant's fixed facts: always on the tile, whatever the live server says. */
const FACTS: { icon: Icon; text: string }[] = [
  { icon: Plugs, text: "Victron Cerbo GX and MultiPlus-II" },
  { icon: BatteryCharging, text: "Battery, owner floor 20 %" },
  { icon: Car, text: "Victron EV Charging Station, 11 kW" },
  { icon: Thermometer, text: "Viessmann Vitocal heat pump via ViCare" },
];

const fmtKw = (v: number) => `${Math.abs(v).toFixed(2)} kW`;
const ago = (s: number) => (s < 90 ? `${s} s` : s < 5400 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)} h`);

/** A quiet dash where a number goes when there is none (a drawn bar: the page's copy never uses dash characters). */
const Dash = ({ className = "" }: { className?: string }) => (
  <span role="img" aria-label="no reading" className={`inline-block h-[3px] w-[1.1em] rounded-pill bg-tertiary align-middle opacity-70 ${className}`} />
);

function useNow(on: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [on]);
  return now;
}

/** State of charge as a ring (the console's load ring, in ink): a faint track, a round-capped arc, the number inside. */
function SocRing({ soc }: { soc: number | null }) {
  const S = 132, W = 10, r = (S - W) / 2, m = S / 2;
  const pct = soc == null ? 0 : Math.max(0, Math.min(100, soc));
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
            stroke="var(--color-ink)"
            strokeWidth={W}
            strokeLinecap="round"
            strokeDasharray={`${pct} 100`}
            className="transition-[stroke-dasharray] duration-700 ease-[var(--ease-out-expo)] motion-reduce:transition-none"
          />
        )}
      </svg>
      <p className="m-0 whitespace-nowrap font-display text-[28px] font-semibold leading-none tracking-[-0.02em] text-ink t-num md:text-[34px]">
        {soc == null ? <Dash /> : <>{soc.toFixed(0)}<span className="text-[0.55em] font-medium">{" "}%</span></>}
      </p>
    </div>
  );
}

/** One live line: what it is in secondary, the reading in ink (or a quiet dash). */
const Line = ({ children }: { children: ReactNode }) => <p className="m-0 text-[15px] leading-[1.45] text-secondary md:text-[17px]">{children}</p>;
const B = ({ children }: { children: ReactNode }) => <span className="font-semibold text-ink t-num">{children}</span>;

function Grid({ kw }: { kw: number | null }) {
  if (kw == null) return <Line>Grid <Dash /></Line>;
  if (kw > 0.05) return <Line>Taking <B>{fmtKw(kw)}</B> from the grid</Line>;
  if (kw < -0.05) return <Line>Sending <B>{fmtKw(kw)}</B> back to the grid</Line>;
  return <Line>Balanced with the grid, <B>{fmtKw(kw)}</B></Line>;
}

function Tile({ live }: { live: Live }) {
  const p: Plant | null = live.status === "live" ? live.plant : null;
  const now = useNow(!!p?.at);
  const ageS = p?.at != null ? Math.max(0, Math.round((now - p.at) / 1000)) : null;
  const status = p ? (ageS != null ? `Updated ${ago(ageS)} ago` : "Live") : live.status === "down" ? "" : "Connecting";

  return (
    <div className="card flex flex-col gap-7 p-6 md:gap-8 md:p-8" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="m-0 flex items-center gap-2.5 text-[15px] font-medium text-ink">
          {p?.fresh && <span className="live-dot plant-dot" aria-hidden="true" />}
          Blatnica, Slovakia
        </p>
        {status && <p className="m-0 text-[15px] text-secondary t-num">{status}</p>}
      </div>

      <div className="flex items-center gap-6 md:gap-8">
        <div className="flex flex-col items-center gap-2">
          <SocRing soc={p?.soc ?? null} />
          <p className="m-0 text-[13px] text-secondary">Battery</p>
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <Grid kw={p?.gridKw ?? null} />
          <Line>
            Mode{" "}
            {p ? (
              <span className="ml-1 inline-flex h-7 items-center rounded-pill bg-fill px-3 align-middle text-[13px] font-semibold text-ink">
                {p.signal ?? "Owner"}
              </span>
            ) : (
              <Dash />
            )}
          </Line>
          {(!p || p.hpKw != null) && (
            <Line>
              Heat pump{" "}
              {p?.hpKw != null ? (
                <>
                  <B>{p.hpKw.toFixed(1)} kW</B>
                  {p.tankC != null && (
                    <>
                      , tank <B>{p.tankC.toFixed(1)} °C</B>
                    </>
                  )}
                </>
              ) : (
                <Dash />
              )}
            </Line>
          )}
        </div>
      </div>

      {live.status === "down" && <p className="m-0 text-[15px] text-secondary">Live data unavailable right now, retrying</p>}

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
  const live = useLivePlant();
  return (
    <Section id="plant">
      <div className="grid items-center gap-12 md:gap-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16 xl:gap-24">
        <Reveal className="order-2 lg:order-1">
          <Tile live={live} />
        </Reveal>
        <Reveal className="order-1 lg:order-2" delay={0.08}>
          <Title className="plant-title max-w-[16ch]">Two real devices, one house in Blatnica, Slovakia.</Title>
          <p className="t-lead mb-0 mt-8 max-w-[44ch] text-secondary">
            A Victron plant (Cerbo GX, MultiPlus-II, battery, EV Charging Station) and a Viessmann Vitocal heat pump through the ViCare cloud. A signed message goes out over a public broker, the battery and the heat pump move, signed acks come back.
          </p>
          <p className="mb-0 mt-8 max-w-[52ch] text-[15px] leading-[1.5] text-secondary">
            The battery sat at 20 % during the hackathon, so live demos leaned on the heat pump and the car charger.
          </p>
        </Reveal>
      </div>
    </Section>
  );
}
