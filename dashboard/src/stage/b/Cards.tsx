// Stage B's cards: plain white Apple Home tiles, one live idea each. Every number comes from the live feeds; a missing
// reading says so in grey instead of showing a value.
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { State, Weather, WeatherFeed } from "../../api";
import { hhmm } from "../../model";
import { P, loadTone } from "../palette";
import Counter, { fmtNum } from "../kit/Counter";
import { useTween } from "../kit/tween";
import type { Flatten } from "./feeds";

/** Size of an element, kept fresh with a ResizeObserver. */
export function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box] as const;
}

/** A white tile on the Apple ground: 28px corners on desktop, 18px on the phone, depth by a soft shadow only. */
export function Tile({ children, className = "", style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <section
      className={`relative min-h-0 min-w-0 overflow-hidden rounded-[18px] bg-white lg:rounded-[28px] ${className}`}
      style={{ boxShadow: "0 4px 24px rgba(0,0,0,.06)", ...style }}
    >
      {children}
    </section>
  );
}

/** Number + half-size unit, apple.com style ("86" big, "%" small and secondary). */
export function Num({ value, unit, className = "", color, decimals = 0, format }: {
  value: number | null | undefined; unit?: string; className?: string; color?: string; decimals?: number; format?: (v: number) => string;
}) {
  return (
    <span className={`whitespace-nowrap font-semibold tabular-nums ${className}`} style={{ color }}>
      <Counter value={value} decimals={decimals} format={format} />
      {unit && value != null && <span className="ml-[0.08em] text-[0.5em] font-semibold text-secondary">{unit}</span>}
    </span>
  );
}

// ------------------------------------------------------------------ flattening plan

