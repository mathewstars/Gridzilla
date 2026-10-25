// Gridzilla operations console: the room where a grid operator runs the city (ops.md). Sidebar + top bar shell, hash
// routes; Operations is the one view to show (one version only). #/demo and the old #/present open
// Operations; ?bare=1 shows Operations alone, without sidebar and top bar. (The pitch deck embeds DemoView directly.)
// Phones (under 900 px wide or 500 px tall, src/phone.ts) get their own shell: a tab bar at the bottom, a slim top bar
// with the heartbeat and a Menu sheet, every view in one column (ops/phone.css).
import { useEffect, useState } from "react";
import { useOps } from "./useOps";
import Sidebar, { type Route } from "./shell/Sidebar";
import TopBar from "./shell/TopBar";
import TabBar from "./shell/TabBar";
import { usePhone } from "../phone";
import HelpOverlay from "./help/HelpOverlay";
import OperationsView from "./ops2/OperationsView";
import PlanView from "./plan/PlanView";
import { API_BASE, READ_ONLY } from "../api";
import OtherView from "./views/OtherView";
import "./ops.css";
import "./phone.css";
import { applyTheme, initialTheme } from "./theme";

// Theme before the first paint, so the console never flashes light.
applyTheme(initialTheme());

const ROUTES: Route[] = ["ops", "plan", "city", "autopilot", "manual", "households", "plant", "weather", "log"];
const routeOf = (): Route => {
  const r = location.hash.replace(/^#\/?/, "");
  if (r === "demo" || r.startsWith("demo?") || r === "present") {
    history.replaceState(null, "", `${location.pathname}${location.search}#/`); // one version: Operations; say where we are
    return "ops";
  }
  return ROUTES.includes(r as Route) ? (r as Route) : "ops";
};

function useRoute() {
  const [r, setR] = useState<Route>(routeOf);
  useEffect(() => {
    // a new section opens at its top, never at the scroll of the one before (a phone otherwise lands mid-page)
    const on = () => {
      setR(routeOf());
      window.scrollTo(0, 0);
    };
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return r;
}

export default function OpsApp() {
  const route = useRoute();
  // ?bare=1 (query before the hash): Operations alone, full-bleed, no sidebar and no top bar
  if (route === "ops" && new URLSearchParams(location.search).has("bare")) return <Bare />;
  return <Console route={route} />;
}

function Bare() {
  const ops = useOps();
  if (!ops.s) return <div className="ops-splash"><div className="t-small">{ops.error ? "The grid platform is not answering yet." : "Connecting to the grid."}</div></div>;
  return <main className="ops-op2 ops-bare" data-scroll="page"><OperationsView ops={ops} /></main>;
}

function Console({ route }: { route: Route }) {
  const ops = useOps();
  const phone = usePhone();
  if (!ops.s)
    return (
      <div className="ops-splash">
        <div className="t-title">Gridzilla</div>
        <div className="t-small">{ops.error ? "The grid platform is not answering yet." : "Connecting to the grid."}</div>
      </div>
    );
  const view =
    route === "ops" ? (
      <main className="ops-op2" data-scroll="page"><OperationsView ops={ops} /></main>
    ) : route === "plan" ? (
      <main className="ops-view"><PlanView ops={ops} /></main>
    ) : (
      <main className="ops-view"><OtherView route={route} ops={ops} /></main>
    );
  return (
    <div className={`ops${phone ? " is-phone" : ""}`}>
      {phone ? (
        // Phones: the heartbeat and Menu on top, the sections in a tab bar at the bottom, one column between
        <>
          <TopBar ops={ops} phone />
          {view}
          <TabBar route={route} ops={ops} />
        </>
      ) : (
        <>
          <Sidebar route={route} ops={ops} />
          <div className="ops-main">
            <TopBar ops={ops} />
            {view}
          </div>
        </>
      )}
      <HelpOverlay route={route} />
      {READ_ONLY && (
        <div className="ops-ro" role="status" title={`Reading ${API_BASE}; every button that would change something is off`}>
          Read-only · live server · {API_BASE.replace(/^https?:\/\//, "")}
        </div>
      )}
    </div>
  );
}
