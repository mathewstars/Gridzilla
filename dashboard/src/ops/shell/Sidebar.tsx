// Left sidebar of the operations console. Adapted from the 21st.dev "Sidebar" by @wensity (design/21st/sidebar-shell.tsx):
// live badges and an active pill that glides between items (motion layoutId). Three entries (Operations, Diet plan, Real
// plant); City, Autopilot, Manual, Households and Log sit under one More menu at the bottom (Weather by URL only, #/weather). Full
// width at >= 1240, an icon rail with hover labels below that. Phones (under 900 px) get TabBar.tsx instead.
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import {
  Broadcast,
  ChartLineDown,
  DotsThreeCircle,
  GridFour,
  HouseLine,
  Lightning,
  List,
  ListBullets,
  Robot,
  SlidersHorizontal,
  SolarPanel,
  type Icon,
} from "@phosphor-icons/react";
import type { Ops } from "../useOps";
import "./shell.css";

export type Route = "ops" | "city" | "autopilot" | "manual" | "households" | "plant" | "weather" | "log" | "demo" | "plan";

type Item = { r: Route; label: string; icon: Icon };
export const MAIN: Item[] = [
  { r: "ops", label: "Operations", icon: Broadcast },
  { r: "plan", label: "Diet plan", icon: ChartLineDown },
  { r: "plant", label: "Real plant", icon: SolarPanel },
];
export const MORE: Item[] = [
  { r: "city", label: "City", icon: GridFour },
  { r: "autopilot", label: "Autopilot", icon: Robot },
  { r: "manual", label: "Manual", icon: SlidersHorizontal },
  { r: "households", label: "Households", icon: HouseLine },
  { r: "log", label: "Log", icon: ListBullets },
];

export const href = (r: Route) => (r === "ops" ? "#/" : `#/${r}`);


