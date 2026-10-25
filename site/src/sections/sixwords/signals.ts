// The six signal words for the explorer. Situations from the spec (section 5); messages from the spec, and for STRETCH
// and RECOVER (which the spec gives no quote for) the deck's own lines (dashboard/src/pitch/slides/SlideSignals.tsx);
// what the house does from the spec and the How it works steps. The numbers the real charts state are computed from
// the Atzgersdorf plan (src/data/street.ts), never typed in.
import { STREET } from "../../data/street";

export type Word = "SUPPORT" | "ABSORB" | "PREPARE" | "STRETCH" | "RECOVER" | "RELEASE";

export interface Signal {
  word: Word;
  when: string;
  says: string;
  does: string;
  /** what the chart shows, in words; schematic charts say so */
  caption: string;
  schematic: boolean;
}

/** A plan row with a continuous clock (hours keep counting past midnight). */
export interface Pt { t: number; without: number; with: number }

const START = STREET.rows[0][0];
export const PLAN: Pt[] = STREET.rows.map(([, without, w], i) => ({ t: START + i * 0.25, without, with: w }));

export const hhmm = (h: number) => {
  const m = Math.round((((h % 24) + 24) % 24) * 60);
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const kw = (v: number) => `${Math.round(v)} kW`;

// SUPPORT and RELEASE: the evening cap is the plan's flat top
export const CAP_KW = STREET.peakWithKw;
const capped = PLAN.filter((p) => Math.abs(p.with - CAP_KW) < 0.05);
export const CAP_FROM = capped[0].t;
export const CAP_TO = capped[capped.length - 1].t;
/** the first row after the cap where the street draws what it would without a signal */
export const FREE_AT = PLAN.find((p) => p.t > CAP_TO && Math.abs(p.with - p.without) < 0.05)!.t;

// ABSORB: the noon export, before the street turns to importing; the plan holds it flat at the export cap
const noon = PLAN.filter((p) => p.t < 13.6);
export const EXPORT_CAP_KW = -Math.min(...noon.map((p) => p.with));
export const NOON_TO = [...noon].reverse().find((p) => Math.abs(p.with + EXPORT_CAP_KW) < 0.05)!.t;
const BACK_WITHOUT = -Math.min(...noon.map((p) => p.without));

export const SIGNALS: Signal[] = [
  {
    word: "SUPPORT",
    when: "Evening peak, or the grid short of generation.",
    says: "Take at most 3 kW from the street.",
    does: "Each house uses its battery first, then holds back the car, hot water and floor heating.",
    caption: `${STREET.name}, tonight’s plan: the street held at ${kw(CAP_KW)} from ${hhmm(CAP_FROM)} to ${hhmm(CAP_TO)}, the peak above it eaten.`,
    schematic: false,
  },
  {
    word: "ABSORB",
    when: "Noon solar flooding the feeder.",
    says: "Send back at most 2 kW.",
    does: "Each house charges its battery from the noon sun instead of sending it all back.",
    caption: `${STREET.name} at noon, tonight’s plan: up to ${kw(BACK_WITHOUT)} would flow back; the street sends ${kw(EXPORT_CAP_KW)} and stores the rest.`,
    schematic: false,
  },
  {
    word: "PREPARE",
    when: "A warning, a storm, planned shedding.",
    says: "Be 90 % full by 17:00.",
    does: "Each house charges gently through the afternoon, so the battery is full when it counts.",
    caption: "Schematic: the battery’s charge rising to 90 % by 17:00. The plan data has no battery series.",
    schematic: true,
  },
  {
    word: "STRETCH",
    when: "The street is dark, restoration time known.",
    says: "Run on your own, send nothing back, make it last.",
    does: "Each house islands and rations battery, heat pump, car and boiler.",
    caption: "Schematic: while the street is dark the house takes nothing from the grid and draws its battery down slowly.",
    schematic: true,
  },
  {
    word: "RECOVER",
    when: "The street comes back.",
    says: "Refill slowly, not all at once.",
    does: "Houses return to the grid gently, no synchronised step.",
    caption: "Schematic: each house returns on its own randomised ramp, so the street never steps up in sync.",
    schematic: true,
  },
  {
    word: "RELEASE",
    when: "The event is over.",
    says: "You are on your own again.",
    does: "Every limit lifted, signed like the rest.",
    caption: `${STREET.name}, tonight’s plan: the cap lifts after ${hhmm(CAP_TO)}, and from ${hhmm(FREE_AT)} the street follows its own curve again.`,
    schematic: false,
  },
];

/** STRETCH: the order the house rations in (a schematic ranking, no values) */
export const RATION_ORDER = ["Battery", "Heat pump", "Car", "Boiler"];
