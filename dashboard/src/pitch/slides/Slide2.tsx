// Slide 2, the problem (0:30, 25 s, Matthew). The headline is there on the cut. Three stat moments arrive one second
// apart, each a number that counts up fast beside a small drawing that acts the fact out: Slovakia's basement battery
// fills but stays cut off from the grid, Germany's dimmer slides down and sticks at 4.2 kW on one device, Ukraine's
// cells light up and then sit idle. Then the three step back and the punchline lands alone.
// The counter is the odometer "slide" digit effect from 21st.dev "Count Up" by @unlumen (id 20068), adapted: no
// react-use-measure (the digit height is measured with a ref), an eased tween instead of a spring (no overshoot), digits
// that carry correctly on decimals, and plain text at rest so print and QA see "4.2", not a wheel of ten digits.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from "motion/react";
import { BatteryVerticalHigh, ChargingStation, Fan, SolarPanel } from "@phosphor-icons/react";
import type { SlideProps } from "../types";
import { PROBLEM } from "../facts";
import "./slide2.css";

const EASE = [0.25, 0.1, 0.3, 1] as const;
/** Seconds after the slide comes on: first moment, gap between moments, length of a count, the punchline. */
const START = 0.8;
const GAP = 1.0;
const COUNT = 0.8;
const PUNCH = 5.0;

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

// ------------------------------------------------------------------ the three drawings (461 x 120 design px each)

interface ArtProps {
  /** The moment has arrived: play the drawing. */
  on: boolean;
  /** Final state at once, no motion. */
  still: boolean;
}
const VB = "0 0 461 120";
const tw = (still: boolean, t: object) => (still ? { duration: 0 } : { ease: EASE, ...t });

/** Slovakia: a basement battery fills with sun, but its line to the grid is broken. Nothing reaches it. */
function ArtBasement({ on, still }: ArtProps) {
  const go = on || still;
  return (
    <svg className="s2-art" viewBox={VB} aria-hidden>
      {/* battery */}
      <rect x="6" y="14" width="76" height="102" rx="16" className="s2-stroke" />
      <rect x="30" y="4" width="28" height="7" rx="3" className="s2-solid-dim" />
      <rect x="15" y="23" width="58" height="84" rx="9" className="s2-well" />
      <motion.rect
        x="15"
        y="23"
        width="58"
        height="84"
        rx="9"
        className="s2-green"
        style={{ originY: 1 }}
        initial={{ scaleY: still ? 0.86 : 0 }}
        animate={{ scaleY: go ? 0.86 : 0 }}
        transition={tw(still, { duration: 1.4, delay: 0.1 })}
      />
      {/* its line toward the grid, drawn out from the battery, ending in an open contact */}
      <motion.path
        d="M 96 65 H 214"
        className="s2-wire"
        initial={{ pathLength: still ? 1 : 0, opacity: still ? 1 : 0 }}
        animate={{ pathLength: go ? 1 : 0, opacity: go ? 1 : 0 }}
        transition={tw(still, { duration: 0.7, delay: 0.3 })}
      />
      <motion.g
        initial={{ opacity: still ? 1 : 0 }}
        animate={{ opacity: go ? 1 : 0 }}
        transition={tw(still, { duration: 0.4, delay: 0.9 })}
      >
        <circle cx="222" cy="65" r="7" className="s2-contact" />
        <circle cx="266" cy="65" r="7" className="s2-contact s2-off" />
      </motion.g>
      {/* the grid's side: dashed and dark, nothing ever comes down it */}
      <path d="M 276 65 H 384" className="s2-wire s2-dash s2-off" />
      <path
        d="M 414 8 L 392 116 M 414 8 L 436 116 M 384 30 H 444 M 397 65 H 431 M 399 65 L 429 100 M 429 65 L 399 100 M 386 116 H 442"
        className="s2-pylon s2-off"
      />
    </svg>
  );
}

