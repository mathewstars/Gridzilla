// The judges' five as live facts (design/STAGE.md section 3, STORY.md J2-J6): one white tile, five columns separated by
// space only, each a big value, a one-line label and a small line. Stat styling adapted from 21st.dev "Stats Bento"
// (@uilayout.contact, id 25311): sentence-case labels, no inverted hero, no texture, no borders.
//   P1 limited time   countdown ring of the active signal's window in grid time, then owner mode
//   P2 owner control  homes following, the deck's trust line, owner limits winning (reply status and reason)
//   P3 curtailment    kW over a street limit with vs without Gridzilla, plus battery room kept for noon solar
//   P4 no expansion   street transformers that need no upgrade tonight (city diet plan), live fallback
//   P5 any maker      Victron + Viessmann at Blatnica on the same signed signal, signatures verified
// Every digit sits inside a data-src host (qa/README.md). Counts have no G2 grammar yet: they carry the proposed
// count(...) formula from STORY.md (gap a) so the gate can learn it. Layout: container queries in facts.css.
import type { ReactNode } from "react";
import { useFlatten, type FlattenPlan, type Household, type Signal, type State } from "../../api";
import { hhmm, nice } from "../../model";
import { lastOn, signalOn, type Street, type StoryState } from "../useStory";
import Counter, { fmtNum } from "../kit/Counter";
import Countdown, { gridWindow, useServerNow } from "../kit/Countdown";
import "./facts.css";

// ------------------------------------------------------------------ data

const REGION = "region:at";
const FC = `flatten:${REGION}`; // window.__gz key of the city plan (api.ts publishes each plan per node)

const A = (tf: string) => `state/aggregates/${tf}`;

/** Homes per simulated household (8). Blatnica is one real home. */
const ratio = (s: State) => (s.summary && s.summary.households ? s.summary.houses / s.summary.households : 8);
const homes = (h: Household, r: number) => (h.real ? 1 : h.represents || r);

/** kW below 1 MW, MW with one decimal above. Counter shows `v`; data-val stays in kW via `scale`. */
function power(kw: number) {
  return Math.abs(kw) >= 1000 ? { v: kw / 1000, d: 1, unit: "MW", scale: 0.001 } : { v: kw, d: 0, unit: "kW", scale: 1 };
}

/** The node key of the signal in S.active (its segment). */
function activeKey(s: State, sig: Signal) {
  return Object.entries(s.active ?? {}).find(([, v]) => v.seq === sig.seq)?.[0] ?? sig.segment;
}

/** Owner reasons (STORY.md fact 19): these count as an owner saying no. stale_seq is a duplicate delivery, never one. */
const OWNER_WORDS: Record<string, string> = {
  min_soc: "kept their battery reserve",
  owner_limit: "kept their own limit",
  opt_out: "opted out",
};

// ------------------------------------------------------------------ small parts

/** A live number with its unit at half size. */
function Num({
  value,
  unit,
  d = 0,
  src,
  from,
  scale,
}: {
  value: number;
  unit?: string;
  d?: number;
  src: string;
  from?: string;
  scale?: number;
}) {
  return (
    <span className="gzF-num">
      <Counter value={value} decimals={d} src={src} from={from} scale={scale} />
      {unit && <span className="gzF-u">{unit}</span>}
    </span>
  );
}

/** A live number inside a sentence: plain text with its G2 tags, no glide (small print does not need to move). */
function Inline({
  value,
  d = 0,
  src,
  from,
  scale,
  text,
}: {
  value: number;
  d?: number;
  src: string;
  from?: string;
  scale?: number;
  text?: string;
}) {
  return (
    <span
      data-src={src}
      data-from={from}
      data-val={String(value / (scale ?? 1))}
      data-scale={scale != null && scale !== 1 ? String(scale) : undefined}
      style={{ whiteSpace: "nowrap" }}
    >
      {text ?? fmtNum(value, d)}
    </span>
  );
}

/** A signal number, "#1185" (an id, so no thousands comma). */
const Seq = ({ value, src }: { value: number; src: string }) => (
  <>
    #<Inline value={value} src={src} text={String(value)} />
  </>
);

/** Time of day or a time span shown from an ISO field: G2 traces it to the field, no data-val (STORY.md gap c). */
const Time = ({ src, children }: { src: string; children: ReactNode }) => (
  <span data-src={src} style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
    {children}
  </span>
);

