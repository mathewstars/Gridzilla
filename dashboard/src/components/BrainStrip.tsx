// The AI decision card: what Gridzilla's autopilot just did, as four plain sentences a judge reads in seconds.
// Sees (the trigger + weather) -> Thinks (the advisor's reasoning) -> Checks (the policy guard) -> Acts (the signed signal
// and how many houses obeyed). No boxes, no icons, no motion: a step word turns ink once that step has happened.
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { post, type Autopilot, type Decision, type Proposal, type State, type WeatherFeed } from "../api";
import { headline, nice, outcome, plainTrigger } from "../model";
import { PanelTitle } from "./ui";
import { boxLine, cleanText, dur, modePlain, modeTitle, plainReason, sentences, weatherLine } from "./brain/plain";

const STAGE_IDX: Record<Autopilot["stage"], number> = { idle: -1, sense: 0, deepseek: 1, guard: 2, send: 3 };
const EASE = "transition-colors duration-[250ms] ease-[cubic-bezier(0,0,0.5,1)]";

/** Detail levels, most to least. The card steps down until everything fits its slot (never clipped, never "..."). */
const LEVELS = 5;
type Detail = { level: number };

/** Steps the detail level down while the content is taller than its box; starts again from full detail whenever the
 *  content or the box size changes. Runs before paint, so the viewer never sees the overflowing version. */
function useFitLevel(contentKey: string) {
  const box = useRef<HTMLDivElement>(null);
  const [level, setLevel] = useState(0);
  const [size, setSize] = useState("");
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect;
      setSize(`${Math.round(r.width)}x${Math.round(r.height)}`);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const seen = useRef("");
  useLayoutEffect(() => {
    const now = `${contentKey}#${size}`;
    if (seen.current !== now) {
      seen.current = now;
      if (level !== 0) return setLevel(0);
    }
    const el = box.current;
    if (el && level < LEVELS - 1 && el.scrollHeight > el.clientHeight + 1) setLevel(level + 1);
  });
  return [box, level] as const;
}

/** Shorten the advisor's reasoning at a full stop: as many whole sentences as the detail level allows. */
function shortReason(text: string, level: number) {
  const all = sentences(text);
  const n = level === 0 ? 3 : level === 1 ? 2 : 1;
  return all.slice(0, n).join(" ");
}

// ------------------------------------------------------------------ one step
// Layout by the card's own width: a phone stacks word over sentence, the 1440 board slot runs four rows with the word
// on the left, a wide slot (2560 projector) shows four columns.
function Step({ word, on, children }: { word: string; on: boolean; children: ReactNode }) {
  return (
    <section className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-1 @[26rem]:grid-cols-[5.25rem_minmax(0,1fr)] @[26rem]:items-baseline @[40rem]:grid-cols-1 @[40rem]:content-start">
      <h3 className={`t-title ${EASE} ${on ? "text-ink" : "text-tertiary"}`}>{word}</h3>
      <div className="flex min-w-0 flex-col gap-1 @[40rem]:pt-0.5">{children}</div>
    </section>
  );
}

const Body = ({ children, dim, d }: { children: ReactNode; dim?: boolean; d: Detail }) => (
  <p className={`${d.level >= 4 ? "text-[0.9375rem] leading-[1.4] tracking-[-0.016em]" : "t-body"} ${dim ? "text-secondary" : "text-ink"}`}>{children}</p>
);

/** End a sentence with a full stop when the platform's text has none. */
const stop = (t: string) => (/[.!?]$/.test(t) ? t : `${t}.`);

const Small = ({ children, red }: { children: ReactNode; red?: boolean }) => (
  <p className={`t-small ${red ? "!text-red" : ""}`}>{children}</p>
);

// ------------------------------------------------------------------ the four steps
function Sees({ s, trigger, weather, ids, d, idle, looking }: {
  s: State;
  trigger: string | null | undefined;
  weather: WeatherFeed;
  ids: string[];
  d: Detail;
  idle: boolean;
  looking: boolean;
}) {
  const sentence = cleanText(plainTrigger(trigger), ids);
  const ctx = s.autopilot.context?.trim();
  const warn = weather.available ? weather.data?.warnings?.[0] : undefined;
  const wx = weatherLine(weather);
  return (
    <>
      {looking ? (
        <Body d={d}>Reading every transformer's forecast for the next {s.autopilot.horizon_min ?? 90} minutes.</Body>
      ) : sentence && !idle ? (
        <Body d={d}>{stop(d.level >= 3 ? sentence.replace(/\s*\([^)]*\)\.?$/, "") : sentence)}</Body>
      ) : (
        <Body d={d} dim>
          It reads every transformer's forecast every few seconds.
        </Body>
      )}
      {ctx && d.level < 2 && <Small>Operator note: {stop(ctx)}</Small>}
      {warn && d.level < 2 && <Small red>Official warning: {stop(warn.title)}</Small>}
      {wx && d.level < 1 && <Small>{wx}.</Small>}
    </>
  );
}

