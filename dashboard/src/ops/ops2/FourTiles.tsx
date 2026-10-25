// Dad's four decision tiles (board, Presentation tab), as four big readable cards in a 2x2 grid: what the AI saw, what
// it chose, the rule check, the signed message; plus his "next review in N s" countdown. The tile of the step running
// right now (autopilot.stage while busy) is lit. Every live number carries data-src/data-val (qa/README.md).
import { useLayoutEffect, useRef, type ReactNode } from "react";
import type { Decision, Proposal, State } from "../../api";
import { hhmm, nice } from "../../model";
import { cleanText, modeTitle, plainReason, sentences, worstOf } from "../../components/brain/plain";
import { useNow } from "../control/ui";
import type { Ops } from "../useOps";
import "./tiles.css";

const STEP: Record<string, number> = { sense: 0, deepseek: 1, guard: 2, send: 3 };
const fmt = (v: number) => v.toLocaleString("en-US");

/** A number on screen and where it comes from. */
function N({ src, val, from, scale, children }: { src: string; val?: number | null; from?: string; scale?: number; children: ReactNode }) {
  return (
    <span data-src={src} data-from={from} data-val={val != null ? String(val) : undefined} data-scale={scale != null && scale !== 1 ? String(scale) : undefined}>
      {children}
    </span>
  );
}

/** One screen gives each tile a fixed cell: when its words do not fit, it drops its detail step by step (data-fit 1: the
 *  AI's reasoning, 2: the replies line, 3: every text line), so nothing ever runs over the next tile. Measured after each
 *  render and on resize; elsewhere the tiles grow with their text and stay at 0. */
function useFit() {
  const ref = useRef<HTMLDivElement>(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    let k = 0;
    el.dataset.fit = "0";
    while (el.scrollHeight > el.clientHeight + 1 && k < 3) el.dataset.fit = String(++k);
  };
  useLayoutEffect(fit);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return ref;
}

function Tile({ n, label, now, tone, value, children }: { n: number; label: string; now: boolean; tone?: "bad" | "wait"; value: ReactNode; children?: ReactNode }) {
  const ref = useFit();
  return (
    <div ref={ref} className={`ft-tile${now ? " is-now" : ""}${tone ? ` is-${tone}` : ""}`} aria-current={now ? "step" : undefined}>
      <div className="ft-label">
        <span className="ft-n" aria-hidden data-src="axis">{n}</span>
        <span>{label}</span>
        {now && <span className="ft-live">running now</span>}
      </div>
      <div className="ft-value">{value}</div>
      {children && <div className="ft-text" data-src="state/autopilot">{children}</div>}
    </div>
  );
}

/** Tile 1: the trigger, as its worst forecast %. */
function Saw({ s, d, src }: { s: State; d: Decision | Proposal | null; src: string }) {
  const ap = s.autopilot;
  const trig = d ? ("trigger" in d ? d.trigger : d.situation) : null;
  const rel = trig?.match(/on (\S+) is active but every transformer under it is forecast below (\d+) %/);
  if (rel)
    return (
      <>
        <div className="ft-big ft-words">Peak is over</div>
        <div className="ft-text" data-src="state/autopilot">
          Every transformer under {nice(rel[1])} stays below <N src={ap.release_pct === +rel[2] ? "state/autopilot/release_pct" : src} val={ap.release_pct === +rel[2] ? ap.release_pct : undefined}>{rel[2]}</N>&nbsp;% of its limit
        </div>
      </>
    );
  const w = worstOf(trig);
  if (w)
    return (
      <>
        <div className="ft-big">
          <N src={src}>{Math.abs(w.pct)}</N>&nbsp;%
        </div>
        <div className="ft-text" data-src="state/autopilot">
          {w.pct < 0 ? "Sending back, forecast" : "Forecast"} on {nice(w.tf)} at <N src={src}>{w.at}</N>
          {w.others > 0 ? `, and ${w.others} more` : ""}
        </div>
      </>
    );
  const t = ap.target;
  if (t?.worst)
    return (
      <>
        <div className="ft-big">
          <N src="state/autopilot/target/worst_pct" val={t.worst_pct}>{Math.round(Math.abs(t.worst_pct))}</N>&nbsp;%
        </div>
        <div className="ft-text" data-src="state/autopilot">
          Forecast on {nice(t.worst)} at <N src="state/autopilot/target/worst_at_h">{hhmm(t.worst_at_h)}</N>
        </div>
      </>
    );
  return (
    <>
      <div className="ft-big">All calm</div>
      <div className="ft-text" data-src="state/autopilot">
        No transformer forecast past <N src="state/autopilot/trigger_pct" val={ap.trigger_pct}>{ap.trigger_pct}</N>&nbsp;% of its limit
      </div>
    </>
  );
}

/** The first one or two sentences of the AI's reasoning, never cut mid-word. */
function shortWhy(t: string | null | undefined) {
  const all = sentences(cleanText(t));
  let out = "";
  for (const x of all) {
    if (out && (out + " " + x).length > 170) break;
    out = out ? `${out} ${x}` : x;
  }
  return out;
}

const VERDICT: Record<string, { word: string; tone?: "bad" | "wait" }> = {
  sent: { word: "Allowed" },
  held: { word: "Held back", tone: "wait" },
  refused: { word: "Refused", tone: "bad" },
  error: { word: "AI error", tone: "bad" },
  none: { word: "Nothing to check" },
  pending: { word: "Waiting for you", tone: "wait" },
  rejected: { word: "Rejected by you", tone: "wait" },
  expired: { word: "Expired", tone: "wait" },
};

