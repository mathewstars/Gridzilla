// "Tonight": the outcome first (parity-dad.md). What Gridzilla saved and what it did, as live numbers with words, at the
// top of Operations and in the hero of #/demo. Sources: the city's diet plan (/api/flatten?node=region:at), the city
// aggregate (baseline vs total right now), and the feed's counts of today's signals and decisions.
import type { State } from "../../api";
import { MODE_WORDS } from "../../model";
import { useFeed } from "../feed/events";
import type { Ops } from "../useOps";
import "./tonight.css";

const mw = (kw: number) => (Math.abs(kw) >= 1000 ? `${(kw / 1000).toFixed(1)} MW` : `${Math.round(kw)} kW`);
const n = (v: number) => Math.round(v).toLocaleString("en-US");

function Stat({ value, label, note, tip }: { value: string; label: string; note?: string; tip: string }) {
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

  const saved = [
    peakOff != null && plan && (
      <Stat key="peak" value={mw(peakOff)} label="off the city's evening peak" note={`${mw(plan.peak_naive_kw)} without the plan, ${mw(plan.peak_plan_kw)} with it`}
        tip="Tonight's diet plan for the whole city: the highest load without Gridzilla minus the highest load with it." />
    ),
    nowOff != null && (
      <Stat key="now" value={mw(nowOff)} label="kept off the grid right now" note={`${mw(agg!.baseline_kw!)} without Gridzilla, ${mw(agg!.total_kw!)} with`}
        tip="City-wide, this minute: what the same houses would draw without Gridzilla minus what they draw now." />
    ),
    plan && wouldPass > 0 && (
      <Stat key="kept" value={`${keptInside} of ${wouldPass}`} label="streets kept inside their limit" note="that would pass it tonight without the plan"
        tip="Street transformers whose evening peak would go over 100 % of their limit without the diet plan, and how many the plan keeps under it." />
    ),
    plan && (
      <Stat key="moved" value={`${n(plan.shifted_kwh)} kWh`} label="car charging moved into the night" note={`${n(plan.ev_houses)} cars full by morning${plan.shaved_kwh > 0 ? `, ${n(plan.shaved_kwh)} kWh from home batteries` : ""}`}
        tip="Energy the plan moves out of the evening peak: car charging shifted to the night, plus what home batteries give at the peak." />
    ),
  ].filter(Boolean);

  const last = feed?.lastSigned;
  const lastLine = last ? last.head.map((p) => (typeof p === "string" ? p : MODE_WORDS[p.mode]?.title ?? p.mode)).join("") : null;
  const did = [
    feed && (
      <Stat key="signed" value={`${n(feed.signals)}`} label="signals signed today" note={feed.since == null ? "since 00:00 grid time" : "as far back as the platform shares"}
        tip="Signed messages sent to houses today (grid day), not counting diet plan updates." />
    ),
    feed && (
      <Stat key="follow" value={n(feed.following)} label="houses following a signal now" note={feed.refusals ? `${feed.refusals} refusals today` : "no refusals today"}
        tip="Homes under a running signal that answered 'applied' with a signed reply; each simulated household stands for 8 homes." />
    ),
    feed && !compact && (
      <Stat key="ai" value={`${feed.ai.decisions}`} label="AI decisions today" note={`${feed.ai.sent} sent, ${feed.ai.refused} stopped by the guard${feed.plans ? `, diet plan renewed ${feed.plans}x` : ""}`}
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
            Last signed: {last!.time} {lastLine}
          </p>
        )}
      </div>
    </section>
  );
}


