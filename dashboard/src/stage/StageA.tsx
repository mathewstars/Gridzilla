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
import "./a/stageA.css";

const EASE = [0.25, 0.1, 0.3, 1] as const;
// Secondary text dark enough to read from the back of the room on a projector.
const SEC = "#3a3a3c";

const SCENARIO_WORDS: Record<string, string> = {
  normal: "Normal day",
  "cold-evening": "Cold evening",
  "sunny-noon": "Sunny noon",
  "live-weather": "Live weather",
};

/** A unit drawn at half size after its number, like apple.com "33 hours". */
const Unit = ({ children }: { children: ReactNode }) => (
  <span className="ml-[0.12em] font-semibold" style={{ fontSize: "0.5em", color: P.secondary, letterSpacing: 0 }}>
    {children}
  </span>
);

/** One keynote pair in the bottom row: before -> after in big numbers and one short line. Each fact is its own size
 *  container, so the number scales with the room it has and wraps between its parts instead of running out. */
function Fact({ value, line }: { value: ReactNode; line: ReactNode }) {
  return (
    <div className="gzA-fact min-w-0">
      <div className="gzA-fact-v font-semibold tabular-nums">{value}</div>
      <p className="gzA-fact-l font-semibold">{line}</p>
    </div>
  );
}

/** Never-break parts of a fact value: wrapping happens only between them. */
const Part = ({ children }: { children: ReactNode }) => <span className="whitespace-nowrap">{children}</span>;

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

/** Ring size follows the story column's width and the window height, never squeezed below a readable size. */
function useRingSize(col: HTMLElement | null) {
  const [v, setV] = useState(200);
  useEffect(() => {
    if (!col) return;
    const get = () => {
      const w = col.clientWidth;
      const h = window.innerHeight;
      // Beside the triplet when the column is wide, alone on its row when it is narrow (phones).
      const byWidth = w >= 420 ? w * 0.44 : w * 0.5;
      setV(Math.round(Math.max(140, Math.min(byWidth, h * 0.24, 380))));
    };
    get();
    const ro = new ResizeObserver(get);
    ro.observe(col);
    window.addEventListener("resize", get);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", get);
    };
  }, [col]);
  return v;
}

