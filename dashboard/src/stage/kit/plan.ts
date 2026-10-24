// Dad's diet plan (/api/flatten, platform flatten.py) and the live signal window, both put on the hero curve's continuous
// grid clock. The plan is 96 slots of 15 grid minutes from start_h; start_h is now or up to 2 grid hours back (a new
// plan every 2 h), so slot i sits at tStart + its own hours[] distance, never "the next 24 h from the left".
import type { FlattenPlan, Signal, State } from "../../api";
import { nice } from "../../model";

export interface PlanPt {
  t: number; // unwrapped grid hours, same clock as the history
  naive: number; // the street with every car charging when it arrives (the "without" hill)
  planned: number; // the target shape the houses are steered onto
}

/** Forward distance on a 24 h clock, in [0, 24). */
const fwd = (from: number, to: number) => (((to - from) % 24) + 24) % 24;

/** Plan slots on the continuous clock where `tNow` is grid hour `simHour`. */
export function unwrapPlan(plan: FlattenPlan, simHour: number, tNow: number): PlanPt[] {
  let back = fwd(plan.start_h, simHour);
  if (back > 12) back -= 24; // the plan's start rounded a hair past now
  const t0 = tNow - back;
  const n = Math.min(plan.hours.length, plan.naive_kw.length, plan.planned_kw.length);
  const out: PlanPt[] = [];
  for (let i = 0; i < n; i++) out.push({ t: t0 + fwd(plan.start_h, plan.hours[i]), naive: plan.naive_kw[i], planned: plan.planned_kw[i] });
  return out;
}

/** The plan between t0 and t1, with straight-line values at both ends so it starts exactly at Now. */
export function slicePlan(pts: PlanPt[], t0: number, t1: number): PlanPt[] {
  if (pts.length < 2 || t1 <= t0) return [];
  const atT = (t: number): PlanPt | null => {
    if (t < pts[0].t || t > pts[pts.length - 1].t) return null;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if (t <= b.t) {
        const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
        return { t, naive: a.naive + (b.naive - a.naive) * k, planned: a.planned + (b.planned - a.planned) * k };
      }
    }
    return null;
  };
  const mid = pts.filter((p) => p.t > t0 && p.t < t1);
  const a = atT(t0);
  const b = atT(t1);
  return [...(a ? [a] : []), ...mid, ...(b ? [b] : [])];
}

/** Grid hour (continuous clock) of the plan's flat ceiling: the first slot where it holds the street under L. */
export function plateauStart(pts: PlanPt[], level: number): PlanPt | null {
  return pts.find((p) => p.naive > p.planned + 0.5 && Math.abs(p.planned - level) < Math.max(0.5, level * 0.005)) ?? null;
}

/** The highest point of the "without" hill in `pts`, with its slot index in the full plan. */
export function apex(pts: PlanPt[]): PlanPt | null {
  let best: PlanPt | null = null;
  for (const p of pts) if (!best || p.naive > best.naive) best = p;
  return best;
}

export interface SigWindow {
  /** Start and end on the continuous clock. */
  t0: number;
  t1: number;
  seq: number;
  /** Key of the signal in state.active (for data-src). */
  key: string;
}

/** The time-limited signal window (valid_from..valid_to, wall clock) on the grid clock: wall seconds x sim_x. */
export function signalWindow(s: State, sig: Signal | null | undefined, tNow: number): SigWindow | null {
  if (!sig) return null;
  const now = Date.parse(s.now);
  const a = Date.parse(sig.valid_from);
  const b = Date.parse(sig.valid_to);
  if (!Number.isFinite(now) || !Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  const simX = s.autopilot?.sim_x ?? 60;
  const toT = (ms: number) => tNow + ((ms - now) / 3.6e6) * simX;
  const key = Object.entries(s.active ?? {}).find(([, v]) => v.seq === sig.seq)?.[0] ?? sig.segment;
  return { t0: toT(a), t1: toT(b), seq: sig.seq, key };
}

/** Plain card title for the curve, from what the plot shows: the backflow title only while the chart draws the backflow
 *  limit (the "without" dip goes past half of it, STAGE.md 7.1); otherwise the grid hour names what the plan is about. */
export function curveTitle(node: string, simHour: number, revDrawn: boolean): string {
  const name = nice(node) || "this street";
  if (revDrawn) return `Keeping ${name}'s solar inside the backflow limit`;
  const h = ((simHour % 24) + 24) % 24;
  if (h >= 15) return `Eating the evening peak on ${name}`;
  if (h < 6) return `Tonight's plan for ${name}`;
  return `Getting ${name} ready for the evening peak`;
}

// ---- One source for the plan's peak numbers: the chart, the plan card and the facts all round them the same way.

/** Peak without Gridzilla, % of the limit (data-src flatten:<tf>/plan/peak_naive_pct). */
export const peakPct = (plan: FlattenPlan) => Math.round(plan.peak_naive_pct);
/** Peak with the plan, % of the limit (data-src flatten:<tf>/plan/peak_plan_pct). */
export const planPct = (plan: FlattenPlan) => Math.round(plan.peak_plan_pct);

/** The deepest backflow of the "without" curve: its slot index and kW (negative), null when it never flows back. */
export function backflowDip(plan: FlattenPlan): { i: number; kw: number } | null {
  let best: { i: number; kw: number } | null = null;
  for (let i = 0; i < plan.naive_kw.length; i++) {
    const v = plan.naive_kw[i];
    if (v < 0 && (best == null || v < best.kw)) best = { i, kw: v };
  }
  return best;
}

/** Backflow without Gridzilla, % of the backflow limit (`reverseKw`, the transformer's reverse_kw or its rating). */
export function backflowPct(plan: FlattenPlan, reverseKw: number | null | undefined): number | null {
  const d = backflowDip(plan);
  return d && reverseKw ? Math.round((-d.kw / reverseKw) * 100) : null;
}

/** True when the plan's binding peak is the backflow: the dip uses more of the backflow limit than the hill uses of the
 *  import limit. Then the plan card and the chart talk about backflow, not the evening peak. */
export function bindsExport(plan: FlattenPlan, reverseKw: number | null | undefined): boolean {
  const d = backflowDip(plan);
  if (!d || !reverseKw || !plan.rating_kw) return false;
  return -d.kw / reverseKw > plan.peak_naive_kw / plan.rating_kw;
}
