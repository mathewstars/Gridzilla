// The contract between the deck shell (Deck.tsx) and the seven slides. Every slide is designed on a fixed
// 1920x1080 canvas in px; the shell scales the canvas to the window. Only full-bleed slides (the live stage) get the
// real window instead.
import type { ComponentType } from "react";

export type JingleState = "idle" | "playing" | "ended";

export interface SlideProps {
  /** Build step inside the slide, 0-based. Right/Space moves to step + 1 until `steps - 1`, then to the next slide. */
  step: number;
  /** True while this slide is on screen. Slides mount when they come on screen, so entry animations run on mount. */
  active: boolean;
  /** QA and print: "end" renders the final state of the current step at once, with no animation. null = live. */
  freeze: "end" | null;
  /** Slide 1 only: the jingle, which the shell plays (browsers need a key press for audio). */
  jingle: JingleState;
}

export interface SlideDef {
  id: string;
  /** Short name for the overview grid and the notes overlay. */
  title: string;
  /** Beat start in the 4:20 run of show, seconds from the first Space on slide 1. */
  at: number;
  /** Number of build steps (default 1). */
  steps: number;
  Component: ComponentType<SlideProps>;
  /** Drawn at the real window size instead of the scaled 1920x1080 canvas. */
  fullBleed?: boolean;
  /** Stays mounted (hidden off-screen) from the first frame, so it is live the moment it comes on. */
  keepMounted?: boolean;
}
