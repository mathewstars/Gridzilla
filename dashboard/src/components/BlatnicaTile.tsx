// "Blatnica, real plant, live": the captain's family home (Victron Cerbo GX battery + Viessmann Vitocal heat pump + EV
// charger) running on Gridzilla for real. Same fields as the operator board's Presentation tab. `?plant=sample` shows a
// labelled fixture for design reviews; without it, no live data means "offline", never invented numbers.
import { BLATNICA_DEVICE, type DevPoint, type History, type HouseholdTelemetry, type State } from "../api";
import { MODE_WORDS, nice } from "../model";
import { Badge } from "./ui";

const SAMPLE = typeof location !== "undefined" && new URLSearchParams(location.search).get("plant") === "sample";
const SAMPLE_T: HouseholdTelemetry = {
  soc: 64, grid_kw: -1.8, ev_kw: 7.2, hp_kw: 1.4, dhw_c: 47.5, dhw_set_c: 50, boiler_c: null, heat: "heatpump", ev: 11, mode: "owner",
};

const f = (v: number | null | undefined, d = 1) => (v == null ? "-" : Math.abs(v).toFixed(d));

function Spark({ pts }: { pts: DevPoint[] }) {
  const v = pts.map((p) => p.grid_kw).filter((x): x is number => x != null);
  if (v.length < 2) return null;
  const lo = Math.min(0, ...v), hi = Math.max(0.5, ...v);
  const W = 300, H = 48;
  const y = (x: number) => H - 4 - ((x - lo) / (hi - lo || 1)) * (H - 8);
  const d = v.map((x, i) => `${i ? "L" : "M"}${((i / (v.length - 1)) * W).toFixed(1)},${y(x).toFixed(1)}`).join("");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-10 w-full" aria-hidden>
      <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="#d2d2d7" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <path d={d} fill="none" stroke="#1d1d1f" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

function Stat({ value, unit, label }: { value: string; unit: string; label: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[1.5rem] font-semibold leading-none tracking-[-0.015em] tabular-nums text-ink">
        {value}
        <span className="ml-1 text-[0.9375rem] font-normal tracking-normal text-secondary">{unit}</span>
      </div>
      <div className="t-small mt-1 whitespace-nowrap">{label}</div>
    </div>
  );
}

export default function BlatnicaTile({ s, history }: { s: State; history: History | null }) {
  const h = s.households?.blatnica;
  const live = h?.telemetry ?? null;
  const t = live ?? (SAMPLE ? SAMPLE_T : null);
  const ageS = live?.rx ? Math.max(0, Math.round((Date.now() - Date.parse(live.rx)) / 1000)) : null;
  const sig = h ? Object.entries(s.active).find(([n]) => (h.path ?? []).includes(n)) : undefined;
  const pts = (history?.devices?.[BLATNICA_DEVICE] ?? []).slice(-60);

  return (
    <div className="panel @container flex h-full flex-col gap-3 px-6 py-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="t-body font-semibold">Blatnica, real home, live</h2>
          <div className="t-small mt-0.5">
            {live ? `Updated ${ageS} s ago. Real battery, heat pump and EV charger.` : SAMPLE ? "Design sample, not live data." : "Offline right now. The real home is not connected to this grid."}
          </div>
        </div>
        {!live && SAMPLE && <Badge>Sample</Badge>}
      </div>
      {t ? (
        <>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 @sm:grid-cols-4">
            <Stat value={f(t.grid_kw, 1)} unit="kW" label={t.grid_kw > 0.05 ? "From the street" : t.grid_kw < -0.05 ? "To the street" : "Balanced"} />
            <Stat value={f(t.soc, 0)} unit="%" label="Battery" />
            <Stat value={f(t.ev_kw, 1)} unit="kW" label={t.ev_kw > 0.05 ? "Car charging" : "Car idle"} />
            <Stat value={f(t.hp_kw, 1)} unit="kW" label={t.dhw_c != null ? `Heat pump ${f(t.dhw_c, 0)} °C` : "Heat pump"} />
          </div>
          {live && <div className="hidden @lg:block"><Spark pts={pts} /></div>}
          <div className="t-small mt-auto">
            {sig ? `Following Gridzilla: ${MODE_WORDS[sig[1].mode]?.title ?? sig[1].mode} on ${nice(sig[0])}.` : "The owner is in charge right now."}
            {live && h?.ack?.status ? ` Last signed reply: ${h.ack.status}.` : ""}
          </div>
        </>
      ) : null}
    </div>
  );
}
