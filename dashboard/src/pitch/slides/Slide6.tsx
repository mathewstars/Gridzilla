// Slide 6, real and simulated (3:30, 25 s, dad). A split screen, both halves live. Left, real: the Victron plant and
// the Viessmann heat pump in Blatnica, Slovakia, straight from /api/state (or "Blatnica: waiting for the plant" and
// never a made-up value), with the signed message path under it. Right, simulated: the city heat grid, one cell per
// street transformer in the simulated Vienna, coloured by its load every poll, with the three measured numbers under it.
// The two tiles share their rows (CSS subgrid), so the hero, the bottom row and the foot line up across the split.
// Count up adapted from 21st.dev "Count Up" (@unlumen, id 20068): its no-effect mode (a motion value writing the text
// through a ref), with our ease instead of its spring, a real minus sign, and a hidden copy of the end text holding the width.
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { animate, useReducedMotion } from "motion/react";
import { BatteryCharging, CheckCircle, HourglassMedium, ShieldCheck, Signature } from "@phosphor-icons/react";
import { useGridState, type State } from "../../api";
import Counter from "../../stage/kit/Counter";
import { useServerNow } from "../../stage/kit/Countdown";
import { loadTone } from "../../stage/palette";
import { MEASURED, MEASURED_ON } from "../facts";
import type { SlideProps } from "../types";
import "./slide6.css";

const EASE: [number, number, number, number] = [0.25, 0.1, 0.3, 1];
const MINUS = "−";
const B = "state/households/blatnica";
const COLS = 12;

const fmt = (v: number, d: number) => v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

/** A deck figure that counts up once from zero (21st.dev Count Up, adapted). `still` lands at the end value at once. */
function CountUp({
  to,
  decimals = 0,
  sign = "",
  delay,
  still,
  label,
}: {
  to: number;
  decimals?: number;
  sign?: string;
  delay: number;
  still: boolean;
  label: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const end = sign + fmt(to, decimals);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (still || to === 0) {
      el.textContent = end;
      return;
    }
    el.textContent = sign + fmt(0, decimals);
    let ctl: { stop: () => void } | undefined;
    const t = window.setTimeout(() => {
      ctl = animate(0, to, { duration: 1, ease: EASE, onUpdate: (v) => (el.textContent = sign + fmt(v, decimals)) });
    }, delay * 1000);
    return () => {
      window.clearTimeout(t);
      ctl?.stop();
    };
  }, [to, decimals, sign, delay, still, end]);
  return (
    <span className="s6-count" data-src="deck" data-label={label} aria-label={end}>
      <span aria-hidden className="s6-w" data-w={end} />
      <span aria-hidden className="s6-v" ref={ref}>
        {end}
      </span>
    </span>
  );
}

/** One column of a bottom row: a mark (a number or an icon with a word), then a short line under it. */
function Cell({ top, line, rise, delay }: { top: ReactNode; line: ReactNode; rise: boolean; delay: number }) {
  return (
    <div className={`s6-cell${rise ? " s6-rise" : ""}`} style={rise ? { animationDelay: `${delay}s` } : undefined}>
      <div className="s6-top">{top}</div>
      <p className="p-small p-secondary s6-line">{line}</p>
    </div>
  );
}

// ------------------------------------------------------------------ left: real

/** One reading of the real plant: what it is, then the live number, or "waiting" when the plant is silent. */
function Reading({ name, value, unit }: { name: string; value: ReactNode | null; unit: string }) {
  return (
    <div className="s6-reading">
      <p className="p-small p-secondary s6-rname">{name}</p>
      {value != null ? (
        <div className="p-title s6-rval">
          {value}
          <span className="p-unit">{unit}</span>
        </div>
      ) : (
        <p className="p-body p-tertiary s6-rwait">waiting</p>
      )}
    </div>
  );
}

