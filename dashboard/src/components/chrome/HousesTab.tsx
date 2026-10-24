// Drawer tab: every house on the selected feeder, grouped by transformer (busiest first).
import { Car, Check, Fire, Sun, X, ArrowCounterClockwise, Minus } from "@phosphor-icons/react";
import type { State } from "../../api";
import { COLORS, MODE_WORDS, housesOf, nice, tfsOf, type House } from "../../model";
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
  const base = "flex items-center gap-1.5 text-[0.8rem] font-medium";
  if (!h.ackStatus) return <span className={`${base} text-faint`}><Minus size={12} aria-hidden /> <span className="hidden sm:inline">No reply</span></span>;
  if (h.ackStatus === "applied")
    return <span className={`${base} text-signal`}><Check size={13} weight="bold" aria-hidden /> <span className="hidden sm:inline">Following</span></span>;
  if (h.ackStatus === "partial")
    return <span className={`${base} text-signal/75`} title={reason ?? undefined}><Check size={13} aria-hidden /> <span className="hidden sm:inline">Partly{reason ? `, ${reason}` : ""}</span></span>;
  if (h.ackStatus === "reverted")
    return <span className={`${base} text-dim`} title={reason ?? undefined}><ArrowCounterClockwise size={13} weight="bold" aria-hidden /> <span className="hidden sm:inline">Back to owner{reason ? `, ${reason}` : ""}</span></span>;
  return <span className={`${base} text-fg`} title={reason ?? undefined}><X size={13} weight="bold" aria-hidden /> <span className="hidden sm:inline">Refused{reason ? `, ${reason}` : ""}</span></span>;
}

function Mode({ h }: { h: House }) {
  if (h.mode === "offline") return <span className="text-faint">Offline</span>;
  if (h.mode === "owner" || !h.mode) return <span className="text-dim">Owner's choice</span>;
  return <span className="font-medium text-signal" title={h.mode}>{MODE_WORDS[h.mode]?.title ?? h.mode}</span>;
}

function Battery({ h }: { h: House }) {
  if (h.kwh <= 0) return <span className="text-[0.8rem] text-faint">No battery</span>;
  if (h.soc == null) return <span className="text-faint">-</span>;
  const f = Math.max(0, Math.min(100, h.soc));
  return (
    <span className="flex items-center gap-2">
      <span className="relative h-3 w-6 shrink-0 rounded-[3px] shadow-[inset_0_0_0_1.5px_rgb(255_255_255/0.28)]" aria-hidden>
        <span className="absolute inset-[2.5px] origin-left rounded-[1.5px] bg-signal/85" style={{ transform: `scaleX(${f / 100})` }} />
        <span className="absolute -right-[3px] top-1/2 h-1.5 w-[2px] -translate-y-1/2 rounded-r-sm bg-white/30" />
      </span>
      <span className="num text-[0.9rem] text-fg">{Math.round(f)} %</span>
    </span>
  );
}

function Grid({ h }: { h: House }) {
  if (!h.online) return <span className="text-faint">-</span>;
  const kw = h.grid_kw;
  const idle = Math.abs(kw) < 0.05;
  const c = idle ? COLORS.muted : kw > 0 ? COLORS.take : COLORS.give;
  return (
    <span className="flex flex-col items-end leading-tight">
      <span className="num text-[0.95rem] font-semibold" style={{ color: c }}>{Math.abs(kw).toFixed(1)} kW</span>
      <span className="text-[0.68rem] text-faint">{idle ? "balanced" : kw > 0 ? "taking" : "giving back"}</span>
    </span>
  );
}

