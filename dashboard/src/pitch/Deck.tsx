// The deck shell. Scales the 1920x1080 canvas to the window (letterboxed in white), keeps the live stage mounted
// off-screen, and moves through slides and build steps from the keyboard. Nothing of the shell is on the slides.
//
// Keys (one window listener in the capture phase; every key the shell uses is stopped there, on every slide, so the
// live stage on slide 5 never also handles Left, Right or F; all other keys, like 1-4, reach the stage):
//   Right, Space, PageDown  next build step, then next slide (on slide 1 the first press starts the jingle)
//   Left, PageUp            back: previous step, then the previous slide at its last step
//   F                       full screen, with Esc kept for the page (hold Esc to leave full screen)
//   T                       small elapsed timer, bottom right      N  presenter notes      Esc  slide overview
//   D                       dark or light theme (dark by default; ?theme=dark|light; remembered like the ops console)
// URL: ?slide=N (1-based) &step=S (0-based) &freeze=end (final state at once, for QA and print). The slide and step
// are written back to the URL as you move, so a reload stays put. window.__pitch exposes the state for QA.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SLIDES } from "./slides";
import { useJingle } from "./shell/useJingle";
import Timer from "./shell/Timer";
import Notes from "./shell/Notes";
import Overview, { overviewLayout } from "./shell/Overview";
import { useTheme } from "../ops/theme";
import Backdrop from "./shell/Backdrop";
import "./deck.css";

const W = 1920;
const H = 1080;
const LAST = SLIDES.length - 1;
const CURSOR_IDLE_MS = 2000;

interface Pos {
  i: number;
  step: number;
}
interface Ui {
  timer: boolean;
  notes: boolean;
  overview: boolean;
  sel: number;
}

const clampPos = (i: number, step: number): Pos => {
  const ii = Math.min(Math.max(Number.isFinite(i) ? Math.round(i) : 0, 0), LAST);
  const max = SLIDES[ii].steps - 1;
  return { i: ii, step: Math.min(Math.max(Number.isFinite(step) ? Math.round(step) : 0, 0), max) };
};

function useWindowSize() {
  const get = () => ({ w: window.innerWidth, h: window.innerHeight });
  const [s, setS] = useState(get);
  useEffect(() => {
    const on = () => setS(get());
    window.addEventListener("resize", on);
    document.addEventListener("fullscreenchange", on);
    return () => {
      window.removeEventListener("resize", on);
      document.removeEventListener("fullscreenchange", on);
    };
  }, []);
  return s;
}

/** The mouse pointer hides after 2 s without movement. */
function useIdleCursor(ms: number) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let t = window.setTimeout(() => setHidden(true), ms);
    const on = () => {
      setHidden(false);
      window.clearTimeout(t);
      t = window.setTimeout(() => setHidden(true), ms);
    };
    window.addEventListener("mousemove", on);
    window.addEventListener("mousedown", on);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("mousemove", on);
      window.removeEventListener("mousedown", on);
    };
  }, [ms]);
  return hidden;
}

type KeyboardLock = { lock?: (keys?: string[]) => Promise<void>; unlock?: () => void };

