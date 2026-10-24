import type { Ops } from "../useOps";
// placeholder: the shell owner replaces this file
export default function TopBar({ ops }: { ops: Ops }) {
  return <header className="p-3 t-small">{ops.s?.sim_hour}</header>;
}
