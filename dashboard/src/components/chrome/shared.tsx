// Small helpers shared by the board chrome (header, headline numbers, drawer).
import { Sun } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { State } from "../../api";
import { loadColor, loadPct, tfsOf } from "../../model";

/** Worst transformer load on a feeder, signed (negative = power flowing back), in % of the limit in that direction. */
export function feederWorst(s: State, feeder: string) {
  let worst: number | null = null;
  tfsOf(s, feeder).forEach((tf) => {
    const p = loadPct(s, tf, s.aggregates[tf]?.total_kw);
    if (p != null && (worst == null || Math.abs(p) > Math.abs(worst))) worst = p;
  });
  return worst as number | null;
}

export const tfLoad = (s: State, tf: string) => loadPct(s, tf, s.aggregates[tf]?.total_kw);

/** Load in % as a tinted pill: green / amber / red against the limit, a sun when the power flows back. */
export function LoadPill({ pct, size = "md" }: { pct: number | null; size?: "sm" | "md" }) {
  const c = loadColor(pct);
  return (
    <span
      className={`num inline-flex shrink-0 items-center gap-1 rounded-full font-semibold ${size === "sm" ? "px-2 py-0.5 text-[0.74rem]" : "px-2.5 py-1 text-[0.82rem]"}`}
      style={{ color: c, background: `${c}1f`, boxShadow: `inset 0 0 0 1px ${c}33` }}
      title={pct == null ? "no reading yet" : pct < 0 ? "power flowing back up from the houses" : "power flowing down to the houses"}
    >
      {pct != null && pct < 0 && <Sun weight="fill" size={size === "sm" ? 10 : 12} aria-hidden />}
      {pct == null ? "-" : `${Math.abs(pct)} %`}
    </span>
  );
}

/** Live while new state keeps arriving; offline when the poll has not delivered anything for `ms`. */
export function useLive(s: State, ms = 12_000) {
  const last = useRef(Date.now());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    last.current = Date.now();
  }, [s]);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 2000);
    return () => window.clearInterval(id);
  }, []);
  return now - last.current < ms;
}

export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