function Thinks({ s, dec, asking, ids, d }: { s: State; dec: Decision | undefined; asking: boolean; ids: string[]; d: Detail }) {
  if (!s.llm)
    return (
      <Body d={d} dim>
        The AI is not connected; the grid runs on its own limits.
      </Body>
    );
  if (asking) return <Body d={d}>Asking the advisor what to do now.</Body>;
  if (!dec)
    return (
      <Body d={d} dim>
        The advisor is only asked when a transformer heads for its limit.
      </Body>
    );
  if (dec.verdict === "error")
    return (
      <>
        <Body d={d}>The advisor gave no answer, so nothing was sent. It tries again on the next check.</Body>
        {d.level < 3 && <p className="t-caption">{cleanText(dec.detail, ids)}</p>}
      </>
    );
  const why = cleanText(dec.rationale, ids);
  const sec = dec.latency_ms != null ? dec.latency_ms / 1000 : null;
  return (
    <>
      <Body d={d}>
        {why ? shortReason(why, d.level) : "The advisor gave no reason."}
        {sec != null && d.level < 3 && (
          <span className="t-caption whitespace-nowrap tabular-nums"> answered in {sec < 10 ? sec.toFixed(1) : Math.round(sec)} s</span>
        )}
      </Body>
    </>
  );
}

function Checks({ dec, checking, pendingWhy, d }: { dec: Decision | undefined; checking: boolean; pendingWhy: string | null; d: Detail }) {
  if (checking) return <Body d={d}>Checking the proposal against the safety rules.</Body>;
  if (!dec || dec.verdict === "none" || dec.verdict === "error")
    return (
      <Body d={d} dim>
        {!dec
          ? "Every proposal must pass fixed safety rules before it is signed."
          : dec.verdict === "none"
            ? "Nothing to check: the advisor suggested no action."
            : "Nothing to check: no proposal came back."}
      </Body>
    );
  const v = dec.verdict;
  const reason = plainReason(dec.detail, dec.mode);
  const [word, rest] =
    v === "sent"
      ? ["Allowed", dec.detail === "operator approved" ? "inside every safety rule, approved by the operator." : "inside every safety rule."]
      : v === "pending"
        ? ["Allowed", d.level >= 3 ? "inside every safety rule." : `inside every safety rule. ${pendingWhy ?? "A person must approve it first"}.`]
        : v === "refused"
          ? ["Refused", `${reason ?? "it broke a safety rule"}.`]
          : v === "held"
            ? ["Held back", `${reason ?? "the rules say wait"}.`]
            : v === "rejected"
              ? ["Rejected", "the operator said no. Nothing was sent."]
              : ["Expired", "nobody approved it in time. Nothing was sent."];
  return (
    <>
      <Body d={d}>
        <span className={`font-semibold ${v === "refused" ? "text-red" : ""}`}>{word}:</span> {rest.replace(/\.\.$/, ".")}
      </Body>
      {v === "sent" && dec.seq != null && d.level < 3 && <p className="t-caption tabular-nums">Signed by the policy guard as signal {dec.seq}</p>}
    </>
  );
}

/** "140 of 140 houses obeyed", the numbers big. */
function Count({ n, of, label, d }: { n: number; of: number; label: string; d: Detail }) {
  if (d.level >= 4)
    return (
      <p className="text-[0.9375rem] leading-[1.4] tracking-[-0.016em] tabular-nums text-ink">
        <span className="font-semibold">{n}</span> of {of} {label}.
      </p>
    );
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <span className={`${d.level >= 3 ? "t-headline tabular-nums" : "t-num"} text-ink`}>{n}</span>
      <span className="t-title whitespace-nowrap tabular-nums text-secondary">of {of}</span>
      <span className="t-small">{label}</span>
    </div>
  );
}

