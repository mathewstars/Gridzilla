// The contract between the deck shell (Deck.tsx) and the seven slides. Every slide is designed on a fixed
// 1920x1080 canvas in px; the shell scales the canvas to the window. Only full-bleed slides (the live stage) get the
// real window instead.
import type { ComponentType } from "react";

export type JingleState = "idle" | "playing" | "ended";

/** The deck background behind a slide (shell/Backdrop.tsx): the animated hero, its still sibling, or the plain ground. */
export type BgKind = "hero" | "calm" | "none";

export interface SlideProps {
  /** Build step inside the slide, 0-based. Right/Space moves to step + 1 until `steps - 1`, then to the next slide. */
  step: number;
  /** True while this slide is on screen. Slides mount when they come on screen, so entry animations run on mount. */
  active: boolean;
  /** QA and print: "end" renders the final state of the current step at once, with no animation. null = live. */
  freeze: "end" | null;
  /** The trailer on slide 0 (it carries the jingle): "playing" while it runs, else "ended". */
  jingle: JingleState;
  /** Slide 5: the presenter skipped the walkthrough with Esc, so no step shows its overlay. */
  tourOff?: boolean;
  /** Full-bleed slides: the deck is on a phone (shell/usePhone.ts), so they show their phone version. */
  phone?: boolean;
  /** Full-bleed slides: the same as a tap on the right of the screen (next step or slide). */
  onNext?: () => void;
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
  /** Background behind the slide (default "none"). */
  bg?: BgKind;
  /** Background per build step, when it changes inside the slide (slide 2's story step is near-black). */
  bgSteps?: BgKind[];
  /** Steps 1..n are a walkthrough (slide 5): Esc skips the rest of it instead of opening the overview. */
  tour?: boolean;
}
