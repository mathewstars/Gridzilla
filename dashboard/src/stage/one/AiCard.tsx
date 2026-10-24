// The side card "ai": Sees -> Thinks -> Checks -> Acts, the autopilot's real decision lit step by step in sync with its
// live stage. Built on kit/AiSteps' decision logic, drawn after the 21st.dev "Animated Progress Stepper" (stepper-03,
// @shadcnspace, id 28558, design/21st/step-progress.tsx): step nodes on a track that fills as the work moves on, a
// node that turns into a check when its step is done. Re-implemented here, not pasted; no buttons, nothing clickable.
//
// STAGE.md 7.5 colours: done = green check, guard refused or held = red cross, a proposal waiting for a person = orange
// ring, waiting = grey ring. No blue, no coloured text. Every number on the card is its own span with data-src/data-val
// (qa/README.md), so G2 can trace it to /api/state.
//
// The shell's card (Stage.tsx, data-card="ai") owns the surface and padding; this part fills it.
// Layout by the card's own width: one column below 20rem, two by two from 20rem, four across with the track from 44rem.
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { CheckCircle, XCircle } from "@phosphor-icons/react";
import type { State } from "../../api";
import { hhmm, nice, pathOf } from "../../model";
import { modeTitle, plainReason, worstOf } from "../../components/brain/plain";
import { P } from "../palette";
import type { Street, StoryState } from "../useStory";

type Node = "done" | "active" | "waiting" | "human" | "refused";

/** A number on screen and where it comes from. `val` is the raw payload value (left out for clock times and text). */
interface Num {
  t: string;
  src: string;
  from?: string;
  val?: number;
  scale?: number;
  label?: string;
}
type Part = string | Num;

interface Step {
  name: string;
  node: Node;
  value: Part[];
  sub: Part[] | null;
  /** seq of a signed message: its check draws itself when the seq is new. */
  seal?: number | null;
}

const NAMES = ["Sees", "Thinks", "Checks", "Acts"];
const STAGE_INDEX: Record<string, number> = { sense: 0, deepseek: 1, guard: 2, send: 3 };
const EASE = [0, 0, 0.5, 1] as const;

const fmt = (v: number) => v.toLocaleString("en-US");
const kwText = (v: number) => (Number.isInteger(v) ? fmt(v) : v.toFixed(1));

/** "Sees": the worst transformer's % and when, from the decision's own trigger line (or the live target). */
function sees(
  s: State,
  trigger: string | null | undefined,
  trigSrc: string,
  worst?: { src: string; val: number | null | undefined },
): { value: Part[]; sub: Part[] | null } {
  // A release: the peak is over on that part of the grid.
  const rel = trigger?.match(/on (\S+) is active but every transformer under it is forecast below (\d+) %/);
  if (rel) {
    const pct = +rel[2];
    const relSrc = s.autopilot?.release_pct === pct ? { src: "state/autopilot/release_pct", val: pct } : { src: trigSrc };
    return { value: ["Event over"], sub: ["forecast under\u00a0", { t: String(pct), ...relSrc }, "\u00a0%"] }; // the title names the node
  }
  const w = worstOf(trigger);
  if (w) {
    const wv = worst?.val;
    const pct = wv != null && Math.round(wv) === w.pct ? { src: worst!.src, val: wv } : { src: trigSrc };
    return {
      value: [{ t: String(Math.abs(w.pct)), ...pct }, "\u00a0% at ", { t: w.at, src: trigSrc }],
      sub: [`forecast on ${nice(w.tf)}` + (w.others > 0 ? " and more" : "")],
    };
  }
  const tg = s.autopilot?.target;
  if (tg?.worst)
    return {
      value: [
        { t: String(Math.round(Math.abs(tg.worst_pct))), src: "state/autopilot/target/worst_pct", val: tg.worst_pct },
        "\u00a0% at ",
        { t: hhmm(tg.worst_at_h), src: "state/autopilot/target/worst_at_h" },
      ],
      sub: [`forecast on ${nice(tg.worst)}`],
    };
  return { value: ["Every street"], sub: ["watched all the time"] };
}

