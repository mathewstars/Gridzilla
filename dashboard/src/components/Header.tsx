// Board header: wordmark, live grid clock, feeder switcher, the presenter's scenario buttons and the Details drawer.
// One calm row on wide screens, straight on the ground (no card); on a phone it stacks into brand + clock, feeder, scenarios.
import { useEffect, useState } from "react";
import { post, useHasEndpoint, type State } from "../api";
import { hhmm } from "../model";
import { Badge, Segmented } from "./ui";
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
    <div className="flex min-w-0 items-center [grid-area:brand]">
      <span className="text-[1.5rem] font-semibold leading-none tracking-[-0.02em] text-ink">Gridzilla</span>
    </div>
  );
}

function Clock({ s }: { s: State }) {
  const live = useLive(s);
  return (
    <div className="flex items-center gap-3 justify-self-end [grid-area:clock] sm:justify-self-start">
      <div className="text-right sm:text-left">
        <div className="t-caption leading-none">{live ? "Grid time" : "Grid time, offline"}</div>
        <div className={`num mt-1 text-[1.75rem] font-semibold leading-none tracking-[-0.015em] ${live ? "text-ink" : "text-tertiary"}`} aria-live="off">
          {hhmm(s.sim_hour)}
        </div>
      </div>
      {s.hb_paused && (
        <span className="hidden sm:inline-flex" title="The fail-safe demo has paused the heartbeat">
          <Badge>Outage demo on</Badge>
        </span>
      )}
    </div>
  );
}

function Scenarios({ s }: { s: State }) {
  const hasWeather = useHasEndpoint("/api/weather");
  const [pending, setPending] = useState<Scen | null>(null);
  const [liveRefused, setLiveRefused] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Keep the thumb on the clicked scenario until the next state poll confirms it (or 6 s pass).
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
    <div
      className="relative min-w-0 [grid-area:scen] justify-self-stretch xl:justify-self-end max-sm:[&_[role=radiogroup]]:grid max-sm:[&_[role=radiogroup]]:w-full max-sm:[&_[role=radiogroup]]:grid-cols-2 max-sm:[&_[role=radiogroup]]:rounded-[14px]"
      title={liveOff ? "Live weather needs the weather feature" : undefined}
    >
      <Segmented
        id="scenario"
        size="md"
        value={value}
        onChange={choose}
        options={SCENARIOS.map((o) => ({
          ...o,
          disabled: o.value === "live-weather" && liveOff,
          title: o.value === "live-weather" && liveOff ? "needs the weather feature" : `Switch the street to: ${o.label.toLowerCase()}`,
        }))}
      />
      {err && (
        <div role="status" className="t-small absolute right-0 top-[calc(100%+0.5rem)] z-30 max-w-[22rem] rounded-[12px] bg-card px-3.5 py-2 text-ink shadow-[0_8px_30px_rgb(0_0_0/0.12)]">
          {err}
        </div>
      )}
    </div>
  );
}

export default function Header({ s, feeder, setFeeder, onOpenDrawer }: { s: State; feeder: string; setFeeder: (f: string) => void; onOpenDrawer: () => void }) {
  return (
    <header
      className={[
        "relative z-30 grid shrink-0 items-center gap-x-5 gap-y-3",
        "grid-cols-[minmax(0,1fr)_auto_auto] [grid-template-areas:'brand_clock_details'_'feeder_feeder_feeder'_'scen_scen_scen']",
        "sm:grid-cols-[auto_auto_minmax(0,1fr)_auto] sm:[grid-template-areas:'brand_clock_feeder_details'_'scen_scen_scen_scen']",
        "xl:grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] xl:gap-x-8 xl:[grid-template-areas:'brand_clock_feeder_scen_details']",
      ].join(" ")}
    >
      <Brand />
      <Clock s={s} />
      <div className="min-w-0 [grid-area:feeder]">
        <FeederPicker s={s} feeder={feeder} setFeeder={setFeeder} />
      </div>
      <Scenarios s={s} />
      <button type="button" onClick={onOpenDrawer} className="btn btn-white [grid-area:details]" aria-label="Open details: houses, log and fail-safe demo">
        Details
      </button>
    </header>
  );
}
