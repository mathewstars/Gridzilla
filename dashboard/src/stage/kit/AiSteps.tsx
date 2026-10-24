// Sees -> Thinks -> Checks -> Acts: the autopilot's real decision, lit step by step in sync with its live stage.
// While it works the active step is Apple blue; done steps are ink, waiting steps tertiary. A new decision replays
// the four steps once (it is a real change); a new signed message gets a small seal.
//
// Sized by its own container, not the window: four across from 48rem, two by two from 24rem, one stack below that.
// Type scales with the container (cqi) and every line wraps; nothing is cut or kept on one line.
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import type { Decision, Proposal, State, WeatherFeed } from "../../api";
import { hhmm, nice, outcome } from "../../model";
import { boxLine, modeTitle, plainReason } from "../../components/brain/plain";
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

const secs = (ms: number | null | undefined) => (ms ? `DeepSeek ${(ms / 1000).toFixed(1)} s` : "DeepSeek");

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

/** "Sees" in STORY short form: the worst transformer's % and when, read from the autopilot's own trigger line. */
function seen(s: State, trigger: string | null | undefined, node?: string | null): [string, string | null] {
  const m = trigger?.match(/worst (\S+) (\d+) % at ([\d.]+)h/);
  if (m) return [`${m[2]} % at ${hhmm(parseFloat(m[3]))}`, nice(m[1])];
  const tg = s.autopilot?.target;
  if (tg?.worst) return [`${Math.round(tg.worst_pct)} % at ${hhmm(tg.worst_at_h)}`, nice(tg.worst)];
  const tfCount = Object.keys(s.tree).filter((x) => x.startsWith("tf:")).length;
  return [`${n(tfCount)} streets`, node ? nice(node) : "watched every 15 minutes"];
}

/** "Acts" in short form: at most N kW until HH:MM. */
function actLine(d: { fields?: Record<string, number | null> | null; sim_h?: number; duration_min?: number | null; segment?: string | null }) {
  const f = d.fields ?? {};
  const cap = f.import_max_kw ?? f.export_max_kw ?? null;
  const until = d.sim_h != null && d.duration_min ? ` until ${hhmm(d.sim_h + d.duration_min / 60)}` : "";
  return cap != null ? `at most ${n(cap)} kW${until}` : d.segment ? nice(d.segment) : null;
}

function stepsFor(s: State, weather: WeatherFeed): { steps: Step[]; key: string } {
  void weather;
  const ap = s.autopilot;
  const mk = (state: StepState[], lines: [string, string | null | undefined, Tone?][], seal: number | null = null): Step[] =>
    lines.map(([line, sub, tone], i) => ({ name: NAMES[i], state: state[i], line, sub, tone, seal: i === 3 ? seal : null }));

  if (!ap || ap.mode === "off")
    return {
      key: "off",
      steps: mk(["waiting", "waiting", "waiting", "waiting"], [
        ["Autopilot off", "a person is in charge"],
        ["Resting", null],
        ["Standing by", null],
        ["Nothing sent", null],
      ]),
    };

  // Live: the autopilot is working right now.
  if (ap.busy && ap.stage in STAGE_INDEX) {
    const k = STAGE_INDEX[ap.stage];
    const st = NAMES.map((_, i) => (i < k ? "done" : i === k ? "active" : "waiting")) as StepState[];
    const [v, where] = seen(s, ap.last_trigger);
    return {
      key: `busy-${ap.stage}-${ap.last_run}`,
      steps: mk(st, [
        [v, where],
        k >= 1 ? ["DeepSeek", k === 1 ? "thinking" : "answered"] : ["DeepSeek", "next"],
        k > 2 ? ["Guard passed", null, "green"] : k === 2 ? ["Checking", "safety rules"] : ["Guard", "next"],
        k === 3 ? ["Signing", "Ed25519, over MQTT"] : ["Nothing yet", null],
      ]),
    };
  }

  // A proposal waits for an operator.
  const pend: Proposal | null = ap.pending;
  if (pend && !pend.error) {
    const guardOk = !pend.guard;
    const [v, where] = seen(s, pend.situation ?? ap.last_trigger, pend.segment);
    return {
      key: `pending-${pend.at ?? ""}`,
      steps: mk(["done", "done", "done", guardOk ? "active" : "waiting"], [
        [v, where],
        [secs(pend.latency_ms), modeTitle(pend.mode)],
        guardOk ? ["Guard passed", boxLine(pend.envelope, pend.fields), "green"] : ["Guard refused", plainReason(pend.guard, pend.mode), "red"],
        guardOk ? ["Waiting", "for a human OK"] : ["Nothing sent", null],
      ]),
    };
  }

  const d = ap.history?.[0];
  if (!d) {
    const [v, where] = seen(s, ap.last_trigger);
    return { key: "watch", steps: mk(["active", "waiting", "waiting", "waiting"], [[v, where], ["DeepSeek", "next"], ["Guard", "next"], ["Nothing yet", null]]) };
  }

  const key = `d-${d.at}-${d.verdict}`;
  const [v, where] = seen(s, d.trigger, d.segment);
  const seeLine: [string, string | null] = [v, where];
  const think: [string, string | null | undefined] = [secs(d.latency_ms), modeTitle(d.mode) || null];
  const allowed: [string, string | null | undefined, Tone] = ["Guard passed", "inside every safety rule", "green"];
  switch (d.verdict) {
    case "sent": {
      const r = reach(s, d);
      return {
        key,
        steps: mk(
          ["done", "done", "done", "done"],
          [seeLine, think, allowed, [d.seq != null ? `#${d.seq} signed` : "Signed", [actLine(d), r ? `${n(r.homes)} homes` : null].filter(Boolean).join(", ") || null]],
          d.seq,
        ),
      };
    }
    case "refused":
      return { key, steps: mk(["done", "done", "done", "waiting"], [seeLine, think, ["Guard refused", plainReason(d.detail, d.mode), "red"], ["Nothing sent", null]]) };
    case "held":
      return { key, steps: mk(["done", "done", "done", "waiting"], [seeLine, think, ["Held back", plainReason(d.detail, d.mode), "red"], ["Nothing sent", null]]) };
    case "none":
      return { key, steps: mk(["done", "done", "waiting", "waiting"], [seeLine, [secs(d.latency_ms), "no action needed"], ["Nothing to check", null], ["Nothing sent", null]]) };
    case "error":
      return { key, steps: mk(["done", "done", "waiting", "waiting"], [seeLine, ["DeepSeek", "no answer in time"], ["Nothing to check", null], ["Nothing sent", null]]) };
    case "pending":
      return { key, steps: mk(["done", "done", "done", "active"], [seeLine, think, allowed, ["Waiting", "for a human OK"]]) };
    case "rejected":
      return { key, steps: mk(["done", "done", "done", "done"], [seeLine, think, allowed, ["Declined", "a person said no"]]) };
    case "expired":
      return { key, steps: mk(["done", "done", "done", "waiting"], [seeLine, think, allowed, ["Expired", "nobody approved in time"]]) };
  }
  return { key, steps: mk(["done", "waiting", "waiting", "waiting"], [seeLine, ["DeepSeek", "next"], ["Guard", "next"], ["Nothing yet", null]]) };
}

