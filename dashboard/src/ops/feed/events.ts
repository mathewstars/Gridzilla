// The WHAT'S HAPPENING feed (ops.md, column 2): one plain-English line per thing that happened on the grid, newest first.
// Sources, merged and de-duplicated: the autopilot's decisions (autopilot.history), the platform log (signals, guard
// refusals, diet plan renewals, scenario, heartbeat, the real Blatnica house) and state changes seen between polls.
// The platform log only ships its newest 60 lines and a diet plan renewal floods it with ~270 acks, so every poll is
// folded into a store that lives for the whole page: an event seen once stays in the feed.
import { useMemo } from "react";
import type { Decision, Envelope, History, LogEntry, State } from "../../api";
import { hhmm, nice, plainTrigger } from "../../model";
import { cleanText, plainReason } from "../../components/brain/plain";

export type Tone = "plain" | "quiet" | "bad" | "wait";
export type Actor = "ai" | "operator" | "signal" | "plan" | "house" | "scenario" | "dark" | "system";

export interface FeedEvent {
  id: string;
  t: number; // real time, ms
  gridH?: number; // grid hour when the platform said so (autopilot decisions)
  actor: Actor;
  tone: Tone;
  /** Line parts: plain text, or a signal type shown as its human name with the code name small. */
  head: (string | { mode: string })[];
  meta: string[];
  /** Same thing seen twice (log line and decision): a weak event is dropped when a strong one with a shared key is near. */
  keys: string[];
  weak?: boolean;
  decision?: Decision;
  seq?: number | null;
  segment?: string | null;
  raw?: string;
  born: number; // when this page first saw it
}

const ms = (iso: string) => Date.parse(iso);
const ago = (iso: string, now: number) => (now - ms(iso)) / 1000;

/** Readable name of a grid node, keeping a transformer's number ("Erdberg 47"). */
export function place(id: string | null | undefined) {
  if (!id) return "";
  const [k, slug = ""] = id.split(":");
  const num = slug.match(/-(\d+)$/)?.[1];
  const name = nice(id);
  if (k === "tf") return num ? `${name} ${num}` : name;
  if (k === "feeder") return `feeder ${name}${num ? ` ${num}` : ""}`;
  if (k === "sub" || k === "substation") return `substation ${name}`;
  if (k === "region") return "the whole city";
  return name;
}

const SCENARIO_WORDS: Record<string, string> = {
  normal: "Normal day",
  "cold-evening": "Cold evening",
  "sunny-noon": "Sunny noon",
  "live-weather": "Live Vienna weather",
};
const scenarioName = (n: string) => SCENARIO_WORDS[n] ?? nice(n);
const ACK_WORD: Record<string, string> = { applied: "followed", partial: "partly followed", refused: "refused", reverted: "back to owner mode" };

// ------------------------------------------------------------------ the store (one per page)
interface Snap {
  applied: number;
  devices: number;
}
const store = {
  events: new Map<string, FeedEvent>(),
  anchors: new Map<number, number>(), // real ms (to the second) -> grid hour as reported
  snaps: new Map<number, Snap>(), // seq -> houses that answered the signal (households)
  envs: new Map<string, Envelope>(), // decision id or "seq:N" -> per-slot limits
  prev: null as null | { hb: boolean; scen: string; shapeAt: string | null },
  mount: 0,
};

function add(e: Omit<FeedEvent, "born">) {
  const old = store.events.get(e.id);
  store.events.set(e.id, { ...e, born: old?.born ?? Date.now() });
}

/** Real time -> unwrapped grid hours, interpolated between the moments the platform reported its clock. */
function gridClock(simX: number) {
  const pts = [...store.anchors.entries()].sort((a, b) => a[0] - b[0]);
  const un: [number, number][] = [];
  pts.forEach(([t, h], i) => {
    if (!i) return un.push([t, h]);
    const ph = un[i - 1][1];
    let step = (((h - (((ph % 24) + 24) % 24)) % 24) + 24) % 24; // the grid clock moves forward...
    if (step > 20) step -= 24; // ...except two sources rounding the same moment a little apart
    un.push([t, ph + step]);
  });
  // grid hours per real ms: measured from what the platform reported (the configured speed is only a fallback)
  const span = un.length > 1 ? un[un.length - 1][0] - un[0][0] : 0;
  const rate = span > 30_000 ? (un[un.length - 1][1] - un[0][1]) / span : simX / 3600_000;
  return (t: number) => {
    if (!un.length) return null;
    if (t <= un[0][0]) return un[0][1] - (un[0][0] - t) * rate;
    const last = un[un.length - 1];
    if (t >= last[0]) return last[1] + (t - last[0]) * rate;
    let i = 1;
    while (un[i][0] < t) i++;
    const [t0, h0] = un[i - 1];
    const [t1, h1] = un[i];
    return h0 + ((h1 - h0) * (t - t0)) / Math.max(1, t1 - t0);
  };
}

