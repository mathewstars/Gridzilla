// Drawer tab: the platform's event log, newest first, with a filter. House registrations are hidden by default
// because there are hundreds of them at start-up.
import { CaretDown } from "@phosphor-icons/react";
import { useState } from "react";
import type { LogEntry, State } from "../../api";
import { Empty, Segmented } from "../ui";

type F = "key" | "signals" | "ai" | "houses" | "all";
const FILTERS: { value: F; label: string }[] = [
  { value: "key", label: "Key events" },
  { value: "signals", label: "Signals" },
  { value: "ai", label: "AI" },
  { value: "houses", label: "House replies" },
  { value: "all", label: "Everything" },
];
const NOISE = new Set(["registry", "register", "telemetry"]);
const pass = (f: F, k: string) =>
  f === "all" ? true : f === "key" ? !NOISE.has(k) : f === "signals" ? k === "signal" : f === "ai" ? k === "autopilot" || k === "advisor" : k === "ack" || NOISE.has(k);

const CHIP: Record<string, { label: string; cls: string }> = {
  signal: { label: "Signal", cls: "bg-signal/15 text-signal shadow-[inset_0_0_0_1px_rgb(51_225_201/0.35)]" },
  autopilot: { label: "Autopilot", cls: "bg-signal/10 text-signal/90" },
  advisor: { label: "DeepSeek", cls: "bg-signal/10 text-signal/90" },
  ack: { label: "House reply", cls: "bg-white/[0.07] text-fg/90" },
  demo: { label: "Demo", cls: "bg-white/[0.12] text-fg shadow-[inset_0_0_0_1px_rgb(255_255_255/0.18)]" },
  registry: { label: "Registry", cls: "bg-white/[0.04] text-dim" },
};
const chip = (k: string) => CHIP[k] ?? { label: k.charAt(0).toUpperCase() + k.slice(1), cls: "bg-white/[0.04] text-dim" };

const time = (ts: string) => {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

function Entry({ e }: { e: LogEntry }) {
  const [open, setOpen] = useState(false);
  const c = chip(e.kind);
  const long = e.msg.length > 140;
  return (
    <li>
      <button
        type="button"
        onClick={() => long && setOpen((o) => !o)}
        aria-expanded={long ? open : undefined}
        className={`grid w-full grid-cols-[4.6rem_minmax(0,1fr)] gap-x-3 rounded-[0.8rem] px-2 py-2 text-left transition-colors hover:bg-white/[0.035] focus-visible:outline-2 focus-visible:outline-signal ${long ? "cursor-pointer" : "cursor-default"}`}
      >
        <span className="num pt-0.5 text-[0.76rem] text-faint">{time(e.ts)}</span>
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${c.cls}`}>{c.label}</span>
            {e.seq != null && <span className="num text-[0.72rem] text-dim">#{e.seq}</span>}
            {long && <CaretDown size={12} className={`ml-auto text-faint transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />}
          </span>
          <span className={`mt-1 block break-words text-[0.84rem] leading-snug text-fg/85 ${open ? "" : "line-clamp-2"}`}>{e.msg}</span>
        </span>
      </button>
    </li>
  );
}

export default function LogTab({ s }: { s: State }) {
  const [f, setF] = useState<F>("key");
  const log = s.log ?? [];
  const all = log.filter((e) => pass(f, e.kind));
  const rows = all.slice(0, 150);
  // Stable keys (content + occurrence) so an expanded entry stays expanded when new ones arrive on top.
  const seen = new Map<string, number>();
  const keyOf = (e: LogEntry) => {
    const k = `${e.ts}|${e.kind}|${e.msg}`;
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return `${k}|${n}`;
  };
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="scroll-thin -mx-1 overflow-x-auto px-1 pb-1">
        <Segmented id="logfilter" size="sm" value={f} onChange={setF} options={FILTERS} />
      </div>
      {rows.length === 0 ? (
        <Empty>{log.length === 0 ? "The log is empty. Events appear here as the platform sends signals and houses reply." : "Nothing of this kind in the log yet."}</Empty>
      ) : (
        <ol className="flex flex-col" aria-label="Event log, newest first">
          {rows.map((e) => (
            <Entry key={keyOf(e)} e={e} />
          ))}
        </ol>
      )}
      {all.length > rows.length && <div className="tech px-2 pb-2">Showing the newest 150.</div>}
    </div>
  );
}
