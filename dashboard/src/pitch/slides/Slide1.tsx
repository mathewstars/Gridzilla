// Slide 1, the title (0:30, right after the trailer's hard cut). One centred column on the moving hero background:
// GRIDZILLA, the one-line tagline, then team and track, small. Reveal in under 0.7 s: the wordmark snaps in (scale
// 1.04 to 1 with opacity, 350 ms), the tagline 120 ms later, the two small lines 120 ms after that. Nothing in corners.
import { motion, useReducedMotion } from "motion/react";
import type { SlideProps } from "../types";
import "./slide1.css";

const EASE = [0.25, 0.1, 0.3, 1] as const;

export default function Slide1({ freeze }: SlideProps) {
  const reduce = useReducedMotion();
  const still = freeze === "end" || !!reduce;
  const show = (delay: number, from: Record<string, number>) => ({
    initial: still ? false : { opacity: 0, ...from },
    animate: { opacity: 1, scale: 1, y: 0 },
    transition: still ? { duration: 0 } : { duration: 0.35, delay, ease: EASE },
  });
  return (
    <div className="p-slide s1" data-slide="1">
      <div className="s1-col">
        <motion.h1 className="s1-word" {...show(0, { scale: 1.04 })}>
          GRIDZILLA
        </motion.h1>
        <motion.p className="s1-tag p-sub" {...show(0.12, { y: 10 })}>
          A grid signal for home batteries, cars and heat pumps.
        </motion.p>
        <motion.div className="s1-credits p-small" data-src="deck" data-label="team and event" {...show(0.24, { y: 8 })}>
          <span>Mathew Stafurik · Peter Mikeška · Matthew</span>
          <span>Grid-Serving Storage · Energy Bridge Vienna 2026</span>
        </motion.div>
      </div>
    </div>
  );
}