/** How long the AI took for its plan, in seconds (the model name goes in the small line). */
const thinks = (ms: number | null | undefined, src: string): Part[] =>
  ms ? ["AI plan in ", { t: (ms / 1000).toFixed(1), src, val: ms, scale: 0.001 }, "\u00a0s"] : ["AI plan"];

/** The plan in plain words, after the model's name. */
const PLAN_WORDS: Record<string, string> = {
  SUPPORT: "run on batteries",
  ABSORB: "store the sun",
  RELEASE: "end the signal",
  PREPARE: "fill batteries first",
  STRETCH: "ration the batteries",
  RECOVER: "refill slowly",
  NONE: "no action needed",
};
const planSub = (mode: string | null | undefined): Part[] => [mode ? `DeepSeek: ${PLAN_WORDS[mode] ?? modeTitle(mode).toLowerCase()}` : "DeepSeek"];

/** The box the guard checked: "at most 3 kW a home", or with its end "3 kW a home until 22:44" (the limited time). */
function capParts(fields: Record<string, number | null> | null | undefined, base: string, until?: Part[] | null): Part[] | null {
  const imp = fields?.import_max_kw;
  const exp = fields?.export_max_kw;
  const lead = until ? [] : ["at most "];
  const tail = until ? [" ", ...until] : [];
  if (imp != null) return [...lead, { t: kwText(imp), src: `${base}/fields/import_max_kw`, val: imp }, "\u00a0kW a home", ...tail];
  if (exp != null) return [...lead, { t: kwText(exp), src: `${base}/fields/export_max_kw`, val: exp }, "\u00a0kW out a home", ...tail];
  return null;
}

/** Homes under the segment, each simulated household standing for several real homes. On the street on stage it is
 *  the same count as P2 (useStory streetOf); elsewhere the segment's aggregate, with its name. */
function homes(s: State, seg: string | null | undefined, ctx: Ctx): Part[] | null {
  if (seg && seg === ctx.tf && ctx.street?.homes) return [{ t: fmt(ctx.street.homes), src: "derived", from: ctx.street.homesFrom, val: ctx.street.homes }, "\u00a0homes"];
  const a = seg ? s.aggregates?.[seg] : null;
  const r = s.summary?.households ? s.summary.houses / s.summary.households : 1;
  if (!a || !a.online) return null;
  const where = seg && seg !== ctx.tf ? ` on ${nice(seg)}` : "";
  return [{ t: fmt(Math.round(a.online * r)), src: `state/aggregates/${seg}/online`, val: a.online, scale: r }, `\u00a0homes${where}`];
}

interface Ctx {
  tf: string;
  path: string[];
  street: Street | null;
}

/** What the card shows: the steps, plus the grid node the decision is about and its grid time (history decisions). */
interface View {
  steps: Step[];
  key: string;
  busy: boolean;
  here: boolean;
  seg?: string | null;
  at?: Num | null;
}

