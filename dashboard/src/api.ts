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
  /** True while the house follows the SHAPE flattening plan (the per-slot diet plan for its feeder). */
  shape?: boolean;
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
  /** What the same node would carry without Gridzilla (simulator counterfactual). */
  baseline_kw?: number | null;
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
  target?: string | null;
  hot?: string[];
  worst_pct?: number | null;
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
  focus?: AutopilotFocus | null;
}

/** What the autopilot is looking at: the node it would signal and its hottest transformers. */
export interface AutopilotFocus {
  node: string;
  dir: "import" | "export";
  hot: string[];
  worst: string;
  worst_pct: number;
  worst_at_h: number;
  under: number;
  excess_kw: number;
  choices?: string[];
  others?: number;
}

/** Forecast hotspot per transformer as the autopilot ranks them. */
export interface Hotspot {
  pct: number;
  at_h: number;
  kw: number;
  excess_kw: number;
  feeder: string;
  sub: string;
  covered: boolean;
}

/** The SHAPE flattening plan: renewed per feeder every few grid hours (households carry `telemetry.shape`). */
export interface ShapeInfo {
  at: string | null;
  rounds: number;
  enabled: boolean;
  feeders: number;
}

/** Last signal per node, kept after it ended ("released by seq 115", "window over"). */
export type RecentSignal = Signal & { ended_at: string | null; ended: string | null };

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
  target?: AutopilotFocus | null;
  hotspots?: Record<string, Hotspot>;
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
  summary?: { households: number; online: number; shaped?: number; houses: number; ev_kw: number; hp_kw: number };
  forecast_peak?: Record<string, { pct: number; h: number }>;
  recent?: Record<string, RecentSignal>;
  shape?: ShapeInfo;
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
/** Read-only live mode: ?api=<base url> (e.g. ?api=https://gridzilla.victronlab.sk) sends every read to that platform and
 *  refuses every write, so a deck or console can show the live grid (and the real Blatnica plant) without touching it.
 *  Without it, every call is relative (same origin, or the Vite dev proxy). */
export const API_BASE = (() => {
  if (typeof location === "undefined") return "";
  const b = new URLSearchParams(location.search).get("api");
  return b ? b.replace(/\/+$/, "") : "";
})();
export const READ_ONLY = API_BASE !== "";
export const READ_ONLY_TEXT = "read-only, live server";
/** URL of a platform path ("/api/state", "/openapi.json") on the base in use. */
export const apiUrl = (p: string) => `${API_BASE}${p}`;

async function getJSON<T>(path: string): Promise<T> {
  const r = await fetch(apiUrl(`/api/${path}`), { cache: "no-store" });
  if (!r.ok) throw Object.assign(new Error(`${path}: ${r.status}`), { status: r.status });
  return r.json() as Promise<T>;
}

export async function post(path: string, body?: unknown): Promise<unknown> {
  // live mode never writes: the request is not even sent
  if (READ_ONLY) throw new Error(`Not sent: ${READ_ONLY_TEXT}`);
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

/** QA gate G2 (dashboard/qa/truth.mjs): the last payload of every endpoint stays on window.__gz, so the checker can trace
 *  each number on screen (its data-src) back to exactly what the page fetched. Keyed by endpoint (state, history, ...);
 *  a diet plan is also kept per node as "flatten:<node>", so the street plan and the city plan never overwrite each other. */
function publish(path: string, d: unknown) {
  const w = window as unknown as { __gz?: Record<string, unknown> };
  const gz = (w.__gz ??= {});
  const [ep, query = ""] = path.split("?");
  gz[ep] = d;
  gz[`${ep}@`] = Date.now();
  const node = ep === "flatten" ? new URLSearchParams(query).get("node") : null;
  if (node) {
    gz[`flatten:${node}`] = d;
    gz[`flatten:${node}@`] = Date.now();
  }
}

type PollErr = { status?: number; message: string };
/** One poller per path, shared by every component that asks for it: two cards showing the same endpoint always show
 *  the same payload, and that payload is the one on window.__gz. */
type Poll = { data: unknown; error: PollErr | null; subs: Set<() => void>; timer: number; tick: number };
const polls = new Map<string, Poll>();

async function loadPoll(path: string) {
  const p = polls.get(path);
  if (!p) return;
  const my = ++p.tick;
  try {
    const d = await getJSON<unknown>(path);
    if (my !== p.tick) return;
    publish(path, d);
    p.data = d;
    p.error = null;
  } catch (e) {
    if (my !== p.tick) return;
    const err = e as Error & { status?: number };
    p.error = { status: err.status, message: err.message };
  }
  p.subs.forEach((f) => f());
}

/** Poll an endpoint every `ms`. `error` is set while the platform is unreachable; the last good value is kept, also
 *  across a change of `path` until the new answer lands. `dataPath` is the path that value answered, so a caller can
 *  tell "the answer for what I asked now" from "the previous answer kept on screen". */
function usePoll<T>(path: string, ms: number, enabled = true) {
  const [, bump] = useState(0);
  const last = useRef<T | null>(null);
  const lastPath = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let p = polls.get(path);
    if (!p) polls.set(path, (p = { data: null, error: null, subs: new Set(), timer: 0, tick: 0 }));
    const poll = p;
    const f = () => bump((n) => n + 1);
    poll.subs.add(f);
    if (!poll.timer) {
      loadPoll(path);
      poll.timer = window.setInterval(() => loadPoll(path), ms);
    } else if (poll.data != null) f();
    return () => {
      poll.subs.delete(f);
      if (!poll.subs.size) {
        window.clearInterval(poll.timer);
        poll.timer = 0;
        // Nobody watches this path any more: drop its answer, so coming back later never shows minutes-old data as new.
        poll.data = null;
        poll.tick++;
      }
    };
  }, [path, ms, enabled]);
  const p = enabled ? polls.get(path) : undefined;
  if (p?.data != null) {
    last.current = p.data as T;
    lastPath.current = path;
  }
  const reload = useCallback(() => loadPoll(path), [path]);
  return { data: last.current, dataPath: lastPath.current, error: p?.error ?? null, reload };
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
  /** The node whose households the shown payload carries (`hh` of the request it answered). */
  const hhOf = r.dataPath != null ? new URLSearchParams(r.dataPath.split("?")[1] ?? "").get("hh") ?? "" : null;
  return { ...r, data, hhOf };
}

