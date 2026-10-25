// Slide 6 (file Slide5), the live demo: the console's OPERATIONS view (OperationsView from src/ops/ops2, imported, never
// copied or edited), full-bleed, opening on all of Vienna (the console's default node, region:at): Saved tonight, the
// Vienna chart with its chips, the newest events, What the AI did and the real Blatnica plant. The shell keeps this
// slide mounted off-screen from the first frame (keepMounted), so its data is warm and it appears the moment the monster
// slide is left. Steps 1-5 are the walkthrough (Tour5.tsx): each Right lights one area with a caption.
// Keys: 1-4 set the live scenario here (normal, cold evening, sunny noon, live weather), on this slide and on the title
// slide (the run of show: press 2 before you walk up). In read-only live mode (?api=) those POSTs are refused in the
// page. Left, Right, F, Esc and D belong to the shell.
import { useEffect, useRef, useState } from "react";
import OperationsView from "../../ops/ops2/OperationsView";
import { useOps } from "../../ops/useOps";
import { post } from "../../api";
import Tour5 from "./Tour5";
import type { SlideProps } from "../types";
import "./slide5.css";

const SCENARIOS = ["normal", "cold-evening", "sunny-noon", "live-weather"];

export default function Slide5({ active, step, tourOff }: SlideProps) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const on = useRef(active);
  on.current = active;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || !/^[1-4]$/.test(e.key)) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      const onTitle = (window as unknown as { __pitch?: { slide?: number } }).__pitch?.slide === 1;
      if (!on.current && !onTitle) return;
      e.preventDefault();
      post(`scenario/${SCENARIOS[Number(e.key) - 1]}`).catch(() => {});
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div ref={setRoot} className="p-stage" data-slide="6">
      <OpsLive />
      {active && step >= 1 && !tourOff && <Tour5 step={step} root={root} />}
    </div>
  );
}

/** The Operations view on its own data hook (the console's useOps), as the console's #/ops route shows it. */
function OpsLive() {
  const ops = useOps();
  return ops.s ? <OperationsView ops={ops} /> : <div className="p-stage-wait">Connecting to the grid.</div>;
}