function SentOutcome({ s, dec, d }: { s: State; dec: Decision; d: Detail }) {
  const o = outcome(s, dec);
  const live = dec.segment ? s.active[dec.segment]?.seq === dec.seq : false;
  const release = dec.mode === "RELEASE";
  const box = boxLine(dec.envelope, dec.fields);
  return (
    <>
      <Body d={d}>
        {release ? "Hand control back to the owners" : modeTitle(dec.mode)} on {nice(dec.segment)}
        {dec.duration_min && !release ? ` for ${dur(dec.duration_min)}` : ""}.
      </Body>
      {o && o.total > 0 ? (
        release ? (
          <Count n={o.ended + o.obeyed} of={o.total} label="houses back to their owners' settings" d={d} />
        ) : (
          <Count
            n={o.obeyed}
            of={o.total}
            label={`houses obeyed${o.partial ? `, ${o.partial} partly` : ""}${o.refused ? `, ${o.refused} said no` : ""}`}
            d={d}
          />
        )
      ) : (
        <Small>{live ? "Signed and sent. Waiting for the houses to confirm." : "Signed and sent to every house there."}</Small>
      )}
      {box && !release && d.level < 1 && <Small>Allowed box: {box.replace(/^Up to/, "up to")}.</Small>}
    </>
  );
}

/** Approve / Reject for a proposal that waits for a person. The buttons sit in the card's header so they are never
 *  squeezed out; the outcome line shows under Acts. */
function useApproval(pendingAt: string | undefined) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [forAt, setForAt] = useState(pendingAt);
  if (forAt !== pendingAt) {
    setForAt(pendingAt);
    setErr(null);
    if (pendingAt) setDone(null);
  }
  const act = async (what: "approve" | "reject") => {
    setBusy(what);
    setErr(null);
    try {
      await post(`autopilot/${what}`);
      setDone(what === "approve" ? "Approved. Signing and sending now." : "Rejected. Nothing was sent.");
    } catch (e) {
      setErr(plainReason((e as Error).message) ?? "Could not reach the platform");
    } finally {
      setBusy(null);
    }
  };
  return { busy, err, done, act };
}
type Approval = ReturnType<typeof useApproval>;

function ApproveButtons({ a }: { a: Approval }) {
  return (
    <div className="flex shrink-0 gap-2">
      <button className="btn btn-primary" disabled={!!a.busy} onClick={() => a.act("approve")}>
        {a.busy === "approve" ? "Approving" : "Approve"}
      </button>
      <button className="btn" disabled={!!a.busy} onClick={() => a.act("reject")}>
        {a.busy === "reject" ? "Rejecting" : "Reject"}
      </button>
    </div>
  );
}

function Waiting({ p, a, d }: { p: Proposal; a: Approval; d: Detail }) {
  return (
    <>
      <Body d={d}>
        {modeTitle(p.mode)} on {nice(p.segment)}
        {p.duration_min ? ` for ${dur(p.duration_min)}` : ""}, once you say yes.
      </Body>
      {a.done && <Small>{a.done}</Small>}
      {a.err && <Small>Did not go through: {stop(a.err)}</Small>}
    </>
  );
}

function Acts({ s, dec, lastSent, pending, approval, sending, fresh, d }: {
  s: State;
  dec: Decision | undefined;
  lastSent: Decision | undefined;
  pending: Proposal | null;
  approval: Approval;
  sending: boolean;
  fresh: boolean;
  d: Detail;
}) {
  if (pending) return <Waiting p={pending} a={approval} d={d} />;
  if (sending) return <Body d={d}>Signing the signal and sending it to the houses.</Body>;
  if (dec?.verdict === "sent") return <SentOutcome s={s} dec={dec} d={d} />;
  // Nothing new went out: show the signal that is still working, if any.
  const live = lastSent?.segment && s.active[lastSent.segment]?.seq === lastSent.seq ? lastSent : undefined;
  const o = live ? outcome(s, live) : null;
  const running = Object.keys(s.active ?? {}).length;
  const hl = !live && running ? headline(s) : null;
  return (
    <>
      <Body d={d} dim>
        {live
          ? `${fresh ? "" : "Nothing new. "}The "${modeTitle(live.mode)}" signal on ${nice(live.segment)} is still running.`
          : running
            ? `${fresh ? "" : "Nothing new. "}${running} earlier signal${running === 1 ? " is" : "s are"} still running.`
            : dec && !fresh
              ? "Nothing new sent. Houses run as their owners set them."
              : "No signal yet. Houses run as their owners set them."}
      </Body>
      {o && o.total > 0 && <Count n={o.obeyed} of={o.total} label="houses obeying" d={d} />}
      {hl && hl.under > 0 && <Count n={hl.obeying} of={hl.under} label="houses obeying" d={d} />}
    </>
  );
}

