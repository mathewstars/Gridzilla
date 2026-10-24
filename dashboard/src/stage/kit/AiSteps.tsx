// Sees -> Thinks -> Checks -> Acts: the autopilot's real decision, lit step by step in sync with its live stage.
// While it works the active step is Apple blue; done steps are ink, waiting steps tertiary. A new decision replays
// the four steps once (it is a real change); a new signed message gets a small seal.
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import type { Decision, Proposal, State, WeatherFeed } from "../../api";
import { headline, outcome, plainTrigger } from "../../model";
import { boxLine, cleanText, modePlain, modeTitle, plainReason, sentences, weatherLine } from "../../components/brain/plain";
import { P } from "../palette";

type StepState = "done" | "active" | "waiting";
type Tone = "ink" | "green" | "red";

interface Step {
  name: string;
  state: StepState;
  line: string;
  sub?: string | null;
  tone?: Tone;
  seal?: number | null; // seq of a freshly signed message
}

const NAMES = ["Sees", "Thinks", "Checks", "Acts"];
const STAGE_INDEX: Record<string, number> = { sense: 0, deepseek: 1, guard: 2, send: 3 };
const EASE = [0, 0, 0.5, 1] as const;

const first = (t: string | null | undefined, ids: string[]) => sentences(cleanText(t, ids))[0] ?? "";
const secs = (ms: number | null | undefined) => (ms ? `answered in ${(ms / 1000).toFixed(1)} s` : null);

/** Homes a signal reached and how many obeyed: from the houses' signed acks when they are on screen, else from the
 *  segment's aggregate (each simulated household stands for several real homes). */
function reach(s: State, d: Decision) {
  const o = outcome(s, d);
  if (o && o.total > 0) return { homes: o.total, obeyed: o.obeyed + o.partial };
  const a = d.segment ? s.aggregates?.[d.segment] : null;
  if (!a) return null;
  const r = s.summary?.households ? s.summary.houses / s.summary.households : 1;
  return { homes: Math.round(a.online * r), obeyed: Math.round(Math.min(a.applied, a.online) * r) };
}

const n = (v: number) => v.toLocaleString("en-US");

