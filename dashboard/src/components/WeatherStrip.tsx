// Weather for the street, lined up with GRID time (the simulator's clock), plus the official warning banner.
// WeatherStrip (Apple white, DESIGN.md): the place, the temperature now big, one plain line of what the weather does to
// the street, then the next hours: temperature as an ink line with values, sun as flat grey bars, hours along the bottom.
// WarningBanner: a white card with the most severe official warning; red only on the level marker for orange/red.
import { useLayoutEffect, useMemo, useState } from "react";
import type { State, Weather, WeatherFeed, WeatherWarning } from "../api";
import { hhmm } from "../model";
import { Badge } from "./ui";

// ------------------------------------------------------------------ helpers

/** Size of an element, following it when it is swapped (callback ref: the chart only exists once data arrives). */
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
const fmtTemp = (t: number) => `${Math.round(t)}`;
const SUN_MIN = 15; // W/m² below this there is no useful solar

interface Hour {
  h: number;
  temp: number;
  sun: number;
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
      out.push({ h: (h0 + k) % 24, temp: g.temp_c, sun: Math.max(0, g.sun_wm2 ?? 0), load_x: g.load_x, pv_x: g.pv_x });
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
  }));
}

/** When the sun is next strong enough for solar (grid hour), looking up to a day ahead. */
function nextSun(w: Weather, simHour: number): number | null {
  const day = hoursAhead(w, simHour, 24);
  return day.find((h) => h.sun >= SUN_MIN)?.h ?? null;
}

const partOfDay = (h: number) => (h >= 5 && h < 12 ? "morning" : h >= 12 && h < 17 ? "afternoon" : h >= 17 && h < 22 ? "evening" : "night");
const pct = (x: number) => `${Math.round(Math.abs(x - 1) * 100)}\u00a0%`;

/** One plain line of what the weather does to the street: heating load from cold, solar from sun. Numbers only when
 *  the feed gives them (grid_view load_x / pv_x). */
function meaning(hours: Hour[], simHour: number): string | null {
  if (!hours.length) return null;
  const now = hours[0];
  const feel = now.temp < 6 ? "Cold" : now.temp < 14 ? "Cool" : now.temp >= 24 ? "Hot" : "Mild";
  const lead = `${feel} ${partOfDay(mod24(simHour))}`;
  const parts: string[] = [];
  const withLoad = hours.filter((h) => typeof h.load_x === "number");
  if (withLoad.length) {
    const top = withLoad.reduce((a, b) => (b.load_x! > a.load_x! ? b : a));
    const low = withLoad.reduce((a, b) => (b.load_x! < a.load_x! ? b : a));
    if (top.load_x! >= 1.05) parts.push(`heating load up\u00a0${pct(top.load_x!)}`);
    else if (low.load_x! <= 0.95) parts.push(`heating load down\u00a0${pct(low.load_x!)}`);
  } else if (Math.min(...hours.map((h) => h.temp)) < 6) parts.push("more heating load");
  const sunny = hours.filter((h) => h.sun >= 60);
  const withPv = sunny.filter((h) => typeof h.pv_x === "number");
  if (withPv.length) {
    const top = withPv.reduce((a, b) => (b.pv_x! > a.pv_x! ? b : a));
    const low = withPv.reduce((a, b) => (b.pv_x! < a.pv_x! ? b : a));
    if (top.pv_x! >= 1.1) parts.push(`solar up\u00a0${pct(top.pv_x!)}`);
    else if (low.pv_x! <= 0.9) parts.push(`clouds cut solar\u00a0${pct(low.pv_x!)}`);
  } else if (sunny.some((h) => h.sun >= 400)) parts.push("strong solar");
  if (!parts.length) return `${lead}: ordinary load for the street`;
  return `${lead}: ${parts.join(", ")}`;
}

