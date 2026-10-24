// Slide 5, the live demo: the stage itself, full-bleed, imported from src/stage (never copied, never edited).
// The shell keeps this slide mounted off-screen from the first frame (keepMounted), so the data is warm and the 3D street
// is already built when it comes on; the street pauses itself while off-screen (it watches its own visibility).
// Keys: the stage listens on window for 1-4 (scenarios) and F. 1-4 reach it on this slide and on the title slide (the
// run of show says: press 2 before you walk up, so the evening peak is already building). On every other slide a stray
// number key never changes the live scenario. Left, Right and F are the shell's (it stops them first).
import { useEffect, useRef } from "react";
import Stage from "../../stage/Stage";
import type { SlideProps } from "../types";
import "./slide5.css";

export default function Slide5({ active }: SlideProps) {
  const on = useRef(active);
  on.current = active;

  useEffect(() => {
    // Capture phase on window runs before the stage's own (bubble phase) window listener; stopPropagation there keeps the
    // key from it without touching other capture listeners on window (the shell's).
    const guard = (e: KeyboardEvent) => {
      const onTitle = (window as unknown as { __pitch?: { slide?: number } }).__pitch?.slide === 1;
      if (!on.current && !onTitle && /^[1-4]$/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) e.stopPropagation();
    };
    window.addEventListener("keydown", guard, true);
    return () => window.removeEventListener("keydown", guard, true);
  }, []);

  return (
    <div className="p-stage" data-slide="5">
      <Stage />
    </div>
  );
}
