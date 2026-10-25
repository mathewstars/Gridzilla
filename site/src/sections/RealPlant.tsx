// The real plant: a split on the quiet tint. Left a live tile (lib/live.ts: the Blatnica house read from the live
// server every 30 s), right the words; on the phone the words come first and the tile under them. The tile leads with
// the battery's state of charge, then grid kW and the current mode. While the first reading is on its way it shows its
// own shape in soft blocks (no spinner); when the server cannot be reached it says so quietly in the same shape.
// The accent live dot is the page's one loop (1.6 s breathe), shown only while the reading is fresh. Spec section 7.
import type { ReactNode } from "react";
import { Section, Title } from "../ui/Section";
import { Reveal } from "../ui/Reveal";
import { useLivePlant, type Live } from "../lib/live";
import "../styles/proof-plant.css";

const clock = (ms: number) => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
const kw = (v: number) => `${v > 0.005 ? "+" : v < -0.005 ? "−" : ""}${Math.abs(v).toFixed(2)}`;
const gridWords = (v: number | null) =>
  v == null ? "Grid" : v > 0.05 ? "Taken from the grid" : v < -0.05 ? "Sent back to the grid" : "Balanced with the grid";

/** A blank block the size of the value it stands for, while the first reading is on its way. */
const Hold = ({ className }: { className: string }) => <span className={`block rounded-[10px] bg-fill ${className}`} aria-hidden="true" />;

function Stat({ value, unit, children, big }: { value: ReactNode; unit?: string; children: ReactNode; big?: boolean }) {
  return (
    <div className="min-w-0">
      <p className={`m-0 whitespace-nowrap font-display font-semibold text-ink t-num ${big ? "plant-big" : "plant-mid"}`}>
        {value}
        {unit && <span className="plant-unit font-medium">{" "}{unit}</span>}
      </p>
      <p className="mb-0 mt-3 text-[15px] leading-[1.4] text-secondary">{children}</p>
    </div>
  );
}

function Tile({ live }: { live: Live }) {
  const p = live.status === "live" ? live.plant : null;
  const head = (
    <div className="flex items-center justify-between gap-4">
      <p className="m-0 flex items-center gap-2.5 text-[15px] font-medium text-ink">
        {p?.fresh && <span className="live-dot plant-dot" aria-hidden="true" />}
        {p ? (p.fresh ? "Live from Blatnica" : "Blatnica, last reading") : "Blatnica"}
      </p>
      {p?.at != null && <p className="m-0 text-[15px] text-secondary t-num">Updated {clock(p.at)}</p>}
    </div>
  );

  return (
    <div className="card plant-tile flex flex-col p-7 md:p-9" aria-live="polite" aria-busy={live.status === "loading"}>
      {head}
      {live.status === "down" ? (
        <div className="flex flex-1 items-center">
          <p className="m-0 text-[17px] text-secondary">Live data unavailable right now</p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col justify-end gap-10 pt-12">
          <Stat big value={p ? (p.soc == null ? "n/a" : p.soc.toFixed(0)) : <Hold className="plant-hold-big" />} unit={p && p.soc != null ? "%" : undefined}>
            Battery state of charge
          </Stat>
          <div className="grid grid-cols-2 gap-6">
            <Stat value={p ? (p.gridKw == null ? "n/a" : kw(p.gridKw)) : <Hold className="plant-hold-mid" />} unit={p && p.gridKw != null ? "kW" : undefined}>
              {gridWords(p?.gridKw ?? null)}
            </Stat>
            <Stat value={p ? <span className="uppercase">{p.signal ?? "Owner"}</span> : <Hold className="plant-hold-mid" />}>
              {p?.signal ? "Signal steering the house" : "Mode, no signal active"}
            </Stat>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RealPlant() {
  const live = useLivePlant();
  return (
    <Section id="plant" className="bg-ground">
      <div className="grid items-center gap-12 md:gap-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-20 xl:gap-28">
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
