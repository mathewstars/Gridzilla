// Slide 2, the problem (0:30, 25 s, Matthew). The headline is there on the cut; the three deck facts count up in turn
// while he names each country; then the punchline lands alone at the bottom.
// The counter is the odometer "slide" digit effect from 21st.dev "Count Up" by @unlumen (id 20068), adapted: no
// react-use-measure (the digit height is measured with a ref), an eased tween instead of a spring (no overshoot), digits
// that carry correctly on decimals, and plain text at rest so print and QA see "4.2", not a wheel of ten digits.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from "motion/react";
import type { SlideProps } from "../types";
import { PROBLEM } from "../facts";
import "./slide2.css";

const EASE = [0.25, 0.1, 0.3, 1] as const;
/** Seconds after the slide comes on: first count, gap between counts, length of a count, the punchline. */
const START = 1.2;
const GAP = 2.2;
const COUNT = 1.4;
const PUNCH = 8.5;

const mod = (x: number, m: number) => ((x % m) + m) % m;

/** Where one digit wheel stands (0..10, 10 = the repeated 0) for the whole number n in its smallest unit. The ones
 *  wheel turns continuously; a higher wheel only moves while the wheel below it rolls from 9 to 0, like an odometer. */
function wheelPos(n: number, place: number) {
  if (place === 1) return mod(n, 10);
  const carry = Math.max(0, mod(n, place) - (place - 1));
  return mod(Math.floor(n / place), 10) + carry;
}

function Wheel({ n, place }: { n: MotionValue<number>; place: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const h = useMotionValue(0);
  useLayoutEffect(() => {
    if (ref.current) h.set(ref.current.offsetHeight);
  }, [h]);
  const y = useTransform([n, h], ([v, hh]: number[]) => -wheelPos(v, place) * hh);
  return (
    <span className="s2-wheel">
      <span ref={ref} className="s2-wheel-ref">
        0
      </span>
      <span className="s2-wheel-win" aria-hidden>
        <motion.span className="s2-wheel-col" style={{ y }}>
          {Array.from({ length: 11 }, (_, i) => (
            <span key={i} className="s2-wheel-cell">
              {i % 10}
            </span>
          ))}
        </motion.span>
      </span>
    </span>
  );
}

/** The number: wheels while it counts, plain tabular text at rest (the two are the same width, so nothing moves). */
function Odometer({ n, text, rolling }: { n: MotionValue<number>; text: string; rolling: boolean }) {
  if (!rolling) return <span className="s2-digits">{text}</span>;
  const count = text.replace(/\D/g, "").length;
  let d = 0;
  return (
    <span className="s2-digits">
      {text.split("").map((ch, i) => {
        if (!/\d/.test(ch)) return <span key={i}>{ch}</span>;
        const place = 10 ** (count - 1 - d++);
        return <Wheel key={i} n={n} place={place} />;
      })}
    </span>
  );
}

const FACTS = PROBLEM.map((f) => {
  const k = 10 ** f.decimals;
  const to = Math.round(f.value * k);
  // Nothing to count: the wheel rolls one full turn and lands back on 0.
  const from = to === 0 ? -10 : 0;
  return { ...f, text: f.value.toFixed(f.decimals), from, to };
});

export default function Slide2({ freeze }: SlideProps) {
  const reduced = useReducedMotion();
  const still = freeze === "end" || !!reduced;

  const m0 = useMotionValue(still ? FACTS[0].to : FACTS[0].from);
  const m1 = useMotionValue(still ? FACTS[1].to : FACTS[1].from);
  const m2 = useMotionValue(still ? FACTS[2].to : FACTS[2].from);
  const mvs = [m0, m1, m2];

  const [shown, setShown] = useState(still ? FACTS.length : 0);
  const [rolling, setRolling] = useState<boolean[]>(() => FACTS.map(() => false));
  const [punch, setPunch] = useState(still);

  useEffect(() => {
    const mv = [m0, m1, m2];
    if (still) {
      mv.forEach((m, i) => m.set(FACTS[i].to));
      setShown(FACTS.length);
      setRolling(FACTS.map(() => false));
      setPunch(true);
      return;
    }
    mv.forEach((m, i) => m.set(FACTS[i].from));
    setShown(0);
    setRolling(FACTS.map(() => false));
    setPunch(false);
    const timers: number[] = [];
    const anims: { stop: () => void }[] = [];
    const roll = (i: number, on: boolean) => setRolling((r) => r.map((x, j) => (j === i ? on : x)));
    FACTS.forEach((f, i) => {
      timers.push(
        window.setTimeout(() => {
          setShown((s) => Math.max(s, i + 1));
          roll(i, true);
          anims.push(animate(mv[i], f.to, { duration: COUNT, ease: EASE, onComplete: () => roll(i, false) }));
        }, (START + GAP * i) * 1000),
      );
    });
    timers.push(window.setTimeout(() => setPunch(true), PUNCH * 1000));
    return () => {
      timers.forEach((t) => clearTimeout(t));
      anims.forEach((a) => a.stop());
    };
  }, [still, m0, m1, m2]);

  return (
    <div className={`p-slide s2${still ? " s2-still" : ""}`} data-slide="2">
      <h1 className="s2-head p-head-xl">
        <span className="s2-line">
          Europe's largest battery
          <br />
          is in people's basements.
        </span>
        <span className="s2-line s2-line-2 p-secondary">The grid can use none of it.</span>
      </h1>

      <div className="s2-facts">
        {FACTS.map((f, i) => (
          <div key={f.place} className={`s2-fact${i < shown ? " is-on" : ""}`}>
            <div className="s2-place p-title">{f.place}</div>
            <div
              className="s2-num p-mega"
              aria-label={`${f.text}${f.unit ? ` ${f.unit}` : ""}`}
              data-src="deck"
              data-label="dad's deck"
              data-val={f.value}
            >
              <Odometer n={mvs[i]} text={f.text} rolling={rolling[i]} />
              {f.unit && <span className="p-unit">{f.unit}</span>}
            </div>
            <p className="s2-line-body p-body p-secondary">{f.line}</p>
          </div>
        ))}
      </div>

      <p className={`s2-punch p-head${punch ? " is-on" : ""}`}>
        <span className="p-secondary">The storage exists. </span>
        <span className="p-ink">The signal does not.</span>
      </p>
    </div>
  );
}
