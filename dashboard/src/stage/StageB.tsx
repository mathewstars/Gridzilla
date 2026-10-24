// Direction B, "Apple Home energy": the living 3D street as the big tile, a few large live cards beside it, on the Apple
// ground. It plays itself: useStory picks the transformer and moves on; presenter keys (1-4, arrows, F) stay invisible.
import { type ReactNode } from "react";
import { StreetScene } from "../components/street/StreetScene";
import { nice, hhmm, MODE_WORDS } from "../model";
import type { State } from "../api";
import { P, loadTone } from "./palette";
import { signalOn, useStory } from "./useStory";
import AiSteps from "./kit/AiSteps";
import LoadRing from "./kit/LoadRing";
import BCurve from "./b/Curve";
import { fmtNum } from "./kit/Counter";
import { Num, PlanCard, Tile, WeatherCard, WeatherLine, useBox } from "./b/Cards";
import { useFlatten, useWeatherFeed } from "./b/feeds";

// The scenario as weather, joined with the part of the day from grid time, so the header never says "evening" at 02:56.
const SCENARIO: Record<string, string> = {
  "cold-evening": "Cold",
  "sunny-noon": "Sunny",
  "live-weather": "Live weather,",
  normal: "Normal",
};
const dayPart = (h: number) => (h >= 5 && h < 11 ? "morning" : h >= 11 && h < 14 ? "midday" : h >= 14 && h < 18 ? "afternoon" : h >= 18 && h < 22 ? "evening" : "night");
const scenarioWords = (name: string | undefined, h: number) => (name && SCENARIO[name] ? `${SCENARIO[name]} ${dayPart(h)}` : "");

function Bar({ clock, scenario, status }: { clock: string; scenario: string; status: ReactNode }) {
  return (
    <header
      className="sticky top-0 z-20 grid min-h-11 shrink-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1 px-4 py-1.5 lg:min-h-[3.25rem] lg:grid-cols-[auto_auto_minmax(0,1fr)] lg:px-6 xl:grid-cols-[1fr_auto_1fr]"
      style={{
        background: "rgba(250,250,252,.8)",
        backdropFilter: "saturate(180%) blur(20px)",
        WebkitBackdropFilter: "saturate(180%) blur(20px)",
        borderBottom: "1px solid rgba(0,0,0,.08)",
      }}
    >
      <div className="t-title">Gridzilla</div>
      <div className="flex min-w-0 flex-wrap items-baseline justify-end gap-x-2 justify-self-end xl:justify-self-center">
        <span className="t-title tabular-nums">{clock}</span>
        <span className="t-body text-secondary">{scenario}</span>
      </div>
      <div className="t-body hidden min-w-0 justify-self-end text-right text-secondary lg:block">{status}</div>
    </header>
  );
}

/** Watch-style stacked rings: outer = without Gridzilla, inner = with it, red lap past 100 %. Tonight's forecast peak
 *  beside it so the problem coming is on screen before it arrives. The ring is sized from the card's width only, and
 *  the numbers wrap under it when the card is narrow, so nothing is ever cut. */
function RingCard({ pct, basePct, peak, simHour }: { pct: number | null; basePct: number | null; peak: { pct: number; h: number } | null; simHour: number }) {
  const peakNow = peak != null && Math.abs(peak.h - simHour) < 0.25;
  const [ref, box] = useBox<HTMLDivElement>();
  const size = Math.round(Math.max(176, Math.min(box.w * 0.44, 260)));
  const back = (v: number | null) => (v != null && v < 0 ? " flowing back" : "");
  const big = "text-[clamp(2rem,9cqi,2.5rem)] leading-[1.2] tracking-[-0.015em]";
  return (
    <Tile className="h-full">
      <div ref={ref} className="flex h-full flex-wrap items-center gap-x-6 gap-y-4 px-5 py-5 @md:px-6">
        <div className="shrink-0">
          {box.w > 0 && <LoadRing pct={pct} withoutPct={basePct} size={size} stroke={Math.max(14, Math.round(size * 0.08))} sublabel={pct != null && pct < 0 ? "Flowing back" : "With Gridzilla"} />}
        </div>
        <div className="flex min-w-[9rem] flex-1 flex-col gap-3">
          <div>
            <div className="t-body text-secondary">Without Gridzilla{back(basePct)}</div>
            <Num value={basePct != null ? Math.abs(basePct) : null} unit="%" className={big} color={loadTone(Math.abs(basePct ?? 0))} />
          </div>
          {peak && (
            <div>
              <div className="t-body text-secondary">{peakNow ? "Tonight's peak, right now" : `Next peak at ${hhmm(peak.h % 24)}`}</div>
              <Num value={Math.abs(peak.pct)} unit="%" className={big} color={loadTone(Math.abs(peak.pct))} />
            </div>
          )}
        </div>
      </div>
    </Tile>
  );
}

