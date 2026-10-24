// The feed as a strip: the three newest events, one line each with the grid time. The full history is in Log.
import type { Ops } from "../useOps";
import { explain, useFeed } from "../feed/events";
import { tip } from "../views/fmt";
import { MODE_WORDS } from "../../model";
import "./now.css";

export default function FeedStrip({ ops }: { ops: Ops }) {
  const feed = useFeed(ops.s, ops.history);
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
            <time className="fstrip-time" aria-label={`grid time ${e.time}`}>{e.time}</time>
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
