// Transformer load as an Apple Watch activity ring: a faint track, a round-capped arc that fills 0-100 % of the limit in
// its meaning colour (green inside, orange from 85 %, red from 100 %), and past 100 % a second red lap that runs over the
// first with the small shadow under its tip, exactly how Watch rings show "more than the goal". The sweep and the number
// glide to each new reading. Reverse flow (solar pushing back) counts against the reverse limit; the sublabel says so.
//
// It fits its container: `size` is the largest it gets, it shrinks with the box it sits in (ResizeObserver), and the
// centre text is measured so it always sits inside the inner ring: the type shrinks first, then the small label above
// the number drops, then the sublabel wraps to two lines, then it drops. The number itself always stays.
import { useId, useLayoutEffect, useRef, useState } from "react";
import { P, loadTone } from "../palette";
import Counter from "./Counter";
import { textW } from "./layout";
import { useTween } from "./tween";

interface Fit {
  num: number;
  small: number;
  label: boolean;
  sub: string[];
  gap: number;
}

/** Biggest centre text that fits a circle of radius `ri`: every line's outer corners stay inside it. */
function fitCentre(ri: number, D: number, stacked: boolean, label: string | undefined, sub: string | null): Fit {
  const num0 = Math.max(18, D * (stacked ? 0.2 : 0.25));
  const small0 = Math.max(12, D * 0.075);
  const digits = "888"; // tabular digits are all one width; three of them, so crossing 100 % never changes the size
  const fits = (lines: { w: number; h: number }[], gap: number) => {
    const total = lines.reduce((a, l) => a + l.h, 0) + gap;
    let top = -total / 2;
    for (const l of lines) {
      const yFar = Math.max(Math.abs(top), Math.abs(top + l.h));
      if ((l.w / 2) ** 2 + yFar ** 2 > ri * ri) return false;
      top += l.h;
    }
    return true;
  };
  const split = (t: string): string[] => {
    const w = t.split(" ");
    if (w.length < 2) return [t];
    let best: string[] = [t];
    let bestW = Infinity;
    for (let i = 1; i < w.length; i++) {
      const a = w.slice(0, i).join(" ");
      const b = w.slice(i).join(" ");
      const m = Math.max(a.length, b.length);
      if (m < bestW) {
        bestW = m;
        best = [a, b];
      }
    }
    return best;
  };
  const variants: { label: boolean; sub: string[] }[] = [];
  if (label && sub) variants.push({ label: true, sub: [sub] });
  if (sub) variants.push({ label: false, sub: [sub] }, { label: false, sub: split(sub) });
  else if (label) variants.push({ label: true, sub: [] });
  variants.push({ label: false, sub: [] });
  for (const v of variants) {
    const last = v.sub.length === 0 && !v.label;
    for (const k of last ? [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3] : [1, 0.9, 0.8, 0.72]) {
      const num = num0 * k;
      const small = Math.max(11, small0 * k);
      if (!last && small > num * 0.6) continue;
      const lines = [
        ...(v.label && label ? [{ w: textW(label, small, 600), h: small * 1.2 }] : []),
        { w: textW(digits, num, 600) + textW("%", num * 0.5, 600) + num * 0.04, h: num },
        ...v.sub.map((t) => ({ w: textW(t, small), h: small * 1.25 })),
      ];
      const gap = v.sub.length ? D * 0.02 : 0;
      if (fits(lines, gap) || (last && k === 0.3)) return { num, small, label: v.label, sub: v.sub, gap };
    }
  }
  return { num: num0 * 0.3, small: 11, label: false, sub: [], gap: 0 };
}

