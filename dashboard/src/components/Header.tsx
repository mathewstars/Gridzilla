// Board header: wordmark, live grid clock, feeder switcher, the presenter's scenario buttons and the Details drawer.
// One row on wide screens; on a phone it stacks into brand + clock, feeder, scenarios.
import { Lightning, SidebarSimple, WifiSlash } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { post, useHasEndpoint, type State } from "../api";
import { hhmm } from "../model";
import { Segmented } from "./ui";
import FeederPicker from "./chrome/FeederPicker";
import { errText, useLive } from "./chrome/shared";

type Scen = "normal" | "cold-evening" | "sunny-noon" | "live-weather";
const SCENARIOS: { value: Scen; label: string }[] = [
  { value: "normal", label: "Normal day" },
  { value: "cold-evening", label: "Cold evening" },
  { value: "sunny-noon", label: "Sunny noon" },
  { value: "live-weather", label: "Live weather" },
];

function Brand() {
  return (
    <div className="flex min-w-0 items-center gap-3 [grid-area:brand]">
      <span className="relative grid size-10 shrink-0 place-items-center rounded-[0.8rem] bg-gradient-to-b from-[#0f1a24] to-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.1),inset_0_0_0_1px_rgb(51_225_201/0.25),0_8px_24px_-8px_rgb(51_225_201/0.55)]">
        <Lightning weight="fill" size={20} className="text-signal drop-shadow-[0_0_6px_rgb(51_225_201/0.8)]" aria-hidden />
      </span>
      <div className="min-w-0">
        <div className="text-[1.3rem] font-semibold leading-none tracking-[-0.025em]">Gridzilla</div>
        <div className="label mt-1 truncate leading-none">Live grid, Vienna</div>
      </div>
    </div>
  );
}

function Clock({ s }: { s: State }) {
  const live = useLive(s);
  const paused = s.hb_paused;
  return (
    <div className="flex items-center gap-3 justify-self-end [grid-area:clock] sm:justify-self-start">
      <div className="text-right sm:text-left">
        <div className="label flex items-center justify-end gap-2 leading-none sm:justify-start">
          {live ? (
            <span className="flex items-center gap-1.5 font-semibold text-signal">
              <span className="live-dot" aria-hidden />
              Live
            </span>
          ) : (
            <span className="flex items-center gap-1.5 font-semibold text-dim">
              <WifiSlash size={13} weight="bold" aria-hidden />
              Offline
            </span>
          )}
          <span>Grid time</span>
        </div>
        <div className={`num mt-1 text-[1.65rem] font-semibold leading-none tracking-[-0.03em] ${live ? "text-fg" : "text-dim"}`} aria-live="off">
          {hhmm(s.sim_hour)}
        </div>
      </div>
      <AnimatePresence>
        {paused && (
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="hidden items-center gap-1.5 rounded-full bg-white/[0.08] px-2.5 py-1 text-[0.74rem] font-semibold text-fg shadow-[inset_0_0_0_1px_rgb(255_255_255/0.14)] sm:inline-flex"
            title="The fail-safe demo has paused the heartbeat"
          >
            <WifiSlash size={12} weight="bold" aria-hidden />
            Outage demo on
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

function Scenarios({ s }: { s: State }) {
  const hasWeather = useHasEndpoint("/api/weather");
  const [pending, setPending] = useState<Scen | null>(null);
  const [liveRefused, setLiveRefused] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Keep the pill on the clicked scenario until the next state poll confirms it (or 6 s pass).
  useEffect(() => {
    if (pending && s.scenario?.name === pending) setPending(null);
  }, [s.scenario?.name, pending]);
  useEffect(() => {
    if (!pending) return;
    const t = window.setTimeout(() => setPending(null), 6000);
    return () => window.clearTimeout(t);
  }, [pending]);
  useEffect(() => {
    if (!err) return;
    const t = window.setTimeout(() => setErr(null), 6000);
    return () => window.clearTimeout(t);
  }, [err]);

  const liveOff = hasWeather === false || liveRefused;
  const choose = async (v: Scen) => {
    if (v === (s.scenario?.name as Scen)) return;
    setErr(null);
    setPending(v);
    try {
      await post(`scenario/${v}`);
    } catch (e) {
      setPending(null);
      if (v === "live-weather") {
        setLiveRefused(true);
        setErr("Live weather needs the weather feature on the platform");
      } else setErr(`Could not switch: ${errText(e)}`);
    }
  };
  const value = pending ?? ((s.scenario?.name as Scen) || null);

  return (
    <div className="relative min-w-0 [grid-area:scen] justify-self-stretch xl:justify-self-end">
      <div className="flex min-w-0 items-center gap-3">
        <span className="label hidden shrink-0 2xl:inline">Scenario</span>
        <div className="scroll-thin -m-1 min-w-0 overflow-x-auto p-1" title={liveOff ? "Live weather needs the weather feature" : undefined}>
          <Segmented
            id="scenario"
            size="sm"
            value={value}
            onChange={choose}
            options={SCENARIOS.map((o) => ({
              ...o,
              disabled: o.value === "live-weather" && liveOff,
              title: o.value === "live-weather" && liveOff ? "needs the weather feature" : `Switch the street to: ${o.label.toLowerCase()}`,
            }))}
          />
        </div>
      </div>
      <AnimatePresence>
        {err && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute right-0 top-[calc(100%+0.4rem)] z-30 whitespace-nowrap rounded-full bg-deck-3 px-3 py-1.5 text-[0.78rem] text-fg shadow-[inset_0_0_0_1px_rgb(255_255_255/0.1),0_10px_30px_-10px_rgb(0_0_0/0.9)]"
          >
            {err}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Header({ s, feeder, setFeeder, onOpenDrawer }: { s: State; feeder: string; setFeeder: (f: string) => void; onOpenDrawer: () => void }) {
  return (
    <header
      className={[
        "panel relative z-30 grid shrink-0 items-center gap-x-5 gap-y-3 px-4 py-3 sm:px-5",
        "grid-cols-[minmax(0,1fr)_auto_auto] [grid-template-areas:'brand_clock_details'_'feeder_feeder_feeder'_'scen_scen_scen']",
        "sm:grid-cols-[auto_auto_minmax(0,1fr)_auto] sm:[grid-template-areas:'brand_clock_feeder_details'_'scen_scen_scen_scen']",
        "xl:grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] xl:gap-x-7 xl:[grid-template-areas:'brand_clock_feeder_scen_details']",
      ].join(" ")}
    >
      <Brand />
      <Clock s={s} />
      <div className="min-w-0 [grid-area:feeder]">
        <FeederPicker s={s} feeder={feeder} setFeeder={setFeeder} />
      </div>
      <Scenarios s={s} />
      <button type="button" onClick={onOpenDrawer} className="btn [grid-area:details]" aria-label="Open details: houses, log and fail-safe demo">
        <SidebarSimple size={16} weight="bold" className="-scale-x-100" aria-hidden />
        <span className="hidden sm:inline">Details</span>
      </button>
    </header>
  );
}
