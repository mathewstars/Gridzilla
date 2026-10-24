// WHAT'S HAPPENING (ops.md, middle column): the live event feed, newest on top, with live counts in a compact header.
import { useState } from "react";
import type { Ops } from "../useOps";
import { useFeed } from "../feed/events";
import FeedRow from "../feed/FeedRow";
import "@fontsource-variable/geist-mono";
import "../feed/feed.css";

const PAGE = 40;

export default function FeedColumn({ ops }: { ops: Ops }) {
  const feed = useFeed(ops.s, ops.history);
  const [open, setOpen] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  if (!feed) return null;
  const rows = feed.rows.slice(0, shown);
  const n = (v: number) => v.toLocaleString("en-US");
  return (
    <div className="panel feed" data-testid="feed">
      <header className="feed-top">
        <div className="feed-title">
          <span className={`feed-live${feed.dark ? " is-dark" : ""}`} aria-hidden />
          <h2>What's happening</h2>
          {feed.waiting && <span className="feed-badge tone-wait">Waiting for you</span>}
        </div>
        <dl className="feed-stats">
          <div>
            <dd>{n(feed.signals)}</dd>
            <dt>signals today</dt>
          </div>
          <div>
            <dd>{feed.dark ? "0" : n(feed.following)}</dd>
            <dt>houses following now</dt>
          </div>
          <div className={feed.refusals ? "tone-bad-text" : undefined}>
            <dd>{n(feed.refusals)}</dd>
            <dt>{feed.refusals === 1 ? "refusal" : "refusals"}</dt>
          </div>
        </dl>
      </header>
      {rows.length ? (
        <ol className="feed-list">
          {rows.map((e) => (
            <FeedRow key={e.id} e={e} open={open === e.id} onToggle={() => setOpen((o) => (o === e.id ? null : e.id))} />
          ))}
        </ol>
      ) : (
        <div className="feed-empty">Listening to the grid. The first event shows up here.</div>
      )}
      {feed.rows.length > shown && (
        <button type="button" className="feed-more" onClick={() => setShown((v) => v + PAGE)}>
          Show {Math.min(PAGE, feed.rows.length - shown)} older
        </button>
      )}
    </div>
  );
}
