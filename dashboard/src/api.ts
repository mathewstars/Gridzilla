// Data shapes of the Gridzilla platform API (platform/gridzilla.py) and the polling hooks that keep them fresh.
// Same-origin relative URLs only: the page is served by the platform itself at /static/new/.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type Mode = "PREPARE" | "ABSORB" | "SUPPORT" | "STRETCH" | "RECOVER" | "RELEASE";

export interface TreeNode {
  parent: string | null;
  rating_kw?: number;
  reverse_kw?: number;
  other_houses?: number;
}

export interface Envelope {
  slot_s: number;
  slot_sim_min: number;
  start_sim_h: number;
  import_max_kw: number[] | null;
  export_max_kw: number[] | null;
}

export interface Signal {
  seq: number;
  issued_at: string;
  segment: string;
  mode: Mode;
  valid_from: string;
  valid_to: string;
  import_max_kw: number | null;
  export_max_kw: number | null;
  export_min_kw: number | null;
  charge_max_kw: number | null;
  discharge_max_kw: number | null;
  target_soc: number | null;
  max_soc_by: number | null;
  note: string;
  cohort: [number, number] | null;
  envelope?: Envelope;
}

export interface Telemetry {
  soc: number;
  grid_kw: number;
  load_kw?: number;
  pv_kw?: number;
  batt_kw?: number;
  ev_kw?: number;
  hp_kw?: number;
  dhw_c?: number | null;
  dhw_set_c?: number | null;
  heat?: string | null;
  mode?: string;
  imp_cap_kw?: number | null;
  exp_cap_kw?: number | null;
  sim_hour?: number;
  ts?: string;
  rx?: string;
}

export interface Ack {
  device: string;
  seq: number | null;
  status: "applied" | "partial" | "refused" | "reverted";
  reason: string | null;
  soc?: number;
  grid_kw?: number;
  verified?: boolean;
  rx?: string;
}

export interface Device {
  id: string;
  tf: string;
  vendor: string;
  kw: number;
  kwh: number;
  feedin_max_kw: number;
  represents?: number;
  ev_kw?: number;
  heat?: string;
  household?: string;
  note?: string;
  path: string[];
  ack: Ack | null;
  telemetry: Telemetry | null;
  registered: boolean;
}

/** One house = everything behind one meter (platform `households()`): battery owns SoC and the grid reading,
 *  EV and heat kW add up, the ack is the weakest member's. */
export interface HouseholdTelemetry {
  soc: number | null;
  grid_kw: number;
  ev_kw: number;
  hp_kw: number;
  dhw_c: number | null;
  dhw_set_c: number | null;
  boiler_c: number | null;
  heat: string | null;
  ev: number;
  mode: string;
  rx?: string;
}

export interface Household {
  id: string;
  tf: string;
  path: string[];
  devices: string[];
  real: boolean;
  kw: number;
  kwh: number;
  represents: number;
  telemetry: HouseholdTelemetry | null;
  ack: { status: Ack["status"]; reason: string | null; seq: number | null; verified?: boolean; applied?: unknown } | null;
  registered: boolean;
}

export interface Aggregate {
  devices: number;
  online: number;
  kwh_available: number;
  kw: number;
  applied: number;
  active: Mode | null;
  total_kw: number | null;
  program_kw: number | null;
  other_kw: number | null;
  rating_kw: number | null;
  load_pct: number | null;
}

export interface Decision {
  at: string;
  sim_h: number;
  trigger: string | null;
  mode: string | null;
  segment: string | null;
  rationale: string | null;
  fields: Record<string, number | null> | null;
  duration_min: number | null;
  envelope: Envelope | null;
  latency_ms: number | null;
  verdict: "sent" | "held" | "refused" | "error" | "none" | "pending" | "rejected" | "expired";
  detail: string;
  seq: number | null;
}

export interface Proposal {
  segment?: string;
  mode?: string;
  fields?: Record<string, number | null>;
  duration_min?: number;
  rationale?: string;
  note?: string;
  guard?: string | null;
  latency_ms?: number;
  envelope?: Envelope;
  situation?: string;
  at?: string;
  error?: string;
}

export interface Autopilot {
  mode: "off" | "propose" | "auto";
  context: string;
  last_run: string | null;
  last_trigger: string | null;
  last_result: Proposal | null;
  pending: Proposal | null;
  busy: boolean;
  stage: "idle" | "sense" | "deepseek" | "guard" | "send";
  history: Decision[];
  trigger_pct: number;
  release_pct: number;
  horizon_min: number;
  cooldown_min: number;
  max_per_day: number;
  interval_s: number;
  sim_x: number;
}