function Fact({ k, value, label, small, quiet }: { k: string; value: ReactNode; label: ReactNode; small?: ReactNode; quiet?: boolean }) {
  return (
    <div className={`gzF-fact gzF-${k}`}>
      <div className={`gzF-v${quiet ? " gzF-quiet" : ""}`}>{value}</div>
      <p className="gzF-l">{label}</p>
      <div className="gzF-s">{small}</div>
    </div>
  );
}

// ------------------------------------------------------------------ P1 limited time

function P1Time({ s, tf, nowMs }: { s: State; tf: string; nowMs: number | null }) {
  const sig = signalOn(s, tf);
  const x = s.autopilot?.sim_x || 1;
  const win = sig && nowMs != null ? gridWindow(sig.valid_from, sig.valid_to, nowMs, x) : null;
  const pol = s.policy ?? {};
  const stretch = sig?.mode === "STRETCH";
  const capKey = stretch ? "max_stretch_window_min" : "max_window_min";
  const capMin = typeof pol[capKey] === "number" ? (pol[capKey] as number) : null;
  const cap =
    capMin == null ? null : stretch ? (
      <>
        never longer than <Inline value={capMin / 1440} src={`state/policy/${capKey}`} scale={1 / 1440} /> days
      </>
    ) : (
      <>
        never longer than <Inline value={capMin / 60} src={`state/policy/${capKey}`} scale={1 / 60} /> h
      </>
    );

  const capShort =
    capMin == null ? null : stretch ? (
      <>
        max <Inline value={capMin / 1440} src={`state/policy/${capKey}`} scale={1 / 1440} /> days
      </>
    ) : (
      <>
        max <Inline value={capMin / 60} src={`state/policy/${capKey}`} scale={1 / 60} /> h
      </>
    );

  if (sig && win && win.leftMin > 0) {
    const key = activeKey(s, sig);
    const S = `state/active/${key}`;
    const endH = s.sim_hour + ((Date.parse(sig.valid_to) - Date.parse(s.now)) / 3_600_000) * x;
    return (
      <Fact
        k="p1"
        value={<Countdown leftMin={win.leftMin} totalMin={win.totalMin} src={`${S}/valid_to`} />}
        label={
          <>
            ends <Time src={`${S}/valid_to`}>{hhmm(endH)}</Time>, then owner mode
          </>
        }
        small={
          <span className="gzF-line">
            Signal <Seq value={sig.seq} src={`${S}/seq`} />
            {cap && <>, {cap}</>}
          </span>
        }
      />
    );
  }

  // No signal on this street (or its window just ran out): owners decide. Say how the last one ended (the same newest
  // ended signal the story and the AI card read, useStory lastOn).
  const last = lastOn(s, tf);
  let lastLine: ReactNode = null;
  let endLine: string | null = null;
  if (sig && win) {
    const S = `state/active/${activeKey(s, sig)}`;
    lastLine = (
      <>
        Signal <Seq value={sig.seq} src={`${S}/seq`} /> is over: back to owner mode
      </>
    );
  } else if (last) {
    const { node: n, sig: r } = last;
    const ranMin = ((Date.parse(r.ended_at as string) - Date.parse(r.valid_from)) / 60_000) * x;
    const early = /released/i.test(r.ended ?? "");
    const ran = ranMin >= 90 ? `${(ranMin / 60).toFixed(ranMin >= 600 ? 0 : 1).replace(/\.0$/, "")} h` : `${Math.max(1, Math.round(ranMin))} min`;
    lastLine = (
      <>
        Last one, <Seq value={r.seq} src={`state/recent/${n}/seq`} />, ran <Time src={`state/recent/${n}/ended_at`}>{ran}</Time>
      </>
    );
    endLine = early ? "ended early" : "ended by itself";
  }
  return (
    <Fact
      k="p1"
      value={<span className="gzF-word">Owner mode</span>}
      label="no signal, owners decide"
      small={
        (lastLine || cap) && (
          <>
            {lastLine && <span className="gzF-line">{lastLine}</span>}
            {(endLine || cap) && (
              <span className="gzF-line">
                {endLine ?? "each signal"}
                {cap && <>, {capShort}</>}
              </span>
            )}
          </>
        )
      }
    />
  );
}

