// Round 2 palette: Apple system colours, each with one meaning (redesign-2.md). Ground and ink stay from DESIGN.md.
export const P = {
  // neutrals follow the theme (CSS variables, light or dark); fine in CSS and SVG attributes, NOT in three.js (use PX)
  ground: "var(--color-ground)",
  card: "var(--color-card)",
  ink: "var(--color-ink)",
  secondary: "var(--color-secondary)",
  tertiary: "var(--color-tertiary)",
  fill: "var(--color-fill)",
  green: "#34c759", // stored, clean, inside the limit
  orange: "#ff9500", // peak building
  red: "#ff3b30", // over the limit
  blue: "#0071e3", // interactive
} as const;

/** Concrete neutrals for three.js and canvas, which cannot read CSS variables: the current theme's values. */
export const PX = {
  get ground() { return cssVar("--color-ground", "#f5f5f7"); },
  get ink() { return cssVar("--color-ink", "#1d1d1f"); },
  get card() { return cssVar("--color-card", "#ffffff"); },
};
function cssVar(name: string, fallback: string) {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** Load in % of the limit (either direction) to its meaning colour. */
export const loadTone = (pct: number | null | undefined) => {
  const p = Math.abs(pct ?? 0);
  return p >= 100 ? P.red : p >= 85 ? P.orange : P.green;
};
