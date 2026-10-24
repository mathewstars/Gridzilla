// Diet plan: dad's Flattening tab (platform/static/index.html, drawFlat) in our dark theme. A node chooser (Vienna, a
// substation, a feeder, a street), six number tiles, the next 24 grid hours as one chart (without / with / load nobody
// controls / level / limit), the four "how it works" steps with the live numbers, and every transformer in the plan
// with its peak without -> with. Source: /api/flatten?node=<node> (useFlatten, every 5 s). Every number carries
// data-src/data-val (qa/README.md); chart ticks are data-src="axis".
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFlatten, type FlattenPlan, type FlattenTf, type State } from "../../api";
import { hhmm, nice } from "../../model";
import { P } from "../../stage/palette";
import type { Ops } from "../useOps";
import "./plan.css";

const CITY = "region:at";

/** A number with its source: shown text, raw value, and the scale when shown in other units. */
function N({ src, from, val, scale, children }: { src: string; from?: string; val: number; scale?: number; children: ReactNode }) {
  return (
    <span data-src={from ? "derived" : src} data-from={from} data-val={String(val)} data-scale={scale && scale !== 1 ? String(scale) : undefined}>
      {children}
    </span>
  );
}

function useUnits(p: FlattenPlan) {
  const big = p.rating_kw >= 10000;
  // kW or MW, with the scale for the truth gate
  const pw = (kw: number) => (big ? { t: `${(kw / 1000).toFixed(2)} MW`, scale: 0.001 } : { t: `${Math.round(kw)} kW`, scale: 1 });
  const en = (kwh: number) => (kwh >= 1000 ? { t: `${(kwh / 1000).toFixed(1)} MWh`, scale: 0.001 } : { t: `${Math.round(kwh)} kWh`, scale: 1 });
  return { big, pw, en };
}