/** Up to 40 dots, one per slice of homes: green = following the plan, grey = not. */
function HomeDots({ shaped, total }: { shaped: number; total: number }) {
  const N = Math.min(40, total);
  const on = total ? Math.round((shaped / total) * N) : 0;
  return (
    <div className="flex flex-wrap gap-[5px]" aria-hidden>
      {Array.from({ length: N }, (_, i) => (
        <span key={i} className="block h-[10px] w-[10px] rounded-full" style={{ background: i < on ? P.green : "rgba(0,0,0,.12)" }} />
      ))}
    </div>
  );
}

/** The live signal on this street (fact 5), how many streets head past the limit tonight (fact 1), the homes following
 *  (fact 4), and Blatnica as one quiet line when the plant is silent. */
function FactsCard({ s, tf }: { s: State; tf: string }) {
  const sig = signalOn(s, tf);
  const env = sig?.envelope;
  const untilH = env ? env.start_sim_h + ((env.import_max_kw ?? env.export_max_kw ?? []).length * env.slot_sim_min) / 60 : null;
  const cap = sig ? sig.import_max_kw ?? sig.export_max_kw ?? sig.charge_max_kw : null;
  const capWord = sig?.import_max_kw != null ? "from the grid" : sig?.export_max_kw != null ? "pushed back" : "charging";
  const over = Object.values(s.forecast_peak ?? {}).filter((f) => Math.abs(f.pct) >= 100).length;
  const close = Object.values(s.forecast_peak ?? {}).filter((f) => Math.abs(f.pct) >= (s.autopilot?.trigger_pct ?? 85)).length;
  const sum = s.summary;
  const bl = s.households?.blatnica?.telemetry ?? null;
  return (
    <Tile className="flex h-full flex-col gap-4 px-5 py-5 @md:px-6">
      <div className="grid grid-cols-1 gap-4 @xs:grid-cols-2">
        <div>
          <Num value={over || close} className="text-[clamp(2rem,9cqi,2.5rem)] leading-[1.2] tracking-[-0.015em]" color={over ? P.red : close ? P.orange : P.green} />
          <div className="t-body text-secondary">{over ? `${over === 1 ? "street" : "streets"} heading past the limit` : close ? `${close === 1 ? "street" : "streets"} near the limit tonight` : "streets all inside the limit"}</div>
        </div>
        <div>
          {sig ? (
            <>
              <div className="text-[clamp(2rem,9cqi,2.5rem)] font-semibold leading-[1.2] tracking-[-0.015em] tabular-nums">#{sig.seq}</div>
              <div className="t-body text-secondary">
                {MODE_WORDS[sig.mode]?.title ?? sig.mode}
                {cap != null && <>, at most <span className="font-semibold text-ink tabular-nums">{fmtNum(cap)} kW</span> {capWord}</>}
                {untilH != null && <> until <span className="font-semibold text-ink tabular-nums">{hhmm(untilH % 24)}</span></>}
              </div>
            </>
          ) : (
            <>
              <div className="text-[clamp(2rem,9cqi,2.5rem)] font-semibold leading-[1.2] tracking-[-0.015em] text-tertiary">No signal</div>
              <div className="t-body text-secondary">on this street right now</div>
            </>
          )}
        </div>
      </div>
      {sum && (
        <div className="flex items-center gap-4">
          <Num value={sum.shaped ?? 0} className="text-[2rem] leading-[1.2] tracking-[-0.015em]" color={P.green} />
          <div className="min-w-0 flex-1">
            <div className="t-body text-secondary">of {fmtNum(sum.households)} homes follow the plan</div>
            <HomeDots shaped={sum.shaped ?? 0} total={sum.households} />
          </div>
        </div>
      )}
      {!bl && <div className="t-body text-tertiary">Blatnica, the real home: no live reading right now</div>}
    </Tile>
  );
}

