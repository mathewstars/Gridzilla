// Slide 5, the live demo: the stage itself, full-bleed, imported from src/stage (never copied, never edited).
// The shell keeps this slide mounted off-screen from the first frame (keepMounted), so the data is warm and the 3D street
// is already built when it comes on; the street pauses itself while off-screen (it watches its own visibility).
// Keys: the stage listens on window for 1-4 (scenarios) and F. 1-4 reach it on this slide and on the title slide (the
// run of show says: press 2 before you walk up, so the evening peak is already building). On every other slide a stray
// number key never changes the live scenario. Left, Right and F are the shell's (it stops them first).
import { useEffect, useRef, useState } from "react";
import Stage from "../../stage/Stage";
import Tour5 from "./Tour5";
import type { SlideProps } from "../types";
import "./slide5.css";

/** True when the stage's card rule reads a theme variable (the stage is dark-ready). Read from the stylesheet itself, so
 *  the light fallback below can never make it look themed or unthemed. Unknown: trust the stage. */
function stageFollowsTheme(): boolean {
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const r of Array.from(rules)) {
      if (r instanceof CSSStyleRule && r.selectorText === ".gzS-card") {
        const bg = r.style.getPropertyValue("background") || r.style.getPropertyValue("background-color");
        if (bg) return bg.includes("var(");
      }
    }
  }
  return true;
}

export default function Slide5({ active, step, tourOff }: SlideProps) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const on = useRef(active);
  on.current = active;
  // In the dark deck, a stage that still paints white cards keeps its light tokens (slide5.css), so no white-on-white text.
  const [light, setLight] = useState(false);
  useEffect(() => {
    const check = () => setLight(!stageFollowsTheme());
    check();
    const id = window.setTimeout(check, 500); // dev: the stage's CSS may land a moment after this slide mounts
    return () => window.clearTimeout(id);
  }, []);

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
    <div ref={setRoot} className={`p-stage${light ? " p-stage-light" : ""}`} data-slide="5">
      <Stage />
      {active && step >= 1 && !tourOff && <Tour5 step={step} root={root} />}
    </div>
  );
}
