// Slide 0, the trailer: dad's 30 s film (docs/Gridzilla-trailer.mp4, copied to public/pitch/trailer.mp4 at build time by
// qa/pitch-trailer.mjs). It carries the jingle, so there is no separate audio any more. The shell starts it from the
// key press (browsers only play sound after one); Slide0 owns the <video> and hands it over with registerTrailer().
// idle -> playing (first Space or Right on slide 0) -> ended: the film ends (the shell then hard-cuts to the title),
// or the presenter presses again (skip). A missing or broken file never blocks: the press goes straight on.
import { useCallback, useEffect, useRef, useState } from "react";
import type { JingleState } from "../types";

const LENGTH_MS = 31613;
const GUARD_MS = LENGTH_MS + 2500; // a stalled film still lets the deck move on

let video: HTMLVideoElement | null = null;
let listener: (() => void) | null = null;
/** Slide0 registers its <video> (null on unmount). */
export function registerTrailer(el: HTMLVideoElement | null) {
  video = el;
  listener?.();
}

export function useTrailer(enabled: boolean, onEnd: () => void) {
  const [state, setStateRaw] = useState<JingleState>(enabled ? "idle" : "ended");
  const stateRef = useRef(state);
  const guard = useRef(0);
  const endRef = useRef(onEnd);
  endRef.current = onEnd;

  const setState = useCallback((s: JingleState) => {
    stateRef.current = s;
    setStateRaw(s);
  }, []);

  const finish = useCallback(() => {
    window.clearTimeout(guard.current);
    if (stateRef.current !== "playing") return;
    setState("ended");
    endRef.current();
  }, [setState]);

  // Follow the registered element's end.
  useEffect(() => {
    let el: HTMLVideoElement | null = null;
    const attach = () => {
      el?.removeEventListener("ended", finish);
      el = video;
      el?.addEventListener("ended", finish);
    };
    listener = attach;
    attach();
    return () => {
      el?.removeEventListener("ended", finish);
      listener = null;
      window.clearTimeout(guard.current);
    };
  }, [finish]);

  /** First press on slide 0: play with sound. Returns true when the press was used for that. */
  const start = useCallback(() => {
    if (stateRef.current !== "idle") return false;
    const v = video;
    if (!v || v.error || v.readyState === 0) return false; // nothing to play: the press moves on to the title
    setState("playing");
    window.clearTimeout(guard.current);
    guard.current = window.setTimeout(finish, GUARD_MS);
    v.currentTime = 0;
    v.muted = false;
    v.volume = 1;
    v.play().catch(() => {
      // No sound allowed (or no audio device): show the film silently rather than nothing.
      v.muted = true;
      v.play().catch(finish);
    });
    return true;
  }, [finish, setState]);

  /** Leaving slide 0 by a key press while it plays: stop it there (a skip, no fade). */
  const stop = useCallback(() => {
    window.clearTimeout(guard.current);
    video?.pause();
    if (stateRef.current === "playing") setState("ended");
  }, [setState]);

  return { state, stateRef, start, stop };
}
