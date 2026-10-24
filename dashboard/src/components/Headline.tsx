// Four projector numbers across the top of the board: energy stored, power we can steer, the busiest transformer,
// and how many houses are online and following Gridzilla. 4 across on desktop, 2x2 on a phone.
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import type { State } from "../api";
import { COLORS, allTfs, headline, loadColor, nice } from "../model";
import { Ticker } from "./ui";

/** Value in its natural unit: kWh / MWh or kW / MW, with sensible decimals. */
function scaled(v: number, base: string) {
  if (Math.abs(v) >= 1000) {
    const m = v / 1000;
    return { v: m, d: Math.abs(m) >= 100 ? 0 : 1, unit: `M${base}` };
  }
  return { v, d: 0, unit: `k${base}` };
}

/** Fleet extras the headline needs on top of headline(): battery capacity online, and the kW of those batteries
 *  already following a signal. Each simulated device stands for `represents` real houses. */
function extras(s: State) {
  let cap = 0,
    steered = 0;
  Object.values(s.devices).forEach((d) => {
    const t = d.telemetry;
    if (!t || d.kwh <= 0) return;
    const r = d.represents ?? 1;
    cap += d.kwh * r;
    if (t.mode && t.mode !== "owner") steered += d.kw * r;
  });
  return { cap, steered };
}

function Meter({ frac, color, label }: { frac: number; color: string; label: string }) {
  const reduce = useReducedMotion();
  const f = Math.max(0, Math.min(1, Number.isFinite(frac) ? frac : 0));
  return (
    <div className="mt-2.5 h-[5px] overflow-hidden rounded-full bg-black/40 shadow-[inset_0_1px_1px_rgb(0_0_0/0.6)]" role="meter" aria-label={label} aria-valuenow={Math.round(f * 100)} aria-valuemin={0} aria-valuemax={100}>
      <motion.div
        className="h-full origin-left rounded-full"
        style={{ background: `linear-gradient(90deg, ${color}99, ${color})`, boxShadow: `0 0 12px ${color}aa` }}
        initial={false}
        animate={{ scaleX: f }}
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 90, damping: 22 }}
      />
    </div>
  );
}

function Stat({ label, tech, accent, value, foot, meter, i }: { label: string; tech: string; accent: string; value: ReactNode; foot: ReactNode; meter?: ReactNode; i: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.06 * i, ease: [0.16, 1, 0.3, 1] }}
      className="panel flex min-w-0 flex-col overflow-hidden px-4 pb-3 pt-3 sm:px-5"
      style={{ backgroundImage: `radial-gradient(120% 90% at 0% 0%, ${accent}17, transparent 55%), linear-gradient(180deg, rgb(255 255 255 / 0.035), rgb(255 255 255 / 0) 40%)` }}
    >
      <span className="pointer-events-none absolute inset-x-5 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${accent}88, transparent)` }} aria-hidden />
      <div className="text-[0.86rem] font-medium leading-snug text-dim">{label}</div>
      <div className="mt-1.5 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">{value}</div>
      <div className="mt-1 line-clamp-2 min-w-0 text-[0.84rem] leading-snug text-fg/80 lg:truncate">{foot}</div>
      {meter}
      <div className="tech mt-auto line-clamp-2 pt-2 lg:truncate">{tech}</div>
    </motion.div>
  );
}

const big = "num text-[2.15rem] font-semibold leading-none tracking-[-0.035em] sm:text-[2.75rem]";
const unitCls = "text-[1rem] font-medium text-dim sm:text-[1.15rem]";

export default function Headline({ s }: { s: State }) {
  const h = headline(s);
  const { cap, steered } = extras(s);
  const e = scaled(h.kwh, "Wh");
  const p = scaled(h.kw, "W");
  const avgSoc = cap > 0 ? h.kwh / cap : 0;
  const tfCount = allTfs(s).length;
  const pct = h.worst ? h.worstPct : null;
  const lc = loadColor(pct);
  const nothing = h.online === 0;

  return (
    <section aria-label="Headline numbers" className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat
        i={0}
        label="Energy stored in program batteries"
        accent={COLORS.signal}
        value={
          <>
            <Ticker value={e.v} decimals={e.d} className={big} />
            <span className={unitCls}>{e.unit}</span>
          </>
        }
        foot={nothing ? "Waiting for batteries to report" : `Batteries ${Math.round(avgSoc * 100)} % full on average`}
        meter={<Meter frac={avgSoc} color={COLORS.signal} label="Average battery charge" />}
        tech="state of charge x capacity, online batteries"
      />
      <Stat
        i={1}
        label="Power we can steer"
        accent={COLORS.signal}
        value={
          <>
            <Ticker value={p.v} decimals={p.d} className={big} />
            <span className={unitCls}>{p.unit}</span>
          </>
        }
        foot={nothing ? "No battery online yet" : steered > 0 ? `${scaled(steered, "W").v.toFixed(scaled(steered, "W").d)} ${scaled(steered, "W").unit} following a signal now` : "None of it is being steered right now"}
        meter={<Meter frac={h.kw > 0 ? steered / h.kw : 0} color={COLORS.signal} label="Share of flexible power following a signal" />}
        tech="flexible power, battery inverter ratings"
      />
      <Stat
        i={2}
        label="Busiest street transformer"
        accent={lc}
        value={
          <>
            <span className={big} style={{ color: lc, textShadow: `0 0 24px ${lc}55` }}>
              {pct == null ? "-" : <Ticker value={Math.abs(pct)} />}
            </span>
            <span className={unitCls}>%</span>
            {h.over > 0 && (
              <span className="num ml-1 self-center rounded-full px-2 py-0.5 text-[0.74rem] font-semibold" style={{ color: COLORS.crit, background: `${COLORS.crit}1f`, boxShadow: `inset 0 0 0 1px ${COLORS.crit}40` }}>
                {h.over} over limit
              </span>
            )}
          </>
        }
        foot={
          pct == null ? (
            "No transformer reading yet"
          ) : (
            <>
              <span className="font-semibold text-fg">{nice(h.worst)}</span>
              <span className="text-dim">{pct < 0 ? ", solar flowing back" : ", power drawn by houses"}</span>
            </>
          )
        }
        meter={<Meter frac={pct == null ? 0 : Math.abs(pct) / 150} color={lc} label="Load of the busiest transformer, full bar = 150 % of its limit" />}
        tech={h.over > 0 ? `${h.over} of ${tfCount} transformers above their rating` : `all ${tfCount} transformers inside their rating`}
      />
      <Stat
        i={3}
        label="Houses online / following Gridzilla"
        accent="#c9d4e2"
        value={
          <>
            <Ticker value={h.online} className={big} />
            <span className={unitCls}>/</span>
            <Ticker value={h.under} className={`${big} text-signal`} />
          </>
        }
        foot={
          h.under > 0 ? (
            <>
              <span className="text-signal">{h.obeying.toLocaleString("en-US")}</span> confirmed with a signed reply
            </>
          ) : nothing ? (
            "Waiting for the first houses to report"
          ) : (
            `${h.houses.toLocaleString("en-US")} in the program, none steered now`
          )
        }
        meter={<Meter frac={h.online > 0 ? h.under / h.online : 0} color={COLORS.signal} label="Share of online houses following a signal" />}
        tech="online / under signal, from signed acks"
      />
    </section>
  );
}
