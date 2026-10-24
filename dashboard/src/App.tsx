// The presentation board: one feeder on screen, its 3D street on the left with the AI brain under it, the selected
// transformer's curve, a house's allowed box and the weather on the right. `?view=<name>` renders one view alone
// (used while building and reviewing each piece).
import { useEffect, useMemo, useState } from "react";
import { BLATNICA_DEVICE, meterDevice, useGridState, useHistory, useWeather } from "./api";
import { feederOf, feeders, headline, tfsOf } from "./model";
import BlatnicaTile from "./components/BlatnicaTile";
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
      <div className="t-headline">Gridzilla</div>
      <div className="t-small">{error ? `Waiting for the platform (${error})` : "Connecting to the grid..."}</div>
    </div>
  );
}

export default function App() {
  // What is on screen decides what the platform sends: households of this feeder, the full forecast of this transformer.
  const [onScreen, setOnScreen] = useState({ feeder: "", tf: "" });
  const state = useGridState(onScreen.feeder, onScreen.tf);
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

  useEffect(() => {
    if (feeder !== onScreen.feeder || tf !== onScreen.tf) setOnScreen({ feeder, tf });
  }, [feeder, tf, onScreen]);
  const houseDevs = s ? Object.values(s.households ?? {}).filter((h) => h.tf === tf).map(meterDevice) : [];
  const hist = useHistory(tf ? [tf, feeder] : [], [...houseDevs.slice(0, 16), BLATNICA_DEVICE]);

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
    plant: <BlatnicaTile s={s} history={hist.data} />,
    header: <Header s={s} feeder={feeder} setFeeder={setFeeder} onOpenDrawer={() => setDrawer(true)} />,
    headline: <Headline s={s} />,
  } as const;

  if (view && view in views)
    return (
      <div className="flex h-screen flex-col gap-4 p-4">
        <WarningBanner weather={weather} />
        <div className="min-h-0 flex-1">{views[view as keyof typeof views]}</div>
        <Drawer s={s} feeder={feeder} open={drawer || view === "drawer"} onClose={() => setDrawer(false)} />
      </div>
    );

  // One screen at 1440x900 and 2560x1440, no page scroll: header, three numbers, the street next to the curve, then the
  // AI decision, the allowed box and the weather. Phones stack everything in reading order.
  return (
    <div className="mx-auto flex min-h-screen max-w-[3200px] flex-col gap-4 px-4 py-4 lg:h-screen lg:min-h-0 lg:gap-[1.1rem] lg:overflow-hidden lg:px-6 lg:py-5">
      {views.header}
      <WarningBanner weather={weather} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-[1.1rem]">
        <div className="min-w-0 lg:col-span-8">{views.headline}</div>
        <div className="min-w-0 lg:col-span-4">{views.plant}</div>
      </div>
      <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-12 lg:grid-rows-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-[1.1rem]">
        <div className="h-[24rem] min-h-0 lg:col-span-7 lg:h-auto">{views.street}</div>
        <div className="h-[22rem] min-h-0 lg:col-span-5 lg:h-auto">{views.curve}</div>
        <div className="min-h-0 lg:col-span-5">{views.brain}</div>
        <div className="h-[20rem] min-h-0 lg:col-span-4 lg:h-auto">{views.envelope}</div>
        <div className="min-h-0 lg:col-span-3">{views.weather}</div>
      </main>
      <Drawer s={s} feeder={feeder} open={drawer} onClose={() => setDrawer(false)} />
    </div>
  );
}
