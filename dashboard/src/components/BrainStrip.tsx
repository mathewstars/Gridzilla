// The AI brain strip: what Gridzilla's DeepSeek autopilot just did, as four steps a judge can follow in seconds.
// Sees (the trigger + weather) -> Thinks (DeepSeek's reasoning) -> Checks (the policy guard) -> Acts (the signed signal
// and how many houses obeyed). The live stage lights the matching step; every new decision replays the flow once.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Fragment, createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  Brain,
  Broadcast,
  CircleNotch,
  CloudSlash,
  CloudSun,
  Eye,
  Hourglass,
  ShieldCheck,
  ShieldWarning,
  Warning,
  type Icon,
} from "@phosphor-icons/react";
import { post, type Autopilot, type Decision, type Proposal, type State, type WeatherFeed } from "../api";
import { COLORS, headline, hhmm, loadColor, nice, outcome, plainTrigger } from "../model";
import { Segmented, Ticker } from "./ui";
import { VERDICT_WORD, boxLine, cleanText, dur, modePlain, modeTitle, plainReason, worstOf } from "./brain/plain";

type ApMode = Autopilot["mode"];
type StepState = "active" | "waiting" | "done";

const STAGE_IDX: Record<Autopilot["stage"], number> = { idle: -1, sense: 0, deepseek: 1, guard: 2, send: 3 };
const STEP_MS = 720;
const EASE = [0.16, 1, 0.3, 1] as const;

const SHADOW_BASE =
  "inset 0 1px 0 rgba(255,255,255,0.06), inset 0 0 0 1px rgba(255,255,255,0.05), 0 14px 30px -18px rgba(0,0,0,0.85)";
const SHADOW_LIT =
  "inset 0 1px 0 rgba(160,255,240,0.16), inset 0 0 0 1px rgba(51,225,201,0.6), 0 0 38px -8px rgba(51,225,201,0.55)";

/** How much room the strip has: compact = the short desktop board box, tall = a big screen or the solo view. */
type Fit = { compact: boolean; tall: boolean; lines: number; showTech: boolean };
const FitCtx = createContext<Fit>({ compact: false, tall: false, lines: 4, showTech: true });
const useFit = () => useContext(FitCtx);

// ------------------------------------------------------------------ small hooks
function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect;
      setBox((b) => (Math.abs(b.w - r.width) < 2 && Math.abs(b.h - r.height) < 2 ? b : { w: r.width, h: r.height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box] as const;
}

/** Replays Sees -> Thinks -> Checks -> Acts once whenever a new decision lands. Cards not reached yet keep the previous
 *  cycle's content, so the new story is revealed step by step. */
function useReplay(latest: Decision | undefined, reduce: boolean) {
  const key = latest ? `${latest.at}|${latest.verdict}|${latest.seq ?? ""}` : "";
  const prevKey = useRef(key);
  const prevDecision = useRef(latest);
  const [anim, setAnim] = useState<{ from: Decision | undefined; lit: number } | null>(null);
  useEffect(() => {
    if (key === prevKey.current) {
      prevDecision.current = latest;
      return;
    }
    const from = prevDecision.current;
    prevKey.current = key;
    prevDecision.current = latest;
    if (reduce || !key) {
      setAnim(null);
      return;
    }
    const timers = [0, 1, 2, 3].map((i) => window.setTimeout(() => setAnim({ from, lit: i }), i * STEP_MS));
    timers.push(window.setTimeout(() => setAnim(null), 4 * STEP_MS + 500));
    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reduce]);
  return anim;
}

// ------------------------------------------------------------------ building blocks
function Clamp({ lines, className, children, style }: { lines: number; className?: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <div className={className} style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: lines, overflow: "hidden", ...style }}>
      {children}
    </div>
  );
}

function Shimmer({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-[0.95rem] font-medium text-signal">
        <CircleNotch size={16} weight="bold" className="animate-spin" />
        {label}
      </div>
      {[92, 76, 84].map((w, i) => (
        <div key={i} className="relative h-2.5 overflow-hidden rounded-full bg-white/[0.06]" style={{ width: `${w}%` }}>
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-signal/25 to-transparent" style={{ animation: "sweep 1.4s ease-in-out infinite" }} />
        </div>
      ))}
    </div>
  );
}

