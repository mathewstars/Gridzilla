// One line of the WHAT'S HAPPENING feed: grid time, who acted, what happened in plain words, the facts after it.
// Click opens the details (the advisor's reason, latency, guard verdict, the per-slot limits as a sparkline).
// The only motion in the feed: a new row slides in (0.25 s ease-out).
import { Fragment, memo } from "react";
import { motion } from "motion/react";
import { Broadcast, CloudSun, House, Lightning, Moon, Sparkle, Stack, User, Warning } from "@phosphor-icons/react";
import { MODE_WORDS, hhmm, nice } from "../../model";
import { details, explain, type Actor, type FeedRowData } from "./events";
import type { Envelope } from "../../api";

const ICON: Record<Actor, typeof Sparkle> = {
  ai: Sparkle,
  operator: User,
  signal: Broadcast,
  plan: Stack,
  house: House,
  scenario: CloudSun,
  dark: Moon,
  system: Lightning,
};
const WHO: Record<Actor, string> = {
  ai: "AI",
  operator: "Operator",
  signal: "Signal",
  plan: "Diet plan",
  house: "House",
  scenario: "Scenario",
  dark: "Fail-safe",
  system: "Platform",
};

function Mode({ code }: { code: string }) {
  const title = MODE_WORDS[code]?.title ?? nice(code.toLowerCase());
  return (
    <span className="feed-mode">
      {title}
      <span className="feed-code">{code}</span>
    </span>
  );
}

function FeedRow({ e, open, onToggle }: { e: FeedRowData; open: boolean; onToggle: () => void }) {
  const Icon = e.tone === "bad" ? Warning : ICON[e.actor];
  const rows = open ? details(e) : [];
  return (
    <motion.li
      className={`feed-row tone-${e.tone}${open ? " is-open" : ""}`}
      initial={e.fresh ? { opacity: 0, y: -10 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0, 0, 0.5, 1] }}
      data-feed-id={e.id}
    >
      <button type="button" className="feed-line" onClick={onToggle} aria-expanded={open} title={explain(e)} data-tip={explain(e)}>
        <time className="feed-time" aria-label={`Grid time ${e.time}, real ${new Date(e.t).toLocaleTimeString("en-GB")}`}>
          {e.time}
        </time>
        <span className="feed-icon" title={WHO[e.actor]} aria-hidden>
          <Icon size={12} weight="bold" />
        </span>
        <span className="feed-text">
          <span className="feed-head">
            {e.head.map((p, i) => (typeof p === "string" ? <span key={i}>{p}</span> : <Mode key={i} code={p.mode} />))}
          </span>
          {e.meta.length > 0 && (
            <span className="feed-meta">
              {e.meta.map((m, i) => (
                <Fragment key={i}>
                  {i > 0 && " "}
                  <span className={`${m.length < 36 ? "nw" : ""}${i === 0 && (e.tone === "bad" || e.tone === "wait") ? " feed-meta-key" : ""}`}>{m}</span>
                </Fragment>
              ))}
            </span>
          )}
        </span>
        <svg className="feed-chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="M3 2l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="feed-detail">
          <dl>
            {rows.map((r) => (
              <div key={r.k} className={r.tone === "bad" ? "tone-bad-text" : undefined}>
                <dt>{r.k}</dt>
                <dd>{r.v}</dd>
              </div>
            ))}
            {!rows.length && (
              <div>
                <dt>Details</dt>
                <dd>Nothing more was recorded for this line.</dd>
              </div>
            )}
          </dl>
          {e.envelope && <EnvSpark env={e.envelope} />}
        </div>
      )}
    </motion.li>
  );
}

/** The per-slot limits each house got, as a tiny line: import ceiling solid, export ceiling dashed. */
function EnvSpark({ env }: { env: Envelope }) {
  const imp = env.import_max_kw ?? [];
  const exp = env.export_max_kw ?? [];
  const n = Math.max(imp.length, exp.length);
  if (n < 2) return null;
  const vals = [...imp, ...exp];
  // auto range around the values (a sparkline shows the shape; the kW numbers sit beside it)
  const hi = Math.max(...vals);
  const lo = Math.min(...vals);
  const padv = Math.max((hi - lo) * 0.2, 0.2);
  const max = hi + padv;
  const min = Math.max(0, lo - padv);
  const W = 160,
    H = 34,
    pad = 3;
  const x = (i: number) => pad + (i * (W - 2 * pad)) / (n - 1);
  const y = (v: number) => H - pad - ((v - min) * (H - 2 * pad)) / Math.max(0.1, max - min);
  const line = (a: number[]) => a.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const kw = (v: number) => `${+v.toFixed(1)} kW`;
  const end = hhmm(env.start_sim_h + (n * env.slot_sim_min) / 60);
  return (
    <div className="feed-env">
      <div className="feed-env-label">
        Allowed box per house <span className="feed-code">envelope</span>: {n} time slots of {env.slot_sim_min} min, {hhmm(env.start_sim_h)} to {end}
      </div>
      <div className="feed-env-row">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="feed-env-svg" role="img" aria-label="Per-slot limit per house">
          {imp.length > 1 && <path d={line(imp)} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />}
          {exp.length > 1 && <path d={line(exp)} fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2.5" opacity="0.7" />}
        </svg>
        <div className="feed-env-nums">
          {imp.length > 0 && (
            <span>
              from grid {kw(imp[0])} → {kw(imp[imp.length - 1])}
            </span>
          )}
          {exp.length > 0 && (
            <span>
              to street {kw(exp[0])} → {kw(exp[exp.length - 1])}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(FeedRow, (a, b) => a.e === b.e && a.open === b.open);
