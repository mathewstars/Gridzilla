// City-wide flexibility right now (parity with dad's header KPIs): what the program's homes can give the grid this minute.
// From /api/state: the city aggregate (battery energy available) and the summary (cars and heat pumps drawing, homes).
import type { State } from "../../api";
import "./flex.css";

const n = (v: number) => Math.round(v).toLocaleString("en-US");

export default function Flex({ s }: { s: State }) {
  const root = Object.keys(s.tree).find((k) => !s.tree[k].parent) ?? "";
  const a = s.aggregates[root];
  const m = s.summary;
  if (!a || !m) return null;
  const r = m.households ? m.houses / m.households : 1;
  const A = `state/aggregates/${root}`;
  return (
    <section className="panel flex-row" aria-label="Flexibility in the city right now">
      <div title="Energy stored in the program's home batteries above the owners' floors, ready to cover a peak.">
        <b data-src="derived" data-from={`${A}/kwh_available * state/summary/houses / state/summary/households`} data-val={a.kwh_available * r}>{n(a.kwh_available * r)} kWh</b>
        <span>stored in home batteries</span>
      </div>
      <div title="Cars charging right now across the program's homes: load Gridzilla can move to later in the night.">
        <b data-src="state/summary/ev_kw" data-val={m.ev_kw}>{n(m.ev_kw)} kW</b>
        <span>of car charging now</span>
      </div>
      <div title="Heat pumps and boilers running now: load that can wait a little while the house stays warm.">
        <b data-src="state/summary/hp_kw" data-val={m.hp_kw}>{n(m.hp_kw)} kW</b>
        <span>of heat pumps and boilers now</span>
      </div>
      <div title="Simulated households reporting in; each one stands for several real homes.">
        <b data-src="state/summary/online" data-val={m.online}>{n(m.online)}</b>
        <span>
          of <span data-src="state/summary/households" data-val={m.households}>{n(m.households)}</span> households reporting
        </span>
      </div>
    </section>
  );
}