function RealHero({ s, nowMs, loading }: { s: State | null; nowMs: number | null; loading: boolean }) {
  const b = s?.households?.blatnica;
  const t = b?.telemetry ?? null;
  const rx = t?.rx ? Date.parse(t.rx) : NaN;
  const ageMs = nowMs != null && Number.isFinite(rx) ? nowMs - rx : null;
  const live = !!b && b.registered && !!t && ageMs != null && ageMs < 5 * 60_000;
  if (loading) return <div className="s6-hero" />;
  const ack = b?.ack;
  const L = live && t ? t : null;
  return (
    <div className="s6-hero" data-live={live ? "1" : "0"}>
      <div className="s6-plant">
        <Reading name="Victron battery" unit="%" value={L && L.soc != null ? <Counter value={L.soc} src={`${B}/telemetry/soc`} /> : null} />
        <Reading name="Home at the meter" unit="kW" value={L ? <Counter value={L.grid_kw} decimals={1} src={`${B}/telemetry/grid_kw`} /> : null} />
        <Reading name="Car charger" unit="kW" value={L ? <Counter value={L.ev_kw} decimals={1} src={`${B}/telemetry/ev_kw`} /> : null} />
        <Reading name="Viessmann heat pump" unit="kW" value={L ? <Counter value={L.hp_kw} decimals={1} src={`${B}/telemetry/hp_kw`} /> : null} />
      </div>
      {live ? (
        <p className="p-small s6-status">
          {ack?.verified ? <CheckCircle weight="fill" size={36} className="s6-ok" aria-hidden /> : null}
          {ack?.seq != null ? (
            <span>
              {ack.status === "reverted" ? "Back to its owner after message " : "Answered message "}
              <span className="p-num" data-src={`${B}/ack/seq`} data-val={String(ack.seq)}>
                {ack.seq}
              </span>
              {ack.verified ? ", signature checked" : ""}
            </span>
          ) : (
            <span>Live, on the same signed message path</span>
          )}
        </p>
      ) : (
        <p className="p-small s6-status">
          <HourglassMedium weight="regular" size={36} className="s6-wait" aria-hidden />
          <span>Blatnica: waiting for the plant</span>
        </p>
      )}
    </div>
  );
}

/** The real path every message takes, end to end. Marks turn green only while the plant answers, signature checked. */
const PATH = [
  { Icon: Signature, word: "Signed", line: ["by the platform,", "one message"] },
  { Icon: ShieldCheck, word: "Checked", line: ["by the plant,", "signature first"] },
  { Icon: BatteryCharging, word: "Followed", line: ["by the battery", "and heat pump"] },
];

// ------------------------------------------------------------------ right: simulated

type Tone = "green" | "orange" | "red" | "none";
const toneOf = (pct: number | null | undefined): Tone =>
  pct == null ? "none" : loadTone(pct) === "#ff3b30" ? "red" : loadTone(pct) === "#ff9500" ? "orange" : "green";
const TF = "state/aggregates/tf:*";
const COUNT_FROM: Record<Exclude<Tone, "none">, string> = {
  green: `count(${TF}[load_pct != null and abs(load_pct) < 85])`,
  orange: `count(${TF}[abs(load_pct) >= 85 and abs(load_pct) < 100])`,
  red: `count(${TF}[abs(load_pct) >= 100])`,
};

function Live({ n, from }: { n: number; from: string }) {
  return (
    <span className="p-num" data-src="derived" data-from={from} data-val={String(n)}>
      {n}
    </span>
  );
}