/** rail: always the thin icon rail (the < 1240 px look) at every width above phones; phones keep their top header. */
export default function Sidebar({ route, ops, rail = false }: { route: Route; ops: Ops; rail?: boolean }) {
  const s = ops.s;
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const moreBtn = useRef<HTMLButtonElement>(null);
  const moreBox = useRef<HTMLDivElement>(null);
  const active = s ? Object.keys(s.active).length : 0;
  const pending = !!s?.autopilot?.pending;
  const plantLive = !!s?.households?.blatnica?.telemetry;
  const tfs = s ? Object.keys(s.tree).filter((n) => n.startsWith("tf:")) : [];
  const over = s ? tfs.filter((t) => Math.abs(s.aggregates[t]?.load_pct ?? 0) >= 100).length : 0;
  const inMore = MORE.find((i) => i.r === route);

  // Phones: the menu closes once a section is picked; the More menu too, everywhere.
  useEffect(() => {
    setOpen(false);
    setMore(false);
  }, [route]);

  // More menu: a press outside closes it; Escape closes it and hands focus back to the More button.
  useEffect(() => {
    if (!more) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!moreBox.current?.contains(t) && !moreBtn.current?.contains(t)) setMore(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setMore(false);
      moreBtn.current?.focus();
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [more]);
  const items = () => Array.from(moreBox.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
  const focusItem = (i: number | "current") => {
    const all = items();
    const at = i === "current" ? Math.max(0, all.findIndex((el) => el.getAttribute("aria-current") === "page")) : (i + all.length) % all.length;
    all[at]?.focus();
  };
  // Opened by keyboard (Enter, Space, arrows), the focus moves into the menu: the open page, else the first entry.
  const openMore = (focus: number | "current" | null) => {
    setMore(true);
    if (focus !== null) requestAnimationFrame(() => focusItem(focus));
  };
  const onBtnKey = (e: ReactKeyboardEvent) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      openMore(e.key === "ArrowUp" ? -1 : 0);
    }
  };
  const onMenuKey = (e: ReactKeyboardEvent) => {
    const all = items();
    const i = all.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") focusItem(i + 1);
    else if (e.key === "ArrowUp") focusItem(i - 1);
    else if (e.key === "Home") focusItem(0);
    else if (e.key === "End") focusItem(-1);
    else if (e.key === "Tab") return setMore(false);
    else return;
    e.preventDefault();
  };

  const current = [...MAIN, ...MORE].find((i) => i.r === route)?.label ?? "Operations";

  const extra = (r: Route) => {
    if (r === "city" && over) return <span className="sb-badge is-orange" title={`${over} transformers over their limit`} data-src="derived" data-from="count(state/aggregates/tf:*[abs(load_pct) >= 100])" data-val={over}>{over}</span>;
    if (r === "autopilot" && pending) return <span className="sb-badge is-blue" title="A proposal is waiting for you" data-src="axis">1</span>;
    if (r === "manual" && active) return <span className="sb-badge" title={`${active} signals active`} data-src="derived" data-from="count(state/active/*)" data-val={active}>{active}</span>;
    if (r === "plant") return <span className={`sb-dot${plantLive ? " is-green" : ""}`} title={plantLive ? "The plant is reporting" : "Waiting for the plant"} />;
    return null;
  };
  // The More button says when something inside needs a look: a waiting proposal first, then anything over its limit.
  const moreFlag = pending ? "is-blue" : over ? "is-orange" : "";
  const moreFlagTip = pending ? "A proposal is waiting in Autopilot" : over ? `${over} transformers over their limit (City)` : "";

  const pill = (
    <motion.span layoutId="sb-pill" className="sb-pill" transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 40, mass: 0.7 }} />
  );

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
        <div className="sb-nav" id="sb-nav">
          {MAIN.map(({ r, label, icon: I }) => {
            const on = r === route;
            return (
              <a key={r} className="sb-item" href={href(r)} data-label={label} aria-current={on ? "page" : undefined}>
                {on && pill}
                <span className="sb-ico"><I size={17} weight={on ? "fill" : "regular"} /></span>
                <span className="sb-lbl">{label}</span>
                {extra(r)}
              </a>
            );
          })}
          <div className="sb-more">
            <AnimatePresence>
              {more && (
                <motion.div
                  ref={moreBox}
                  key="menu"
                  id="sb-more-menu"
                  className="sb-pop"
                  role="menu"
                  aria-label="More sections"
                  onKeyDown={onMenuKey}
                  initial={reduce ? false : { opacity: 0, y: 6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: 4, scale: 0.98, transition: { duration: 0.1 } }}
                  transition={{ type: "spring", stiffness: 700, damping: 44, mass: 0.6 }}
                >
                  {MORE.map(({ r, label, icon: I }) => {
                    const on = r === route;
                    return (
                      <a key={r} className="sb-pop-item" role="menuitem" href={href(r)} aria-current={on ? "page" : undefined} onClick={() => setMore(false)}>
                        <span className="sb-ico"><I size={17} weight={on ? "fill" : "regular"} /></span>
                        <span className="sb-lbl">{label}</span>
                        {extra(r)}
                      </a>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
            <button
              ref={moreBtn}
              type="button"
              className={`sb-item sb-more-btn${more ? " is-open" : ""}`}
              data-label={inMore ? `More · ${inMore.label}` : "More"}
              aria-haspopup="menu"
              aria-expanded={more}
              aria-controls={more ? "sb-more-menu" : undefined}
              aria-current={inMore ? "page" : undefined}
              onClick={(e) => (more ? setMore(false) : openMore(e.detail === 0 ? "current" : null))}
              onKeyDown={onBtnKey}
            >
              {inMore && pill}
              <span className="sb-ico"><DotsThreeCircle size={17} weight={inMore || more ? "fill" : "regular"} /></span>
              <span className="sb-lbl">More{inMore && <span className="sb-lbl-sub"> · {inMore.label}</span>}</span>
              {moreFlag && <span className={`sb-flag ${moreFlag}`} title={moreFlagTip} />}
            </button>
          </div>
        </div>
      </LayoutGroup>
      <div className="sb-foot" title={ops.error ? "The platform stopped answering; the last data stays on screen" : "Live from the local platform"}>
        <span className={`sb-dot${ops.error ? "" : " is-green"}`} style={ops.error ? { background: "var(--sh-red)" } : undefined} />
        <span className="sb-foot-txt">{ops.error ? "Platform not answering" : <>Live · updates every <span data-src="axis">3</span> s</>}</span>
      </div>
    </nav>
  );
}
