// Control plane building blocks: a button with a loading state, an iOS-style segmented control (adapted from the 21st.dev
// "Segmented Control" with a sliding thumb), one action runner that turns every POST into a plain-English result line,
// and a one-second clock for countdowns. Colours come only from the theme tokens, so light and dark both work.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export type Tone = "primary" | "secondary" | "danger" | "quiet";

export function Btn({ tone = "secondary", busy, disabled, onClick, children, title, small, wide }: {
  tone?: Tone; busy?: boolean; disabled?: boolean; onClick?: () => void; children: ReactNode; title?: string; small?: boolean; wide?: boolean;
}) {
  const cls = ["btn", "cp-btn", tone === "primary" ? "btn-primary" : tone === "danger" ? "btn-danger" : tone === "quiet" ? "cp-btn-quiet" : "", small ? "cp-btn-sm" : "", wide ? "cp-btn-wide" : ""].join(" ");
  return (
    <button type="button" className={cls} disabled={disabled || busy} aria-busy={busy || undefined} onClick={onClick} title={title}>
      {busy && <span className="cp-spin" aria-hidden />}
      <span>{children}</span>
    </button>
  );
}

/** A small segmented control: the thumb slides under the chosen option. */
export function Seg<T extends string>({ value, options, onChange, label }: {
  value: T; options: { v: T; label: ReactNode; disabled?: boolean }[]; onChange: (v: T) => void; label: string;
}) {
  const i = Math.max(0, options.findIndex((o) => o.v === value));
  return (
    <div className="cp-seg" role="radiogroup" aria-label={label} style={{ ["--n" as string]: options.length, ["--i" as string]: i }}>
      <span className="cp-seg-thumb" aria-hidden />
      {options.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={o.v === value} disabled={o.disabled} className="cp-seg-opt" onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export type Outcome = { ok: boolean; text: string } | null;

/** Runs one POST at a time per control: busy while it runs, then a result line that stays until the next run. */
export function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [out, setOut] = useState<Outcome>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true; // StrictMode mounts twice: set it again after the dev-only unmount
    return () => void (alive.current = false);
  }, []);
  const run = useCallback(async (key: string, fn: () => Promise<string>, fail?: (m: string) => string) => {
    setBusy(key);
    setOut(null);
    try {
      const text = await fn();
      if (alive.current) setOut({ ok: true, text });
    } catch (e) {
      const m = (e as Error).message || "no answer";
      if (alive.current) setOut({ ok: false, text: fail ? fail(m) : m });
    } finally {
      if (alive.current) setBusy(null);
    }
  }, []);
  return { busy, out, run, clear: () => setOut(null) };
}

export function Result({ out }: { out: Outcome }) {
  if (!out) return null;
  return (
    <div className={`cp-result ${out.ok ? "is-ok" : "is-err"}`} role="status">
      <span className="cp-dot" aria-hidden />
      <span>{out.text}</span>
    </div>
  );
}

/** Wall clock that ticks once a second (countdowns). */
export function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/** 0:42, 12:05, 1:02:09 */
export function clock(ms: number) {
  const t = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}

export function Card({ title, aside, children, className = "" }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel cp-card ${className}`}>
      <header className="cp-head">
        <h3 className="cp-title">{title}</h3>
        {aside && <div className="cp-aside">{aside}</div>}
      </header>
      {children}
    </section>
  );
}

/** A tiny step-line of an envelope (kW per slot). */
export function Spark({ curve, w = 120, h = 28 }: { curve: number[] | null | undefined; w?: number; h?: number }) {
  if (!curve || !curve.length) return null;
  const mx = Math.max(...curve, 1), mn = Math.min(...curve), step = w / curve.length;
  let d = "";
  curve.forEach((v, i) => {
    const y = h - 2 - (v / mx) * (h - 6);
    d += `${i ? "L" : "M"}${(i * step).toFixed(1)},${y.toFixed(1)} L${((i + 1) * step).toFixed(1)},${y.toFixed(1)} `;
  });
  return (
    <span className="cp-spark">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
        <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <span className="cp-mono">{mn}–{mx} kW</span>
    </span>
  );
}
