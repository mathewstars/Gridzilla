// The operations console's one data hook: the whole city (state without households except the selected feeder), the
// selected transformer's history, its diet plan, the weather. Selection lives here so every column agrees on it.
import { useEffect, useMemo, useState } from "react";
import { BLATNICA_DEVICE, meterDevice, useFlatten, useGridState, useHistory, useWeather, type State } from "../api";
import { feederOf, headline } from "../model";

/** The transformer that deserves attention: under an active signal, else the worst load in either direction. */
function hottest(s: State): string {
  const tfs = Object.keys(s.tree).filter((n) => n.startsWith("tf:"));
  const covered = tfs.filter((t) => Object.keys(s.active).some((a) => a === t || (s.tree[t] && (s.tree[t].parent === a || s.tree[s.tree[t].parent ?? ""]?.parent === a))));
  const pool = covered.length ? covered : tfs;
  return pool.reduce((a, b) => (Math.abs(s.aggregates[b]?.load_pct ?? 0) > Math.abs(s.aggregates[a]?.load_pct ?? 0) ? b : a), pool[0] ?? "");
}

export function useOps() {
  const [sel, setSel] = useState<string>("");
  const [q, setQ] = useState({ feeder: "", tf: "" });
  const grid = useGridState(q.feeder, q.tf);
  const s = grid.data;
  const tf = s ? (sel && s.tree[sel] ? sel : hottest(s)) : "";
  const feeder = s && tf ? feederOf(s, tf) : "";
  useEffect(() => {
    if (feeder !== q.feeder || tf !== q.tf) setQ({ feeder, tf });
  }, [feeder, tf, q]);
  const houseDevs = s ? Object.values(s.households ?? {}).filter((h) => h.tf === tf).map(meterDevice) : [];
  const history = useHistory(tf ? [tf, feeder] : [], [...houseDevs.slice(0, 16), BLATNICA_DEVICE]);
  const weather = useWeather();
  const plan = useFlatten(tf || null);
  const city = useFlatten("region:at");
  const head = useMemo(() => (s ? headline(s) : null), [s]);
  return { s, error: grid.error, reload: grid.reload, history: history.data, weather, plan: plan.data ?? null, city: city.data ?? null, tf, feeder, select: setSel, headline: head };
}

export type Ops = ReturnType<typeof useOps>;
