// Slide 7, the close (3:55, 25 s, Matthew). Two steps.
// Step 0, on the cut: the ask as the hero, three quiet facts that arrive 0.5 s apart, the vision line. Nothing else moves.
// Step 1 (Right): everything leaves in 0.4 s and one line stands alone on white: "It eats peaks for breakfast."
// No 21st.dev component: the slide is pure type on the pitch tokens.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ASK } from "../facts";
import type { SlideProps } from "../types";
import "./slide7.css";

const EASE = [0.25, 0.1, 0.3, 1] as const;

/** The ask, split for the hero: the thing, then when. */
const HERO = { what: "One street transformer.", when: "This winter." };

/** The three facts from facts.ts ASK, with the short word that leads each one. */
const FACTS = ASK.steps.map((s, i) => ({
  big: i === 2 ? "Ours" : s.time.charAt(0).toUpperCase() + s.time.slice(1),
  label: i === 2 ? "The plant" : s.what,
  src: `${s.what}: ${s.time}`,
}));

/** The vision line, broken where it reads best: after "lights on". Falls back to one block if the wording changes. */
const VISION = (() => {
  const at = ASK.vision.indexOf(" from ");
  return at > 0 ? [ASK.vision.slice(0, at), ASK.vision.slice(at + 1)] : [ASK.vision];
})();

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
      {/* Second line nested in the first's element: one heading, two lines, no stacked text boxes. */}
      <h1 className="s7-hero p-display" data-src="deck" data-label={ASK.ask}>
        {HERO.what}
        <span className="s7-when">{HERO.when}</span>
      </h1>
      <ol className="s7-facts">
        {FACTS.map((f, i) => (
          <motion.li
            key={f.big}
            className="s7-fact"
            data-src="deck"
            data-label={f.src}
            initial={still ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.5 + i * 0.5 }}
          >
            <p className="s7-fact-big p-head">{f.big}</p>
            <p className="s7-fact-label p-body">{f.label}</p>
          </motion.li>
        ))}
      </ol>
      <p className="s7-vision p-sub" data-src="deck" data-label="vision">
        {VISION.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </p>
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
