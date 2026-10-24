// DEMO MODE (demo-mode.md): the console for the 75-second pitch demo and the projector. One transformer's story big (its
// live curve and ring, one sentence of state), the AI's steps and the signals running, the newest three events, and the
// whole city as a strip of coloured dots. Auto-picks the most interesting transformer; Up/Down override it.
// Exported as DemoView for the pitch deck (it runs its own data hook when no console data is passed in).
import { useEffect, useMemo, useState } from "react";
import { post, type FlattenPlan, type State } from "../../api";
import { hhmm, nice } from "../../model";
import LiveCurve from "../../stage/kit/LiveCurve";
import LoadRing from "../../stage/kit/LoadRing";
import AiSteps from "../../stage/kit/AiSteps";
import { ActiveList } from "../control/SignalCard";
import { Btn, Result, useAction } from "../control/ui";
import FeedStrip from "../now/FeedStrip";
import { cellOf, cityGroups } from "../city/cityData";
import { loadTone } from "../../stage/palette";
import { useOps, type Ops } from "../useOps";
import "../control/control.css";
import "./demo.css";

export function DemoView({ ops }: { ops?: Ops }) {
  return ops ? <Demo ops={ops} /> : <OwnData />;
}
export default DemoView;

function OwnData() {
  const ops = useOps();
  return ops.s ? <Demo ops={ops} /> : <div className="demo-wait">Connecting to the grid.</div>;
}

/** Transformers by how interesting they are now: the autopilot's target first, then the highest forecast peak. */
function ranked(s: State): string[] {
  const tfs = Object.keys(s.tree).filter((n) => n.startsWith("tf:"));
  const score = (t: string) => Math.abs(s.forecast_peak?.[t]?.pct ?? s.aggregates[t]?.load_pct ?? 0);
  const target = s.autopilot?.target?.worst;
  return tfs.sort((a, b) => (b === target ? 1 : 0) - (a === target ? 1 : 0) || score(b) - score(a));
}

function Demo({ ops }: { ops: Ops }) {
  const s = ops.s as State;
  const order = useMemo(() => ranked(s), [s]);
  const [manual, setManual] = useState<string | null>(null);
  const auto = order[0] ?? "";
  const tf = manual && s.tree[manual] ? manual : auto;
  // keep the console's data hook on the transformer this view shows (history, plan)
  useEffect(() => {
    if (tf && tf !== ops.tf) ops.select(tf);
  }, [tf, ops]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      const i = order.indexOf(tf);
      setManual(order[(i + (e.key === "ArrowDown" ? 1 : order.length - 1)) % order.length]);
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [order, tf]);

  return (
    <div className="demo">
      <div className="demo-left">
        <Hero ops={ops} tf={tf} />
        <FeedStrip ops={ops} />
      </div>
      <div className="demo-right">
        <NowCard ops={ops} />
      </div>
      <CityDots s={s} ops={ops} selected={tf} onPick={setManual} />
    </div>
  );
}

/** One sentence of state: what is coming and what Gridzilla does about it. */
function sentence(s: State, tf: string, plan: FlattenPlan | null): string {
  const name = nice(tf);
  const peak = s.forecast_peak?.[tf];
  const sig = cellOf(s, tf, null).signal;
  if (plan) {
    let i = 0;
    plan.naive_kw.forEach((v, j) => (Math.abs(v) > Math.abs(plan.naive_kw[i]) ? (i = j) : 0));
    const at = hhmm(plan.hours[i] ?? plan.start_h);
    const moved = Math.round(plan.peak_naive_kw - plan.peak_plan_kw);
    if (plan.peak_naive_pct >= 85 && moved > 0) return `Peak coming at ${at}: ${plan.peak_naive_pct} % of the limit. Gridzilla is moving ${moved} kW to keep ${name} at ${plan.peak_plan_pct} %.`;
  }
  if (sig) return `Gridzilla is holding ${name} inside its limit until ${hhmm(s.sim_hour + (Date.parse(sig.valid_to) - Date.parse(s.now)) / 3_600_000 * (s.autopilot?.sim_x ?? 60))}.`;
  if (peak && Math.abs(peak.pct) >= 85) return `${name} is heading to ${Math.abs(peak.pct)} % at ${hhmm(peak.h)}. Gridzilla is watching.`;
  return `${name} is inside its limit. The houses run on their own.`;
}

