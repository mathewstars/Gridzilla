// LIVE CITY data: the 72 transformers grouped by substation, then feeder, each with what the heat grid needs (load in % of
// the limit that applies in its flow direction, kW, the signal covering it, whether the diet plan cuts its peak).
import type { Flatten, Signal, State } from "../../api";
import { pathOf, tfsOf } from "../../model";

export interface TfCell {
  id: string;
  pct: number | null; // signed: negative = power flowing back to the grid
  kw: number | null;
  limit: number | null; // kW of the limit that applies in the current direction
  signal: Signal | null;
  diet: { from: number; to: number } | null; // tonight's peak without / with the diet plan (% of limit)
  peak: { pct: number; h: number } | null; // forecast peak
}

export interface FeederGroup { id: string; tfs: TfCell[]; diet: boolean }
export interface SubGroup { id: string; feeders: FeederGroup[]; worst: number }

/** The newest active signal on the transformer's path (itself, its feeder, its substation, the region). */
export function signalFor(s: State, tf: string): Signal | null {
  const path = new Set(pathOf(s, tf));
  let best: Signal | null = null;
  for (const [n, sig] of Object.entries(s.active ?? {})) if (path.has(n) && (!best || sig.seq > best.seq)) best = sig;
  return best;
}

export function cellOf(s: State, tf: string, city: Flatten | null): TfCell {
  const a = s.aggregates[tf];
  const t = s.tree[tf];
  const kw = a?.total_kw ?? null;
  const pct = a?.load_pct ?? null;
  const rating = t?.rating_kw ?? a?.rating_kw ?? null;
  const limit = rating == null ? null : kw != null && kw < 0 ? t?.reverse_kw ?? rating : rating;
  const row = city?.enabled ? city.plan?.tfs?.find((x) => x.tf === tf) : undefined;
  // worth telling only where the plan really eats a peak (one that would reach the orange zone)
  const diet = row && row.peak_naive_pct >= 85 && row.peak_naive_pct - row.peak_plan_pct >= 5 ? { from: row.peak_naive_pct, to: row.peak_plan_pct } : null;
  return { id: tf, pct, kw, limit, signal: signalFor(s, tf), diet, peak: s.forecast_peak?.[tf] ?? null };
}

export function cityGroups(s: State, city: Flatten | null): SubGroup[] {
  const subs = Object.keys(s.tree).filter((n) => n.startsWith("sub:"));
  return subs.map((sub) => {
    const feeders = Object.keys(s.tree)
      .filter((n) => n.startsWith("feeder:") && s.tree[n].parent === sub)
      .map((f) => ({ id: f, tfs: tfsOf(s, f).map((tf) => cellOf(s, tf, city)), diet: !!(city?.enabled && city.shape_seq?.[f] != null) }));
    const worst = Math.max(0, ...feeders.flatMap((f) => f.tfs.map((c) => Math.abs(c.pct ?? 0))));
    return { id: sub, feeders, worst };
  });
}
