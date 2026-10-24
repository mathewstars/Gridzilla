// Shared Apple-white primitives (tokens in DESIGN.md / index.css). Every view builds on these; no view styles its own
// buttons, segmented controls or cards.
import type { ReactNode } from "react";

/** Apple segmented control: grey track, white thumb with the card shadow, 0.25 s ease-out, no spring. */
export function Segmented<T extends string>({
  value, options, onChange, size = "md", disabled,
}: {
  value: T | null;
  options: { value: T; label: ReactNode; title?: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  id?: string;
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" className="inline-flex rounded-[980px] bg-fill p-[3px]">
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
            className={`whitespace-nowrap rounded-[980px] font-medium tracking-[-0.016em] transition-[background-color,box-shadow,color] duration-[250ms] ease-[cubic-bezier(0,0,0.5,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:cursor-not-allowed disabled:opacity-40 ${
              size === "sm" ? "px-3 py-1 text-[0.8125rem]" : "px-4 py-1.5 text-[0.9375rem]"
            } ${on ? "bg-white text-ink shadow-[0_1px_4px_rgb(0_0_0/0.12)]" : "text-secondary hover:bg-fill-press/60 hover:text-ink active:bg-fill-press"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A live number. No rolling animation (DESIGN.md: no motion except power on the wires). */
export function Ticker({ value, decimals = 0, className }: { value: number | null; decimals?: number; className?: string }) {
  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {value == null ? "-" : value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
    </span>
  );
}

/** Card heading: one plain-English title, an optional one-line plain subtitle, an optional control on the right. */
export function PanelTitle({ title, tech, right }: { title: ReactNode; tech?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="t-title text-ink">{title}</h2>
        {tech && <div className="t-small mt-0.5">{tech}</div>}
      </div>
      {right}
    </div>
  );
}

/** The one status badge a card may carry. `alert` = Apple red (over the limit, refused, warning). */
export function Badge({ children, alert }: { children: ReactNode; alert?: boolean }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-[6px] px-2 py-0.5 text-[0.8125rem] font-semibold tracking-[-0.01em] ${
        alert ? "bg-red text-white" : "bg-fill text-ink"
      }`}
    >
      {children}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="t-small flex h-full min-h-[6rem] items-center justify-center px-6 text-center">{children}</div>;
}
