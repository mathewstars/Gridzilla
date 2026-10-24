/*
 * REFERENCE COPY from 21st.dev. NOT wired in (dashboard/tsconfig.json only includes src/, so this file is never built).
 *
 * Block 5: countdown timer (the DSO signal window's remaining time)
 * Component: "Circle Progress", demo "Countdown" (CountdownTimer) by @hihahihahoho
 * 21st.dev:  https://21st.dev/@hihahihahoho/components/circle-progress   (demo id 1737, component id 1512)
 * Install:   npx shadcn@latest add "https://21st.dev/r/hihahihahoho/circle-progress"   (we do NOT run it)
 * Licence:   no licence header in the source. Treat as a reference and re-implement.
 *
 * Why this one: a counter-clockwise ring that drains as time runs out with mm:ss in the middle: the judges ask that the
 * DSO steers customer storage only for a LIMITED TIME, and a draining ring makes "this ends" visible from 5 m without a
 * sentence. Zero deps (plain SVG + rAF tween, ARIA progressbar with a readable valuetext). The flip / split-flap /
 * particle countdowns were rejected as retro or gimmicky for an Apple-white stage.
 *
 * Deps we lack: `cn` from "@/lib/utils" -> plain class join. The demo uses shadcn Button (radix slot + cva): drop it,
 * the stage has no start/pause, the window comes from the API.
 *
 * Adapt to our tokens and to live data:
 *  - Source of truth: the active signal's window from /api/state (start/end in grid time, or valid_until on the signed
 *    message). remaining = end - now in GRID time (the simulator runs faster than wall time), never a local
 *    setInterval countdown that drifts from the API. maxValue = window length. When no window is open, show
 *    "No DSO signal" in P.tertiary and an empty track, not 0:00.
 *  - Colours: replace emerald/amber/rose (and the default getColor) with ONE meaning: P.blue (#0071e3, the DSO /
 *    interactive colour) while the window runs; the ring is about TIME, not load, so it must not reuse load green /
 *    orange / red. Track: stroke-gray-200 -> P.fill (#e8e8ed).
 *  - Digits: render mm:ss with design/21st/number-ticker.tsx (AnimateDigits) so only the changing second slides.
 *    text-3xl font-bold -> our hero scale, tabular-nums; caption under it "DSO steering ends" (P.secondary).
 *  - Size from kit/layout.ts; strokeWidth ~8 % of size. Keep counterClockwise draining.
 *  - Drop the per-frame setAnimatedValue state (it re-renders React 60x/s); drive strokeDashoffset with a motion value
 *    (useSpring / animate) like kit/tween.ts.
 *  - QA: data-src="/api/state#signal.window" and data-val=<seconds remaining> on the wrapper; G2 must allow a +-1 s skew.
 */

// ================================================================ circle-progress.tsx (verbatim) ===================
import { cn } from "@/lib/utils"
import React from "react"

export interface CircleProgressProps
  extends React.HtmlHTMLAttributes<HTMLDivElement> {
  value: number
  maxValue: number
  size?: number
  strokeWidth?: number
  showValue?: boolean
  description?: React.ReactNode
  suffix?: string
  counterClockwise?: boolean
  onColorChange?: (color: string) => void
  onValueChange?: (value: number, percentage: number) => void
  // Custom color function
  getColor?: (fillPercentage: number) => string
  // Add className prop for styling
  className?: string
  // Animation duration in ms
  animationDuration?: number
  // Disable animation
  disableAnimation?: boolean
  // Gradient support
  useGradient?: boolean
  // Gradient colors array (from start to end)
  gradientColors?: string[]
  // Optional custom ID for the gradient
  gradientId?: string
}

