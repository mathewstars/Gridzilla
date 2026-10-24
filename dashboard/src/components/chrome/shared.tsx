// Small helpers shared by the board chrome (header, headline numbers, drawer).
import { useEffect, useRef, useState } from "react";
import type { State } from "../../api";
import { loadPct, tfsOf } from "../../model";

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

export const isOver = (pct: number | null | undefined) => pct != null && Math.abs(pct) >= 100;

/** Load in % as plain text: ink, Apple red at or above the limit (either direction). Not a chip. */
export function LoadPill({ pct, size = "md" }: { pct: number | null; size?: "sm" | "md" }) {
  return (
    <span
      className={`num shrink-0 whitespace-nowrap font-semibold ${size === "sm" ? "text-[0.875rem]" : "text-[1.0625rem]"} ${isOver(pct) ? "text-red" : "text-ink"}`}
      title={pct == null ? "no reading yet" : pct < 0 ? "power flowing back up from the houses" : "power flowing down to the houses"}
    >
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