function stepsFor(s: State, weather: WeatherFeed): { steps: Step[]; key: string } {
  const ap = s.autopilot;
  const ids = Object.keys(s.tree);
  const homes = headline(s).houses;
  const tfCount = ids.filter((x) => x.startsWith("tf:")).length;
  const sees = (t: string | null | undefined) =>
    cleanText(plainTrigger(t), ids) || `Watching ${homes ? n(homes) + " homes on " : ""}${tfCount} transformers`;
  const wx = weatherLine(weather);
  const mk = (state: StepState[], lines: [string, string | null | undefined, Tone?][], seal: number | null = null): Step[] =>
    lines.map(([line, sub, tone], i) => ({ name: NAMES[i], state: state[i], line, sub, tone, seal: i === 3 ? seal : null }));

  if (!ap || ap.mode === "off")
    return {
      key: "off",
      steps: mk(["waiting", "waiting", "waiting", "waiting"], [
        ["Autopilot is off", wx],
        ["DeepSeek is resting", null],
        ["Safety rules stand by", null],
        ["Nothing sent", null],
      ]),
    };

  // Live: the autopilot is working right now.
  if (ap.busy && ap.stage in STAGE_INDEX) {
    const k = STAGE_INDEX[ap.stage];
    const st = NAMES.map((_, i) => (i < k ? "done" : i === k ? "active" : "waiting")) as StepState[];
    return {
      key: `busy-${ap.stage}-${ap.last_run}`,
      steps: mk(st, [
        [sees(ap.last_trigger), wx],
        k > 1 ? ["DeepSeek answered", null] : k === 1 ? ["Asking DeepSeek for a plan", "Grid state, forecast and weather"] : ["DeepSeek is next", null],
        k > 2 ? ["Allowed: inside every safety rule", null, "green"] : k === 2 ? ["Checking every safety rule", null] : ["Safety rules next", null],
        k === 3 ? ["Signing and sending", "Ed25519 signature, sent over MQTT"] : ["Nothing sent yet", null],
      ]),
    };
  }

  // A proposal waits for an operator.
  const pend: Proposal | null = ap.pending;
  if (pend && !pend.error) {
    const guardOk = !pend.guard;
    return {
      key: `pending-${pend.at ?? ""}`,
      steps: mk(["done", "done", "done", guardOk ? "active" : "waiting"], [
        [sees(pend.situation ?? ap.last_trigger), wx],
        [first(pend.rationale, ids) || modeTitle(pend.mode), [modeTitle(pend.mode), secs(pend.latency_ms)].filter(Boolean).join(", ")],
        guardOk
          ? ["Allowed: inside every safety rule", boxLine(pend.envelope, pend.fields), "green"]
          : [`Refused: ${plainReason(pend.guard, pend.mode)}`, null, "red"],
        guardOk ? ["Waiting for a human OK", modePlain(pend.mode)] : ["Nothing sent", null],
      ]),
    };
  }

  const d = ap.history?.[0];
  if (!d)
    return {
      key: "watch",
      steps: mk(["active", "waiting", "waiting", "waiting"], [
        [sees(ap.last_trigger), wx],
        ["DeepSeek is next", null],
        ["Safety rules next", null],
        ["Nothing sent yet", null],
      ]),
    };

  const key = `d-${d.at}-${d.verdict}`;
  const seeLine: [string, string | null | undefined] = [sees(d.trigger), wx];
  const think: [string, string | null | undefined] = [
    first(d.rationale, ids) || modeTitle(d.mode) || "DeepSeek proposed a plan",
    [modeTitle(d.mode), secs(d.latency_ms)].filter(Boolean).join(", ") || null,
  ];
  const allowed: [string, string | null | undefined, Tone] = ["Allowed: inside every safety rule", boxLine(d.envelope, d.fields), "green"];
  switch (d.verdict) {
    case "sent": {
      const r = reach(s, d);
      return {
        key,
        steps: mk(
          ["done", "done", "done", "done"],
          [
            seeLine,
            think,
            allowed,
            [
              r ? `Signed and sent to ${n(r.homes)} homes` : "Signed and sent",
              r ? `${n(r.obeyed)} of ${n(r.homes)} obeyed` : null,
            ],
          ],
          d.seq,
        ),
      };
    }
    case "refused":
      return {
        key,
        steps: mk(["done", "done", "done", "waiting"], [seeLine, think, [`Refused: ${plainReason(d.detail, d.mode)}`, null, "red"], ["Nothing sent", null]]),
      };
    case "held":
      return {
        key,
        steps: mk(["done", "done", "done", "waiting"], [seeLine, think, [`Held back: ${plainReason(d.detail, d.mode)}`, null], ["Nothing sent", null]]),
      };
    case "none":
      return {
        key,
        steps: mk(["done", "done", "waiting", "waiting"], [
          seeLine,
          ["No action needed", first(d.rationale, ids) || secs(d.latency_ms)],
          ["Nothing to check", null],
          ["Nothing sent", null],
        ]),
      };
    case "error":
      return {
        key,
        steps: mk(["done", "done", "waiting", "waiting"], [seeLine, ["DeepSeek did not answer in time", null], ["Nothing to check", null], ["Nothing sent", null]]),
      };
    case "pending":
      return { key, steps: mk(["done", "done", "done", "active"], [seeLine, think, allowed, ["Waiting for a human OK", modePlain(d.mode)]]) };
    case "rejected":
      return { key, steps: mk(["done", "done", "done", "done"], [seeLine, think, allowed, ["A person said no", "Nothing was sent"]]) };
    case "expired":
      return { key, steps: mk(["done", "done", "done", "waiting"], [seeLine, think, allowed, ["Nobody approved it in time", "Nothing was sent"]]) };
  }
  return { key, steps: mk(["done", "waiting", "waiting", "waiting"], [seeLine, ["DeepSeek is next", null], ["Safety rules next", null], ["Nothing sent yet", null]]) };
}

