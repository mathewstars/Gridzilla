import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, type ReactNode } from "react";

/** Sliding-pill segmented control (pattern from the 21st.dev segmented controls, rebuilt on Motion). */
export function Segmented<T extends string>({
  value, options, onChange, id, size = "md", disabled,
}: {
  value: T | null;
  options: { value: T; label: ReactNode; title?: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  id: string;
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" className="relative inline-flex rounded-full bg-black/35 p-1 shadow-[inset_0_1px_2px_rgb(0_0_0/0.6),inset_0_0_0_1px_rgb(255_255_255/0.05)]">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={on}
            title={o.title}
            disabled={disabled || o.disabled}
            onClick={() => onChange(o.value)}
            className={`relative z-0 whitespace-nowrap rounded-full font-medium transition-colors focus-visible:outline-2 focus-visible:outline-signal disabled:cursor-not-allowed disabled:opacity-40 ${
              size === "sm" ? "px-3 py-1.5 text-[0.78rem]" : "px-4 py-2 text-[0.86rem]"
            } ${on ? "text-ink" : "text-dim hover:text-fg"}`}
          >
            {on && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 -z-10 rounded-full bg-gradient-to-b from-[#f4f8fc] to-[#c9d4e2] shadow-[0_4px_14px_-4px_rgb(0_0_0/0.8),inset_0_1px_0_white]"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Number that rolls to its new value instead of jumping (spring tween, like the 21st.dev number tickers). */
export function Ticker({ value, decimals = 0, className }: { value: number | null; decimals?: number; className?: string }) {
  const mv = useMotionValue(value ?? 0);
  const reduce = useReducedMotion();
  const text = useTransform(mv, (v) => v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }));
  useEffect(() => {
    if (value == null) return;
    if (reduce) mv.set(value);
    else {
      const c = animate(mv, value, { duration: 0.9, ease: [0.16, 1, 0.3, 1] });
      return () => c.stop();
    }
  }, [value, reduce, mv]);
  if (value == null) return <span className={className}>-</span>;
  return <motion.span className={className}>{text}</motion.span>;
}

export function PanelTitle({ title, tech, right }: { title: ReactNode; tech?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[1.02rem] font-semibold tracking-[-0.01em] text-fg">{title}</h2>
        {tech && <div className="tech mt-0.5">{tech}</div>}
      </div>
      {right}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="flex h-full min-h-[6rem] items-center justify-center px-6 text-center text-[0.86rem] text-dim">{children}</div>;
}
