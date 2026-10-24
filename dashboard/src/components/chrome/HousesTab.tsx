// Drawer tab: every house on the selected feeder, grouped by transformer (busiest first). A compact plain table:
// words instead of icons, tabular numbers, red only for a refusal and an over-limit transformer.
import type { State } from "../../api";
import { MODE_WORDS, housesOf, nice, tfsOf, type House } from "../../model";
import { Empty } from "../ui";
import { LoadPill, tfLoad } from "./shared";

const REASONS: Record<string, string> = {
  min_soc: "battery too low",
  owner_limit: "owner's limit",
  stale_seq: "old signal",
  bad_sig: "bad signature",
  out_of_scope: "not for this street",
  expired: "signal expired",
  bad_mode: "unknown mode",
  heartbeat_lost: "heartbeat lost",
  window_end: "signal ended",
  opt_out: "owner opted out",
};
export const reasonText = (r: string | null | undefined) => (r ? REASONS[r] ?? r.replace(/_/g, " ") : null);

function Ack({ h }: { h: House }) {
  const reason = reasonText(h.ackReason);
  const tail = reason ? `, ${reason}` : "";
  if (!h.ackStatus) return <span className="text-tertiary">No reply</span>;
  if (h.ackStatus === "applied") return <span className="font-semibold text-ink">Following</span>;
  if (h.ackStatus === "partial") return <span className="text-ink">Partly{tail}</span>;
  if (h.ackStatus === "reverted") return <span className="text-secondary">Back to owner{tail}</span>;
  return <span className="font-semibold text-red">Refused{tail}</span>;
}

function Mode({ h }: { h: House }) {
  if (h.mode === "offline") return <span className="text-tertiary">Offline</span>;
  if (h.mode === "owner" || !h.mode) return <span className="text-secondary">Owner's choice</span>;
  return (
    <span className="font-semibold text-ink" title={h.mode}>
      {MODE_WORDS[h.mode]?.title ?? h.mode}
    </span>
  );
}

function Battery({ h }: { h: House }) {
  if (h.kwh <= 0) return <span className="text-tertiary">None</span>;
  if (h.soc == null) return <span className="text-tertiary">-</span>;
  return <span className="num text-ink">{Math.round(Math.max(0, Math.min(100, h.soc)))} %</span>;
}

/** Grid power with its direction in words, never in colour. */
function Grid({ h }: { h: House }) {
  if (!h.online) return <span className="text-tertiary">-</span>;
  const kw = h.grid_kw;
  const idle = Math.abs(kw) < 0.05;
  return (
    <span className="flex flex-col items-end leading-tight">
      <span className="num font-semibold text-ink">{Math.abs(kw).toFixed(1)} kW</span>
      <span className="text-[0.75rem] text-tertiary">{idle ? "balanced" : kw > 0 ? "taking" : "giving back"}</span>
    </span>
  );
}

/** Solar, EV and heating as words; the ones running right now in ink, the rest tertiary. */
function Uses({ h }: { h: House }) {
  const items = [
    h.hasPv && { k: "Solar", on: h.pv_kw > 0.05 },
    h.hasEv && { k: "EV", on: h.ev_kw > 0.1 },
    h.hasHeat && { k: "Heat", on: h.hp_kw > 0.1 },
  ].filter(Boolean) as { k: string; on: boolean }[];
  if (!items.length) return <span className="text-tertiary">-</span>;
  return (
    <span>
      {items.map((x, i) => (
        <span key={x.k} className={x.on ? "text-ink" : "text-tertiary"}>
          {x.k}
          {i < items.length - 1 ? ", " : ""}
        </span>
      ))}
    </span>
  );
}

const cols = "grid grid-cols-[minmax(0,1fr)_3.5rem_5rem] sm:grid-cols-[minmax(0,1fr)_3.75rem_5.25rem_6.5rem_8rem_8.5rem] items-center gap-x-3";

export default function HousesTab({ s, feeder }: { s: State; feeder: string }) {
  const tfs = tfsOf(s, feeder).sort((a, b) => Math.abs(tfLoad(s, b) ?? 0) - Math.abs(tfLoad(s, a) ?? 0));
  if (!tfs.length) return <Empty>No transformers on this feeder.</Empty>;
  return (
    <div className="flex flex-col gap-6">
      <div className={`${cols} t-caption sticky top-0 z-10 -mx-2 bg-card px-4 pb-2 pt-1`}>
        <span>House</span>
        <span>Battery</span>
        <span className="text-right">Grid</span>
        <span className="hidden sm:block">Uses</span>
        <span className="hidden sm:block">Mode</span>
        <span className="hidden sm:block">Reply</span>
      </div>
      {tfs.map((tf) => {
        const hs = housesOf(s, tf).sort((a, b) => Number(b.real) - Number(a.real) || a.name.localeCompare(b.name, undefined, { numeric: true }));
        const t = s.tree[tf];
        return (
          <section key={tf} aria-label={`${nice(tf)} transformer`}>
            <div className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-2">
              <h3 className="t-body font-semibold text-ink">{nice(tf)}</h3>
              <LoadPill pct={tfLoad(s, tf)} size="sm" />
              <span className="t-caption">
                {t?.rating_kw ? `${t.rating_kw} kVA street transformer` : "street transformer"}
                {t?.other_houses ? `, ${t.other_houses} other houses` : ""}
              </span>
            </div>
            {hs.length === 0 ? (
              <div className="t-small rounded-[12px] bg-ground px-4 py-3">No program houses on this transformer yet.</div>
            ) : (
              <div className="flex flex-col">
                {hs.map((h) => (
                  <div key={h.key} className={`${cols} rounded-[10px] px-2 py-1.5 text-[0.875rem] transition-colors duration-100 hover:bg-ground`}>
                    <span className="min-w-0">
                      <span className={`block break-words leading-snug ${h.online ? "text-ink" : "text-secondary"}`}>{h.name}</span>
                      <span className="t-caption block break-words">
                        {h.real && <span className="font-semibold text-ink">Real hardware. </span>}
                        {h.represents > 1 ? `Stands for ${h.represents} houses` : h.devices.length > 1 ? `${h.devices.length} devices, one meter` : h.key}
                        <span className="sm:hidden">
                          . <Mode h={h} />, <Ack h={h} />
                        </span>
                      </span>
                    </span>
                    <Battery h={h} />
                    <span className="justify-self-end">
                      <Grid h={h} />
                    </span>
                    <span className="hidden sm:block">
                      <Uses h={h} />
                    </span>
                    <span className="hidden sm:block">
                      <Mode h={h} />
                    </span>
                    <span className="hidden sm:block">
                      <Ack h={h} />
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
