// LIVE CITY (left of the two-column Operations view): the heat grid of every transformer and the selected one's live
// curve. Selection is shared with the Now panel through ops.select. The 3D street lives in the presentation stage.
import type { Ops } from "../useOps";
import HeatGrid from "../city/HeatGrid";
import TfCurve from "../city/TfCurve";
import "../city/city.css";

export default function CityColumn({ ops }: { ops: Ops }) {
  const { s, tf } = ops;
  if (!s) return null;
  return (
    <div className="city-col">
      <HeatGrid s={s} city={ops.city} selected={tf} onSelect={ops.select} />
      {tf && <TfCurve s={s} history={ops.history} tf={tf} plan={ops.plan} />}
    </div>
  );
}
