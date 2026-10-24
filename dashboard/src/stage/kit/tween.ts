// Motion helpers for the stage kit: every value glides to its new target on one requestAnimationFrame loop, so a 3 s poll
// never makes a number or a line jump. Honours prefers-reduced-motion (values then land at once).
import { useEffect, useRef, useState } from "react";

const mq = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

export function useReducedMotion() {
  const [reduced, setReduced] = useState(!!mq?.matches);
  useEffect(() => {
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** Apple's ease-out, cubic-bezier(0, 0, 0.5, 1), close enough for numbers. */
export const easeOut = (k: number) => 1 - (1 - k) ** 3;

/** One animated channel: where it should go, how long the glide takes, linear (for time panning) or ease-out, and
 *  `snap` to land at once (first frame, a restart, a jump of the grid clock). */
export interface Channel {
  to: number;
  ms: number;
  linear?: boolean;
  snap?: boolean;
}

/** Several channels on one frame loop; returns the current values. */
export function useTweens(channels: Channel[]): number[] {
  const reduced = useReducedMotion();
  const st = useRef<{ from: number[]; to: number[]; cur: number[]; start: number[]; ms: number[]; lin: boolean[]; raf: number } | null>(null);
  const [, setFrame] = useState(0);

  if (!st.current || st.current.cur.length !== channels.length) {
    const v = channels.map((c) => (Number.isFinite(c.to) ? c.to : 0));
    st.current = { from: [...v], to: [...v], cur: [...v], start: v.map(() => 0), ms: channels.map((c) => c.ms), lin: channels.map((c) => !!c.linear), raf: 0 };
  }
  const r = st.current;
  const key = channels.map((c) => `${c.to}|${c.snap ? 1 : 0}`).join(",");

  useEffect(() => {
    const now = performance.now();
    let moving = false;
    channels.forEach((c, i) => {
      const to = Number.isFinite(c.to) ? c.to : r.cur[i];
      if (c.snap || reduced || c.ms <= 0) {
        r.from[i] = r.to[i] = r.cur[i] = to;
        return;
      }
      if (to === r.to[i]) return;
      r.from[i] = r.cur[i];
      r.to[i] = to;
      r.start[i] = now;
      r.ms[i] = c.ms;
      r.lin[i] = !!c.linear;
      moving = true;
    });
    if (!moving) {
      setFrame((f) => f + 1);
      return;
    }
    cancelAnimationFrame(r.raf);
    const step = (t: number) => {
      let busy = false;
      for (let i = 0; i < r.cur.length; i++) {
        if (r.cur[i] === r.to[i]) continue;
        const k = Math.min(1, Math.max(0, (t - r.start[i]) / r.ms[i]));
        const e = r.lin[i] ? k : easeOut(k);
        r.cur[i] = k >= 1 ? r.to[i] : r.from[i] + (r.to[i] - r.from[i]) * e;
        if (k < 1) busy = true;
      }
      setFrame((f) => f + 1);
      if (busy) r.raf = requestAnimationFrame(step);
    };
    r.raf = requestAnimationFrame(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reduced]);

  useEffect(() => () => cancelAnimationFrame(st.current?.raf ?? 0), []);
  return r.cur;
}

/** One value gliding ease-out to `to` (0.8 s by default). */
export function useTween(to: number, ms = 800, snap = false) {
  return useTweens([{ to, ms, snap }])[0];
}
