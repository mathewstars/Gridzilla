// DEMO MODE (demo-mode.md): the console for the 75-second pitch demo and the projector. One transformer's story big (its
// live curve and ring, one sentence of state), the AI's steps and the signals running, the newest three events, and the
// whole city as a strip of coloured dots. Auto-picks the most interesting transformer; Up/Down override it.
// Exported as DemoView for the pitch deck (it runs its own data hook when no console data is passed in).
import { useEffect, useState, type ReactNode } from "react";
import { post, type FlattenPlan, type State } from "../../api";
import { hhmm, nice } from "../../model";
import LiveCurve, { WaitLegend } from "../../stage/kit/LiveCurve";
import LoadRing from "../../stage/kit/LoadRing";
import AiSteps from "../../stage/kit/AiSteps";
import { ActiveList } from "../control/SignalCard";
import { Btn, Result, useAction, useNow } from "../control/ui";
import FeedStrip from "../now/FeedStrip";
import Tonight from "../tonight/Tonight";
import BlatnicaLive, { PlantHero } from "./BlatnicaLive";
import { useLiveBlatnica } from "./live";
import { cellOf } from "../city/cityData";
import CityDots from "../ops2/Dots";
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
  // standalone (the pitch deck embeds DemoView full-bleed): it fills the viewport itself
  return <div className="demo-standalone">{ops.s ? <Demo ops={ops} /> : <div className="demo-wait">Connecting to the grid.</div>}</div>;
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
  // Picked ONCE at load (the autopilot's target, else the highest forecast peak) and then held: a re-ranking never moves
  // the view. Only Up/Down (through the order as it was at load) or a click on a city dot changes it.
  const [order] = useState(() => ranked(s));
  const [picked, setPicked] = useState(() => order[0] ?? "");
  const tf = s.tree[picked] ? picked : (order.find((t) => s.tree[t]) ?? "");
  // keep the console's data hook on the transformer this view shows (history, plan)
  useEffect(() => {
    if (tf && tf !== ops.tf) ops.select(tf);
  }, [tf, ops]);
  // Blatnica mode: the real plant in the hero. In: key B or a click on the Blatnica card; out: B again, Up/Down or a
  // city dot. Nothing switches by itself. ?hero=blatnica opens the demo in it (the gates, a deck link).
  const plant = useLiveBlatnica();
  const [showPlant, setShowPlant] = useState(() => new URLSearchParams(location.search).get("hero") === "blatnica");
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        setShowPlant((v) => !v);
        return;
      }
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      if (showPlant) return setShowPlant(false); // back to the transformer that was showing
      if (!order.length) return;
      const i = Math.max(0, order.indexOf(tf));
      setPicked(order[(i + (e.key === "ArrowDown" ? 1 : order.length - 1)) % order.length]);
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [order, tf, showPlant]);

  return (
    <div className="demo">
      <div className="demo-left">
        <Tonight ops={ops} compact />
        {showPlant ? <PlantHero plant={plant} /> : <Hero ops={ops} tf={tf} />}
        <FeedStrip ops={ops} />
      </div>
      <div className="demo-right">
        <NowCard ops={ops} />
        <BlatnicaLive plant={plant} open={showPlant} onOpen={() => setShowPlant(true)} />
      </div>
      <CityDots s={s} ops={ops} selected={showPlant ? "" : tf} onPick={(n) => { setPicked(n); setShowPlant(false); }} />
    </div>
  );
}

/** A number in running text, tagged for the data-truth gate (qa/README.md). */
function N({ src, from, val, children }: { src: string; from?: string; val?: number; children: ReactNode }) {
  return (
    <span data-src={src} data-from={from} data-val={val == null ? undefined : String(val)}>
      {children}
    </span>
  );
}

