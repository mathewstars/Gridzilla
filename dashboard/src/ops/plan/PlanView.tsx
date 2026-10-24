import type { Ops } from "../useOps";
// placeholder: its owner replaces this file (dad's Flattening tab, our style)
export default function PlanView({ ops }: { ops: Ops }) {
  return <section className="panel p-4 t-small">Diet plan {ops.tf}</section>;
}
