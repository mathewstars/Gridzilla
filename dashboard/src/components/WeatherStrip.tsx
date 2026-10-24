// Weather for the street, lined up with GRID time (the simulator's clock), plus the official warning banner.
// WeatherStrip: big "now" temperature, the plain-English summary, what the weather does to the street (chips from
// grid_view load_x / pv_x), and the next hours as columns: temperature curve, sun as glowing yellow bars, wind.
// WarningBanner: the most severe official warning (GeoSphere Austria), "+N more" opens the rest.
import {
  CaretDown,
  ClockCounterClockwise,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSlash,
  CloudSnow,
  CloudSun,
  Moon,
  Snowflake,
  Sun,
  ThermometerCold,
  ThermometerHot,
  Warning,
  Wind,
  type Icon,
} from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useLayoutEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { State, Weather, WeatherFeed, WeatherWarning } from "../api";
import { COLORS, hhmm } from "../model";

// ------------------------------------------------------------------ helpers

/** Size of an element, following it when it is swapped (callback ref: the strip only exists once data arrives). */
function useSize<T extends HTMLElement>() {
  const [el, ref] = useState<T | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setSize((s) => (Math.abs(s.w - width) < 1 && Math.abs(s.h - height) < 1 ? s : { w: width, h: height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [ref, size] as const;
}

const rem = () => (typeof document !== "undefined" ? parseFloat(getComputedStyle(document.documentElement).fontSize) || 16 : 16);
const mod24 = (h: number) => ((Math.floor(h) % 24) + 24) % 24;
const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${a})`;
};
const clock = (iso?: string) => {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
};
const fmtTemp = (t: number) => `${Math.round(t)}`;

interface Hour {
  h: number;
  temp: number;
  sun: number;
  cloud: number | null;
  wind: number | null;
  precip: number;
  load_x?: number;
  pv_x?: number;
}

/** The next `n` hours starting at the grid's current hour. grid_view is keyed by grid hour; hourly by clock hour. */
function hoursAhead(w: Weather, simHour: number, n: number): Hour[] {
  const h0 = mod24(simHour);
  const gv = (w.grid_view ?? []).filter((g) => g && Number.isFinite(g.h) && Number.isFinite(g.temp_c));
  if (gv.length) {
    const out: Hour[] = [];
    for (let k = 0; k < n; k++) {
      const g = gv.find((x) => mod24(x.h) === (h0 + k) % 24);
      if (!g) continue;
      out.push({ h: (h0 + k) % 24, temp: g.temp_c, sun: Math.max(0, g.sun_wm2 ?? 0), cloud: g.cloud_pct ?? null, wind: g.wind_kmh ?? null, precip: 0, load_x: g.load_x, pv_x: g.pv_x });
    }
    if (out.length) return out;
  }
  const hourly = (w.hourly ?? []).filter((x) => x && Number.isFinite(x.temp_c));
  if (!hourly.length) return [];
  const i0 = Math.max(0, hourly.findIndex((x) => x.hour != null && mod24(x.hour) === h0));
  return hourly.slice(i0, i0 + n).map((x, k) => ({
    h: x.hour != null ? mod24(x.hour) : (h0 + k) % 24,
    temp: x.temp_c,
    sun: Math.max(0, x.sun_wm2 ?? 0),
    cloud: x.cloud_pct ?? null,
    wind: x.wind_kmh ?? null,
    precip: x.precip_mm ?? 0,
  }));
}

function skyIcon(h: Hour | undefined): Icon {
  if (!h) return Cloud;
  if (h.precip > 0.1) return h.temp <= 0.5 ? CloudSnow : CloudRain;
  const day = h.sun >= 40;
  const c = h.cloud ?? 30;
  if (c >= 75) return Cloud;
  if (day) return c < 30 ? Sun : CloudSun;
  return c < 40 ? Moon : CloudMoon;
}

interface Chip {
  key: string;
  tone: string;
  icon: Icon;
  text: string;
  tech?: string;
}

const x1 = (v: number) => `×${v.toFixed(1)}`;
const hhmmClock = hhmm;

/** "What it means for the grid": heating load from cold, solar from sun. Numbers only when the feed gives them. */
function gridChips(hours: Hour[]): Chip[] {
  const chips: Chip[] = [];
  const hhmm = (h: number) => (hours.length && h === hours[0].h ? "now" : hhmmClock(h));
  const withLoad = hours.filter((h) => typeof h.load_x === "number");
  if (withLoad.length) {
    const top = withLoad.reduce((a, b) => (b.load_x! > a.load_x! ? b : a));
    const low = withLoad.reduce((a, b) => (b.load_x! < a.load_x! ? b : a));
    if (top.load_x! >= 1.05) chips.push({ key: "cold", tone: COLORS.take, icon: ThermometerCold, text: `Cold: heating load ${x1(top.load_x!)}`, tech: `peaks ${hhmm(top.h)}` });
    else if (low.load_x! <= 0.95) chips.push({ key: "mild", tone: COLORS.take, icon: ThermometerHot, text: `Mild: heating load ${x1(low.load_x!)}` });
  } else if (hours.length) {
    const cold = hours.reduce((a, b) => (b.temp < a.temp ? b : a));
    if (cold.temp < 6) chips.push({ key: "cold", tone: COLORS.take, icon: ThermometerCold, text: "Cold: more heating load", tech: `${fmtTemp(cold.temp)}° at ${hhmm(cold.h)}` });
  }
  const sunny = hours.filter((h) => h.sun >= 60);
  const withPv = sunny.filter((h) => typeof h.pv_x === "number");
  if (withPv.length) {
    const top = withPv.reduce((a, b) => (b.pv_x! > a.pv_x! ? b : a));
    const low = withPv.reduce((a, b) => (b.pv_x! < a.pv_x! ? b : a));
    if (top.pv_x! >= 1.1) chips.push({ key: "sun", tone: COLORS.give, icon: Sun, text: `Strong sun: solar ${x1(top.pv_x!)}`, tech: `peaks ${hhmm(top.h)}` });
    else if (low.pv_x! <= 0.9) chips.push({ key: "cloud", tone: COLORS.give, icon: CloudSun, text: `Clouds: solar ${x1(low.pv_x!)}` });
  } else if (sunny.length) {
    const top = sunny.reduce((a, b) => (b.sun > a.sun ? b : a));
    if (top.sun >= 400) chips.push({ key: "sun", tone: COLORS.give, icon: Sun, text: "Strong sun: more solar", tech: `peaks ${hhmm(top.h)}` });
  }
  const gust = hours.reduce((m, h) => Math.max(m, h.wind ?? 0), 0);
  if (gust >= 45) chips.push({ key: "wind", tone: COLORS.muted, icon: Wind, text: `Wind up to ${Math.round(gust)} km/h` });
  if (!chips.length && hours.length) chips.push({ key: "calm", tone: COLORS.muted, icon: CloudSun, text: "Ordinary weather for the street" });
  return chips;
}

/** Monotone cubic through the points (no overshoot: a flat night stays flat), as Beziers with the same command
 *  count every time, so motion can morph the path when the hour rolls over. */
function smoothPath(pts: [number, number][]) {
  const n = pts.length;
  if (!n) return "";
  if (n === 1) return `M${pts[0][0]},${pts[0][1]}`;
  const dx = pts.slice(1).map((p, i) => p[0] - pts[i][0]);
  const sl = pts.slice(1).map((p, i) => (p[1] - pts[i][1]) / dx[i]);
  const m = pts.map((_, i) => {
    if (i === 0) return sl[0];
    if (i === n - 1) return sl[n - 2];
    const a = sl[i - 1], b = sl[i];
    return a * b <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / a + (dx[i] + 2 * dx[i - 1]) / b);
  });
  let d = `M${pts[0][0]},${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${(pts[i][0] + h).toFixed(2)},${(pts[i][1] + m[i] * h).toFixed(2)} ${(pts[i + 1][0] - h).toFixed(2)},${(pts[i + 1][1] - m[i + 1] * h).toFixed(2)} ${pts[i + 1][0]},${pts[i + 1][1].toFixed(2)}`;
  }
  return d;
}

// ------------------------------------------------------------------ pieces

function Well({ children, tone, size = "2.9rem" }: { children: ReactNode; tone: string; size?: string }) {
  return (
    <div
      className="grid shrink-0 place-items-center rounded-full"
      style={{
        width: size,
        height: size,
        color: tone,
        background: `radial-gradient(circle at 50% 30%, ${rgba(tone, 0.2)}, ${rgba(tone, 0.05)} 70%), #0f1622`,
        boxShadow: `inset 0 1px 0 rgb(255 255 255 / 0.08), inset 0 0 0 1px ${rgba(tone, 0.22)}, 0 0 28px -6px ${rgba(tone, 0.45)}`,
      }}
    >
      {children}
    </div>
  );
}

