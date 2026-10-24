// The feed as a strip: the three newest events, one line each with the grid time. The full history is in Log.
import type { Ops } from "../useOps";
import { explain, useFeed } from "../feed/events";
import { tip } from "../views/fmt";
import { MODE_WORDS } from "../../model";
import "./now.css";

export default function FeedStrip({ ops }: { ops: Ops }) {
  const feed = useFeed(ops.s, ops.history);
  // an event whose clock time is later than the grid clock happened on the previous grid day
  const now = ops.s ? ((ops.s.sim_hour % 24) + 24) % 24 : 0;
  const yday = (t: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
    return !!m && +m[1] + +m[2] / 60 > now + 0.02;
  };
  if (!feed) return null;
  const rows = feed.rows.slice(0, 3);
  return (
    <section className="panel fstrip" aria-label="What just happened">
      <header className="fstrip-head">
        <h2 className="now-title" {...tip("What just happened: the newest signed signals, AI decisions and house replies, newest first")}>What just happened</h2>
        <a className="fstrip-all" href="#/log">All events</a>
      </header>
      <ol className="fstrip-list">
        {rows.length === 0 && <li className="fstrip-row fstrip-quiet">Listening to the grid. The first event shows up here.</li>}
        {rows.map((e) => (
          <li key={e.id} className={`fstrip-row tone-${e.tone}`} {...tip(explain(e))}>
            <time className="fstrip-time" aria-label={`grid time ${yday(e.time) ? "yesterday " : ""}${e.time}`}>
              {yday(e.time) && <span className="fstrip-day">yesterday </span>}
              {e.time}
            </time>
            <span className="fstrip-text">
              {e.head.map((p, i) => (typeof p === "string" ? <span key={i}>{p}</span> : <span key={i}>{MODE_WORDS[p.mode]?.title ?? p.mode}</span>))}
              {e.meta.length > 0 && <span className="fstrip-meta"> · {e.meta.join(" · ")}</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
