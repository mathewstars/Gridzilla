/*
 * REFERENCE COPY from 21st.dev. NOT wired in (dashboard/tsconfig.json only includes src/, so this file is never built).
 *
 * Block 8: step progress / timeline (Sees -> Thinks -> Checks -> Acts)
 * Component: "Animated Progress Stepper" (stepper-03) by @shadcnspace
 * 21st.dev:  https://21st.dev/@shadcnspace/components/stepper-03   (demo id 28558, component id 14938)
 * Install:   npx shadcn@latest add "https://21st.dev/r/shadcnspace/stepper-03"   (we do NOT run it)
 * Licence:   no licence header in the source. Treat as a reference and re-implement.
 *
 * Why this one: horizontal, four steps (exactly our count), a spring-filled progress line with a travelling dot between
 * steps, a soft pulse on the active step and an icon -> check morph when a step is done. That is the autopilot loop
 * read left to right from 5 m. Motion only via motion/react (installed).
 *
 * Deps we lack (all removable):
 *  - "lucide-react" icons -> @phosphor-icons/react (installed): Eye (Sees), Brain (Thinks), ShieldCheck (Checks:
 *    the deterministic guard), PaperPlaneTilt or Lightning (Acts: the signed signal goes out), Check.
 *  - shadcn Button + Separator (@radix-ui/react-slot, @radix-ui/react-separator, class-variance-authority): only used
 *    by the Back/Continue footer, which we delete (the steps are driven by the live autopilot, not by clicks).
 *  - `cn` from "@/lib/utils" -> plain class join.
 *
 * Adapt to our tokens and to kit/AiSteps.tsx (which already holds the live logic: STAGE_INDEX sense/deepseek/guard/send):
 *  - activeStep comes from the autopilot's live stage (/api/autopilot), not useState + buttons. A NEW decision replays
 *    0 -> 3 once; a repeat poll of the same decision does nothing.
 *  - bg-primary -> P.blue (#0071e3) for the active step and the filled line (AiSteps: "active step is Apple blue");
 *    done steps P.ink with a white check (drop text-teal-400); waiting steps bg P.fill, icon P.tertiary.
 *  - Under each step one live line (AiSteps' `line`): Sees "412 kW, 103 % of limit", Thinks "DeepSeek: shift 40 kW",
 *    Checks "Guard OK: inside bounds, 45 min window", Acts "Signed #128 sent". Checks turns P.red when the guard vetoes.
 *  - Pulse: scale 1.45 / 2.2 s -> 1.25 / 2.4 s and opacity floor 0.35 (calmer, Apple). Respect useReducedMotion (it does).
 *  - Positions use left 12.5 % / 75 % maths for 4 equal columns: keep, it is correct for 4 steps.
 *  - At 390 wide: same component vertical (or swap to the rejected ddoemonn Task Steps, which is vertical, zero-dep).
 *  - QA: data-src="/api/autopilot#stage" + data-val on the step row; numbers in the lines carry their own data-src.
 */

// ---------------------------------------------------------------- original source (verbatim) ----------------------
"use client";

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Home,
  Settings,
  Upload,
  User,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface Step {
  title: string;
  icon: LucideIcon;
  content: string;
}

const steps: Step[] = [
  { title: "Account", icon: User, content: "Account details are here" },
  { title: "Profile", icon: Settings, content: "Profile settings are here" },
  { title: "Upload", icon: Upload, content: "Upload your files here" },
  { title: "Done", icon: Home, content: "Everything is ready" },
];

