import type { Ops } from "../useOps";
// placeholder: its owner replaces this file
export default function Controls({ ops }: { ops: Ops }) {
  return <section className="panel p-4 t-small">Controls {ops.tf}</section>;
}
