// OPERATIONS, readability pass (captain + dad's board): the demo's hierarchy plus the controls. Outcomes on top; one big
// curve with dad's four tiles beside it; what just happened, the real Blatnica house and one slim controls panel; the
// city as dots. The 72-tile grid lives in the City view.
import type { Ops } from "../useOps";
import Tonight from "../tonight/Tonight";
import FeedStrip from "../now/FeedStrip";
import BigCurve from "./BigCurve";
import FourTiles from "./FourTiles";
import PlantCard from "./PlantCard";
import Controls from "./Controls";
import CityDots from "./Dots";
import "./ops2.css";

export default function OperationsView({ ops }: { ops: Ops }) {
  const s = ops.s;
  if (!s) return null;
  return (
    <div className="op2">
      <div className="op2-tonight"><Tonight ops={ops} /></div>
      <div className="op2-curve"><BigCurve ops={ops} /></div>
      <div className="op2-tiles"><FourTiles ops={ops} /></div>
      <div className="op2-feed"><FeedStrip ops={ops} /></div>
      <div className="op2-side">
        <PlantCard ops={ops} />
        <Controls ops={ops} />
      </div>
      <div className="op2-dots"><CityDots s={s} ops={ops} selected={ops.tf} onPick={ops.select} /></div>
    </div>
  );
}
