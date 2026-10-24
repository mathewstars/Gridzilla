// The "?" help overlay (share-peter.md): one plain sentence per panel of the view on screen. Opens on the key ? or the
// top bar's ? icon (window event "gz-help"); Escape, the scrim or the close button shut it. Works on Operations and Demo.
import { useEffect, useState } from "react";
import { X } from "@phosphor-icons/react";
import type { Route } from "../shell/Sidebar";
import "./help.css";

const COMMON: [string, string][] = [
  ["Top bar", "The grid clock, the weather the simulation follows, the autopilot mode and the fail-safe: Pause cuts every house loose so it runs on its own again."],
  ["Theme", "The sun or moon icon switches between dark and light; nothing else changes."],
];
const PANELS: Record<string, [string, string][]> = {
  ops: [
    ["Live city", "Every street transformer in Vienna, coloured by how close it is to its limit: green is fine, orange is near, red is over in either direction."],
    ["The selected transformer", "Its load over the last hours and tonight: blue is with Gridzilla, grey dashed is without, the red line is its limit, green is the diet plan."],
    ["Now", "What the AI proposes right now and which signals are running, each with how long it has left. Approve or Reject if the AI waits for you."],
    ["New signal", "Write a signal by hand: where, what the houses should do, for how long. The guard checks it before it is signed and sent."],
    ["What just happened", "The newest signed messages, the houses' replies and anything the guard refused."],
  ],
  demo: [
    ["The transformer", "One street transformer told big: its load with and without Gridzilla, its limit, and the ring showing how full it is right now."],
    ["The sentence", "What is coming and what Gridzilla is doing about it, in one line."],
    ["Now", "The AI's four steps (sees, thinks, checks, acts) as they happen, and the signals running with how long they have left."],
    ["What just happened", "The newest signed messages and replies."],
    ["The dots", "Every street transformer in the city, one dot each, coloured by load. Click one to tell its story; Up and Down step through them."],
  ],
};

export default function HelpOverlay({ route }: { route: Route }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key === "?") setOpen((o) => !o);
      if (e.key === "Escape") setOpen(false);
    };
    addEventListener("gz-help", show);
    addEventListener("keydown", key);
    return () => {
      removeEventListener("gz-help", show);
      removeEventListener("keydown", key);
    };
  }, []);
  if (!open) return null;
  const rows = [...(PANELS[route] ?? PANELS.ops), ...COMMON];
  return (
    <div className="hlp" role="dialog" aria-label="What am I looking at">
      <div className="hlp-scrim" onClick={() => setOpen(false)} />
      <section className="panel hlp-card">
        <header className="hlp-head">
          <h2>What am I looking at?</h2>
          <button type="button" className="btn hlp-x" onClick={() => setOpen(false)} aria-label="Close">
            <X size={14} weight="bold" />
          </button>
        </header>
        <dl className="hlp-list">
          {rows.map(([t, d]) => (
            <div key={t}>
              <dt>{t}</dt>
              <dd>{d}</dd>
            </div>
          ))}
        </dl>
        <p className="hlp-keys">Keys: ? this help · D demo mode · Up / Down next transformer in demo · Escape close</p>
      </section>
    </div>
  );
}
