// Real plant page (console-simplify.md): the demo's Blatnica showcase as a full page. The 30-minute grid chart, the four
// readings and the battery ring (PlantHero, the same component as the demo's Blatnica mode), then the signature chain of
// the latest signal and the plant's replies. Everything is read from the LIVE server (live.ts, GET only) and traced.
import { nice } from "../../model";
import { PlantHero, usePlant } from "../demo/BlatnicaLive";
import { LIVE_HH, useLiveBlatnica } from "../demo/live";
import "../demo/demo.css";
import "./plant.css";

const clockOf = (iso: string) => new Date(iso).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit", hour12: false });
const HH = `live:state/households/${LIVE_HH}`;

type Tone = "ok" | "warn" | "bad" | "idle";

function Step({ tone, name, children }: { tone: Tone; name: string; children: React.ReactNode }) {
  return (
    <li className={`pl-step is-${tone}`}>
      <span className="pl-dot" aria-hidden />
      <div className="pl-step-body">
        <div className="pl-step-name">{name}</div>
        <div className="pl-step-line">{children}</div>
      </div>
    </li>
  );
}

export default function PlantPage() {
  const plant = useLiveBlatnica();
  const { state, h } = usePlant(plant);
  const ak = h?.ack ?? null;
  // the signal running on the plant's street, if any (its transformer or anything above it)
  const path = h?.path ?? (h?.tf ? [h.tf] : []);
  const sig = Object.entries(state?.active ?? {}).find(([n]) => path.includes(n) || n === h?.tf);
  const log = state?.log ?? [];
  const replies = log
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.kind === "ack" && !!e.device && /blatnica/.test(e.device))
    .reverse()
    .slice(0, 6);
  const statusTone = (st?: string | null): Tone => (st === "applied" ? "ok" : st === "refused" ? "bad" : st ? "warn" : "idle");

  return (
    <div className="plant-page">
      <PlantHero plant={plant} />
      <div className="plant-side">
        <section className="panel pl-card">
          <h2 className="pl-h2">Signature chain</h2>
          {!h ? (
            <p className="pl-empty">Waiting for the plant. The chain shows the moment it reports.</p>
          ) : (
            <ol className="pl-chain">
              <Step tone={sig ? "ok" : "idle"} name="Signed">
                {sig ? (
                  <>
                    #<span data-src={`live:state/active/${sig[0]}/seq`} data-val={String(sig[1].seq)}>{sig[1].seq}</span> · {sig[1].mode} on{" "}
                    <span data-src={`live:state/active/${sig[0]}/segment`}>{nice(sig[0])}</span>
                  </>
                ) : (
                  "no signal on its street right now"
                )}
              </Step>
              <Step tone={sig ? "ok" : "idle"} name="Sent to the plant">
                {h.tf ? <>on its transformer <span data-src={`${HH}/tf`}>{nice(h.tf)}</span></> : "its street is not known yet"}
              </Step>
              <Step tone={statusTone(ak?.status)} name="The plant replied">
                {ak?.status ? (
                  <>
                    <span data-src={`${HH}/ack/status`}>{ak.status}</span>
                    {ak.reason && <> ({ak.reason.replace(/_/g, " ")})</>}
                    {ak.seq != null && (
                      <>
                        {" "}to #<span data-src={`${HH}/ack/seq`} data-val={String(ak.seq)}>{ak.seq}</span>
                      </>
                    )}
                  </>
                ) : (
                  "no reply yet"
                )}
              </Step>
              <Step tone={ak?.verified ? "ok" : ak ? "bad" : "idle"} name="Signature">
                {ak ? (ak.verified ? "checked: the plant only acts on signals signed by the platform" : "not checked") : "nothing to check yet"}
              </Step>
            </ol>
          )}
        </section>
        <section className="panel pl-card pl-replies">
          <h2 className="pl-h2">What the plant replied</h2>
          {replies.length ? (
            <ul className="pl-list">
              {replies.map(({ e, i }) => (
                <li key={`${e.ts}-${i}`} className="pl-row">
                  <span className="pl-time" data-src="axis">{clockOf(e.ts)}</span>
                  <span className={`pl-tag is-${statusTone(e.status)}`} data-src={`live:state/log/${i}/status`}>{e.status ?? e.kind}</span>
                  <span className="pl-msg" data-src={`live:state/log/${i}/msg`}>{e.msg.replace(/^[^:]+:\s*/, "")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pl-empty">
              No reply from Blatnica in the platform's last{" "}
              <span data-src="derived" data-from="count(live:state/log/*)" data-val={log.length}>{log.length}</span> events.
              {ak?.status && <> Its latest reply was “{ak.status}”{ak.reason ? ` (${ak.reason.replace(/_/g, " ")})` : ""}.</>}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
