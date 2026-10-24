// Details drawer: a right-side sheet over a dimmed board. Tabs: the houses on the selected feeder, the event log,
// and the fail-safe demo. Esc or the scrim closes it; Tab stays inside while it is open.
import { X } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { State } from "../api";
import { housesOf, nice, tfsOf } from "../model";
import { Segmented } from "./ui";
import FailsafeTab from "./chrome/FailsafeTab";
import HousesTab from "./chrome/HousesTab";
import LogTab from "./chrome/LogTab";
import { LoadPill, feederWorst } from "./chrome/shared";

type Tab = "houses" | "log" | "failsafe";
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

function Sheet({ s, feeder, onClose }: { s: State; feeder: string; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("houses");
  const ref = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion();
  // App hands a fresh onClose every render; keep the latest in a ref so the focus effect runs only once per open.
  const close = useRef(onClose);
  close.current = onClose;

  // Focus moves into the sheet, Tab cycles inside it, Esc closes; focus returns to where it was.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close.current();
        return;
      }
      if (e.key !== "Tab" || !ref.current) return;
      const els = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!els.length) return;
      const first = els[0],
        last = els[els.length - 1];
      if (!ref.current.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, []);

  const tfs = tfsOf(s, feeder);
  const houses = tfs.reduce((a, tf) => a + housesOf(s, tf).length, 0);

  return (
    <>
      <motion.div
        className="fixed inset-0 z-40 bg-[rgb(2_4_8/0.62)] backdrop-blur-[3px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduce ? 0 : 0.25 }}
        onClick={onClose}
        aria-hidden
      />
      <motion.div
        ref={ref}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby="drawer-title"
        className="fixed inset-y-0 right-0 z-50 flex w-full flex-col outline-none bg-deck shadow-[inset_1px_0_0_rgb(255_255_255/0.07),-40px_0_120px_-30px_rgb(0_0_0/0.9)] sm:inset-y-3 sm:right-3 sm:w-[min(46rem,calc(100vw-1.5rem))] sm:rounded-[1.4rem] sm:shadow-[inset_0_1px_0_rgb(255_255_255/0.08),inset_0_0_0_1px_rgb(255_255_255/0.06),-40px_0_120px_-30px_rgb(0_0_0/0.9)]"
        style={{ backgroundImage: "radial-gradient(90% 40% at 100% 0%, rgb(51 225 201 / 0.06), transparent 60%)" }}
        initial={reduce ? { opacity: 0 } : { x: "104%" }}
        animate={reduce ? { opacity: 1 } : { x: 0 }}
        exit={reduce ? { opacity: 0 } : { x: "104%" }}
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 340, damping: 36 }}
      >
        <div className="flex items-start gap-4 px-5 pb-4 pt-5 sm:px-6">
          <div className="min-w-0 flex-1">
            <h2 id="drawer-title" className="text-[1.35rem] font-semibold leading-tight tracking-[-0.02em]">
              Details
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.86rem] text-dim">
              <span>
                {nice(feeder)} feeder, {tfs.length} transformers, {houses} houses
              </span>
              <LoadPill pct={feederWorst(s, feeder)} size="sm" />
            </div>
          </div>
          <button ref={closeBtn} type="button" onClick={onClose} className="btn !px-2.5" aria-label="Close details">
            <X size={17} weight="bold" aria-hidden />
          </button>
        </div>
        <div className="scroll-thin overflow-x-auto px-5 pb-3 sm:px-6">
          <Segmented
            id="drawer-tab"
            value={tab}
            onChange={setTab}
            options={[
              { value: "houses", label: "Houses" },
              { value: "log", label: "Log" },
              { value: "failsafe", label: "Fail-safe demo" },
            ]}
          />
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-6 pt-2 sm:px-4">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tab}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="px-2"
            >
              {tab === "houses" ? <HousesTab s={s} feeder={feeder} /> : tab === "log" ? <LogTab s={s} /> : <FailsafeTab s={s} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </>
  );
}

export default function Drawer({ s, feeder, open, onClose }: { s: State; feeder: string; open: boolean; onClose: () => void }) {
  return <AnimatePresence>{open && <Sheet key="drawer" s={s} feeder={feeder} onClose={onClose} />}</AnimatePresence>;
}
