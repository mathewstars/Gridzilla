// CONTROL PLANE (ops.md, right column): the autopilot and its waiting proposal, the signals running now plus the
// composer, and the fail-safe. Every button calls the same endpoint with the same body as the team board.
import type { Ops } from "../useOps";
import AiCard from "../control/AiCard";
import SignalCard from "../control/SignalCard";
import FailSafeCard from "../control/FailSafeCard";
import "../control/control.css";

export default function ControlColumn({ ops }: { ops: Ops }) {
  if (!ops.s) return null;
  return (
    <div className="cp-col">
      <AiCard ops={ops} />
      <SignalCard ops={ops} />
      <FailSafeCard ops={ops} />
    </div>
  );
}
