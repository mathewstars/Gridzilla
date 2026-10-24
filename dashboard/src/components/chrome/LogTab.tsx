// Drawer tab: the platform's event log, newest first, with a filter. House registrations are hidden by default
// because there are hundreds of them at start-up. A plain list: time, what happened, the message in full (wraps).
import { useState } from "react";
import type { LogEntry, State } from "../../api";
import { Empty, Segmented } from "../ui";

type F = "key" | "signals" | "ai" | "houses" | "all";
const FILTERS: { value: F; label: string; title: string }[] = [
  { value: "key", label: "Main", title: "Key events, without house registrations" },
  { value: "signals", label: "Signals", title: "Signals sent to houses" },
  { value: "ai", label: "AI", title: "Autopilot and DeepSeek" },
  { value: "houses", label: "Replies", title: "House replies and registrations" },
  { value: "all", label: "All", title: "Everything" },
];
const NOISE = new Set(["registry", "register", "telemetry"]);
const pass = (f: F, k: string) =>
  f === "all" ? true : f === "key" ? !NOISE.has(k) : f === "signals" ? k === "signal" : f === "ai" ? k === "autopilot" || k === "advisor" : k === "ack" || NOISE.has(k);

const KIND: Record<string, string> = {
  signal: "Signal",
  autopilot: "Autopilot",
  advisor: "DeepSeek",
  ack: "House reply",
  demo: "Demo",
  registry: "Registry",
};
const kindText = (k: string) => KIND[k] ?? k.charAt(0).toUpperCase() + k.slice(1);

const time = (ts: string) => {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

function Entry({ e }: { e: LogEntry }) {
  // A refusal is the one log line that earns the red.
  const refused = e.kind === "ack" && /refus/i.test(e.msg);
  return (
    <li className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-x-3 px-2 py-2.5">
      <span className="num pt-[0.1rem] text-[0.8125rem] text-tertiary">{time(e.ts)}</span>
      <span className="min-w-0">
        <span className={`text-[0.875rem] font-semibold ${refused ? "text-red" : "text-ink"}`}>
          {kindText(e.kind)}
          {e.seq != null && <span className="num font-normal text-secondary"> #{e.seq}</span>}
        </span>
        <span className="mt-0.5 block break-words text-[0.9375rem] leading-snug text-ink">{e.msg}</span>
      </span>
    </li>
  );
}

export default function LogTab({ s }: { s: State }) {
  const [f, setF] = useState<F>("key");
  const log = s.log ?? [];
  const all = log.filter((e) => pass(f, e.kind));
  const rows = all.slice(0, 150);
  // Stable keys (content + occurrence) so rows do not re-mount when new ones arrive on top.
  const seen = new Map<string, number>();
  const keyOf = (e: LogEntry) => {
    const k = `${e.ts}|${e.kind}|${e.msg}`;
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return `${k}|${n}`;
  };
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div>
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
      {all.length > rows.length && <div className="t-caption px-2 pb-2">Showing the newest 150.</div>}
    </div>
  );
}
