// Slide 8, the end: GRIDZILLA alone on the moving hero background, at slide 1's size, with one small line of names
// under it. Nothing else. Reveal like slide 1: the wordmark snaps in (scale 1.04 to 1 with opacity, 350 ms), the
// names 120 ms later.
import { motion, useReducedMotion } from "motion/react";
import type { SlideProps } from "../types";
import "./slide1.css";

const EASE = [0.25, 0.1, 0.3, 1] as const;

export default function Slide8({ freeze }: SlideProps) {
  const reduce = useReducedMotion();
  const still = freeze === "end" || !!reduce;
  const show = (delay: number, from: Record<string, number>) => ({
    initial: still ? false : { opacity: 0, ...from },
    animate: { opacity: 1, scale: 1, y: 0 },
    transition: still ? { duration: 0 } : { duration: 0.35, delay, ease: EASE },
  });
  return (
    <div className="p-slide s1" data-slide="8">
      <div className="s1-col">
        <motion.h1 className="s1-word" {...show(0, { scale: 1.04 })}>
          GRIDZILLA
        </motion.h1>
        <motion.p className="s1-credits p-small" {...show(0.12, { y: 8 })}>
          Mathew Stafurik · Peter Mikeška · Matthew · Tedi
        </motion.p>
      </div>
    </div>
  );
}