export default function FourTiles({ ops }: { ops: Ops }) {
  const now = useNow();
  const s = ops.s as State;
  const ap = s.autopilot;
  const hist = ap.history ?? [];
  const p = ap.pending;
  const last = hist[0] ?? null;
  // A proposal waiting for a yes is the newest decision; otherwise the latest one in the history.
  const d: Decision | Proposal | null = p ?? last;
  const dSrc = p ? "state/autopilot/pending" : "state/autopilot/history/0";
  const sentI = hist.findIndex((x) => x.verdict === "sent" && x.seq != null);
  const sent = sentI >= 0 ? hist[sentI] : null;
  const lit = ap.busy ? STEP[ap.stage] ?? -1 : -1;

  // countdown to the next review (dad: interval_s - seconds since last_run)
  const nextS = ap.last_run ? Math.max(0, Math.ceil(ap.interval_s - (now - Date.parse(ap.last_run)) / 1000)) : null;

  // tile 3: the rule check
  const verdict = p ? (p.guard ? "refused" : "pending") : last?.verdict ?? null;
  const v = verdict ? VERDICT[verdict] : null;
  const reason = p ? (p.guard ? plainReason(p.guard, p.mode) : "Within the rules. It needs your yes to go out.") : last?.detail ? plainReason(last.detail, last.mode) : last ? "Within the rules: time window, depth, how often, how much power back" : null;

  // tile 4: the signed message and the homes' replies (households on screen that answered this seq)
  const homes = sent?.segment ? s.aggregates[sent.segment]?.online ?? null : null;
  const applied = sent?.segment ? s.aggregates[sent.segment]?.applied ?? null : null;
  const ratio = s.summary?.households ? s.summary.houses / s.summary.households : 1;
  const replies = sent ? Object.values(s.households ?? {}).filter((h) => h.ack?.seq === sent.seq) : [];
  const cnt = (st: string) => replies.filter((h) => h.ack?.status === st).length;
  const from = (st: string) => `count(state/households/*[ack/seq = ${sent?.seq} and ack/status = ${st}])`;

  const mode = d?.mode ?? null;
  const why = shortWhy(d?.rationale);

  return (
    <section className="panel ft" aria-label="The AI's last decision, step by step">
      <header className="ft-head">
        <h2 className="ft-title" title={ap.mode === "auto" ? "Autopilot on Auto: the AI sends by itself, inside the rules" : ap.mode === "propose" ? "Autopilot on Propose: the AI asks you before it sends" : "Autopilot is off"}>What the AI did</h2>
        <div className="ft-count" aria-live="off">
          <span className="ft-count-l">Next review in</span>
          <span className="ft-count-v">
            {ap.mode === "off" ? "off" : ap.busy ? "now" : nextS == null ? "soon" : (
              <>
                <N src="state/autopilot/last_run">{nextS}</N>
                <span className="ft-unit">&nbsp;s</span>
              </>
            )}
          </span>
        </div>
      </header>
      <div className="ft-grid">
        <Tile n={1} label="What the AI saw" now={lit === 0} value={<Saw s={s} d={d} src={p ? `${dSrc}/situation` : `${dSrc}/trigger`} />} />
        <Tile
          n={2}
          label="What it chose"
          now={lit === 1}
          value={
            <>
              <div className="ft-big ft-words">{mode ? modeTitle(mode) : d ? "Nothing to do" : "Waiting"}</div>
              {d?.segment && <div className="ft-text ft-strong">on {nice(d.segment)}</div>}
            </>
          }
        >
          {why ? <p className="ft-why" data-src="state/autopilot">{why}</p> : !d ? "The first review has not run yet" : null}
        </Tile>
        <Tile n={3} label="Rule check" now={lit === 2} tone={v?.tone} value={<div className="ft-big ft-words">{v?.word ?? "Waiting"}</div>}>
          {reason}
        </Tile>
        <Tile
          n={4}
          label="Signed message"
          now={lit === 3}
          value={
            <div className="ft-big">
              {sent ? (
                <>
                  #<N src={`state/autopilot/history/${sentI}/seq`} val={sent.seq}>{sent.seq}</N>
                </>
              ) : (
                "None yet"
              )}
            </div>
          }
        >
          {sent && (
            <>
              <div>
                {modeTitle(sent.mode)} on {nice(sent.segment)}
                {homes ? (
                  <>
                    , <N src={`state/aggregates/${sent.segment}/online`} val={homes} scale={ratio}>{fmt(Math.round(homes * ratio))}</N> homes
                  </>
                ) : null}
              </div>
              <div className="ft-acks ft-detail">
                {applied != null && homes ? (
                  <span>
                    <N src={`state/aggregates/${sent.segment}/applied`} val={applied} scale={ratio}>{fmt(Math.round(applied * ratio))}</N> applied
                  </span>
                ) : null}
                {cnt("partial") > 0 && <span><N src="derived" from={from("partial")} val={cnt("partial")}>{cnt("partial")}</N> partly</span>}
                {cnt("refused") > 0 && <span className="ft-red"><N src="derived" from={from("refused")} val={cnt("refused")}>{cnt("refused")}</N> refused</span>}
                {applied == null && !replies.length && "Waiting for the homes to reply"}
              </div>
            </>
          )}
        </Tile>
      </div>
    </section>
  );
}