export default function StageB() {
  const st = useStory();
  const { s, story, tf, feeder, history } = st;
  const weather = useWeatherFeed(st.weather);
  const street = useFlatten(tf);
  const city = useFlatten("region:at");

  if (!s || !tf || !story) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-ground">
        <div className="t-title font-normal text-tertiary">{st.error ? "Waiting for the grid platform" : "Connecting to the grid"}</div>
      </div>
    );
  }

  const agg = s.aggregates[tf];
  const name = nice(tf);
  const ap = s.autopilot;
  const status = ap?.pending
    ? "Waiting for a human OK"
    : ap?.mode === "off"
      ? "Autopilot off, an operator is in charge"
      : ap?.mode === "propose"
        ? "A person approves every signal"
        : "Autopilot on. A person can take over any time.";
  const sum = s.summary;
  const peak = s.forecast_peak?.[tf] ?? null;
  const gap = Math.round(story.gapKw);
  const nowKw = agg?.total_kw ?? null;
  const tfCount = Object.keys(s.tree).filter((n) => n.startsWith("tf:")).length;

  // The street as context, not a giant: words in the page flow (never painted over the canvas), the 3D in a fixed
  // aspect tile beside them on a wide card and under them on a narrow one.
  const big = "block text-[clamp(2.75rem,11cqi,4.5rem)] leading-[1.2] tracking-[-0.015em]";
  const scene = (
    <Tile clip className="h-full">
      <div className="grid h-full grid-cols-1 items-center gap-4 p-5 @2xl:grid-cols-[minmax(13rem,0.7fr)_minmax(0,1.3fr)] @2xl:p-7">
        <div className="min-w-0">
          <div className="t-title">{name}</div>
          {gap >= 1 ? (
            <>
              <Num value={gap} unit="kW" color={P.green} className={big} />
              <div className="t-title font-normal text-secondary">taken off this street right now</div>
            </>
          ) : (
            <>
              <Num value={nowKw != null ? Math.abs(nowKw) : null} unit="kW" color={loadTone(Math.abs(story.nowPct ?? 0))} className={big} />
              <div className="t-title font-normal text-secondary">{nowKw != null && nowKw < 0 ? "flowing back from this street now" : "drawn by this street now"}</div>
            </>
          )}
          {sum && (
            <div className="t-body mt-3 text-secondary @2xl:mt-6">
              <span className="font-semibold text-ink tabular-nums">{fmtNum(sum.houses)}</span> homes on{" "}
              <span className="font-semibold text-ink tabular-nums">{tfCount}</span> transformers
            </div>
          )}
        </div>
        <div className="relative aspect-[16/10] max-h-[min(26rem,60vh)] w-full min-w-0 overflow-hidden rounded-[14px] bg-ground">
          <div className="absolute inset-0">
            <StreetScene s={s} weather={weather} feeder={feeder} tf={tf} interactive={false} />
          </div>
        </div>
      </div>
    </Tile>
  );

  const ring = <RingCard pct={story.nowPct} basePct={story.basePct} peak={peak} simHour={s.sim_hour} />;

  const ai = (
    <Tile className="h-full px-5 py-5 @md:px-6 lg:px-8 lg:py-6">
      <AiSteps s={s} weather={weather} variant="row" />
    </Tile>
  );

  const curve = (
    <Tile className="flex h-full min-h-[20rem] flex-col gap-2 px-5 pb-4 pt-5 @md:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="t-title">With and without Gridzilla</h2>
        <div className="t-body flex flex-wrap gap-x-4 text-secondary">
          {agg?.baseline_kw != null && (
            <span className="whitespace-nowrap">Without <span className="font-semibold tabular-nums">{Math.round(agg.baseline_kw)} kW</span></span>
          )}
          {nowKw != null && (
            <span className="whitespace-nowrap">With <span className="font-semibold tabular-nums text-ink">{Math.round(nowKw)} kW</span></span>
          )}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <BCurve s={s} history={history} node={tf} />
      </div>
    </Tile>
  );

  // One grid, placed by named areas: a single column on the phone, two on a tablet or small laptop, the stage layout from 1280 up.
  // Every row is sized by its content (auto), so a short window scrolls the page and never clips a card.
  return (
    <div className="min-h-[100dvh] bg-ground">
      <Bar clock={hhmm(s.sim_hour)} scenario={scenarioWords(s.scenario?.name, s.sim_hour)} status={<><WeatherLine feed={weather} simHour={s.sim_hour} /><span className="ml-4">{status}</span></>} />
      <style>{CSS}</style>
      <main className="b-grid mx-auto w-full max-w-[150rem]">
        <div style={{ gridArea: "scene" }}>{scene}</div>
        <div style={{ gridArea: "ring" }}>{ring}</div>
        <div style={{ gridArea: "curve" }}>{curve}</div>
        <div style={{ gridArea: "facts" }}><FactsCard s={s} tf={tf} /></div>
        <div style={{ gridArea: "ai" }}>{ai}</div>
        <div style={{ gridArea: "plan" }}><PlanCard street={street} city={city} /></div>
        <div className="b-weather" style={{ gridArea: "weather" }}><WeatherCard feed={weather} simHour={s.sim_hour} /></div>
      </main>
    </div>
  );
}

const CSS = `
.b-grid{display:grid;gap:12px;padding:12px 12px 32px;grid-template-columns:minmax(0,1fr);
  grid-template-areas:"scene" "ring" "curve" "facts" "ai" "plan" "weather";}
.b-grid>*{min-width:0}
@media (min-width:640px){.b-grid{gap:16px;padding:16px 20px 32px;grid-template-columns:repeat(2,minmax(0,1fr));
  grid-template-areas:"scene scene" "ring facts" "curve curve" "ai ai" "plan weather";}}
@media (min-width:1280px){.b-grid{gap:clamp(16px,1.2vw,28px);padding:clamp(16px,1.4vw,32px);
  grid-template-columns:minmax(0,1.9fr) minmax(0,1fr);
  grid-template-areas:"scene ring" "scene facts" "curve plan" "ai ai";}
  .b-weather{display:none}}
@media (min-width:1900px){.b-grid{grid-template-columns:minmax(0,1.25fr) minmax(0,1fr) minmax(0,0.85fr);
  grid-template-areas:"scene curve ring" "scene curve facts" "ai ai plan";}}
`;
