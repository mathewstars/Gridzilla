import type { Ops } from "../useOps";
import type { Route } from "../shell/Sidebar";
// placeholder: the shell owner replaces this file (City, Autopilot, Manual, Households, Real plant, Weather, Log)
export default function OtherView({ route }: { route: Route; ops: Ops }) {
  return <div className="panel p-4 t-small">{route}</div>;
}
