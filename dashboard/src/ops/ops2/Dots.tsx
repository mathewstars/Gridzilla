// The whole city as a strip of coloured dots, grouped by substation: colour only, the number on hover / tap. Used on
// Operations and in demo mode instead of the 72-tile grid (which lives in the City view).
import type { State } from "../../api";
import { nice } from "../../model";
import { cityGroups } from "../city/cityData";
import { loadTone } from "../../stage/palette";
import type { Ops } from "../useOps";

export default function CityDots({ s, ops, selected, onPick }: { s: State; ops: Ops; selected: string; onPick: (tf: string) => void }) {
  const groups = cityGroups(s, ops.city);
  return (
    <section className="panel demo-city" aria-label="Every street transformer in the city">
      {groups.map((g) => (
        <div key={g.id} className="demo-sub">
          <span className="demo-sub-name">{nice(g.id)}</span>
          <span className="demo-dots">
            {g.feeders.flatMap((f) => f.tfs).map((c) => {
              const p = c.pct == null ? null : Math.round(c.pct);
              const words = p == null ? "no reading" : `${p < 0 ? "exporting" : "taking"} ${Math.abs(p)} % of its limit`;
              return (
                <button key={c.id} type="button" className={`demo-dot${c.id === selected ? " is-sel" : ""}`} style={{ background: loadTone(c.pct) }} title={`${nice(c.id)}: ${words}`} aria-label={`${nice(c.id)}, ${words}`} onClick={() => onPick(c.id)} />
              );
            })}
          </span>
        </div>
      ))}
    </section>
  );
}
