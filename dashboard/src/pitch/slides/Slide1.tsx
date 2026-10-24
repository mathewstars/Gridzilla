// Slide 1, the title (0:00, 30 s, Matthew). "GRIDZILLA" as a poster, silent and still for the whole jingle. When the
// jingle ends (or freeze === "end"), one line fades in, opacity only, 1.2 s. No 21st.dev component: a single word set
// by hand reads stronger than any kit piece here.
import { useLayoutEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { SlideProps } from "../types";
import "./slide1.css";

const WORD = "GRIDZILLA";
// The one pair the tight tracking spoils: the foot of the last L runs into the A. Open it to match the L-L gap.
const HEAD = "GRIDZILL";
const TAIL = "A";
const KERN_LA = 0.042; // em
const TRACK = -0.045; // em, same as .s1-word
const WEIGHT = 600;
const BASE = 360; // px, the CSS size the measure starts from
const INK_LEFT = 120; // the canvas side margins: the letters run exactly margin to margin
const INK_WIDTH = 1920 - 2 * 120;
const CAP_CENTRE = 496; // optical centre: a touch above the canvas middle (540)
const EASE = [0.25, 0.1, 0.3, 1] as const;

interface Fit {
  size: number;
  left: number;
  top: number;
}

/** Ink box of the word at BASE size, from the font itself (canvas metrics), so the fit is optical, not the em box. */
function inkAt(family: string) {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return null;
  ctx.font = `${WEIGHT} ${BASE}px ${family}`;
  // Browsers without canvas tracking: add it by hand (it only moves where each next letter starts).
  const manual = "letterSpacing" in ctx ? 0 : TRACK * BASE;
  if (!manual) ctx.letterSpacing = `${TRACK * BASE}px`;
  // Measured in two runs, exactly as the page sets it (the A is its own span with the extra space before it).
  const h = ctx.measureText(HEAD);
  const a = ctx.measureText(TAIL);
  const right = h.width + manual * HEAD.length + KERN_LA * BASE + a.actualBoundingBoxRight;
  const width = h.actualBoundingBoxLeft + right;
  if (!(width > 0)) return null;
  return {
    left: h.actualBoundingBoxLeft,
    width,
    ascent: Math.max(h.actualBoundingBoxAscent, a.actualBoundingBoxAscent),
    descent: Math.max(h.actualBoundingBoxDescent, a.actualBoundingBoxDescent),
  };
}

export default function Slide1({ freeze, jingle }: SlideProps) {
  const reduce = useReducedMotion();
  const word = useRef<HTMLHeadingElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState<Fit | null>(null);

  // Fit before the first paint, and again once fonts settle (a fallback font must not leave the word off-centre).
  useLayoutEffect(() => {
    let live = true;
    const measure = () => {
      const el = word.current;
      const p = probe.current;
      if (!live || !el || !p) return;
      const ink = inkAt(getComputedStyle(el).fontFamily);
      if (!ink) return;
      const k = INK_WIDTH / ink.width;
      const size = BASE * k;
      // Probe sits on the baseline. Read it at BASE size; with line-height 1 everything scales by k.
      const prev = el.style.fontSize;
      el.style.fontSize = `${BASE}px`;
      const baseAtBase = p.offsetTop;
      el.style.fontSize = prev;
      const baseline = CAP_CENTRE + ((ink.ascent - ink.descent) * k) / 2;
      const next = { size, left: INK_LEFT + ink.left * k, top: baseline - baseAtBase * k };
      setFit((f) => (f && Math.abs(f.size - next.size) < 0.01 && Math.abs(f.left - next.left) < 0.01 && Math.abs(f.top - next.top) < 0.01 ? f : next));
    };
    measure();
    document.fonts?.ready.then(measure);
    return () => {
      live = false;
    };
  }, []);

  const show = freeze === "end" || jingle === "ended";
  const instant = freeze === "end" || !!reduce;

  return (
    <div className="p-slide" data-slide="1">
      <h1
        ref={word}
        className="s1-word"
        style={fit ? { fontSize: fit.size, left: fit.left, top: fit.top } : undefined}
        aria-label={WORD}
      >
        {HEAD}
        <span style={{ marginLeft: `${KERN_LA}em` }}>{TAIL}</span>
        <span ref={probe} className="s1-probe" aria-hidden="true" />
      </h1>

      <motion.p
        className="s1-line p-title p-secondary"
        initial={instant ? false : { opacity: 0 }}
        animate={{ opacity: show ? 1 : 0 }}
        transition={instant ? { duration: 0 } : { duration: 1.2, delay: show ? 0.3 : 0, ease: EASE }}
        aria-hidden={!show}
      >
        Now you probably wonder what the monster really is.
      </motion.p>

      <p className="s1-credits p-small p-tertiary">
        <span>Mathew Stafurik, Peter Mikeška, Matthew</span>
        <span>Grid-Serving Storage track, Energy Bridge Hackathon Vienna 2026</span>
      </p>
    </div>
  );
}