function ChipView({ c, bare }: { c: Chip; bare?: boolean }) {
  const I = c.icon;
  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-[0.88rem] font-medium"
      style={{ color: c.tone === COLORS.muted ? "#c9d3e1" : c.tone, background: rgba(c.tone, 0.1), boxShadow: `inset 0 0 0 1px ${rgba(c.tone, 0.28)}, inset 0 1px 0 rgb(255 255 255 / 0.05)` }}
    >
      <I weight="bold" className="shrink-0" size="1em" />
      <span className="truncate">{c.text}</span>
      {c.tech && !bare && <span className="font-normal opacity-60">{c.tech}</span>}
    </span>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string | null; sub?: string; tone?: string }) {
  return (
    <div className="rounded-[0.8rem] bg-black/20 px-3 py-2.5 shadow-[inset_0_1px_2px_rgb(0_0_0/0.45),inset_0_0_0_1px_rgb(255_255_255/0.035)]">
      <div className="label">{label}</div>
      <div className="num mt-0.5 text-[1.2rem] font-semibold text-fg" style={tone ? { color: tone } : undefined}>
        {value ?? "-"}
        {sub && <span className="ml-1.5 text-[0.78rem] font-normal text-dim">{sub}</span>}
      </div>
    </div>
  );
}

function SmallPill({ children, tone }: { children: ReactNode; tone: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-semibold" style={{ color: tone, background: rgba(tone, 0.12), boxShadow: `inset 0 0 0 1px ${rgba(tone, 0.3)}` }}>
      {children}
    </span>
  );
}

