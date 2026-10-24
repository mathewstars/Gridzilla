// Drawer tab: the two fail-safe demos from the operator page. Pause the heartbeat (houses drop back to safe owner
// mode) and replay an old signal (houses must refuse it as stale). Results and errors show inline.
import { ArrowCounterClockwise, Check, Pause, Play, WarningCircle } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { post, type State } from "../../api";
import { MODE_WORDS, nice } from "../../model";
import { errText } from "./shared";

type Result = { ok: boolean; text: string } | null;

function Card({ title, plain, tech, status, children, result }: { title: string; plain: string; tech: string; status: ReactNode; children: ReactNode; result: Result }) {
  return (
    <section className="relative overflow-hidden rounded-[1rem] bg-deck-2 p-5 shadow-[inset_0_1px_0_rgb(255_255_255/0.07),inset_0_0_0_1px_rgb(255_255_255/0.05),0_18px_40px_-24px_rgb(0_0_0/0.9)]">
      <h3 className="text-[1.08rem] font-semibold tracking-[-0.01em]">{title}</h3>
      <p className="mt-1.5 max-w-[60ch] text-[0.9rem] leading-relaxed text-dim">{plain}</p>
      <div className="mt-4 rounded-[0.8rem] bg-black/25 px-3.5 py-3 text-[0.88rem] shadow-[inset_0_1px_2px_rgb(0_0_0/0.5)]">{status}</div>
      <div className="mt-4 flex flex-wrap items-center gap-3">{children}</div>
      <AnimatePresence>
        {result && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`mt-3 flex items-start gap-2 text-[0.85rem] ${result.ok ? "text-signal" : "text-fg"}`}
          >
            {result.ok ? <Check size={15} weight="bold" className="mt-0.5 shrink-0" aria-hidden /> : <WarningCircle size={15} weight="bold" className="mt-0.5 shrink-0" aria-hidden />}
            <span>{result.text}</span>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="tech mt-4">{tech}</div>
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
        plain="Houses fall back to safe mode when the heartbeat stops. Nothing has to reach them for this to work."
        tech="heartbeat on gridzilla/hb every 30 s. ABSORB and SUPPORT revert to owner mode after 120 s without a valid one (reason heartbeat_lost)."
        result={hbRes}
        status={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="flex items-center gap-2 font-medium">
              <span className={`size-2 rounded-full ${paused ? "bg-fg" : "bg-signal shadow-[0_0_10px_rgb(51_225_201/0.8)]"}`} aria-hidden />
              {paused ? "Heartbeat paused" : "Heartbeat running"}
            </span>
            <span className="text-dim">
              {lost > 0 ? `${lost.toLocaleString("en-US")} houses back in safe owner mode` : paused ? "Houses drop back after about 2 minutes" : "Houses under a signal stay on it"}
            </span>
          </div>
        }
      >
        {paused ? (
          <button type="button" className="btn btn-primary" disabled={busy != null} onClick={() => run("hb", "heartbeat/resume", setHbRes, "Heartbeat resumed. Houses accept signals again.")}>
            <Play size={15} weight="fill" aria-hidden /> Resume heartbeat
          </button>
        ) : (
          <button type="button" className="btn btn-danger" disabled={busy != null} onClick={() => run("hb", "heartbeat/pause", setHbRes, "Heartbeat paused. Watch the houses fall back within about 2 minutes.")}>
            <Pause size={15} weight="fill" aria-hidden /> Pause heartbeat
          </button>
        )}
      </Card>

      <Card
        title="Replay an old signal"
        plain="Houses must refuse it (stale_seq). A captured message can never be sent again to take control."
        tech="re-publishes the newest active signal unchanged. Agents accept only a seq higher than the last one they saw."
        result={rpRes}
        status={
          newest ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="font-medium">
                Newest signal <span className="num text-signal">#{newest.seq}</span>
              </span>
              <span className="text-dim">
                {MODE_WORDS[newest.mode]?.title ?? newest.mode} on {nice(newest.segment)}
              </span>
              {stale > 0 && <span className="text-fg">{stale.toLocaleString("en-US")} houses refused a replay</span>}
            </div>
          ) : (
            <span className="text-dim">No signal is active right now. When the autopilot sends one, it can be replayed here.</span>
          )
        }
      >
        <button
          type="button"
          className="btn"
          disabled={!newest || busy != null}
          onClick={() => newest && run("rp", `replay/${newest.seq}`, setRpRes, `Signal #${newest.seq} sent again. The houses should refuse it as an old signal.`)}
        >
          <ArrowCounterClockwise size={15} weight="bold" aria-hidden /> {newest ? `Replay signal #${newest.seq}` : "Replay signal"}
        </button>
      </Card>
    </div>
  );
}
