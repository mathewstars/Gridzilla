// LIVE CITY column of the operations console (ops.md): the heat grid of every transformer, the selected one's live curve,
// and its street in 3D. Selection is shared with the other columns through ops.select.
import type { Ops } from "../useOps";
import HeatGrid from "../city/HeatGrid";
import TfCurve from "../city/TfCurve";
import StreetCard from "../city/StreetCard";
import "../city/city.css";

export default function CityColumn({ ops }: { ops: Ops }) {
  const { s, tf } = ops;
  if (!s) return null;
  return (
    <div className="city-col">
      <HeatGrid s={s} city={ops.city} selected={tf} onSelect={ops.select} />
      {tf && <TfCurve s={s} history={ops.history} tf={tf} plan={ops.plan} />}
      {tf && <StreetCard s={s} weather={ops.weather} feeder={ops.feeder} tf={tf} />}
    </div>
  );
}