function stepsFor(s: State, ctx: Ctx): View {
  const ap = s.autopilot;
  const on = (seg: string | null | undefined, hot?: string[] | null) => (!!seg && ctx.path.includes(seg)) || !!hot?.includes(ctx.tf);
  const mk = (nodes: Node[], rows: [Part[], Part[] | null][], seal: number | null = null): Step[] =>
    rows.map(([value, sub], i) => ({ name: NAMES[i], node: nodes[i], value, sub, seal: i === 3 ? seal : null }));

  if (!ap || ap.mode === "off")
    return {
      key: "off",
      busy: false,
      here: true,
      steps: mk(["waiting", "waiting", "waiting", "waiting"], [
        [["Autopilot off"], ["a person is in charge"]],
        [["Resting"], null],
        [["Standing by"], null],
        [["Nothing sent"], null],
      ]),
    };

  // Live: the autopilot works right now.
  if (ap.busy && ap.stage in STAGE_INDEX) {
    const k = STAGE_INDEX[ap.stage];
    const nodes = NAMES.map((_, i) => (i < k ? "done" : i === k ? "active" : "waiting")) as Node[];
    const see = sees(s, ap.last_trigger, "state/autopilot/last_trigger", { src: "state/autopilot/target/worst_pct", val: ap.target?.worst_pct });
    return {
      key: `busy-${ap.stage}-${ap.last_run}`,
      busy: true,
      here: on(ap.target?.node, ap.target?.hot),
      seg: ap.target?.node ?? null,
      steps: mk(nodes, [
        [see.value, see.sub],
        [["AI plan"], [k === 1 ? "DeepSeek is thinking" : k > 1 ? "DeepSeek answered" : "next"]],
        k > 2 ? [["Guard passed"], ["every safety rule held"]] : k === 2 ? [["Checking"], ["the safety rules"]] : [["Guard"], ["next"]],
        k === 3 ? [["Signing"], ["the signal for every home"]] : [["Nothing yet"], null],
      ]),
    };
  }

  // A proposal waits for a person.
  const pend = ap.pending;
  if (pend && !pend.error) {
    const base = "state/autopilot/pending";
    const guardOk = !pend.guard;
    const see = pend.situation ? sees(s, pend.situation, `${base}/situation`) : sees(s, ap.last_trigger, "state/autopilot/last_trigger");
    return {
      key: `pending-${pend.at ?? ""}`,
      busy: false,
      here: on(pend.segment),
      seg: pend.segment ?? null,
      steps: mk(["done", "done", guardOk ? "done" : "refused", guardOk ? "human" : "waiting"], [
        [see.value, see.sub],
        [thinks(pend.latency_ms, `${base}/latency_ms`), planSub(pend.mode)],
        guardOk
          ? [["Guard passed"], capParts(pend.fields, base) ?? ["every safety rule held"]]
          : [["Guard refused"], [{ t: plainReason(pend.guard, pend.mode) ?? "", src: `${base}/guard` }]],
        guardOk
          ? [["Waiting for a human OK"], [pend.segment ? `for ${nice(pend.segment)}` : "before anything is sent"]]
          : [["Nothing sent"], null],
      ]),
    };
  }

  // The newest decision for the street on stage (its segment covers it or it named the street hot), else the newest one
  // anywhere, labelled city-wide by the card's title.
  const hist = ap.history ?? [];
  let i = hist.findIndex((x) => on(x.segment, x.hot));
  const here = i >= 0;
  if (!here) i = 0;
  const d = hist[i];
  if (!d) {
    const see = sees(s, ap.last_trigger, "state/autopilot/last_trigger");
    return {
      key: "watch",
      busy: false,
      here: true,
      steps: mk(["active", "waiting", "waiting", "waiting"], [[see.value, see.sub], [["AI plan"], ["next"]], [["Guard"], ["next"]], [["Nothing yet"], null]]),
    };
  }

  const base = `state/autopilot/history/${i}`;
  const key = `d-${d.at}-${d.verdict}`;
  const see = sees(s, d.trigger, `${base}/trigger`, { src: `${base}/worst_pct`, val: d.worst_pct });
  const seeRow: [Part[], Part[] | null] = [see.value, see.sub];
  const think: [Part[], Part[] | null] = [thinks(d.latency_ms, `${base}/latency_ms`), planSub(d.mode)];
  const until: Part[] | null =
    d.duration_min && d.mode !== "RELEASE" ? ["until ", { t: hhmm(d.sim_h + d.duration_min / 60), src: `${base}/sim_h` }] : null;
  const passed: [Part[], Part[] | null] = [["Guard passed"], capParts(d.fields, base, until) ?? ["every safety rule held"]];
  const reason = (t: string | null | undefined): Part[] | null => (t ? [{ t, src: `${base}/detail` }] : null);
  const nothing: [Part[], Part[] | null] = [["Nothing sent"], null];
  const at: Num | null = Number.isFinite(d.sim_h) ? { t: hhmm(d.sim_h), src: `${base}/sim_h` } : null;
  const out = (nodes: Node[], rows: [Part[], Part[] | null][], seal: number | null = null): View => ({
    key,
    busy: false,
    here,
    seg: d.segment,
    at,
    steps: mk(nodes, rows, seal),
  });

  switch (d.verdict) {
    case "sent": {
      if (d.mode === "RELEASE") {
        // The release ends a signal: name the signal it ended (the one P1 reads in state/recent), not the release's own seq.
        const ended = Object.entries(s.recent ?? {}).find(([, r]) => d.seq != null && r.ended === `released by seq ${d.seq}`);
        const sub: Part[] = ended
          ? ["#", { t: String(ended[1].seq), src: `state/recent/${ended[0]}/seq`, val: ended[1].seq }, ", owners decide"]
          : ["owners decide again"];
        // Say what was over: the solar surplus (an ABSORB ended) or the peak, not a generic past tense.
        const was = ended?.[1].mode;
        const over = was === "ABSORB" ? "Solar surplus over" : was ? "Peak over" : null;
        const row: [Part[], Part[] | null] = over && see.value.length === 1 && see.value[0] === "Event over" ? [[over], see.sub] : seeRow;
        return out(["done", "done", "done", "done"], [row, think, passed, [["Signal ended"], sub]], d.seq);
      }
      // "#1217 to 192 homes": the signed message and who got it (its end sits under Checks).
      const to = homes(s, d.segment, ctx);
      const sub: Part[] | null = d.seq != null ? ["#", { t: String(d.seq), src: `${base}/seq`, val: d.seq }, ...(to ? [" to ", ...to] : [])] : to;
      return out(["done", "done", "done", "done"], [seeRow, think, passed, [["Signed and sent"], sub]], d.seq);
    }
    case "refused":
      return out(["done", "done", "refused", "waiting"], [seeRow, think, [["Guard refused"], reason(plainReason(d.detail, d.mode))], nothing]);
    case "held":
      return out(["done", "done", "refused", "waiting"], [seeRow, think, [["Held back"], reason(plainReason(d.detail, d.mode))], nothing]);
    case "none":
      return out(["done", "done", "waiting", "waiting"], [seeRow, [think[0], ["no action needed"]], [["Nothing to check"], null], nothing]);
    case "error":
      return out(["done", "done", "waiting", "waiting"], [seeRow, [["AI plan"], ["DeepSeek gave no answer in time"]], [["Nothing to check"], null], nothing]);
    case "pending":
      return out(["done", "done", "done", "human"], [seeRow, think, passed, [["Waiting for a human OK"], d.mode ? [modeTitle(d.mode)] : null]]);
    case "rejected":
      return out(["done", "done", "done", "done"], [seeRow, think, passed, [["Declined"], ["a person said no"]]]);
    case "expired":
      return out(["done", "done", "done", "waiting"], [seeRow, think, passed, [["Expired"], ["nobody approved in time"]]]);
  }
  return out(["done", "waiting", "waiting", "waiting"], [seeRow, [["AI plan"], ["next"]], [["Guard"], ["next"]], [["Nothing yet"], null]]);
}

