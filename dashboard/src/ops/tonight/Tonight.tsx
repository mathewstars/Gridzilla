// "Tonight": the outcome first (parity-dad.md). What Gridzilla saved and what it did, as live numbers with words, at the
// top of Operations and in the hero of #/demo. Sources: the city's diet plan (/api/flatten?node=region:at), the city
// aggregate (baseline vs total right now), and the feed's counts of today's signals and decisions.
import type { ReactNode } from "react";
import type { State } from "../../api";
import { MODE_WORDS } from "../../model";
import { useFeed } from "../feed/events";
import type { Ops } from "../useOps";
import "./tonight.css";

const mw = (kw: number) => (Math.abs(kw) >= 1000 ? `${(kw / 1000).toFixed(1)} MW` : `${Math.round(kw)} kW`);
const n = (v: number) => Math.round(v).toLocaleString("en-US");

/** A traced number (qa/README.md): `src` is a payload path, or a formula over paths (shown as data-src="derived"). */
function T({ src, from, val, children }: { src?: string; from?: string; val: number; children: ReactNode }) {
  return <span data-src={from ? "derived" : src} data-from={from} data-val={String(val)}>{children}</span>;
}
/** kW or MW, traced; MW carries data-scale 0.001. */
function Pw({ src, from, kw }: { src?: string; from?: string; kw: number }) {
  return (
    <span data-src={from ? "derived" : src} data-from={from} data-val={String(kw)} data-scale={Math.abs(kw) >= 1000 ? "0.001" : undefined}>
      {mw(kw)}
    </span>
  );
}

/** A count this page keeps itself (today's events seen in the feed): no single API field holds it (qa/README.md "page"). */
function Pg({ children }: { children: ReactNode }) {
  return <span data-src="page" data-label="counted by this page from today's feed">{children}</span>;
}

function Stat({ value, label, note, tip }: { value: ReactNode; label: string; note?: ReactNode; tip: string }) {
  return (
    <div className="tn-stat" title={tip}>
      <div className="tn-v">{value}</div>
      <div className="tn-l">{label}</div>
      {note && <div className="tn-n">{note}</div>}
    </div>
  );
}

