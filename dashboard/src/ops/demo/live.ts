// The demo's Blatnica card reads the REAL plant from the live server, whatever the rest of the demo reads.
// Base: same origin on gridzilla.victronlab.sk, the ?api= base when set, the dev proxy /live-api under `npm run dev`;
// anywhere else (a local platform build) there is no route to the plant: no request, the card says it is waiting.
// GET only (never a POST from here). Each payload stays on window.__gz as "live:state" / "live:history" so the G2
// truth gate can trace every number the card shows (data-src="live:state/...").
import { useEffect, useState } from "react";
import { API_BASE, type Ack, type DevPoint, type Signal } from "../../api";

export const LIVE_HH = "blatnica";
export const LIVE_DEVICE = "real-powerplant-blatnica";

export const LIVE_BASE: string | null = (() => {
  if (typeof location !== "undefined" && location.hostname === "gridzilla.victronlab.sk") return "/api";
  if (API_BASE) return `${API_BASE}/api`;
  return import.meta.env.DEV ? "/live-api" : null;
})();

const STATE_PATH = `/state?hh=${LIVE_HH}&tree=0`;
const HISTORY_PATH = `/history?devices=${LIVE_DEVICE}&limit=120`;

/** The household fields the card reads (the live server may send more; heat fields are optional per plant). */
export interface LiveTelemetry {
  soc: number | null;
  grid_kw: number | null;
  ev_kw: number | null;
  hp_kw: number | null;
  ev?: number | null;
  dhw_c?: number | null;
  dhw_set_c?: number | null;
  heat_set_c?: number | null;
  flow_c?: number | null;
  rx?: string;
}
export interface LiveHousehold {
  id: string;
  tf?: string;
  path?: string[];
  kwh?: number;
  telemetry: LiveTelemetry | null;
  ack: (Partial<Pick<Ack, "status" | "reason" | "seq" | "verified">>) | null;
}
export interface LiveState {
  households?: Record<string, LiveHousehold>;
  active?: Record<string, Pick<Signal, "seq" | "mode" | "segment">>;
}
export interface LiveHistory {
  devices?: Record<string, DevPoint[]>;
}

function publish(key: string, d: unknown) {
  const w = window as unknown as { __gz?: Record<string, unknown> };
  const gz = (w.__gz ??= {});
  gz[key] = d;
  gz[`${key}@`] = Date.now();
}

async function getLive<T>(path: string, signal: AbortSignal): Promise<T> {
  const r = await fetch(`${LIVE_BASE}${path}`, { method: "GET", cache: "no-store", signal });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json() as Promise<T>;
}

/** Poll one live path every `ms`; returns the last good payload, or null once a poll fails (never stale numbers). */
function useLivePoll<T>(path: string, key: string, ms: number): { data: T | null; failed: boolean } {
  const [res, setRes] = useState<{ data: T | null; failed: boolean }>({ data: null, failed: false });
  useEffect(() => {
    let alive = true;
    let ctrl: AbortController | null = null;
    const load = async () => {
      ctrl?.abort();
      ctrl = new AbortController();
      try {
        const d = await getLive<T>(path, ctrl.signal);
        if (!alive) return;
        publish(key, d);
        setRes({ data: d, failed: false });
      } catch (e) {
        if (!alive || (e as Error).name === "AbortError") return;
        setRes({ data: null, failed: true });
      }
    };
    if (LIVE_BASE == null) return; // no route to the plant from here
    load();
    const id = window.setInterval(load, ms);
    return () => {
      alive = false;
      ctrl?.abort();
      window.clearInterval(id);
    };
  }, [path, key, ms]);
  return res;
}

export function useLiveBlatnica() {
  const st = useLivePoll<LiveState>(STATE_PATH, "live:state", 5000);
  const hi = useLivePoll<LiveHistory>(HISTORY_PATH, "live:history", 10000);
  return { state: st.data, stateFailed: st.failed, history: hi.data };
}

/** Nice y ticks for the 30-minute line: at most 4, always including zero, the domain snapped to them. */
export function kwTicks(values: number[]): { lo: number; hi: number; ticks: number[] } {
  let lo = Math.min(0, ...values);
  let hi = Math.max(0, ...values);
  if (hi - lo < 0.2) hi = lo + 0.2;
  const steps = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100];
  for (const s of steps) {
    const a = Math.floor(lo / s - 1e-9) * s;
    const b = Math.ceil(hi / s - 1e-9) * s;
    if (Math.round((b - a) / s) + 1 <= 4) {
      lo = a;
      hi = b;
      const ticks: number[] = [];
      for (let v = a; v <= b + s / 2; v += s) ticks.push(Math.round(v * 100) / 100);
      return { lo, hi, ticks };
    }
  }
  return { lo, hi, ticks: [lo, 0, hi] };
}

// ---- ?plant=sample: a labelled design fixture (data-src="sample"), only when the live plant sends nothing
export const PLANT_SAMPLE = typeof location !== "undefined" && new URLSearchParams(location.search).get("plant") === "sample";
export const SAMPLE_HH: LiveHousehold = {
  id: LIVE_HH,
  tf: "tf:atzgersdorf-1",
  kwh: 15,
  telemetry: { soc: 20, grid_kw: 3.63, ev_kw: 0, hp_kw: 3.0, ev: 11, dhw_c: 48.9, dhw_set_c: 40, heat_set_c: 21, flow_c: 35 },
  ack: { status: "reverted", reason: "window_end", verified: true },
};
export const SAMPLE_POINTS: DevPoint[] = Array.from({ length: 120 }, (_, i) => ({
  ts: new Date(Date.now() - (119 - i) * 15000).toISOString(),
  h: 0,
  soc: 20,
  grid_kw: Math.round((1.4 + 1.9 * Math.sin(i / 11) + 0.6 * Math.sin(i / 3.1) + (i > 100 ? 1.2 : 0)) * 100) / 100,
  mode: "owner",
  imp_cap: null,
  exp_cap: null,
}));