function StepCard({
  icon: I, verb, tech, state, contentKey, children, reduce,
}: {
  icon: Icon;
  verb: string;
  tech: string;
  state: StepState;
  contentKey: string;
  children: ReactNode;
  reduce: boolean;
}) {
  const lit = state === "active";
  return (
    <motion.article
      className="relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[0.95rem] px-4 pb-3.5 pt-3"
      style={{ background: "linear-gradient(180deg, rgb(255 255 255 / 0.05), rgb(255 255 255 / 0) 42%), var(--color-deck-2)" }}
      initial={false}
      animate={{ opacity: state === "waiting" ? 0.4 : 1, boxShadow: lit ? SHADOW_LIT : SHADOW_BASE, y: lit && !reduce ? -2 : 0 }}
      transition={{ duration: reduce ? 0 : 0.4, ease: EASE }}
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-28"
        style={{ background: "radial-gradient(120% 100% at 30% 0%, rgb(51 225 201 / 0.2), transparent 70%)" }}
        initial={false}
        animate={{ opacity: lit ? 1 : 0 }}
        transition={{ duration: reduce ? 0 : 0.4 }}
      />
      <header className="relative flex items-center gap-2.5">
        <span
          className="grid size-7 shrink-0 place-items-center rounded-full transition-colors duration-300"
          style={{
            background: lit ? "rgb(51 225 201 / 0.18)" : "rgb(255 255 255 / 0.06)",
            color: lit ? COLORS.signal : "var(--color-dim)",
            boxShadow: lit ? "0 0 18px -2px rgb(51 225 201 / 0.6)" : "none",
          }}
        >
          <I size={15} weight={lit ? "fill" : "bold"} />
        </span>
        <span className="text-[0.98rem] font-semibold tracking-[-0.01em] text-fg">{verb}</span>
        {useFit().showTech && <span className="tech ml-auto truncate pl-1">{tech}</span>}
      </header>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={contentKey}
          className="relative mt-3 flex min-h-0 flex-1 flex-col"
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -4 }}
          transition={{ duration: 0.32, ease: EASE }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </motion.article>
  );
}

/** The glowing link between two steps. It fills with light when the flow passes through it. */
function Connector({ on, flow, vertical, reduce }: { on: boolean; flow: boolean; vertical: boolean; reduce: boolean }) {
  return (
    <div aria-hidden className={`relative flex items-center justify-center ${vertical ? "h-4 w-full" : "h-full w-full"}`}>
      <div className={`absolute rounded-full bg-white/[0.06] ${vertical ? "inset-y-0 left-1/2 w-[2px] -translate-x-1/2" : "inset-x-0 top-1/2 h-[2px] -translate-y-1/2"}`} />
      <motion.div
        className={`absolute rounded-full bg-signal ${vertical ? "inset-y-0 left-1/2 w-[2px] -translate-x-1/2" : "inset-x-0 top-1/2 h-[2px] -translate-y-1/2"}`}
        style={{ boxShadow: "0 0 10px 1px rgb(51 225 201 / 0.7)", transformOrigin: vertical ? "top" : "left" }}
        initial={false}
        animate={vertical ? { scaleY: on ? 1 : 0, opacity: flow ? 1 : on ? 0.45 : 0 } : { scaleX: on ? 1 : 0, opacity: flow ? 1 : on ? 0.45 : 0 }}
        transition={{ duration: reduce ? 0 : 0.45, ease: EASE }}
      />
      <motion.span
        className="relative size-2.5 rounded-full"
        initial={false}
        animate={{
          backgroundColor: on ? COLORS.signal : "#1d2838",
          boxShadow: flow ? "0 0 0 4px rgba(51,225,201,0.18), 0 0 16px 2px rgba(51,225,201,0.85)" : "0 0 0 3px rgba(5,8,13,1), 0 0 0px 0px rgba(51,225,201,0)",
          scale: flow && !reduce ? 1.25 : 1,
        }}
        transition={{ duration: reduce ? 0 : 0.35 }}
      />
    </div>
  );
}