// ------------------------------------------------------------------ P2 owner in control

function P2Owner({ s, tf, street }: { s: State; tf: string; street: Street | null }) {
  const r = ratio(s);
  const sig = signalOn(s, tf);
  const hs = Object.values(s.households ?? {}).filter((h) => h.tf === tf && h.telemetry);
  const won: Record<string, number> = {};
  for (const h of hs) {
    const w = homes(h, r);
    const a = h.ack;
    if (!a) continue;
    const owner = a.reason && OWNER_WORDS[a.reason] && (a.status === "partial" || a.status === "refused");
    if (owner && (!sig || a.seq === sig.seq)) won[a.reason as string] = (won[a.reason as string] ?? 0) + w;
  }
  if (!street || !street.homes) {
    return <Fact k="p2" quiet value={<span className="gzF-idle">Waiting</span>} label="for the homes on this street to reply" />;
  }
  const HH = `state/households/*[tf=${tf}]`;
  const follow = street.follow;
  const total = street.homes;
  const followTag = { src: "derived", from: street.followFrom };
  const totalTag = { src: "derived", from: street.homesFrom };

  const wonTotal = Object.values(won).reduce((x, y) => x + y, 0);
  // The proof rides on the trust line's last words, so the fact never grows a line when owners say no.
  const proof =
    wonTotal > 0 ? (
      <span className="gzF-proof">
        {" "}
        <Inline value={wonTotal} src="derived" from={`sum(${HH}[ack/status in partial,refused; ack/reason in min_soc,owner_limit,opt_out]/represents)`} />{" "}
        just did
      </span>
    ) : null;

  return (
    <Fact
      k="p2"
      value={
        <span className="gzF-pair">
          <Num value={follow} {...followTag} />
          <span className="gzF-of">of</span>
          <Num value={total} unit="homes" {...totalTag} />
        </span>
      }
      label={`follow the ${street.what === "signal" ? "signal" : "diet plan"}`}
      small={
        <>
          {/* The deck's trust line, word for word (the street card says how many homes one house stands for). */}
          <span className="gzF-line gzF-trust">
            The operator asks, the house decides, the owner can always say no{proof ? "." : ""}
            {proof}
          </span>
        </>
      }
    />
  );
}

// ------------------------------------------------------------------ P3 curtailment avoided

/** kW over a street limit summed over every transformer, now, with and without Gridzilla (S.aggregates). The G2 formula
 *  lists the streets that are over; the limit is the rating in both directions when the tree says reverse == rating. */
function overLimit(s: State) {
  const out = { withKw: 0, withoutKw: 0, streets: 0, withTerms: [] as string[], withoutTerms: [] as string[], exact: true };
  for (const [tf, a] of Object.entries(s.aggregates ?? {})) {
    if (!tf.startsWith("tf:")) continue;
    const t = s.tree[tf];
    const lim = (v: number) => (v < 0 ? t?.reverse_kw ?? t?.rating_kw : t?.rating_kw) ?? null;
    const term = (field: string, v: number) =>
      v >= 0 ? `(${A(tf)}/${field} - ${A(tf)}/rating_kw)` : `(0 - ${A(tf)}/${field} - ${A(tf)}/rating_kw)`;
    for (const [field, v] of [
      ["total_kw", a.total_kw],
      ["baseline_kw", a.baseline_kw],
    ] as const) {
      if (v == null) continue;
      const L = lim(v);
      if (L == null) continue;
      const ex = Math.abs(v) - L;
      if (ex <= 0) continue;
      if (L !== a.rating_kw) out.exact = false;
      if (field === "total_kw") {
        out.withKw += ex;
        out.withTerms.push(term(field, v));
      } else {
        out.withoutKw += ex;
        out.withoutTerms.push(term(field, v));
        out.streets += 1;
      }
    }
  }
  return out;
}

