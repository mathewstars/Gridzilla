// A bottom sheet for phones (the Menu and More of the phone shell): rises from the bottom over a dim scrim, a title and a
// Close button on top, safe-area padding below. Escape, the scrim or Close shut it, and the focus goes back to the button
// that opened it.
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "@phosphor-icons/react";

export default function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const reduce = useReducedMotion();
  const panel = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLElement | null>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    back.current = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => panel.current?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      close.current();
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      back.current?.focus?.();
    };
  }, [open]);

  const ease = [0, 0, 0.5, 1] as const;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="sheet-wrap" key="sheet">
          <motion.button
            type="button"
            className="sheet-scrim"
            aria-label="Close"
            tabIndex={-1}
            onClick={onClose}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0 }}
            transition={{ duration: 0.25, ease }}
          />
          <motion.div
            ref={panel}
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            initial={reduce ? false : { y: "100%" }}
            animate={{ y: 0 }}
            exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { y: "100%" }}
            transition={{ duration: 0.25, ease }}
          >
            <div className="sheet-head">
              <h2 className="sheet-title">{title}</h2>
              <button type="button" className="sheet-x" aria-label="Close" onClick={onClose}>
                <X size={18} weight="bold" />
              </button>
            </div>
            <div className="sheet-body">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
