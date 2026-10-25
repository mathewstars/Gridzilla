// A number that counts up once when it comes into view (adapted from 21st.dev "Number Ticker" by @dillionverma:
// spring on a motion value, text written outside React). It renders the final value first, so it is never empty, and
// stays still under reduced motion.
import { useEffect, useRef } from "react";
import { useInView, useMotionValue, useReducedMotion, useSpring } from "motion/react";

const fmt = (v: number, d: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);

export function Ticker({ value, decimals = 0, className = "" }: { value: number; decimals?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const mv = useMotionValue(value);
  const spring = useSpring(mv, { damping: 40, stiffness: 90 });
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const armed = useRef(false);

  // before it is seen, park it at zero (only when motion is allowed and it starts off screen)
  useEffect(() => {
    if (reduce || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    if (r.top > innerHeight) {
      armed.current = true;
      mv.jump(0);
      spring.jump(0);
      ref.current.textContent = fmt(0, decimals);
    }
  }, [reduce, mv, spring, decimals]);

  useEffect(() => {
    if (inView && armed.current) mv.set(value);
  }, [inView, mv, value]);

  useEffect(() => spring.on("change", (v) => { if (ref.current) ref.current.textContent = fmt(v, decimals); }), [spring, decimals]);

  return (
    <span ref={ref} className={`t-num ${className}`}>
      {fmt(value, decimals)}
    </span>
  );
}
