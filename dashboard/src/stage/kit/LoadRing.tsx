// Transformer load as an Apple Watch activity ring: a faint track, a round-capped arc that fills 0-100 % of the limit in
// its meaning colour (green inside, orange from 85 %, red from 100 %), and past 100 % a second red lap that runs over the
// first with the small shadow under its tip, exactly how Watch rings show "more than the goal". The sweep and the number
// glide to each new reading. Reverse flow (solar pushing back) counts against the reverse limit; the sublabel says so.
import { useId } from "react";
import { P, loadTone } from "../palette";
import Counter from "./Counter";
import { useTween } from "./tween";

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
  /** Outer diameter in px. */
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
  const has = pct != null && Number.isFinite(pct);
  const target = has ? Math.min(Math.abs(pct as number), 199) : 0;
  const p = useTween(target, 900);

  const sw = stroke ?? Math.max(6, Math.round(size * 0.12));
  const stacked = withoutPct !== undefined;
  const wo = useTween(stacked && withoutPct != null && Number.isFinite(withoutPct) ? Math.min(Math.abs(withoutPct), 199) : 0, 900);
  const rOut = (size - sw) / 2;
  // Stacked: the "with" ring sits one ring further in, like the Watch's second ring.
  const r = stacked ? rOut - sw * 1.12 : rOut;
  const c = size / 2;
  const C = 2 * Math.PI * r;
  const lap1 = Math.min(p, 100) / 100;
  const lap2 = Math.max(0, p - 100) / 100;
  const tone = loadTone(p);

  // Tip of the second lap: where its shadow falls, a little ahead in the direction of travel.
  const a = lap2 * 2 * Math.PI;
  const tipX = c + r * Math.sin(a);
  const tipY = c - r * Math.cos(a);
  const ahead = sw * 0.14;

  const sub =
    sublabel === null ? null : sublabel ?? (has ? ((pct as number) < 0 ? "Flowing back" : "Of its limit") : "No reading yet");
  const over = has && Math.abs(pct as number) >= 100;
  const num = Math.max(26, size * (stacked ? 0.2 : 0.25));
  const small = Math.max(14, size * 0.075);

  return (
    <div className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0" aria-hidden>
        <defs>
          <filter id={`tip-${id}`} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation={sw * 0.16} />
          </filter>
        </defs>
        {stacked && (
          <>
            <circle cx={c} cy={c} r={rOut} fill="none" stroke={P.ink} strokeOpacity={0.07} strokeWidth={sw} />
            <g transform={`rotate(-90 ${c} ${c})`}>
              {wo > 0.4 && (
                <circle cx={c} cy={c} r={rOut} fill="none" stroke={loadTone(Math.min(wo, 99.9))} strokeOpacity={0.55} strokeWidth={sw}
                  strokeLinecap="round" strokeDasharray={`${(Math.min(wo, 100) / 100) * 2 * Math.PI * rOut} ${2 * Math.PI * rOut}`} />
              )}
              {wo > 100.4 && (
                <circle cx={c} cy={c} r={rOut} fill="none" stroke={P.red} strokeWidth={sw} strokeLinecap="round"
                  strokeDasharray={`${((wo - 100) / 100) * 2 * Math.PI * rOut} ${2 * Math.PI * rOut}`} />
              )}
            </g>
          </>
        )}
        <circle cx={c} cy={c} r={r} fill="none" stroke={P.ink} strokeOpacity={0.07} strokeWidth={sw} />
        <g transform={`rotate(-90 ${c} ${c})`}>
          {lap1 > 0.004 && (
            <circle
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={tone}
              strokeWidth={sw}
              strokeLinecap="round"
              strokeDasharray={`${lap1 * C} ${C}`}
            />
          )}
        </g>
        {lap2 > 0.004 && (
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
                strokeLinecap="round"
                strokeDasharray={`${lap2 * C} ${C}`}
              />
            </g>
          </>
        )}
      </svg>
      <div className="relative flex flex-col items-center text-center" style={{ maxWidth: 2 * r - sw * 1.4 }}>
        {label && (
          <div className="font-semibold" style={{ fontSize: small, lineHeight: 1.2, color: P.secondary, letterSpacing: "-0.01em" }}>
            {label}
          </div>
        )}
        <div
          className="font-semibold"
          style={{ fontSize: num, lineHeight: 1, letterSpacing: "-0.03em", color: over ? P.red : P.ink }}
        >
          <Counter value={has ? Math.abs(pct as number) : null} duration={900} />
          <span style={{ fontSize: "0.5em", letterSpacing: 0, marginLeft: "0.04em" }}>%</span>
        </div>
        {sub && (
          <div style={{ fontSize: small, lineHeight: 1.25, color: P.secondary, marginTop: size * 0.02, letterSpacing: "-0.01em" }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}