export interface LogEntry {
  ts: string;
  kind: string;
  msg: string;
  seq?: number;
  mode?: string;
  segment?: string;
  device?: string;
  status?: string;
}

export interface ForecastPoint {
  h: number;
  other_kw: number;
  total_kw: number;
}

/** fm/gz-planner (optional): the day-ahead plan per transformer, e.g. pre-charge before a cold evening. */
export interface PlanEntry {
  window_from_h: number;
  window_to_h: number;
  peak_pct: number;
  need_kwh: number;
  available_kwh: number;
  action: "PREPARE" | "ABSORB" | "none";
  target_soc: number | null;
  by_h: number | null;
  summary?: string;
}

export interface State {
  now: string;
  sim_hour: number;
  seq: number;
  tree: Record<string, TreeNode>;
  aggregates: Record<string, Aggregate>;
  devices: Record<string, Device>;
  households?: Record<string, Household>;
  active: Record<string, Signal>;
  log: LogEntry[];
  hb_paused: boolean;
  llm: boolean;
  policy: Record<string, unknown>;
  autopilot: Autopilot;
  scenario: { name: string; load_x: number; pv_x: number };
  forecast: Record<string, ForecastPoint[]>;
  plan?: Record<string, PlanEntry>;
  /** City totals computed server-side (platform since a8e1311: households only ship for the feeder on screen). */
  summary?: { households: number; online: number; houses: number; ev_kw: number; hp_kw: number };
  forecast_peak?: Record<string, { pct: number; h: number }>;
}

export interface NodePoint {
  ts: string;
  h: number;
  program_kw: number;
  other_kw: number;
  total_kw: number;
  /** What the same houses would draw without Gridzilla (simulator counterfactual). */
  baseline_kw?: number;
}

export interface DevPoint {
  ts: string;
  h: number;
  soc: number | null;
  grid_kw: number | null;
  mode: string | null;
  imp_cap: number | null;
  exp_cap: number | null;
}

export interface History {
  nodes: Record<string, NodePoint[]>;
  devices: Record<string, DevPoint[]>;
}

export interface WeatherHour {
  time?: string;
  hour?: number;
  temp_c: number;
  feels_c?: number;
  cloud_pct?: number;
  sun_wm2?: number;
  wind_kmh?: number;
  gust_kmh?: number;
  precip_mm?: number;
}

export interface WeatherWarning {
  level: "yellow" | "orange" | "red";
  type?: string;
  title: string;
  from?: string;
  to?: string;
  source?: string;
}

export interface Weather {
  location?: { name?: string; [k: string]: unknown };
  fetched_at?: string;
  stale?: boolean;
  now?: WeatherHour;
  hourly?: WeatherHour[];
  warnings?: WeatherWarning[];
  summary?: string;
  grid_view?: { h: number; temp_c: number; sun_wm2: number; cloud_pct: number; wind_kmh: number; load_x?: number; pv_x?: number }[];
}

// ------------------------------------------------------------------ fetching
async function getJSON<T>(path: string): Promise<T> {
  const r = await fetch(`/api/${path}`, { cache: "no-store" });
  if (!r.ok) throw Object.assign(new Error(`${path}: ${r.status}`), { status: r.status });
  return r.json() as Promise<T>;
}