function Hero({ children, color, className = "" }: { children: ReactNode; color?: string; className?: string }) {
  const fit = useFit();
  const size = fit.compact ? "text-[1.5rem]" : fit.tall ? "text-[2.5rem]" : "text-[1.85rem]";
  return (
    <div className={`num whitespace-nowrap font-semibold leading-none tracking-[-0.03em] ${size} ${className}`} style={{ color }}>
      {children}
    </div>
  );
}

const Placeholder = ({ title, sub }: { title: string; sub?: string }) => (
  <div className="flex flex-col gap-1.5">
    <div className="text-[1.05rem] font-semibold leading-snug text-fg/90">{title}</div>
    {sub && <div className="text-[0.86rem] leading-snug text-dim">{sub}</div>}
  </div>
);

function VerdictChip({ v }: { v: Decision["verdict"] }) {
  const tone =
    v === "sent"
      ? "bg-signal/15 text-signal shadow-[inset_0_0_0_1px_rgb(51_225_201/0.35)]"
      : v === "pending"
        ? "bg-signal/[0.07] text-signal/90 shadow-[inset_0_0_0_1px_rgb(51_225_201/0.25)]"
        : v === "none"
          ? "bg-white/[0.04] text-dim"
          : "bg-white/[0.08] text-fg/90 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]";
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.72rem] font-semibold ${tone}`}>{VERDICT_WORD[v] ?? v}</span>;
}

// ------------------------------------------------------------------ the four steps
function SeesBody({ s, trigger, weather, off }: { s: State; trigger: string | null | undefined; weather: WeatherFeed; off: boolean }) {
  const { compact, tall, lines } = useFit();
  const w = worstOf(trigger);
  const sentence = plainTrigger(trigger);
  const warns = weather.available ? weather.data?.warnings ?? [] : [];
  const ctx = s.autopilot.context?.trim();
  return (
    <>
      {off ? (
        <Placeholder title="Not watching" sub="The autopilot is off. Nothing is sent on its own." />
      ) : w ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-end gap-2.5">
            <Hero color={loadColor(w.pct)}>
              {Math.abs(w.pct)}
              <span className="text-[1.1rem]"> %</span>
            </Hero>
            <div className="min-w-0 pb-0.5 text-[0.82rem] leading-tight text-dim">
              <div className="truncate font-medium text-fg">{nice(w.tf)}</div>
              <div className="truncate">{compact ? "" : w.pct < 0 ? "backflow " : "of its limit "}by {w.at}</div>
            </div>
          </div>
          {compact ? (
            w.others > 0 && <div className="truncate text-[0.82rem] text-dim">+{w.others} more streets</div>
          ) : (
            <Clamp lines={Math.max(2, lines - 2)} className={`${tall ? "text-[1rem]" : "text-[0.88rem]"} leading-snug text-fg/80`}>
              {sentence}
              {w.others > 0 && <span className="text-dim">. {w.others} more transformers are heading over their limit too</span>}
            </Clamp>
          )}
        </div>
      ) : sentence ? (
        <Clamp lines={lines} className="text-[1rem] font-medium leading-snug text-fg">{sentence}</Clamp>
      ) : (
        <Placeholder title="Watching the grid" sub="Nothing to do yet. Every transformer is checked every few seconds." />
      )}
      <div className="mt-auto flex min-w-0 flex-col gap-1.5 pt-2.5">
        {ctx && (
          <div className="flex min-w-0 items-center gap-1.5 text-[0.8rem] text-fg">
            <Warning size={14} weight="fill" className="shrink-0 text-fg" />
            <span className="truncate">Operator: {ctx}</span>
          </div>
        )}
        {warns.slice(0, compact && ctx ? 0 : 1).map((x) => (
          <div key={x.title} className="flex min-w-0 items-center gap-1.5 text-[0.8rem] text-fg">
            <Warning size={14} weight="fill" className="shrink-0 text-fg" />
            <span className="truncate">{x.title}</span>
          </div>
        ))}
        {compact && (ctx || warns.length) ? null : weather.available && weather.data?.summary ? (
          <div className="flex min-w-0 items-start gap-1.5 text-[0.8rem] leading-snug text-dim">
            <CloudSun size={15} weight="bold" className="mt-px shrink-0" />
            <Clamp lines={lines >= 5 ? 2 : 1}>{weather.data.summary}</Clamp>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[0.8rem] text-faint">
            <CloudSlash size={15} weight="bold" className="shrink-0" />
            {weather.checking ? "Checking the weather feed" : "Weather offline"}
          </div>
        )}
      </div>
    </>
  );
}

function ThinksBody({ s, d }: { s: State; d: Decision | undefined }) {
  const { lines, tall } = useFit();
  if (!s.llm) return <Placeholder title="AI is offline" sub="No model connected. The grid still runs on its fixed safety rules." />;
  if (!d) return <Placeholder title="Waiting for a reason to think" sub="DeepSeek is only asked when a transformer is heading over its limit." />;
  if (d.verdict === "error")
    return (
      <div className="flex flex-col gap-1.5">
        <div className="text-[1.05rem] font-semibold text-fg">Could not reach DeepSeek</div>
        <Clamp lines={2} className="tech">{d.detail}</Clamp>
        <div className="mt-auto text-[0.82rem] text-dim">Nothing was sent. It tries again on the next check.</div>
      </div>
    );
  const sec = d.latency_ms != null ? d.latency_ms / 1000 : null;
  return (
    <>
      <Clamp lines={lines} className={`${tall ? "text-[1.08rem]" : "text-[0.93rem]"} leading-[1.45] text-fg/90`}>
        {cleanText(d.rationale) || "No reasoning returned."}
      </Clamp>
      <div className="mt-auto flex flex-wrap items-baseline gap-x-3 gap-y-1 pt-2.5">
        <span className="text-[0.86rem] font-medium text-signal">
          {d.mode === "NONE" || !d.mode ? "Suggests: no action" : `Suggests: ${modeTitle(d.mode)}`}
        </span>
        {sec != null && (
          <span className="num text-[0.82rem] text-dim">
            answered in <span className="font-semibold text-fg">{sec < 10 ? sec.toFixed(1) : Math.round(sec)} s</span>
          </span>
        )}
      </div>
    </>
  );
}

function ChecksBody({ d, pendingWhy }: { d: Decision | undefined; pendingWhy: string | null }) {
  const { compact } = useFit();
  if (!d) return <Placeholder title="Nothing to check" sub="Every proposal must pass fixed safety rules before it is signed." />;
  const v = d.verdict;
  const reason = plainReason(d.detail, d.mode);
  const raw = d.detail && reason !== cleanText(d.detail) ? d.detail : null;
  const ok = v === "sent" || v === "pending";
  const word =
    v === "sent" ? "Allowed" : v === "pending" ? "Allowed" : v === "refused" ? "Refused" : v === "held" ? "Held back" : v === "rejected" ? "Rejected" : v === "expired" ? "Expired" : "Nothing to check";
  const sub =
    v === "sent"
      ? d.detail === "operator approved"
        ? "Inside every safety rule, approved by the operator"
        : "Inside every safety rule"
      : v === "pending"
        ? pendingWhy ?? "Passed the rules, waiting for a person to approve"
        : v === "rejected"
          ? "The operator said no. Nothing was sent"
          : v === "expired"
            ? "Nobody approved it within an hour"
            : v === "none"
              ? "DeepSeek proposed no signal"
              : v === "error"
                ? "No proposal came back"
                : reason ?? "Blocked by the safety rules";
  const SIcon = ok ? ShieldCheck : ShieldWarning;
  return (
    <>
      <div className="flex items-center gap-2.5">
        <SIcon size={compact ? 24 : 30} weight="fill" style={{ color: ok ? COLORS.signal : v === "none" || v === "error" ? "var(--color-faint)" : "var(--color-fg)" }} className="shrink-0" />
        <Hero className={v === "none" || v === "error" ? "!text-[1.25rem] text-dim" : "text-fg"} color={ok ? COLORS.signal : undefined}>
          {word}
        </Hero>
      </div>
      <Clamp lines={compact ? 2 : 3} className="mt-2.5 text-[0.88rem] leading-snug text-fg/85">{sub}</Clamp>
      <div className={`tech mt-auto truncate pt-2 ${compact ? "hidden" : ""}`}>
        {v === "sent" ? `policy guard passed, Ed25519 signed, signal #${d.seq}` : v === "pending" && pendingWhy ? "policy guard passed, autopilot rule: human approval" : raw ? `guard: ${raw}` : "policy guard"}
      </div>
    </>
  );
}

