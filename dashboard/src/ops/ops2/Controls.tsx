// One slim controls panel: the AI's waiting proposal (Approve / Reject), "New signal" (the composer drawer), dad's
// heartbeat pill (Houses connected / Operator dark) with Pause / Resume, and how many signals run with the soonest end.
// In read-only live mode every button is off and says so (Btn + post handle it).
import { useState } from "react";
import { PaperPlaneTilt } from "@phosphor-icons/react";
import { post, READ_ONLY, READ_ONLY_TEXT, type State } from "../../api";
import { nice } from "../../model";
import { modeTitle } from "../../components/brain/plain";
import { Btn, Result, clock, useAction, useNow } from "../control/ui";
import Drawer from "../now/Drawer";
import type { Ops } from "../useOps";
import "../control/control.css";
import "../now/now.css";
import "./controls.css";

export default function Controls({ ops }: { ops: Ops }) {
  const s = ops.s as State;
  const ap = s.autopilot;
  const p = ap.pending;
  const now = useNow();
  const act = useAction();
  const [compose, setCompose] = useState(false);
  const dark = s.hb_paused;

  const decide = (d: "approve" | "reject") =>
    act.run(d, async () => {
      const r = (await post(`autopilot/${d}`)) as { seq?: number };
      ops.reload();
      return d === "reject" ? `Rejected. Nothing was sent to ${nice(p?.segment)}.` : `Signed #${r.seq} and sent to ${nice(p?.segment)}.`;
    }, (m) => (m === "nothing pending" ? "That proposal is gone already: it expired or was decided." : `Not sent: ${m}`));

  const beat = () =>
    act.run("hb", async () => {
      await post(`heartbeat/${dark ? "resume" : "pause"}`);
      ops.reload();
      return dark ? "Resumed. Houses accept signals again." : "Paused. Houses fall back to their owners within about 2 minutes.";
    });

  const act0 = Object.entries(s.active);
  const soon = act0.reduce<[string, number] | null>((a, [n, sig]) => {
    const t = Date.parse(sig.valid_to);
    return !a || t < a[1] ? [n, t] : a;
  }, null);

  return (
    <section className="panel ct" aria-label="Controls">
      <div className="ct-row">
        <span className={`ct-pill${dark ? " is-dark" : ""}`} title={dark ? "The operator's signal is paused: houses fall back to their owners" : "The operator's signal reaches the houses"}>
          <span className="ct-dot" aria-hidden />
          {dark ? "Operator dark" : "Houses connected"}
        </span>
        <Btn small tone={dark ? "primary" : "secondary"} busy={act.busy === "hb"} disabled={!!act.busy} onClick={beat} title={dark ? "Resume: houses accept signals again" : "Pause: show what happens when the grid operator goes dark"}>
          {dark ? "Resume" : "Pause"}
        </Btn>
        <button type="button" className="btn btn-primary cp-btn cp-btn-sm ct-new" onClick={() => setCompose(true)} disabled={READ_ONLY} title={READ_ONLY ? READ_ONLY_TEXT : "Write a signal by hand; the rule check runs before it is signed and sent"}>
          <PaperPlaneTilt size={14} weight="bold" aria-hidden />
          New signal
        </button>
      </div>

      {p && (
        <div className="ct-row ct-prop">
          <div className="ct-text">
            <b>The AI asks:</b> {modeTitle(p.mode)} on {nice(p.segment)}
            {p.guard ? <span className="ct-red">, the rules say no</span> : null}
          </div>
          <div className="ct-btns">
            <Btn small tone="primary" busy={act.busy === "approve"} disabled={!!act.busy} onClick={() => decide("approve")}>Approve</Btn>
            <Btn small busy={act.busy === "reject"} disabled={!!act.busy} onClick={() => decide("reject")}>Reject</Btn>
          </div>
        </div>
      )}
      <div className="ct-row ct-text">
        <span>
          <b>
            {act0.length === 0 ? "No" : <span data-src="derived" data-from="count(state/active/*)" data-val={act0.length}>{act0.length}</span>} signal{act0.length === 1 ? "" : "s"} running
          </b>
          {soon && (
            <span className="ct-dim">
              , the first ends on {nice(soon[0])} {soon[1] - now > 1000 ? <>in <span data-src={`state/active/${soon[0]}/valid_to`}>{clock(soon[1] - now)}</span></> : "now"}
            </span>
          )}
          {!p && <span className="ct-dim">{ap.mode === "propose" ? ". Nothing waits for your yes" : ap.mode === "auto" ? ". The AI sends by itself, nothing waits for you" : ". Autopilot is off"}</span>}
        </span>
      </div>
      {READ_ONLY && <div className="ct-text ct-dim">Buttons are off: {READ_ONLY_TEXT}</div>}
      <Result out={act.out} />
      <Drawer open={compose} onClose={() => setCompose(false)} ops={ops} />
    </section>
  );
}
