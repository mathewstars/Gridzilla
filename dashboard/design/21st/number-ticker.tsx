/*
 * REFERENCE COPY from 21st.dev. NOT wired in (dashboard/tsconfig.json only includes src/, so this file is never built).
 *
 * Block 1: number ticker / animated digits
 * Component: "Animate Digits" by @unlumen (ui.unlumen.com)
 * 21st.dev:  https://21st.dev/@unlumen/components/animate-digits   (demo id 20071, component id 10361)
 * Install:   npx shadcn@latest add "https://21st.dev/r/unlumen/animate-digits"   (we do NOT run it)
 * Licence:   no licence header in the source. Published on the public 21st.dev registry for install; treat as a
 *            reference and re-implement in src/stage/kit rather than shipping it verbatim until the author's terms
 *            (ui.unlumen.com) are confirmed.
 *
 * Why this one: only the digits that actually change blur-slide (up when the value grows, down when it falls), so a
 * live kW reading that moves 412 -> 418 animates one glyph, not the whole number. That reads as "live data", not as a
 * slot machine. Uses motion/react, which we already ship.
 *
 * Deps we lack: `cn` from "@/lib/utils" (clsx + tailwind-merge). Replace with a plain class join; no new package.
 *               The demo also pulls shadcn Button (@radix-ui/react-slot, class-variance-authority): not needed, drop it.
 *
 * Adapt to our tokens (src/stage/palette.ts, src/index.css):
 *  - Feed it the string from kit/Counter.tsx fmtNum(v, decimals) so thousands separators and the real minus sign stay.
 *    Keep Counter.tsx's "invisible copy of the final text" trick around it so the box never changes width.
 *  - Colour comes from the parent: text-ink (#1d1d1f) for neutral, loadTone(pct) from palette.ts for load values.
 *  - Apple tuning: enterBlur 52 -> ~8, enterY 32 -> ~0.35em, enterScale 0.7 -> 0.92, damping up (enter 10 -> 22) so
 *    digits settle without bounce; motion ease in DESIGN.md is cubic-bezier(0,0,0.5,1) (--ease-apple).
 *  - QA (qa/README.md): put data-src / data-val on the WRAPPER with the raw number, never on the per-digit spans,
 *    or the G2 checker will read "4","1","8".
 *  - Respect prefers-reduced-motion: useReducedMotion() -> render the plain string.
 */

// ---------------------------------------------------------------- original source (verbatim) ----------------------
"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useSpring, useTransform } from "motion/react";

import { cn } from "@/lib/utils";

interface AnimateDigitsProps {
  value: string;
  gap?: number;
  className?: string;
  digitClassName?: string;
  enterStiffness?: number;
  enterDamping?: number;
  exitStiffness?: number;
  exitDamping?: number;
  direction?: "dynamic" | "up" | "down";
  enterY?: number;
  enterBlur?: number;
  enterScale?: number;
  animationDelay?: number;
}

interface ExitItem {
  id: number;
  char: string;
  exitY: number;
}

let _id = 0;

