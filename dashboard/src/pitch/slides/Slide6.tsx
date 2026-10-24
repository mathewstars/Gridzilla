// Slide 6, real and simulated (3:30, 25 s, dad). An honest split, said before anyone asks: on the left what runs for
// real (the Victron plant and the Viessmann heat pump in Blatnica, live from the API, or "waiting for the plant" and
// never a made-up value), on the right what is simulated (two thousand houses in Vienna) with the three measured
// numbers from the deck, counting up once. Two ground tiles side by side, rows aligned like apple.com/compare.
// Count up adapted from 21st.dev "Count Up" (@unlumen, id 20068): its no-effect mode (a motion value writing the text
// through a ref), with our ease instead of its spring, a real minus sign, and a hidden copy of the end text holding the width.
import { useEffect, useRef, type ReactNode } from "react";
import { animate, useReducedMotion } from "motion/react";
import { CheckCircle } from "@phosphor-icons/react";
import { useGridState, type State } from "../../api";
import Counter from "../../stage/kit/Counter";
import { useServerNow } from "../../stage/kit/Countdown";
import { MEASURED, MEASURED_ON } from "../facts";
import type { SlideProps } from "../types";
import "./slide6.css";

const EASE: [number, number, number, number] = [0.25, 0.1, 0.3, 1];
const MINUS = "−";
const B = "state/households/blatnica";

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

/** One row of a tile: a big number with its unit at half size and a short line under it. */
function Stat({ value, unit, line, big, rise, delay }: { value: ReactNode; unit: string; line: ReactNode; big?: boolean; rise: boolean; delay: number }) {
  return (
    <div className={`s6-stat${big ? " s6-big" : ""}${rise ? " s6-rise" : ""}`} style={rise ? { animationDelay: `${delay}s` } : undefined}>
      <div className={`s6-n ${big ? "p-display" : "p-head"}`}>
        {value}
        <span className="p-unit">{unit}</span>
      </div>
      <p className="p-small p-secondary s6-line">{line}</p>
    </div>
  );
}

// ------------------------------------------------------------------ left: real

/** The real path, end to end (what the plant does with every message). */
const PATH = ["The platform signs the message", "The plant checks the signature", "Battery and heat pump follow it"];

function since(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 90 ? { v: s, unit: "s" } : { v: Math.round(s / 60), unit: "min" };
}

function Real({ s, nowMs, loading }: { s: State | null; nowMs: number | null; loading: boolean }) {
  const b = s?.households?.blatnica;
  const t = b?.telemetry ?? null;
  const rx = t?.rx ? Date.parse(t.rx) : NaN;
  const ageMs = nowMs != null && Number.isFinite(rx) ? nowMs - rx : null;
  const live = !!b && b.registered && !!t && ageMs != null && ageMs < 5 * 60_000;

  if (loading) return <div className="s6-proof" />;
  // The plant is silent: the path it runs on is still real and built, so say that, and say plainly that the live
  // numbers are waiting. Never a last-known or made-up value.
  if (!live || !t)
    return (
      <div className="s6-proof">
        <ul className="s6-path">
          {PATH.map((line) => (
            <li key={line} className="p-sub">
              <CheckCircle weight="fill" size={44} className="s6-check" aria-hidden />
              {line}
            </li>
          ))}
        </ul>
        <p className="p-small p-tertiary s6-foot">Blatnica: waiting for the plant</p>
      </div>
    );

  const age = since(ageMs ?? 0);
  const ack = b.ack;
  const heat =
    t.dhw_c != null ? (
      <Stat
        rise={false}
        delay={0}
        value={<Counter value={t.dhw_c} src={`${B}/telemetry/dhw_c`} />}
        unit="°C"
        line="hot water in the Viessmann heat pump"
      />
    ) : (
      <Stat
        rise={false}
        delay={0}
        value={<Counter value={t.hp_kw} decimals={1} src={`${B}/telemetry/hp_kw`} />}
        unit="kW"
        line="the Viessmann heat pump is drawing"
      />
    );

  return (
    <div className="s6-proof">
      {t.soc != null ? (
        <Stat
          big
          rise={false}
          delay={0}
          value={<Counter value={t.soc} src={`${B}/telemetry/soc`} />}
          unit="%"
          line="the Victron battery in the real home, now"
        />
      ) : (
        <Stat
          big
          rise={false}
          delay={0}
          value={<Counter value={t.grid_kw} decimals={1} src={`${B}/telemetry/grid_kw`} />}
          unit="kW"
          line="the real home at its meter, now"
        />
      )}
      <div className="s6-pair">
        <Stat
          rise={false}
          delay={0}
          value={
            <span className="p-num" data-src={`${B}/telemetry/rx`}>
              {age.v}
            </span>
          }
          unit={age.unit}
          line="since the plant last reported"
        />
        {heat}
      </div>
      <p className="p-small p-tertiary s6-foot">
        {ack?.seq != null ? (
          <>
            {ack.status === "reverted" ? "Back to its owner after message " : "Answered message "}#
            <span className="p-num" data-src={`${B}/ack/seq`} data-val={String(ack.seq)}>
              {ack.seq}
            </span>
            {ack.verified ? ", signature checked" : ""}
          </>
        ) : (
          "Live on the same signed message path"
        )}
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ the slide

export default function Slide6({ freeze }: SlideProps) {
  const reduced = useReducedMotion();
  const still = freeze === "end" || !!reduced;
  // Empty hh: the cheapest board payload, it ships only the real home (Blatnica).
  const { data, error } = useGridState("", "");
  const nowMs = useServerNow(data?.now);
  const M = MEASURED;

  return (
    <div className="p-slide s6" data-slide="6">
      <section className="p-tile s6-tile">
        <h2 className="p-head">Real</h2>
        <p className="p-sub p-secondary s6-say">
          A Victron plant and a Viessmann heat pump in Blatnica, Slovakia, follow the signed message.
        </p>
        <Real s={data} nowMs={nowMs} loading={!data && !error} />
      </section>

      <section className="p-tile s6-tile">
        <h2 className="p-head">Simulated</h2>
        <p className="p-sub p-secondary s6-say">Two thousand houses in a simulated Vienna. The same cars, with and without Gridzilla.</p>
        <div className="s6-proof">
          <Stat
            big
            rise={!still}
            delay={0.8}
            value={<CountUp to={M.street.pct} sign={MINUS} delay={1} still={still} label="one street, measured on the simulated fleet" />}
            unit="%"
            line={
              <span data-src="deck" data-label="Speising evening peak">
                one street at the evening peak, {M.street.withoutKw} to {M.street.withKw} kW
              </span>
            }
          />
          <div className="s6-pair">
            <Stat
              rise={!still}
              delay={1.5}
              value={<CountUp to={M.city.offMw} decimals={1} sign={MINUS} delay={1.7} still={still} label="Vienna, measured on the simulated fleet" />}
              unit="MW"
              line={
                <span data-src="deck" data-label="Vienna houses and peak">
                  Vienna, {M.city.houses.toLocaleString("en-US")} houses, {M.city.withoutMw} to {M.city.withMw} MW
                </span>
              }
            />
            <Stat
              rise={!still}
              delay={2.4}
              value={<CountUp to={M.noCars.offKw} delay={2.4} still={still} label="street with no cars, measured on the simulated fleet" />}
              unit="kW"
              line="a street where no car charged"
            />
          </div>
          <p className="p-small p-tertiary s6-foot" data-src="deck" data-label="measured on">
            Measured on the simulated fleet, {MEASURED_ON}
          </p>
        </div>
      </section>
    </div>
  );
}
