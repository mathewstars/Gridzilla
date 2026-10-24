// Slide 7, the close (Matthew). Two steps, no ask on screen (the captain says it when he wants to).
// Step 0: "So at six tomorrow, when the cars come home, the batteries answer before anyone notices.", alone and centred
// on the hero background. Step 1 (Right): it leaves in 0.4 s and "It eats peaks for breakfast." stands alone.
// No 21st.dev component: the slide is pure type on the pitch tokens.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { SlideProps } from "../types";
import "./slide7.css";

const EASE = [0.25, 0.1, 0.3, 1] as const;

const CLOSER = ["It eats peaks", "for breakfast."];
/** Step 1: the line before the punchline (script). */
const BEFORE = "So at six tomorrow, when the cars come home, the batteries answer before anyone notices.";

export default function Slide7({ step, freeze }: SlideProps) {
  const reduce = useReducedMotion();
  const still = freeze === "end" || !!reduce;
  const closing = step >= 1;

  const answer = (
    <motion.div
      key="before"
      className="s7-layer s7-ask"
      exit={still ? undefined : { opacity: 0, transition: { duration: 0.4, ease: EASE } }}
    >
      <motion.p
        className="s7-ask-line p-head"
        initial={still ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: EASE, delay: 0.1 }}
      >
        {BEFORE}
      </motion.p>
    </motion.div>
  );

  const close = (
    <motion.div
      key="close"
      className="s7-layer s7-close"
      exit={still ? undefined : { opacity: 0, transition: { duration: 0.3, ease: EASE } }}
    >
      {/* The whole line rises into place; "for breakfast." follows a beat behind, the punchline landing last. */}
      <motion.h1
        className="s7-closer p-mega"
        initial={still ? false : { opacity: 0, y: 48 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.0, ease: EASE, delay: 0.1 }}
      >
        {CLOSER[0]}
        <motion.span
          className="s7-closer-line"
          initial={still ? false : { opacity: 0, y: 36 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.0, ease: EASE, delay: 0.32 }}
        >
          {CLOSER[1]}
        </motion.span>
      </motion.h1>
    </motion.div>
  );

  return (
    <div className="p-slide" data-slide="7" data-step={step}>
      {still ? (closing ? close : answer) : <AnimatePresence mode="wait">{closing ? close : answer}</AnimatePresence>}
    </div>
  );
}
