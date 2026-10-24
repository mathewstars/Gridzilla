// AI card: what the autopilot is looking at, the proposal waiting for the operator (Approve / Reject), when it looks
// again, and which brain decides. Same calls as the team board's Autopilot tab.
import { useState } from "react";
import { post, type Mode, type State } from "../../api";
import { hhmm } from "../../model";
import type { Ops } from "../useOps";
import { Btn, Card, Result, Spark, clock, useAction, useNow } from "./ui";
import { tip } from "../views/fmt";
import { MODE_LABEL, fieldLine, homesUnder, kindWord, segName } from "./modes";

const STAGE: Record<string, string> = { sense: "reading the forecast", deepseek: "asking the AI", guard: "checking the policy guard", send: "signing and sending" };
const VERDICT: Record<string, string> = { sent: "sent", held: "held", refused: "refused by the guard", error: "AI error", none: "nothing to do", pending: "waiting for you", rejected: "rejected", expired: "expired" };

export default function AiCard({ ops }: { ops: Ops }) {
  const s = ops.s as State;
  const ap = s.autopilot;
  const now = useNow();
  const act = useAction();
  const [note, setNote] = useState<string | null>(null);
  const p = ap.pending;
  const t = ap.target;
  const due = ap.last_run ? Date.parse(ap.last_run) + ap.interval_s * 1000 - now : null;
  const last = ap.history?.[0];

  const decide = (d: "approve" | "reject") =>
    act.run(d, async () => {
      const r = (await post(`autopilot/${d}`)) as { seq?: number };
      ops.reload();
      if (d === "reject") return `Rejected ${p?.mode ?? "the proposal"} on ${segName(p?.segment)}. Nothing was sent.`;
      return `Signed #${r.seq} and sent ${p?.mode} to ${homesUnder(s, p?.segment ?? "")} homes on ${segName(p?.segment)}.`;
    }, (m) => (m === "nothing pending" ? "That proposal is gone already (it expired or was decided)." : `Not sent: ${m}`));

  const review = () =>
    act.run("review", async () => {
      await post("autopilot/review");
      ops.reload();
      return "Asked the AI to look again now.";
    });

  const saveNote = () =>
    act.run("note", async () => {
      await post("autopilot", { context: note ?? "" });
      setNote(null);
      ops.reload();
      return note ? "The AI will read your note on its next review." : "Note cleared.";
    });

  const env = p?.envelope ? p.envelope.import_max_kw ?? p.envelope.export_max_kw : null;
  const modeWord = ap.mode === "auto" ? "Auto" : ap.mode === "propose" ? "Propose" : "Off";

  return (
    <Card
      title="Autopilot"
      code="AI"
      aside={
        <span className={`cp-chip ${ap.mode === "off" ? "" : "is-on"}`} {...tip(ap.mode === "off" ? "Autopilot off: the AI only watches, nothing is sent by it" : ap.mode === "auto" ? "Autopilot on Auto: the AI signs and sends signals by itself, within the guard's limits" : "Autopilot on Propose: the AI proposes each signal and waits for your yes")}>
          <span className="cp-dot" aria-hidden />
          {modeWord}
        </span>
      }
    >
      {p ? (
        <div className="cp-proposal">
          <div className="cp-row-between">
            <span className="cp-eyebrow">Waiting for you</span>
            {p.guard ? <span className="cp-tag is-err">guard: {p.guard}</span> : <span className="cp-tag">guard passed</span>}
          </div>
          <div className="cp-prop-main">
            <span className="cp-strong">{MODE_LABEL[p.mode as Mode] ?? p.mode}</span>
            <span className="cp-code">{p.mode}</span>
            <span className="cp-sub">on {segName(p.segment)} · for {p.duration_min} grid min</span>
          </div>
          {fieldLine(p.fields) && <div className="cp-sub">{fieldLine(p.fields)}</div>}
          {p.rationale && <p className="cp-why">{p.rationale}</p>}
          {env && (
            <div className="cp-row-between cp-sub">
              <span {...tip("The allowed box (envelope): the most power each house may take in each time slot while the signal runs")}>Allowed box <span className="cp-code">envelope</span>, {env.length} time slots</span>
              <Spark curve={env} />
            </div>
          )}
          <div className="cp-actions">
            <Btn tone="primary" busy={act.busy === "approve"} disabled={!!act.busy} onClick={() => decide("approve")}>Approve and send</Btn>
            <Btn busy={act.busy === "reject"} disabled={!!act.busy} onClick={() => decide("reject")}>Reject</Btn>
          </div>
        </div>
      ) : (
        <div className="cp-empty">
          {ap.mode === "off" ? "Autopilot is off. Switch it on in the top bar, or sign a signal below." : ap.mode === "auto" ? "Auto mode: guard-passed decisions are sent at once, nothing waits for you." : "No proposal waiting. The next one appears here."}
        </div>
      )}

      <dl className="cp-kv">
        <dt>Target</dt>
        <dd>
          {t ? (
            <>
              <span className="cp-strong">{segName(t.node)}</span> <span className="cp-sub">{kindWord(t.node)}</span>
              <div className="cp-sub" {...tip(`The AI is watching ${segName(t.node)}: ${t.hot.length} of its ${t.under} transformers are forecast past ${ap.trigger_pct} % of their limit`)}>
                {t.hot.length} of {t.under} transformers forecast past {ap.trigger_pct} % of their limit · worst {segName(t.worst)}{" "}
                <span className={Math.abs(t.worst_pct) >= 100 ? "cp-red" : ""}>{t.worst_pct < 0 ? "exporting " : ""}{Math.abs(t.worst_pct)} % of its limit</span> at {hhmm(t.worst_at_h)}
              </div>
            </>
          ) : (
            <span className="cp-sub">Every transformer stays under {ap.trigger_pct} % of its limit for the next {ap.horizon_min} grid min</span>
          )}
        </dd>
        <dt>Next look</dt>
        <dd className="cp-mono">
          {ap.mode === "off" ? <span className="cp-sub">paused while off</span> : ap.busy ? <span>now, {STAGE[ap.stage] ?? "thinking"}</span> : due == null ? "soon" : due > 0 ? `in ${clock(due)}` : "any second"}
          <span className="cp-sub"> · looks every {ap.interval_s} s</span>
        </dd>
        <dt>Last call</dt>
        <dd>
          {last ? (
            <span className={last.verdict === "refused" || last.verdict === "error" ? "cp-red" : ""}>
              {last.mode ? `${last.mode} on ${segName(last.segment)}` : "no signal"} · {VERDICT[last.verdict] ?? last.verdict}
              {last.seq ? ` · signed #${last.seq}` : ""}
            </span>
          ) : (
            <span className="cp-sub">none yet</span>
          )}
        </dd>
        <dt>Brain</dt>
        <dd>{s.llm ? <>AI <span className="cp-sub">· DeepSeek V4 Flash, guard has the last word</span></> : <>Rules <span className="cp-sub">· no AI connected</span></>}</dd>
      </dl>

      <div className="cp-inline">
        <input
          className="cp-input"
          aria-label="Note for the AI"
          placeholder={ap.context || "Note for the AI, e.g. heat wave tomorrow evening"}
          value={note ?? ap.context ?? ""}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && note != null && saveNote()}
        />
        <Btn small busy={act.busy === "note"} disabled={note == null || !!act.busy} onClick={saveNote}>Save note</Btn>
        <Btn small tone="quiet" busy={act.busy === "review"} disabled={ap.mode === "off" || !!act.busy || ap.busy} onClick={review} title="Ask the AI to review the grid now">Look now</Btn>
      </div>
      <Result out={act.out} />
    </Card>
  );
}
