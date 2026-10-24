// Stage B's extra feeds: the flattening plan (/api/flatten) and the weather polled straight from /api/weather, so it also
// works on the dev server where /openapi.json is not passed through. No reading = null, never a made-up value.
import { useEffect, useState } from "react";
import { apiUrl, type Weather, type WeatherFeed } from "../../api";

export interface FlattenPlan {
  tf: string;
  rating_kw: number;
  houses: number;
  ev_houses: number;
  level_kw: number;
  shifted_kwh: number;
  peak_naive_kw: number;
  peak_plan_kw: number;
  peak_naive_pct: number;
  peak_plan_pct: number;
  cars_full: boolean;
  hours: number[];
  naive_kw: number[];
  planned_kw: number[];
}
export interface Flatten {
  node: string;
  sim_hour: number;
  renewed_at: string | null;
  enabled: boolean;
  plan: FlattenPlan | null;
}

/** Poll one JSON address; keeps the last good reading, null until the first one. */
function usePollJSON<T>(path: string | null, ms: number) {
  const [data, setData] = useState<T | null>(null);
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    setData(null);
    if (!path) return;
    let alive = true;
    const get = () =>
      fetch(apiUrl(`/api/${path}`), { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<T>) : Promise.reject(r.status)))
        .then((j) => {
          if (!alive) return;
          setData(j);
          setOk(true);
        })
        .catch(() => alive && setOk(false));
    get();
    const id = window.setInterval(get, ms);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [path, ms]);
  return { data, ok };
}

/** The SHAPE flattening plan for one node ("tf:x" or "region:at"). */
export function useFlatten(node: string) {
  return usePollJSON<Flatten>(node ? `flatten?node=${encodeURIComponent(node)}` : null, 15000).data;
}

/** Real weather, straight from /api/weather. Same shape as useWeather() so AiSteps and the 3D sky take it. */
export function useWeatherFeed(fallback: WeatherFeed): WeatherFeed {
  const w = usePollJSON<Weather>("weather", 30000);
  if (fallback.data) return fallback;
  if (w.data) return { data: w.data, available: true, sample: false };
  return { data: null, available: false, sample: false, checking: w.ok === null };
}
