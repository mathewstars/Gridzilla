// Slide 0, the trailer (0:00, 30 s): dad's film full-bleed on black, with the jingle in its soundtrack. Space plays it
// (the shell starts it, shell/useTrailer.ts); at its last frame the deck hard-cuts to the GRIDZILLA title. Before Space
// the first frame waits on black. Swap the film by replacing docs/Gridzilla-trailer.mp4 (qa/pitch-trailer.mjs copies it).
import { useCallback } from "react";
import { registerTrailer } from "../shell/useTrailer";
import type { SlideProps } from "../types";
import "./slide0.css";

export default function Slide0(_: SlideProps) {
  const ref = useCallback((el: HTMLVideoElement | null) => registerTrailer(el), []);
  return (
    <div className="s0" data-slide="0">
      <video ref={ref} className="s0-film" src={`${import.meta.env.BASE_URL}pitch/trailer.mp4`} preload="auto" playsInline aria-label="Gridzilla trailer" />
    </div>
  );
}
