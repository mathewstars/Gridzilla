// The nav, drawn on the hero frame: the wordmark top left, the six section links in a white notch cut into the frame's
// top edge (inverted-curve notch adapted from 21st.dev "Adaptive Notch Navigation Bar" by @arunachalam), the console
// pill top right. Under 1024 px: wordmark, the pill (from 390 up) and a menu button that opens a sheet with the links.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { List, X } from "@phosphor-icons/react";
import { PillLink } from "../ui/Button";
import { LINKS } from "../lib/links";
import { EASE } from "../ui/Reveal";

export const NAV = [
  { id: "how", label: "How it works" },
  { id: "words", label: "Six words" },
  { id: "proof", label: "Proof" },
  { id: "plant", label: "Real plant" },
  { id: "security", label: "Security" },
  { id: "team", label: "Team" },
] as const;

/** The concave fillet that joins the notch to the frame's top edge (page white, like the notch). */
function Wing({ side }: { side: "left" | "right" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={`pointer-events-none absolute top-0 size-5 ${side === "left" ? "right-full" : "left-full"}`}
      shapeRendering="geometricPrecision"
    >
      <path d={side === "left" ? "M 0 0 C 11.046 0 20 8.954 20 20 H 21 V -1 H 0 Z" : "M 20 0 C 8.954 0 0 8.954 0 20 H -1 V -1 H 20 Z"} fill="var(--color-page)" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <a href="#top" className="font-display text-[19px] font-semibold uppercase tracking-[0.04em] text-ink no-underline lg:text-[21px]" aria-label="Gridzilla, back to the top">
      Gridzilla
    </a>
  );
}

export default function Nav() {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const menuBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        menuBtn.current?.focus();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <nav aria-label="Main" className="absolute inset-x-0 top-0 z-30">
      <div className="flex h-16 items-center justify-between gap-3 pl-5 pr-3 lg:h-[72px] lg:pl-8 lg:pr-4">
        <Wordmark />

        {/* the notch: page white bitten into the frame, the six links inside */}
        <div className="absolute left-1/2 top-0 hidden h-[60px] -translate-x-1/2 items-center rounded-b-[24px] bg-page px-2.5 lg:flex">
          <Wing side="left" />
          <Wing side="right" />
          <ul className="m-0 flex list-none items-center gap-0.5 p-0">
            {NAV.map((n) => (
              <li key={n.id}>
                <a
                  href={`#${n.id}`}
                  className="flex h-10 items-center whitespace-nowrap rounded-full px-[14px] text-[14px] font-medium text-ink no-underline transition-colors duration-150 hover:bg-ground active:bg-fill xl:px-4"
                >
                  {n.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center gap-2">
          <PillLink href={LINKS.console} size="sm" badge className="nav-cta max-[339px]:hidden">
            Open the console
          </PillLink>
          <button
            ref={menuBtn}
            type="button"
            aria-label={open ? "Close the menu" : "Open the menu"}
            aria-expanded={open}
            aria-controls="nav-sheet"
            onClick={() => setOpen((o) => !o)}
            className="grid size-10 cursor-pointer place-items-center rounded-full border-0 bg-surface text-ink shadow-[inset_0_0_0_1px_rgb(29_29_31/0.1),0_4px_14px_rgb(29_39_52/0.08)] transition-[background-color,transform] duration-150 hover:bg-ground active:scale-[0.96] active:bg-fill lg:hidden"
          >
            {open ? <X size={18} weight="bold" /> : <List size={18} weight="bold" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            id="nav-sheet"
            initial={reduce ? false : { opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="absolute inset-x-3 top-[68px] origin-top rounded-[24px] bg-surface p-3 shadow-[var(--shadow-lift)] lg:hidden"
          >
            <ul className="m-0 list-none p-0">
              {NAV.map((n) => (
                <li key={n.id}>
                  <a
                    href={`#${n.id}`}
                    onClick={() => setOpen(false)}
                    className="flex h-14 items-center rounded-[16px] px-4 font-display text-[22px] font-medium text-ink no-underline transition-colors duration-150 hover:bg-ground active:bg-fill"
                  >
                    {n.label}
                  </a>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