function P3Curtail({ s, city }: { s: State; city: FlattenPlan | null }) {
  const o = overLimit(s);
  const tag = (terms: string[], field: string) =>
    !o.exact
      ? `sum(state/aggregates/tf:*/${field} over its limit)`
      : terms.length
        ? terms.join(" + ")
        : "0";
  const W = power(o.withKw);
  const N = power(o.withoutKw);
  const room = city && city.batt_kwh_free > 0.5 ? power(city.batt_kwh_free) : null;
  // One small line: what Gridzilla avoided right now, else the battery room kept for solar (generation not curtailed).
  let line: ReactNode = "Without Gridzilla too, every street is inside its limit now";
  if (o.withoutKw > 0.5)
    line = (
      <>
        Without Gridzilla <Inline value={N.v} d={N.d} scale={N.scale} src="derived" from={tag(o.withoutTerms, "baseline_kw")} />{" "}
        {N.unit} over on{" "}
        <Inline value={o.streets} src="derived" from="count(state/aggregates/tf:*[abs(baseline_kw) > rating_kw])" />{" "}
        {o.streets === 1 ? "street" : "streets"}
      </>
    );
  else if (room)
    line = (
      <>
        <Inline value={room.v} d={room.d} scale={room.scale} src={`${FC}/plan/batt_kwh_free`} />{" "}
        {room.unit === "MW" ? "MWh" : "kWh"} battery room kept for solar
      </>
    );
  return (
    <Fact
      k="p3"
      value={<Num value={W.v} d={W.d} unit={W.unit} scale={W.scale} src="derived" from={tag(o.withTerms, "total_kw")} />}
      label={o.withKw > 0.5 ? "still over a street limit" : "over a limit: nobody cut off"}
      small={<span className="gzF-line">{line}</span>}
    />
  );
}

// ------------------------------------------------------------------ P4 grid expansion deferred

function P4Expansion({ s, city }: { s: State; city: FlattenPlan | null }) {
  const tfs = city?.tfs ?? [];
  if (tfs.length) {
    const over = tfs.filter((t) => t.peak_naive_pct > 100).length;
    const saved = tfs.filter((t) => t.peak_naive_pct > 100 && t.peak_plan_pct <= 100).length;
    const still = tfs.filter((t) => t.peak_plan_pct > 100).length;
    const fits = tfs.length - still;
    const T = `${FC}/plan/tfs`;
    const stillLine =
      still === 0 ? (
        "With the diet plan every street's peak fits its rating"
      ) : (
        <>
          <Inline value={still} src="derived" from={`count(${T}/*[peak_plan_pct > 100])`} /> still pass their rating with the plan
        </>
      );
    if (over > 0) {
      return (
        <Fact
          k="p4"
          value={<Num value={saved} unit="transformers" src="derived" from={`count(${T}/*[peak_naive_pct > 100 and peak_plan_pct <= 100])`} />}
          label="need no upgrade tonight"
          small={
            <span className="gzF-line">
              {saved === over ? (
                <>
                  Without the plan <Inline value={over} src="derived" from={`count(${T}/*[peak_naive_pct > 100])`} /> of{" "}
                  <Inline value={tfs.length} src={`${T}/length`} /> would pass their limit
                </>
              ) : still === 0 ? (
                <>
                  <Inline value={saved} src="derived" from={`count(${T}/*[peak_naive_pct > 100 and peak_plan_pct <= 100])`} /> of the{" "}
                  <Inline value={over} src="derived" from={`count(${T}/*[peak_naive_pct > 100])`} /> that would pass their limit are kept inside it
                </>
              ) : (
                stillLine
              )}
            </span>
          }
        />
      );
    }
    return (
      <Fact
        k="p4"
        value={
          <span className="gzF-pair">
            <Num value={fits} src="derived" from={`count(${T}/*[peak_plan_pct <= 100])`} />
            <span className="gzF-of">of</span>
            <Num value={tfs.length} src={`${T}/length`} />
          </span>
        }
        label="transformers fit their rating tonight"
        small={<span className="gzF-line">No upgrade needed tonight</span>}
      />
    );
  }

  // No city plan: the same claim from live load vs rating.
  let kept = 0;
  let inside = 0;
  let all = 0;
  for (const [tf, a] of Object.entries(s.aggregates ?? {})) {
    if (!tf.startsWith("tf:") || a.total_kw == null) continue;
    const t = s.tree[tf];
    const lim = (v: number) => (v < 0 ? t?.reverse_kw ?? t?.rating_kw : t?.rating_kw) ?? Infinity;
    all += 1;
    const okNow = Math.abs(a.total_kw) <= lim(a.total_kw);
    if (okNow) inside += 1;
    if (okNow && a.baseline_kw != null && Math.abs(a.baseline_kw) > lim(a.baseline_kw)) kept += 1;
  }
  if (!all) return <Fact k="p4" quiet value={<span className="gzF-idle">Waiting</span>} label="for the street transformers" />;
  return kept > 0 ? (
    <Fact
      k="p4"
      value={<Num value={kept} unit="transformers" src="derived" from="count(state/aggregates/tf:*[total_kw != null and abs(total_kw) <= rating_kw and abs(baseline_kw) > rating_kw])" />}
      label="kept under their rating now"
      small={<span className="gzF-line">No transformer upgrade needed for them</span>}
    />
  ) : (
    <Fact
      k="p4"
      value={
        <span className="gzF-pair">
          <Num value={inside} src="derived" from="count(state/aggregates/tf:*[total_kw != null and abs(total_kw) <= rating_kw])" />
          <span className="gzF-of">of</span>
          <Num value={all} src="derived" from="count(state/aggregates/tf:*[total_kw != null])" />
        </span>
      }
      label="transformers inside their rating now"
      small={<span className="gzF-line">No upgrade needed right now</span>}
    />
  );
}