export async function post(path: string, body?: unknown): Promise<unknown> {
  const r = await fetch(`/api/${path}`, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let j: { detail?: unknown } = {};
  try {
    j = await r.json();
  } catch {
    /* empty body */
  }
  if (!r.ok) {
    const d = j.detail;
    throw new Error(typeof d === "string" ? d : r.status === 404 ? "not available on this platform" : r.statusText || `HTTP ${r.status}`);
  }
  return j;
}

/** Poll an endpoint every `ms`. `error` is set while the platform is unreachable; the last good value is kept. */
function usePoll<T>(path: string, ms: number, enabled = true) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<{ status?: number; message: string } | null>(null);
  const tick = useRef(0);
  const load = useCallback(async () => {
    const my = ++tick.current;
    try {
      const d = await getJSON<T>(path);
      if (my === tick.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      const err = e as Error & { status?: number };
      if (my === tick.current) setError({ status: err.status, message: err.message });
    }
  }, [path]);
  useEffect(() => {
    if (!enabled) return;
    load();
    const id = window.setInterval(load, ms);
    return () => window.clearInterval(id);
  }, [load, ms, enabled]);
  return { data, error, reload: load };
}

/** Path of a node up to the root, nearest parent first. */
const pathOf = (tree: Record<string, TreeNode>, n: string) => {
  const out: string[] = [];
  for (let c: string | null = n; c && tree[c]; c = tree[c].parent) out.push(c);
  return out;
};

/** The real Victron plant at the captain's family home (household "blatnica": Cerbo GX battery + Vitocal heat pump). */
export const BLATNICA_DEVICE = "real-powerplant-blatnica";

/** The device that owns a household's meter and battery (the heat pump agent is a separate device behind the same meter). */
export const meterDevice = (h: Household) => h.devices.find((d) => !/vicare/.test(d)) ?? h.devices[0] ?? h.id;

/** The trimmed board payload (platform 19e44d7/a8e1311) ships the tree once, no raw devices and households only for the
 *  feeder on screen. Rebuild the fields the views read: the cached tree, household paths, and one device per household. */
function normalize(raw: State, tree: Record<string, TreeNode> | null): State {
  const t = raw.tree ?? tree ?? {};
  const s = { ...raw, tree: t, forecast: raw.forecast ?? {} };
  Object.values(s.households ?? {}).forEach((h) => (h.path = h.path ?? pathOf(t, h.tf)));
  if (!raw.devices) {
    s.devices = {};
    Object.values(s.households ?? {}).forEach((h) => {
      const id = meterDevice(h);
      s.devices[id] = {
        id, tf: h.tf, vendor: h.real ? "real" : "sim", kw: h.kw, kwh: h.kwh, feedin_max_kw: 0, represents: h.represents,
        household: h.id.startsWith("sim-") ? undefined : h.id, path: h.path, registered: h.registered,
        telemetry: h.telemetry as unknown as Telemetry | null,
        ack: h.ack ? ({ device: id, rx: undefined, ...h.ack } as Ack) : null,
      };
    });
  }
  return s;
}

/** Board state for the feeder on screen (`hh`) with the full forecast of one node (`fc`). Older platforms ignore the
 *  query and send everything, which normalizes to the same shape. */
export function useGridState(hh = "", fc = "") {
  const tree = useRef<Record<string, TreeNode> | null>(null);
  const q = `state?hh=${encodeURIComponent(hh)}&fc=${encodeURIComponent(fc)}&tree=${tree.current ? 0 : 1}`;
  const r = usePoll<State>(q, 3000);
  if (r.data?.tree) tree.current = r.data.tree;
  const data = useMemo(() => (r.data ? normalize(r.data, tree.current) : null), [r.data]);
  return { ...r, data };
}

/** History only for what is on screen, downsampled by the platform. */
export function useHistory(nodes: string[], devices: string[]) {
  const q = `history?nodes=${encodeURIComponent(nodes.filter(Boolean).join(","))}&devices=${encodeURIComponent(devices.filter(Boolean).join(","))}&limit=240`;
  return usePoll<History>(q, 5000, nodes.length > 0);
}

/** True while the platform advertises `path` in its OpenAPI schema. Checked once a minute, so a missing optional
 *  feature never produces a stream of 404s in the console. */
export function useHasEndpoint(path: string) {
  const [has, setHas] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    const check = () =>
      fetch("/openapi.json", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => alive && setHas(!!j && !!j.paths && path in j.paths))
        .catch(() => alive && setHas(false));
    check();
    const id = window.setInterval(check, 60_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [path]);
  return has;
}

/** Weather is served by a separate platform feature. When it is missing the page shows "weather offline".
 *  `?weather=sample` uses the bundled sample so the layout can be reviewed before the endpoint exists. */
export function useWeather() {
  const sample = typeof location !== "undefined" && new URLSearchParams(location.search).get("weather") === "sample";
  const has = useHasEndpoint("/api/weather");
  const live = usePoll<Weather>("weather", 3000, !sample && has === true);
  const [fixture, setFixture] = useState<Weather | null>(null);
  useEffect(() => {
    if (sample) import("./weatherSample").then((m) => setFixture(m.sampleWeather()));
  }, [sample]);
  if (sample) return { data: fixture, available: true, sample: true };
  return { data: has ? live.data : null, available: has === true && !live.error, sample: false, checking: has === null };
}

/** What the weather hook hands to views: `available` false = show "weather offline", `sample` = bundled fixture. */
export type WeatherFeed = { data: Weather | null; available: boolean; sample: boolean; checking?: boolean };