function Loads({ h }: { h: House }) {
  const on = (x: number) => (x > 0.1 ? "text-fg" : "text-faint/70");
  return (
    <span className="flex items-center gap-1.5">
      {h.hasPv && <Sun size={15} weight={h.pv_kw > 0.05 ? "fill" : "regular"} className={h.pv_kw > 0.05 ? "text-give" : "text-faint/70"} aria-label="solar panels" />}
      {h.hasEv && <Car size={15} weight={h.ev_kw > 0.1 ? "fill" : "regular"} className={on(h.ev_kw)} aria-label={h.ev_kw > 0.1 ? `EV charging ${h.ev_kw.toFixed(1)} kW` : "EV"} />}
      {h.hasHeat && <Fire size={15} weight={h.hp_kw > 0.1 ? "fill" : "regular"} className={on(h.hp_kw)} aria-label={h.hp_kw > 0.1 ? `heating ${h.hp_kw.toFixed(1)} kW` : "heat pump or boiler"} />}
    </span>
  );
}

const cols = "grid grid-cols-[minmax(0,1fr)_5.2rem_4.6rem_1.4rem] sm:grid-cols-[minmax(0,1fr)_5.6rem_5rem_4rem_7.5rem_7.5rem] items-center gap-x-3";

export default function HousesTab({ s, feeder }: { s: State; feeder: string }) {
  const tfs = tfsOf(s, feeder).sort((a, b) => Math.abs(tfLoad(s, b) ?? 0) - Math.abs(tfLoad(s, a) ?? 0));
  if (!tfs.length) return <Empty>No transformers on this feeder.</Empty>;
  return (
    <div className="flex flex-col gap-5">
      <div className={`${cols} sticky top-0 z-10 -mx-2 bg-deck px-4 pb-2 pt-1 text-[0.72rem] font-medium text-faint`}>
        <span>House</span>
        <span>Battery</span>
        <span className="text-right">Grid</span>
        <span className="hidden sm:block">Uses</span>
        <span className="hidden sm:block">Mode</span>
        <span className="sm:block"><span className="hidden sm:inline">Reply</span></span>
      </div>
      {tfs.map((tf) => {
        const hs = housesOf(s, tf).sort((a, b) => Number(b.real) - Number(a.real) || a.name.localeCompare(b.name, undefined, { numeric: true }));
        const t = s.tree[tf];
        return (
          <section key={tf} aria-label={`${nice(tf)} transformer`}>
            <div className="mb-1.5 flex items-center gap-3 px-2">
              <h3 className="text-[0.98rem] font-semibold tracking-[-0.01em]">{nice(tf)}</h3>
              <LoadPill pct={tfLoad(s, tf)} size="sm" />
              <span className="tech ml-auto">
                {t?.rating_kw ? `${t.rating_kw} kVA street transformer` : "street transformer"}
                {t?.other_houses ? `, ${t.other_houses} other houses` : ""}
              </span>
            </div>
            {hs.length === 0 ? (
              <div className="rounded-xl bg-black/20 px-4 py-3 text-[0.84rem] text-dim">No program houses on this transformer yet.</div>
            ) : (
              <div className="flex flex-col">
                {hs.map((h) => (
                  <div key={h.key} className={`${cols} rounded-[0.8rem] px-2 py-2 transition-colors hover:bg-white/[0.035]`}>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className={`truncate text-[0.92rem] ${h.online ? "text-fg" : "text-dim"}`}>{h.name}</span>
                        {h.real && <span className="shrink-0 rounded-full bg-signal/12 px-1.5 py-px text-[0.64rem] font-semibold text-signal shadow-[inset_0_0_0_1px_rgb(51_225_201/0.3)]">Real hardware</span>}
                      </span>
                      <span className="tech block truncate">
                        {h.represents > 1 ? `stands for ${h.represents} houses` : h.devices.length > 1 ? `${h.devices.length} devices, one meter` : h.key}
                        <span className="sm:hidden">, <Mode h={h} /></span>
                      </span>
                    </span>
                    <Battery h={h} />
                    <span className="justify-self-end"><Grid h={h} /></span>
                    <span className="hidden sm:block"><Loads h={h} /></span>
                    <span className="hidden truncate text-[0.84rem] sm:block"><Mode h={h} /></span>
                    <Ack h={h} />
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