export default function StageA() {
  const { s, error, history, tf, story } = useStory();
  const weather = useWeatherDirect();
  const plan = useFlatten(tf)?.plan ?? null;
  const city = useFlatten("region:at")?.plan ?? null;
  const [col, setCol] = useState<HTMLDivElement | null>(null);
  const ring = useRingSize(col);

  if (!s || !tf || !story) {
    return (
      <div className="grid min-h-screen place-items-center px-4" style={{ background: P.ground }}>
        <p className="text-center text-[1.75rem] font-semibold" style={{ color: P.secondary }}>
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
    <div className="gzA" style={{ background: P.ground, color: P.ink }}>
      {/* Frosted Apple nav bar: name, grid clock, how many streets head past their limit. */}
      <header className="gzA-nav font-semibold">
        <div className="min-w-0 tracking-[0.011em]">Gridzilla</div>
        <div className="flex flex-wrap items-baseline justify-center gap-x-3 tabular-nums">
          <span>{hhmm(s.sim_hour)}</span>
          {scen && <span className="gzA-scen" style={{ color: SEC }}>{scen}</span>}
        </div>
        <div className="gzA-heading min-w-0 text-right" style={{ color: heading ? P.orange : SEC }}>
          {heading > 0 ? `${heading} ${heading === 1 ? "street" : "streets"} heading past the limit` : "Every street inside its limit"}
        </div>
      </header>

      <main className="gzA-main">
        {/* Hero: the story, the ring and the with / without / limit triplet left; the curve right. Stacked on phones. */}
        <section className="gzA-hero">
          <div ref={setCol} className="gzA-story">
            <div>
              <AnimatePresence mode="wait" initial={false}>
                <motion.h1
                  key={storyLine(story, name)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.6, ease: EASE }}
                  className="gzA-h1 font-semibold"
                >
                  {storyLine(story, name)}
                </motion.h1>
              </AnimatePresence>
              <p className="gzA-sub mt-2 font-semibold" style={{ color: SEC }}>
                {name} transformer{back ? ", solar flowing back" : ""}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-x-[clamp(1rem,1.6vw,2.5rem)] gap-y-4">
              <LoadRing pct={story.nowPct} withoutPct={story.basePct} size={ring} sublabel={back ? "Flowing back" : "With Gridzilla"} />
              <div className="gzA-sub flex min-w-0 flex-col gap-[0.35em] font-semibold tabular-nums">
                <div className="leading-tight">
                  <span style={{ color: SEC }}>Without </span>
                  <span style={{ color: loadTone(story.basePct) }}>
                    <Counter value={baseKw == null ? null : Math.abs(baseKw)} />
                  </span>
                  <Unit>kW</Unit>
                </div>
                <div className="leading-tight">
                  <span style={{ color: SEC }}>With </span>
                  <span style={{ color: P.blue }}>
                    <Counter value={nowKw == null ? null : Math.abs(nowKw)} />
                  </span>
                  <Unit>kW</Unit>
                </div>
                <div className="leading-tight">
                  <span style={{ color: SEC }}>Limit </span>
                  <span style={{ color: P.red }}>{limitKw ? fmtNum(limitKw) : "–"}</span>
                  <Unit>kW</Unit>
                </div>
              </div>
            </div>

            {taken ? (
              <div>
                <div className="gzA-big font-semibold tabular-nums" style={{ color: P.green }}>
                  <Counter value={taken} />
                  <Unit>kW</Unit>
                </div>
                <p className="gzA-sub mt-1 font-semibold" style={{ color: P.ink }}>
                  {back ? "less solar pushed back" : "taken off this street"}
                  {takenNow == null && ko.peakH != null ? ` at ${hhmm(ko.peakH)}` : " right now"}
                </p>
              </div>
            ) : (
              peakLine && (
                <p className="gzA-peak font-semibold" style={{ color: loadTone(fp?.pct) }}>
                  {peakLine}
                </p>
              )
            )}
          </div>

          <div className="gzA-curve">
            <LiveCurve s={s} history={history} node={tf} header={false} ground={P.ground} height="100%" />
          </div>
        </section>

        {/* What the AI does, lit in sync with the real autopilot stage. */}
        <section className="min-w-0">
          <AiSteps s={s} weather={weather} variant="row" />
        </section>

        {/* Three keynote pairs and one quiet line: the signal and the real home. */}
        <section className="min-w-0">
          <div className="gzA-facts">
            {plan && (
              <Fact
                value={
                  <>
                    <Part>
                      <span style={{ color: loadTone(plan.peak_naive_pct) }}>
                        <Counter value={plan.peak_naive_pct} />
                      </span>
                      <Unit>→</Unit>
                    </Part>
                    <Part>
                      <span style={{ color: loadTone(plan.peak_plan_pct) }}>
                        <Counter value={plan.peak_plan_pct} />
                      </span>
                      <Unit>%</Unit>
                    </Part>
                  </>
                }
                line={`${name} peak with the plan`}
              />
            )}
            {city && (
              <Fact
                value={
                  <>
                    <Part>
                      <Counter value={city.peak_naive_kw / 1000} decimals={1} />
                      <Unit>→</Unit>
                    </Part>
                    <Part>
                      <span style={{ color: P.green }}>
                        <Counter value={city.peak_plan_kw / 1000} decimals={1} />
                      </span>
                      <Unit>MW</Unit>
                    </Part>
                  </>
                }
                line="City peak with the plan"
              />
            )}
            {sum && (
              <Fact
                value={
                  <>
                    <Part>
                      <Counter value={sum.shaped ?? sum.online} />
                    </Part>
                    <Part>
                      <Unit>of {fmtNum(sum.households)}</Unit>
                    </Part>
                  </>
                }
                line="Homes following the plan"
              />
            )}
          </div>
          {(sig || blat) && (
            <div className="gzA-quiet mt-[clamp(0.75rem,1.6vh,1.5rem)] flex flex-wrap gap-x-[3vw] gap-y-1 font-semibold" style={{ color: SEC }}>
              {sig && (
                <p className="min-w-0 tabular-nums">
                  Signal #{sig.seq} signed and sent{capKw != null ? ` · at most ${fmtNum(capKw, capKw % 1 ? 1 : 0)} kW` : ""}
                  {sig.until != null && sig.until > s.sim_hour ? ` · until ${hhmm(sig.until)}` : ""}
                </p>
              )}
              {blat && (
                <p className="min-w-0 tabular-nums">
                  Real home in Blatnica · battery {fmtNum(blat.soc ?? 0)} %
                </p>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
