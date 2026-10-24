// Direction A, "Keynote stage": an apple.com product page that plays itself. One giant live curve (with vs without
// Gridzilla), the story in big type beside it, the AI steps as a readable strip and one row of live facts underneath.
// No controls on screen: useStory picks the transformer and listens for the hidden presenter keys.
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import type { State } from "../api";
import { hhmm, nice } from "../model";
import { P, loadTone } from "./palette";
import { useStory, type Story } from "./useStory";
import { useFlatten, useWeatherDirect } from "./a/feeds";
import AiSteps from "./kit/AiSteps";
import Counter, { fmtNum } from "./kit/Counter";
import LiveCurve, { keptOff } from "./kit/LiveCurve";
import LoadRing from "./kit/LoadRing";

const EASE = [0.25, 0.1, 0.3, 1] as const;
// Secondary text dark enough to read from the back of the room on a projector.
const SEC = "#3a3a3c";

const SCENARIO_WORDS: Record<string, string> = {
  normal: "Normal day",
  "cold-evening": "Cold evening",
  "sunny-noon": "Sunny noon",
  "live-weather": "Live weather",
};

/** Clock digits roll: only the characters that changed slide in (21st "Animate Digits"). */
function Roll({ text }: { text: string }) {
  return (
    <span className="inline-flex overflow-hidden tabular-nums" aria-label={text}>
      {text.split("").map((c, i) => (
        <span key={i} className="relative inline-block" aria-hidden>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={c}
              className="inline-block"
              initial={{ y: "0.6em", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "-0.6em", opacity: 0 }}
              transition={{ duration: 0.35, ease: EASE }}
            >
              {c}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}

/** A unit drawn at half size after its number, like apple.com "33 hours". */
const Unit = ({ children }: { children: ReactNode }) => (
  <span className="ml-[0.12em] font-semibold" style={{ fontSize: "0.5em", color: P.secondary, letterSpacing: 0 }}>
    {children}
  </span>
);

/** One keynote pair in the bottom row: before → after in big numbers and one short line. */
function Fact({ value, line }: { value: ReactNode; line: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="whitespace-nowrap font-semibold leading-[1.05] tracking-[-0.02em] tabular-nums" style={{ fontSize: "clamp(2.25rem, 5.2vh, 4.5rem)" }}>
        {value}
      </div>
      <p className="mt-1.5 whitespace-nowrap font-semibold" style={{ color: SEC, fontSize: "clamp(1.125rem, 1.4vw, 2rem)", letterSpacing: "-0.01em" }}>
        {line}
      </p>
    </div>
  );
}

/** Wall-clock ISO time to grid time (the simulator runs `sim_x` times faster than the wall clock). */
function gridTimeOf(s: State, iso: string | null | undefined) {
  const t = iso ? Date.parse(iso) : NaN;
  const now = Date.parse(s.now);
  if (!Number.isFinite(t) || !Number.isFinite(now)) return null;
  return s.sim_hour + ((t - now) / 3_600_000) * (s.autopilot?.sim_x || 1);
}

/** The big sentence: STORY's line once Gridzilla works on this street, else the problem in plain words. */
function storyLine(st: Story, name: string) {
  const back = (st.basePct ?? st.peakPct) < 0;
  const saved = Math.abs(st.basePct ?? 0) >= 100 && Math.abs(st.nowPct ?? 0) < 100;
  if (saved || st.phase === "acting" || st.phase === "flattened") return "Gridzilla eats the peak.";
  if (st.phase === "building") return back ? `Noon sun is pushing ${name} backwards.` : `The evening peak is building on ${name}.`;
  return `${name} is inside its limit.`;
}

/** The newest signed signal: the one on this street, else the newest active, recent or autopilot one anywhere. */
function lastSignal(s: State, story: Story) {
  const own = story.signal;
  let sig = own;
  for (const x of [...Object.values(s.active ?? {}), ...Object.values(s.recent ?? {})]) if (!sig || x.seq > sig.seq) sig = own ?? x;
  const d = (s.autopilot?.history ?? []).find((h) => h.verdict === "sent" && h.seq != null);
  if (sig && (!d || sig.seq >= (d.seq ?? 0) || own)) {
    const env = sig.envelope;
    const imp = env?.import_max_kw?.length ? env.import_max_kw[0] : sig.import_max_kw;
    const exp = env?.export_max_kw?.length ? env.export_max_kw[0] : sig.export_max_kw;
    return { seq: sig.seq, segment: sig.segment, imp, exp, until: gridTimeOf(s, sig.valid_to) };
  }
  if (!d) return null;
  const f = d.fields ?? {};
  return { seq: d.seq as number, segment: d.segment ?? "", imp: f.import_max_kw ?? null, exp: f.export_max_kw ?? null, until: d.duration_min ? d.sim_h + d.duration_min / 60 : null };
}

/** Scenario word only while grid time fits it, so "Cold evening" never sits next to an 11:18 clock. */
function scenarioWord(name: string | undefined, h: number) {
  if (name === "cold-evening") return h >= 16 || h < 1 ? "Cold evening" : null;
  if (name === "sunny-noon") return h >= 9 && h < 16 ? "Sunny noon" : null;
  return name ? SCENARIO_WORDS[name] ?? null : null;
}

/** Ring size follows the viewport height. */
function useRingSize() {
  const get = () => (typeof window === "undefined" ? 240 : Math.round(Math.max(150, Math.min(window.innerHeight * 0.22, window.innerWidth * 0.16, 420))));
  const [v, setV] = useState(get);
  useEffect(() => {
    const on = () => setV(get());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return v;
}

export default function StageA() {
  const { s, error, history, tf, story } = useStory();
  const weather = useWeatherDirect();
  const plan = useFlatten(tf)?.plan ?? null;
  const city = useFlatten("region:at")?.plan ?? null;
  const ring = useRingSize();

  if (!s || !tf || !story) {
    return (
      <div className="grid min-h-screen place-items-center px-4" style={{ background: P.ground }}>
        <p className="text-[1.75rem] font-semibold" style={{ color: P.secondary }}>
          {error ? "The grid platform is not answering yet." : "Connecting to the grid."}
        </p>
      </div>
    );
  }

  const name = nice(tf);
  const ap = s.autopilot;
  const rating = s.tree[tf]?.rating_kw ?? null;
  const agg = s.aggregates[tf];
  const nowKw = agg?.total_kw ?? null;
  const baseKw = agg?.baseline_kw ?? null;
  const back = (nowKw ?? 0) < 0;
  const limitKw = story.limitKw || rating;
  const fp = s.forecast_peak?.[tf] ?? null;
  const heading = Object.values(s.forecast_peak ?? {}).filter((f) => Math.abs(f.pct) >= (ap?.trigger_pct ?? 85)).length;

  // kW taken off this street: always a positive size, hidden when it is about zero.
  const ko = keptOff(s, history, tf);
  const minGap = Math.max(1, (limitKw ?? 0) * 0.02);
  const takenNow = Math.abs(story.gapKw) >= minGap && story.gapKw > 0 ? story.gapKw : ko.kw;
  const taken = takenNow ?? (ko.peak || null);

  const sig = lastSignal(s, story);
  const capKw = sig ? sig.imp ?? sig.exp : null;
  const sum = s.summary;
  const blat = s.households?.blatnica?.telemetry ?? null;
  const scen = scenarioWord(s.scenario?.name, s.sim_hour);
  const peakLine =
    fp && Math.abs(fp.pct) >= (ap?.trigger_pct ?? 85) ? `Tonight's forecast peak ${Math.round(Math.abs(fp.pct))} % at ${hhmm(fp.h)}` : null;

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden lg:h-screen lg:overflow-hidden" style={{ background: P.ground, color: P.ink }}>
      {/* Frosted Apple nav bar: name, grid clock, how many streets head past their limit. */}
      <header
        className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-6 px-4 lg:h-[clamp(3.25rem,5.5vh,5rem)] lg:px-[4.5vw]"
        style={{
          background: "rgba(250,250,252,.8)",
          backdropFilter: "saturate(180%) blur(20px)",
          WebkitBackdropFilter: "saturate(180%) blur(20px)",
          borderBottom: "1px solid rgba(0,0,0,.08)",
          fontSize: "clamp(1.25rem, 1.5vw, 2.125rem)",
        }}
      >
        <div className="flex-1 font-semibold tracking-[0.011em]">Gridzilla</div>
        <div className="flex items-baseline gap-3 whitespace-nowrap font-semibold">
          <Roll text={hhmm(s.sim_hour)} />
          {scen && <span className="hidden sm:inline" style={{ color: SEC }}>{scen}</span>}
        </div>
        <div className="hidden flex-1 whitespace-nowrap text-right font-semibold lg:block" style={{ color: heading ? P.orange : SEC }}>
          {heading > 0 ? `${heading} ${heading === 1 ? "street" : "streets"} heading past the limit` : "Every street inside its limit"}
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-8 px-4 pb-10 pt-6 lg:gap-[2.6vh] lg:px-[4.5vw] lg:pb-[2.4vh] lg:pt-[3vh]">
        {/* Hero: the story, the ring and the with / without / limit triplet left; the curve, two thirds of the screen, right. */}
        <section className="flex min-h-0 flex-col gap-6 lg:grid lg:flex-[2] lg:grid-cols-12 lg:gap-[3vw]">
          <div className="flex min-w-0 flex-col gap-[2.4vh] lg:col-span-4">
            <div>
              <AnimatePresence mode="wait" initial={false}>
                <motion.h1
                  key={storyLine(story, name)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.6, ease: EASE }}
                  className="break-words font-semibold leading-[1.05] tracking-[-0.02em]"
                  style={{ fontSize: "clamp(2.25rem, 6vh, 5.5rem)" }}
                >
                  {storyLine(story, name)}
                </motion.h1>
              </AnimatePresence>
              <p className="mt-2 font-semibold" style={{ fontSize: "clamp(1.25rem, 1.6vw, 2.25rem)", color: SEC, letterSpacing: "-0.01em" }}>
                {name} transformer{back ? ", solar flowing back" : ""}
              </p>
            </div>

            <div className="flex items-center gap-[1.6vw]">
              <LoadRing pct={story.nowPct} withoutPct={story.basePct} size={ring} sublabel={back ? "Flowing back" : "With Gridzilla"} />
              <div className="flex min-w-0 flex-col gap-[1.2vh] tabular-nums" style={{ fontSize: "clamp(1.25rem, 1.6vw, 2.25rem)" }}>
                <div className="font-semibold leading-tight">
                  <span style={{ color: SEC }}>Without </span>
                  <span style={{ color: loadTone(story.basePct) }}>
                    <Counter value={baseKw == null ? null : Math.abs(baseKw)} />
                  </span>
                  <Unit>kW</Unit>
                </div>
                <div className="font-semibold leading-tight">
                  <span style={{ color: SEC }}>With </span>
                  <span style={{ color: P.blue }}>
                    <Counter value={nowKw == null ? null : Math.abs(nowKw)} />
                  </span>
                  <Unit>kW</Unit>
                </div>
                <div className="font-semibold leading-tight">
                  <span style={{ color: SEC }}>Limit </span>
                  <span style={{ color: P.red }}>{limitKw ? fmtNum(limitKw) : "–"}</span>
                  <Unit>kW</Unit>
                </div>
              </div>
            </div>

            {taken ? (
              <div>
                <div className="font-semibold leading-none tracking-[-0.02em] tabular-nums" style={{ fontSize: "clamp(3rem, 7vh, 6.5rem)", color: P.green }}>
                  <Counter value={taken} />
                  <Unit>kW</Unit>
                </div>
                <p className="mt-1 font-semibold" style={{ fontSize: "clamp(1.25rem, 1.6vw, 2.25rem)", letterSpacing: "-0.01em" }}>
                  {back ? "less solar pushed back" : "taken off this street"}
                  {takenNow == null && ko.peakH != null ? ` at ${hhmm(ko.peakH)}` : " right now"}
                </p>
              </div>
            ) : (
              peakLine && (
                <p className="font-semibold" style={{ fontSize: "clamp(1.5rem, 2vw, 2.75rem)", color: loadTone(fp?.pct), letterSpacing: "-0.01em" }}>
                  {peakLine}
                </p>
              )
            )}
          </div>

          <div className="flex min-w-0 flex-col lg:col-span-8 lg:min-h-0">
            <div className="h-[300px] min-h-[260px] lg:h-auto lg:flex-1">
              <LiveCurve s={s} history={history} node={tf} header={false} ground={P.ground} height="100%" />
            </div>
          </div>
        </section>

        {/* What the AI does, lit in sync with the real autopilot stage. */}
        <section className="shrink-0">
          <AiSteps s={s} weather={weather} variant="row" />
        </section>

        {/* Three keynote pairs and one quiet line: the signal and the real home. */}
        <section className="shrink-0">
          <div className="grid grid-cols-2 gap-6 lg:grid-cols-3 lg:gap-[3vw]">
            {plan && (
              <Fact
                value={
                  <>
                    <span style={{ color: loadTone(plan.peak_naive_pct) }}>
                      <Counter value={plan.peak_naive_pct} />
                    </span>
                    <Unit>→</Unit>
                    <span style={{ color: loadTone(plan.peak_plan_pct) }}>
                      <Counter value={plan.peak_plan_pct} />
                    </span>
                    <Unit>%</Unit>
                  </>
                }
                line={`${name} peak with the plan`}
              />
            )}
            {city && (
              <Fact
                value={
                  <>
                    <Counter value={city.peak_naive_kw / 1000} decimals={1} />
                    <Unit>→</Unit>
                    <span style={{ color: P.green }}>
                      <Counter value={city.peak_plan_kw / 1000} decimals={1} />
                    </span>
                    <Unit>MW</Unit>
                  </>
                }
                line="City peak with the plan"
              />
            )}
            {sum && (
              <Fact
                value={
                  <>
                    <Counter value={sum.shaped ?? sum.online} />
                    <Unit>of {fmtNum(sum.households)}</Unit>
                  </>
                }
                line="Homes following the plan"
              />
            )}
          </div>
          <p className="mt-[1.6vh] flex flex-col gap-1 font-semibold lg:flex-row lg:gap-[3vw]" style={{ color: SEC, fontSize: "clamp(1.125rem, 1.3vw, 1.875rem)" }}>
            {sig && (
              <span className="tabular-nums">
                Signal #{sig.seq} signed and sent{capKw != null ? ` · at most ${fmtNum(capKw, capKw % 1 ? 1 : 0)} kW` : ""}
                {sig.until != null && sig.until > s.sim_hour ? ` · until ${hhmm(sig.until)}` : ""}
              </span>
            )}
            {blat && (
              <span className="tabular-nums">
                Real home in Blatnica · battery {fmtNum(blat.soc ?? 0)} %
              </span>
            )}
          </p>
        </section>
      </main>
    </div>
  );
}
