// Slide 6 (file Slide5), the live demo: the console's DEMO MODE (DemoView from src/ops/demo, imported, never copied or edited): one
// transformer's story big, the AI's steps and the signals running, the newest events, the whole city as dots. The
// shell keeps this slide mounted off-screen from the first frame (keepMounted), so its data is warm and it appears the
// moment the monster slide is left. Steps 1-7 are the walkthrough (Tour5.tsx): each Right lights one area with a caption.
// Keys: DemoView's own Up/Down pick the transformer. It has no scenario keys, so 1-4 set the live scenario here
// (normal, cold evening, sunny noon, live weather), on this slide and on the title slide (the run of show: press 2
// before you walk up). In read-only live mode (?api=) those POSTs are refused in the page. Left, Right, F, Esc and D
// belong to the shell.
import { useEffect, useRef, useState } from "react";
import { DemoView } from "../../ops/demo/DemoView";
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
      <DemoView />
      {active && step >= 1 && !tourOff && <Tour5 step={step} root={root} />}
    </div>
  );
}