/** Small check seal that draws itself when a new signed message goes out. */
function Seal({ seq, play }: { seq: number; play: boolean }) {
  return (
    <motion.svg
      key={seq}
      width="28"
      height="28"
      viewBox="0 0 28 28"
      initial={play ? { scale: 0.6, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.35, ease: EASE }}
      aria-hidden
      className="shrink-0"
    >
      <circle cx="14" cy="14" r="13" fill={P.green} />
      <motion.path
        d="M8 14.5l4 4 8-9"
        fill="none"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={play ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.4, delay: play ? 0.2 : 0, ease: EASE }}
      />
    </motion.svg>
  );
}

const TONE: Record<Tone, string> = { ink: P.ink, green: P.green, red: P.red };

export default function AiSteps({ s, weather, variant = "row" }: { s: State | null; weather: WeatherFeed; variant?: "row" | "stack" }) {
  const view = s ? stepsFor(s, weather) : null;
  const key = view?.key ?? "";

  // A new decision replays the steps once, 0.3 s apart. The first render shows the current decision as it is.
  const [shown, setShown] = useState(4);
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    if (lastKey.current === null || key.startsWith("busy") || key === lastKey.current) {
      lastKey.current = key;
      return;
    }
    const wasBusy = lastKey.current.startsWith("busy");
    lastKey.current = key;
    if (wasBusy) return; // the live stages already lit the steps
    setShown(0);
    const ids = [1, 2, 3, 4].map((i) => window.setTimeout(() => setShown(i), i * 300));
    return () => ids.forEach(clearTimeout);
  }, [key]);

  // The seal plays only for a seq that appeared while the stage was open.
  const sealSeq = view?.steps[3].seal ?? null;
  const seenSeq = useRef<number | null>(null);
  const [freshSeq, setFreshSeq] = useState<number | null>(null);
  useEffect(() => {
    if (sealSeq == null) return;
    if (seenSeq.current != null && sealSeq !== seenSeq.current) setFreshSeq(sealSeq);
    seenSeq.current = sealSeq;
  }, [sealSeq]);

  if (!view) return null;
  const row = variant === "row";

  return (
    <ol className={row ? "grid grid-cols-1 gap-8 md:grid-cols-4 md:gap-10" : "flex flex-col gap-7"} aria-label="What the AI does">
      {view.steps.map((st, i) => {
        // While a replay runs, steps not yet reached wait; the one being revealed is active.
        const state: StepState = i < shown ? st.state : i === shown && st.state !== "waiting" ? "active" : "waiting";
        const nameColor = state === "active" ? P.blue : state === "done" ? P.ink : P.tertiary;
        const bar = state === "active" ? P.blue : state === "done" ? P.ink : P.fill;
        const lineColor = state === "waiting" ? P.tertiary : st.tone && state === "done" ? TONE[st.tone] : P.ink;
        return (
          <li key={NAMES[i]} className="min-w-0">
            <div className="h-[3px] w-full rounded-full" style={{ background: bar, transition: "background 0.3s cubic-bezier(0,0,0.5,1)" }} />
            <div
              className="mt-4 font-semibold"
              style={{ color: nameColor, fontSize: row ? "1.0625rem" : "1rem", letterSpacing: "-0.01em", transition: "color 0.3s cubic-bezier(0,0,0.5,1)" }}
            >
              {st.name}
            </div>
            <div className="mt-2 flex items-start gap-3">
              {i === 3 && st.seal != null && state === "done" && <Seal seq={st.seal} play={st.seal === freshSeq} />}
              <motion.p
                key={st.line}
                initial={{ opacity: 0.4 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, ease: EASE }}
                className="min-w-0 break-words font-semibold"
                style={{
                  color: lineColor,
                  fontSize: row ? "clamp(1.125rem, 1.45vw, 1.75rem)" : "clamp(1.25rem, 1.7vw, 2rem)",
                  lineHeight: 1.18,
                  letterSpacing: "-0.015em",
                  fontVariantNumeric: "tabular-nums",
                  transition: "color 0.3s cubic-bezier(0,0,0.5,1)",
                }}
              >
                {st.line}
              </motion.p>
            </div>
            {st.sub && state !== "waiting" && (
              <p className="mt-2 break-words" style={{ color: P.secondary, fontSize: row ? "clamp(0.9375rem, 1vw, 1.125rem)" : "1.0625rem", lineHeight: 1.35 }}>
                {st.sub}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
