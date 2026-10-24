// Sun, sky and light for the street render, from grid time (s.sim_hour) and the real weather (cloud cover).
// The ground stays light at every hour (no dark theme): night only dims the sun, cools the light and lights the windows.
import * as THREE from "three";
import type { Weather, WeatherFeed } from "../../api";

const RISE = 6.5; // grid-time sunrise and sunset, Vienna in autumn rounded so the demo day reads clearly
const SET = 18;
const MAX_EL = 0.62; // highest sun, radians above the horizon (~35 degrees)

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface Light {
  dir: THREE.Vector3; // from the scene towards the light (sun by day, moon by night)
  intensity: number; // directional light
  color: THREE.Color;
  hemi: number; // soft fill from the sky
  hemiSky: THREE.Color;
  bg: THREE.Color; // background = ground, always light
  shadow: number; // opacity of the ground shadow
  windows: number; // how lit the house windows are, 0..1
  sun: number; // how strongly the sun shines on solar panels, 0..1
  sunDir: THREE.Vector3; // the real sun direction (may be below the horizon), for the panels
}

const WHITE = new THREE.Color("#ffffff");
const WARM = new THREE.Color("#ffc68f");
const MOON = new THREE.Color("#bccaff");
const SKY_DAY = new THREE.Color("#ffffff");
const SKY_NIGHT = new THREE.Color("#dde4f5");
const BG_DAY = new THREE.Color("#f5f5f7");
const BG_WARM = new THREE.Color("#f8f1e9");
const BG_NIGHT = new THREE.Color("#e7eaf1");
const TMP = new THREE.Color();
const MOON_DIR = new THREE.Vector3(-0.45, 1, 0.55).normalize();

/** Light at grid hour `h` (0..24, fractional) with `cloud` 0..1. Writes into `out` so a frame allocates nothing. */
export function lightAt(h: number, cloud: number, out: Light): Light {
  const f = (((h % 24) + 24) % 24 - RISE) / (SET - RISE);
  const up = Math.sin(Math.PI * f); // 1 at noon, below 0 after sunset (smooth twilight)
  const el = up * MAX_EL;
  // east is left (-x), west is right (+x), south is towards the camera (+z)
  const across = -Math.cos(Math.PI * Math.min(1.2, Math.max(-0.2, f)));
  out.sunDir.set(across * Math.cos(el), Math.sin(el), (0.35 + 0.65 * Math.max(0, up)) * Math.cos(el)).normalize();
  const day = smooth(-0.05, 0.25, up);
  const warm = day * (1 - smooth(0.25, 0.7, up));
  const clear = 1 - 0.7 * cloud;
  out.dir.copy(MOON_DIR).lerp(out.sunDir, day).normalize();
  // keep shadows readable near sunrise and sunset: the light never drops below ~22 degrees
  if (out.dir.y < 0.38) {
    const k = Math.sqrt((1 - 0.38 * 0.38) / Math.max(1e-6, out.dir.x * out.dir.x + out.dir.z * out.dir.z));
    out.dir.set(out.dir.x * k, 0.38, out.dir.z * k);
  }
  out.intensity = day * (1.3 + Math.max(0, up)) * clear + (1 - day) * 0.75;
  out.color.copy(MOON).lerp(TMP.copy(WHITE).lerp(WARM, warm * 0.85), day);
  out.hemi = 1.7 + day * (0.05 + 0.35 * cloud);
  out.hemiSky.copy(SKY_NIGHT).lerp(SKY_DAY, day);
  out.bg.copy(BG_NIGHT).lerp(BG_DAY, day).lerp(BG_WARM, warm * 0.7);
  out.shadow = 0.05 + 0.1 * day * clear;
  out.windows = 1 - smooth(0.0, 0.3, up);
  out.sun = Math.max(0, up) * clear;
  return out;
}

export const newLight = (): Light => ({
  dir: new THREE.Vector3(0, 1, 0),
  intensity: 1,
  color: new THREE.Color(),
  hemi: 1,
  hemiSky: new THREE.Color(),
  bg: new THREE.Color(),
  shadow: 0.1,
  windows: 0,
  sun: 0,
  sunDir: new THREE.Vector3(0, 1, 0),
});

/** Cloud cover 0..1 at grid hour `h`: the grid-time weather row nearest to it, else the weather right now, else clear. */
export function cloudAt(w: Weather | WeatherFeed | null | undefined, h: number): number {
  const data: Weather | null | undefined = w && "available" in w ? (w as WeatherFeed).data : (w as Weather | null | undefined);
  if (!data) return 0;
  const rows = data.grid_view ?? [];
  let best: number | null = null,
    gap = Infinity;
  for (const r of rows) {
    const d = Math.abs(((((r.h - h) % 24) + 36) % 24) - 12); // hour distance with wrap-around
    if (d < gap) {
      gap = d;
      best = r.cloud_pct;
    }
  }
  if (best != null && gap <= 1.5) return Math.min(1, Math.max(0, best / 100));
  const now = data.now?.cloud_pct;
  return now == null ? 0 : Math.min(1, Math.max(0, now / 100));
}
