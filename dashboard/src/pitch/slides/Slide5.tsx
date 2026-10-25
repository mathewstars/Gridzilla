// Slide 6 (file Slide5), the live demo: the console's OPERATIONS view (OperationsView from src/ops/ops2, imported, never
// copied or edited), opening on all of Vienna (the console's default node, region:at): Saved tonight, the Vienna chart
// with its chips, the newest events, What the AI did and the real Blatnica plant. It runs in an iframe (pitch-ops.html,
// opsFrame.tsx) of exactly 1920x1080 CSS px, scaled by transform and centred like the deck's canvas, so the console's
// media queries, vh and vw see the design frame, not the window: two columns on every screen. The shell keeps this
// slide mounted off-screen from the first frame (keepMounted), so its data is warm and it appears the moment the monster
// slide is left. Steps 1-5 are the walkthrough (Tour5.tsx): each Right lights one area with a caption.
// Keys: 1-4 set the live scenario here (normal, cold evening, sunny noon, live weather), on this slide and on the title
// slide (the run of show: press 2 before you walk up). In read-only live mode (?api=) those POSTs are refused in the
// page. Left, Right, F, Esc and D belong to the shell.
import { useEffect, useRef, useState } from "react";
import { post } from "../../api";
import Tour5 from "./Tour5";
import type { SlideProps } from "../types";
import "./slide5.css";

const SCENARIOS = ["normal", "cold-evening", "sunny-noon", "live-weather"];

/** The Operations frame: the deck's design size, scaled to fit the window and centred (letterboxed on the ground). */
const FRAME_W = 1920;
const FRAME_H = 1080;
const fitOf = () => {
  const k = Math.min(window.innerWidth / FRAME_W, window.innerHeight / FRAME_H);
  return { k, x: (window.innerWidth - FRAME_W * k) / 2, y: (window.innerHeight - FRAME_H * k) / 2 };
};

export default function Slide5({ active, step, tourOff }: SlideProps) {
  const [frame, setFrame] = useState<HTMLIFrameElement | null>(null);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [fit, setFit] = useState(fitOf);
  useEffect(() => {
    const on = () => setFit(fitOf());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  // The frame's own document follows the deck's theme (D toggles data-theme on the deck's <html>).
  useEffect(() => {
    const doc = frame?.contentDocument;
    if (!root || !doc) return;
    const copy = () => {
      const t = document.documentElement.dataset.theme;
      if (t) doc.documentElement.dataset.theme = t;
    };
    copy();
    const mo = new MutationObserver(copy);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, [frame, root]);
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
    <div className="p-stage p-stage-framed" data-slide="6">
      <iframe
        ref={setFrame}
        className="p-ops-frame"
        src={`pitch-ops.html${location.search}`}
        title="Gridzilla operations, live"
        width={FRAME_W}
        height={FRAME_H}
        style={{ transform: `translate(${fit.x}px, ${fit.y}px) scale(${fit.k})` }}
        onLoad={(e) => setRoot(e.currentTarget.contentDocument?.body ?? null)}
      />
      {active && step >= 1 && !tourOff && <Tour5 step={step} root={root} frame={frame} />}
    </div>
  );
}

