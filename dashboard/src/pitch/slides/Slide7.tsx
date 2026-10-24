// Slide 7, the close (3:55, 25 s, Matthew). Two steps.
// Step 0: the ask in one sentence, alone and centred on the hero background (sign-up, second maker and the vision are
// spoken, PITCH.md notes). Step 1 (Right): it leaves in 0.4 s and "It eats peaks for breakfast." stands alone.
// No 21st.dev component: the slide is pure type on the pitch tokens.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ASK } from "../facts";
import type { SlideProps } from "../types";
import "./slide7.css";

const EASE = [0.25, 0.1, 0.3, 1] as const;

/** The ask, one sentence (facts.ts ASK.ask is the short form). */
const ASK_LINE = { what: "One street transformer to pilot on.", when: "This winter." };

const CLOSER = ["It eats peaks", "for breakfast."];

export default function Slide7({ step, freeze }: SlideProps) {
  const reduce = useReducedMotion();
  const still = freeze === "end" || !!reduce;
  const closing = step >= 1;

  const ask = (
    <motion.div
      key="ask"
      className="s7-layer s7-ask"
      exit={still ? undefined : { opacity: 0, transition: { duration: 0.4, ease: EASE } }}
    >
      {/* The ask in one sentence, alone and centred on the hero background. The rest is spoken. */}
      <motion.h1
        className="s7-ask-line p-head-xl"
        data-src="deck"
        data-label={ASK.ask}
        initial={still ? false : { opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: EASE, delay: 0.1 }}
      >
        {ASK_LINE.what} <span className="p-secondary">{ASK_LINE.when}</span>
      </motion.h1>
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
    <div className="p-slide" data-slide="7" data-step={closing ? 1 : 0}>
      {still ? (closing ? close : ask) : <AnimatePresence mode="wait">{closing ? close : ask}</AnimatePresence>}
    </div>
  );
}
