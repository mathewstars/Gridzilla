// Slide 3, the idea (0:55, 40 s, Matthew). Two steps, each one key press; everything after that arrives by itself.
// Step 0: one signed message is typed out, travels down three wires and each box lights as it sorts it out by itself.
// Once the boxes are lit, "Battery first. Car second. Hot water third." rises in below them, and 1.5 s after the last
// box the slide's last word follows under it. Step 1 (Right): the AI's loop, every 15 minutes, as a ring of five
// stations (gathers, thinks, checks, signs and sends, houses reply) lit in turn with live numbers, one lap. Nothing dims.
// Typing engine adapted from 21st.dev "Typewriter Text" by @educalvolpz (id 18768): its recursive per-character
// timeout, the final text laid out invisibly so nothing reflows, and freeze or reduced motion showing the full text.
import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "motion/react";
import { BatteryCharging, ChargingStation, CheckCircle, SealCheck, Thermometer, type Icon } from "@phosphor-icons/react";
import { useGridState } from "../../api";
import type { SlideProps } from "../types";
import "./slide3.css";

const EASE: [number, number, number, number] = [0.25, 0.1, 0.3, 1];

const MSG = "“This street, next three hours,\ntake at most 3 kW per house.”";

interface Box {
  maker: string;
  /** A small line under the maker: the same box from other makers. */
  also?: string;
  device: string;
  Icon: Icon;
  /** What the box does with the message. */
  act: string;
}

const BOXES: Box[] = [
  { maker: "Victron", also: "or GoodWe, any brand", device: "Battery", Icon: BatteryCharging, act: "Battery covers the house" },
  { maker: "Viessmann", device: "Heat pump", Icon: Thermometer, act: "Hot water waits until later" },
  { maker: "Car charger", device: "Any brand", Icon: ChargingStation, act: "Car charges after dinner" },
];

// Geometry in canvas px (matches slide3.css).
// Three boxes, centred under the card: 3 x 480 + 2 x 60 = 1560 px, so 180 px each side.
const BOX_W = 480;
const BOX_GAP = 60;
const boxLeft = (i: number) => (1920 - (BOXES.length * BOX_W + (BOXES.length - 1) * BOX_GAP)) / 2 + i * (BOX_W + BOX_GAP);
const ORIGIN = { x: 960, y: 352 };
const WIRE_END = 472;
const wirePath = (i: number) => {
  const x = boxLeft(i) + BOX_W / 2;
  return `M${ORIGIN.x} ${ORIGIN.y} C${ORIGIN.x} 430 ${x} 410 ${x} ${WIRE_END}`;
};

// Timeline, seconds. Step 0: typing from 0.6 s, the last box lights at 5.8 s (3.4 + 2 x 0.75 + 0.9), the foot line
// 0.4 s later, the closing line 1.5 s after the last box (each then rises for 0.8 s after a 0.35 s CSS delay).
const T0 = { type: 0.6, wires: 3.4, stagger: 0.75, travel: 0.9, foot: 6.2, close: 7.3 };
const TYPE_MS = 40;
// Step 1, the loop: the message scene leaves, the ring comes, then one lap lights the five stations in turn.
const T1 = { ring: 0.3, lap: 1.1, lapDur: 5.6 };

interface Typed {
  n: number;
  typing: boolean;
}

interface View {
  in: boolean;
  /** Boxes lit, 0-3. */
  lit: number;
  /** 0 nothing below the boxes, 1 the foot line, 2 the foot line and the closing line under it. */
  foot: 0 | 1 | 2;
}

const FINAL_VIEW: View = { in: true, lit: 3, foot: 2 };
const FINAL_TYPED: Typed = { n: MSG.length, typing: false };

// The loop ring, canvas px: five stations clockwise from the top.
const RING = { cx: 960, cy: 640, r: 290 };
const station = (k: number) => {
  const a = (k * 2 * Math.PI) / 5;
  return { x: RING.cx + RING.r * Math.sin(a), y: RING.cy - RING.r * Math.cos(a) };
};
const RING_PATH = `M${RING.cx} ${RING.cy - RING.r} A${RING.r} ${RING.r} 0 1 1 ${RING.cx} ${RING.cy + RING.r} A${RING.r} ${RING.r} 0 1 1 ${RING.cx} ${RING.cy - RING.r}`;

