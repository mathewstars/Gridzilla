// The selected transformer's compact live curve: with Gridzilla (blue), without (grey dashed), the limit (red), and from
// Now on the diet plan. Title = the transformer, with its live kW, % of limit and the limit beside it.
import type { Flatten, History, State } from "../../api";
import { nice } from "../../model";
import { loadTone, P } from "../../stage/palette";
import LiveCurve from "../../stage/kit/LiveCurve";
import { cellOf } from "./cityData";

export default function TfCurve({ s, history, tf, plan }: { s: State; history: History | null; tf: string; plan: Flatten | null }) {
  const c = cellOf(s, tf, null);
  const feeder = s.tree[tf]?.parent ?? "";
  const sub = s.tree[feeder]?.parent ?? "";
  const p = Math.abs(c.pct ?? 0);
  const back = (c.kw ?? 0) < 0;
  const flat = plan && plan.enabled && plan.plan && plan.plan.tf === tf ? plan.plan : null;
  const ready = !!(history?.nodes && tf in history.nodes);
  return (
    <div className="panel cc">
      <header className="cc-head">
        <div className="cc-name">
          <h2 className="cg-title">{nice(tf)}</h2>
          <span className="cc-where">{nice(feeder)} feeder · {nice(sub)}</span>
        </div>
        <dl className="cc-stats num">
          <div>
            <dt>{back ? "pushing back" : "live"}</dt>
            <dd>{c.kw == null ? "–" : `${Math.round(Math.abs(c.kw))} kW`}</dd>
          </div>
          <div>
            <dt>of limit</dt>
            <dd style={{ color: loadTone(c.pct) === P.green ? undefined : loadTone(c.pct) }}>{c.pct == null ? "–" : `${p} %`}</dd>
          </div>
          <div>
            <dt>limit</dt>
            <dd>{c.limit == null ? "–" : `${Math.round(c.limit)} kW`}</dd>
          </div>
        </dl>
      </header>
      <div className="cc-plot">
        {ready ? (
          <LiveCurve
            key={tf}
            stage
            s={s}
            history={history}
            node={tf}
            header={false}
            plan={flat}
            signal={c.signal}
            ground="var(--color-card)"
            height="100%"
            span={{ past: 6, future: 12, narrow: { past: 3, future: 6 } }}
            legend="above"
            minPlot="7rem"
            planSrc={`flatten:${tf}`}
          />
        ) : (
          <p className="cc-wait">Loading the last 6 hours of {nice(tf)}</p>
        )}
      </div>
    </div>
  );
}
