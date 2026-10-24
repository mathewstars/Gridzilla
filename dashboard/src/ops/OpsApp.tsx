// Gridzilla operations console: the room where a grid operator runs the city (ops.md). Sidebar + top bar shell, hash
// routes; Operations is the default view, #/present is the presentation stage, unchanged.
import { useEffect, useState } from "react";
import Stage from "../stage/Stage";
import { useOps } from "./useOps";
import Sidebar, { type Route } from "./shell/Sidebar";
import TopBar from "./shell/TopBar";
import CityColumn from "./cols/CityColumn";
import NowPanel from "./now/NowPanel";
import DemoView from "./demo/DemoView";
import HelpOverlay from "./help/HelpOverlay";
import FeedStrip from "./now/FeedStrip";
import OtherView from "./views/OtherView";
import "./ops.css";
import { applyTheme, initialTheme } from "./theme";

// Theme before the first paint, so the console never flashes light.
applyTheme(initialTheme());

const ROUTES: Route[] = ["ops", "demo", "city", "autopilot", "manual", "households", "plant", "weather", "log", "present"];
const routeOf = (): Route => {
  const r = location.hash.replace(/^#\/?/, "") as Route;
  return ROUTES.includes(r) ? r : "ops";
};

function useRoute() {
  const [r, setR] = useState<Route>(routeOf);
  useEffect(() => {
    const on = () => setR(routeOf());
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return r;
}

export default function OpsApp() {
  const route = useRoute();
  if (route === "present") return <Stage />;
  return <Console route={route} />;
}

function Console({ route }: { route: Route }) {
  const ops = useOps();
  if (!ops.s)
    return (
      <div className="ops-splash">
        <div className="t-title">Gridzilla</div>
        <div className="t-small">{ops.error ? "The grid platform is not answering yet." : "Connecting to the grid."}</div>
      </div>
    );
  return (
    <div className="ops">
      <Sidebar route={route} ops={ops} rail={route === "demo"} />
      <div className="ops-main">
        <TopBar ops={ops} compact={route === "demo"} />
        {route === "demo" ? (
          <main className="ops-demo"><DemoView ops={ops} /></main>
        ) : route === "ops" ? (
          // Two-column hierarchy: the city and its curve on the left, one Now panel on the right with the newest three
          // events in a strip under it; the composer opens in a drawer from the Now panel.
          <main className="ops-cols">
            <section className="ops-col ops-col-city" data-scroll="column"><CityColumn ops={ops} /></section>
            <section className="ops-col ops-col-now" data-scroll="column">
              <NowPanel ops={ops} />
              <FeedStrip ops={ops} />
            </section>
          </main>
        ) : (
          <main className="ops-view"><OtherView route={route} ops={ops} /></main>
        )}
      </div>
      <HelpOverlay route={route} />
    </div>
  );
}
