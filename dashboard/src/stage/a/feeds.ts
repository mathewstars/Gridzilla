// Stage A's own small feeds: the flattening plan (/api/flatten) and the weather read straight from /api/weather, so the
// stage shows real weather even where /openapi.json is not reachable (the dev server). Nothing here is invented.
import { useEffect, useState } from "react";
import type { Weather, WeatherFeed } from "../../api";

export interface FlattenPlan {
  tf: string;
  rating_kw: number;
  houses: number;
  ev_houses: number;
  level_kw: number;
  ev_kwh: number;
  shifted_kwh: number;
  peak_naive_kw: number;
  peak_plan_kw: number;
  peak_naive_pct: number;
  peak_plan_pct: number;
  cars_full: boolean;
}

export interface Flatten {
  node: string;
  renewed_at: string | null;
  enabled: boolean;
  plan: FlattenPlan | null;
}

/** Poll one JSON address; keeps the last good answer, null until the first one arrives. */
function usePollJSON<T>(url: string | null, ms: number) {
  const [data, setData] = useState<{ url: string; v: T } | null>(null);
  const [ok, setOk] = useState(true);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    const get = () =>
      fetch(url, { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<T>) : Promise.reject(r.status)))
        .then((v) => alive && (setData({ url, v }), setOk(true)))
        .catch(() => alive && setOk(false));
    get();
    const id = window.setInterval(get, ms);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [url, ms]);
  return { data: data && data.url === url ? data.v : null, ok };
}

/** The SHAPE flattening plan for one node (a transformer or "region:at" for the whole city). */
export function useFlatten(node: string) {
  return usePollJSON<Flatten>(node ? `/api/flatten?node=${encodeURIComponent(node)}` : null, 15_000).data;
}

/** Real weather for Wien-Liesing, in the same shape the shared hook hands out. */
export function useWeatherDirect(): WeatherFeed {
  const r = usePollJSON<Weather>("/api/weather", 30_000);
  return { data: r.data, available: !!r.data, sample: false };
}