function HeatGrid({ s, wave }: { s: State | null; wave: boolean }) {
  const cells = useMemo(() => {
    const a = s?.aggregates ?? {};
    return Object.keys(a)
      .filter((k) => k.startsWith("tf:"))
      .sort()
      .map((k) => ({ k, pct: a[k].load_pct }));
  }, [s]);
  const counts = { green: 0, orange: 0, red: 0, none: 0 };
  cells.forEach((c) => counts[toneOf(c.pct)]++);
  const rows = Math.max(1, Math.ceil(cells.length / COLS));
  return (
    <div className="s6-hero">
      <div
        className="s6-grid"
        style={{ gridTemplateRows: `repeat(${rows}, 1fr)` }}
        role="img"
        aria-label="One square per street transformer, coloured by its load"
      >
        {cells.map((c, i) => {
          const p = c.pct == null ? null : Math.min(1, Math.abs(c.pct) / 100);
          // Brighter = closer to its limit; the hue is the meaning (green inside, orange near, red over).
          const bg = p == null ? "var(--p-fill)" : `color-mix(in srgb, ${loadTone(c.pct)} ${Math.round(45 + 55 * p)}%, var(--p-fill))`;
          const col = i % COLS;
          const row = Math.floor(i / COLS);
          return (
            <span
              key={c.k}
              className={`s6-sq${wave ? " s6-sq-in" : ""}`}
              style={{ backgroundColor: bg, animationDelay: wave ? `${(col + row) * 0.035}s` : undefined }}
            />
          );
        })}
      </div>
      {/* No payload yet: no caption, rather than a row of zeros that are not true. */}
      {cells.length > 0 ? (
        <>
          <p className="p-small s6-status">
            <span>
              <Live n={cells.length} from={`count(${TF})`} /> street transformers in a simulated Vienna, live
            </span>
          </p>
          <p className="p-small p-secondary s6-legend">
            <span className="s6-key">
              <i className="s6-dot s6-dot-green" aria-hidden />
              <Live n={counts.green} from={COUNT_FROM.green} /> inside the limit
            </span>
            <span className="s6-key">
              <i className="s6-dot s6-dot-orange" aria-hidden />
              <Live n={counts.orange} from={COUNT_FROM.orange} /> near it
            </span>
            <span className="s6-key">
              <i className="s6-dot s6-dot-red" aria-hidden />
              <Live n={counts.red} from={COUNT_FROM.red} /> over
            </span>
          </p>
        </>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ the slide

export default function Slide6({ freeze }: SlideProps) {
  const reduced = useReducedMotion();
  const still = freeze === "end" || !!reduced;
  // Empty hh: the cheapest board payload. It still ships every street transformer's aggregate and the real home.
  const { data, error } = useGridState("", "");
  const nowMs = useServerNow(data?.now);
  const M = MEASURED;
  const b = data?.households?.blatnica;
  const t = b?.telemetry;
  const rx = t?.rx ? Date.parse(t.rx) : NaN;
  const verified = !!b?.registered && !!t && !!b?.ack?.verified && nowMs != null && Number.isFinite(rx) && nowMs - rx < 5 * 60_000;
  // The grid builds in once: its cells mount with the first payload and play a quick wave (CSS, once per cell, keyed by
  // transformer), then only their colours move.
  const wave = !still;

  return (
    <div className="p-slide s6" data-slide="6">
      <section className="p-tile s6-tile">
        <header className="s6-head">
          <h2 className="p-head">Real</h2>
          <p className="p-small p-secondary s6-say">A Victron plant and a Viessmann heat pump in Blatnica, Slovakia, follow a signed message.</p>
        </header>
        <RealHero s={data} nowMs={nowMs} loading={!data && !error} />
        <div className="s6-row s6-path">
          {PATH.map(({ Icon, word, line }, i) => (
            <Cell
              key={word}
              rise={!still}
              delay={0.6 + i * 0.25}
              top={
                <span className="s6-badge">
                  <Icon weight={verified ? "fill" : "regular"} size={40} className={verified ? "s6-ok" : "s6-mark"} aria-hidden />
                </span>
              }
              line={
                <>
                  <span className="s6-word">{word}</span>
                  {line.map((l) => (
                    <span key={l} className="s6-l">
                      {l}
                    </span>
                  ))}
                </>
              }
            />
          ))}
        </div>
        <p className="p-small p-tertiary s6-foot">Real end to end. The planning runs on the fleet.</p>
      </section>

      <section className="p-tile s6-tile">
        <header className="s6-head">
          <h2 className="p-head">Simulated</h2>
          <p className="p-small p-secondary s6-say">Two thousand houses, the same cars with and without Gridzilla, realistic charging.</p>
        </header>
        <HeatGrid s={data} wave={wave} />
        <div className="s6-row">
          <Cell
            rise={!still}
            delay={0.8}
            top={
              <span className="p-head s6-n">
                <CountUp to={M.street.pct} sign={MINUS} delay={1} still={still} label="one street, measured on the simulated fleet" />
                <span className="p-unit">%</span>
              </span>
            }
            line={
              <span data-src="deck" data-label="Speising evening peak">
                <span className="s6-word">one street</span>
                <span className="s6-l">{M.street.name},</span>
                <span className="s6-l">
                  {M.street.withoutKw} to {M.street.withKw} kW
                </span>
              </span>
            }
          />
          <Cell
            rise={!still}
            delay={1.3}
            top={
              <span className="p-head s6-n">
                <CountUp to={M.city.offMw} decimals={1} sign={MINUS} delay={1.5} still={still} label="Vienna, measured on the simulated fleet" />
                <span className="p-unit">MW</span>
              </span>
            }
            line={
              <span data-src="deck" data-label="Vienna houses and peak">
                <span className="s6-word">Vienna</span>
                <span className="s6-l">{M.city.houses.toLocaleString("en-US")} houses,</span>
                <span className="s6-l">
                  {M.city.withoutMw} to {M.city.withMw} MW
                </span>
              </span>
            }
          />
          <Cell
            rise={!still}
            delay={1.8}
            top={
              <span className="p-head s6-n">
                <CountUp to={M.noCars.offKw} delay={1.8} still={still} label="street with no cars, measured on the simulated fleet" />
                <span className="p-unit">kW</span>
              </span>
            }
            line={
              <>
                <span className="s6-word">a street</span>
                <span className="s6-l">where no car</span>
                <span className="s6-l">charged</span>
              </>
            }
          />
        </div>
        <p className="p-small p-tertiary s6-foot" data-src="deck" data-label="measured on">
          Measured on the simulated fleet, {MEASURED_ON}
        </p>
      </section>
    </div>
  );
}
