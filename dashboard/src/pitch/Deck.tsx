// The deck shell (minimal first version; the shell builder owns this file, see PITCH.md "Shell").
// Scales the 1920x1080 canvas to the window, keeps the live stage mounted, and moves through slides and build steps.
// URL: ?slide=N (1-based) &step=S (0-based) &freeze=end (final state at once, for QA and print).
import { useEffect, useMemo, useState } from "react";
import { SLIDES } from "./slides";
import type { JingleState } from "./types";
import "./deck.css";

const W = 1920;
const H = 1080;

function useScale() {
  const fit = () => Math.min(window.innerWidth / W, window.innerHeight / H);
  const [s, setS] = useState(fit);
  useEffect(() => {
    const on = () => setS(fit());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return s;
}

export default function Deck() {
  const q = useMemo(() => new URLSearchParams(location.search), []);
  const [pos, setPos] = useState(() => ({
    i: Math.min(Math.max(Number(q.get("slide") || 1) - 1, 0), SLIDES.length - 1),
    step: Number(q.get("step") || 0),
  }));
  const freeze = q.get("freeze") === "end" ? "end" : null;
  const [jingle] = useState<JingleState>(freeze ? "ended" : "idle");
  const scale = useScale();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        setPos((p) => (p.step < SLIDES[p.i].steps - 1 ? { ...p, step: p.step + 1 } : { i: Math.min(p.i + 1, SLIDES.length - 1), step: 0 }));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        setPos((p) => (p.step > 0 ? { ...p, step: p.step - 1 } : p.i > 0 ? { i: p.i - 1, step: SLIDES[p.i - 1].steps - 1 } : p));
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const left = (window.innerWidth - W * scale) / 2;
  const top = (window.innerHeight - H * scale) / 2;

  return (
    <div className="p-deck">
      {SLIDES.map((d, i) => {
        const on = i === pos.i;
        if (!on && !d.keepMounted) return null;
        const el = <d.Component step={on ? pos.step : 0} active={on} freeze={freeze} jingle={jingle} />;
        if (d.fullBleed)
          return (
            <div key={d.id} className={`p-bleed${on ? "" : " p-off"}`} aria-hidden={!on}>
              {el}
            </div>
          );
        return (
          <div key={d.id} className="p-canvas" style={{ transform: `translate(${left}px, ${top}px) scale(${scale})` }}>
            {el}
          </div>
        );
      })}
    </div>
  );
}