// ------------------------------------------------------------------ autopilot decisions
const decisionId = (d: Decision) => `d|${d.at}|${d.mode}|${d.segment}|${d.verdict}`;

function fromDecision(d: Decision, s: State, r: number) {
  const id = decisionId(d);
  if (d.envelope) store.envs.set(id, d.envelope);
  const seg = d.segment;
  const on = place(seg);
  const mode = d.mode ?? "";
  const keys = [`dec:${mode}:${seg}`];
  if (d.seq != null) keys.push(`seq:${d.seq}`);
  const meta: string[] = [];
  let head: FeedEvent["head"];
  let tone: Tone = "plain";
  let actor: Actor = "ai";
  switch (d.verdict) {
    case "sent": {
      head = ["AI proposed ", { mode }, ` on ${on}`];
      meta.push("guard passed");
      if (/operator approved/.test(d.detail ?? "")) meta.push("approved by the operator");
      if (d.seq != null) meta.push(`signed #${d.seq}`);
      const snap = d.seq != null ? store.snaps.get(d.seq) : undefined;
      if (snap && snap.devices) {
        const n = (x: number) => Math.round(x * r).toLocaleString("en-US");
        meta.push(mode === "RELEASE" ? `${n(snap.devices)} houses back to owner mode` : `${n(snap.applied)} of ${n(snap.devices)} houses applied`);
      }
      break;
    }
    case "refused":
      head = ["Guard refused ", { mode }, ` on ${on}`];
      tone = "bad";
      meta.push(plainReason(d.detail, mode) ?? "refused");
      break;
    case "held":
      head = ["Held back ", { mode }, ` on ${on}`];
      tone = "bad";
      meta.push(plainReason(d.detail, mode) ?? "held back");
      break;
    case "pending": {
      const live = s.autopilot.pending?.at === d.at || (s.autopilot.pending?.segment === seg && s.autopilot.pending?.mode === mode);
      head = live ? ["Waiting for the operator: ", { mode }, ` on ${on}`] : ["AI asked the operator about ", { mode }, ` on ${on}`];
      tone = live ? "wait" : "quiet";
      meta.push("guard passed");
      if (d.detail) meta.push(plainReason(d.detail, mode) ?? "");
      if (live) meta.push("approve or reject it on the right");
      break;
    }
    case "rejected":
      head = ["Operator rejected ", { mode }, ` on ${on}`];
      actor = "operator";
      tone = "quiet";
      break;
    case "expired":
      head = ["Proposal ", { mode }, ` on ${on} expired unapproved`];
      tone = "quiet";
      break;
    case "error":
      head = ["AI did not answer"];
      tone = "bad";
      meta.push(cleanText(d.detail).slice(0, 90) || "the advisor call failed");
      keys.splice(0, keys.length, "ai-error");
      break;
    default:
      head = ["AI checked the grid: no action needed"];
      tone = "quiet";
      keys.splice(0, keys.length, "ai-none");
  }
  add({ id, t: ms(d.at), gridH: d.sim_h, actor, tone, head, meta: meta.filter(Boolean), keys, decision: d, seq: d.seq, segment: seg });
}

// ------------------------------------------------------------------ platform log
const FAMILY_DEV: Record<string, string> = { "real-powerplant-blatnica": "Blatnica battery", "vicare-blatnica": "Blatnica heat pump" };