/** 24 h of the plan: grey dashed "every car charges at once" against the flat green planned line, limit in red. */
function PlanChart({ f }: { f: NonNullable<Flatten["plan"]> }) {
  const [ref, { w, h }] = useBox<HTMLDivElement>();
  const n = Math.min(f.naive_kw.length, f.planned_kw.length);
  if (n < 2) return <div ref={ref} className="h-full" />;
  const hi = Math.max(f.rating_kw * 1.1, ...f.naive_kw.slice(0, n), ...f.planned_kw.slice(0, n));
  const lo = Math.min(0, ...f.naive_kw.slice(0, n), ...f.planned_kw.slice(0, n));
  const x = (i: number) => (i / (n - 1)) * w;
  const y = (v: number) => 4 + (1 - (v - lo) / (hi - lo || 1)) * (h - 8);
  const path = (a: number[]) => a.slice(0, n).map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  return (
    <div ref={ref} className="h-full w-full">
      {w > 0 && h > 0 && (
        <svg width={w} height={h} className="block" aria-hidden>
          <line x1={0} x2={w} y1={y(f.rating_kw)} y2={y(f.rating_kw)} stroke={P.red} strokeWidth={1} />
          <path d={path(f.naive_kw)} fill="none" stroke={P.tertiary} strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" />
          <path d={path(f.planned_kw)} fill="none" stroke={P.green} strokeWidth={3} strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

const MW = (kw: number) => (Math.abs(kw) >= 1000 ? `${(kw / 1000).toFixed(1)} MW` : `${Math.round(kw)} kW`);

export function PlanCard({ street, city, compact }: { street: Flatten | null; city: Flatten | null; compact?: boolean }) {
  const p = street?.plan ?? null;
  const c = city?.plan ?? null;
  return (
    <Tile className="flex h-full flex-col px-6 py-5 lg:py-4">
      <h2 className="t-title">The plan for tonight</h2>
      {p ? (
        <>
          <div className="mt-2 flex items-baseline gap-3 text-[2.5rem] leading-none tracking-[-0.015em]">
            <Num value={p.peak_naive_pct} unit="%" color={loadTone(p.peak_naive_pct)} />
            <span className="text-[1.75rem] font-semibold text-tertiary">to</span>
            <Num value={p.peak_plan_pct} unit="%" color={loadTone(p.peak_plan_pct)} />
          </div>
          <div className="t-body mt-1.5 text-secondary">
            Peak of its limit. <span className="font-semibold text-ink"><Counter value={p.shifted_kwh} /> kWh</span> of car charging moved to the night
            {p.cars_full ? ", every car full by morning." : "."}
          </div>
          {!compact && (
            <div className="mt-2 h-16 lg:h-auto lg:min-h-0 lg:flex-1">
              <PlanChart f={p} />
            </div>
          )}
          {c && (
            <div className="t-body mt-2 text-secondary">
              Whole city: <span className="font-semibold text-ink tabular-nums">{MW(c.peak_naive_kw)}</span> to{" "}
              <span className="font-semibold tabular-nums" style={{ color: P.green }}>{MW(c.peak_plan_kw)}</span> at the peak
            </div>
          )}
        </>
      ) : (
        <div className="t-title mt-3 font-normal text-tertiary">Waiting for the plan</div>
      )}
    </Tile>
  );
}

// ------------------------------------------------------------------ Blatnica

/** Green ring for a stored amount (battery %): Watch style, same proportions as the load ring. */
function FillRing({ pct, size }: { pct: number; size: number }) {
  const p = useTween(Math.max(0, Math.min(100, pct)), 900);
  const sw = Math.max(6, Math.round(size * 0.12));
  const r = (size - sw) / 2;
  const C = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="block shrink-0" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={P.green} strokeOpacity={0.18} strokeWidth={sw} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={P.green} strokeWidth={sw} strokeLinecap="round"
        strokeDasharray={`${(C * p) / 100} ${C}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

export function BlatnicaCard({ s }: { s: State }) {
  const h = s.households?.blatnica;
  const t = h?.telemetry ?? null;
  const following = !!(h && Object.keys(s.active).some((n) => (h.path ?? []).includes(n)));
  return (
    <Tile className="flex items-center gap-4 px-6 py-4">
      {t?.soc != null && <FillRing pct={t.soc} size={56} />}
      <div className="min-w-0 flex-1">
        <h2 className="t-title">
          Blatnica <span className="font-normal text-secondary">real home, live</span>
        </h2>
        {t ? (
          <div className="t-body text-secondary">
            {t.soc != null && (
              <>
                Battery <span className="font-semibold text-ink tabular-nums">{Math.round(t.soc)}%</span>,{" "}
              </>
            )}
            car <span className="font-semibold text-ink tabular-nums">{t.ev_kw.toFixed(1)} kW</span>, heat pump{" "}
            <span className="font-semibold text-ink tabular-nums">{t.hp_kw.toFixed(1)} kW</span>
            {following ? ". Following Gridzilla." : ". Owner in charge."}
          </div>
        ) : (
          <div className="t-body text-tertiary">Waiting for the plant</div>
        )}
      </div>
    </Tile>
  );
}

// ------------------------------------------------------------------ weather

const sky = (cloud: number, sun: number) =>
  cloud >= 85 ? "Cloudy" : cloud >= 55 ? "Mostly cloudy" : cloud >= 20 ? (sun > 20 ? "Partly sunny" : "Partly cloudy") : sun > 20 ? "Sunny" : "Clear";

/** Weather at grid time (the real forecast laid onto the grid clock), then the next hours, Weather-app style. */
export function WeatherGlance({ feed, simHour, hours = 4 }: { feed: WeatherFeed; simHour: number; hours?: number }) {
  const w: Weather | null = feed.data;
  const gv = (w?.grid_view ?? []).slice().sort((a, b) => a.h - b.h);
  const rel = (h: number) => (((h - simHour) % 24) + 24) % 24;
  const dist = (h: number) => Math.min(rel(h), 24 - rel(h));
  const nowRow = gv.length ? gv.reduce((a, b) => (dist(a.h) <= dist(b.h) ? a : b)) : null;
  const now = nowRow ?? (w?.now ? { h: simHour, temp_c: w.now.temp_c, cloud_pct: w.now.cloud_pct ?? 0, sun_wm2: w.now.sun_wm2 ?? 0 } : null);
  const next = gv.filter((r) => rel(r.h) > 0.5).sort((a, b) => rel(a.h) - rel(b.h)).slice(0, hours);
  if (!now)
    return (
      <div>
        <div className="t-title">Weather</div>
        <div className="t-body text-tertiary">{feed.checking ? "Waiting for weather" : "Weather offline"}</div>
      </div>
    );
  return (
    <div className="flex h-full flex-col">
      <div className="t-title">{w?.location?.name ?? "Weather"}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <Num value={now.temp_c} unit="°" className="text-[2.5rem] leading-none tracking-[-0.015em]" />
        <span className="t-body text-secondary">{sky(now.cloud_pct, now.sun_wm2)}</span>
      </div>
      {next.length > 0 && (
        <div className="mt-auto grid gap-1 pt-3" style={{ gridTemplateColumns: `repeat(${next.length}, minmax(0,1fr))` }}>
          {next.map((r) => (
            <div key={r.h} className="text-center">
              <div className="t-small tabular-nums">{hhmm(r.h).slice(0, 2)}</div>
              <div className="t-body font-semibold tabular-nums">{Math.round(r.temp_c)}°</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function WeatherCard(props: { feed: WeatherFeed; simHour: number; hours?: number }) {
  return (
    <Tile className="h-full px-6 py-5">
      <WeatherGlance {...props} />
    </Tile>
  );
}

export { fmtNum };

/** One line for the top bar: place, temperature and sky at grid time. */
export function WeatherLine({ feed, simHour }: { feed: WeatherFeed; simHour: number }) {
  const w: Weather | null = feed.data;
  const gv = w?.grid_view ?? [];
  const rel = (h: number) => Math.min((((h - simHour) % 24) + 24) % 24, 24 - ((((h - simHour) % 24) + 24) % 24));
  const now = gv.length ? gv.reduce((a, b) => (rel(a.h) <= rel(b.h) ? a : b)) : null;
  if (!now) return null;
  return (
    <span className="tabular-nums">
      {w?.location?.name ?? "Weather"} <span className="font-semibold text-ink">{Math.round(now.temp_c)}°</span> {sky(now.cloud_pct, now.sun_wm2)}
    </span>
  );
}
