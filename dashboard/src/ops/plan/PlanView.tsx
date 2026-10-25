// Diet plan: dad's Flattening tab (platform/static/index.html, drawFlat) in our theme, three things top to bottom:
// five number tiles in one row, the next 24 grid hours as one big chart in dad's grammar (chips above it pick Vienna,
// a substation's feeder or a transformer), and "how it works" as four numbered steps in one row of cards.
// Source: /api/flatten?node=<node> (useFlatten, every 5 s). Every number carries data-src/data-val (qa/README.md);
// chart ticks, clock times and step numbers are data-src="axis".
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFlatten, type FlattenPlan, type State } from "../../api";
import { hhmm, nice } from "../../model";
import { P } from "../../stage/palette";
import { Swatch } from "../../stage/kit/LiveCurve";
import { smoothBand, smoothPath } from "../../stage/kit/smooth";
import type { Ops } from "../useOps";
import "./plan.css";

const CITY = "region:at";
const EATEN = "rgb(232,137,58)"; // the hero's peak-eaten orange (LiveCurve)

/** A number with its source: shown text, raw value, and the scale when shown in other units. */
function N({ src, from, val, scale, children }: { src: string; from?: string; val: number; scale?: number; children: ReactNode }) {
  return (
    <span data-src={from ? "derived" : src} data-from={from} data-val={String(val)} data-scale={scale && scale !== 1 ? String(scale) : undefined}>
      {children}
    </span>
  );
}

/** kW or MW for power, kWh or MWh for energy, with the scale the truth gate needs. */
function units(p: FlattenPlan) {
  const big = p.rating_kw >= 10000;
  const pw = (kw: number) => (big ? { t: `${(kw / 1000).toFixed(2)} MW`, scale: 0.001 } : { t: `${Math.round(kw)} kW`, scale: 1 });
  const en = (kwh: number) => (kwh >= 1000 ? { t: `${(kwh / 1000).toFixed(1)} MWh`, scale: 0.001 } : { t: `${Math.round(kwh)} kWh`, scale: 1 });
  return { big, pw, en };
}