export default function Slide3({ step, freeze }: SlideProps) {
  const reduce = useReducedMotion();
  const still = freeze === "end" || !!reduce;
  const s = Math.min(Math.max(step, 0), 1);

  const [view, setView] = useState<View>(() => (still || s >= 1 ? FINAL_VIEW : { in: false, lit: 0, foot: 0 }));
  const [typed, setTyped] = useState<Typed>(() => (still || s >= 1 ? FINAL_TYPED : { n: 0, typing: false }));
  const [wiresDrawn] = useState(() => still || s >= 1);
  // Loop: the ring scene is on, and how many stations are lit (0-5).
  const [loop, setLoop] = useState(() => ({ on: s >= 1 && still, lit: s >= 1 && still ? 5 : 0 }));
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
    // The message travels down wire i, drawing it; the box lights when its dot arrives.
    const travel = (i: number, delay: number, dur: number, arrive: () => void) => {
      const a = animate(0, 1, {
        duration: dur,
        delay,
        ease: EASE,
        onUpdate: (v) => {
          setWire(i, v);
          setDot(i, v);
        },
        onComplete: () => {
          setDot(i, null);
          arrive();
        },
      });
      anims.push(a);
    };
    // Typing engine (after 21st.dev Typewriter Text): one character per tick, the line break at once.
    const typeOut = (startSec: number) => {
      let n = 0;
      const tick = () => {
        if (n >= MSG.length) return;
        n++;
        setTyped({ n, typing: n < MSG.length });
        timers.push(window.setTimeout(tick, MSG[n - 1] === "\n" ? 0 : TYPE_MS));
      };
      at(startSec, tick);
    };

    const setLap = (v: number) => {
      if (lapRef.current) lapRef.current.style.strokeDashoffset = String(1 - v);
    };
    const instant = still || (prev !== null && s < prev);
    if (instant) {
      setView(FINAL_VIEW);
      setTyped(FINAL_TYPED);
      setLoop({ on: s >= 1, lit: s >= 1 ? 5 : 0 });
      setLap(s >= 1 ? 1 : 0);
      for (let i = 0; i < BOXES.length; i++) {
        setWire(i, 1);
        setDot(i, null);
      }
      return () => undefined;
    }

    if (s === 0) {
      setView({ in: false, lit: 0, foot: 0 });
      setTyped({ n: 0, typing: false });
      for (let i = 0; i < BOXES.length; i++) {
        setWire(i, 0);
        setDot(i, null);
      }
      at(0.05, () => setView((v) => ({ ...v, in: true })));
      typeOut(T0.type);
      BOXES.forEach((_, i) =>
        travel(i, T0.wires + i * T0.stagger, T0.travel, () => setView((v) => ({ ...v, lit: Math.max(v.lit, i + 1) }))),
      );
      at(T0.foot, () => setView((v) => ({ ...v, foot: v.foot >= 1 ? v.foot : 1 })));
      at(T0.close, () => setView((v) => ({ ...v, foot: 2 })));
    } else {
      // The loop: the message scene leaves, the ring comes, one lap lights the five stations in turn, then it rests.
      setView(FINAL_VIEW);
      setTyped(FINAL_TYPED);
      setLap(0);
      setLoop({ on: false, lit: 0 });
      at(T1.ring, () => setLoop({ on: true, lit: 0 }));
      at(T1.lap - 0.05, () => setLoop({ on: true, lit: 1 }));
      const a = animate(0, 1, {
        duration: T1.lapDur,
        delay: T1.lap,
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

  const shown = MSG.slice(0, typed.n);
  const ghost = MSG.slice(typed.n);

  return (
    <div className={`p-slide s3${view.in ? " s3-in" : ""}${still ? " s3-still" : ""}${s >= 1 ? " s3-looping" : ""}`} data-slide="3">
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
        <div className="s3-header p-small">
          <SealCheck size={38} weight="fill" />
          <span>From the grid operator, signed</span>
        </div>
        <p className="s3-msg p-head" data-src="deck" data-label="the example message" aria-label={MSG.replace("\n", " ")}>
          <span aria-hidden="true">{shown}</span>
          {typed.typing && <span className="s3-caret" aria-hidden="true" />}
          <span className="s3-ghost" aria-hidden="true">
            {ghost}
          </span>
        </p>
      </div>

      {BOXES.map((b, i) => {
        const lit = view.lit > i;
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
                {b.also && <div className="s3-box-also p-small p-secondary">{b.also}</div>}
                <div className={`s3-box-act p-body${lit ? " is-on" : ""}`}>{b.act}</div>
              </div>
            </div>
          </div>
        );
      })}

      <div className="s3-foot">
        <p className={`s3-foot-line p-title${view.foot >= 1 ? " is-on" : ""}`}>Battery first. Car second. Hot water third.</p>
        <p className={`s3-foot-line s3-close p-title${view.foot >= 2 ? " is-on" : ""}`}>
          <span className="p-secondary">The operator asks. The house decides. </span>
          <span className="p-ink">The owner can always say{" "}no.</span>
        </p>
      </div>

      {s >= 1 && <Loop lit={loop.lit} on={loop.on} live={live} lapRef={lapRef} />}
    </div>
  );
}

type Live = ReturnType<typeof useGridState>["data"];

/** Step 1: the AI's loop as a ring of five stations, each with one plain line and its live (or labelled) number. */
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
              ? { left: p.x + (k === 2 ? 64 : 52), top: p.y - 44, width: 620 }
              : { left: p.x - (k === 3 ? 64 : 52) - 620, top: p.y - 44, width: 620 };
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
