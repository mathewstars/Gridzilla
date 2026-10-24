// The trailer (slide 0) and the seven slides in order, with their beat in the 4:20 run of show (PITCH.md).
import type { SlideDef } from "../types";
import Slide0 from "./Slide0";
import Slide1 from "./Slide1";
import Slide2 from "./Slide2";
import Slide3 from "./Slide3";
import Slide4 from "./Slide4";
import Slide5 from "./Slide5";
import Slide6 from "./Slide6";
import Slide7 from "./Slide7";

export const SLIDES: SlideDef[] = [
  { id: "trailer", title: "Trailer", at: 0, steps: 1, Component: Slide0, fullBleed: true },
  { id: "title", title: "Gridzilla", at: 30, steps: 1, Component: Slide1, bg: "hero" },
  { id: "problem", title: "The problem", at: 32, steps: 2, Component: Slide2, bg: "calm" },
  { id: "idea", title: "The idea", at: 55, steps: 4, Component: Slide3, bg: "calm" },
  { id: "peaks", title: "The monster eats peaks", at: 95, steps: 2, Component: Slide4 },
  { id: "demo", title: "Live demo", at: 135, steps: 8, Component: Slide5, fullBleed: true, keepMounted: true, tour: true },
  { id: "real", title: "Real and simulated", at: 210, steps: 1, Component: Slide6, bg: "calm" },
  { id: "close", title: "The ask", at: 235, steps: 2, Component: Slide7, bg: "hero" },
];

/** The hard stop, seconds. */
export const END_AT = 260;
