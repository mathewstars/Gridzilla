// Figures that are not live: dad's checked deck numbers (docs/Gridzilla-pitch.pdf, docs/PRESENTATION.md on main).
// Each one is shown with its label and source on the slide (data-src="deck"). Re-check the measured ones on the board
// the morning of the pitch and change them here, in one place.

/** Slide 2: the problem. */
export const PROBLEM = [
  { value: 0, unit: "", decimals: 0, place: "Slovakia", line: "signals from the grid operator to home batteries today" },
  { value: 4.2, unit: "kW", decimals: 1, place: "Germany", line: "the best case: the operator may dim one new charger to this" },
  { value: 3, unit: "GWh", decimals: 0, place: "Ukraine", line: "of home batteries installed in 2025, idle through the blackouts" },
] as const;

/** Slide 6: measured on the simulated Vienna fleet. */
export const MEASURED_ON = "24 Oct 2026";
export const MEASURED = {
  street: { name: "Speising", withoutKw: 574, withKw: 398, pct: 31 },
  city: { houses: 2184, withoutMw: 26.6, withMw: 21.7, offMw: 5.2, pct: 19 },
  noCars: { offKw: 0 },
  fleet: { households: 271, housesPerHousehold: 8, houses: 2184, carHouses: 1190 },
} as const;

/** Slide 7: the ask. */
export const ASK = {
  ask: "One street transformer to pilot on. This winter.",
  steps: [
    { what: "Sign-up tied to the meter", time: "two weeks" },
    { what: "A second maker", time: "one week" },
    { what: "The plant", time: "we own it" },
  ],
  vision: "Then streets that keep their lights on from their own batteries when the line is gone.",
} as const;
