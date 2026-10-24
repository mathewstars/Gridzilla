// Slide 3, the idea (0:55, 40 s, Matthew). One signed message is typed out, travels down four wires and each box
// sorts it out by itself. Step 1 (Right): the same message at noon: only the changed words swap (no second typing),
// the message travels again, then the slide's last word. Step 2 (Right): the AI's loop, every 15 minutes, as a ring of
// five stations (gathers, thinks, checks, signs and sends, houses reply) lit in turn with live numbers, one loop.
// Typing engine adapted from 21st.dev "Typewriter Text" by @educalvolpz (id 18768): its recursive per-character
// timeout, the final text laid out invisibly so nothing reflows, and freeze or reduced motion showing the full text.
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
import { useGridState } from "../../api";
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
const SPEED = { type: 40, erase: 22 };
// Step 2, the loop: the old scene leaves, the ring comes, then one lap lights the five stations in turn.
const T2 = { ring: 0.3, lap: 1.1, lapDur: 5.6 };

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
const finalTyped = (): Typed => ({ base: MSG[0], n: MSG[0].length, typing: false });

// The loop ring, canvas px: five stations clockwise from the top.
const RING = { cx: 960, cy: 640, r: 290 };
const station = (k: number) => {
  const a = (k * 2 * Math.PI) / 5;
  return { x: RING.cx + RING.r * Math.sin(a), y: RING.cy - RING.r * Math.cos(a) };
};
const RING_PATH = `M${RING.cx} ${RING.cy - RING.r} A${RING.r} ${RING.r} 0 1 1 ${RING.cx} ${RING.cy + RING.r} A${RING.r} ${RING.r} 0 1 1 ${RING.cx} ${RING.cy - RING.r}`;

const commonPrefix = (a: string, b: string) => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
};

export default function Slide3({ step, freeze }: SlideProps) {
  const reduce = useReducedMotion();
  const still = freeze === "end" || !!reduce;
  const s = Math.min(Math.max(step, 0), 2);

  const [view, setView] = useState<View>(() => (still ? finalView(s) : s >= 1 ? finalView(s - 1) : { in: false, header: 0, lit: 0, noon: 0, foot: 0 }));
  const [typed, setTyped] = useState<Typed>(() => (still || s >= 1 ? finalTyped() : { base: MSG[0], n: 0, typing: false }));
  const [wiresDrawn] = useState(() => still || s >= 1);
  // Noon: the changed words swap in place. Loop: the ring scene is on, and how many stations are lit (0-5).
  const [swap, setSwap] = useState(() => s >= 2 || (still && s >= 1));
  const [loop, setLoop] = useState(() => ({ on: s >= 2 && still, lit: s >= 2 && still ? 5 : 0 }));
  const lapRef = useRef<SVGPathElement | null>(null);
  const live = useGridState("", "").data;
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

    const setLap = (v: number) => {
      if (lapRef.current) lapRef.current.style.strokeDashoffset = String(1 - v);
    };
    const instant = still || (prev !== null && s < prev);
    if (instant) {
      setView(finalView(s));
      setTyped(finalTyped());
      setSwap(s >= 1);
      setLoop({ on: s >= 2, lit: s >= 2 ? 5 : 0 });
      setLap(s >= 2 ? 1 : 0);
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
    } else if (s === 1) {
      // Noon: start from the finished evening state, swap the changed words (no second typing) and send it again.
      setView(finalView(0));
      setTyped(finalTyped());
      setSwap(false);
      setLoop({ on: false, lit: 0 });
      for (let i = 0; i < 4; i++) {
        setWire(i, 1);
        setDot(i, null);
      }
      at(T1.header + 0.05, () => setView((v) => ({ ...v, header: 1 })));
      at(T1.type, () => setSwap(true));
      BOXES.forEach((_, i) =>
        travel(i, T1.dots + i * T1.stagger, T1.travel, false, () => setView((v) => ({ ...v, noon: Math.max(v.noon, i + 1) }))),
      );
      at(T1.foot, () => setView((v) => ({ ...v, foot: 2 })));
    } else {
      // The loop: the message scene leaves, the ring comes, one lap lights the five stations in turn, then it rests.
      setView(finalView(1));
      setTyped(finalTyped());
      setSwap(true);
      setLap(0);
      setLoop({ on: false, lit: 0 });
      at(T2.ring, () => setLoop({ on: true, lit: 0 }));
      at(T2.lap - 0.05, () => setLoop({ on: true, lit: 1 }));
      const a = animate(0, 1, {
        duration: T2.lapDur,
        delay: T2.lap,
        ease: "linear",
        onUpdate: (v) => {
          setLap(v);
          const lit = Math.min(5, 1 + Math.floor(v * 5 + 0.02));
          setLoop((l) => (l.lit === lit ? l : { on: true, lit }));
        },
      });
      anims.push(a);
    }

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      anims.forEach((a) => a.stop());
    };
  }, [s, still]);

  const shown = typed.base.slice(0, typed.n);
  const ghost = typed.base.slice(typed.n);

  return (
    <div className={`p-slide s3${view.in ? " s3-in" : ""}${still ? " s3-still" : ""}${s >= 2 ? " s3-looping" : ""}`} data-slide="3">
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
        {s === 0 ? (
          <p className="s3-msg p-head" data-src="deck" data-label="the example message" aria-label={typed.base.replace("\n", " ")}>
            <span aria-hidden="true">{shown}</span>
            {typed.typing && <span className="s3-caret" aria-hidden="true" />}
            <span className="s3-ghost" aria-hidden="true">
              {ghost}
            </span>
          </p>
        ) : (
          <p className="s3-msg p-head" data-src="deck" data-label="the example message" aria-label={MSG[swap ? 1 : 0].replace("\n", " ")}>
            {"“This street, next three hours,"}
            <br />
            <span className="s3-swap" aria-hidden="true">
              <span className={swap ? "" : "is-on"}>take at most 3 kW</span>
              <span className={swap ? "is-on" : ""}>give at most 2 kW</span>
            </span>
            {" per house.”"}
          </p>
        )}
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

      {s >= 2 && <Loop lit={loop.lit} on={loop.on} live={live} lapRef={lapRef} />}
    </div>
  );
}

