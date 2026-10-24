import type { Ops } from "../useOps";
// placeholder: the column owner replaces this file
export default function ControlColumn({ ops }: { ops: Ops }) {
  return <div className="panel p-4 t-small">ControlColumn {ops.tf}</div>;
}