function DigitCell({
  char,
  isDigit,
  className,
  enterStiffness = 170,
  enterDamping = 10,
  exitStiffness = 170,
  exitDamping = 15,
  direction = "dynamic",
  enterY = 32,
  enterBlur = 52,
  enterScale = 0.7,
}: {
  char: string;
  isDigit: boolean;
  className?: string;
  enterStiffness?: number;
  enterDamping?: number;
  exitStiffness?: number;
  exitDamping?: number;
  direction?: "dynamic" | "up" | "down";
  enterY?: number;
  enterBlur?: number;
  enterScale?: number;
}) {
  const [exitQueue, setExitQueue] = useState<ExitItem[]>([]);

  const prevCharRef = useRef(char);
  const isFirstRender = useRef(true);

  // Springs — jump() snaps the spring itself (position + velocity reset)
  const springConfig = { stiffness: enterStiffness, damping: enterDamping };
  const y = useSpring(0, springConfig);
  const opacity = useSpring(1, springConfig);
  const scale = useSpring(1, springConfig);
  const blur = useSpring(0, springConfig);
  const filter = useTransform(blur, (v) => `blur(${v}px)`);

  useEffect(() => {
    if (!isDigit) return;

    const prev = prevCharRef.current;
    prevCharRef.current = char;

    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (char === prev || !/\d/.test(prev)) return;

    const up =
      direction === "dynamic"
        ? Number(char) > Number(prev)
        : direction === "up";

    const id = _id++;
    setExitQueue((q) => {
      const next = [...q, { id, char: prev, exitY: up ? -enterY : enterY }];
      return next.length > 3 ? next.slice(-3) : next;
    });

    y.jump(up ? enterY : -enterY);
    opacity.jump(0);
    scale.jump(enterScale);
    blur.jump(enterBlur);

    y.set(0);
    opacity.set(1);
    scale.set(1);
    blur.set(0);
  }, [
    char,
    isDigit,
    direction,
    enterY,
    enterBlur,
    enterScale,
    y,
    opacity,
    scale,
    blur,
  ]);

  if (!isDigit) {
    return <span className={className}>{char}</span>;
  }

  return (
    <div
      className={cn(
        "relative grid place-items-center [&>*]:col-start-1 [&>*]:row-start-1",
        className,
      )}
    >
      <AnimatePresence>
        {exitQueue.map(({ id, char: exitChar, exitY }) => (
          <motion.span
            key={id}
            aria-hidden
            initial={{ opacity: 1, scale: 1, filter: "blur(0px)", y: 0 }}
            animate={{ opacity: 0, scale: 0.7, filter: "blur(10px)", y: exitY }}
            transition={{
              type: "spring",
              stiffness: exitStiffness,
              damping: exitDamping,
            }}
            onAnimationComplete={() =>
              setExitQueue((q) => q.filter((item) => item.id !== id))
            }
          >
            {exitChar}
          </motion.span>
        ))}
      </AnimatePresence>
      <motion.span style={{ opacity, scale, filter, y }}>{char}</motion.span>
    </div>
  );
}

function AnimateDigits({
  value,
  gap = 2,
  className,
  digitClassName,
  enterStiffness,
  enterDamping,
  exitStiffness,
  exitDamping,
  direction,
  enterY,
  enterBlur,
  enterScale,
  animationDelay = 80,
}: AnimateDigitsProps) {
  // displayedValue is what the cells actually render — advanced one step at a time
  const [displayedValue, setDisplayedValue] = useState(value);

  const pendingQueue = useRef<string[]>([]);
  const isAnimating = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const displayedRef = useRef(value);

  const processQueue = () => {
    if (pendingQueue.current.length === 0) {
      isAnimating.current = false;
      return;
    }

    isAnimating.current = true;
    const next = pendingQueue.current.shift()!;
    displayedRef.current = next;
    setDisplayedValue(next);

    timerRef.current = setTimeout(processQueue, animationDelay);
  };

  useEffect(() => {
    if (value === displayedRef.current) return;

    pendingQueue.current.push(value);

    if (!isAnimating.current) {
      processQueue();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // When animationDelay changes while animating, the in-flight timer keeps the
  // old delay for its last tick — acceptable; no need to restart the queue.

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const chars = displayedValue.split("");

  return (
    <div
      className={cn("flex items-center tabular-nums", className)}
      style={{ gap }}
    >
      {chars.map((char, i) => (
        <DigitCell
          key={i}
          char={char}
          isDigit={/\d/.test(char)}
          className={digitClassName}
          enterStiffness={enterStiffness}
          enterDamping={enterDamping}
          exitStiffness={exitStiffness}
          exitDamping={exitDamping}
          direction={direction}
          enterY={enterY}
          enterBlur={enterBlur}
          enterScale={enterScale}
        />
      ))}
    </div>
  );
}

export { AnimateDigits, type AnimateDigitsProps };

export default AnimateDigits;

// ---------------------------------------------------------------- demo usage (trimmed) -----------------------------
// <AnimateDigits value={formatTime(remaining)} gap={2}
//   className="text-7xl font-bold font-medium tracking-tighter" />
// The demo is a scroll-to-set focus timer (mm:ss) with shadcn Buttons; only the call above matters to us.
