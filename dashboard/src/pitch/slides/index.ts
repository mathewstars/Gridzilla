// The trailer (slide 0), the eight slides and the end slide (9), with their beat in the run of show: four minutes,
// stop at 3:50 (dad's docs/PRESENTATION.md; our deck keeps the Blatnica slide visible). The slide number is the
// position in SLIDES (the URL's ?slide=, the notes in script.ts, each slide's data-slide); the files kept their first
// numbers when the six signal words came in at 4, so Slide4.tsx is slide 5 and so on up to Slide8.tsx, slide 9.
import type { SlideDef } from "../types";
import Slide0 from "./Slide0";
import Slide1 from "./Slide1";
import Slide2 from "./Slide2";
import Slide3 from "./Slide3";
import SlideSignals from "./SlideSignals";
import Slide4 from "./Slide4";
import Slide5 from "./Slide5";
import Slide6 from "./Slide6";
import Slide7 from "./Slide7";
import Slide8 from "./Slide8";

export const SLIDES: SlideDef[] = [
  { id: "trailer", title: "Trailer", at: 0, steps: 1, Component: Slide0, fullBleed: true },
  { id: "title", title: "Gridzilla", at: 30, steps: 1, Component: Slide1, bg: "hero" },
  { id: "problem", title: "The problem", at: 32, steps: 2, Component: Slide2, bg: "calm", bgSteps: ["hero", "calm"] },
  { id: "idea", title: "The idea", at: 50, steps: 2, Component: Slide3, bg: "calm" },
  { id: "signals", title: "Six words", at: 70, steps: 1, Component: SlideSignals, bg: "calm" },
  { id: "peaks", title: "The monster eats peaks", at: 85, steps: 1, Component: Slide4, bg: "calm" },
  { id: "demo", title: "Live demo", at: 115, steps: 8, Component: Slide5, fullBleed: true, keepMounted: true, tour: true },
  { id: "real", title: "Real and simulated", at: 175, steps: 1, Component: Slide6, bg: "calm" },
  { id: "close", title: "Close", at: 200, steps: 2, Component: Slide7, bg: "hero" },
  { id: "end", title: "Gridzilla", at: 222, steps: 1, Component: Slide8, bg: "hero" },
];

/** The hard stop, seconds. */
export const END_AT = 230;
