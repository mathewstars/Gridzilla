// The one NOW panel (two-column hierarchy): what the grid operator needs this minute. The autopilot (its waiting
// proposal with Approve / Reject, target, next look), the signals running now (countdown, Release), and the button that
// opens the composer drawer. Everything else lives one click away.
import { useState } from "react";
import { PaperPlaneTilt } from "@phosphor-icons/react";
import { READ_ONLY, READ_ONLY_TEXT } from "../../api";
import type { Ops } from "../useOps";
import AiCard from "../control/AiCard";
import { ActiveList } from "../control/SignalCard";
import Drawer from "./Drawer";
import { tip } from "../views/fmt";
import "../control/control.css";
import "./now.css";

export default function NowPanel({ ops }: { ops: Ops }) {
  const [compose, setCompose] = useState(false);
  const s = ops.s;
  if (!s) return null;
  const n = Object.keys(s.active).length;
  return (
    <section className="panel now">
      <header className="now-head">
        <h2 className="now-title" {...tip("Now: what the AI proposes and which grid signals are running this minute")}>
          Now <span className="now-code">autopilot and signals</span>
        </h2>
        <button type="button" className="btn btn-primary now-new" onClick={() => setCompose(true)} disabled={READ_ONLY} title={READ_ONLY ? READ_ONLY_TEXT : "Write a signal by hand; the guard checks it before it is signed and sent"}>
          <PaperPlaneTilt size={14} weight="bold" aria-hidden />
          New signal
        </button>
      </header>
      <div className="now-sec">
        <AiCard ops={ops} />
      </div>
      <div className="now-sec">
        <div className="now-sub" {...tip("Signals the grid operator has running right now; each ends on its own when its time runs out")}>
          <span>Signals running</span>
          <span className="now-count">{n === 0 ? "none" : `${n} now`}</span>
        </div>
        <ActiveList ops={ops} />
      </div>
      <Drawer open={compose} onClose={() => setCompose(false)} ops={ops} />
    </section>
  );
}
