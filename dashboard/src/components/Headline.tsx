// Three projector numbers across the top of the board: energy stored in home batteries, the busiest street transformer,
// and how many houses follow Gridzilla. Big, calm, plain words. 3 across on desktop, stacked on a phone.
import type { ReactNode } from "react";
import type { State } from "../api";
import { headline, nice } from "../model";
import { Badge, Ticker } from "./ui";
import { isOver } from "./chrome/shared";

/** Value in its natural unit: kWh / MWh or kW / MW, with sensible decimals. */
function scaled(v: number, base: string) {
  if (Math.abs(v) >= 1000) {
    const m = v / 1000;
    return { v: m, d: Math.abs(m) >= 100 ? 0 : 1, unit: `M${base}` };
  }
  return { v, d: 0, unit: `k${base}` };
}
const fmt = (x: { v: number; d: number; unit: string }) =>
  `${x.v.toLocaleString("en-US", { minimumFractionDigits: x.d, maximumFractionDigits: x.d })} ${x.unit}`;

/** Average state of charge, capacity weighted. The trimmed payload ships only the households on screen, which stand in
 *  for the city here (the city-wide stored energy itself comes from the server's totals). */
function avgSocOf(s: State) {
  let cap = 0,
    stored = 0;
  Object.values(s.devices).forEach((d) => {
    if (!d.telemetry || d.kwh <= 0 || d.telemetry.soc == null) return;
    cap += d.kwh * (d.represents ?? 1);
    stored += (d.kwh * (d.represents ?? 1) * d.telemetry.soc) / 100;
  });
  return cap > 0 ? stored / cap : 0;
}

function Stat({ label, value, foot, badge }: { label: string; value: ReactNode; foot: ReactNode; badge?: ReactNode }) {
  return (
    <div className="panel flex min-w-0 flex-col px-5 py-4 lg:px-6">
      <div className="flex items-start justify-between gap-3">
        <div className="t-body text-secondary">{label}</div>
        {badge}
      </div>
      <div className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-2">{value}</div>
      <div className="t-small mt-1">{foot}</div>
    </div>
  );
}

const big = "t-num text-ink max-sm:!text-[2.5rem]";
const unitCls = "text-[1.5rem] font-semibold tracking-[-0.01em] text-secondary";

export default function Headline({ s }: { s: State }) {
  const h = headline(s);
  const e = scaled(h.kwh, "Wh");
  const avgSoc = avgSocOf(s);
  const pct = h.worst ? h.worstPct : null;
  const over = isOver(pct);
  const nothing = h.online === 0;

  return (
    <section aria-label="Headline numbers" className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-3 lg:gap-[1.1rem]">
      <Stat
        label="Stored in home batteries"
        value={
          <>
            <Ticker value={e.v} decimals={e.d} className={big} />
            <span className={unitCls}>{e.unit}</span>
          </>
        }
        foot={nothing ? "Waiting for batteries to report" : `${Math.round(avgSoc * 100)} % full on average, ${fmt(scaled(h.kw, "W"))} flexible power`}
      />
      <Stat
        label="Busiest street transformer"
        badge={h.over > 0 ? <Badge alert>{h.over === 1 ? "Over the limit" : `${h.over} over the limit`}</Badge> : undefined}
        value={
          <>
            <span className={`${big} ${over ? "!text-red" : ""}`}>{pct == null ? "-" : <Ticker value={Math.abs(pct)} />}</span>
            <span className={`${unitCls} ${over ? "!text-red" : ""}`}>%</span>
            <span className="t-small">of its limit</span>
          </>
        }
        foot={
          pct == null ? (
            "No transformer reading yet"
          ) : (
            <>
              <span className="font-semibold text-ink">{nice(h.worst)}</span>
              {pct < 0 ? ", solar flowing back" : ", houses taking power"}
            </>
          )
        }
      />
      <Stat
        label="Houses following Gridzilla"
        value={
          <>
            <Ticker value={h.under} className={big} />
            <span className="t-body text-secondary">of {h.online.toLocaleString("en-US")} online</span>
          </>
        }
        foot={
          nothing
            ? "Waiting for the first houses to report"
            : h.under > 0
              ? `${h.obeying.toLocaleString("en-US")} confirmed with a signed reply`
              : `${h.houses.toLocaleString("en-US")} in the program, none steered right now`
        }
      />
    </section>
  );
}
