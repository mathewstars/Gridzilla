// The presentation board: one feeder on screen, its 3D street on the left with the AI brain under it, the selected
// transformer's curve, a house's allowed box and the weather on the right. `?view=<name>` renders one view alone
// (used while building and reviewing each piece).
import { useEffect, useMemo, useState } from "react";
import { useGridState, useHistory, useWeather } from "./api";
import { feederOf, feeders, headline, tfsOf } from "./model";
import BrainStrip from "./components/BrainStrip";
import Drawer from "./components/Drawer";
import EnvelopeView from "./components/EnvelopeView";
import Header from "./components/Header";
import Headline from "./components/Headline";
import HeroCurve from "./components/HeroCurve";
import StreetPanel from "./components/street/StreetPanel";
import WeatherStrip, { WarningBanner } from "./components/WeatherStrip";

function useNarrow() {
  const q = "(max-width: 900px)";
  const [narrow, setNarrow] = useState(() => typeof matchMedia !== "undefined" && matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const on = () => setNarrow(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return narrow;
}

function storyFeeder(s: NonNullable<ReturnType<typeof useGridState>["data"]>) {
  const sig = Object.entries(s.active).sort((a, b) => (b[1].seq ?? 0) - (a[1].seq ?? 0))[0]?.[0];
  if (sig?.startsWith("sub:")) return feeders(s).find((f) => s.tree[f]?.parent === sig) ?? feederOf(s, headline(s).worst ?? feeders(s)[0]);
  return feederOf(s, sig ?? headline(s).worst ?? feeders(s)[0]);
}

function Splash({ error }: { error: string | null }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="text-2xl font-semibold tracking-tight">Gridzilla</div>
      <div className="text-dim">{error ? `Waiting for the platform (${error})` : "Connecting to the grid..."}</div>
    </div>
  );
}

export default function App() {
  const state = useGridState();
  const hist = useHistory();
  const weather = useWeather();
  const narrow = useNarrow();
  const view = useMemo(() => new URLSearchParams(location.search).get("view"), []);
  const [feederSel, setFeederSel] = useState<string | null>(null);
  const [tfSel, setTfSel] = useState<string | null>(null);
  const [house, setHouse] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);

  const s = state.data;
  // Default feeder follows the story: the newest active signal, else the worst transformer. `?feeder=` pins one.
  const pinned = useMemo(() => new URLSearchParams(location.search).get("feeder"), []);
  const feeder = s ? (feederSel && s.tree[feederSel] ? feederSel : pinned && s.tree[`feeder:${pinned}`] ? `feeder:${pinned}` : storyFeeder(s)) : "";
  const tfs = s ? tfsOf(s, feeder) : [];
  const tf = tfSel && tfs.includes(tfSel) ? tfSel : (s && tfs.length ? [...tfs].sort((a, b) => Math.abs(s.aggregates[b]?.load_pct ?? 0) - Math.abs(s.aggregates[a]?.load_pct ?? 0))[0] : "");

  if (!s) return <Splash error={state.error?.message ?? null} />;

  const setFeeder = (f: string) => {
    setFeederSel(f);
    setTfSel(null);
    setHouse(null);
  };
  const views = {
    street: <div className="panel h-full overflow-hidden"><StreetPanel s={s} feeder={feeder} selected={tf} onSelect={setTfSel} compact={narrow} /></div>,
    curve: <HeroCurve s={s} history={hist.data} node={tf} />,
    brain: <BrainStrip s={s} weather={weather} />,
    envelope: <EnvelopeView s={s} history={hist.data} tf={tf} house={house} setHouse={setHouse} />,
    weather: <WeatherStrip s={s} weather={weather} />,
    header: <Header s={s} feeder={feeder} setFeeder={setFeeder} onOpenDrawer={() => setDrawer(true)} />,
    headline: <Headline s={s} />,
  } as const;

  if (view && view in views)
    return (
      <div className="flex h-screen flex-col gap-3 p-4">
        <WarningBanner weather={weather} />
        <div className="min-h-0 flex-1">{views[view as keyof typeof views]}</div>
        <Drawer s={s} feeder={feeder} open={drawer || view === "drawer"} onClose={() => setDrawer(false)} />
      </div>
    );

  return (
    <div className="mx-auto flex min-h-screen max-w-[3200px] flex-col gap-3 p-3 sm:p-4 lg:h-screen lg:min-h-0 lg:overflow-hidden">
      {views.header}
      <WarningBanner weather={weather} />
      {views.headline}
      <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
        <section className="flex min-h-0 flex-col gap-3">
          <div className="h-[22rem] min-h-0 sm:h-[28rem] lg:h-auto lg:flex-[1.25]">{views.street}</div>
          <div className="min-h-0 lg:flex-1">{views.brain}</div>
        </section>
        <section className="flex min-h-0 flex-col gap-3">
          <div className="h-[22rem] min-h-0 lg:h-auto lg:flex-[1.3]">{views.curve}</div>
          <div className="h-[18rem] min-h-0 lg:h-auto lg:flex-1">{views.envelope}</div>
          <div className="min-h-0 lg:flex-[0.7]">{views.weather}</div>
        </section>
      </main>
      <Drawer s={s} feeder={feeder} open={drawer} onClose={() => setDrawer(false)} />
    </div>
  );
}