function Hero({ ops, tf }: { ops: Ops; tf: string }) {
  const s = ops.s as State;
  const c = cellOf(s, tf, null);
  const plan = ops.plan && ops.plan.enabled && ops.plan.plan && ops.plan.plan.tf === tf ? ops.plan.plan : null;
  const feeder = s.tree[tf]?.parent ?? "";
  const ready = !!(ops.history?.nodes && tf in ops.history.nodes);
  return (
    <section className="panel demo-hero">
      <header className="demo-hero-head">
        <div>
          <h1 className="demo-name">{nice(tf)}</h1>
          <p className="demo-where">{nice(feeder)} street transformer · limit {c.limit == null ? "–" : `${Math.round(c.limit)} kW`}</p>
        </div>
        <p className="demo-sentence">{sentence(s, tf, plan)}</p>
      </header>
      <div className="demo-hero-body">
        <div className="demo-curve">
          {ready ? (
            <LiveCurve key={tf} stage s={s} history={ops.history} node={tf} header={false} plan={plan} signal={c.signal} ground="var(--color-card)" height="100%" span={{ past: 6, future: 12, narrow: { past: 3, future: 6 } }} legend="above" minPlot="12rem" planSrc={`flatten:${tf}`} />
          ) : (
            <p className="demo-wait">Loading the last 6 hours of {nice(tf)}</p>
          )}
        </div>
        <div className="demo-ring" style={{ color: loadTone(c.pct) }}>
          <LoadRing pct={c.pct} size={400} />
        </div>
      </div>
    </section>
  );
}

function NowCard({ ops }: { ops: Ops }) {
  const s = ops.s as State;
  const p = s.autopilot?.pending;
  const act = useAction();
  const decide = (d: "approve" | "reject") =>
    act.run(d, async () => {
      await post(`autopilot/${d}`);
      ops.reload();
      return d === "approve" ? "Approved: signed and sent." : "Rejected: nothing was sent.";
    });
  return (
    <section className="panel demo-now" data-scroll="panel">
      <h2 className="demo-h2">Now</h2>
      <AiSteps s={s} weather={ops.weather} variant="row" />
      {p && (
        <div className="demo-pending">
          <p className="demo-pending-q">The AI asks: {p.mode} on {nice(p.segment)}. Send it?</p>
          <div className="demo-pending-b">
            <Btn tone="primary" busy={act.busy === "approve"} disabled={!!act.busy} onClick={() => decide("approve")}>Approve</Btn>
            <Btn busy={act.busy === "reject"} disabled={!!act.busy} onClick={() => decide("reject")}>Reject</Btn>
          </div>
          <Result out={act.out} />
        </div>
      )}
      <h3 className="demo-h3">Signals running</h3>
      <ActiveList ops={ops} />
    </section>
  );
}

/** The whole city as dots, grouped by substation: colour only, the number on hover / tap. */
function CityDots({ s, ops, selected, onPick }: { s: State; ops: Ops; selected: string; onPick: (tf: string) => void }) {
  const groups = cityGroups(s, ops.city);
  return (
    <section className="panel demo-city" aria-label="Every street transformer in the city">
      {groups.map((g) => (
        <div key={g.id} className="demo-sub">
          <span className="demo-sub-name">{nice(g.id)}</span>
          <span className="demo-dots">
            {g.feeders.flatMap((f) => f.tfs).map((c) => {
              const p = c.pct == null ? null : Math.round(c.pct);
              const words = p == null ? "no reading" : `${p < 0 ? "exporting" : "taking"} ${Math.abs(p)} % of its limit`;
              return (
                <button key={c.id} type="button" className={`demo-dot${c.id === selected ? " is-sel" : ""}`} style={{ background: loadTone(c.pct) }} title={`${nice(c.id)}: ${words}`} aria-label={`${nice(c.id)}, ${words}`} onClick={() => onPick(c.id)} />
              );
            })}
          </span>
        </div>
      ))}
    </section>
  );
}
