import type { Ops } from "../useOps";
export type Route = "ops" | "city" | "autopilot" | "manual" | "households" | "plant" | "weather" | "log" | "present";
// placeholder: the shell owner replaces this file
export default function Sidebar({ route }: { route: Route; ops: Ops }) {
  return <nav className="p-3 t-small">{route}</nav>;
}