function toggleFullscreen() {
  const kb = (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard;
  if (document.fullscreenElement) {
    kb?.unlock?.();
    document.exitFullscreen?.().catch(() => {});
    return;
  }
  const el = document.documentElement;
  if (!el.requestFullscreen) return;
  el.requestFullscreen()
    .then(() => kb?.lock?.(["Escape"])?.catch(() => {}))
    .catch(() => {});
}

export default function Deck() {
  const q = useMemo(() => new URLSearchParams(location.search), []);
  const freeze = q.get("freeze") === "end" ? "end" : null;
  const [pos, setPosRaw] = useState<Pos>(() => clampPos(Number(q.get("slide") || 1) - 1, Number(q.get("step") || 0)));
  const posRef = useRef(pos);
  const [ui, setUiRaw] = useState<Ui>({ timer: false, notes: false, overview: false, sel: 0 });
  const uiRef = useRef(ui);
  const [t0, setT0] = useState<number | null>(null);
  const t0Ref = useRef<number | null>(null);
  const jingle = useJingle(`${import.meta.env.BASE_URL}pitch/jingle.m4a`, !freeze);
  const size = useWindowSize();
  const [theme, setTheme] = useTheme();
  const cursorHidden = useIdleCursor(CURSOR_IDLE_MS);

  const setPos = useCallback((p: Pos) => {
    posRef.current = p;
    setPosRaw(p);
  }, []);
  const setUi = useCallback((u: Ui) => {
    uiRef.current = u;
    setUiRaw(u);
  }, []);

  const { start: startJingle, stop: stopJingle, stateRef: jingleRef } = jingle;

  /** Every slide change goes through here: leaving slide 1 while the jingle plays fades it out. */
  const go = useCallback(
    (p: Pos) => {
      if (p.i !== 0) stopJingle();
      setPos(p);
    },
    [setPos, stopJingle],
  );

  const next = useCallback(() => {
    const p = posRef.current;
    if (p.i === 0 && jingleRef.current === "idle" && startJingle()) {
      if (t0Ref.current == null) {
        t0Ref.current = performance.now();
        setT0(t0Ref.current);
      }
      return;
    }
    if (p.step < SLIDES[p.i].steps - 1) go({ i: p.i, step: p.step + 1 });
    else if (p.i < LAST) go({ i: p.i + 1, step: 0 });
  }, [go, jingleRef, startJingle]);

  const prev = useCallback(() => {
    const p = posRef.current;
    if (p.step > 0) go({ i: p.i, step: p.step - 1 });
    else if (p.i > 0) go({ i: p.i - 1, step: SLIDES[p.i - 1].steps - 1 });
  }, [go]);

  const jump = useCallback(
    (i: number) => {
      if (i !== posRef.current.i) go({ i, step: 0 });
      setUi({ ...uiRef.current, overview: false });
    },
    [go, setUi],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      const u = uiRef.current;
      const take = () => {
        e.preventDefault();
        e.stopPropagation();
      };
      const lower = k.length === 1 ? k.toLowerCase() : k;

      // Toggles work everywhere, the overview included.
      if (lower === "f" || lower === "t" || lower === "n" || lower === "d") {
        take();
        if (e.repeat) return;
        if (lower === "d") setTheme((t) => (t === "dark" ? "light" : "dark"));
        else if (lower === "f") toggleFullscreen();
        else if (lower === "t") setUi({ ...u, timer: !u.timer });
        else setUi({ ...u, notes: !u.notes });
        return;
      }

      if (u.overview) {
        // The overview owns the keyboard while it is open: nothing reaches the stage.
        take();
        const cols = overviewLayout(window.innerWidth, window.innerHeight).cols;
        const move = (d: number) => setUi({ ...u, sel: Math.min(Math.max(u.sel + d, 0), LAST) });
        if (k === "Escape") {
          if (!e.repeat) setUi({ ...u, overview: false });
        } else if (k === "Enter" || k === " ") jump(u.sel);
        else if (k === "ArrowRight") move(1);
        else if (k === "ArrowLeft") move(-1);
        else if (k === "ArrowDown") move(cols);
        else if (k === "ArrowUp") move(-cols);
        else if (k === "Home") move(-LAST);
        else if (k === "End") move(LAST);
        return;
      }

      if (k === "ArrowRight" || k === " " || k === "PageDown") {
        take();
        next();
      } else if (k === "ArrowLeft" || k === "PageUp") {
        take();
        prev();
      } else if (k === "Escape") {
        take();
        if (!e.repeat) setUi({ ...u, overview: true, sel: posRef.current.i });
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [jump, next, prev, setUi, setTheme]);

  // Keep the slide and step in the URL (freeze and anything else untouched), so a reload stays on this slide.
  useEffect(() => {
    try {
      const url = new URL(location.href);
      url.searchParams.set("slide", String(pos.i + 1));
      url.searchParams.set("step", String(pos.step));
      if (url.href !== location.href) history.replaceState(history.state, "", url);
    } catch {
      /* a sandboxed frame may refuse; the deck still works */
    }
  }, [pos]);

  // For QA: the live state, read at the moment it is asked for.
  useEffect(() => {
    const w = window as unknown as { __pitch?: unknown };
    w.__pitch = {
      get slide() {
        return posRef.current.i + 1;
      },
      get step() {
        return posRef.current.step;
      },
      get jingle() {
        return jingleRef.current;
      },
      get elapsedMs() {
        return t0Ref.current == null ? 0 : Math.round(performance.now() - t0Ref.current);
      },
      get timer() {
        return uiRef.current.timer;
      },
      get notes() {
        return uiRef.current.notes;
      },
      get overview() {
        return uiRef.current.overview;
      },
      slides: SLIDES.map((d) => ({ id: d.id, title: d.title, steps: d.steps, at: d.at })),
    };
    return () => {
      delete w.__pitch;
    };
  }, [jingleRef]);

  const scale = Math.min(size.w / W, size.h / H);
  const left = (size.w - W * scale) / 2;
  const top = (size.h - H * scale) / 2;

  return (
    <div className={`p-deck${cursorHidden ? " p-nocursor" : ""}`} data-slide-current={pos.i + 1}>
      <Backdrop kind={SLIDES[pos.i].bg ?? "none"} theme={theme} freeze={!!freeze} />
      {SLIDES.map((d, i) => {
        const on = i === pos.i;
        if (!on && !d.keepMounted) return null;
        const el = <d.Component step={on ? pos.step : 0} active={on} freeze={freeze} jingle={jingle.state} />;
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
      {ui.timer ? <Timer t0={t0} i={pos.i} /> : null}
      {ui.notes ? <Notes i={pos.i} step={pos.step} lift={ui.timer} /> : null}
      {ui.overview ? (
        <Overview
          sel={ui.sel}
          cur={pos.i}
          winW={size.w}
          winH={size.h}
          onPick={jump}
          onHover={(i) => {
            if (uiRef.current.sel !== i) setUi({ ...uiRef.current, sel: i });
          }}
        />
      ) : null}
    </div>
  );
}
