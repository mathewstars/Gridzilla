// Apple-style number: glides ease-out (~0.8 s) to each new value, tabular numerals so the digits never wobble, and an
// invisible copy of the final text keeps the box at its end width so nothing around it shifts. The first value lands at once.
import { useRef, type CSSProperties } from "react";
import { useTween } from "./tween";

/** "1,234" with a real minus sign; `decimals` fixed digits after the point. */
export function fmtNum(v: number, decimals = 0) {
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (v < 0 && Number(s.replace(/,/g, "")) !== 0 ? "−" : "") + s;
}

export default function Counter({
  value,
  decimals = 0,
  className,
  duration = 800,
  format,
  style,
}: {
  value: number | null | undefined;
  decimals?: number;
  className?: string;
  /** Glide length in ms. */
  duration?: number;
  /** Own text for a value, e.g. (v) => `+${fmtNum(v)}`. */
  format?: (v: number) => string;
  style?: CSSProperties;
}) {
  const has = value != null && Number.isFinite(value);
  // The first real value (or the first after a gap) lands at once instead of counting up from zero.
  const had = useRef(false);
  const v = useTween(has ? (value as number) : 0, duration, has && !had.current);
  had.current = has;
  const text = (n: number) => (format ? format(n) : fmtNum(n, decimals));
  const end = has ? text(value as number) : "–";
  const now = has ? text(v) : "–";
  return (
    <span
      className={className}
      style={{ display: "inline-grid", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", ...style }}
      aria-label={end}
    >
      <span aria-hidden style={{ gridArea: "1 / 1", visibility: "hidden" }}>
        {end}
      </span>
      <span aria-hidden style={{ gridArea: "1 / 1", justifySelf: "end" }}>
        {now}
      </span>
    </span>
  );
}