/** Germany: the operator's dimmer slides down from the charger's full 11 kW and sticks at 4.2 kW. One device only. */
const X0 = 8;
const XW = 445;
const kwX = (kw: number) => X0 + (kw / 11) * XW;
const DIM = kwX(4.2);
function ArtDimmer({ on, still }: ArtProps) {
  const go = on || still;
  const k = (DIM - X0) / XW;
  const devices = [
    { x: kwX(4.2) - 120, Icon: Fan },
    { x: kwX(4.2), Icon: ChargingStation, lit: true },
    { x: kwX(4.2) + 120, Icon: BatteryVerticalHigh },
    { x: kwX(4.2) + 240, Icon: SolarPanel },
  ];
  return (
    <svg className="s2-art" viewBox={VB} aria-hidden>
      <rect x={X0} y="16" width={XW} height="12" rx="6" className="s2-well" />
      <motion.rect
        x={X0}
        y="16"
        width={XW}
        height="12"
        rx="6"
        className="s2-green"
        style={{ originX: 0 }}
        initial={{ scaleX: still ? k : 1 }}
        animate={go && !still ? { scaleX: [1, k, k - 5 / XW, k] } : { scaleX: go ? k : 1 }}
        transition={still ? { duration: 0 } : { duration: 1.5, times: [0, 0.55, 0.75, 1], ease: EASE, delay: 0.1 }}
      />
      {/* the stop: the dimmer cannot go any lower */}
      <rect x={DIM - 22} y="6" width="4" height="32" rx="2" className="s2-solid-dim" />
      <motion.circle
        cx="0"
        cy="22"
        r="16"
        className="s2-knob"
        initial={{ x: still ? DIM : X0 + XW }}
        animate={go && !still ? { x: [X0 + XW, DIM, DIM - 5, DIM] } : { x: go ? DIM : X0 + XW }}
        transition={still ? { duration: 0 } : { duration: 1.5, times: [0, 0.55, 0.75, 1], ease: EASE, delay: 0.1 }}
      />
      {/* the one device it reaches */}
      <motion.path
        d={`M ${DIM} 44 V 66`}
        className="s2-wire s2-lit"
        initial={{ pathLength: still ? 1 : 0, opacity: still ? 1 : 0 }}
        animate={{ pathLength: go ? 1 : 0, opacity: go ? 1 : 0 }}
        transition={tw(still, { duration: 0.4, delay: 1.2 })}
      />
      {devices.map(({ x, Icon, lit }) => (
        <g key={x} className={lit ? "s2-dev s2-dev-lit" : "s2-dev"}>
          <Icon x={x - 24} y={70} width={48} height={48} weight="regular" />
        </g>
      ))}
    </svg>
  );
}

/** Ukraine: rows of home battery cells light up full, then sit idle through the blackouts. */
const COLS = 12;
const ROWS = 3;
const CW = (461 - (COLS - 1) * 8) / COLS;
const CH = (120 - 4 - (ROWS - 1) * 10) / ROWS;
function ArtCells({ on, still }: ArtProps) {
  const go = on || still;
  const IDLE = 0.2;
  return (
    <svg className="s2-art" viewBox={VB} aria-hidden>
      {Array.from({ length: ROWS * COLS }, (_, i) => {
        const c = i % COLS;
        const r = Math.floor(i / COLS);
        const x = c * (CW + 8);
        const y = 2 + r * (CH + 10);
        return (
          <g key={i}>
            <rect x={x} y={y} width={CW} height={CH} rx="7" className="s2-well" />
            <motion.rect
              x={x}
              y={y}
              width={CW}
              height={CH}
              rx="7"
              className="s2-green"
              initial={{ opacity: still ? IDLE : 0 }}
              animate={go && !still ? { opacity: [0, 1, 1, IDLE] } : { opacity: go ? IDLE : 0 }}
              transition={
                still
                  ? { duration: 0 }
                  : { duration: 2.0, times: [0, 0.2, 0.55, 1], ease: "easeInOut", delay: 0.05 + c * 0.035 + r * 0.05 }
              }
            />
          </g>
        );
      })}
    </svg>
  );
}

// ------------------------------------------------------------------ the slide

/** The deck figures (facts.ts), with the words and drawing each one gets on this slide. */
const MOMENTS = [
  { unit: "signals", caption: "from the grid operator to home batteries", Art: ArtBasement },
  { unit: "kW", caption: "the operator may dim one new charger to this", Art: ArtDimmer },
  { unit: "GWh", caption: "of home batteries, idle through the blackouts", Art: ArtCells },
] as const;

const FACTS = PROBLEM.map((f, i) => {
  const k = 10 ** f.decimals;
  const to = Math.round(f.value * k);
  // Nothing to count: the wheel rolls one full turn and lands back on 0.
  const from = to === 0 ? -10 : 0;
  return { ...f, ...MOMENTS[i], unit: f.unit || MOMENTS[i].unit, text: f.value.toFixed(f.decimals), from, to };
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
    <div className={`p-slide s2${still ? " s2-still" : ""}${punch ? " is-punch" : ""}`} data-slide="2">
      <h1 className="s2-head p-head">
        <span className="s2-line">Europe's largest battery is in people's basements.</span>
        <span className="s2-line s2-line-2 p-secondary">The grid can use none of it.</span>
      </h1>

      <div className="s2-facts">
        {FACTS.map((f, i) => (
          <div key={f.place} className={`s2-fact${i < shown ? " is-on" : ""}`}>
            <div className="s2-place p-sub">{f.place}</div>
            <f.Art on={i < shown} still={still} />
            <div
              className="s2-num p-display"
              aria-label={`${f.text} ${f.unit}`}
              data-src="deck"
              data-label="dad's deck"
              data-val={f.value}
            >
              <Odometer n={mvs[i]} text={f.text} rolling={rolling[i]} />
              <span className="p-unit">{f.unit}</span>
            </div>
            <p className="s2-caption p-small p-secondary">{f.caption}</p>
          </div>
        ))}
      </div>

      <p className="s2-punch p-head-xl">
        <span className="p-secondary">The storage exists. </span>
        <span className="p-ink">The signal does not.</span>
      </p>
    </div>
  );
}
