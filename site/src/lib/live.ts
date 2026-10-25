// The real plant tile reads the Blatnica house from the live server, read-only, the way the console's Blatnica card
// does (dashboard/src/ops/demo/live.ts): same origin /api on gridzilla.victronlab.sk, the /live-api proxy anywhere
// else (vite dev and preview forward it, GET only). One poll every 30 s, aborted on unmount. GET only: this file never
// sends anything else, and never calls a write endpoint.
import { useEffect, useState } from "react";

const HH = "blatnica";
const BASE = typeof location !== "undefined" && location.host === "gridzilla.victronlab.sk" ? "/api" : "/live-api";
const STATE = `${BASE}/state?hh=${HH}&tree=0`;
const EVERY_MS = 30_000;
/** a reading older than this is shown as the last reading, without the live dot */
const FRESH_MS = 5 * 60_000;

interface Telemetry {
  soc: number | null;
  grid_kw: number | null;
  mode?: string | null;
  rx?: string;
}
interface Household {
  tf?: string;
  path?: string[];
  telemetry: Telemetry | null;
}
interface State {
  households?: Record<string, Household>;
  active?: Record<string, { mode?: string }>;
}

export interface Plant {
  /** battery state of charge, % */
  soc: number | null;
  /** grid power, kW: + import, - export */
  gridKw: number | null;
  /** the signal steering the house right now (SUPPORT, ABSORB...), or null in owner mode */
  signal: string | null;
  /** when the plant sent this reading (ms), if it said */
  at: number | null;
  fresh: boolean;
}

export type Live = { status: "loading" } | { status: "down" } | { status: "live"; plant: Plant };

/** The plant's numbers from one /api/state payload, or null when the house or its telemetry is missing. */
function read(d: State): Plant | null {
  const h = d.households?.[HH];
  const t = h?.telemetry;
  if (!h || !t) return null;
  // the active signal on the house's path wins over the telemetry's own mode (as in the console's card)
  const path = h.path ?? (h.tf ? [h.tf] : []);
  const sig = Object.entries(d.active ?? {}).find(([seg]) => path.includes(seg))?.[1]?.mode;
  const own = t.mode && t.mode.toLowerCase() !== "owner" ? t.mode : null;
  const at = t.rx ? Date.parse(t.rx) : NaN;
  return {
    soc: typeof t.soc === "number" ? t.soc : null,
    gridKw: typeof t.grid_kw === "number" ? t.grid_kw : null,
    signal: (sig ?? own)?.toUpperCase() ?? null,
    at: Number.isFinite(at) ? at : null,
    fresh: Number.isFinite(at) && Date.now() - at < FRESH_MS,
  };
}

export function useLivePlant(): Live {
  const [live, setLive] = useState<Live>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    let ctrl: AbortController | null = null;
    const load = async () => {
      ctrl?.abort();
      ctrl = new AbortController();
      try {
        const r = await fetch(STATE, { method: "GET", cache: "no-store", signal: ctrl.signal, headers: { accept: "application/json" } });
        if (!r.ok) throw new Error(String(r.status));
        const plant = read((await r.json()) as State);
        if (alive) setLive(plant ? { status: "live", plant } : { status: "down" });
      } catch (e) {
        if (alive && (e as Error).name !== "AbortError") setLive({ status: "down" });
      }
    };
    load();
    const id = window.setInterval(load, EVERY_MS);
    return () => {
      alive = false;
      ctrl?.abort();
      window.clearInterval(id);
    };
  }, []);
  return live;
}
