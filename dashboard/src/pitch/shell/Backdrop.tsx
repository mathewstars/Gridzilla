// The deck's one background family (captain: premium, from 21st.dev, never hand-rolled): Paper Shaders by @paper-design.
// "hero" = the animated Mesh Gradient (slides 1 and 7), "calm" = its still sibling, Static Mesh Gradient (2, 3, 6),
// "none" = the plain theme ground (4 stays clean; 5 is the live stage). One full-window layer behind every slide, so
// slides that share a background share one canvas; a change crossfades. Palettes follow the theme (dark by default).
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ShaderBackground as HeroShader, setPalette as setHero } from "../bg/mesh-gradient";
import { ShaderBackground as CalmShader, setPalette as setCalm } from "../bg/static-mesh-gradient";
import type { BgKind } from "../types";

/** Deep greens: the monster's colour, dark enough that ink text keeps its contrast everywhere on the slide. */
const PALETTES = {
  dark: {
    hero: ["#07120d", "#0d3a26", "#1c6b45", "#0b0b0f"],
    calm: ["#0b0b0f", "#0a1d14", "#10301f", "#0b0b0f"],
  },
  light: {
    hero: ["#ffffff", "#dcf3e4", "#c3e9d1", "#f5f5f7"],
    calm: ["#ffffff", "#eef8f2", "#e2f3e8", "#ffffff"],
  },
} as const;

export default function Backdrop({ kind, theme, freeze }: { kind: BgKind; theme: "dark" | "light"; freeze: boolean }) {
  const still = !!useReducedMotion() || freeze;
  // The shaders read their palette when their canvas mounts; the key below remounts them on a theme change.
  setHero([...PALETTES[theme].hero], still);
  setCalm([...PALETTES[theme].calm], still);
  return (
    <div className="p-backdrop" aria-hidden>
      <AnimatePresence initial={false}>
        {kind !== "none" && (
          <motion.div
            key={`${kind}-${theme}`}
            className="p-backdrop-layer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: still ? 0 : 0.6, ease: [0.4, 0, 0.6, 1] }}
          >
            {kind === "hero" ? <HeroShader className="p-backdrop-canvas" /> : <CalmShader className="p-backdrop-canvas" />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
