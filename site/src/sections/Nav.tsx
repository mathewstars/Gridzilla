// The nav: a plain bar across the top of the page, on the content width (wordmark left, the six section links centred,
// the white console pill right). Over the hero it has no background at all, like the deck's title slide; once the page
// scrolls it becomes a thin glass strip (blur and a hairline). Under 1024 px: wordmark, the pill (from 340 up) and a
// menu button that opens a sheet with the links.
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

export function Wordmark() {
  return (
    <a href="#top" className="inline-flex min-h-11 items-center font-display text-[19px] font-semibold uppercase tracking-[0.04em] text-ink no-underline lg:text-[21px]" aria-label="Gridzilla, back to the top">
      Gridzilla
    </a>
  );
}

export default function Nav() {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const menuBtn = useRef<HTMLButtonElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const on = () => setScrolled(scrollY > 8);
    on();
    addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, []);

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
    <nav aria-label="Main" className={`nav-bar fixed inset-x-0 top-0 z-50 ${scrolled || open ? "is-scrolled" : ""}`}>
      <div className="relative mx-auto flex h-16 w-full max-w-[calc(var(--content)+2*var(--gutter))] items-center justify-between gap-3 px-[var(--gutter)] lg:h-[72px]">
        <Wordmark />

        {/* the six links, centred on the bar */}
        <div className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 lg:flex">
          <ul className="m-0 flex list-none items-center gap-0.5 p-0">
            {NAV.map((n) => (
              <li key={n.id}>
                <a
                  href={`#${n.id}`}
                  className="flex h-10 items-center whitespace-nowrap rounded-full px-[14px] text-[14px] font-medium text-ink no-underline transition-colors duration-150 hover:bg-fill active:bg-press xl:px-4"
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
            className="grid size-11 cursor-pointer place-items-center rounded-full border-0 bg-surface text-ink shadow-[inset_0_0_0_1px_var(--color-hairline),0_8px_24px_rgb(0_0_0/0.25)] transition-[background-color,transform] duration-150 hover:bg-fill active:scale-[0.96] active:bg-press lg:hidden"
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
            className="absolute inset-x-3 top-[68px] mx-auto max-w-[560px] origin-top rounded-[24px] bg-surface p-3 shadow-[var(--shadow-lift)] lg:hidden"
          >
            <ul className="m-0 list-none p-0">
              {NAV.map((n) => (
                <li key={n.id}>
                  <a
                    href={`#${n.id}`}
                    onClick={() => setOpen(false)}
                    className="flex h-14 items-center rounded-[16px] px-4 font-display text-[22px] font-medium text-ink no-underline transition-colors duration-150 hover:bg-fill active:bg-press"
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