function HourStrip({ hours, simHour, tall, compact }: { hours: Hour[]; simHour: number; tall: boolean; compact: boolean }) {
  const reduce = useReducedMotion();
  const [ref, { w }] = useSize<HTMLDivElement>();
  const n = hours.length;
  const colW = n ? w / n : 0;
  const every = colW && colW < 40 ? 2 : 1;
  const temps = hours.map((h) => h.temp);
  const lo = Math.min(...temps), hi = Math.max(...temps);
  const span = Math.max(4, hi - lo);
  const mid = (lo + hi) / 2;
  // y in % of the curve box, leaving room above the highest dot for its label (measured, so it holds in any height).
  const [curveRef, curve] = useSize<HTMLDivElement>();
  const top = curve.h ? Math.min(62, Math.max(18, (1.75 * rem() * 100) / curve.h)) : 40;
  const yOf = (t: number) => (top + 86) / 2 - ((t - mid) / span) * (86 - top);
  const pts: [number, number][] = hours.map((h, i) => [i * 100 + 50, yOf(h.temp)]);
  const line = smoothPath(pts);
  const area = n ? `${line} L${pts[n - 1][0]},100 L${pts[0][0]},100 Z` : "";
  const sunMax = Math.max(700, ...hours.map((h) => h.sun));
  const peak = hours.reduce((a, b, i) => (b.sun > hours[a].sun ? i : a), 0);
  const tr = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 120, damping: 22 };
  const frac = simHour - Math.floor(simHour);
  const showLabel = (i: number) => i % every === 0;

  return (
    <div
      ref={ref}
      className={`relative flex h-full min-h-0 flex-col rounded-[0.85rem] px-1 ${compact ? "pb-1.5 pt-1.5" : "pb-2 pt-2"}`}
      style={{ background: "linear-gradient(180deg, rgb(0 0 0 / 0.28), rgb(0 0 0 / 0.12))", boxShadow: "inset 0 1px 3px rgb(0 0 0 / 0.55), inset 0 0 0 1px rgb(255 255 255 / 0.035)" }}
    >
      {/* the current grid hour, lifted */}
      <div
        className="pointer-events-none absolute bottom-1 top-1 rounded-[0.65rem]"
        style={{ left: `calc(0.25rem + (100% - 0.5rem) * 0 / ${n})`, width: `calc((100% - 0.5rem) / ${n})`, background: "linear-gradient(180deg, rgb(255 255 255 / 0.07), rgb(255 255 255 / 0.02))", boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.08)" }}
      />
      {/* where inside the hour the grid clock is */}
      <div className={`pointer-events-none absolute top-2 w-px bg-signal/50 ${compact ? "bottom-6" : "bottom-8"}`} style={{ left: `calc(0.25rem + (100% - 0.5rem) * ${frac.toFixed(3)} / ${n})`, boxShadow: `0 0 8px ${rgba(COLORS.signal, 0.7)}` }} />

      {/* temperature */}
      <div ref={curveRef} className={`relative flex-[1.25] ${compact ? "min-h-[2.6rem]" : "min-h-[3.6rem]"}`}>
        <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${n * 100} 100`} preserveAspectRatio="none" aria-hidden style={{ filter: "drop-shadow(0 0 6px rgb(220 232 246 / 0.35))" }}>
          <defs>
            <linearGradient id="wx-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#dce8f6" stopOpacity="0.16" />
              <stop offset="1" stopColor="#dce8f6" stopOpacity="0" />
            </linearGradient>
          </defs>
          <motion.path d={area} fill="url(#wx-area)" initial={false} animate={{ d: area }} transition={tr} />
          <motion.path d={line} fill="none" stroke="#e6eef8" strokeWidth={2.4} vectorEffect="non-scaling-stroke" strokeLinecap="round" initial={false} animate={{ d: line }} transition={tr} />
        </svg>
        {hours.map((h, i) => (
          <motion.div key={i} className="absolute" style={{ left: `${((i + 0.5) / n) * 100}%` }} initial={false} animate={{ top: `${yOf(h.temp)}%` }} transition={tr}>
            <div className="absolute size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f2f6fb]" style={{ boxShadow: i === 0 ? `0 0 0 3px ${rgba("#ffffff", 0.14)}` : undefined, opacity: showLabel(i) ? 1 : 0.55 }} />
            {showLabel(i) && (
              <div className={`num absolute -translate-x-1/2 -translate-y-[calc(100%+7px)] whitespace-nowrap ${i === 0 ? (compact ? "text-[0.95rem]" : "text-[1.05rem]") + " font-semibold text-fg" : (compact ? "text-[0.86rem]" : "text-[0.92rem]") + " font-medium text-[#cfd8e4]"}`}>
                {fmtTemp(h.temp)}°
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* sun for solar */}
      <div className={`relative grid flex-1 items-end ${compact ? "min-h-[1.1rem]" : "min-h-[1.6rem]"}`} style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {hours.map((h, i) => {
          const f = h.sun / sunMax;
          return (
            <div key={i} className="relative flex h-full items-end justify-center" title={`${hhmm(h.h)}: sun ${Math.round(h.sun)} W/m²`}>
              {h.sun >= 15 ? (
                <motion.div
                  className="w-[46%] max-w-[1.5rem] rounded-t-[0.35rem] rounded-b-[0.15rem]"
                  initial={false}
                  animate={{ height: `${Math.max(6, f * 100)}%` }}
                  transition={tr}
                  style={{
                    background: `linear-gradient(0deg, ${rgba(COLORS.give, 0.95)}, ${rgba(COLORS.give, 0.45 + 0.4 * f)})`,
                    boxShadow: `0 0 ${6 + 14 * f}px ${rgba(COLORS.give, 0.2 + 0.4 * f)}, inset 0 1px 0 rgb(255 255 255 / 0.5)`,
                  }}
                />
              ) : (
                <div className="mb-0.5 h-[3px] w-[30%] max-w-[0.9rem] rounded-full bg-white/10" />
              )}
              {i === peak && h.sun >= 60 && !compact && (
                <div className="num pointer-events-none absolute whitespace-nowrap text-[0.78rem] font-semibold text-give" style={{ bottom: `calc(${Math.max(6, f * 100)}% + 3px)` }}>
                  {Math.round(h.sun)} W/m²
                </div>
              )}
            </div>
          );
        })}
      </div>

      {tall && (
        <div className="mt-1.5 grid shrink-0" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {hours.map((h, i) => (
            <div key={i} className={`num text-center text-[0.8rem] text-faint ${showLabel(i) ? "" : "opacity-0"}`}>
              {h.wind != null ? Math.round(h.wind) : ""}
            </div>
          ))}
        </div>
      )}

      {/* time axis */}
      <div className={`grid shrink-0 ${compact ? "mt-1" : "mt-1.5"}`} style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {hours.map((h, i) => (
          <div key={i} className={`num text-center ${compact ? "text-[0.8rem]" : "text-[0.86rem]"} ${i === 0 ? "font-semibold text-fg" : "text-dim"} ${showLabel(i) || i === 0 ? "" : "opacity-0"}`}>
            {i === 0 ? "Now" : hhmm(h.h)}
          </div>
        ))}
      </div>
    </div>
  );
}

function Legend({ wind }: { wind: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.78rem] text-dim">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-[2px] w-4 rounded-full bg-[#e6eef8] shadow-[0_0_6px_rgb(220_232_246/0.6)]" />
        Temperature
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-1.5 rounded-sm" style={{ background: COLORS.give, boxShadow: `0 0 8px ${rgba(COLORS.give, 0.6)}` }} />
        Sun for solar
      </span>
      {wind && <span>Wind km/h above the times</span>}
    </div>
  );
}

function Skeleton({ stacked }: { stacked: boolean }) {
  const bar = "rounded-full bg-white/[0.06] animate-pulse";
  return (
    <div className={`flex h-full min-h-0 gap-5 ${stacked ? "flex-col" : "flex-row"}`} aria-busy="true" aria-label="Loading weather">
      <div className={`flex min-w-0 shrink-0 flex-col justify-center gap-3 ${stacked ? "" : "w-[15rem]"}`}>
        <div className="flex items-center gap-3">
          <div className={`size-[2.9rem] ${bar}`} />
          <div className={`h-9 w-16 ${bar}`} />
          <div className="flex flex-col gap-1.5">
            <div className={`h-3 w-28 ${bar}`} />
            <div className={`h-2.5 w-20 ${bar}`} />
          </div>
        </div>
        <div className={`h-3 w-[90%] ${bar}`} />
        <div className="flex gap-2">
          <div className={`h-6 w-36 ${bar}`} />
          <div className={`h-6 w-28 ${bar}`} />
        </div>
      </div>
      <div className={`flex flex-1 items-end gap-[3%] rounded-[0.85rem] bg-black/20 px-3 pb-3 pt-3 ${stacked ? "h-[11rem]" : "h-full min-h-[4rem]"}`}>
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="flex-1 animate-pulse rounded-t-md bg-white/[0.05]" style={{ height: `${18 + 40 * Math.max(0, Math.sin((i + 2) / 4))}%`, animationDelay: `${i * 60}ms` }} />
        ))}
      </div>
    </div>
  );
}

function Offline({ compact }: { compact: boolean }) {
  return (
    <div className={`flex h-full items-center gap-4 ${compact ? "" : "min-h-[7rem]"}`}>
      <Well tone={COLORS.muted} size={compact ? "2.5rem" : "2.9rem"}>
        <CloudSlash size="1.45rem" weight="duotone" />
      </Well>
      <div className="min-w-0">
        <div className="text-[1.05rem] font-semibold tracking-[-0.01em] text-fg">Weather offline</div>
        <div className="mt-0.5 max-w-[46ch] text-[0.86rem] leading-snug text-dim">The grid keeps working on its own load forecast. The weather comes back here as soon as the feed answers.</div>
        <div className="tech mt-1">weather feed (/api/weather) not reachable</div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ the strip

export default function WeatherStrip({ s, weather }: { s: State; weather: WeatherFeed }) {
  const reduce = useReducedMotion();
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const [stripRef, strip] = useSize<HTMLDivElement>();
  const remPx = rem();
  // Layout by the box App gives us, in rem so it scales with the projector font size.
  const stacked = w > 0 && w / remPx < 34; // phone: everything in one column, natural height
  const compact = !stacked && h > 0 && h / remPx < 13; // the short slot on the desktop board
  const tall = !stacked && h / remPx >= 17; // a view of its own: room for details
  const roomy = compact && h / remPx >= 9.6; // short slot on a big screen: one line of summary fits
  const nCols = strip.w ? Math.max(5, Math.min(12, Math.floor(strip.w / (3.5 * remPx)))) : stacked ? 8 : 12;
  const data = weather.data;
  const hours = useMemo(() => (data ? hoursAhead(data, s.sim_hour, nCols) : []), [data, s.sim_hour, nCols]);
  const chips = useMemo(() => gridChips(hours), [hours]);
  const offline = !weather.available && !weather.checking && !weather.sample;

  let body: ReactNode;
  if (offline) body = <Offline compact={compact} />;
  else if (!data) body = <Skeleton stacked={stacked} />;
  else {
    const now = hours[0];
    const nowTemp = now?.temp ?? data.now?.temp_c;
    const nowWind = now?.wind ?? data.now?.wind_kmh;
    const SkyIcon = skyIcon(now ?? (data.now ? { h: mod24(s.sim_hour), temp: data.now.temp_c, sun: data.now.sun_wm2 ?? 0, cloud: data.now.cloud_pct ?? null, wind: null, precip: data.now.precip_mm ?? 0 } : undefined));
    const day = (now?.sun ?? data.now?.sun_wm2 ?? 0) >= 40;
    const name = data.location?.name;
    const updated = clock(data.fetched_at);
    const bigTemp = tall ? "text-[3.6rem]" : compact ? "text-[2.35rem]" : "text-[2.9rem]";
    const sky = (
      <Well tone={day ? COLORS.give : "#a9b8d0"} size={tall ? "3.6rem" : compact ? "2.4rem" : "2.9rem"}>
        <SkyIcon size={tall ? "1.9rem" : compact ? "1.25rem" : "1.45rem"} weight="duotone" />
      </Well>
    );
    const temp = (
      <div className={`num shrink-0 font-semibold leading-none tracking-[-0.04em] text-fg ${bigTemp}`}>
        {nowTemp != null ? fmtTemp(nowTemp) : "-"}
        <span className="text-dim">°</span>
      </div>
    );
    const flags = (
      <>
        {data.stale && (
          <SmallPill tone={COLORS.warn}>
            <ClockCounterClockwise weight="bold" size="1em" />
            Stale
          </SmallPill>
        )}
        {weather.sample && <SmallPill tone={COLORS.muted}>Sample</SmallPill>}
      </>
    );

    const nowBlock = compact ? (
      <div className={`flex min-w-0 shrink-0 flex-col justify-center gap-2 ${roomy ? "w-[19rem]" : "w-[15.5rem]"}`} title={data.summary}>
        <div className="flex items-center gap-2.5">
          {sky}
          {temp}
          <div className="ml-0.5 min-w-0">
            <div className="truncate text-[0.9rem] font-medium text-fg">{name ?? "Weather"}</div>
            <div className="flex items-center gap-1.5">
              <span className="tech truncate">{updated ? `updated ${updated}` : "weather"}</span>
              {flags}
            </div>
          </div>
        </div>
        {roomy && data.summary && <p className="line-clamp-1 text-[0.88rem] leading-snug text-[#c3cddb]">{data.summary}</p>}
        {chips.length > 0 && (
          <div className="flex min-w-0 flex-col items-start gap-1">
            {chips.slice(0, 2).map((c) => (
              <ChipView key={c.key} c={c} bare />
            ))}
          </div>
        )}
      </div>
    ) : (
      <div className={`flex min-w-0 flex-col gap-2.5 ${stacked ? "" : tall ? "justify-start" : "justify-center"}`}>
        <div className="flex items-center gap-3">
          {sky}
          {temp}
          <div className="ml-1 min-w-0">
            <div className="truncate text-[0.95rem] font-medium text-fg">{name ? `Weather in ${name}` : "Weather"}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="tech whitespace-nowrap">
                {nowWind != null ? `wind ${Math.round(nowWind)} km/h` : ""}
                {nowWind != null && updated ? " · " : ""}
                {updated ? `updated ${updated}` : ""}
              </span>
              {flags}
            </div>
          </div>
        </div>
        {data.summary && <p className="line-clamp-2 max-w-[52ch] text-[0.98rem] leading-snug text-[#c3cddb]">{data.summary}</p>}
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {chips.slice(0, 3).map((c) => (
              <ChipView key={c.key} c={c} />
            ))}
          </div>
        )}
        {tall && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Stat label="Feels like" value={data.now?.feels_c != null ? `${fmtTemp(data.now.feels_c)}°` : null} />
            <Stat label="Sun for solar" value={now ? `${Math.round(now.sun)} W/m²` : null} tone={now && now.sun >= 60 ? COLORS.give : undefined} />
            <Stat label="Clouds" value={now?.cloud != null ? `${Math.round(now.cloud)} %` : null} />
            <Stat label="Wind" value={nowWind != null ? `${Math.round(nowWind)} km/h` : null} sub={data.now?.gust_kmh != null ? `gusts ${Math.round(data.now.gust_kmh)}` : undefined} />
          </div>
        )}
      </div>
    );

    const stripView = hours.length ? (
      <HourStrip hours={hours} simHour={s.sim_hour} tall={tall} compact={compact} />
    ) : (
      <div className="grid h-full min-h-[5rem] place-items-center rounded-[0.85rem] bg-black/20 px-4 text-center text-[0.86rem] text-dim">No hourly forecast yet</div>
    );

    body = stacked ? (
      <div className="flex flex-col gap-4">
        {nowBlock}
        <div ref={stripRef} className="h-[11rem]">
          {stripView}
        </div>
        {hours.length > 0 && <Legend wind={false} />}
      </div>
    ) : compact ? (
      <div className="flex h-full min-h-0 gap-4">
        {nowBlock}
        <div ref={stripRef} className="min-h-0 min-w-0 flex-1">
          {stripView}
        </div>
      </div>
    ) : (
      <div className="grid h-full min-h-0 gap-5" style={{ gridTemplateColumns: "minmax(15rem, 0.9fr) minmax(0, 2fr)" }}>
        {nowBlock}
        <div className="flex min-h-0 min-w-0 flex-col gap-1.5">
          {tall && hours.length > 0 && (
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-[0.86rem] font-medium text-dim">
                Next {hours.length} hours <span className="tech">grid time</span>
              </div>
              <Legend wind />
            </div>
          )}
          <div ref={stripRef} className="min-h-0 flex-1">
            {stripView}
          </div>
        </div>
      </div>
    );
  }

  const stateKey = offline ? "off" : data ? "on" : "load";
  return (
    <div ref={ref} className={`panel flex h-full min-h-0 flex-col overflow-hidden ${compact ? "px-4 py-3" : "p-4"} ${stacked ? "" : "lg:px-5"}`}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={stateKey}
          className="min-h-0 flex-1"
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          {body}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ------------------------------------------------------------------ official warnings

const LEVEL: Record<WeatherWarning["level"], { color: string; word: string; rank: number }> = {
  red: { color: "#ff4d5e", word: "Red warning", rank: 3 },
  orange: { color: "#ff8a3d", word: "Orange warning", rank: 2 },
  yellow: { color: "#f5d04a", word: "Yellow warning", rank: 1 },
};

function warnIcon(type?: string): Icon {
  const t = (type ?? "").toLowerCase();
  if (t.includes("wind") || t.includes("storm")) return Wind;
  if (t.includes("thunder") || t.includes("lightning")) return CloudLightning;
  if (t.includes("snow")) return CloudSnow;
  if (t.includes("ice") || t.includes("frost") || t.includes("glatt")) return Snowflake;
  if (t.includes("cold")) return ThermometerCold;
  if (t.includes("heat") || t.includes("hitze")) return ThermometerHot;
  if (t.includes("rain")) return CloudRain;
  if (t.includes("fog")) return CloudFog;
  return Warning;
}

function dayWord(d: Date) {
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((d0 - t0) / 86_400_000);
  return diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : d.toLocaleDateString("en-GB", { weekday: "short" });
}

function whenText(w: WeatherWarning) {
  const from = w.from ? new Date(w.from) : null;
  const to = w.to ? new Date(w.to) : null;
  const ok = (d: Date | null): d is Date => !!d && !isNaN(d.getTime());
  const hm = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const now = Date.now();
  if (ok(from) && ok(to)) {
    if (from.getTime() <= now && now < to.getTime()) return `Now until ${dayWord(to) === "Today" ? "" : `${dayWord(to)} `}${hm(to)}`;
    const sameDay = dayWord(from) === dayWord(to);
    return `${dayWord(from)} ${hm(from)} to ${sameDay ? "" : `${dayWord(to)} `}${hm(to)}`;
  }
  if (ok(from)) return `From ${dayWord(from)} ${hm(from)}`;
  if (ok(to)) return `Until ${dayWord(to)} ${hm(to)}`;
  return null;
}

export function WarningBanner({ weather }: { weather: WeatherFeed }) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const list = useMemo(() => {
    const ws = weather.available ? weather.data?.warnings ?? [] : [];
    return ws
      .filter((w) => w && w.title && LEVEL[w.level])
      .slice()
      .sort((a, b) => LEVEL[b.level].rank - LEVEL[a.level].rank || (a.from ?? "").localeCompare(b.from ?? ""));
  }, [weather.available, weather.data]);
  if (!list.length) return null;

  const top = list[0];
  const rest = list.slice(1);
  const lv = LEVEL[top.level];
  const I = warnIcon(top.type ?? top.title);
  const when = whenText(top);
  const style: CSSProperties = {
    background: `linear-gradient(90deg, ${rgba(lv.color, 0.16)}, ${rgba(lv.color, 0.05)} 42%, rgb(255 255 255 / 0) 75%), linear-gradient(180deg, rgb(255 255 255 / 0.03), rgb(255 255 255 / 0)), var(--color-deck)`,
    boxShadow: `inset 0 1px 0 rgb(255 255 255 / 0.06), inset 0 0 0 1px ${rgba(lv.color, 0.3)}, 0 18px 44px -24px ${rgba(lv.color, 0.55)}`,
  };

  return (
    <motion.section
      role="status"
      aria-live="polite"
      className="relative shrink-0 overflow-hidden rounded-[1.1rem]"
      style={style}
      initial={reduce ? false : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute inset-y-0 left-0 w-[4px]" style={{ background: lv.color, boxShadow: `0 0 18px 2px ${rgba(lv.color, 0.6)}` }} />
      <div className="flex items-center gap-4 py-3 pl-5 pr-3 sm:pr-4">
        <Well tone={lv.color} size="2.7rem">
          <I size="1.4rem" weight="duotone" />
        </Well>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2.5">
            <span className="text-[0.74rem] font-semibold uppercase tracking-[0.08em]" style={{ color: lv.color }}>
              {lv.word}
            </span>
            <span className="tech">official weather warning</span>
          </div>
          <div className="truncate text-[1.12rem] font-semibold tracking-[-0.01em] text-fg">{top.title}</div>
          <div className="mt-0.5 flex flex-wrap gap-x-2 text-[0.8rem] text-dim sm:hidden">
            {when && <span className="num text-fg/85">{when}</span>}
            {top.source && <span>{top.source}</span>}
          </div>
        </div>
        <div className="hidden shrink-0 text-right sm:block">
          {when && <div className="num text-[0.98rem] font-semibold text-fg">{when}</div>}
          {top.source && <div className="tech mt-0.5">{top.source}</div>}
        </div>
        {rest.length > 0 && (
          <button type="button" className="btn shrink-0" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            +{rest.length} more
            <motion.span animate={{ rotate: open ? 180 : 0 }} transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 24 }} className="inline-flex">
              <CaretDown weight="bold" size="0.9em" />
            </motion.span>
          </button>
        )}
      </div>
      <AnimatePresence initial={false}>
        {open && rest.length > 0 && (
          <motion.div
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <ul className="flex flex-col gap-1.5 px-5 pb-3">
              {rest.map((w, i) => {
                const l = LEVEL[w.level];
                const WI = warnIcon(w.type ?? w.title);
                const t = whenText(w);
                return (
                  <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-xl bg-black/20 px-3 py-2 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.04)]">
                    <WI size="1.1rem" weight="duotone" style={{ color: l.color }} />
                    <span className="text-[0.74rem] font-semibold" style={{ color: l.color }}>
                      {l.word}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[0.92rem] font-medium text-fg">{w.title}</span>
                    {t && <span className="num text-[0.84rem] text-dim">{t}</span>}
                    {w.source && <span className="tech">{w.source}</span>}
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