// ------------------------------------------------------------------ the card
function statusOf(s: State, liveIdx: number) {
  const ap = s.autopilot;
  if (!s.llm) return "The AI is not connected";
  if (ap.mode === "off") return "Autopilot is off, nothing is sent on its own";
  if (ap.pending) return "Waiting for your OK";
  if (liveIdx >= 0) return ["Looking at the grid", "Asking the advisor", "Checking the safety rules", "Signing and sending"][liveIdx];
  return "Watching the grid";
}

export default function BrainStrip({ s, weather }: { s: State; weather: WeatherFeed }) {
  const ap = s.autopilot;
  const hist = ap.history ?? []; // newest first (platform appendleft)
  const latest = hist[0];
  const ids = Object.keys(s.tree);
  const liveIdx = ap.busy ? STAGE_IDX[ap.stage] ?? -1 : -1;
  // While a new cycle runs, steps it has not reached yet stay grey and say nothing about the old decision.
  const fresh = liveIdx >= 0 && !ap.pending;
  const reached = (i: number) => (fresh ? i <= liveIdx : !!latest || i === 0);
  const pendingWhy = ap.pending ? plainReason(hist.find((h) => h.verdict === "pending")?.detail, ap.pending.mode) : null;
  const lastSent = hist.find((h) => h.verdict === "sent");
  const trigger = fresh && liveIdx >= 1 ? ap.last_trigger : latest?.trigger;
  const idle = !latest && !fresh;

  const approval = useApproval(ap.pending?.at ?? undefined);
  const key = [latest?.at, latest?.verdict, ap.pending?.at, liveIdx, s.llm, ap.mode, weather.available, Object.keys(s.active).length].join("|");
  const [box, level] = useFitLevel(`${key}|${approval.done}|${approval.err}`);
  const d = { level };

  return (
    <div className="panel flex h-full min-h-0 flex-col gap-3.5 p-5 lg:p-6">
      <PanelTitle
        title="How the AI decides"
        tech={ap.pending && !approval.done ? "Waiting for your OK" : undefined}
        right={
          ap.pending && !approval.done ? (
            <ApproveButtons a={approval} />
          ) : (
            <span className="t-small whitespace-nowrap pt-1">{statusOf(s, liveIdx)}</span>
          )
        }
      />
      <div
        ref={box}
        className="@container scroll-thin min-h-0 flex-1 overflow-y-auto"
      >
        <div
          className={`grid grid-cols-1 gap-y-4 @[40rem]:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] @[40rem]:gap-x-8 ${
            level >= 3 ? "@[26rem]:gap-y-1" : "@[26rem]:gap-y-2.5"
          }`}
        >
          <Step word="Sees" on={reached(0)}>
            <Sees s={s} trigger={trigger} weather={weather} ids={ids} d={d} idle={idle} looking={fresh && liveIdx === 0} />
          </Step>
          <Step word="Thinks" on={reached(1) && s.llm}>
            <Thinks s={s} dec={fresh ? undefined : latest} asking={fresh && liveIdx === 1} ids={ids} d={d} />
          </Step>
          <Step word="Checks" on={reached(2) && !!latest && latest.verdict !== "none" && latest.verdict !== "error"}>
            <Checks dec={fresh ? undefined : latest} checking={fresh && liveIdx === 2} pendingWhy={pendingWhy} d={d} />
          </Step>
          <Step word="Acts" on={reached(3) && (fresh || !!ap.pending || latest?.verdict === "sent")}>
            <Acts s={s} dec={fresh ? undefined : latest} lastSent={lastSent} pending={ap.pending} approval={approval} sending={fresh && liveIdx === 3} fresh={fresh} d={d} />
          </Step>
        </div>
      </div>
      <span className="sr-only">{ap.pending ? `Proposal waiting: ${modeTitle(ap.pending.mode)} on ${nice(ap.pending.segment)}. ${modePlain(ap.pending.mode)}` : ""}</span>
    </div>
  );
}
