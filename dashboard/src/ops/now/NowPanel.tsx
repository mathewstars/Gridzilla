// The one NOW panel (two-column hierarchy): what the grid operator needs this minute. The autopilot (its waiting
// proposal with Approve / Reject, target, next look), the signals running now (countdown, Release), and the button that
// opens the composer drawer. Everything else lives one click away.
import { useState } from "react";
import { PaperPlaneTilt } from "@phosphor-icons/react";
import type { Ops } from "../useOps";
import AiCard from "../control/AiCard";
import { ActiveList } from "../control/SignalCard";
import Drawer from "./Drawer";
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
        <h2 className="now-title">Now</h2>
        <button type="button" className="btn btn-primary now-new" onClick={() => setCompose(true)}>
          <PaperPlaneTilt size={14} weight="bold" aria-hidden />
          New signal
        </button>
      </header>
      <div className="now-sec">
        <AiCard ops={ops} />
      </div>
      <div className="now-sec">
        <div className="now-sub">
          <span>Signals running</span>
          <span className="now-count">{n}</span>
        </div>
        <ActiveList ops={ops} />
      </div>
      <Drawer open={compose} onClose={() => setCompose(false)} ops={ops} />
    </section>
  );
}