export default function Stepper03() {
  const [activeStep, setActiveStep] = useState(0);
  const prefersReducedMotion = useReducedMotion();

  const progress = activeStep / (steps.length - 1);

  const handleNext = () => {
    if (activeStep < steps.length - 1) {
      setActiveStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    setActiveStep((prev) => Math.max(0, prev - 1));
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="rounded-xl border border-border bg-background p-6 md:p-8 flex flex-col gap-8">
        <div className="relative">
          <div
            className="absolute top-5 h-0.5 bg-border"
            style={{ left: "12.5%", right: "12.5%" }}
          />
          <motion.div
            className="absolute top-5 h-0.5 bg-primary origin-left"
            style={{ left: "12.5%", right: "12.5%" }}
            initial={false}
            animate={{ scaleX: progress }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
          />
          <motion.span
            className="absolute size-2 rounded-full bg-primary"
            style={{ top: 21, x: "-50%", y: "-50%" }}
            initial={{ left: "12.5%" }}
            animate={{ left: `${12.5 + progress * 75}%` }}
            transition={{ type: "spring", stiffness: 160, damping: 24 }}
          />
          <div className="relative flex items-start justify-between">
            {steps.map((step, index) => {
              const isActive = index === activeStep;
              const isCompleted = index < activeStep;
              return (
                <div
                  key={step.title}
                  className="flex flex-1 flex-col items-center gap-2"
                >
                  <button
                    type="button"
                    onClick={() => setActiveStep(index)}
                    aria-current={isActive ? "step" : undefined}
                    aria-label={`${step.title} step`}
                    className="group relative z-10 flex size-10 cursor-pointer items-center justify-center rounded-full transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <span
                      className={cn(
                        "absolute inset-0 rounded-full transition-colors duration-300",
                        isCompleted || isActive
                          ? "bg-primary"
                          : "bg-muted group-hover:bg-muted/80",
                      )}
                    />
                    {isActive && !prefersReducedMotion && (
                      <motion.span
                        className="absolute inset-0 rounded-full ring-2 ring-primary/50"
                        initial={{ scale: 1, opacity: 1 }}
                        animate={{
                          scale: [1, 1.45, 1],
                          opacity: [1, 0.2, 1],
                        }}
                        transition={{
                          duration: 2.2,
                          repeat: Infinity,
                          repeatType: "mirror",
                          ease: "easeInOut",
                        }}
                      />
                    )}
                    <motion.div
                      className="relative flex items-center justify-center"
                      animate={{ scale: isActive ? 1.1 : 1 }}
                      transition={{
                        type: "spring",
                        stiffness: 320,
                        damping: 18,
                      }}
                    >
                      <AnimatePresence mode="wait" initial={false}>
                        {isCompleted ? (
                          <motion.span
                            key="check"
                            initial={{ scale: 0, rotate: -90, opacity: 0 }}
                            animate={{ scale: 1, rotate: 0, opacity: 1 }}
                            exit={{ scale: 0, rotate: 90, opacity: 0 }}
                            transition={{
                              type: "spring",
                              stiffness: 400,
                              damping: 22,
                            }}
                            className="flex items-center justify-center text-teal-400"
                          >
                            <Check className="size-5" strokeWidth={3} />
                          </motion.span>
                        ) : (
                          <motion.span
                            key="icon"
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            transition={{
                              type: "spring",
                              stiffness: 400,
                              damping: 22,
                            }}
                            className="flex items-center justify-center"
                          >
                            <step.icon
                              className={cn(
                                "size-5",
                                isActive
                                  ? "text-primary-foreground"
                                  : "text-muted-foreground",
                              )}
                            />
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  </button>
                  <span
                    className={cn(
                      "text-xs font-medium transition-colors duration-300",
                      isActive || isCompleted
                        ? "text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {step.title}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="min-h-20 text-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeStep}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-1"
            >
              <p className="text-lg font-semibold text-foreground">
                {steps[activeStep].title} content
              </p>
              <p className="text-sm text-muted-foreground">
                {steps[activeStep].content}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={activeStep === 0}
            className="cursor-pointer"
          >
            <ChevronLeft />
            Back
          </Button>
          <p className="text-sm text-muted-foreground">
            Step {activeStep + 1} of {steps.length}
          </p>
          <Button
            onClick={handleNext}
            disabled={activeStep === steps.length - 1}
            className="cursor-pointer"
          >
            Continue
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- demo usage ---------------------------------------
// import Stepper03 from "@/components/ui/stepper-03";
// <div className="flex min-h-screen w-full items-center justify-center p-6"><Stepper03 /></div>
