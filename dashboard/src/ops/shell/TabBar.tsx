// Phones: the sidebar becomes a tab bar along the bottom (iOS style): Operations, Diet plan, Real plant and More, an icon
// over each label, 50 px tall targets, padded above the home indicator. More opens a sheet with City, Autopilot, Manual,
// Households and Log, with the same badges as the sidebar.
import { useEffect, useState } from "react";
import { DotsThreeCircle } from "@phosphor-icons/react";
import type { Ops } from "../useOps";
import { MAIN, MORE, href, type Route } from "./Sidebar";
import Sheet from "./Sheet";

export default function TabBar({ route, ops }: { route: Route; ops: Ops }) {
  const s = ops.s;
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [route]);
  const active = s ? Object.keys(s.active).length : 0;
  const pending = !!s?.autopilot?.pending;
  const plantLive = !!s?.households?.blatnica?.telemetry;
  const over = s ? Object.keys(s.tree).filter((n) => n.startsWith("tf:") && Math.abs(s.aggregates[n]?.load_pct ?? 0) >= 100).length : 0;
  const inMore = MORE.some((i) => i.r === route);
  const flag = pending ? "is-blue" : over ? "is-orange" : "";

  const badge = (r: Route) => {
    if (r === "city" && over) return <span className="sb-badge is-orange" data-src="derived" data-from="count(state/aggregates/tf:*[abs(load_pct) >= 100])" data-val={over}>{over}</span>;
    if (r === "autopilot" && pending) return <span className="sb-badge is-blue" data-src="axis">1</span>;
    if (r === "manual" && active) return <span className="sb-badge" data-src="derived" data-from="count(state/active/*)" data-val={active}>{active}</span>;
    return null;
  };

  return (
    <>
      <nav className="tab" aria-label="Console sections" data-chrome>
        {MAIN.map(({ r, label, icon: I }) => {
          const on = r === route;
          return (
            <a key={r} className="tab-item" href={href(r)} aria-current={on ? "page" : undefined}>
              <span className="tab-ico">
                <I size={24} weight={on ? "fill" : "regular"} />
                {r === "plant" && <span className={`tab-dot${plantLive ? " is-green" : ""}`} title={plantLive ? "The plant is reporting" : "Waiting for the plant"} />}
              </span>
              <span className="tab-lbl">{label}</span>
            </a>
          );
        })}
        <button type="button" className="tab-item" aria-haspopup="dialog" aria-expanded={more} aria-current={inMore ? "page" : undefined} onClick={() => setMore(true)}>
          <span className="tab-ico">
            <DotsThreeCircle size={24} weight={inMore ? "fill" : "regular"} />
            {flag && <span className={`tab-dot ${flag}`} />}
          </span>
          <span className="tab-lbl">More</span>
        </button>
      </nav>
      <Sheet open={more} title="More" onClose={() => setMore(false)}>
        <div className="sheet-list">
          {MORE.map(({ r, label, icon: I }) => (
            <a key={r} className="sheet-row" href={href(r)} aria-current={r === route ? "page" : undefined} onClick={() => setMore(false)}>
              <I size={20} weight={r === route ? "fill" : "regular"} />
              <span className="sheet-row-lbl">{label}</span>
              {badge(r)}
            </a>
          ))}
        </div>
      </Sheet>
    </>
  );
}
