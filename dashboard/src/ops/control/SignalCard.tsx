// Signal card: the signals running now (countdown + Release) and the composer (segment, mode, the fields that mode may
// carry, window, cohort, note). Sign and publish, Ask the AI and Replay last call the same endpoints with the same bodies
// as the team board's Manual tab.
import { useEffect, useMemo, useState } from "react";
import { post, type Mode, type Proposal, type Signal, type State } from "../../api";
import { hhmm, pathOf } from "../../model";
import type { Ops } from "../useOps";
import { Btn, Card, Result, Seg, Spark, clock, useAction, useNow } from "./ui";
import { tip } from "../views/fmt";
import {
  ALL_FIELDS, FIELD, LEVEL_LABEL, MODES, MODE_FIELDS, MODE_LABEL, defaultDuration, fieldLine, homesUnder, kindWord, levelOf, segName, signalFields,
  type Field, type Level,
} from "./modes";

const defaults = () => Object.fromEntries(ALL_FIELDS.map((f) => [f, String(FIELD[f].def)])) as Record<Field, string>;
const num = (v: string) => (v.trim() === "" || !Number.isFinite(+v) ? null : +v);

/** The ancestor of `n` at `level` ("feeder:erdberg-4" for a transformer on it). */
const at = (s: State, n: string, level: Level) => pathOf(s, n).find((x) => x.startsWith(level + ":")) ?? "";

/** The worst forecast peak of the transformers under a node, for the AI question. */
function worstUnder(s: State, n: string) {
  let best: { tf: string; pct: number; h: number } | null = null;
  for (const [tf, p] of Object.entries(s.forecast_peak ?? {}))
    if ((tf === n || pathOf(s, tf).includes(n)) && (!best || Math.abs(p.pct) > Math.abs(best.pct))) best = { tf, ...p };
  return best;
}