function ActsBody({
  s, d, lastSent, pending, pendingWhy,
}: {
  s: State;
  d: Decision | undefined;
  lastSent: Decision | undefined;
  pending: Proposal | null;
  pendingWhy: string | null;
}) {
  const { compact } = useFit();
  if (pending) return <Approval p={pending} why={pendingWhy} />;
  if (d && d.verdict === "sent") return <SentOutcome s={s} d={d} />;
  const live = !!lastSent?.segment && s.active[lastSent.segment]?.seq === lastSent.seq;
  const o = live ? outcome(s, lastSent) : null;
  const running = Object.keys(s.active ?? {}).length;
  const hl = running ? headline(s) : null;
  return (
    <>
      <div className="text-[1.05rem] font-semibold leading-snug text-fg">{d ? "Nothing new sent" : "No signal yet"}</div>
      {(!compact || (!lastSent && !running)) && (
        <div className="mt-1 text-[0.86rem] leading-snug text-dim">
          {running ? "Signals already out keep working." : "Houses keep running as their owners set them."}
        </div>
      )}
      {!lastSent && hl && (
        <div className="mt-auto pt-2">
          <div className="flex items-baseline gap-1.5">
            <Hero className="text-fg">
              <Ticker value={hl.obeying} />
            </Hero>
            <span className="num text-[1rem] text-dim">of {hl.under}</span>
          </div>
          <div className="mt-1 text-[0.86rem] font-medium text-fg">
            houses obeying{" "}
            <span className="font-normal text-dim">
              {running} signal{running === 1 ? "" : "s"} running
            </span>
          </div>
        </div>
      )}
      {lastSent && (
        <div className="mt-auto rounded-xl bg-white/[0.035] px-3 py-2 text-[0.8rem] leading-snug text-dim shadow-[inset_0_0_0_1px_rgb(255_255_255/0.04)]">
          <div className="num truncate">
            {live ? <span className="text-signal">Still running</span> : "Last signal"}, sent {hhmm(lastSent.sim_h)}
          </div>
          <div className="truncate font-medium text-fg">
            {modeTitle(lastSent.mode)} on {nice(lastSent.segment)}
          </div>
          {o && o.total > 0 && (
            <div className="num truncate">
              <span className="font-semibold text-fg">{o.obeyed}</span> of {o.total} houses obeyed
            </div>
          )}
        </div>
      )}
    </>
  );
}