const CircleProgress = ({
  value,
  maxValue,
  size = 40,
  strokeWidth = 3,
  counterClockwise = false,
  onColorChange,
  onValueChange,
  // New custom color function
  getColor,
  className,
  // Animation duration with default of 300ms
  animationDuration = 300,
  // Option to disable animation
  disableAnimation = false,
  // Gradient options
  useGradient = false,
  gradientColors = ["#10b981", "#f59e0b", "#ef4444"],
  gradientId,
  ...props
}: CircleProgressProps) => {
  // Add state for animated value
  const [animatedValue, setAnimatedValue] = React.useState(
    disableAnimation ? value : 0
  )
  // Use a ref to track the current animation value without causing re-renders
  const animatedValueRef = React.useRef(animatedValue)

  // Generate a unique gradient ID if not provided
  const uniqueGradientId = React.useRef(
    gradientId ||
      `circle-progress-gradient-${Math.random().toString(36).substring(2, 9)}`
  ).current

  // Update ref when state changes
  React.useEffect(() => {
    animatedValueRef.current = animatedValue
  }, [animatedValue])

  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const fillPercentage = Math.min(animatedValue / maxValue, 1)
  const strokeDashoffset = circumference * (1 - fillPercentage)

  // Default color function
  const defaultGetColor = (percentage: number) => {
    if (percentage < 0.7) return "stroke-emerald-500" // Green
    if (percentage < 0.9) return "stroke-amber-500" // Yellow/Orange
    return "stroke-red-500" // Red
  }

  // Use custom color function if provided, otherwise use default
  const currentColor = useGradient
    ? "" // We don't use the color classes with gradient
    : getColor
      ? getColor(fillPercentage)
      : defaultGetColor(fillPercentage)

  // Animation effect - fixed to avoid the dependency loop
  React.useEffect(() => {
    // If animation is disabled, just set the value directly
    if (disableAnimation) {
      setAnimatedValue(value)
      return
    }

    // Start from current animated value using the ref
    const start = animatedValueRef.current
    const end = Math.min(value, maxValue)
    const startTime = performance.now()

    // If we're already at the target value, don't animate
    if (start === end) return

    const animateProgress = (timestamp: number) => {
      const elapsed = timestamp - startTime
      const progress = Math.min(elapsed / animationDuration, 1)

      // Use easeOutQuad for smoother deceleration
      const easeProgress = 1 - (1 - progress) * (1 - progress)
      const currentValue = start + (end - start) * easeProgress

      setAnimatedValue(currentValue)

      if (progress < 1) {
        requestAnimationFrame(animateProgress)
      }
    }

    const animationFrame = requestAnimationFrame(animateProgress)

    return () => cancelAnimationFrame(animationFrame)
  }, [value, maxValue, animationDuration, disableAnimation]) // removed animatedValue from deps

  React.useEffect(() => {
    if (onColorChange) {
      onColorChange(currentColor)
    }
  }, [currentColor, onColorChange])

  React.useEffect(() => {
    if (onValueChange) {
      onValueChange(animatedValue, fillPercentage)
    }
  }, [animatedValue, fillPercentage, onValueChange])

  // Format value text for aria-valuetext - more descriptive for screen readers
  const valueText =
    props["aria-valuetext"] ||
    `${Math.round(value)}${props.suffix ? props.suffix : ""} out of ${maxValue}${props.suffix ? props.suffix : ""}, ${Math.round(fillPercentage * 100)}% complete`

  return (
    <div
      className={cn(className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={maxValue}
      aria-valuetext={valueText}
      {...props}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className={cn("duration-300")}
      >
        {/* SVG Gradient Definition */}
        {useGradient && (
          <defs>
            <linearGradient
              id={uniqueGradientId}
              gradientUnits="userSpaceOnUse"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              {gradientColors.map((color, index) => (
                <stop
                  key={index}
                  offset={`${(index / (gradientColors.length - 1)) * 100}%`}
                  stopColor={color}
                />
              ))}
            </linearGradient>
          </defs>
        )}
        {/* Background track circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className="fill-transparent stroke-gray-200 dark:stroke-gray-700"
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className={cn(
            "fill-transparent transition-colors",
            !useGradient && currentColor
          )}
          style={
            useGradient ? { stroke: `url(#${uniqueGradientId})` } : undefined
          }
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={
            counterClockwise ? -strokeDashoffset : strokeDashoffset
          }
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
}

export { CircleProgress }

// ================================================================ demo "Countdown" (verbatim) =======================
/*
import * as React from "react";
import { CircleProgress } from "@/components/ui/circle-progress";
import { Button } from "@/components/ui/button";

export function CountdownTimer() {
  const [totalSeconds] = React.useState(60);
  const [secondsLeft, setSecondsLeft] = React.useState(totalSeconds);
  const [isRunning, setIsRunning] = React.useState(false);
  const intervalRef = React.useRef<NodeJS.Timeout | null>(null);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const startTimer = React.useCallback(() => {
    if (secondsLeft <= 0) {
      setSecondsLeft(totalSeconds);
    }
    setIsRunning(true);
  }, [secondsLeft, totalSeconds]);

  const pauseTimer = () => {
    setIsRunning(false);
  };

  const resetTimer = () => {
    setIsRunning(false);
    setSecondsLeft(totalSeconds);
  };

  React.useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            setIsRunning(false);
            clearInterval(intervalRef.current as NodeJS.Timeout);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning]);

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative">
        <CircleProgress
          value={secondsLeft}
          maxValue={totalSeconds}
          size={160}
          strokeWidth={8}
          counterClockwise={true}
          getColor={(percentage) => {
            if (percentage > 0.66) return "stroke-emerald-500";
            if (percentage > 0.33) return "stroke-amber-500";
            return "stroke-rose-500";
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-3xl font-bold">{formatTime(secondsLeft)}</div>
            <div className="text-sm text-gray-500">
              {isRunning ? "Counting down..." : secondsLeft === 0 ? "Time's up!" : "Ready"}
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        {!isRunning ? (
          <Button onClick={startTimer} disabled={isRunning}>
            {secondsLeft === 0 ? "Restart" : secondsLeft < totalSeconds ? "Resume" : "Start"}
          </Button>
        ) : (
          <Button variant="outline" onClick={pauseTimer}>
            Pause
          </Button>
        )}
        <Button variant="outline" onClick={resetTimer}>
          Reset
        </Button>
      </div>
    </div>
  );
}
*/
