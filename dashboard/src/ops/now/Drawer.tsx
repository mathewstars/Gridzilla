// The signal composer in a drawer: slides in from the right over a flat scrim, Escape or the scrim closes it. The form
// itself is the control plane's Composer (same endpoints and bodies as the team board's Manual tab).
import { useEffect } from "react";
import { X } from "@phosphor-icons/react";
import type { Ops } from "../useOps";
import { Composer } from "../control/SignalCard";

export default function Drawer({ open, onClose, ops }: { open: boolean; onClose: () => void; ops: Ops }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [open, onClose]);
  return (
    <div className={`drw${open ? " is-open" : ""}`} aria-hidden={!open}>
      <div className="drw-scrim" onClick={onClose} />
      <aside className="drw-sheet" role="dialog" aria-label="New signal">
        <header className="drw-head">
          <h2 className="now-title">New signal</h2>
          <button type="button" className="btn drw-x" onClick={onClose} aria-label="Close">
            <X size={14} weight="bold" />
          </button>
        </header>
        {open && <Composer ops={ops} />}
      </aside>
    </div>
  );
}