// ------------------------------------------------------------------ chips above the chart (dad's node chips)
function Chips({ s, node, set }: { s: State; node: string; set: (n: string) => void }) {
  const t = s.tree;
  const feederOf = node.startsWith("tf:") ? t[node]?.parent ?? "" : node.startsWith("feeder:") ? node : "";
  const subOf = feederOf ? t[feederOf]?.parent ?? "" : node.startsWith("sub:") ? node : "";
  const subs = Object.keys(t).filter((n) => n.startsWith("sub:"));
  const feeders = subOf ? Object.keys(t).filter((n) => n.startsWith("feeder:") && t[n].parent === subOf) : [];
  const tfs = feederOf ? Object.keys(t).filter((n) => n.startsWith("tf:") && t[n].parent === feederOf) : [];
  const B = ({ n, label, on }: { n: string; label: string; on: boolean }) => (
    <button type="button" className={`pl-chip${on ? " is-on" : ""}`} aria-pressed={on} onClick={() => set(n)} title={n}>
      {label}
    </button>
  );
  return (
    <div className="pl-chips" role="group" aria-label="Choose what the plan is for">
      <div className="pl-chiprow">
        <B n={CITY} label="Vienna" on={node === CITY} />
        <span className="pl-sep" aria-hidden />
        {subs.map((n) => <B key={n} n={n} label={nice(n)} on={n === subOf} />)}
      </div>
      {feeders.length > 0 && (
        <div className="pl-chiprow">
          <span className="pl-chiplabel">Feeder</span>
          {feeders.map((n) => <B key={n} n={n} label={nice(n)} on={n === feederOf} />)}
          {tfs.length > 0 && (
            <>
              <span className="pl-sep" aria-hidden />
              <span className="pl-chiplabel">Transformer</span>
              {tfs.map((n) => <B key={n} n={n} label={nice(n)} on={n === node} />)}
            </>
          )}
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

const C = { without: P.secondary, with: P.blue, nobody: "var(--pl-nobody)", level: P.green, limit: P.red, eaten: EATEN };
type XY = [number, number];

function Chart({ p, F }: { p: FlattenPlan; F: string }) {
  const { ref, w, h } = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const { big, pw } = units(p);
  const unc = p.other_kw.map((o, i) => o + p.base_kw[i] - p.pv_kw[i]);
  const dataMax = Math.max(...p.naive_kw, ...p.planned_kw);
  const ratingNear = p.rating_kw < dataMax * 2.2;
  const lo = Math.min(0, ...p.naive_kw, ...p.planned_kw, ...unc);
  const hi = (ratingNear ? Math.max(p.rating_kw, dataMax) : dataMax) * 1.06;
  // nice ticks, at most one every 44 px
  const span = hi - lo || 1;
  const want = Math.max(2, Math.min(6, Math.floor((h - 40) / 44)));
  const raw = span / want;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(v);
  const yTick = (v: number) => (big ? `${+(v / 1000).toFixed(step >= 1000 ? 0 : 1)} MW` : `${Math.round(v)} kW`);

  const padL = big ? 62 : 70, padR = 8, padT = 10, padB = 30;
  const n = p.hours.length;
  const x = (i: number) => padL + (i / Math.max(1, n - 1)) * (w - padL - padR);
  const y = (v: number) => padT + (1 - (v - lo) / span) * (h - padT - padB);
  const pts = (arr: number[]): XY[] => arr.map((v, i) => [x(i), y(v)]);
  const floor = (arr: number[]): XY[] => arr.map((_, i) => [x(i), y(0)]);
  // eaten: between "without" (above) and "with", only where without is higher
  const eatenTop = p.naive_kw.map((v, i) => Math.max(v, p.planned_kw[i]));
  // x ticks: every 3 grid hours (6 on narrow plots), on the slot closest to a whole hour
  const xt: number[] = [];
  const every = w < 640 ? 6 : 3;
  for (let i = 1; i < n; i++) {
    const hr = ((p.hours[i] % 24) + 24) % 24;
    const prev = ((p.hours[i - 1] % 24) + 24) % 24;
    if (Math.floor(hr / every) !== Math.floor(prev / every) && x(i) > padL + 24 && x(i) < w - padR - 24) xt.push(i);
  }
  const ok = w > 160 && h > 120;
  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - padL) / (w - padL - padR)) * (n - 1));
    setHover(i >= 0 && i < n ? i : null);
  };
  const hi_ = hover != null && hover < n ? hover : null;
  const Pw = ({ k, kw }: { k: string; kw: number }) => { const v = pw(kw); return <N src={`${F}/${k}`} val={kw} scale={v.scale}>{v.t}</N>; };
  return (
    <div className="pl-plot" ref={ref}>
      {ok && (
        <svg width={w} height={h} role="img" aria-label="The next 24 grid hours without and with the diet plan" onPointerMove={pick} onPointerLeave={() => setHover(null)}>
          <g data-src="axis" className="pl-axis">
            {ticks.map((v) => (
              <g key={v}>
                <line x1={padL} x2={w - padR} y1={y(v)} y2={y(v)} stroke="var(--pl-grid)" strokeWidth={v === 0 ? 1.5 : 1} />
                <text x={padL - 10} y={y(v)} dy="0.35em" textAnchor="end">{yTick(v)}</text>
              </g>
            ))}
            {xt.map((i) => (
              <text key={i} x={x(i)} y={h - 8} textAnchor="middle">{hhmm(Math.round(p.hours[i]))}</text>
            ))}
          </g>
          <path d={smoothBand(pts(unc), floor(unc))} fill={C.nobody} fillOpacity={0.3} />
          <path d={smoothPath(pts(unc))} fill="none" stroke={C.nobody} strokeWidth={1.25} />
          <path d={smoothBand(pts(p.planned_kw), floor(p.planned_kw))} fill={C.with} fillOpacity={0.13} />
          <path d={smoothBand(pts(eatenTop), pts(p.planned_kw))} fill={C.eaten} fillOpacity={0.5} className="pl-eaten" />
          <path d={smoothPath(pts(p.naive_kw))} fill="none" stroke={C.without} strokeWidth={2} strokeDasharray="6 5" strokeLinecap="round" />
          <path d={smoothPath(pts(p.planned_kw))} fill="none" stroke={C.with} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          <line x1={padL} x2={w - padR} y1={y(p.level_kw)} y2={y(p.level_kw)} stroke={C.level} strokeWidth={1.75} strokeDasharray="4 4" />
          {ratingNear && <line x1={padL} x2={w - padR} y1={y(p.rating_kw)} y2={y(p.rating_kw)} stroke={C.limit} strokeWidth={1.75} strokeDasharray="8 5" />}
          {hi_ != null && (
            <g pointerEvents="none">
              <line x1={x(hi_)} x2={x(hi_)} y1={padT} y2={h - padB} stroke="var(--color-tertiary)" strokeWidth={1} />
              <circle cx={x(hi_)} cy={y(p.naive_kw[hi_])} r={4} fill="var(--color-card)" stroke={C.without} strokeWidth={2} />
              <circle cx={x(hi_)} cy={y(p.planned_kw[hi_])} r={4.5} fill={C.with} stroke="var(--color-card)" strokeWidth={2} />
            </g>
          )}
        </svg>
      )}
      {ok && hi_ != null && (
        <div className="pl-tip" style={x(hi_) > w * 0.62 ? { right: w - x(hi_) + 12 } : { left: x(hi_) + 12 }}>
          <div className="pl-tip-t" data-src="axis">{hhmm(p.hours[hi_])}</div>
          <div><Swatch color={C.without} width={2.5} dashed /> without <b><Pw k={`naive_kw/${hi_}`} kw={p.naive_kw[hi_]} /></b></div>
          <div><Swatch color={C.with} width={3} /> with the plan <b><Pw k={`planned_kw/${hi_}`} kw={p.planned_kw[hi_]} /></b></div>
        </div>
      )}
    </div>
  );
}

