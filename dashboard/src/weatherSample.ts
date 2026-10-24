// Sample weather in the /api/weather contract, used only with ?weather=sample (layout review before the feed exists).
// `hourly` runs on the real clock; `grid_view` covers all 24 GRID hours (h = sim hour) so the strip lines up with the
// simulated day whatever time the simulator shows. load_x / pv_x are what the weather does to the street:
// colder = more heating load, clearer sun = more solar.
import type { Weather } from "./api";

const r1 = (v: number) => Math.round(v * 10) / 10;
const sunAt = (hour: number) => Math.max(0, Math.sin(((hour - 7) / 11) * Math.PI));
const tempAt = (hour: number) => r1(4 + 6 * sunAt(hour) - (hour > 20 || hour < 6 ? 2.5 : 0) - (hour >= 0 && hour < 6 ? 1.5 : 0));
const cloudAt = (hour: number) => Math.round(Math.min(95, Math.max(5, 30 + 35 * Math.cos(hour / 3.2))));

export function sampleWeather(): Weather {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  const hourly = Array.from({ length: 24 }, (_, i) => {
    const t = new Date(start.getTime() + i * 3600_000);
    const hour = t.getHours();
    const sun = sunAt(hour);
    return {
      time: t.toISOString(),
      hour,
      temp_c: tempAt(hour),
      feels_c: r1(tempAt(hour) - 3),
      cloud_pct: cloudAt(hour),
      sun_wm2: Math.round(620 * sun * (1 - cloudAt(hour) / 160)),
      wind_kmh: Math.round(14 + 8 * Math.sin(i / 4)),
      gust_kmh: Math.round(30 + 12 * Math.sin(i / 4)),
      precip_mm: i > 14 && i < 18 ? 0.4 : 0,
    };
  });
  const grid_view = Array.from({ length: 24 }, (_, h) => {
    const sun = sunAt(h);
    const cloud = cloudAt(h);
    const temp = tempAt(h);
    return {
      h,
      temp_c: temp,
      sun_wm2: Math.round(620 * sun * (1 - cloud / 160)),
      cloud_pct: cloud,
      wind_kmh: Math.round(12 + 10 * Math.max(0, Math.sin((h - 14) / 5))),
      load_x: Math.round((1 + Math.max(0, 12 - temp) * 0.035) * 100) / 100,
      pv_x: sun > 0.05 ? Math.round((0.6 + 1.3 * (1 - cloud / 100)) * 10) / 10 : 1,
    };
  });
  return {
    location: { name: "Wien Liesing" },
    fetched_at: new Date().toISOString(),
    stale: false,
    now: hourly[0],
    hourly,
    warnings: [
      { level: "yellow", type: "wind", title: "Wind gusts up to 60 km/h", from: hourly[3].time, to: hourly[9].time, source: "GeoSphere Austria (sample)" },
      { level: "orange", type: "ice", title: "Black ice on roads and paths", from: hourly[5].time, to: hourly[14].time, source: "GeoSphere Austria (sample)" },
    ],
    summary: "Cold, clear evening. Heating load peaks after 18:00, gusty wind overnight.",
    grid_view,
  };
}
