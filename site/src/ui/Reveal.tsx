// Scroll reveal: rises 24 px and fades in once when 30 % of it is on screen. Under reduced motion it is simply there.
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

export const EASE = [0.16, 1, 0.3, 1] as const;

export function Reveal({ children, delay = 0, className, amount = 0.3, as = "div" }: { children: ReactNode; delay?: number; className?: string; amount?: number | "some" | "all"; as?: "div" | "li" | "p" | "figure" }) {
  const reduce = useReducedMotion();
  const M = motion[as];
  return (
    <M
      className={className}
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount }}
      transition={{ duration: 0.7, delay, ease: EASE }}
    >
      {children}
    </M>
  );
}
