// Gridzilla operations console: the room where a grid operator runs the city (ops.md). Sidebar + top bar shell, hash
// routes; Operations is the default view, #/demo is demo mode for the pitch. The old presentation stage is retired:
// a #/present link from an old deck opens demo mode instead.
import { useEffect, useState } from "react";
import { useOps } from "./useOps";
import Sidebar, { type Route } from "./shell/Sidebar";
import TopBar from "./shell/TopBar";
import CityColumn from "./cols/CityColumn";
import NowPanel from "./now/NowPanel";
import DemoView from "./demo/DemoView";
import HelpOverlay from "./help/HelpOverlay";
import { API_BASE, READ_ONLY } from "../api";
import FeedStrip from "./now/FeedStrip";
import OtherView from "./views/OtherView";
import "./ops.css";
import { applyTheme, initialTheme } from "./theme";

// Theme before the first paint, so the console never flashes light.
applyTheme(initialTheme());

const ROUTES: Route[] = ["ops", "demo", "city", "autopilot", "manual", "households", "plant", "weather", "log"];
const routeOf = (): Route => {
  const r = location.hash.replace(/^#\/?/, "");
  if (r === "present") {
    history.replaceState(null, "", "#/demo"); // the old stage is retired; say where we are
    return "demo";
  }
  return ROUTES.includes(r as Route) ? (r as Route) : "ops";
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
      {READ_ONLY && (
        <div className="ops-ro" role="status" title={`Reading ${API_BASE}; every button that would change something is off`}>
          Read-only · live server · {API_BASE.replace(/^https?:\/\//, "")}
        </div>
      )}
    </div>
  );
}