/** Small check seal that draws itself when a new signed message goes out. */
function Seal({ seq, play }: { seq: number; play: boolean }) {
  return (
    <motion.svg
      key={seq}
      width="1.05em"
      height="1.05em"
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

const CSS = `
.gz-steps{container-type:inline-size;min-width:0}
.gz-steps>ol{display:grid;grid-template-columns:minmax(0,1fr);gap:1.25rem 1.5rem;
  --gz-n:clamp(1rem,4.6cqi,1.25rem);--gz-l:clamp(1.125rem,6cqi,1.5rem);--gz-s:clamp(0.9375rem,4.4cqi,1.125rem)}
@container (min-width:24rem){.gz-steps:not([data-stack])>ol{grid-template-columns:repeat(2,minmax(0,1fr));
  --gz-n:clamp(1rem,2.7cqi,1.5rem);--gz-l:clamp(1.125rem,3.7cqi,2rem);--gz-s:clamp(0.9375rem,2.5cqi,1.25rem)}}
@container (min-width:48rem){.gz-steps:not([data-stack])>ol{grid-template-columns:repeat(4,minmax(0,1fr));gap:1.5rem clamp(1rem,2.6cqi,2.5rem);
  --gz-n:clamp(1rem,1.4cqi,1.875rem);--gz-l:clamp(1.125rem,1.95cqi,2.75rem);--gz-s:clamp(0.9375rem,1.3cqi,1.75rem)}}
.gz-steps[data-stack]>ol{gap:1.5rem;--gz-n:clamp(1rem,4cqi,1.5rem);--gz-l:clamp(1.125rem,5.5cqi,2.25rem);--gz-s:clamp(0.9375rem,3.6cqi,1.5rem)}
`;

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
    <div className="gz-steps" data-stack={row ? undefined : ""}>
    <style>{CSS}</style>
    <ol aria-label="What the AI does" data-src="state/autopilot">
      {view.steps.map((st, i) => {
        // While a replay runs, steps not yet reached wait; the one being revealed is active.
        const state: StepState = i < shown ? st.state : i === shown && st.state !== "waiting" ? "active" : "waiting";
        const nameColor = state === "active" ? P.blue : state === "done" ? P.ink : P.tertiary;
        const dot = state === "active" ? P.blue : state === "done" ? (st.tone === "red" ? P.red : P.green) : P.fill;
        const lineColor = state === "waiting" ? P.tertiary : st.tone && state === "done" ? TONE[st.tone] : state === "active" ? P.blue : P.ink;
        return (
          <li key={NAMES[i]} className="min-w-0">
            <div className="flex items-center gap-2 font-semibold" style={{ color: nameColor, fontSize: "var(--gz-n)", lineHeight: 1.2, transition: "color 0.3s cubic-bezier(0,0,0.5,1)" }}>
              <span className="inline-block shrink-0 rounded-full" style={{ width: "0.55em", height: "0.55em", background: dot, transition: "background 0.3s cubic-bezier(0,0,0.5,1)" }} />
              <span className="min-w-0 break-words">{st.name}</span>
            </div>
            <div className="mt-1 flex min-w-0 items-center gap-[0.4em]" style={{ fontSize: "var(--gz-l)" }}>
              {i === 3 && st.seal != null && state === "done" && <Seal seq={st.seal} play={st.seal === freshSeq} />}
              <motion.p
                key={st.line}
                initial={{ opacity: 0.4 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, ease: EASE }}
                className="min-w-0 break-words font-semibold [text-wrap:balance]"
                style={{
                  color: lineColor,
                  fontSize: "var(--gz-l)",
                  lineHeight: 1.1,
                  letterSpacing: "-0.02em",
                  fontVariantNumeric: "tabular-nums",
                  transition: "color 0.3s cubic-bezier(0,0,0.5,1)",
                }}
              >
                {st.line}
              </motion.p>
            </div>
            {st.sub && state !== "waiting" && (
              <p className="mt-1 min-w-0 break-words font-semibold" style={{ color: P.secondary, fontSize: "var(--gz-s)", lineHeight: 1.25 }}>
                {st.sub}
              </p>
            )}
          </li>
        );
      })}
    </ol>
    </div>
  );
}
