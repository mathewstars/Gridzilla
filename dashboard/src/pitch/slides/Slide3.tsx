// Slide 3, the idea (0:55, 40 s, Matthew). One signed message is typed out, travels down four wires and each box
// sorts it out by itself. Step 1 (Right): the same message at noon, other direction, then the slide's last word.
// Typing engine adapted from 21st.dev "Typewriter Text" by @educalvolpz (id 18768): its recursive per-character
// timeout, plus a backspace phase for the retype, the final text laid out invisibly so nothing reflows, and freeze or
// reduced motion showing the full text at once.
import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "motion/react";
import {
  BatteryCharging,
  BatteryHigh,
  ChargingStation,
  CheckCircle,
  SealCheck,
  Sun,
  Thermometer,
  type Icon,
} from "@phosphor-icons/react";
import type { SlideProps } from "../types";
import "./slide3.css";

const EASE: [number, number, number, number] = [0.25, 0.1, 0.3, 1];

const MSG = [
  "“This street, next three hours,\ntake at most 3 kW per house.”",
  "“This street, next three hours,\ngive at most 2 kW per house.”",
];

interface Box {
  maker: string;
  device: string;
  Icon: Icon;
  acts: [string, string];
}

const BOXES: Box[] = [
  { maker: "Victron", device: "Battery", Icon: BatteryCharging, acts: ["Battery covers the house", "Battery soaks up the sun"] },
  { maker: "GoodWe", device: "Battery", Icon: BatteryHigh, acts: ["Battery covers the house", "Battery soaks up the sun"] },
  { maker: "Viessmann", device: "Heat pump", Icon: Thermometer, acts: ["Hot water waits until later", "Hot water heats from the sun"] },
  { maker: "Car charger", device: "Any brand", Icon: ChargingStation, acts: ["Car charges after dinner", "Car charges from the sun"] },
];

// Geometry in canvas px (matches slide3.css).
const BOX_W = 390;
const BOX_GAP = 40;
const boxLeft = (i: number) => 120 + i * (BOX_W + BOX_GAP);
const ORIGIN = { x: 960, y: 352 };
const WIRE_END = 472;
const wirePath = (i: number) => {
  const x = boxLeft(i) + BOX_W / 2;
  return `M${ORIGIN.x} ${ORIGIN.y} C${ORIGIN.x} 430 ${x} 410 ${x} ${WIRE_END}`;
};

// Timeline, seconds. Step 0 builds inside 8.2 s; step 1 inside 7 s (the closing line at 6 s).
const T0 = { type: 0.6, wires: 3.4, stagger: 0.75, travel: 0.9, foot: 7.3 };
const T1 = { header: 0, type: 0.35, dots: 2.7, stagger: 0.6, travel: 0.8, foot: 6.0 };
const SPEED = { type: 40, retype: 48, erase: 22 };

interface Typed {
  base: string;
  n: number;
  typing: boolean;
}

interface View {
  in: boolean;
  header: 0 | 1;
  lit: number;
  noon: number;
  foot: 0 | 1 | 2;
}

const finalView = (step: number): View =>
  step >= 1 ? { in: true, header: 1, lit: 4, noon: 4, foot: 2 } : { in: true, header: 0, lit: 4, noon: 0, foot: 1 };
const finalTyped = (step: number): Typed => ({ base: MSG[Math.min(step, 1)], n: MSG[Math.min(step, 1)].length, typing: false });

const commonPrefix = (a: string, b: string) => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
};