/** History only for what is on screen, downsampled by the platform. `asked` lists the nodes the shown payload was asked
 *  for (a node the platform has no readings for is simply missing from `data.nodes`). */
export function useHistory(nodes: string[], devices: string[]) {
  const q = `history?nodes=${encodeURIComponent(nodes.filter(Boolean).join(","))}&devices=${encodeURIComponent(devices.filter(Boolean).join(","))}&limit=240`;
  const r = usePoll<History>(q, 5000, nodes.length > 0);
  const asked = r.dataPath != null ? (new URLSearchParams(r.dataPath.split("?")[1] ?? "").get("nodes") ?? "").split(",").filter(Boolean) : [];
  return { ...r, asked };
}

/** True while the platform advertises `path` in its OpenAPI schema. Checked once a minute, so a missing optional
 *  feature never produces a stream of 404s in the console. */
export function useHasEndpoint(path: string) {
  const [has, setHas] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    const check = () =>
      fetch(apiUrl("/openapi.json"), { cache: "no-store" })
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

// ------------------------------------------------------------------ the diet plan (/api/flatten, platform flatten.py)

/** One transformer's line in an aggregated plan (feeder, substation, city). */
export interface FlattenTf {
  tf: string;
  rating_kw: number;
  level_kw: number;
  peak_naive_pct: number;
  peak_plan_pct: number;
  houses: number;
  ev_houses: number;
}

/** The water-filling diet plan for one node: 96 slots of 15 grid minutes from `start_h`. `naive_kw` is the street with
 *  every car charging when it arrives, `planned_kw` what the street draws with the plan, `level_kw` the flat import
 *  ceiling L the plan fills up to and `export_level_kw` the export ceiling Le. Per-house ceilings
 *  (`import_max_kw`/`export_max_kw`) ship only for a single transformer, `tfs` only for an aggregate. */
export interface FlattenPlan {
  tf: string;
  rating_kw: number;
  houses: number;
  ev_houses: number;
  start_h: number;
  bias_kw?: number;
  level_kw: number;
  export_level_kw: number;
  ev_kwh: number;
  batt_kwh_usable: number;
  batt_kwh_free: number;
  shaved_kwh: number;
  shifted_kwh: number;
  peak_naive_kw: number;
  peak_plan_kw: number;
  peak_naive_pct: number;
  peak_plan_pct: number;
  cars_full: boolean;
  hours: number[];
  other_kw: number[];
  base_kw: number[];
  pv_kw: number[];
  naive_kw: number[];
  planned_kw: number[];
  import_max_kw?: number[];
  export_max_kw?: number[];
  tfs?: FlattenTf[];
}

export interface Flatten {
  node: string;
  sim_hour: number;
  renewed_at: string | null;
  rounds: number;
  /** False while the diet plan is switched off (houses keep the last plan until it expires). */
  enabled: boolean;
  shape_seq: Record<string, number>;
  plan: FlattenPlan | null;
}

/** The diet plan for one node ("tf:mauer-2", a feeder or "region:at"), polled every 5 s. `plan` is null until it
 *  arrives, while the plan is switched off, for an unknown node and on a platform without /api/flatten (404: no plan,
 *  no error on screen). `data` keeps the whole answer, `enabled` included. */
export function useFlatten(node: string | null | undefined) {
  const r = usePoll<Flatten>(`flatten?node=${encodeURIComponent(node ?? "")}`, 5000, !!node);
  const data = r.data && r.data.node === node ? r.data : null;
  const plan = data && data.enabled && data.plan && data.plan.tf === node ? data.plan : null;
  return { data, plan, available: !!data, missing: r.error?.status === 404, failed: !!r.error };
}
