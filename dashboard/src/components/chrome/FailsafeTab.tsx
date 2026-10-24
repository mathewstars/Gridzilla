// Drawer tab: the two fail-safe demos from the operator page. Pause the heartbeat (houses drop back to safe owner
// mode) and replay an old signal (houses must refuse it as stale). Results and errors show inline.
import { useState, type ReactNode } from "react";
import { post, type State } from "../../api";
import { MODE_WORDS, nice } from "../../model";
import { Badge } from "../ui";
import { errText } from "./shared";

type Result = { ok: boolean; text: string } | null;

/** One demo as a grey tile on the white sheet: what it proves, where it stands, the button, the outcome. */
function Card({ title, plain, tech, badge, status, children, result }: { title: string; plain: string; tech: string; badge?: ReactNode; status: ReactNode; children: ReactNode; result: Result }) {
  return (
    <section className="rounded-[18px] bg-ground p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <h3 className="t-title text-ink">{title}</h3>
        {badge}
      </div>
      <p className="t-body mt-1.5 max-w-[60ch] text-secondary">{plain}</p>
      <div className="t-body mt-4 text-ink">{status}</div>
      <div className="mt-4 flex flex-wrap items-center gap-3">{children}</div>
      {result && (
        <p role="status" className={`t-body mt-3 ${result.ok ? "text-ink" : "text-red"}`}>
          {result.text}
        </p>
      )}
      <p className="t-caption mt-4">{tech}</p>
    </section>
  );
}

export default function FailsafeTab({ s }: { s: State }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [hbRes, setHbRes] = useState<Result>(null);
  const [rpRes, setRpRes] = useState<Result>(null);

  const hh = Object.values(s.households ?? {});
  const lost = hh.filter((h) => h.ack?.reason === "heartbeat_lost").reduce((a, h) => a + (h.represents ?? 1), 0);
  const stale = hh.filter((h) => h.ack?.reason === "stale_seq").reduce((a, h) => a + (h.represents ?? 1), 0);
  const newest = Object.values(s.active ?? {}).sort((a, b) => b.seq - a.seq)[0];

  const run = async (key: string, path: string, set: (r: Result) => void, okText: string) => {
    setBusy(key);
    set(null);
    try {
      await post(path);
      set({ ok: true, text: okText });
    } catch (e) {
      set({ ok: false, text: `The platform said no: ${errText(e)}` });
    } finally {
      setBusy(null);
    }
  };

  const paused = s.hb_paused;
  return (
    <div className="flex flex-col gap-4">
      <Card
        title="Simulate platform outage"
        plain="Stop the heartbeat and the houses fall back to safe mode on their own. Nothing has to reach them for this to work."
        tech="Heartbeat on gridzilla/hb every 30 s. ABSORB and SUPPORT revert to owner mode after 120 s without a valid one (reason heartbeat_lost)."
        result={hbRes}
        badge={paused ? <Badge alert>Heartbeat paused</Badge> : undefined}
        status={
          <>
            <span className="font-semibold">{paused ? "Heartbeat paused." : "Heartbeat running."}</span>{" "}
            <span className="text-secondary">
              {lost > 0 ? `${lost.toLocaleString("en-US")} houses are back in safe owner mode.` : paused ? "Houses drop back after about 2 minutes." : "Houses under a signal stay on it."}
            </span>
          </>
        }
      >
        {paused ? (
          <button type="button" className="btn btn-primary" disabled={busy != null} onClick={() => run("hb", "heartbeat/resume", setHbRes, "Heartbeat resumed. Houses accept signals again.")}>
            Resume heartbeat
          </button>
        ) : (
          <button type="button" className="btn btn-danger" disabled={busy != null} onClick={() => run("hb", "heartbeat/pause", setHbRes, "Heartbeat paused. Watch the houses fall back within about 2 minutes.")}>
            Pause heartbeat
          </button>
        )}
      </Card>

      <Card
        title="Replay an old signal"
        plain="Send the newest signal again, unchanged. Houses must refuse it, so a captured message can never be used to take control."
        tech="Re-publishes the newest active signal as is. Agents accept only a seq higher than the last one they saw (reason stale_seq)."
        result={rpRes}
        status={
          newest ? (
            <>
              <span className="font-semibold">
                Newest signal <span className="num">#{newest.seq}</span>:
              </span>{" "}
              <span className="text-secondary">
                {MODE_WORDS[newest.mode]?.title ?? newest.mode} on {nice(newest.segment)}.
              </span>
              {stale > 0 && <span className="text-ink"> {stale.toLocaleString("en-US")} houses refused a replay.</span>}
            </>
          ) : (
            <span className="text-secondary">No signal is active right now. When the autopilot sends one, it can be replayed here.</span>
          )
        }
      >
        <button
          type="button"
          className="btn btn-primary"
          disabled={!newest || busy != null}
          onClick={() => newest && run("rp", `replay/${newest.seq}`, setRpRes, `Signal #${newest.seq} sent again. The houses should refuse it as an old signal.`)}
        >
          {newest ? `Replay signal #${newest.seq}` : "Replay signal"}
        </button>
      </Card>
    </div>
  );
}
