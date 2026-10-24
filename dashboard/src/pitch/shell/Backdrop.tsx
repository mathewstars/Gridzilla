// The deck's background (captain: premium, from 21st.dev, never hand-rolled, clearly visible): Paper Shaders' animated
// Mesh Gradient by @paper-design (bg/mesh-gradient.tsx), green and teal light moving slowly on near-black. One canvas
// behind every slide that has a background, so it keeps moving across slide changes: full strength on the title and
// the close ("hero"), dimmed to about 60 % on the content slides ("calm"); slide 4 and the live demo have none.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ShaderBackground, setPalette } from "../bg/mesh-gradient";
import type { BgKind } from "../types";

const PALETTES = {
  dark: ["#040706", "#0b5d3d", "#0f8f7f", "#06261c"],
  light: ["#ffffff", "#c4eedd", "#9fe0cf", "#eef9f4"],
} as const;
const SPEED = 0.4;

export default function Backdrop({ kind, theme, freeze }: { kind: BgKind; theme: "dark" | "light"; freeze: boolean }) {
  const still = !!useReducedMotion() || freeze;
  // The shader reads its palette when its canvas mounts; the key below remounts it on a theme change only, so the
  // same light keeps moving from slide to slide.
  setPalette([...PALETTES[theme]], still, SPEED);
  return (
    <div className="p-backdrop" aria-hidden>
      <AnimatePresence initial={false}>
        {kind !== "none" && (
          <motion.div
            key={`bg-${theme}`}
            className="p-backdrop-layer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: still ? 0 : 0.3, ease: [0.4, 0, 0.6, 1] }}
          >
            <ShaderBackground className="p-backdrop-canvas" />
          </motion.div>
        )}
      </AnimatePresence>
      <div className={`p-backdrop-dim${kind === "calm" ? " is-on" : ""}`} />
    </div>
  );
}