function SentOutcome({ s, d }: { s: State; d: Decision }) {
  const { compact } = useFit();
  const o = outcome(s, d);
  const live = d.segment ? s.active[d.segment]?.seq === d.seq : false;
  const box = boxLine(d.envelope, d.fields);
  return (
    <>
      <div className="text-[1.12rem] font-semibold leading-tight tracking-[-0.01em] text-fg">{modeTitle(d.mode)}</div>
      <div className="mt-1 truncate text-[0.84rem] text-dim">
        on {nice(d.segment)}
        {d.duration_min ? ` for ${dur(d.duration_min)}` : ""}
        {!compact && <span className={live ? "text-signal" : "text-faint"}>{live ? ", running now" : ", finished"}</span>}
      </div>
      <div className="mt-auto pt-2.5">
        {o && o.total > 0 ? (
          <>
            <div className="flex items-baseline gap-1.5">
              <Hero className="text-fg">
                <Ticker value={o.obeyed} />
              </Hero>
              <span className="num text-[1rem] text-dim">of {o.total}</span>
            </div>
            <div className="mt-1 text-[0.86rem] font-medium text-fg">
              houses obeyed
              {(o.partial > 0 || o.refused > 0) && (
                <span className="font-normal text-dim">
                  {o.partial > 0 ? `, ${o.partial} partly` : ""}
                  {o.refused > 0 ? `, ${o.refused} said no` : ""}
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="text-[0.86rem] text-dim">Waiting for the houses to confirm</div>
        )}
        {box && !compact && (
          <div className="mt-2 border-t border-white/[0.06] pt-2">
            <div className="truncate text-[0.8rem] text-fg/85">
              <span className="text-signal">Allowed box: </span>
              {box.replace(/^Up to/, "up to")}
            </div>
            <div className="tech">dynamic operating envelope</div>
          </div>
        )}
      </div>
    </>
  );
}

function Approval({ p, why }: { p: Proposal; why: string | null }) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const act = async (what: "approve" | "reject") => {
    setBusy(what);
    setErr(null);
    try {
      await post(`autopilot/${what}`);
      setDone(what === "approve" ? "Approved. Signing and sending" : "Rejected. Nothing sent");
    } catch (e) {
      setErr(plainReason((e as Error).message) ?? "Could not reach the platform");
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1.5 text-[0.8rem] font-medium text-signal">
        <Hourglass size={14} weight="fill" />
        Needs your OK
      </div>
      <div className="mt-1.5 text-[1.12rem] font-semibold leading-tight text-fg">{modeTitle(p.mode)}</div>
      <div className="mt-0.5 truncate text-[0.84rem] text-dim">
        on {nice(p.segment)}
        {p.duration_min ? ` for ${dur(p.duration_min)}` : ""}
      </div>
      {why && <Clamp lines={2} className="mt-1.5 text-[0.78rem] leading-snug text-dim">{why}</Clamp>}
      <div className="mt-auto flex flex-col gap-1.5 pt-2.5">
        {done ? (
          <div className="rounded-full bg-signal/10 px-3 py-2 text-center text-[0.86rem] font-medium text-signal">{done}</div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button className="btn btn-primary justify-center !py-2.5 !text-[0.95rem]" disabled={!!busy} onClick={() => act("approve")}>
              {busy === "approve" ? <CircleNotch size={15} weight="bold" className="animate-spin" /> : null}
              Approve
            </button>
            <button className="btn justify-center !py-2.5 !text-[0.95rem]" disabled={!!busy} onClick={() => act("reject")}>
              {busy === "reject" ? <CircleNotch size={15} weight="bold" className="animate-spin" /> : null}
              Reject
            </button>
          </div>
        )}
        {err && <div className="text-[0.78rem] text-fg/90">Did not go through: {err}</div>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ header pieces
function statusOf(s: State, lit: number, playing: boolean): { text: string; live: boolean } {
  const ap = s.autopilot;
  if (!s.llm) return { text: "AI offline", live: false };
  if (ap.mode === "off") return { text: "Autopilot off", live: false };
  if (ap.pending) return { text: "Waiting for your OK", live: true };
  if (!playing && ap.busy && lit >= 0) return { text: ["Sensing the grid", "Asking DeepSeek", "Checking the rules", "Signing and sending"][lit], live: true };
  return { text: ap.mode === "propose" ? "Watching, asks before acting" : "Watching the grid", live: true };
}

function ModeControl({ s, compact }: { s: State; compact: boolean }) {
  const [want, setWant] = useState<ApMode | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const cur = s.autopilot.mode;
  useEffect(() => {
    if (want && want === cur) setWant(null);
  }, [cur, want]);
  const change = async (m: ApMode) => {
    if (m === cur) return;
    setWant(m);
    setErr(null);
    try {
      await post("autopilot", { mode: m });
    } catch (e) {
      setWant(null);
      const msg = (e as Error).message;
      setErr(/GZ_LLM_URL/.test(msg) ? "No AI model is connected" : msg);
    }
  };
  return (
    <div className="flex flex-col items-start gap-1 @2xl:items-end">
      <Segmented<ApMode>
        id="autopilot-mode"
        size={compact ? "sm" : "md"}
        value={want ?? cur}
        onChange={change}
        options={[
          { value: "off", label: "Off", title: "Nothing runs on its own" },
          { value: "propose", label: "Ask me first", title: "The AI proposes, a person approves", disabled: !s.llm },
          { value: "auto", label: "Autopilot", title: "Everyday signals go out on their own, inside the safety rules", disabled: !s.llm },
        ]}
      />
      {err && <div className="px-2 text-[0.76rem] text-fg/90">Could not switch: {err}</div>}
    </div>
  );
}

function Recent({ list, narrow }: { list: Decision[]; narrow: boolean }) {
  if (!list.length) return null;
  return (
    <div className={`flex min-w-0 gap-2 ${narrow ? "flex-col" : "items-center overflow-hidden"}`}>
      <span className="label shrink-0">Recent decisions</span>
      {list.map((d, i) => (
        <div
          key={`${d.at}-${i}`}
          className={`flex min-w-0 items-center gap-2 rounded-full bg-white/[0.035] px-3 py-1.5 text-[0.8rem] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.04)] ${narrow ? "" : "shrink"}`}
        >
          <span className="num shrink-0 text-dim">{hhmm(d.sim_h)}</span>
          <VerdictChip v={d.verdict} />
          <span className="truncate text-fg">
            {d.mode && d.mode !== "NONE" ? modeTitle(d.mode) : "No action"}
            {d.segment && <span className="text-dim"> on {nice(d.segment)}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ the strip
export default function BrainStrip({ s, weather }: { s: State; weather: WeatherFeed }) {
  const reduce = !!useReducedMotion();
  const [ref, box] = useBox<HTMLElement>();
  const ap = s.autopilot;
  const hist = ap.history ?? []; // newest first (platform appendleft)
  const latest = hist[0];
  const anim = useReplay(latest, reduce);

  const narrow = box.w > 0 && box.w < 588;
  const off = ap.mode === "off";
  const liveIdx = ap.busy ? STAGE_IDX[ap.stage] ?? -1 : -1;
  const lit = anim ? anim.lit : ap.pending ? 3 : liveIdx;
  const dec = (i: number) => (anim && i > anim.lit ? anim.from : latest);
  const stateOf = (i: number): StepState => (i === lit ? "active" : anim && i > anim.lit ? "waiting" : "done");
  const liveOnly = !anim && liveIdx >= 0;

  const pendingWhy = ap.pending ? plainReason(hist.find((h) => h.verdict === "pending")?.detail, ap.pending.mode) : null;
  const lastSent = hist.find((h) => h.verdict === "sent");
  const compact = !narrow && box.h > 0 && box.h < 330;
  const tall = !narrow && box.h >= 520;
  const fit: Fit = {
    compact,
    tall,
    lines: narrow ? 4 : compact ? 3 : box.h < 400 ? 4 : box.h < 520 ? 6 : 9,
    showTech: narrow || box.w >= 1000,
  };
  const showRecent = narrow || box.h >= 400;
  const status = statusOf(s, lit, !!anim);

  const steps: { icon: Icon; verb: string; tech: string; body: ReactNode; key: string }[] = [
    {
      icon: Eye,
      verb: "Sees",
      tech: "trigger",
      key: off ? "off" : liveOnly && liveIdx >= 1 ? `t-${ap.last_trigger}` : `t-${dec(0)?.at ?? "none"}`,
      body: <SeesBody s={s} trigger={liveOnly && liveIdx >= 1 ? ap.last_trigger : dec(0)?.trigger} weather={weather} off={off} />,
    },
    {
      icon: Brain,
      verb: "Thinks",
      tech: "DeepSeek",
      key: liveOnly && liveIdx === 1 ? "thinking" : `r-${s.llm}-${dec(1)?.at ?? "none"}`,
      body: liveOnly && liveIdx === 1 ? <Shimmer label="Asking DeepSeek" /> : <ThinksBody s={s} d={dec(1)} />,
    },
    {
      icon: ShieldCheck,
      verb: "Checks",
      tech: "policy guard",
      key: liveOnly && liveIdx === 2 ? "checking" : `g-${dec(2)?.at ?? "none"}`,
      body: liveOnly && liveIdx === 2 ? <Shimmer label="Checking the rules" /> : <ChecksBody d={dec(2)} pendingWhy={pendingWhy} />,
    },
    {
      icon: Broadcast,
      verb: "Acts",
      tech: "signed signal",
      key: ap.pending ? `p-${ap.pending.at}` : liveOnly && liveIdx === 3 ? "sending" : `a-${dec(3)?.at ?? "none"}`,
      body:
        liveOnly && liveIdx === 3 && !ap.pending ? (
          <Shimmer label="Signing and sending" />
        ) : (
          <ActsBody s={s} d={dec(3)} lastSent={lastSent} pending={ap.pending} pendingWhy={pendingWhy} />
        ),
    },
  ];

  return (
    <FitCtx.Provider value={fit}>
    <section
      ref={ref}
      className={`@container panel flex h-full min-h-0 flex-col gap-3.5 p-4 sm:p-5 ${narrow ? "scroll-thin overflow-y-auto [&>*]:shrink-0" : "overflow-hidden"}`}
    >
      {/* header */}
      <div className="flex flex-col gap-3 @2xl:flex-row @2xl:items-center @2xl:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-[0.8rem] text-signal"
            style={{
              background: "linear-gradient(180deg, rgb(51 225 201 / 0.22), rgb(51 225 201 / 0.08))",
              boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.15), inset 0 0 0 1px rgb(51 225 201 / 0.3), 0 8px 24px -10px rgb(51 225 201 / 0.6)",
            }}
          >
            <Brain size={22} weight="duotone" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-[1.12rem] font-semibold tracking-[-0.015em] text-fg">How the AI decides</h2>
            <div className="flex min-w-0 items-center gap-2 text-[0.82rem]">
              <span className={`live-dot shrink-0 ${status.live ? "text-signal" : "text-faint"}`} style={status.live ? undefined : { animation: "none" }} />
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={status.text}
                  className={`truncate font-medium ${status.live ? "text-signal" : "text-dim"}`}
                  initial={reduce ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? undefined : { opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                >
                  {status.text}
                </motion.span>
              </AnimatePresence>
              <span className="tech hidden truncate @md:inline">DeepSeek autopilot</span>
            </div>
          </div>
        </div>
        <ModeControl s={s} compact={narrow} />
      </div>

      {/* the flow */}
      <div
        className={`grid min-h-0 ${narrow ? "grid-cols-1" : "flex-1"} ${off || !s.llm ? "opacity-[0.72]" : ""}`}
        style={
          narrow
            ? undefined
            : { gridTemplateColumns: "minmax(0,1fr) 1.4rem minmax(0,1.2fr) 1.4rem minmax(0,0.95fr) 1.4rem minmax(0,1.05fr)", gridTemplateRows: "minmax(0,1fr)" }
        }
      >
        {steps.map((st, i) => (
          <Fragment key={st.verb}>
            {i > 0 && <Connector vertical={narrow} on={!(anim && i > anim.lit)} flow={lit === i && (!!anim || liveOnly)} reduce={reduce} />}
            <StepCard icon={st.icon} verb={st.verb} tech={st.tech} state={stateOf(i)} contentKey={st.key} reduce={reduce}>
              {st.body}
            </StepCard>
          </Fragment>
        ))}
      </div>

      {showRecent && hist.length > 1 && <Recent list={hist.slice(0, narrow ? 3 : 4)} narrow={narrow} />}
      {showRecent && hist.length === 0 && !off && s.llm && (
        <div className="text-[0.82rem] text-dim">Watching the grid, nothing to do yet.</div>
      )}
      <span className="sr-only">{ap.pending ? `Proposal waiting: ${modeTitle(ap.pending.mode)} on ${nice(ap.pending.segment)}. ${modePlain(ap.pending.mode)}` : ""}</span>
    </section>
    </FitCtx.Provider>
  );
}
