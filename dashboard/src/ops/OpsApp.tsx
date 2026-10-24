// Gridzilla operations console: the room where a grid operator runs the city (ops.md). Sidebar + top bar shell, hash
// routes; Operations is the default view, #/present is the presentation stage, unchanged.
import { useEffect, useState } from "react";
import Stage from "../stage/Stage";
import { useOps } from "./useOps";
import Sidebar, { type Route } from "./shell/Sidebar";
import TopBar from "./shell/TopBar";
import CityColumn from "./cols/CityColumn";
import FeedColumn from "./cols/FeedColumn";
import ControlColumn from "./cols/ControlColumn";
import OtherView from "./views/OtherView";
import "./ops.css";
import { applyTheme, initialTheme } from "./theme";

// Theme before the first paint, so the console never flashes light.
applyTheme(initialTheme());

const ROUTES: Route[] = ["ops", "city", "autopilot", "manual", "households", "plant", "weather", "log", "present"];
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
      <Sidebar route={route} ops={ops} />
      <div className="ops-main">
        <TopBar ops={ops} />
        {route === "ops" ? (
          <main className="ops-cols">
            <section className="ops-col ops-col-city" data-scroll="column"><CityColumn ops={ops} /></section>
            <section className="ops-col ops-col-feed" data-scroll="column"><FeedColumn ops={ops} /></section>
            <section className="ops-col ops-col-ctl" data-scroll="column"><ControlColumn ops={ops} /></section>
          </main>
        ) : (
          <main className="ops-view"><OtherView route={route} ops={ops} /></main>
        )}
      </div>
    </div>
  );
}
