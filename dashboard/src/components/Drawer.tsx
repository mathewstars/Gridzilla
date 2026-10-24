// Details drawer: a white sheet from the right over a lightly dimmed board. Tabs: the houses on the selected feeder,
// the event log, and the fail-safe demo. Esc or the scrim closes it; Tab stays inside while it is open.
// Motion: one straight 0.25 s ease-out slide (CSS @starting-style in, a class out), no spring, no blur.
import { X } from "@phosphor-icons/react";
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
const SLIDE_MS = 250;
const ease = "duration-[250ms] ease-[cubic-bezier(0,0,0.5,1)]";

function Sheet({ s, feeder, closing, onClose }: { s: State; feeder: string; closing: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("houses");
  const ref = useRef<HTMLDivElement>(null);
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
      <div
        className={`fixed inset-0 z-40 bg-black/25 transition-opacity ${ease} starting:opacity-0 ${closing ? "pointer-events-none opacity-0" : "opacity-100"}`}
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={ref}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby="drawer-title"
        className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-card shadow-[0_24px_80px_rgb(0_0_0/0.18)] outline-none transition-transform ${ease} starting:translate-x-[105%] sm:inset-y-3 sm:right-3 sm:w-[min(48rem,calc(100vw-1.5rem))] sm:rounded-[18px] ${closing ? "translate-x-[105%]" : "translate-x-0"}`}
      >
        <div className="flex items-start gap-4 px-5 pb-4 pt-5 sm:px-7 sm:pt-6">
          <div className="min-w-0 flex-1">
            <h2 id="drawer-title" className="t-headline text-ink">
              Details
            </h2>
            <div className="t-small mt-1">
              {nice(feeder)} feeder, {tfs.length} transformers, {houses} houses. Busiest at <LoadPill pct={feederWorst(s, feeder)} size="sm" />
            </div>
          </div>
          <button type="button" onClick={onClose} className="btn btn-white size-10 shrink-0 !rounded-full !p-0" aria-label="Close details">
            <X size={18} weight="bold" aria-hidden />
          </button>
        </div>
        <div className="px-5 pb-3 sm:px-7">
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
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-6 pt-2 sm:px-5">
          <div className="px-2">{tab === "houses" ? <HousesTab s={s} feeder={feeder} /> : tab === "log" ? <LogTab s={s} /> : <FailsafeTab s={s} />}</div>
        </div>
      </div>
    </>
  );
}

export default function Drawer({ s, feeder, open, onClose }: { s: State; feeder: string; open: boolean; onClose: () => void }) {
  // Stay mounted for one slide after closing so the sheet can leave the way it came.
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const t = window.setTimeout(() => setMounted(false), SLIDE_MS);
    return () => window.clearTimeout(t);
  }, [open]);
  if (!open && !mounted) return null;
  return <Sheet s={s} feeder={feeder} closing={!open} onClose={onClose} />;
}