export default function Slide3({ step, freeze }: SlideProps) {
  const reduce = useReducedMotion();
  const still = freeze === "end" || !!reduce;
  const s = Math.min(Math.max(step, 0), 1);

  const [view, setView] = useState<View>(() => (still ? finalView(s) : s === 1 ? finalView(0) : { in: false, header: 0, lit: 0, noon: 0, foot: 0 }));
  const [typed, setTyped] = useState<Typed>(() => (still ? finalTyped(s) : s === 1 ? finalTyped(0) : { base: MSG[0], n: 0, typing: false }));
  const [wiresDrawn] = useState(() => still || s === 1);
  const wireRefs = useRef<(SVGPathElement | null)[]>([]);
  const dotRefs = useRef<(SVGCircleElement | null)[]>([]);
  const prevStep = useRef<number | null>(null);

  useEffect(() => {
    const timers: number[] = [];
    const anims: { stop: () => void }[] = [];
    const at = (sec: number, fn: () => void) => timers.push(window.setTimeout(fn, sec * 1000));
    const prev = prevStep.current;
    prevStep.current = s;

    const setWire = (i: number, v: number) => {
      const w = wireRefs.current[i];
      if (w) w.style.strokeDashoffset = String(1 - v);
    };
    const setDot = (i: number, v: number | null) => {
      const d = dotRefs.current[i];
      const w = wireRefs.current[i];
      if (!d || !w) return;
      if (v === null || v < 0.002) {
        d.style.opacity = "0";
        return;
      }
      const p = w.getPointAtLength(v * w.getTotalLength());
      d.setAttribute("transform", `translate(${p.x} ${p.y})`);
      d.style.opacity = v > 0.92 ? String(Math.max(0, (1 - v) / 0.08)) : "1";
    };
    // The message travels down wire i; the box lights when its dot arrives.
    const travel = (i: number, delay: number, dur: number, draw: boolean, arrive: () => void) => {
      const a = animate(0, 1, {
        duration: dur,
        delay,
        ease: EASE,
        onUpdate: (v) => {
          if (draw) setWire(i, v);
          setDot(i, v);
        },
        onComplete: () => {
          setDot(i, null);
          arrive();
        },
      });
      anims.push(a);
    };
    // Typing engine (after 21st.dev Typewriter Text): erase back to the shared part, then type the rest.
    const typeOut = (from: string, to: string, startSec: number, speed: number) => {
      const keep = commonPrefix(from, to);
      let n = from === to ? 0 : from.length;
      let base = from === to ? to : from;
      const tick = () => {
        if (base !== to && n > keep) {
          n--;
          setTyped({ base, n, typing: true });
          timers.push(window.setTimeout(tick, SPEED.erase));
          return;
        }
        if (base !== to) base = to;
        if (n < to.length) {
          n++;
          setTyped({ base, n, typing: n < to.length });
          timers.push(window.setTimeout(tick, to[n - 1] === "\n" ? 0 : speed));
        }
      };
      at(startSec, tick);
    };

    const instant = still || (prev !== null && s < prev);
    if (instant) {
      setView(finalView(s));
      setTyped(finalTyped(s));
      for (let i = 0; i < 4; i++) {
        setWire(i, 1);
        setDot(i, null);
      }
      return () => undefined;
    }

    if (s === 0) {
      setView({ in: false, header: 0, lit: 0, noon: 0, foot: 0 });
      setTyped({ base: MSG[0], n: 0, typing: false });
      for (let i = 0; i < 4; i++) {
        setWire(i, 0);
        setDot(i, null);
      }
      at(0.05, () => setView((v) => ({ ...v, in: true })));
      typeOut(MSG[0], MSG[0], T0.type, SPEED.type);
      BOXES.forEach((_, i) =>
        travel(i, T0.wires + i * T0.stagger, T0.travel, true, () => setView((v) => ({ ...v, lit: Math.max(v.lit, i + 1) }))),
      );
      at(T0.foot, () => setView((v) => ({ ...v, foot: 1 })));
    } else {
      // Noon: start from the finished evening state, then retype and send it again.
      setView(finalView(0));
      setTyped(finalTyped(0));
      for (let i = 0; i < 4; i++) {
        setWire(i, 1);
        setDot(i, null);
      }
      at(T1.header + 0.05, () => setView((v) => ({ ...v, header: 1 })));
      typeOut(MSG[0], MSG[1], T1.type, SPEED.retype);
      BOXES.forEach((_, i) =>
        travel(i, T1.dots + i * T1.stagger, T1.travel, false, () => setView((v) => ({ ...v, noon: Math.max(v.noon, i + 1) }))),
      );
      at(T1.foot, () => setView((v) => ({ ...v, foot: 2 })));
    }

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      anims.forEach((a) => a.stop());
    };
  }, [s, still]);

  const shown = typed.base.slice(0, typed.n);
  const ghost = typed.base.slice(typed.n);

  return (
    <div className={`p-slide s3${view.in ? " s3-in" : ""}${still ? " s3-still" : ""}`} data-slide="3">
      <svg className="s3-wires s3-enter" viewBox="0 0 1920 1080" aria-hidden="true">
        {BOXES.map((b, i) => (
          <path
            key={b.maker}
            ref={(el) => {
              wireRefs.current[i] = el;
            }}
            className="s3-wire"
            d={wirePath(i)}
            pathLength={1}
            style={{ strokeDasharray: "1 1", strokeDashoffset: wiresDrawn ? 0 : 1 }}
          />
        ))}
        {BOXES.map((b, i) => (
          <circle
            key={b.maker}
            ref={(el) => {
              dotRefs.current[i] = el;
            }}
            className="s3-dot"
            r={9}
            style={{ opacity: 0 }}
          />
        ))}
      </svg>

      <div className="s3-card p-card s3-enter">
        <div className="s3-headers p-small">
          <div className={`s3-header${view.header === 0 ? " is-on" : ""}`} aria-hidden={view.header !== 0}>
            <SealCheck size={38} weight="fill" />
            <span>From the grid operator, signed</span>
          </div>
          <div className={`s3-header${view.header === 1 ? " is-on" : ""}`} aria-hidden={view.header !== 1}>
            <Sun size={38} weight="fill" />
            <span>Same message at noon</span>
          </div>
        </div>
        <p className="s3-msg p-head" aria-label={typed.base.replace("\n", " ")}>
          <span aria-hidden="true">{shown}</span>
          {typed.typing && <span className="s3-caret" aria-hidden="true" />}
          <span className="s3-ghost" aria-hidden="true">
            {ghost}
          </span>
        </p>
      </div>

      {BOXES.map((b, i) => {
        const lit = view.lit > i;
        const noon = view.noon > i;
        return (
          <div key={b.maker} className={`s3-box s3-enter${lit ? " is-lit" : ""}`} style={{ left: boxLeft(i) }}>
            <div className="s3-box-in">
              <div className="s3-box-lit" />
              <div className="s3-box-body">
                <div className="s3-box-row">
                  <b.Icon className="s3-box-icon" size={48} weight="regular" />
                  <span className="s3-box-device p-body">{b.device}</span>
                  <CheckCircle className="s3-box-check" size={46} weight="fill" />
                </div>
                <div className="s3-box-maker p-title">{b.maker}</div>
                <div className="s3-box-acts p-body">
                  <div className={`s3-box-act${lit && !noon ? " is-on" : ""}`}>{b.acts[0]}</div>
                  <div className={`s3-box-act${noon ? " is-on" : ""}`}>{b.acts[1]}</div>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      <div className="s3-foot">
        <p className={`s3-foot-line p-title${view.foot === 1 ? " is-on" : view.foot === 2 ? " is-gone" : ""}`}>
          Battery first. Car second. Hot water third.
        </p>
        <p className={`s3-foot-line p-head${view.foot === 2 ? " is-on" : ""}`}>
          The operator asks. The house decides.
          <br />
          The owner can always say no.
        </p>
      </div>
    </div>
  );
}
