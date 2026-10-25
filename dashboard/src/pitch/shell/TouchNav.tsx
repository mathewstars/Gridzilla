// Touch controls (phones and touch screens only): a small slide counter and two round arrow buttons bottom right.
// They show on every touch and fade after 2 s without one, so the slide is clean while it is read. Taps and swipes on
// the slide itself also move (Deck.tsx); the buttons are for people who do not guess that.
import { useEffect, useState } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";

const IDLE_MS = 2000;

export default function TouchNav({ n, total, canBack, canNext, onBack, onNext }: { n: number; total: number; canBack: boolean; canNext: boolean; onBack: () => void; onNext: () => void }) {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    let t = window.setTimeout(() => setShown(false), IDLE_MS);
    const on = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      setShown(true);
      window.clearTimeout(t);
      t = window.setTimeout(() => setShown(false), IDLE_MS);
    };
    window.addEventListener("pointerdown", on, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pointerdown", on, true);
    };
  }, []);
  return (
    <div className={`p-touch${shown ? "" : " is-idle"}`} data-chrome>
      <span className="p-touch-count" aria-live="polite">
        {n} of {total}
      </span>
      <button type="button" className="p-touch-btn" aria-label="Back" disabled={!canBack} onClick={onBack}>
        <CaretLeft size={20} weight="bold" />
      </button>
      <button type="button" className="p-touch-btn" aria-label="Next" disabled={!canNext} onClick={onNext}>
        <CaretRight size={20} weight="bold" />
      </button>
    </div>
  );
}
