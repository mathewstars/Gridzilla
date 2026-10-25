// Slide 6 (file Slide5), the live demo: the FULL console as it is at #/ (sidebar Operations / Diet plan / Real plant /
// More, the top bar, the Operations page opening on all of Vienna), in an iframe that fills the whole window, so the app
// uses its own responsive one-screen layout and stays fully interactive (sidebar, chips, city dots, Up/Down). The
// console is loaded as it ships (index.html), never copied or edited. The shell keeps this slide mounted off-screen from
// the first frame (keepMounted), so the app is warm when the monster slide is left.
// Keys: once a click puts the focus inside the app, the deck's keys (Space, Right, Left, PageUp/Down, F, N, T, D, Esc and
// the scenario keys 1-4) are caught in the app's window before the app sees them and go on to the deck; everything else
// (Up/Down, ?, typing) stays with the app. Steps 1-7 are the walkthrough (Tour5.tsx), step 8 clears the dim.
// 1-4 set the live scenario (normal, cold evening, sunny noon, live weather) on this slide and on the title slide (the run
// of show: press 2 before you walk up). In read-only live mode (?api=) those POSTs are refused in the page.
import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from "react";
import { post } from "../../api";
import Tour5, { TOUR } from "./Tour5";
import type { SlideProps } from "../types";
import "./slide5.css";

const SCENARIOS = ["normal", "cold-evening", "sunny-noon", "live-weather"];
/** The app's address, fixed once: the deck's own query (api, theme) without its position (slide, step, freeze), which
 *  the deck rewrites on every key press. A changing src would reload the app (a white flash on every step). */
const appSrc = () => {
  const q = new URLSearchParams(location.search);
  for (const k of ["slide", "step", "freeze"]) q.delete(k);
  const s = q.toString();
  return `index.html${s ? `?${s}` : ""}#/`;
};
/** The deck's keys: caught inside the app's window and handed to the deck. */
const DECK_KEYS = /^(ArrowRight|ArrowLeft| |Spacebar|PageUp|PageDown|Escape|[fFnNtTdD1-4])$/;

export default function Slide5({ active, step, tourOff }: SlideProps) {
  const [frame, setFrame] = useState<HTMLIFrameElement | null>(null);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [src] = useState(appSrc);
  const loads = useRef(0);
  // The app's own document follows the deck's theme (D toggles data-theme on the deck's <html>).
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

  const onLoad = useCallback((e: SyntheticEvent<HTMLIFrameElement>) => {
    const win = e.currentTarget.contentWindow;
    const doc = e.currentTarget.contentDocument;
    // How often the app has loaded (QA reads it: once per deck visit, never per step).
    loads.current += 1;
    (window as unknown as { __gzAppLoads?: number }).__gzAppLoads = loads.current;
    if (doc) doc.documentElement.style.colorScheme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    setRoot(doc?.body ?? null);
    if (!win) return;
    win.addEventListener(
      "keydown",
      (ev) => {
        if (ev.metaKey || ev.ctrlKey || !DECK_KEYS.test(ev.key)) return;
        const t = ev.target as HTMLElement | null;
        if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
        ev.preventDefault();
        ev.stopImmediatePropagation();
        document.dispatchEvent(new KeyboardEvent("keydown", { key: ev.key, code: ev.code, shiftKey: ev.shiftKey, altKey: ev.altKey, bubbles: true, cancelable: true }));
      },
      true,
    );
  }, []);

  return (
    <div className="p-stage p-stage-app" data-slide="6">
      <iframe ref={setFrame} className="p-app-frame" src={src} title="Gridzilla operations, live" onLoad={onLoad} />
      {active && step >= 1 && step <= TOUR.length && !tourOff && <Tour5 step={step} root={root} frame={frame} />}
    </div>
  );
}

