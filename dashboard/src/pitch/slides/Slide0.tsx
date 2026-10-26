// Slide 0, the trailer (0:00, 30 s): dad's film full-bleed on black, with the jingle in its soundtrack. Space plays it
// (the shell starts it, shell/useTrailer.ts); at its last frame the deck hard-cuts to the GRIDZILLA title. Before Space
// the first frame waits on black. Swap the film by replacing docs/Gridzilla-trailer.mp4 (qa/pitch-trailer.mjs copies it).
// On a phone the waiting frame carries the title (wordmark, tagline) and a Play button, so the first screen says what
// this is and how to start; it goes as the film plays.
import { useCallback } from "react";
import { Play } from "@phosphor-icons/react";
import { registerTrailer } from "../shell/useTrailer";
import type { SlideProps } from "../types";
import "./slide0.css";

export default function Slide0({ phone, jingle, onNext }: SlideProps) {
  const ref = useCallback((el: HTMLVideoElement | null) => registerTrailer(el), []);
  return (
    <div className="s0" data-slide="0">
      <video ref={ref} className="s0-film" src={`${import.meta.env.BASE_URL}pitch/trailer.mp4`} preload="auto" playsInline aria-label="Gridzilla trailer" />
      {phone && jingle !== "playing" && (
        <div className="s0-title">
          <h1 className="s0-word">GRIDZILLA</h1>
          <p className="s0-tag">A grid signal for home batteries, cars and heat pumps.</p>
          <button type="button" className="s0-play" onClick={onNext}>
            <Play size={16} weight="fill" />
            Play the trailer
          </button>
        </div>
      )}
    </div>
  );
}