/** Text and tagged numbers of one line. */
function Parts({ parts }: { parts: Part[] }) {
  return (
    <>
      {parts.map((p, i) =>
        typeof p === "string" ? (
          <span key={i}>{p}</span>
        ) : (
          <span
            key={i}
            data-src={p.src}
            data-from={p.from}
            data-val={p.val != null ? String(p.val) : undefined}
            data-scale={p.scale != null && p.scale !== 1 ? String(p.scale) : undefined}
            data-label={p.label}
          >
            {p.t}
          </span>
        ),
      )}
    </>
  );
}

/** Green check that draws itself when a new signed message goes out (the signed-and-sent moment). */
function SealCheck({ play }: { play: boolean }) {
  return (
    <motion.svg
      viewBox="0 0 28 28"
      className="gzAi-icon"
      initial={play ? { scale: 0.6, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.35, ease: EASE }}
      aria-hidden
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
        transition={{ duration: 0.45, delay: play ? 0.25 : 0, ease: EASE }}
      />
    </motion.svg>
  );
}

/** The step's node on the track: check, cross, or a ring (ink while working, orange while a person is asked). */
function StepNode({ node, seal, fresh, pulse }: { node: Node; seal: boolean; fresh: boolean; pulse: boolean }) {
  return (
    <span className="gzAi-node" aria-hidden>
      {node === "done" ? (
        seal ? (
          <SealCheck play={fresh} />
        ) : (
          <CheckCircle weight="fill" className="gzAi-icon" color={P.green} />
        )
      ) : node === "refused" ? (
        <XCircle weight="fill" className="gzAi-icon" color={P.red} />
      ) : (
        <span className="gzAi-ring" style={{ borderColor: node === "active" ? P.ink : node === "human" ? P.orange : "#d2d2d7" }}>
          {pulse && (
            <motion.span
              className="gzAi-pulse"
              style={{ borderColor: P.ink }}
              initial={{ scale: 1, opacity: 0.6 }}
              animate={{ scale: [1, 1.25, 1], opacity: [0.6, 0.15, 0.6] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
        </span>
      )}
    </span>
  );
}

const CSS = `
.gzAi{container-type:inline-size;position:relative;min-width:0;display:flex;flex-direction:column;gap:.375rem;
  --n:1rem;--v:1.375rem;--s:.9375rem}
.gzAi ol{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:minmax(0,1fr);gap:.5rem 1.25rem}
.gzAi li{position:relative;min-width:0}
.gzAi-head{display:flex;align-items:center;gap:.45em;font-size:var(--n);line-height:1.15;font-weight:600;letter-spacing:.007em}
.gzAi-node{position:relative;display:inline-grid;place-items:center;width:1.15em;height:1.15em;flex:none}
.gzAi-icon{width:1.15em;height:1.15em;display:block}
.gzAi-ring{position:relative;box-sizing:border-box;width:.95em;height:.95em;border-radius:50%;border:2px solid;background:#fff;
  transition:border-color .3s cubic-bezier(0,0,.5,1)}
.gzAi-pulse{position:absolute;inset:-4px;border-radius:50%;border:2px solid}
.gzAi-v{margin:.125rem 0 0;font-size:var(--v);line-height:1.1;font-weight:600;letter-spacing:-.01em;font-variant-numeric:tabular-nums;
  overflow-wrap:anywhere;text-wrap:balance;transition:color .3s cubic-bezier(0,0,.5,1)}
.gzAi-s{margin:0;font-size:var(--s);line-height:1.3;font-weight:400;color:#3a3a3c;letter-spacing:-.016em;overflow-wrap:anywhere}
.gzAi-track{display:none}
.gzAi-title{margin:0;font-size:clamp(1.0625rem,.9rem + .3vw,1.375rem);line-height:1.2;font-weight:600;letter-spacing:-.005em;color:${P.ink};text-wrap:balance}
.gzAi-foot{margin:auto 0 0;font-size:var(--s);line-height:1.25;color:${P.secondary};letter-spacing:-.016em}
@container (min-width:20rem){
  .gzAi ol{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@container (min-width:44rem){
  .gzAi{--n:1.125rem;--v:1.625rem;--s:1rem;gap:1rem}
  .gzAi ol{grid-template-columns:repeat(4,minmax(0,1fr));column-gap:clamp(1rem,2.4cqi,2.5rem)}
  .gzAi-head{flex-direction:column;align-items:flex-start;gap:.5rem}
  .gzAi-node{width:1.4em;height:1.4em}
  .gzAi-icon{width:1.4em;height:1.4em}
  .gzAi-ring{width:1.15em;height:1.15em}
  /* The track: from this node to the next one, under the gap between the columns. */
  .gzAi-track{display:block;position:absolute;top:.7em;left:calc(1.4em + 6px);right:calc(-1 * clamp(1rem,2.4cqi,2.5rem) + 6px);height:2px;
    margin-top:-1px;border-radius:1px;background:${P.fill};font-size:var(--n);overflow:hidden}
  .gzAi-track>span{display:block;height:100%;background:${P.green};transform-origin:left center}
}
`;

/** Sees / Thinks / Checks / Acts card. Props: `st` from useStory. */
export default function AiCard({ st }: { st: StoryState }) {
  const s = st.s;
  const ctx: Ctx | null = s && st.tf ? { tf: st.tf, path: pathOf(s, st.tf), street: st.story?.street ?? null } : null;
  const view = s && ctx ? stepsFor(s, ctx) : null;
  const key = view?.key ?? "";
  const reduced = useReducedMotion();

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
    if (wasBusy || reduced) return; // the live stages already lit the steps
    setShown(0);
    const ids = [1, 2, 3, 4].map((i) => window.setTimeout(() => setShown(i), i * 300));
    return () => ids.forEach(clearTimeout);
  }, [key, reduced]);

  // The check on Acts draws itself only for a seq that appeared while the stage was open.
  const sealSeq = view?.steps[3].seal ?? null;
  const seenSeq = useRef<number | null>(null);
  const [freshSeq, setFreshSeq] = useState<number | null>(null);
  useEffect(() => {
    if (sealSeq == null) return;
    if (seenSeq.current != null && sealSeq !== seenSeq.current) setFreshSeq(sealSeq);
    seenSeq.current = sealSeq;
  }, [sealSeq]);

  const ap = s?.autopilot;
  const foot =
    !ap || ap.mode === "off"
      ? "A person is in charge, the autopilot is off."
      : ap.mode === "propose"
        ? "The autopilot proposes, a person approves."
        : "Autopilot on. A person can take over any time.";

  return (
    <div className="gzAi" aria-label="What the AI does">
      <style>{CSS}</style>
      {view && ctx && (
        <p className="gzAi-title">
          {/* Name the node the decision is about: the street itself, or the substation above it, never the street's
              name over a parent node's decision. A past decision carries its grid time. */}
          {view.here
            ? view.seg && view.seg !== ctx.tf && !view.seg.endsWith(`:${ctx.tf.split(":").pop()}`)
              ? `The AI on ${nice(view.seg)}, above ${nice(ctx.tf)}`
              : `The AI on ${nice(ctx.tf)}`
            : view.busy
              ? `The AI, busy${view.seg ? ` on ${nice(view.seg)}` : " elsewhere in the city"}`
              : `The AI, last decision${view.seg ? ` on ${nice(view.seg)}` : " elsewhere"}`}
          {view.at && !view.busy && (
            <>
              {", "}
              <Parts parts={[view.at]} />
            </>
          )}
        </p>
      )}
      {view ? (
        <ol>
          {view.steps.map((step, i) => {
            // While a replay runs, steps not reached yet wait and the one being revealed works.
            const node: Node = i < shown ? step.node : i === shown && step.node !== "waiting" ? "active" : "waiting";
            const lit = node !== "waiting";
            const next = view.steps[i + 1];
            const nextLit = !!next && i + 1 < shown && next.node !== "waiting";
            return (
              <li key={step.name} aria-current={node === "active" || node === "human" ? "step" : undefined}>
                {i < 3 && (
                  <span className="gzAi-track" aria-hidden>
                    <motion.span
                      initial={false}
                      animate={{ scaleX: node === "done" && nextLit ? 1 : 0 }}
                      transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 120, damping: 20 }}
                    />
                  </span>
                )}
                <div className="gzAi-head" style={{ color: lit ? P.ink : P.tertiary }}>
                  <StepNode
                    node={node}
                    seal={i === 3 && step.seal != null}
                    fresh={i === 3 && step.seal != null && step.seal === freshSeq}
                    pulse={view.busy && node === "active" && !reduced}
                  />
                  <span>{step.name}</span>
                </div>
                <motion.p
                  key={JSON.stringify(step.value)}
                  className="gzAi-v"
                  initial={reduced ? false : { opacity: 0.4 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, ease: EASE }}
                  style={{ color: lit ? P.ink : P.tertiary }}
                >
                  <Parts parts={step.value} />
                </motion.p>
                {step.sub && lit && (
                  <p className="gzAi-s">
                    <Parts parts={step.sub} />
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="gzAi-v" style={{ color: P.tertiary }}>
          Waiting for the autopilot
        </p>
      )}
      <p className="gzAi-foot">{foot}</p>
    </div>
  );
}
