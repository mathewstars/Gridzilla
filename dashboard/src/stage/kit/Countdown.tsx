// Countdown of a signal's time window (design/STAGE.md 7.3): a ring that drains as the window runs out, with the time
// left beside it in rolling digits. Idea from 21st.dev "Circle Progress", countdown demo, by @hihahihahoho (id 1737),
// re-implemented here (no licence on the source): no local timer that drifts, the time comes from the platform's clock
// (useServerNow, re-anchored on every poll) and the window from the signal itself, in GRID minutes.
// One meaning, one colour: the remaining part is ink on a light track. Time is not load, so no green/orange/red.
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { P } from "../palette";
import "./countdown.css";

/** The platform clock in ms, ticking between polls. Anchored on each new `nowIso` (S.now); never steps back by a
 *  few seconds when a poll lands slightly behind, stops 10 s after the last poll so a dead link freezes it. */
export function useServerNow(nowIso: string | null | undefined, stepMs = 1000) {
  const anchor = useRef<{ server: number; perf: number } | null>(null);
  const shown = useRef<number | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const t = nowIso ? Date.parse(nowIso) : NaN;
    if (!Number.isFinite(t)) return;
    anchor.current = { server: t, perf: performance.now() };
    const cur = shown.current;
    // A poll a little behind the ticking clock: hold. A big jump (new day, restarted platform): follow at once.
    if (cur == null || t > cur || cur - t > 5000) {
      shown.current = t;
      setNow(t);
    }
  }, [nowIso]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const a = anchor.current;
      if (!a) return;
      const t = a.server + Math.min(performance.now() - a.perf, 10_000);
      if (shown.current == null || t > shown.current) {
        shown.current = t;
        setNow(t);
      }
    }, stepMs);
    return () => window.clearInterval(id);
  }, [stepMs]);

  return now;
}

/** Grid minutes left in a window and its length. `simX` grid seconds pass per real second (S.autopilot.sim_x). */
export function gridWindow(fromIso: string, toIso: string, nowMs: number, simX: number) {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return null;
  const x = simX > 0 ? simX : 1;
  const totalMin = ((to - from) / 60_000) * x;
  const leftMin = Math.max(0, ((to - nowMs) / 60_000) * x);
  return { leftMin, totalMin, frac: Math.min(1, leftMin / totalMin) };
}

/** "1:12" + "h left", or "48" + "min left" under an hour. Whole minutes rounded up, so it never reads 0 while running. */
export function leftText(leftMin: number) {
  const m = Math.max(0, Math.ceil(leftMin - 1e-6));
  if (m >= 60) return { digits: `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`, unit: "h left" };
  return { digits: String(m), unit: "min left" };
}

/** Text whose changed characters roll in (Animate Digits idea, 21st.dev id 20071). One span per character keyed by
 *  position and value: only a changed digit re-mounts. No exit copy, so two digits never overlap. The new digit is
 *  wiped in from its baseline up inside its own box (clip-path, no move): a slide drew it 0.3em below its line, over the
 *  label under the countdown ("5" over ", then owner mode" at 1024x600). */
export function RollDigits({ text }: { text: string }) {
  const still = useReducedMotion();
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);
  return (
    <>
      {[...text].map((ch, i) => (
        <motion.span
          key={`${i}:${ch}`}
          aria-hidden
          style={{ display: "inline-block" }}
          initial={mounted.current && !still ? { opacity: 0, clipPath: "inset(100% 0% 0% 0%)" } : false}
          animate={{ opacity: 1, clipPath: "inset(0% 0% 0% 0%)" }}
          transition={{ duration: 0.35, ease: [0.25, 0.1, 0.3, 1] }}
        >
          {ch}
        </motion.span>
      ))}
    </>
  );
}

/** The ring: track in fill, the part of the window still left in ink, starting at 12 o'clock. `frac` null = no window
 *  (an empty track). Scales with its box (CSS sets the size). */
export function CountdownRing({ frac, className }: { frac: number | null; className?: string }) {
  const still = useReducedMotion();
  const r = 42;
  const sw = 10;
  const C = 2 * Math.PI * r;
  const f = frac == null ? 0 : Math.max(0, Math.min(1, frac));
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden focusable="false">
      <circle cx="50" cy="50" r={r} fill="none" stroke={P.fill} strokeWidth={sw} />
      {f > 0.002 && (
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={P.ink}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={C}
          // Negative offset: the arc ends at 12 o'clock and its tail runs out clockwise, like the Clock app timer.
          strokeDashoffset={-C * (1 - f)}
          transform="rotate(-90 50 50)"
          style={{ transition: still ? "none" : "stroke-dashoffset 1s linear" }}
        />
      )}
    </svg>
  );
}

/** Ring + time left, in one row. `src` is the payload path of the window end (G2: time, so no data-val). With no
 *  window, `idle` stands where the digits would be, beside an empty track. */
export default function Countdown({
  leftMin,
  totalMin,
  src,
  idle,
  className,
}: {
  leftMin: number | null;
  totalMin: number | null;
  src?: string;
  idle?: ReactNode;
  className?: string;
}) {
  const running = leftMin != null && totalMin != null && totalMin > 0 && leftMin > 0;
  const t = running ? leftText(leftMin) : null;
  return (
    <span className={`gzC ${className ?? ""}`}>
      <CountdownRing className="gzC-ring" frac={running ? leftMin / totalMin : null} />
      {t ? (
        <span
          className="gzC-time"
          role="timer"
          aria-label={`${t.digits} ${t.unit}`}
          data-src={src}
        >
          <span className="gzC-digits">
            <RollDigits text={t.digits} />
          </span>
          <span className="gzC-unit">{t.unit}</span>
        </span>
      ) : (
        idle
      )}
    </span>
  );
}