/** One sentence of state: what is coming and what Gridzilla does about it. Every number in it is tagged. */
function sentence(s: State, tf: string, plan: FlattenPlan | null): ReactNode {
  const name = nice(tf);
  const peak = s.forecast_peak?.[tf];
  const sig = cellOf(s, tf, null).signal;
  if (plan) {
    // the plan runs 24 h from now in 15-minute slots and wraps past midnight: prefer the peak of the next 12 hours,
    // and say "tomorrow" when the peak it talks about falls after midnight
    const slots = plan.naive_kw.length;
    const near = Math.min(slots, 48);
    const peakIn = (n: number) => {
      let i = 0;
      for (let j = 0; j < n; j++) if (Math.abs(plan.naive_kw[j]) > Math.abs(plan.naive_kw[i])) i = j;
      return i;
    };
    const lim = plan.rating_kw || 1;
    let i = peakIn(near);
    if (Math.abs(plan.naive_kw[i]) / lim < 0.85) i = peakIn(slots);
    const naive = Math.abs(plan.naive_kw[i]);
    const planned = Math.abs(plan.planned_kw[i]);
    const naivePct = Math.round((100 * naive) / lim);
    const planPct = Math.round((100 * planned) / lim);
    const moved = Math.round(naive - planned);
    const hour = plan.hours[i] ?? plan.start_h;
    const tomorrow = (s.sim_hour % 24) + i * 0.25 >= 24;
    const P = `flatten:${tf}/plan`;
    if (naivePct >= 85 && moved > 0)
      return (
        <>
          Peak coming {tomorrow ? "tomorrow at " : "at "}
          <N src="axis">{hhmm(hour)}</N>: <N src="derived" from={`${P}/naive_kw/${i} / ${P}/rating_kw * 100`} val={(100 * plan.naive_kw[i]) / lim}>{naivePct} %</N> of the limit.
          Gridzilla is moving <N src="derived" from={`${P}/naive_kw/${i} - ${P}/planned_kw/${i}`} val={plan.naive_kw[i] - plan.planned_kw[i]}>{moved} kW</N> to keep {name} at{" "}
          <N src="derived" from={`${P}/planned_kw/${i} / ${P}/rating_kw * 100`} val={(100 * plan.planned_kw[i]) / lim}>{planPct} %</N>.
        </>
      );
  }
  if (sig)
    return (
      <>
        Gridzilla is holding {name} inside its limit until{" "}
        <N src="axis">{hhmm(s.sim_hour + ((Date.parse(sig.valid_to) - Date.parse(s.now)) / 3_600_000) * (s.autopilot?.sim_x ?? 60))}</N>.
      </>
    );
  if (peak && Math.abs(peak.pct) >= 85)
    return (
      <>
        {name} is heading to <N src={`state/forecast_peak/${tf}/pct`} val={peak.pct}>{Math.abs(peak.pct)} %</N> at <N src="axis">{hhmm(peak.h)}</N>. Gridzilla is
        watching.
      </>
    );
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
          <p className="demo-where">
            {nice(feeder)} street transformer · limit{" "}
            {c.limit == null ? "–" : <N src={`state/aggregates/${tf}/rating_kw`} val={c.limit}>{Math.round(c.limit)} kW</N>}
          </p>
        </div>
        <p className="demo-sentence">{sentence(s, tf, plan)}</p>
      </header>
      <div className="demo-hero-body">
        <div className="demo-curve">
          {ready ? (
            <LiveCurve key={tf} stage s={s} history={ops.history} node={tf} header={false} plan={plan} signal={c.signal} ground="var(--color-card)" height="100%" span={{ past: 6, future: 12, narrow: { past: 3, future: 6 } }} legend="above" minPlot="var(--demo-plot-min, 12rem)" planSrc={`flatten:${tf}`} />
          ) : (
            <>
              <WaitLegend />
              <p className="demo-wait">Loading the last few hours of {nice(tf)}</p>
            </>
          )}
        </div>
        <div className="demo-ring" style={{ color: loadTone(c.pct) }} data-src={`state/aggregates/${tf}/load_pct`} data-val={c.pct == null ? undefined : String(c.pct)}>
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
      <h2 className="demo-h2 demo-now-head">
        Now <ReviewIn s={s} />
      </h2>
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
      {/* the projector shows the two newest; the rest are one line, so the panel never runs off the screen */}
      <div className="demo-sigs">
        <ActiveList ops={ops} />
      </div>
      {Object.keys(s.active).length > 2 && (
        <p className="demo-more">
          and <N src="derived" from="count(state/active/*) - 2" val={Object.keys(s.active).length - 2}>{Object.keys(s.active).length - 2}</N> more running (all of them in Operations)
        </p>
      )}
    </section>
  );
}



/** "next advisor review in N s · autonomous", counting down every second (autopilot.last_run + interval_s). */
function ReviewIn({ s }: { s: State }) {
  const now = useNow();
  const ap = s.autopilot;
  if (!ap) return null;
  const mode = ap.mode === "auto" ? "autonomous" : ap.mode === "propose" ? "operator approves" : "off";
  let text: ReactNode;
  if (ap.mode === "off") text = "autopilot off";
  else if (ap.busy) text = "reviewing now";
  else if (ap.last_run && ap.interval_s) {
    const left = Math.max(0, Math.ceil((Date.parse(ap.last_run) + ap.interval_s * 1000 - now) / 1000));
    text = (
      <>
        next advisor review in <span data-src="state/autopilot/last_run">{left} s</span>
      </>
    );
  } else text = "first review soon";
  return (
    <span className="demo-review">
      {text} · {mode}
    </span>
  );
}