export default function SignalCard({ ops }: { ops: Ops }) {
  const s = ops.s as State;
  return (
    <Card title="Signals" aside={<span className="cp-sub cp-mono" {...tip("How many signals run now, and the number of the last message the platform signed")}>{Object.keys(s.active).length} running · last signed #{s.seq}</span>}>
      <ActiveList ops={ops} />
      <div className="cp-divider" />
      <Composer ops={ops} />
    </Card>
  );
}

export function ActiveList({ ops }: { ops: Ops }) {
  const s = ops.s as State;
  const now = useNow();
  const act = useAction();
  const rows = Object.entries(s.active).sort((a, b) => b[1].seq - a[1].seq);

  const release = (n: string, sig: Signal) =>
    act.run(n, async () => {
      // The board releases by signing RELEASE for the segment (Manual tab, RELEASE mode: no fields, 120 min window).
      const r = (await post("signal", { segment: n, mode: "RELEASE", duration_min: defaultDuration("RELEASE"), start_in_min: 0, note: "" })) as Signal;
      ops.reload();
      return `Released ${segName(n)} (#${sig.seq}) with #${r.seq}: ${homesUnder(s, n)} homes are back in owner mode.`;
    }, (m) => `Guard refused the release: ${m}`);

  return (
    <div className="cp-active">
      {rows.length === 0 && <div className="cp-empty">No signal running. Owners run their batteries as they like.</div>}
      {rows.map(([n, sig]) => {
        const a = Date.parse(sig.valid_from), b = Date.parse(sig.valid_to);
        const pending = now < a;
        const frac = Math.max(0, Math.min(1, (now - a) / (b - a)));
        const env = sig.envelope ? sig.envelope.import_max_kw ?? sig.envelope.export_max_kw : null;
        return (
          <div className="cp-sig" key={n} {...tip(`${MODE_LABEL[sig.mode] ?? sig.mode} on ${segName(n)}: the houses under it follow this signal until its time runs out; Release hands them back early`)}>
            <div className="cp-sig-top">
              <span className="cp-strong">{MODE_LABEL[sig.mode] ?? sig.mode}</span>
              <span className="cp-code">{sig.mode}</span>
              <span className="cp-sub cp-wrap" data-src={`state/active/${n}/segment`}>on {segName(n)}</span>
              {sig.cohort && (
                <span className="cp-sub">
                  wave <span data-src="derived" data-from={`state/active/${n}/cohort/0 + 1`} data-val={sig.cohort[0] + 1}>{sig.cohort[0] + 1}</span> of{" "}
                  <span data-src={`state/active/${n}/cohort/1`} data-val={sig.cohort[1]}>{sig.cohort[1]}</span>
                </span>
              )}
              <span className="cp-grow" />
              <span className="cp-mono cp-count" data-src="axis" title={`${sig.valid_from.slice(11, 16)}–${sig.valid_to.slice(11, 16)} UTC`}>
                {pending ? `starts in ${clock(a - now)}` : `${clock(b - now)} left`}
              </span>
            </div>
            <div className="cp-bar" aria-hidden><i style={{ width: `${frac * 100}%` }} /></div>
            <div className="cp-sig-bot">
              <span className="cp-sub cp-wrap">
                signed #<span data-src={`state/active/${n}/seq`} data-val={sig.seq}>{sig.seq}</span> ·{" "}
                <FieldsLine n={n} sig={sig} />
                {env && (
                  <>
                    {" · "}
                    <span data-src="derived" data-from={`count(state/active/${n}/envelope/${sig.envelope?.import_max_kw ? "import_max_kw" : "export_max_kw"}/*)`} data-val={env.length}>{env.length}</span> time slots
                  </>
                )}
              </span>
              {env && <Spark curve={env} w={64} h={18} />}
              <Btn small busy={act.busy === n} disabled={!!act.busy} onClick={() => release(n, sig)} title={`Sign RELEASE for ${n}`}>Release</Btn>
            </div>
          </div>
        );
      })}
      <Result out={act.out} />
    </div>
  );
}

/** The signal's fields in words, tagged with the first field it states (data-truth gate). */
function FieldsLine({ n, sig }: { n: string; sig: Signal }) {
  const f = signalFields(sig);
  const first = Object.entries(f).find(([, v]) => v != null);
  const text = fieldLine(f) || MODE_LABEL[sig.mode];
  return first ? <span data-src={`state/active/${n}/${first[0]}`} data-val={String(first[1])}>{text}</span> : <span>{text}</span>;
}

export function Composer({ ops }: { ops: Ops }) {
  const s = ops.s as State;
  const act = useAction();
  const [level, setLevel] = useState<Level>("tf");
  const [picked, setPicked] = useState<string | null>(null); // null = follow the transformer selected in the city
  const [mode, setMode] = useState<Mode>("SUPPORT");
  const [vals, setVals] = useState<Record<Field, string>>(defaults);
  const [dur, setDur] = useState(String(defaultDuration("SUPPORT")));
  const [startIn, setStartIn] = useState("0");
  const [ck, setCk] = useState("");
  const [cn, setCn] = useState("");
  const [note, setNote] = useState("");
  const [situation, setSituation] = useState("");
  const [advice, setAdvice] = useState<Proposal | null>(null);

  const followed = ops.tf ? at(s, ops.tf, level) : "";
  const segment = picked && levelOf(picked) === level ? picked : followed;
  useEffect(() => setPicked(null), [ops.tf]);

  const options = useMemo(() => Object.keys(s.tree).filter((n) => n.startsWith(level + ":")).sort((a, b) => segName(a).localeCompare(segName(b), undefined, { numeric: true })), [s.tree, level]);

  const pickMode = (m: Mode) => {
    setMode(m);
    setDur(String(defaultDuration(m))); // board: changing the mode resets the window to that mode's default
  };

  const cohort = ck !== "" && cn !== "" ? [+ck, +cn] : null;
  const cohortBad = (ck !== "") !== (cn !== "") || (cohort != null && !(cohort[0] >= 0 && cohort[0] < cohort[1] && cohort[1] <= 16));

  const body = () => {
    const b: Record<string, unknown> = { segment, mode, duration_min: +dur, start_in_min: +startIn, note };
    if (cohort) b.cohort = cohort;
    MODE_FIELDS[mode].forEach((f) => (b[f] = num(vals[f])));
    return b;
  };

  const publish = () =>
    act.run("sign", async () => {
      const r = (await post("signal", body())) as Signal;
      ops.reload();
      const waves = !cohort && r.cohort ? ` in ${r.cohort[1]} waves` : "";
      const homes = homesUnder(s, segment);
      return mode === "RELEASE"
        ? `Signed #${r.seq}: ${homes} homes on ${segName(segment)} are back in owner mode.`
        : `Signed #${r.seq} and sent ${mode} to ${homes} homes on ${segName(segment)}${waves}.`;
    }, (m) => `Guard refused: ${m}`);

  const autoSituation = () => {
    const w = worstUnder(s, segment);
    const where = `${kindWord(segment)} ${segName(segment)} (${segment})`;
    return w
      ? `${where}: worst transformer ${w.tf} forecast ${w.pct > 0 ? "+" : ""}${w.pct} % at ${hhmm(w.h)} grid time. Propose one signal for it.`
      : `${where}: propose one signal if it needs one.`;
  };

  const ask = () =>
    act.run("ask", async () => {
      setAdvice(null);
      const p = (await post("advise", { situation: situation.trim() || autoSituation() })) as Proposal;
      setAdvice(p);
      if (p.mode === "NONE") return `The AI says no signal is needed (${((p.latency_ms ?? 0) / 1000).toFixed(1)} s)${p.rationale ? `: ${p.rationale}` : "."}`;
      return `The AI answered in ${((p.latency_ms ?? 0) / 1000).toFixed(1)} s${p.guard ? ", but the guard would refuse it" : ", guard passed"}.`;
    }, (m) => (m.includes("GZ_LLM_URL") ? "No AI is connected to this platform." : `The AI did not answer: ${m}`));

  const loadAdvice = (p: Proposal) => {
    if (p.segment && s.tree[p.segment]) {
      const l = levelOf(p.segment);
      if (l) {
        setLevel(l);
        setPicked(p.segment);
      }
    }
    if (p.mode && (MODES as string[]).includes(p.mode)) setMode(p.mode as Mode);
    setVals((v) => {
      const n = { ...v };
      Object.entries(p.fields ?? {}).forEach(([k, x]) => {
        if (x != null && k in n) n[k as Field] = String(x);
      });
      return n;
    });
    setDur(String(p.duration_min || 120)); // board's fill(): the proposal's minutes go into the window as they are
    setStartIn(String((p as { start_in_min?: number }).start_in_min || 0));
    setNote(p.note || "");
    act.clear();
  };

  const seqs = Object.values(s.active).map((x) => x.seq);
  const lastSeq = seqs.length ? Math.max(...seqs) : null;
  const replay = () =>
    act.run("replay", async () => {
      await post(`replay/${lastSeq}`);
      ops.reload();
      return `Replayed #${lastSeq} unchanged. Every house should refuse it as a stale copy.`;
    });

  const fields = MODE_FIELDS[mode];
  const durOk = Number.isFinite(+dur) && +dur > 0 && Number.isInteger(+dur);
  const startOk = Number.isFinite(+startIn) && Number.isInteger(+startIn) && +startIn >= 0;
  const canSign = !!segment && durOk && startOk && !cohortBad && fields.every((f) => num(vals[f]) != null);

  return (
    <div className="cp-compose">
      <div className="cp-eyebrow">Compose</div>
      <div className="cp-field">
        <span className="cp-label">Where</span>
        <Seg label="Segment level" value={level} onChange={(l) => { setLevel(l); setPicked(null); }}
          options={(["sub", "feeder", "tf"] as Level[]).map((l) => ({ v: l, label: LEVEL_LABEL[l] }))} />
        <select className="cp-input cp-select" aria-label="Segment" value={segment} onChange={(e) => setPicked(e.target.value)}>
          {!segment && <option value="">Pick a {LEVEL_LABEL[level].toLowerCase()}</option>}
          {options.map((n) => (
            <option key={n} value={n}>{segName(n)}{n === followed ? " (selected in the city)" : ""}</option>
          ))}
        </select>
        <span className="cp-sub cp-mono">{segment} · {homesUnder(s, segment)} homes under it</span>
      </div>

      <div className="cp-field">
        <span className="cp-label">What</span>
        <div className="cp-modes" role="radiogroup" aria-label="Mode">
          {MODES.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={m === mode} className="cp-mode" onClick={() => pickMode(m)}>
              <span className="cp-mode-name">{MODE_LABEL[m]}</span>
              <span className="cp-code">{m}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="cp-grid">
        {fields.map((f) => (
          <label className="cp-num" key={f}>
            <span className="cp-label">{FIELD[f].label} <span className="cp-code">{f}</span></span>
            <span className="cp-unit-wrap">
              <input className="cp-input" type="number" inputMode="decimal" step={FIELD[f].step} value={vals[f]} onChange={(e) => setVals({ ...vals, [f]: e.target.value })} />
              <span className="cp-unit">{FIELD[f].unit}</span>
            </span>
          </label>
        ))}
        <label className="cp-num">
          <span className="cp-label">Duration</span>
          <span className="cp-unit-wrap">
            <input className="cp-input" type="number" min={1} step={1} value={dur} onChange={(e) => setDur(e.target.value)} aria-invalid={!durOk} />
            <span className="cp-unit">min</span>
          </span>
        </label>
        <label className="cp-num">
          <span className="cp-label">Start in</span>
          <span className="cp-unit-wrap">
            <input className="cp-input" type="number" min={0} step={1} value={startIn} onChange={(e) => setStartIn(e.target.value)} aria-invalid={!startOk} />
            <span className="cp-unit">min</span>
          </span>
        </label>
        <label className="cp-num">
          <span className="cp-label">Cohort <span className="cp-sub">blank = everyone</span></span>
          <span className="cp-cohort">
            <input className="cp-input" type="number" min={0} placeholder="k" value={ck} onChange={(e) => setCk(e.target.value)} aria-label="Cohort k" aria-invalid={cohortBad} />
            <span className="cp-sub">of</span>
            <input className="cp-input" type="number" min={1} max={16} placeholder="n" value={cn} onChange={(e) => setCn(e.target.value)} aria-label="Cohort n" aria-invalid={cohortBad} />
          </span>
        </label>
      </div>
      {fields.length === 0 && <div className="cp-sub">Hand back carries no limits: every house under {segName(segment) || "the segment"} returns to owner mode, and the signals below it end.</div>}

      <label className="cp-num">
        <span className="cp-label">Note to owners</span>
        <input className="cp-input" placeholder={`${segName(segment) || "Transformer"} near its limit 17:00–19:00`} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>

      <div className="cp-actions">
        <Btn tone="primary" busy={act.busy === "sign"} disabled={!canSign || !!act.busy} onClick={publish}>Sign and publish</Btn>
        <Btn busy={act.busy === "ask"} disabled={!!act.busy || !segment} onClick={ask} title="Ask the AI for one proposal; the guard and you decide">Ask the AI</Btn>
        <Btn tone="quiet" busy={act.busy === "replay"} disabled={!!act.busy || lastSeq == null} onClick={replay} title={lastSeq == null ? "No active signal to replay" : `Re-publish #${lastSeq} unchanged`}>
          Replay last
        </Btn>
      </div>
      <input
        className="cp-input cp-input-quiet"
        aria-label="Question for the AI"
        placeholder={`Question for the AI (blank: asks about ${segName(segment) || "the selection"})`}
        value={situation}
        onChange={(e) => setSituation(e.target.value)}
      />
      <Result out={act.out} />
      {advice && advice.mode && advice.mode !== "NONE" && (
        <div className="cp-advice">
          <div className="cp-prop-main">
            <span className="cp-strong">{MODE_LABEL[advice.mode as Mode] ?? advice.mode}</span>
            <span className="cp-code">{advice.mode}</span>
            <span className="cp-sub">on {segName(advice.segment)} · {advice.duration_min} min</span>
          </div>
          {fieldLine(advice.fields) && <div className="cp-sub">{fieldLine(advice.fields)}</div>}
          {advice.rationale && <p className="cp-why">{advice.rationale}</p>}
          <div className="cp-row-between">
            {advice.guard ? <span className="cp-tag is-err">guard: {advice.guard}</span> : <span className="cp-tag">guard passed</span>}
            <Btn small onClick={() => loadAdvice(advice)}>Load into form</Btn>
          </div>
        </div>
      )}
    </div>
  );
}