function fromLog(e: LogEntry, s: State, r: number) {
  const t = ms(e.ts);
  const id = `l|${e.ts}|${e.kind}|${e.msg}`;
  const base = { id, t, raw: e.msg, meta: [] as string[], keys: [] as string[] };
  const houses = (s.summary?.houses ?? 0).toLocaleString("en-US");
  let m: RegExpMatchArray | null;
  switch (e.kind) {
    case "ack": {
      const dev = e.device ?? e.msg.split(":")[0];
      const status = e.status ?? e.msg.match(/: (\w+)/)?.[1] ?? "";
      const reason = e.msg.match(/: \w+ \(([^)]+)\)/)?.[1];
      if (FAMILY_DEV[dev]) {
        return add({ ...base, actor: "house", tone: status === "refused" ? "bad" : "plain", head: [`${FAMILY_DEV[dev]} ${ACK_WORD[status] ?? status}`],
          meta: [reason ? cleanText(reason) : "", "real house"].filter(Boolean), keys: [`ack:${dev}`] });
      }
      if (status !== "refused") return;
      if (reason === "stale_seq") {
        const sid = `ackstale|${e.ts}`;
        const prev = store.events.get(sid);
        const ds = new Set([...(prev?.raw?.split(",") ?? []).filter(Boolean), dev]);
        const k = Math.round(ds.size * r);
        return add({ id: sid, t, raw: [...ds].join(","), actor: "house", tone: "plain", head: [`${k} house${k === 1 ? "" : "s"} refused the replayed old signal`],
          meta: ["their safety check worked: an old signal is never obeyed twice"], keys: [] });
      }
      // refusals from simulated houses: one line per burst (same second)
      const bid = `ackr|${e.ts}`;
      const old = store.events.get(bid);
      const devs = new Set([...(old?.raw?.split(",") ?? []).filter(Boolean), dev]);
      const n = Math.round(devs.size * r);
      return add({ id: bid, t, raw: [...devs].join(","), actor: "house", tone: "bad", head: [`${n} house${n === 1 ? "" : "s"} refused the signal`],
        meta: [reason ? plainReason(reason) ?? reason : "the house's own rules said no"], keys: [] });
    }
    case "signal": {
      if ((m = e.msg.match(/^seq (\d+) (\w+) on (\S+) ended \(window over\)/)))
        return add({ ...base, id: `end|${m[1]}`, actor: "signal", tone: "quiet", head: [{ mode: m[2] }, ` on ${place(m[3])} ended: its time window ran out`], seq: +m[1], segment: m[3] });
      if ((m = e.msg.match(/^seq (\d+) (\w+) -> (\S+)/))) {
        if (m[2] === "SHAPE") return;
        return add({ ...base, id: `sig|${m[1]}`, actor: "signal", tone: "plain", head: ["Signed ", { mode: m[2] }, ` on ${place(m[3])}`],
          meta: [`signed #${m[1]}`], keys: [`seq:${m[1]}`], weak: true, seq: +m[1], segment: m[3] });
      }
      if ((m = e.msg.match(/^(\w+) -> (\S+) staggered over (\d+) cohorts/)))
        return add({ ...base, actor: "signal", tone: "quiet", head: [{ mode: m[1] }, ` on ${place(m[2])} goes out in ${m[3]} groups`], meta: ["staggered so the street does not jump"] });
      return;
    }
    case "guard":
      if ((m = e.msg.match(/^REFUSED (\w+) for (\S+): (.*)$/)))
        return add({ ...base, actor: "operator", tone: "bad", head: ["Guard refused ", { mode: m[1] }, ` on ${place(m[2])}`],
          meta: [plainReason(m[3], m[1]) ?? m[3]], keys: [`dec:${m[1]}:${m[2]}`], weak: true, segment: m[2] });
      return;
    case "shape":
      if ((m = e.msg.match(/renewed on (\d+) feeders: Vienna peak ([\d.]+) MW without -> ([\d.]+) MW planned, (\d+) kWh .*?, (\d+) kWh/)))
        return add({ ...base, actor: "plan", tone: "plain", head: [`Diet plan renewed for ${m[1]} feeders`],
          meta: [`Vienna peak ${m[2]} → ${m[3]} MW`, `${m[4]} kWh of car charging moved to the night`, `${m[5]} kWh eaten by batteries`], keys: ["shape"] });
      if (/diet plan on/.test(e.msg)) return add({ ...base, actor: "operator", tone: "plain", head: ["Operator switched the diet plan on"] });
      if (/diet plan off/.test(e.msg)) return add({ ...base, actor: "operator", tone: "plain", head: ["Operator switched the diet plan off"], meta: ["houses keep the last plan until it runs out"] });
      return;
    case "demo":
      if ((m = e.msg.match(/^scenario ([\w-]+): other houses load x([\d.]+), PV x([\d.]+)/)))
        return add({ ...base, actor: "scenario", tone: "plain", head: [`Scenario changed to ${scenarioName(m[1])}`],
          meta: [`other houses use ${m[2]}× power`, `solar ${m[3]}×`], keys: [`scen:${m[1]}`] });
      if (/heartbeat PAUSED/.test(e.msg))
        return add({ ...base, actor: "dark", tone: "plain", head: [`Operator dark: ${houses} houses back to owner mode`], meta: ["no signal arrives, every house runs on its own rules"], keys: ["hb:pause"] });
      if (/heartbeat resumed/.test(e.msg))
        return add({ ...base, actor: "operator", tone: "plain", head: ["Operator back: houses follow signals again"], meta: ["the signal is flowing again"], keys: ["hb:resume"] });
      if ((m = e.msg.match(/^REPLAYED seq (\d+) to (\S+)/)))
        return add({ ...base, actor: "operator", tone: "plain", head: [`Old signal #${m[1]} replayed to ${place(m[2])}`], meta: ["houses must refuse it as stale"] });
      return;
    case "autopilot":
      if ((m = e.msg.match(/^mode (\w+)/)))
        return add({ ...base, actor: "operator", tone: "plain", head: [`Autopilot set to ${m[1] === "auto" ? "Auto" : m[1] === "propose" ? "Propose" : "Off"}`],
          meta: [m[1] === "auto" ? "the AI signs by itself" : m[1] === "propose" ? "the AI asks before it signs" : "no AI signals"] });
      if ((m = e.msg.match(/^operator warning: (.*)$/)))
        return add({ ...base, actor: "operator", tone: "plain", head: [m[1] === "(cleared)" ? "Operator cleared the warning for the AI" : "Operator warned the AI"], meta: m[1] === "(cleared)" ? [] : [cleanText(m[1])] });
      if (/operator asked for a review now/.test(e.msg))
        return add({ ...base, actor: "operator", tone: "plain", head: ["Operator asked the AI to look now"] });
      if (/advisor call failed/.test(e.msg))
        return add({ ...base, actor: "ai", tone: "bad", head: ["AI did not answer"], meta: [cleanText(e.msg.replace(/^advisor call failed: /, "")).slice(0, 90)], keys: ["ai-error"], weak: true });
      if ((m = e.msg.match(/^held back (\w+) -> (\S+): (.*)$/)))
        return add({ ...base, actor: "ai", tone: "bad", head: ["Held back ", { mode: m[1] }, ` on ${place(m[2])}`], meta: [plainReason(m[3], m[1]) ?? m[3]], keys: [`dec:${m[1]}:${m[2]}`], weak: true });
      return; // trigger / sent / waiting / expired / rejected: the decision row says it
    case "advisor":
      if ((m = e.msg.match(/^proposed (\w+) -> (\S+) for ([\d.]+) grid min \((\d+) ms\): (.*?)(?: \| (GUARD: .*|guard ok))?$/))) {
        const bad = (m[6] ?? "").startsWith("GUARD");
        return add({ ...base, actor: "ai", tone: bad ? "bad" : "plain", head: [bad ? "Guard refused AI advice " : "AI advised ", { mode: m[1] }, ` on ${place(m[2])}`],
          meta: [bad ? plainReason(m[6].replace("GUARD: ", ""), m[1]) ?? "" : "guard passed", `answered in ${(+m[4] / 1000).toFixed(1)} s`],
          keys: [`dec:${m[1]}:${m[2]}`], weak: true, segment: m[2] });
      }
      return;
    case "registry":
      if ((m = e.msg.match(/^(\S+) registered/)))
        return add({ ...base, actor: "house", tone: "quiet", head: [`${FAMILY_DEV[m[1]] ?? "A house"} joined`], meta: ["its signing key is registered"] });
      return;
    case "mqtt":
      if (/refused|disconnected/.test(e.msg))
        return add({ ...base, actor: "system", tone: "bad", head: ["Message server connection lost"], meta: ["reconnecting"] });
      return;
  }
}

