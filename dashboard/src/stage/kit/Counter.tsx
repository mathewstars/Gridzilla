// Apple-style number: glides ease-out (~0.8 s) to each new value, tabular numerals so the digits never wobble, and an
// invisible copy of the final text (a CSS pseudo-element, so it is not page text) keeps the box at its end width so nothing around it shifts. The first value lands at once.
import { useRef, type CSSProperties } from "react";
import { useTween } from "./tween";
import "./counter.css";

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
  src,
  from,
  scale,
  label,
}: {
  value: number | null | undefined;
  decimals?: number;
  className?: string;
  /** Glide length in ms. */
  duration?: number;
  /** Own text for a value, e.g. (v) => `+${fmtNum(v)}`. */
  format?: (v: number) => string;
  style?: CSSProperties;
  /** G2 data truth (qa/README.md): where the number comes from, e.g. "state/aggregates/tf:x/total_kw", "derived", "deck". */
  src?: string;
  /** For src="derived": the formula over endpoint paths, e.g. "state/aggregates/tf:x/baseline_kw - state/aggregates/tf:x/total_kw". */
  from?: string;
  /** Shown value = raw value x scale (kW shown as MW: 0.001). The raw value goes in data-val. */
  scale?: number;
  /** For src="deck": the on-screen label of the static fact. */
  label?: string;
}) {
  const has = value != null && Number.isFinite(value);
  // The first real value (or the first after a gap) lands at once instead of counting up from zero. So does a value
  // from another source (the stage moved to another street): gliding from the last street's number would show a
  // number that belongs to neither.
  const had = useRef(false);
  const lastSrc = useRef(src);
  const v = useTween(has ? (value as number) : 0, duration, has && (!had.current || lastSrc.current !== src));
  had.current = has;
  lastSrc.current = src;
  const text = (n: number) => (format ? format(n) : fmtNum(n, decimals));
  const end = has ? text(value as number) : "–";
  const now = has ? text(v) : "–";
  return (
    <span
      className={className}
      style={{ display: "inline-grid", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", ...style }}
      aria-label={end}
      data-src={src}
      data-from={from}
      data-val={src && has ? String((value as number) / (scale ?? 1)) : undefined}
      data-scale={scale != null && scale !== 1 ? String(scale) : undefined}
      data-label={label}
    >
      <span aria-hidden className="gzCounter-w" data-w={end} style={{ gridArea: "1 / 1", visibility: "hidden" }} />
      <span aria-hidden style={{ gridArea: "1 / 1", justifySelf: "end" }}>
        {now}
      </span>
    </span>
  );
}
