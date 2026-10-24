// Round 2 palette: Apple system colours, each with one meaning (redesign-2.md). Ground and ink stay from DESIGN.md.
export const P = {
  ground: "#f5f5f7",
  card: "#ffffff",
  ink: "#1d1d1f",
  secondary: "#6e6e73",
  tertiary: "#86868b",
  fill: "#e8e8ed",
  green: "#34c759", // stored, clean, inside the limit
  orange: "#ff9500", // peak building
  red: "#ff3b30", // over the limit
  blue: "#0071e3", // interactive
} as const;

/** Load in % of the limit (either direction) to its meaning colour. */
export const loadTone = (pct: number | null | undefined) => {
  const p = Math.abs(pct ?? 0);
  return p >= 100 ? P.red : p >= 85 ? P.orange : P.green;
};
