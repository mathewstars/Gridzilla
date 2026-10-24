import { lazy, Suspense, useMemo, useState } from "react";
import type { State } from "../../api";
import { COLORS, loadColor, nice, type House } from "../../model";
import { buildStreets, type StreetModel } from "./layout";
import type { HoverInfo } from "./Street3D";

const Street3D = lazy(() => import("./Street3D"));

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function houseLines(h: House) {
  if (!h.online) return ["Offline: no telemetry from this house right now"];
  const out: string[] = [];
  const g = h.grid_kw;
  out.push(Math.abs(g) < 0.15 ? "Balanced: not using the street at all" : g > 0 ? `Taking ${g.toFixed(1)} kW from the street` : `Giving ${Math.abs(g).toFixed(1)} kW back to the street`);
  if (h.kwh > 0 && h.soc != null) out.push(`Battery ${Math.round(h.soc)} % full (${((h.kwh * h.soc) / 100).toFixed(1)} of ${h.kwh} kWh)`);
  if (h.pv_kw > 0.05) out.push(`Solar making ${h.pv_kw.toFixed(1)} kW`);
  if (h.ev_kw > 0.05) out.push(`Car charging at ${h.ev_kw.toFixed(1)} kW`);
  if (h.hp_kw > 0.05) out.push(`Heat pump running at ${h.hp_kw.toFixed(1)} kW`);
  out.push(h.underSignal ? `Following a Gridzilla signal (${h.mode})` : "Owner mode: runs its own battery");
  if (h.ackStatus === "refused") out.push(`Refused the last signal${h.ackReason ? `: ${h.ackReason.replace("_", " ")}` : ""}`);
  if (h.ackStatus === "partial") out.push(`Obeyed partly${h.ackReason ? ` (${h.ackReason.replace("_", " ")})` : ""}`);
  return out;
}

function Tooltip({ hover }: { hover: HoverInfo }) {
  let title = "",
    sub = "",
    lines: string[] = [];
  if (hover.kind === "house" && hover.house) {
    const h = hover.house;
    title = h.real ? `${h.name} (real house)` : h.name;
    sub = `In the program, stands for ${h.represents} homes`;
    lines = houseLines(h);
  } else if (hover.kind === "normal" && hover.street) {
    title = "Normal house";
    sub = "Not in the program";
    lines = [`One of ${hover.street.others} houses on ${nice(hover.street.tf)} that Gridzilla cannot steer`];
  } else if (hover.kind === "tf" && hover.street) {
    const st = hover.street;
    title = `${nice(st.tf)} street transformer`;
    sub = `${st.tf} · ${st.rating} kVA`;
    lines = [
      st.load_kw == null ? "No data yet" : st.load_kw >= 0 ? `Carrying ${Math.round(st.load_kw)} kW to the houses` : `Pushing ${Math.round(-st.load_kw)} kW back up the line`,
      st.pct == null ? "" : `${Math.abs(st.pct)} % of its limit${Math.abs(st.pct) >= 100 ? ": overloaded" : Math.abs(st.pct) >= 85 ? ": close to the limit" : ""}`,
      "Click to show its curve",
    ].filter(Boolean);
  }
  return (
    <div
      className="pointer-events-none absolute z-20 w-[17rem] rounded-2xl bg-[#0d1420]/95 p-3.5 shadow-[0_20px_50px_-10px_rgb(0_0_0/0.9),inset_0_0_0_1px_rgb(255_255_255/0.08)] backdrop-blur"
      style={{ left: Math.max(8, hover.x + 16), top: Math.max(8, hover.y - 20) }}
    >
      <div className="text-[0.95rem] font-semibold">{title}</div>
      <div className="tech mb-2">{sub}</div>
      <ul className="space-y-1 text-[0.82rem] leading-snug text-fg/90">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  );
}

/** Flat drawing of the same street for machines without WebGL. */
function Street2D({ streets, selected, onSelect }: { streets: StreetModel[]; selected: string; onSelect: (tf: string) => void }) {
  return (
    <div className="grid h-full grid-cols-1 gap-4 overflow-auto p-4 sm:grid-cols-2">
      {streets.map((st) => {
        const c = loadColor(st.pct);
        return (
          <button key={st.tf} onClick={() => onSelect(st.tf)} className={`rounded-2xl bg-black/30 p-4 text-left ${selected === st.tf ? "ring-1 ring-fg/40" : ""}`}>
            <div className="flex items-baseline justify-between">
              <span className="font-semibold">{nice(st.tf)}</span>
              <span className="num text-xl font-semibold" style={{ color: c }}>
                {st.pct == null ? "-" : `${Math.abs(st.pct)} %`}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {st.houses.map(({ house: h }) => (
                <span
                  key={h.key}
                  title={houseLines(h).join("\n")}
                  className="num rounded-lg px-2 py-1 text-[0.75rem]"
                  style={{
                    background: h.underSignal ? `${COLORS.signal}33` : "#1a2433",
                    color: !h.online ? COLORS.muted : h.grid_kw > 0.15 ? COLORS.take : h.grid_kw < -0.15 ? COLORS.give : "#eef3f9",
                  }}
                >
                  {h.online ? `${h.grid_kw > 0 ? "+" : ""}${h.grid_kw.toFixed(1)} kW` : "offline"}
                </span>
              ))}
            </div>
            <div className="tech mt-2">+ {st.others} houses not in the program</div>
          </button>
        );
      })}
    </div>
  );
}

export default function StreetPanel({ s, feeder, selected, onSelect, compact }: { s: State; feeder: string; selected: string; onSelect: (tf: string) => void; compact: boolean }) {
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const gl = useMemo(hasWebGL, []);
  const streets = useMemo(() => buildStreets(s, feeder, compact ? 2 : 4), [s, feeder, compact]);
  return (
    <div className="relative h-full w-full overflow-hidden rounded-[inherit]">
      {gl ? (
        <Suspense fallback={<div className="absolute inset-0 animate-pulse bg-deck-2/40" />}>
          <Street3D streets={streets} selected={selected} onSelect={onSelect} onHover={setHover} compact={compact} />
        </Suspense>
      ) : (
        <Street2D streets={streets} selected={selected} onSelect={onSelect} />
      )}
      {hover && <Tooltip hover={hover} />}
    </div>
  );
}