// ------------------------------------------------------------------ fold one poll into the store
function fold(s: State) {
  const now = ms(s.now) || Date.now();
  if (!store.mount) store.mount = Date.now();
  store.anchors.set(Math.round(now / 1000) * 1000, s.sim_hour);
  s.autopilot?.history?.forEach((d) => store.anchors.set(Math.round(ms(d.at) / 1000) * 1000, d.sim_h));
  if (store.anchors.size > 900) [...store.anchors.keys()].sort((a, b) => a - b).slice(0, store.anchors.size - 700).forEach((k) => store.anchors.delete(k));

  const r = s.summary?.households ? s.summary.houses / s.summary.households : 1;
  // How the houses answered each fresh signal: snapshot the node's acks while the signal is new (first 90 s).
  s.autopilot?.history?.forEach((d) => {
    if (d.verdict !== "sent" || d.seq == null || !d.segment) return;
    const agg = s.aggregates[d.segment];
    const cur = s.recent?.[d.segment]?.seq === d.seq || s.active[d.segment]?.seq === d.seq;
    if (agg && (ago(d.at, now) < 90 || (cur && !store.snaps.has(d.seq)))) store.snaps.set(d.seq, { applied: agg.applied, devices: agg.devices });
  });
  [...Object.values(s.active ?? {}), ...Object.values(s.recent ?? {})].forEach((g) => g.envelope && store.envs.set(`seq:${g.seq}`, g.envelope));

  s.autopilot?.history?.forEach((d) => fromDecision(d, s, r));
  // every signal the platform still remembers (one per node): when it was signed and how it ended
  [...Object.values(s.recent ?? {}), ...Object.values(s.active ?? {})].forEach((g) => {
    if (g.mode === ("SHAPE" as string)) return;
    const on = place(g.segment);
    add({ id: `sig|${g.seq}`, t: ms(g.issued_at), actor: "signal", tone: "plain", head: ["Signed ", { mode: g.mode }, ` on ${on}`],
      meta: [`signed #${g.seq}`], keys: [`seq:${g.seq}`], weak: true, seq: g.seq, segment: g.segment, raw: g.note });
    const rg = g as typeof g & { ended_at?: string | null; ended?: string | null };
    if (rg.ended_at && rg.ended && !/released by/.test(rg.ended)) {
      const by = rg.ended.match(/released by seq (\d+)/)?.[1];
      add({ id: `end|${g.seq}`, t: ms(rg.ended_at), actor: "signal", tone: "quiet",
        head: [{ mode: g.mode }, ` on ${on} ended: ${by ? `handed back by #${by}` : "its time window ran out"}`], meta: [], keys: [`end:${g.seq}`], seq: g.seq, segment: g.segment });
    }
  });
  s.log?.forEach((e) => fromLog(e, s, r));

  // State changes between polls, in case the ack flood pushed the log line out before we saw it.
  const p = store.prev;
  const scen = s.scenario?.name ?? "";
  const shapeAt = s.shape?.at ?? null;
  if (p) {
    const at = s.now;
    const houses = (s.summary?.houses ?? 0).toLocaleString("en-US");
    if (p.hb !== s.hb_paused)
      add(s.hb_paused
        ? { id: `x|hb|${at}`, t: now, actor: "dark", tone: "plain", head: [`Operator dark: ${houses} houses back to owner mode`], meta: ["no signal arrives, every house runs on its own rules"], keys: ["hb:pause"], weak: true }
        : { id: `x|hb|${at}`, t: now, actor: "operator", tone: "plain", head: ["Operator back: houses follow signals again"], meta: [], keys: ["hb:resume"], weak: true });
    if (p.scen !== scen && scen)
      add({ id: `x|scen|${at}`, t: now, actor: "scenario", tone: "plain", head: [`Scenario changed to ${scenarioName(scen)}`], meta: [], keys: [`scen:${scen}`], weak: true });
  }
  // the newest diet plan renewal is always in the feed (its log line drowns in the ~270 acks that follow it)
  if (shapeAt && (!p || p.shapeAt !== shapeAt))
      add({ id: `x|shape|${shapeAt}`, t: ms(shapeAt), actor: "plan", tone: "plain", head: [`Diet plan renewed for ${s.shape?.feeders ?? 0} feeders`],
        meta: [s.summary?.shaped ? `${Math.round(s.summary.shaped * r).toLocaleString("en-US")} houses on the plan` : "", "a new 24-hour plan per street"].filter(Boolean), keys: ["shape"], weak: true });
  store.prev = { hb: s.hb_paused, scen, shapeAt };

  // keep the newest 400
  if (store.events.size > 400) [...store.events.values()].sort((a, b) => a.t - b.t).slice(0, store.events.size - 400).forEach((e) => store.events.delete(e.id));
}

export interface FeedRowData extends FeedEvent {
  time: string;
  envelope: Envelope | null;
  fresh: boolean;
}

/** Fold the latest state into the page's feed and return the rows (newest first) with the header counts. */
export function useFeed(s: State | null, hist?: History | null) {
  return useMemo(() => {
    if (!s) return null;
    // the readings history carries (real time, grid hour) pairs every few seconds: the best clock for log lines
    const pts = hist ? Object.values(hist.nodes ?? {})[0] ?? [] : [];
    pts.forEach((p) => p.ts && store.anchors.set(Math.round(ms(p.ts) / 1000) * 1000, p.h));
    fold(s);
    const clock = gridClock(s.autopilot?.sim_x || 60);
    const all = [...store.events.values()];
    const strong = all.filter((e) => !e.weak);
    const near = (a: FeedEvent, b: FeedEvent) => Math.abs(a.t - b.t) < 20_000;
    const rows = all
      .filter((e) => !e.weak || !strong.some((o) => o.keys.some((k) => e.keys.includes(k)) && (near(o, e) || (e.seq != null && o.seq === e.seq))))
      .sort((a, b) => b.t - a.t || (a.actor === "ai" ? -1 : 1))
      .map((e): FeedRowData => {
        const g = clock(e.t);
        return {
          ...e,
          time: e.gridH != null ? hhmm(e.gridH) : g != null ? hhmm(g) : "--:--",
          envelope: store.envs.get(e.id) ?? (e.seq != null ? store.envs.get(`seq:${e.seq}`) ?? null : null),
          fresh: e.born > store.mount + 1500,
        };
      });
    // header counts over the current grid day
    const nowT = ms(s.now) || Date.now();
    const today = Math.floor((clock(nowT) ?? 0) / 24);
    const isToday = (e: FeedEvent) => Math.floor((clock(e.t) ?? -24) / 24) === today;
    const signals = rows.filter((e) => isToday(e) && (e.decision?.verdict === "sent" || e.id.startsWith("sig|"))).length;
    // How far back this page can see: the platform only ships its newest log lines and recent signals, so the daily
    // count is only complete when the oldest event held reaches back before today's grid midnight.
    let oldest: number | null = null;
    for (const e of all) {
      const h = clock(e.t); // unwrapped grid hours (e.gridH is only the hour of day)
      if (h != null && (oldest == null || h < oldest)) oldest = h;
    }
    const since = oldest == null || Math.floor(oldest / 24) < today ? null : oldest; // null = the whole grid day is seen
    const refusals = rows.filter((e) => isToday(e) && e.tone === "bad").length;
    const r = s.summary?.households ? s.summary.houses / s.summary.households : 1;
    const act = Object.keys(s.active ?? {});
    const top = act.filter((n) => !act.some((m) => m !== n && under(s, n, m)));
    const following = Math.round(top.reduce((a, n) => a + (s.aggregates[n]?.applied ?? 0), 0) * r);
    const waiting = !!s.autopilot?.pending;
    // what the AI did today: every decision it took, the ones sent, the ones the guard refused or held back
    const decided = rows.filter((e) => isToday(e) && e.decision);
    const ai = {
      decisions: decided.length,
      sent: decided.filter((e) => e.decision?.verdict === "sent").length,
      refused: decided.filter((e) => e.decision?.verdict === "refused" || e.decision?.verdict === "held").length,
    };
    const plans = rows.filter((e) => isToday(e) && e.actor === "plan").length;
    const lastSigned = rows.find((e) => e.decision?.verdict === "sent" || e.id.startsWith("sig|")) ?? null;
    return { rows, signals, since, refusals, following, waiting, dark: s.hb_paused, ai, plans, lastSigned };
  }, [s, hist]);
}

/** True when node `n` sits below node `m` in the grid tree. */
function under(s: State, n: string, m: string) {
  for (let c: string | null = s.tree[n]?.parent ?? null; c; c = s.tree[c]?.parent ?? null) if (c === m) return true;
  return false;
}

/** The expanded detail lines of a row. */
export function details(e: FeedRowData) {
  const d = e.decision;
  const out: { k: string; v: string; tone?: Tone }[] = [];
  if (d) {
    const why = plainTrigger(d.trigger);
    if (why) out.push({ k: "What it saw", v: cleanText(why) });
    if (d.rationale) out.push({ k: "DeepSeek's reason", v: cleanText(d.rationale) });
    if (d.latency_ms != null) out.push({ k: "Answered in", v: `${(d.latency_ms / 1000).toFixed(1)} s` });
    const verdict =
      d.verdict === "refused" || d.verdict === "held"
        ? { v: plainReason(d.detail, d.mode) ?? "refused", tone: "bad" as Tone }
        : d.verdict === "error"
          ? { v: cleanText(d.detail), tone: "bad" as Tone }
          : d.verdict === "none"
            ? { v: "nothing to check, no signal" }
            : { v: "passed every safety rule" };
    out.push({ k: "Guard", ...verdict });
    if (d.duration_min) out.push({ k: "For", v: d.duration_min >= 60 ? `${+(d.duration_min / 60).toFixed(1)} grid hours` : `${Math.round(d.duration_min)} grid minutes` });
    if (d.detail && d.verdict !== "error" && d.verdict !== "sent") out.push({ k: "Platform said", v: d.detail });
  } else if (e.raw && !/^ack(r|stale)\|/.test(e.id)) out.push({ k: e.id.startsWith("sig|") && !e.raw.startsWith("seq ") ? "Message to houses" : "Platform log", v: e.raw });
  return out;
}

/** One plain-English sentence on what a feed line means (hover and tap). */
export function explain(e: FeedEvent): string {
  const d = e.decision;
  if (d) {
    switch (d.verdict) {
      case "sent": return "The AI picked this signal, the safety guard checked it, and the platform signed it and sent it to the houses.";
      case "refused": return "The safety guard blocked the AI's signal, so nothing reached the houses.";
      case "held": return "The autopilot held this signal back on purpose, so nothing reached the houses.";
      case "pending": return e.tone === "wait" ? "The AI proposes this signal and waits for you to approve or reject it." : "The AI asked the operator to approve this signal.";
      case "rejected": return "The operator turned this proposal down, so nothing was sent.";
      case "expired": return "Nobody approved this proposal in time, so it lapsed and nothing was sent.";
      case "error": return "The AI advisor did not answer, so the autopilot made no decision this round.";
      default: return "The AI checked the forecast: every transformer stays inside its limit, so it did nothing.";
    }
  }
  if (e.id.startsWith("sig|")) return "The platform signed this message with its key and sent it to every house under that part of the grid.";
  if (e.id.startsWith("end|")) return "This signal stopped; the houses under it went back to their owners' own settings.";
  if (e.id.startsWith("ackstale|")) return "Houses refused an old copy of a signal: proof that a replayed message cannot trick them.";
  if (e.id.startsWith("ackr|")) return "These houses checked the signal against their own rules and said no.";
  if (/goes out in/.test(String(e.head[1] ?? ""))) return "The signal goes out to the houses in groups, so the street's load does not jump all at once.";
  switch (e.actor) {
    case "house": return "The real house in Blatnica answered a signal, like every simulated home does.";
    case "plan": return "The diet plan is a 24-hour schedule per street that moves car charging and battery use away from the evening peak.";
    case "scenario": return "The simulated weather and demand changed, so the whole city now uses power differently.";
    case "dark": return "The platform stopped its heartbeat, so every house stopped trusting signals and runs on its owner's settings.";
    case "system": return "The link to the message server that carries signals to the houses dropped; it reconnects on its own.";
    case "ai": return e.tone === "bad" ? "The AI's advice did not pass, so nothing was sent." : "The AI advisor's suggestion, before the autopilot decided what to do.";
    default: return e.tone === "bad" ? "The safety guard blocked this signal, so nothing reached the houses." : "Something the operator did from this console.";
  }
}
