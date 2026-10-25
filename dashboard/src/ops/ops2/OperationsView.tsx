// OPERATIONS, five panels and nothing more (console-simplify.md): what tonight saved and what we did on top; the big
// transformer chart in dad's grammar as the hero (his chips, the one-sentence state line, the ring) with the three newest
// events under it; what the AI did (his four steps and the review countdown) and the real Blatnica plant on the right.
// Everything else (city tiles, controls, signals, households) lives in its own view, reachable from the sidebar.
import type { Ops } from "../useOps";
import Tonight from "../tonight/Tonight";
import FeedStrip from "../now/FeedStrip";
import BlatnicaLive from "../demo/BlatnicaLive";
import BigCurve from "./BigCurve";
import FourTiles from "./FourTiles";
import "./ops2.css";

export default function OperationsView({ ops }: { ops: Ops }) {
  if (!ops.s) return null;
  return (
    <div className="op2">
      <div className="op2-tonight"><Tonight ops={ops} /></div>
      <div className="op2-left">
        <div className="op2-curve"><BigCurve ops={ops} /></div>
        <FeedStrip ops={ops} />
      </div>
      <div className="op2-right">
        <div className="op2-tiles"><FourTiles ops={ops} /></div>
        <BlatnicaLive />
      </div>
    </div>
  );
}