export default function Tonight({ ops, compact }: { ops: Ops; compact?: boolean }) {
  const s = ops.s as State;
  const feed = useFeed(ops.s, ops.history);
  const plan = ops.city?.enabled ? ops.city.plan : null;
  const root = Object.keys(s.tree).find((k) => !s.tree[k].parent) ?? "";
  const agg = s.aggregates[root];
  const nowOff = agg?.baseline_kw != null && agg?.total_kw != null ? agg.baseline_kw - agg.total_kw : null;
  const tfs = plan?.tfs ?? [];
  const wouldPass = tfs.filter((t) => t.peak_naive_pct > 100).length;
  const keptInside = tfs.filter((t) => t.peak_naive_pct > 100 && t.peak_plan_pct <= 100).length;
  const peakOff = plan ? plan.peak_naive_kw - plan.peak_plan_kw : null;
  const F = "flatten:region:at/plan";
  const A = `state/aggregates/${root}`;
  // houses following = the applied counts of the top-most active signals, scaled from simulated households to homes
  const act = Object.keys(s.active ?? {});
  const top = act.filter((a) => !act.some((m) => m !== a && isUnder(s, a, m)));
  const followFrom = top.length ? `(${top.map((t) => `state/aggregates/${t}/applied`).join(" + ")}) * state/summary/houses / state/summary/households` : "0";

  const saved = [
    peakOff != null && plan && (
      <Stat key="peak" value={<Pw from={`${F}/peak_naive_kw - ${F}/peak_plan_kw`} kw={peakOff} />} label="off the city's evening peak" note={<><Pw src={`${F}/peak_naive_kw`} kw={plan.peak_naive_kw} /> without the plan, <Pw src={`${F}/peak_plan_kw`} kw={plan.peak_plan_kw} /> with it</>}
        tip="Tonight's diet plan for the whole city: the highest load without Gridzilla minus the highest load with it." />
    ),
    nowOff != null && (
      <Stat key="now" value={nowOff >= 0 ? <Pw from={`${A}/baseline_kw - ${A}/total_kw`} kw={nowOff} /> : <Pw from={`${A}/total_kw - ${A}/baseline_kw`} kw={-nowOff} />}
        label={nowOff >= 0 ? "kept off the grid right now" : "added right now: charging moved into the night"} note={<><Pw src={`${A}/baseline_kw`} kw={agg!.baseline_kw!} /> without Gridzilla, <Pw src={`${A}/total_kw`} kw={agg!.total_kw!} /> with</>}
        tip="City-wide, this minute: what the same houses would draw without Gridzilla minus what they draw now." />
    ),
    plan && wouldPass > 0 && (
      <Stat key="kept" value={<><T from={`count(${F}/tfs/*[peak_naive_pct > 100 and peak_plan_pct <= 100])`} val={keptInside}>{keptInside}</T> of <T from={`count(${F}/tfs/*[peak_naive_pct > 100])`} val={wouldPass}>{wouldPass}</T></>} label="streets kept inside their limit" note="that would pass it tonight without the plan"
        tip="Street transformers whose evening peak would go over 100 % of their limit without the diet plan, and how many the plan keeps under it." />
    ),
    plan && (
      <Stat key="moved" value={<T src={`${F}/shifted_kwh`} val={plan.shifted_kwh}>{n(plan.shifted_kwh)} kWh</T>} label="car charging moved into the night" note={<><T src={`${F}/ev_houses`} val={plan.ev_houses}>{n(plan.ev_houses)}</T> cars full by morning{plan.shaved_kwh > 0 && <>, <T src={`${F}/shaved_kwh`} val={plan.shaved_kwh}>{n(plan.shaved_kwh)} kWh</T> from home batteries</>}</>}
        tip="Energy the plan moves out of the evening peak: car charging shifted to the night, plus what home batteries give at the peak." />
    ),
  ].filter(Boolean);

  const last = feed?.lastSigned;
  const lastLine = last ? last.head.map((p) => (typeof p === "string" ? p : MODE_WORDS[p.mode]?.title ?? p.mode)).join("") : null;
  const did = [
    feed && (
      <Stat key="signed" value={<Pg>{n(feed.signals)}</Pg>} label="signals signed today" note={feed.since == null ? <>since <span data-src="axis">00:00</span> grid time</> : "as far back as the platform shares"}
        tip="Signed messages sent to houses today (grid day), not counting diet plan updates." />
    ),
    feed && (
      <Stat key="follow" value={<T from={followFrom} val={feed.following}>{n(feed.following)}</T>} label="houses following a signal now" note={feed.refusals ? <Pg>{feed.refusals} refusals today</Pg> : "no refusals today"}
        tip="Homes under a running signal that answered 'applied' with a signed reply; each simulated household stands for 8 homes." />
    ),
    feed && !compact && (
      <Stat key="ai" value={<Pg>{feed.ai.decisions}</Pg>} label="AI decisions today" note={<Pg>{`${feed.ai.sent} sent, ${feed.ai.refused} stopped by the guard${feed.plans ? `, diet plan renewed ${feed.plans}x` : ""}`}</Pg>}
        tip="Each time the autopilot asked DeepSeek and what happened: sent after the guard's check, or stopped by the guard." />
    ),
  ].filter(Boolean);

  return (
    <section className={`panel tn${compact ? " is-compact" : ""}`} aria-label="Tonight: what Gridzilla saved and what it did">
      <div className="tn-group">
        <h2 className="tn-h">Saved tonight</h2>
        <div className="tn-row">{saved.length ? saved : <span className="tn-wait">Waiting for tonight's plan.</span>}</div>
      </div>
      <div className="tn-group">
        <h2 className="tn-h">What we did</h2>
        <div className="tn-row">{did}</div>
        {!compact && lastLine && (
          <p className="tn-last" title="The newest signed message">
            Last signed: <span data-src="axis">{last!.time}</span> <span data-src="page" data-label="the newest signed event in today's feed">{lastLine}</span>
          </p>
        )}
      </div>
    </section>
  );
}



/** True when node `n` sits below node `m` in the grid tree (same rule as the feed's count). */
function isUnder(s: State, n: string, m: string) {
  for (let c: string | null = s.tree[n]?.parent ?? null; c; c = s.tree[c]?.parent ?? null) if (c === m) return true;
  return false;
}
