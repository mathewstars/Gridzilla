// Fail-safe card: stop the platform's signed heartbeat to show what the houses do when the operator disappears.
// Same calls as the team board's "Fail-safe demo" buttons.
import { post, type State } from "../../api";
import type { Ops } from "../useOps";
import { Btn, Card, Result, useAction } from "./ui";
import { tip } from "../views/fmt";

export default function FailSafeCard({ ops }: { ops: Ops }) {
  const s = ops.s as State;
  const act = useAction();
  const paused = s.hb_paused;
  const homes = s.summary?.households ?? Object.keys(s.households ?? {}).length;
  const hbS = Number(s.policy?.heartbeat_s ?? 30);

  const go = (action: "pause" | "resume") =>
    act.run(action, async () => {
      await post(`heartbeat/${action}`);
      ops.reload();
      return action === "pause"
        ? `Heartbeat stopped. ${homes} homes will drop back to owner mode within two minutes.`
        : "Heartbeat back. Houses follow signals again from the next beat.";
    });

  return (
    <Card
      title="Fail-safe"
      code="heartbeat"
      className={paused ? "cp-card-alert" : ""}
      aside={
        <span className={`cp-chip ${paused ? "is-err" : "is-on"}`} {...tip(paused ? "The platform's signed heartbeat is stopped, so houses ignore signals and run on their owners' settings" : `The platform sends a signed "I am alive" message every ${hbS} s; without it houses go back to owner mode`)}>
          <span className="cp-dot" aria-hidden />
          {paused ? "Heartbeat stopped" : `Heartbeat every ${hbS} s`}
        </span>
      }
    >
      <p className="cp-why">
        {paused
          ? "The operator is dark. Every house has stopped trusting old signals and runs on its owner's settings again."
          : "Simulate an outage: stop the signed heartbeat and every house goes back to owner mode within two minutes, no signal needed."}
      </p>
      <div className="cp-actions">
        {paused ? (
          <Btn tone="primary" busy={act.busy === "resume"} disabled={!!act.busy} onClick={() => go("resume")}>Resume heartbeat</Btn>
        ) : (
          <Btn tone="danger" busy={act.busy === "pause"} disabled={!!act.busy} onClick={() => go("pause")}>Pause heartbeat</Btn>
        )}
        <span className="cp-sub">{paused ? "Resume brings the platform back." : `${homes} homes listen for it.`}</span>
      </div>
      <Result out={act.out} />
    </Card>
  );
}
