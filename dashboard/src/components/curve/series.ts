// Data prep for the hero curve: turns the platform's wrapping sim hours (23.9 -> 0.1) into one continuous time axis,
// keeps only the latest unbroken run of history, places Peter's forecast ahead of now and collects the signal pins.
import type { History, State } from "../../api";
import { MODE_WORDS, pathOf } from "../../model";

export interface HistPt {
  t: number; // unwrapped sim hours
  total: number;
  program: number;
  other: number;
  /** What the same houses would draw without Gridzilla (simulator counterfactual); null on older platforms. */
  base: number | null;
}

export interface FcPt {
  t: number;
  total: number;
  other: number;
}

export interface Mark {
  key: string;
  t: number;
  mode: string;
  seq: number | null;
  by: "ai" | "operator";
  durH: number; // how long the allowed box lasts, in sim hours (0 = unknown)
}

/** Forward distance on a 24 h clock, in [0, 24). */
const fwd = (from: number, to: number) => (((to - from) % 24) + 24) % 24;

/** Latest unbroken run of samples, unwrapped so that the newest point sits `fwd(newest, nowH)` before tNow. A jump of
 *  more than an hour (platform restart, clock fallback before the first telemetry) starts a new run. */
export function unwrapHistory(history: History | null, node: string, tNow: number, nowH: number): HistPt[] {
  const raw = (node && history?.nodes?.[node]) || [];
  if (!raw.length) return [];
  const out: HistPt[] = [];
  let lastGap = fwd(raw[raw.length - 1].h, nowH);
  if (lastGap > 12) lastGap = 0; // newest sample a hair ahead of the state poll
  let t = tNow - lastGap;
  for (let i = raw.length - 1; i >= 0; i--) {
    const p = raw[i];
    if (i < raw.length - 1) {
      const dt = fwd(p.h, raw[i + 1].h);
      if (dt > 1) break;
      t -= dt;
    }
    out.push({ t, total: p.total_kw, program: p.program_kw, other: p.other_kw, base: p.baseline_kw ?? null });
  }
  return out.reverse();
}

export function unwrapForecast(s: State, node: string, tNow: number): FcPt[] {
  const fc = (node && s.forecast?.[node]) || [];
  return fc.map((p) => {
    let d = fwd(s.sim_hour, p.h);
    if (d > 20) d -= 24; // rounding put the first slot a hair behind now
    return { t: tNow + d, total: p.total_kw, other: p.other_kw };
  });
}

/** Signals that reached this transformer: autopilot decisions that were sent (they carry their sim hour), plus
 *  operator sends from the log (wall clock, converted with the sim speed). A signal to a feeder or substation above
 *  this transformer counts too. */
export function signalMarks(s: State, node: string, tNow: number): Mark[] {
  if (!node || !s.tree[node]) return [];
  const path = new Set(pathOf(s, node));
  const marks: Mark[] = [];
  const seen = new Set<number>();
  for (const d of s.autopilot?.history ?? []) {
    if (d.verdict !== "sent" || !d.segment || !path.has(d.segment) || !d.mode) continue;
    const env = d.envelope;
    const slots = env ? (env.import_max_kw ?? env.export_max_kw ?? []).length : 0;
    const durH = slots && env ? (slots * env.slot_sim_min) / 60 : (d.duration_min ?? 0) / 60;
    const back = fwd(d.sim_h, s.sim_hour);
    marks.push({ key: `ai-${d.seq ?? d.at}`, t: tNow - back, mode: d.mode, seq: d.seq, by: "ai", durH });
    if (d.seq != null) seen.add(d.seq);
  }
  const simX = s.autopilot?.sim_x ?? 60;
  const nowMs = Date.parse(s.now);
  for (const l of s.log ?? []) {
    if (l.kind !== "signal" || !l.segment || !path.has(l.segment) || !l.mode) continue;
    if (l.seq != null && seen.has(l.seq)) continue;
    const ago = (nowMs - Date.parse(l.ts)) / 1000;
    if (!Number.isFinite(ago) || ago < 0) continue;
    const backH = (ago * simX) / 3600;
    if (backH > 24) continue;
    marks.push({ key: `op-${l.seq ?? l.ts}`, t: tNow - backH, mode: l.mode, seq: l.seq ?? null, by: "operator", durH: 0 });
    if (l.seq != null) seen.add(l.seq);
  }
  return marks.sort((a, b) => a.t - b.t);
}

/** Short plain label for a marker on the time axis: "Gridzilla: store the sun". */
export function markLabel(m: Mark) {
  const t = MODE_WORDS[m.mode]?.title ?? m.mode;
  return `${m.by === "ai" ? "Gridzilla" : "Operator"}: ${t.charAt(0).toLowerCase()}${t.slice(1)}`;
}

/** Round step for about `n` ticks over `span`. */
export function niceStep(span: number, n: number) {
  const raw = span / Math.max(1, n);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
}

const pathFrom = (pts: [number, number][]) =>
  pts.length ? "M" + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L") : "";

type XY = (t: number, v: number) => [number, number];

export function linePath(pts: { t: number; v: number }[], xy: XY) {
  return pathFrom(pts.map((p) => xy(p.t, p.v)));
}

export function bandPath(pts: { t: number; lo: number; hi: number }[], xy: XY) {
  if (pts.length < 2) return "";
  const top = pts.map((p) => xy(p.t, p.hi));
  const bot = [...pts].reverse().map((p) => xy(p.t, p.lo));
  return pathFrom([...top, ...bot]) + "Z";
}