// ------------------------------------------------------------------ P5 open signed profile

function P5Vendor({ s, nowMs }: { s: State; nowMs: number | null }) {
  const b = s.households?.blatnica;
  const B = "state/households/blatnica";
  const rx = b?.telemetry?.rx ? Date.parse(b.telemetry.rx) : NaN;
  const ageMin = nowMs != null && Number.isFinite(rx) ? (nowMs - rx) / 60_000 : null;
  const live = !!b && b.registered && !!b.telemetry && ageMin != null && ageMin < 5;

  let plant: ReactNode;
  if (!b || !b.registered || !b.telemetry)
    plant = <span className="gzF-line">Blatnica's plant: not connected</span>;
  else if (!live)
    plant = (
      <span className="gzF-line">
        Blatnica heard <Time src={`${B}/telemetry/rx`}>{ageMin != null ? `${Math.round(ageMin)} min` : "a while"}</Time> ago
      </span>
    );
  else if (b.ack?.seq != null)
    plant = (
      <span className="gzF-line">
        Blatnica {b.ack.status === "reverted" ? "back to owner after" : "answered"} <Seq value={b.ack.seq} src={`${B}/ack/seq`} />
        {b.ack.verified ? ", signature checked" : ""}
      </span>
    );
  else plant = <span className="gzF-line">Blatnica is live on the same signal path</span>;

  // Signatures checked end to end, over the households the platform ships (the feeder on stage + Blatnica).
  const acks = Object.values(s.households ?? {}).filter((h) => h.ack);
  const verified = acks.filter((h) => h.ack?.verified).length;
  const sigLine = acks.length ? (
    <>
      <Inline value={verified} src="derived" from="count(state/households/*[ack/verified = true])" /> of{" "}
      <Inline value={acks.length} src="derived" from="count(state/households/*[ack])" /> signed replies checked
    </>
  ) : (
    "Every signal and reply is signed"
  );

  return (
    <Fact
      k="p5"
      value={
        <span className="gzF-brands" data-src="deck" data-label="registry">
          Victron + Viessmann
        </span>
      }
      label="any maker of the box can join"
      small={
        <>
          <span className="gzF-line">{sigLine}</span>
          {plant}
        </>
      }
    />
  );
}

// ------------------------------------------------------------------ the strip

/** Fills the shell's "proof" card (Stage.tsx Card area="proof", which carries data-card and the size container). */
export default function Facts({ st }: { st: StoryState }) {
  const { s, tf, story } = st;
  const nowMs = useServerNow(s?.now);
  const city = useFlatten(REGION).plan;
  if (!s || !tf) return null;
  return (
    <div className="gzF" aria-label={`What the judges asked for, live on ${nice(tf)}`}>
      <P1Time s={s} tf={tf} nowMs={nowMs} />
      <P2Owner s={s} tf={tf} street={story?.street ?? null} />
      <P3Curtail s={s} city={city} />
      <P4Expansion s={s} city={city} />
      <P5Vendor s={s} nowMs={nowMs} />
    </div>
  );
}