/** Monotone cubic through the points (no overshoot: a flat night stays flat). */
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
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${(pts[i][0] + h).toFixed(1)},${(pts[i][1] + m[i] * h).toFixed(1)} ${(pts[i + 1][0] - h).toFixed(1)},${(pts[i + 1][1] - m[i + 1] * h).toFixed(1)} ${pts[i + 1][0].toFixed(1)},${pts[i + 1][1].toFixed(1)}`;
  }
  return d;
}

// ------------------------------------------------------------------ the chart

const ease = "transition-[height] duration-[250ms] ease-[cubic-bezier(0,0,0.5,1)]";

/** Next hours: an ink temperature line with its values, flat grey sun bars under it, the hours along the bottom. */
function Hours({ hours, showSun }: { hours: Hour[]; showSun: boolean }) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const n = hours.length;
  const r = rem();
  const temps = hours.map((x) => x.temp);
  const lo = Math.min(...temps), hi = Math.max(...temps);
  const span = Math.max(4, hi - lo);
  const mid = (lo + hi) / 2;
  // room above the highest point for its value, a little below the lowest
  const top = 1.55 * r, bottom = 0.45 * r;
  const yOf = (t: number) => top + (0.5 - (t - mid) / span) * Math.max(0, h - top - bottom);
  const pts: [number, number][] = w && h ? hours.map((x, i) => [((i + 0.5) / n) * w, yOf(x.temp)]) : [];
  const sunMax = Math.max(700, ...hours.map((x) => x.sun));
  const cols = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* temperature */}
      <div ref={ref} className="relative min-h-[3.5rem] flex-[1.6]">
        {pts.length > 0 && (
          <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${w} ${h}`} aria-hidden>
            <path d={smoothPath(pts)} fill="none" stroke="#1d1d1f" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            {pts.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={i === 0 ? 4.5 : 3} fill={i === 0 ? "#1d1d1f" : "#ffffff"} stroke="#1d1d1f" strokeWidth={i === 0 ? 0 : 1.75} />
            ))}
          </svg>
        )}
        {pts.map(([x, y], i) => (
          <div
            key={i}
            className={`absolute whitespace-nowrap text-[0.875rem] leading-none tabular-nums tracking-[-0.016em] ${i === 0 ? "font-semibold text-ink" : "text-secondary"}`}
            style={{ left: x, top: y - 0.62 * r, transform: "translate(-50%, -100%)" }}
          >
            {fmtTemp(hours[i].temp)}°
          </div>
        ))}
      </div>

      {/* sun for solar */}
      {showSun && (
        <div className="grid min-h-[1.25rem] flex-1 items-end" style={cols}>
          {hours.map((x, i) => (
            <div key={i} className="flex h-full items-end justify-center" title={`${hhmm(x.h)}: sun ${Math.round(x.sun)} W/m²`}>
              {x.sun >= SUN_MIN && (
                <div className={`w-[42%] max-w-[1.4rem] rounded-t-[4px] bg-fill-press ${ease}`} style={{ height: `${Math.max(8, (x.sun / sunMax) * 100)}%` }} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* hours, grid time */}
      <div className="mt-2 grid shrink-0" style={cols}>
        {hours.map((x, i) => (
          <div key={i} className={`text-center text-[0.8125rem] leading-tight tabular-nums tracking-[-0.01em] ${i === 0 ? "font-semibold text-ink" : "text-tertiary"}`}>
            {i === 0 ? "Now" : hhmm(x.h)}
          </div>
        ))}
      </div>
    </div>
  );
}

/** What the line and the bars are, in a caption. */
function Key({ showSun, sunAt }: { showSun: boolean; sunAt: number | null }) {
  return (
    <div className="t-caption flex flex-wrap items-center gap-x-4 gap-y-1">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-[2px] w-4 rounded-full bg-ink" />
        Temperature
      </span>
      {showSun ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-1.5 rounded-t-[2px] bg-fill-press" />
          Sun for solar
        </span>
      ) : (
        <span>{sunAt != null ? `No sun for solar until ${hhmm(sunAt)}` : "No sun for solar"}</span>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ the card

export default function WeatherStrip({ s, weather }: { s: State; weather: WeatherFeed }) {
  const [chartRef, chart] = useSize<HTMLDivElement>();
  const [cardRef, card] = useSize<HTMLDivElement>();
  const r = rem();
  // Fewer hours rather than cramming: one per ~3.3rem of width, 4 to 12.
  const nCols = chart.w ? Math.max(4, Math.min(12, Math.floor(chart.w / (3.3 * r)))) : 6;
  const data = weather.data;
  const hours = useMemo(() => (data ? hoursAhead(data, s.sim_hour, nCols) : []), [data, s.sim_hour, nCols]);
  const line = useMemo(() => meaning(hours, s.sim_hour), [hours, s.sim_hour]);
  const sunAt = useMemo(() => (data ? nextSun(data, s.sim_hour) : null), [data, s.sim_hour]);
  const offline = !weather.available && !weather.checking && !weather.sample;
  // A very short slot drops the key first; everything else always shows.
  const showKey = !card.h || card.h / r >= 12;

  if (offline)
    return (
      <div className="panel flex h-full flex-col gap-1 px-5 py-4 lg:px-6">
        <h2 className="t-title text-ink">Weather offline</h2>
        <p className="t-small max-w-[34ch]">The grid keeps working on its own load forecast.</p>
      </div>
    );

  if (!data)
    return (
      <div className="panel flex h-full min-h-[8rem] flex-col gap-1 px-5 py-4 lg:px-6">
        <h2 className="t-title text-ink">Weather</h2>
        <p className="t-small">Checking the weather feed</p>
      </div>
    );

  const now = hours[0];
  const nowTemp = now?.temp ?? data.now?.temp_c;
  const name = data.location?.name;
  const showSun = hours.some((x) => x.sun >= SUN_MIN);
  const badge = weather.sample ? <Badge>Sample</Badge> : data.stale ? <Badge>Not updated</Badge> : null;

  return (
    <div ref={cardRef} className="panel flex h-full min-h-0 flex-col gap-3 px-5 py-4 lg:px-6">
      {/* the temperature now, big; the place and what it means for the street next to it */}
      <div className="flex shrink-0 items-start gap-4">
        <div className="t-num shrink-0 text-ink">
          {nowTemp != null ? fmtTemp(nowTemp) : "-"}°
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-start justify-between gap-2">
            <h2 className="min-w-0 text-[1.0625rem] font-semibold leading-tight tracking-[-0.022em] text-ink">{name ?? "Weather"}</h2>
            {badge}
          </div>
          {(line ?? data.summary) && <p className="t-small mt-0.5 text-ink">{line ?? data.summary}</p>}
        </div>
      </div>

      <div ref={chartRef} className="flex h-[10rem] min-h-0 flex-col lg:h-auto lg:flex-1">
        {hours.length ? (
          <Hours hours={hours} showSun={showSun} />
        ) : (
          <div className="t-small flex flex-1 items-center">No hourly forecast yet</div>
        )}
      </div>

      {hours.length > 0 && showKey && (
        <div className="shrink-0">
          <Key showSun={showSun} sunAt={sunAt} />
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ official warnings

const LEVEL: Record<WeatherWarning["level"], { word: string; level: string; rank: number; alert: boolean }> = {
  red: { word: "Severe weather warning", level: "Red level", rank: 3, alert: true },
  orange: { word: "Weather warning", level: "Orange level", rank: 2, alert: true },
  yellow: { word: "Weather notice", level: "Yellow level", rank: 1, alert: false },
};

function dayWord(d: Date) {
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((d0 - t0) / 86_400_000);
  return diff === 0 ? "today" : diff === 1 ? "tomorrow" : d.toLocaleDateString("en-GB", { weekday: "long" });
}

/** The time window in plain words: "Now until 18:00", "Today 15:00 to tomorrow 00:00". */
function whenText(w: WeatherWarning) {
  const from = w.from ? new Date(w.from) : null;
  const to = w.to ? new Date(w.to) : null;
  const ok = (d: Date | null): d is Date => !!d && !isNaN(d.getTime());
  const hm = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  const now = Date.now();
  if (ok(from) && ok(to)) {
    if (from.getTime() <= now && now < to.getTime()) return `Now until ${dayWord(to) === "today" ? "" : `${dayWord(to)} `}${hm(to)}`;
    const sameDay = dayWord(from) === dayWord(to);
    return `${cap(dayWord(from))} ${hm(from)} to ${sameDay ? "" : `${dayWord(to)} `}${hm(to)}`;
  }
  if (ok(from)) return `From ${dayWord(from)} ${hm(from)}`;
  if (ok(to)) return `Until ${dayWord(to)} ${hm(to)}`;
  return null;
}

/** One warning on one line (wraps on a phone): level marker and word, title, time window, source small. */
function WarningRow({ w }: { w: WeatherWarning }) {
  const lv = LEVEL[w.level];
  const when = whenText(w);
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5">
      <span className={`inline-flex shrink-0 items-center gap-2 text-[0.9375rem] font-semibold tracking-[-0.016em] ${lv.alert ? "text-red" : "text-secondary"}`}>
        <span className={`size-2.5 shrink-0 self-center rounded-full ${lv.alert ? "bg-red" : "bg-tertiary"}`} aria-hidden />
        {lv.word}
      </span>
      <span className="text-[1.0625rem] font-semibold tracking-[-0.022em] text-ink">{w.title}</span>
      {when && <span className="text-[1.0625rem] tabular-nums tracking-[-0.022em] text-ink">{when}</span>}
      <span className="t-caption">
        {lv.level}
        {w.source ? `, ${w.source}` : ""}
      </span>
    </div>
  );
}

export function WarningBanner({ weather }: { weather: WeatherFeed }) {
  const [open, setOpen] = useState(false);
  const list = useMemo(() => {
    const ws = weather.available ? weather.data?.warnings ?? [] : [];
    return ws
      .filter((w) => w && w.title && LEVEL[w.level])
      .slice()
      .sort((a, b) => LEVEL[b.level].rank - LEVEL[a.level].rank || (a.from ?? "").localeCompare(b.from ?? ""));
  }, [weather.available, weather.data]);
  if (!list.length) return null;

  const rest = list.slice(1);
  return (
    <section role="status" aria-live="polite" className="panel shrink-0 px-5 py-3 lg:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <div className="min-w-0 flex-1">
          <WarningRow w={list[0]} />
        </div>
        {rest.length > 0 && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="shrink-0 rounded-[6px] text-[0.9375rem] font-medium tracking-[-0.016em] text-secondary transition-colors duration-100 hover:text-ink hover:underline active:text-ink/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
          >
            {open ? "Show less" : `and ${rest.length} more`}
          </button>
        )}
      </div>
      {open && rest.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          {rest.map((w, i) => (
            <WarningRow key={i} w={w} />
          ))}
        </div>
      )}
    </section>
  );
}