function Legend({ ratingNear }: { ratingNear: boolean }) {
  const items: [ReactNode, string, boolean?][] = [
    [<Swatch color={C.without} width={2.5} dashed />, "without Gridzilla: every car charges the moment it is plugged in"],
    [<Swatch color={C.with} width={3.5} />, "with the diet plan"],
    [<Swatch color={C.nobody} kind="fill" opacity={0.55} />, "load nobody controls"],
    [<Swatch color={C.eaten} kind="fill" opacity={0.6} />, "peak eaten"],
    [<Swatch color={C.level} width={2.5} dashed />, "level L"],
    [<Swatch color={C.limit} width={2.5} dashed />, ratingNear ? "limit" : "limit, above this chart", !ratingNear],
  ];
  return (
    <ul className="pl-legend" aria-label="Legend">
      {items.map(([k, t, muted]) => (
        <li key={t} className={muted ? "is-muted" : undefined}>{k}{t}</li>
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
  const kind = node.split(":")[0];
  const name = node === CITY ? "Vienna, all transformers" : `${nice(node)} ${kind === "tf" ? "transformer" : kind === "sub" ? "substation" : "feeder"}`;
  const wait = f.missing ? "This platform has no diet plan." : d && !d.enabled ? "The diet plan is switched off; houses keep their last plan until it runs out." : d ? "No houses in the program here." : "Loading the plan";
  return (
    <div className="vw pl" data-scroll="page">
      {p ? <Body p={p} node={node} name={name} s={s} set={setNode} renewed={d?.renewed_at ?? null} /> : (
        <>
          <section className="pl-tiles" aria-hidden>
            {Array.from({ length: 5 }, (_, i) => <div key={i} className="panel pl-tile is-wait"><div className="pl-tile-t">&nbsp;</div><div className="pl-tile-v">&nbsp;</div><div className="pl-tile-d">&nbsp;</div></div>)}
          </section>
          <section className="panel pl-chart">
            <Chips s={s} node={node} set={setNode} />
            <div className="pl-wait">{wait}</div>
          </section>
        </>
      )}
    </div>
  );
}

function Body({ p, node, name, s, set, renewed }: { p: FlattenPlan; node: string; name: string; s: State; set: (n: string) => void; renewed: string | null }) {
  const { big, pw, en } = units(p);
  const F = `flatten:${node}/plan`;
  const eaten = p.peak_naive_kw - p.peak_plan_kw;
  const eatenFrom = `${F}/peak_naive_kw - ${F}/peak_plan_kw`;
  const eatenPct = p.peak_naive_kw ? Math.round((100 * eaten) / p.peak_naive_kw) : 0;
  const dataMax = Math.max(...p.naive_kw, ...p.planned_kw);
  const ratingNear = p.rating_kw < dataMax * 2.2;
  const tone = (pct: number) => (pct >= 100 ? P.red : pct >= 85 ? P.orange : undefined);
  const Pw = ({ k, kw }: { k: string; kw: number }) => { const v = pw(kw); return <N src={`${F}/${k}`} val={kw} scale={v.scale}>{v.t}</N>; };
  const En = ({ k, kwh }: { k: string; kwh: number }) => { const v = en(kwh); return <N src={`${F}/${k}`} val={kwh} scale={v.scale}>{v.t}</N>; };
  const Pc = ({ k, v }: { k: string; v: number }) => <N src={`${F}/${k}`} val={v}>{v} %</N>;
  const ratingText = big ? `${(p.rating_kw / 1000).toFixed(0)} MVA` : `${p.rating_kw} kVA`;
  const Eaten = () => <N src="" from={eatenFrom} val={eaten} scale={pw(eaten).scale}>{pw(eaten).t}</N>;
  const R = (n: number) => <span data-src="axis">{n}</span>;

  const tiles: { t: string; v: ReactNode; d: ReactNode; c?: string }[] = [
    { t: "Peak without Gridzilla", v: <Pw k="peak_naive_kw" kw={p.peak_naive_kw} />, d: <><Pc k="peak_naive_pct" v={p.peak_naive_pct} /> of the limit</>, c: tone(p.peak_naive_pct) },
    { t: "Peak with the diet plan", v: <Pw k="peak_plan_kw" kw={p.peak_plan_kw} />, d: <><Pc k="peak_plan_pct" v={p.peak_plan_pct} /> of the limit</>, c: P.green },
    { t: "Peak eaten", v: <Eaten />, d: <><N src="" from={`(${eatenFrom}) / ${F}/peak_naive_kw * 100`} val={eatenPct}>{eatenPct} %</N> off the top</>, c: P.orange },
    { t: "Car charging moved", v: <En k="shifted_kwh" kwh={p.shifted_kwh} />, d: p.cars_full ? <>into the night, all full by <span data-src="axis">{hhmm(7)}</span></> : <>not all cars fit: level raised</> },
    { t: "Noon export level", v: <Pw k="export_level_kw" kw={p.export_level_kw} />, d: <>solar above it fills batteries</> },
  ];

  const steps: [string, ReactNode][] = [
    ["Sense", <>Forecast the load nobody controls: <N src={`${F}/houses`} val={p.houses}>{p.houses.toLocaleString("en-US")}</N> program houses (<N src={`${F}/ev_houses`} val={p.ev_houses}>{p.ev_houses.toLocaleString("en-US")}</N> with a car) and their neighbours, weather-aware.</>],
    ["Count the flexibility", <><En k="ev_kwh" kwh={p.ev_kwh} /> of charging due by <span data-src="axis">{hhmm(7)}</span>, <En k="batt_kwh_usable" kwh={p.batt_kwh_usable} /> of battery for the peak, <En k="batt_kwh_free" kwh={p.batt_kwh_free} /> of room for noon solar.</>],
    ["Water-fill", <>Find the lowest level L = <Pw k="level_kw" kw={p.level_kw} /> with the cars fitting below it and batteries covering the peak above it.</>],
    ["Send the ceilings", <>Every house gets import and export ceilings per quarter hour, renewed every two grid hours{renewed ? <>, last at <span data-src="axis">{renewed.slice(11, 16)}</span> UTC</> : null}. Owner limits win.</>],
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
      <section className="panel pl-chart" aria-label="The next 24 grid hours">
        <header className="pl-chart-head">
          <h2 className="pl-h2">
            {name}: next {R(24)} grid hours from <span data-src="axis">{hhmm(p.start_h)}</span>, limit{" "}
            <N src={`${F}/rating_kw`} val={p.rating_kw} scale={big ? 0.001 : 1}>{ratingText}</N>
          </h2>
          <p className="pl-delta">
            <Eaten /> off the peak: <Pc k="peak_naive_pct" v={p.peak_naive_pct} /> → <Pc k="peak_plan_pct" v={p.peak_plan_pct} /> of the limit
          </p>
        </header>
        <Chips s={s} node={node} set={set} />
        <Chart p={p} F={F} />
        <Legend ratingNear={ratingNear} />
      </section>
      <section className="pl-steps" aria-label="How it works">
        <h2 className="sr-only">How it works</h2>
        <ol>
          {steps.map(([t, body], i) => (
            <li key={t} className="panel pl-step">
              <div className="pl-step-h">
                <span className="pl-step-n" data-src="axis">{i + 1}</span>
                <span className="pl-step-t">{t}</span>
              </div>
              <p className="pl-step-d">{body}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