type Live = ReturnType<typeof useGridState>["data"];

/** Step 2: the AI's loop as a ring of five stations, each with one plain line and its live (or labelled) number. */
function Loop({ lit, on, live, lapRef }: { lit: number; on: boolean; live: Live; lapRef: React.MutableRefObject<SVGPathElement | null> }) {
  const tfs = live ? Object.keys(live.aggregates ?? {}).filter((k) => k.startsWith("tf:")).length : null;
  const last = live?.autopilot?.history?.[0] ?? null;
  const online = live?.summary?.online ?? null;
  const stations = [
    {
      name: "Gathers",
      line: tfs ? (
        <>
          <span data-src="derived" data-from="count(state/aggregates/tf:*)" data-val={tfs}>
            {tfs}
          </span>{" "}
          transformers, the weather, the plan, every reply
        </>
      ) : (
        <>Every transformer, the weather, the plan, every reply</>
      ),
    },
    {
      name: "Thinks",
      line:
        last?.latency_ms != null ? (
          <>
            The AI writes the message in{" "}
            <span data-src="state/autopilot/history/0/latency_ms" data-val={last.latency_ms} data-scale="0.001">
              {(last.latency_ms / 1000).toFixed(1)} s
            </span>
          </>
        ) : (
          <>The AI writes the message in a second</>
        ),
    },
    {
      name: "Checks",
      line: (
        <>
          <span data-src="deck" data-label="the guard, from the script">
            30
          </span>{" "}
          lines of plain rules, not AI
        </>
      ),
    },
    {
      name: "Signs and sends",
      line:
        last?.seq != null ? (
          <>
            The platform signs message{" "}
            <span data-src="state/autopilot/history/0/seq" data-val={last.seq}>
              #{last.seq}
            </span>
          </>
        ) : (
          <>The platform signs it and sends it</>
        ),
    },
    {
      name: "Houses reply",
      line:
        online != null ? (
          <>
            <span data-src="state/summary/online" data-val={online}>
              {online}
            </span>{" "}
            homes answer, all signed
          </>
        ) : (
          <>Every home answers, all signed</>
        ),
    },
  ];
  return (
    <div className={`s3-loop${on ? " is-on" : ""}`}>
      <h2 className="s3-loop-title p-head" data-src="deck" data-label="the autopilot's review interval">
        The loop, every 15 minutes.
      </h2>
      <svg className="s3-loop-ring" viewBox="0 0 1920 1080" aria-hidden="true">
        <path className="s3-loop-track" d={RING_PATH} />
        <path ref={lapRef} className="s3-loop-lap" d={RING_PATH} pathLength={1} style={{ strokeDasharray: "1 1", strokeDashoffset: lit >= 5 && !on ? 0 : undefined }} />
        {stations.map((st, k) => {
          const p = station(k);
          return <circle key={st.name} className={`s3-loop-node${lit > k ? " is-lit" : ""}`} cx={p.x} cy={p.y} r={20} />;
        })}
      </svg>
      {stations.map((st, k) => {
        const p = station(k);
        const side = k === 0 ? "top" : k <= 2 ? "right" : "left";
        const style =
          side === "top"
            ? { left: p.x - 560, top: p.y - 154, width: 1120 }
            : side === "right"
              ? { left: p.x + 48, top: p.y - 44, width: 620 }
              : { left: p.x - 48 - 620, top: p.y - 44, width: 620 };
        return (
          <div key={st.name} className={`s3-station s3-station-${side}${lit > k ? " is-lit" : ""}`} style={style}>
            <div className="s3-station-name p-title">{st.name}</div>
            <div className="s3-station-line p-body p-secondary">{st.line}</div>
          </div>
        );
      })}
    </div>
  );
}
