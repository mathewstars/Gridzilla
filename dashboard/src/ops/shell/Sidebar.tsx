// Left sidebar of the operations console. Adapted from the 21st.dev "Sidebar" by @wensity (design/21st/sidebar-shell.tsx):
// sections, live badges and an active pill that glides between items (motion layoutId). Full width at >= 1240, an icon
// rail with hover labels below that, a sideways-scrolling top menu on phones (shell.css).
import { useEffect, useState } from "react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import {
  Broadcast,
  CloudSun,
  GridFour,
  HouseLine,
  Lightning,
  List,
  ListBullets,
  ProjectorScreenChart,
  Robot,
  SlidersHorizontal,
  SolarPanel,
  type Icon,
} from "@phosphor-icons/react";
import type { Ops } from "../useOps";
import "./shell.css";

export type Route = "ops" | "city" | "autopilot" | "manual" | "households" | "plant" | "weather" | "log" | "demo" | "plan";

type Item = { r: Route; label: string; icon: Icon };
const SECTIONS: { label: string; items: Item[] }[] = [
  {
    label: "Run the grid",
    items: [
      { r: "ops", label: "Operations", icon: Broadcast },
      { r: "city", label: "City", icon: GridFour },
      { r: "autopilot", label: "Autopilot", icon: Robot },
      { r: "manual", label: "Manual", icon: SlidersHorizontal },
    ],
  },
  {
    label: "Look closer",
    items: [
      { r: "households", label: "Households", icon: HouseLine },
      { r: "plant", label: "Real plant", icon: SolarPanel },
      { r: "weather", label: "Weather", icon: CloudSun },
      { r: "log", label: "Log", icon: ListBullets },
    ],
  },
  {
    label: "Show",
    items: [
      { r: "demo", label: "Demo", icon: ProjectorScreenChart },
    ],
  },
];

const href = (r: Route) => (r === "ops" ? "#/" : `#/${r}`);

// Key D anywhere in the console flips between the demo view and Operations (never while typing in a field).
function typing(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

/** rail: always the thin icon rail (the < 1240 px look) at every width above phones; phones keep their top header. */
export default function Sidebar({ route, ops, rail = false }: { route: Route; ops: Ops; rail?: boolean }) {
  const s = ops.s;
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const active = s ? Object.keys(s.active).length : 0;
  const pending = !!s?.autopilot?.pending;
  const plantLive = !!s?.households?.blatnica?.telemetry;
  const warnings = ops.weather.data?.warnings?.length ?? 0;
  const tfs = s ? Object.keys(s.tree).filter((n) => n.startsWith("tf:")) : [];
  const over = s ? tfs.filter((t) => Math.abs(s.aggregates[t]?.load_pct ?? 0) >= 100).length : 0;

  // Phones: the menu closes once a section is picked.
  useEffect(() => setOpen(false), [route]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "d" && e.key !== "D") return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.defaultPrevented || typing(e.target)) return;
      e.preventDefault();
      window.location.hash = /^#\/demo\b/.test(window.location.hash) ? "#/" : "#/demo";
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const current = SECTIONS.flatMap((x) => x.items).find((i) => i.r === route)?.label ?? "Operations";

  const extra = (r: Route) => {
    if (r === "city" && over) return <span className="sb-badge is-orange" title={`${over} transformers over their limit`}>{over}</span>;
    if (r === "autopilot" && pending) return <span className="sb-badge is-blue" title="A proposal is waiting for you">1</span>;
    if (r === "manual" && active) return <span className="sb-badge" title={`${active} signals active`}>{active}</span>;
    if (r === "plant") return <span className={`sb-dot${plantLive ? " is-green" : ""}`} title={plantLive ? "The plant is reporting" : "Waiting for the plant"} />;
    if (r === "weather" && warnings) return <span className="sb-badge is-orange" title={`${warnings} weather warnings`}>{warnings}</span>;
    return null;
  };

  return (
    <nav className={`sb${rail ? " is-rail" : ""}${open ? " is-open" : ""}`} aria-label="Console sections">
      <a className="sb-brand" href="#/" aria-label="Gridzilla operations">
        <span className="sb-logo"><Lightning size={16} weight="fill" /></span>
        <span className="sb-brand-txt">
          <div className="sb-name">Gridzilla</div>
          <div className="sb-sub">Operations · Vienna</div>
        </span>
      </a>
      <span className="sb-cur">{current}</span>
      <button type="button" className="sb-menu" aria-expanded={open} aria-controls="sb-nav" onClick={() => setOpen((o) => !o)}>
        <List size={16} weight="bold" /> {open ? "Close" : "Menu"}
      </button>
      <LayoutGroup id="sb">
        <div className="sb-nav" id="sb-nav" data-scroll="nav">
          {SECTIONS.map((sec) => (
            <div key={sec.label} style={{ display: "contents" }}>
              <div className="sb-sec">{sec.label}</div>
              {sec.items.map(({ r, label, icon: I }) => {
                const on = r === route;
                return (
                  <a key={r} className="sb-item" href={href(r)} data-label={label} aria-current={on ? "page" : undefined}>
                    {on && (
                      <motion.span
                        layoutId="sb-pill"
                        className="sb-pill"
                        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 40, mass: 0.7 }}
                      />
                    )}
                    <span className="sb-ico"><I size={17} weight={on ? "fill" : "regular"} /></span>
                    <span className="sb-lbl">{label}</span>
                    {extra(r)}
                  </a>
                );
              })}
            </div>
          ))}
        </div>
      </LayoutGroup>
      <div className="sb-foot" title={ops.error ? "The platform stopped answering; the last data stays on screen" : "Live from the local platform"}>
        <span className={`sb-dot${ops.error ? "" : " is-green"}`} style={ops.error ? { background: "var(--sh-red)" } : undefined} />
        <span className="sb-foot-txt">{ops.error ? "Platform not answering" : "Live · updates every 3 s"}</span>
      </div>
    </nav>
  );
}
