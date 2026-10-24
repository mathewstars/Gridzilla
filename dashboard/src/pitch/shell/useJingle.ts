// The slide 1 jingle. The shell owns the audio because browsers only play sound after a key press.
// idle -> playing (first Space or Right on slide 1) -> ended (the audio ends, or the presenter moves on, which fades it
// out over 0.6 s). If the browser refuses to play or the file fails, "ended" still arrives after 31.6 s so the line
// on slide 1 always comes. Once ended it stays ended until the page reloads.
import { useCallback, useEffect, useRef, useState } from "react";
import type { JingleState } from "../types";

const LENGTH_MS = 31600;
/** If the audio stalls without an error, the line still comes this long after the start. */
const GUARD_MS = LENGTH_MS + 2500;
const FADE_MS = 600;

export function useJingle(src: string, enabled: boolean) {
  const [state, setStateRaw] = useState<JingleState>(enabled ? "idle" : "ended");
  const stateRef = useRef(state);
  const audio = useRef<HTMLAudioElement | null>(null);
  const failed = useRef(false);
  const startedAt = useRef(0);
  const guard = useRef(0);
  const fade = useRef(0);

  const setState = useCallback((s: JingleState) => {
    stateRef.current = s;
    setStateRaw(s);
  }, []);

  const arm = useCallback(
    (total: number) => {
      window.clearTimeout(guard.current);
      const left = Math.max(0, total - (performance.now() - startedAt.current));
      guard.current = window.setTimeout(() => {
        if (stateRef.current === "playing") setState("ended");
      }, left);
    },
    [setState],
  );

  useEffect(() => {
    if (!enabled) return;
    const a = new Audio();
    a.preload = "auto";
    const onEnded = () => {
      if (stateRef.current === "playing") setState("ended");
    };
    const onError = () => {
      failed.current = true;
      if (stateRef.current === "playing") arm(LENGTH_MS);
    };
    a.addEventListener("ended", onEnded);
    a.addEventListener("error", onError);
    a.src = src;
    audio.current = a;
    return () => {
      a.removeEventListener("ended", onEnded);
      a.removeEventListener("error", onError);
      a.pause();
      audio.current = null;
      window.clearTimeout(guard.current);
      cancelAnimationFrame(fade.current);
    };
  }, [src, enabled, arm, setState]);

  /** First press on slide 1: play. Returns true when it started (the press is used up). */
  const start = useCallback(() => {
    if (stateRef.current !== "idle") return false;
    setState("playing");
    startedAt.current = performance.now();
    const a = audio.current;
    if (!a || failed.current) {
      arm(LENGTH_MS);
      return true;
    }
    arm(GUARD_MS);
    a.currentTime = 0;
    a.volume = 1;
    a.play().catch(() => {
      failed.current = true;
      arm(LENGTH_MS);
    });
    return true;
  }, [arm, setState]);

  /** The presenter moves on while it plays: fade out over 0.6 s and call it ended. */
  const stop = useCallback(() => {
    if (stateRef.current !== "playing") return;
    setState("ended");
    window.clearTimeout(guard.current);
    const a = audio.current;
    if (!a || a.paused) return;
    const v0 = a.volume;
    const t0 = performance.now();
    cancelAnimationFrame(fade.current);
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / FADE_MS);
      a.volume = v0 * (1 - k);
      if (k < 1) fade.current = requestAnimationFrame(tick);
      else a.pause();
    };
    fade.current = requestAnimationFrame(tick);
  }, [setState]);

  return { state, stateRef, start, stop };
}
