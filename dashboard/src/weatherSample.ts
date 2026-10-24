// Sample weather in the /api/weather contract, used only with ?weather=sample (layout review before the feed exists).
import type { Weather } from "./api";

export function sampleWeather(): Weather {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  const hourly = Array.from({ length: 24 }, (_, i) => {
    const t = new Date(start.getTime() + i * 3600_000);
    const hour = t.getHours();
    const sun = Math.max(0, Math.sin(((hour - 7) / 11) * Math.PI));
    return {
      time: t.toISOString(),
      hour,
      temp_c: Math.round((4 + 6 * sun - (hour > 20 || hour < 6 ? 2 : 0)) * 10) / 10,
      feels_c: Math.round((1 + 6 * sun) * 10) / 10,
      cloud_pct: Math.round(35 + 30 * Math.cos(i / 3)),
      sun_wm2: Math.round(520 * sun),
      wind_kmh: Math.round(14 + 8 * Math.sin(i / 4)),
      gust_kmh: Math.round(30 + 12 * Math.sin(i / 4)),
      precip_mm: i > 14 && i < 18 ? 0.4 : 0,
    };
  });
  return {
    location: { name: "Wien Liesing" },
    fetched_at: new Date().toISOString(),
    stale: false,
    now: hourly[0],
    hourly,
    warnings: [{ level: "yellow", type: "wind", title: "Wind gusts up to 60 km/h", from: hourly[3].time, to: hourly[9].time, source: "GeoSphere Austria (sample)" }],
    summary: "Cold, clear evening: heating load will peak after 18:00. Light wind.",
    grid_view: hourly.map((h, i) => ({ h: (16 + i) % 24, temp_c: h.temp_c, sun_wm2: h.sun_wm2, cloud_pct: h.cloud_pct, wind_kmh: h.wind_kmh, load_x: 1.1, pv_x: 1 })),
  };
}