// ------------------------------------------------------------------ node chooser (dad's chips)
function Chooser({ s, node, set }: { s: State; node: string; set: (n: string) => void }) {
  const t = s.tree;
  const subs = Object.keys(t).filter((n) => n.startsWith("sub:"));
  const feederOf = node.startsWith("tf:") ? t[node]?.parent ?? "" : node.startsWith("feeder:") ? node : "";
  const subOf = feederOf ? t[feederOf]?.parent ?? "" : node.startsWith("sub:") ? node : "";
  const streets = feederOf ? Object.keys(t).filter((n) => n.startsWith("tf:") && t[n].parent === feederOf) : [];
  const B = ({ n, label, on, kind }: { n: string; label: string; on: boolean; kind: string }) => (
    <button type="button" className={`pl-chip is-${kind}${on ? " is-on" : ""}`} aria-pressed={on} onClick={() => set(n)}>
      {label}
    </button>
  );
  return (
    <div className="pl-chooser" role="group" aria-label="Choose what the plan is for">
      <div className="pl-row">
        <span className="pl-rowlabel">City</span>
        <B n={CITY} label="Vienna" on={node === CITY} kind="city" />
      </div>
      <div className="pl-row">
        <span className="pl-rowlabel">Substation</span>
        {subs.map((n) => <B key={n} n={n} label={nice(n)} on={n === subOf} kind="sub" />)}
      </div>
      {subOf && (
        <div className="pl-row">
          <span className="pl-rowlabel">Feeder</span>
          {Object.keys(t).filter((f) => f.startsWith("feeder:") && t[f].parent === subOf).map((n) => <B key={n} n={n} label={nice(n)} on={n === feederOf} kind="feeder" />)}
        </div>
      )}
      {streets.length > 0 && (
        <div className="pl-row">
          <span className="pl-rowlabel">Street</span>
          {streets.map((n) => <B key={n} n={n} label={nice(n)} on={n === node} kind="tf" />)}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ chart
function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [wh, set] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => set({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, ...wh };
}

const C = { without: "var(--color-secondary)", with: P.blue, nobody: "var(--pl-nobody)", level: P.green, limit: P.red, eaten: P.orange };

function Chart({ p }: { p: FlattenPlan }) {
  const { ref, w, h } = useSize<HTMLDivElement>();
  const big = p.rating_kw >= 10000;
  const unc = p.other_kw.map((o, i) => o + p.base_kw[i] - p.pv_kw[i]);
  const dataMax = Math.max(...p.naive_kw, ...p.planned_kw);
  const ratingNear = p.rating_kw < dataMax * 2.2;
  const lo = Math.min(0, ...p.naive_kw, ...p.planned_kw, ...unc);
  const hi = (ratingNear ? Math.max(p.rating_kw, dataMax) : dataMax) * 1.08;
  // nice ticks
  const span = hi - lo || 1;
  const raw = span / 5;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(v);
  const yTick = (v: number) => (big ? `${(v / 1000).toFixed(step >= 1000 ? 0 : 1)} MW` : `${Math.round(v)} kW`);

  const padL = 76, padR = 12, padT = 10, padB = 30;
  const n = p.hours.length;
  const x = (i: number) => padL + (i / Math.max(1, n - 1)) * (w - padL - padR);
  const y = (v: number) => padT + (1 - (v - lo) / span) * (h - padT - padB);
  const line = (arr: number[]) => arr.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const area = (arr: number[]) => `${line(arr)}L${x(n - 1).toFixed(1)},${y(0).toFixed(1)}L${x(0).toFixed(1)},${y(0).toFixed(1)}Z`;
  // eaten: between "without" (above) and "with", only where without is higher
  const eaten = (() => {
    const top = p.naive_kw.map((v, i) => Math.max(v, p.planned_kw[i]));
    const fwd = top.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
    const back = p.planned_kw.map((_, j) => { const i = n - 1 - j; return `L${x(i).toFixed(1)},${y(p.planned_kw[i]).toFixed(1)}`; }).join("");
    return `${fwd}${back}Z`;
  })();
  // x ticks: every 3 grid hours, on the slot closest to a whole hour
  const xt: number[] = [];
  const every = w < 520 ? 6 : 3; // phones: a tick every 6 grid hours so the labels never touch
  for (let i = 0; i < n; i++) {
    const hr = ((p.hours[i] % 24) + 24) % 24;
    const prev = i ? ((p.hours[i - 1] % 24) + 24) % 24 : -1;
    if (i && Math.floor(hr / every) !== Math.floor(prev / every)) xt.push(i);
  }
  const ok = w > 120 && h > 80;
  return (
    <div className="pl-plot" ref={ref}>
      {ok && (
        <svg width={w} height={h} role="img" aria-label="The next 24 grid hours without and with the diet plan">
          <g data-src="axis" className="pl-axis">
            {ticks.map((v) => (
              <g key={v}>
                <line x1={padL} x2={w - padR} y1={y(v)} y2={y(v)} stroke="var(--color-fill)" strokeWidth={v === 0 ? 1.5 : 1} />
                <text x={padL - 8} y={y(v)} dy="0.35em" textAnchor="end">{yTick(v)}</text>
              </g>
            ))}
            {xt.map((i) => (
              <text key={i} x={x(i)} y={h - 8} textAnchor="middle">{hhmm(Math.round(p.hours[i]))}</text>
            ))}
          </g>
          <path d={area(unc)} fill="var(--pl-nobody)" fillOpacity={0.35} stroke="var(--pl-nobody)" strokeWidth={1} />
          <path d={area(p.planned_kw)} fill={C.with} fillOpacity={0.16} stroke="none" />
          <path d={eaten} fill={C.eaten} fillOpacity={0.35} stroke="none" />
          <path d={line(p.naive_kw)} fill="none" stroke={C.without} strokeWidth={2} strokeDasharray="6 5" />
          <path d={line(p.planned_kw)} fill="none" stroke={C.with} strokeWidth={2.75} />
          <line x1={padL} x2={w - padR} y1={y(p.level_kw)} y2={y(p.level_kw)} stroke={C.level} strokeWidth={1.75} strokeDasharray="4 4" />
          {ratingNear && <line x1={padL} x2={w - padR} y1={y(p.rating_kw)} y2={y(p.rating_kw)} stroke={C.limit} strokeWidth={1.75} strokeDasharray="8 5" />}
        </svg>
      )}
    </div>
  );
}

function Legend({ ratingNear }: { ratingNear: boolean }) {
  const items: [string, string, string][] = [
    ["dash", C.without, "without Gridzilla: every car charges the moment it is plugged in"],
    ["line", C.with, "with the diet plan"],
    ["box", "var(--pl-nobody)", "load nobody controls (other houses + base − solar)"],
    ["box", C.eaten, "peak eaten"],
    ["dash", C.level, "level L: the flattest the street can be"],
    ...(ratingNear ? ([["dash", C.limit, "limit of the transformer"]] as [string, string, string][]) : []),
  ];
  return (
    <ul className="pl-legend">
      {items.map(([k, c, t]) => (
        <li key={t}><i className={`pl-key is-${k}`} style={{ ["--k" as string]: c }} />{t}</li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ view
export default function PlanView({ ops }: { ops: Ops }) {
  const [node, setNode] = useState(CITY);
  const f = useFlatten(node);
  const s = ops.s;
  if (!s) return null;
  const d = f.data;
  const p = f.plan;
  const name = node === CITY ? "Vienna, all transformers" : `${nice(node)} ${node.split(":")[0] === "tf" ? "street" : node.split(":")[0] === "sub" ? "substation" : "feeder"}`;

  return (
    <div className="vw pl" data-scroll="view">
      <header className="pl-head">
        <div className="pl-titles">
          <h1 className="pl-title">Diet plan</h1>
          <p className="pl-desc">
            How Gridzilla flattens the next <span data-src="axis">24</span> grid hours.{" "}
            {d && (d.enabled ? (
              <>
                Plan renewed <span data-src="axis">{d.renewed_at ? `${d.renewed_at.slice(11, 16)} UTC` : "soon"}</span>, round{" "}
                <N src={`flatten:${node}/rounds`} val={d.rounds}>{d.rounds}</N>, every two grid hours.
              </>
            ) : <b>The diet plan is switched off.</b>)}
          </p>
        </div>
        <Chooser s={s} node={node} set={setNode} />
      </header>
      {!p ? (
        <div className="panel pl-wait">{f.missing ? "This platform has no diet plan." : d && !d.enabled ? "The diet plan is switched off; houses keep their last plan until it runs out." : d ? "No houses in the program here." : "Loading the plan"}</div>
      ) : (
        <Body p={p} node={node} name={name} />
      )}
    </div>
  );
}

function Body({ p, node, name }: { p: FlattenPlan; node: string; name: string }) {
  const { big, pw, en } = useUnits(p);
  const F = `flatten:${node}/plan`;
  const eaten = p.peak_naive_kw - p.peak_plan_kw;
  const eatenFrom = `${F}/peak_naive_kw - ${F}/peak_plan_kw`;
  const eatenPct = p.peak_naive_kw ? Math.round((100 * eaten) / p.peak_naive_kw) : 0;
  const dataMax = Math.max(...p.naive_kw, ...p.planned_kw);
  const ratingNear = p.rating_kw < dataMax * 2.2;
  const tone = (pct: number) => (pct >= 100 ? P.red : pct >= 85 ? P.orange : P.green);
  const Pw = ({ k, kw }: { k: string; kw: number }) => { const v = pw(kw); return <N src={`${F}/${k}`} val={kw} scale={v.scale}>{v.t}</N>; };
  const En = ({ k, kwh }: { k: string; kwh: number }) => { const v = en(kwh); return <N src={`${F}/${k}`} val={kwh} scale={v.scale}>{v.t}</N>; };
  const Pc = ({ k, v }: { k: string; v: number }) => <N src={`${F}/${k}`} val={v}>{v} %</N>;

  const tfs: (FlattenTf & { i: number })[] = useMemo(
    () => (p.tfs ? p.tfs.map((t, i) => ({ ...t, i })) : [{ tf: p.tf, rating_kw: p.rating_kw, level_kw: p.level_kw, peak_naive_pct: p.peak_naive_pct, peak_plan_pct: p.peak_plan_pct, houses: p.houses, ev_houses: p.ev_houses, i: -1 }]).sort((a, b) => b.peak_naive_pct - a.peak_naive_pct),
    [p],
  );
  const tfSrc = (t: { i: number }, k: string) => (t.i < 0 ? `${F}/${k}` : `${F}/tfs/${t.i}/${k}`);
  const worstWithout = tfs.reduce((a, t) => (t.peak_naive_pct > a.peak_naive_pct ? t : a), tfs[0]);
  const worstWith = tfs.reduce((a, t) => (t.peak_plan_pct > a.peak_plan_pct ? t : a), tfs[0]);
  const ratingText = big ? `${(p.rating_kw / 1000).toFixed(0)} MVA` : `${p.rating_kw} kVA`;

  const tiles: { t: string; v: ReactNode; d: ReactNode; c?: string }[] = [
    { t: "Peak without Gridzilla", v: <Pw k="peak_naive_kw" kw={p.peak_naive_kw} />, d: <><Pc k="peak_naive_pct" v={p.peak_naive_pct} /> of the limit, every car charging the moment it is plugged in</>, c: p.peak_naive_pct >= 85 ? tone(p.peak_naive_pct) : undefined },
    { t: "Peak with the diet plan", v: <Pw k="peak_plan_kw" kw={p.peak_plan_kw} />, d: <><Pc k="peak_plan_pct" v={p.peak_plan_pct} /> of the limit, level L = <Pw k="level_kw" kw={p.level_kw} /></>, c: P.green },
    { t: "Peak eaten", v: <N src="" from={eatenFrom} val={eaten} scale={pw(eaten).scale}>{pw(eaten).t}</N>, d: <><N src="" from={`(${eatenFrom}) / ${F}/peak_naive_kw * 100`} val={eatenPct}>{eatenPct} %</N> off the top, <En k="shaved_kwh" kwh={p.shaved_kwh} /> from home batteries</>, c: P.orange },
    { t: "Car charging moved", v: <En k="shifted_kwh" kwh={p.shifted_kwh} />, d: <>into the night valley, {p.cars_full ? <>every car full by <span data-src="axis">{hhmm(7)}</span></> : "not all cars full: the level was raised"}</> },
    { t: "Noon export level", v: <Pw k="export_level_kw" kw={p.export_level_kw} />, d: <>solar above this goes into batteries, not the feeder</> },
    { t: "Free battery room", v: <En k="batt_kwh_free" kwh={p.batt_kwh_free} />, d: <>to soak up the noon solar surplus</> },
  ];

  return (
    <>
      <section className="pl-tiles" aria-label="The plan in numbers">
        {tiles.map((x) => (
          <div key={x.t} className="panel pl-tile">
            <div className="pl-tile-t">{x.t}</div>
            <div className="pl-tile-v" style={x.c ? { color: x.c } : undefined}>{x.v}</div>
            <div className="pl-tile-d">{x.d}</div>
          </div>
        ))}
      </section>
      <div className="pl-main">
        <section className="panel pl-chart">
          <header className="pl-chart-head">
            <h2 className="pl-h2">
              {name}: next <span data-src="axis">24</span> grid hours from <span data-src="axis">{hhmm(p.start_h)}</span>, limit{" "}
              <N src={`${F}/rating_kw`} val={p.rating_kw} scale={big ? 0.001 : 1}>{ratingText}</N>
            </h2>
            <p className="pl-delta">
              <N src="" from={eatenFrom} val={eaten} scale={pw(eaten).scale}>{pw(eaten).t}</N> off the peak:{" "}
              <Pc k="peak_naive_pct" v={p.peak_naive_pct} /> → <Pc k="peak_plan_pct" v={p.peak_plan_pct} /> of the limit
              {!ratingNear && ", the limit is far above this chart"}
            </p>
          </header>
          <Chart p={p} />
          <Legend ratingNear={ratingNear} />
        </section>
        <aside className="pl-side">
          <section className="panel pl-card">
            <h2 className="pl-h2">How it works</h2>
            <ol className="pl-steps">
              <li>
                <b><span data-src="axis">1</span> Sense.</b> Forecast what nobody controls: the base load and solar of{" "}
                <N src={`${F}/houses`} val={p.houses}>{p.houses.toLocaleString("en-US")}</N> program houses
                (<N src={`${F}/ev_houses`} val={p.ev_houses}>{p.ev_houses.toLocaleString("en-US")}</N> with a car) and the houses outside the program, weather-aware.
              </li>
              <li>
                <b><span data-src="axis">2</span> Count the flexibility.</b> <En k="ev_kwh" kwh={p.ev_kwh} /> of car charging that must be done by <span data-src="axis">{hhmm(7)}</span>,{" "}
                <En k="batt_kwh_usable" kwh={p.batt_kwh_usable} /> of battery for the peak, <En k="batt_kwh_free" kwh={p.batt_kwh_free} /> of battery room for the noon solar.
              </li>
              <li>
                <b><span data-src="axis">3</span> Water-fill.</b> Find the lowest level L = <Pw k="level_kw" kw={p.level_kw} /> where the cars fit in the night valley below it and the peak above it fits in the batteries. L is the flattest shape physics allows.
              </li>
              <li>
                <b><span data-src="axis">4</span> Send the ceilings.</b> Every quarter hour gets a per-house import ceiling and an export ceiling (<Pw k="export_level_kw" kw={p.export_level_kw} /> at noon), signed, renewed every two grid hours as one SHAPE signal per feeder. Owner limits still win.
              </li>
            </ol>
          </section>
          <section className="panel pl-card pl-tfcard">
            <h2 className="pl-h2">
              Transformers in this plan: <N src="" from={p.tfs ? `count(${F}/tfs/*)` : "1"} val={tfs.length}>{tfs.length}</N>
            </h2>
            <p className="pl-sub">
              Worst without: <N src={tfSrc(worstWithout, "peak_naive_pct")} val={worstWithout.peak_naive_pct}>{worstWithout.peak_naive_pct} %</N>, worst with:{" "}
              <N src={tfSrc(worstWith, "peak_plan_pct")} val={worstWith.peak_plan_pct}>{worstWith.peak_plan_pct} %</N> of the limit
            </p>
            <ul className="pl-tfs" data-scroll="list">
              {tfs.map((t) => (
                <li key={t.tf} title={`${nice(t.tf)}: ${t.houses} houses, ${t.ev_houses} cars, level L = ${t.level_kw} kW`}>
                  <span className="pl-tf-n">{nice(t.tf)}</span>
                  <span className="pl-tf-v">
                    <N src={tfSrc(t, "peak_naive_pct")} val={t.peak_naive_pct}>{t.peak_naive_pct}</N>
                    <span className="pl-arrow"> → </span>
                    <span style={{ color: tone(t.peak_plan_pct) }}><N src={tfSrc(t, "peak_plan_pct")} val={t.peak_plan_pct}>{t.peak_plan_pct} %</N></span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}