export default function LoadRing({
  pct,
  size,
  stroke,
  label,
  sublabel,
  withoutPct,
}: {
  /** Signed % of the limit: positive = drawing from the grid, negative = flowing back. null = no reading yet. */
  pct: number | null | undefined;
  /** Largest outer diameter in px; the ring shrinks to fit a narrower container. */
  size: number;
  /** Ring thickness in px (default 12 % of the size, Watch proportions). */
  stroke?: number;
  /** Small line above the number, e.g. the transformer name. */
  label?: string;
  /** Line under the number; default is the direction ("Of its limit" / "Flowing back"), null hides it. */
  sublabel?: string | null;
  /** Optional "without Gridzilla" load, signed %: drawn as an outer ring, Watch-stack style, with "with" inside it. */
  withoutPct?: number | null;
}) {
  const id = useId().replace(/:/g, "");
  const box = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    // measured before the first paint, so a phone never sees the full-size ring and its number spill past the screen
    setRoom(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setRoom(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // The diameter actually drawn: the size asked for, or less when the container is narrower.
  const D = room > 0 ? Math.min(room, size) : size;
  const has = pct != null && Number.isFinite(pct);
  const target = has ? Math.min(Math.abs(pct as number), 199) : 0;
  const p = useTween(target, 900);

  const sw = stroke != null ? Math.max(4, (stroke * D) / size) : Math.max(6, Math.round(D * 0.12));
  const stacked = withoutPct !== undefined;
  const wo = useTween(stacked && withoutPct != null && Number.isFinite(withoutPct) ? Math.min(Math.abs(withoutPct), 199) : 0, 900);
  const rOut = (D - sw) / 2;
  // Stacked: the "with" ring sits one ring further in, like the Watch's second ring.
  const r = stacked ? rOut - sw * 1.12 : rOut;
  const c = D / 2;
  const C = 2 * Math.PI * r;
  const lap1 = Math.min(p, 100) / 100;
  const lap2 = Math.max(0, p - 100) / 100;
  const tone = loadTone(p);
  // Round caps add half a stroke at each end: on a short sweep that turns the arc into a pill or a dot. So an arc gets
  // round caps only when it is longer than the stroke is wide; shorter, it is a thin butt-capped sliver; under 1 px, none.
  const cap = (len: number) => (len > sw ? "round" : "butt");
  const len1 = lap1 * C;
  const len2 = lap2 * C;
  const woLen1 = (Math.min(wo, 100) / 100) * 2 * Math.PI * rOut;
  const woLen2 = (Math.max(0, wo - 100) / 100) * 2 * Math.PI * rOut;

  // Tip of the second lap: where its shadow falls, a little ahead in the direction of travel.
  const a = lap2 * 2 * Math.PI;
  const tipX = c + r * Math.sin(a);
  const tipY = c - r * Math.cos(a);
  const ahead = sw * 0.14;

  const sub =
    sublabel === null ? null : sublabel ?? (has ? ((pct as number) < 0 ? "Flowing back" : "Of its limit") : "No reading yet");
  const over = has && Math.abs(pct as number) >= 100;
  const fit = fitCentre(Math.max(1, r - sw / 2 - Math.max(2, D * 0.02)), D, stacked, label, sub);

  return (
    <div ref={box} className="relative grid min-w-0 place-items-center" style={{ width: size, maxWidth: "100%", aspectRatio: "1 / 1", flexShrink: 1 }}>
      {/* capped to the box: before the first measure D is the full `size`, which would widen a phone page for a frame */}
      <svg width={D} height={D} viewBox={`0 0 ${D} ${D}`} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ maxWidth: "100%", maxHeight: "100%" }} aria-hidden>
        <defs>
          <filter id={`tip-${id}`} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation={sw * 0.16} />
          </filter>
        </defs>
        {stacked && (
          <>
            <circle cx={c} cy={c} r={rOut} fill="none" stroke={P.ink} strokeOpacity={0.07} strokeWidth={sw} />
            <g transform={`rotate(-90 ${c} ${c})`}>
              {woLen1 >= 1 && (
                <circle cx={c} cy={c} r={rOut} fill="none" stroke={loadTone(Math.min(wo, 99.9))} strokeOpacity={0.55} strokeWidth={sw}
                  strokeLinecap={cap(woLen1)} strokeDasharray={`${woLen1} ${2 * Math.PI * rOut}`} />
              )}
              {woLen2 >= 1 && (
                <circle cx={c} cy={c} r={rOut} fill="none" stroke={P.red} strokeWidth={sw} strokeLinecap={cap(woLen2)}
                  strokeDasharray={`${woLen2} ${2 * Math.PI * rOut}`} />
              )}
            </g>
          </>
        )}
        <circle cx={c} cy={c} r={r} fill="none" stroke={P.ink} strokeOpacity={0.07} strokeWidth={sw} />
        <g transform={`rotate(-90 ${c} ${c})`}>
          {len1 >= 1 && (
            <circle
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={tone}
              strokeWidth={sw}
              strokeLinecap={cap(len1)}
              strokeDasharray={`${len1} ${C}`}
            />
          )}
        </g>
        {len2 >= 1 && (
          <>
            <circle
              cx={tipX + Math.cos(a) * ahead}
              cy={tipY + Math.sin(a) * ahead}
              r={sw / 2}
              fill="#000"
              fillOpacity={0.45}
              filter={`url(#tip-${id})`}
            />
            <g transform={`rotate(-90 ${c} ${c})`}>
              <circle
                cx={c}
                cy={c}
                r={r}
                fill="none"
                stroke={P.red}
                strokeWidth={sw}
                strokeLinecap={cap(len2)}
                strokeDasharray={`${len2} ${C}`}
              />
            </g>
          </>
        )}
      </svg>
      <div className="relative flex flex-col items-center text-center" style={{ maxWidth: Math.max(1, 2 * r - sw) }}>
        {fit.label && label && (
          <div className="font-semibold" style={{ fontSize: fit.small, lineHeight: 1.2, color: P.secondary, letterSpacing: "-0.01em" }}>
            {label}
          </div>
        )}
        <div className="font-semibold" style={{ fontSize: fit.num, lineHeight: 1, letterSpacing: "-0.03em", color: over ? P.red : P.ink }}>
          <Counter value={has ? Math.abs(pct as number) : null} duration={900} />
          <span style={{ fontSize: "0.5em", letterSpacing: 0, marginLeft: "0.04em" }}>%</span>
        </div>
        {fit.sub.length > 0 && (
          <div style={{ fontSize: fit.small, lineHeight: 1.25, color: P.secondary, marginTop: fit.gap, letterSpacing: "-0.01em" }}>
            {fit.sub.map((t) => (
              <div key={t}>{t}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
