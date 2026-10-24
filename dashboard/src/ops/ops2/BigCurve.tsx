// The big curve on Operations: dad's Presentation chart (storyChart in platform/static/index.html) copied 1:1 in SVG.
// Blue = with Gridzilla (total_kw, thick, filled to zero), grey dashed = without Gridzilla (baseline_kw), orange fill =
// the load taken off the transformer (where "without" sits above "with"), red dashed = the rating, drawn only when the
// load can reach it (rating < 2.2 x the data max, his rule). Rating of the city = the sum of every transformer's rating.
// Default view is the whole of Vienna (region:at); his chip row (VIENNA · substation · its feeders) picks another node,
// a dot in the city strip picks a transformer (ops.select). Our polish is only theme, type and layout.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFlatten, type NodePoint, type State } from "../../api";
import { hhmm, nice, pathOf } from "../../model";
import { loadTone } from "../../stage/palette";
import type { Ops } from "../useOps";
import "./bigcurve.css";

const fmt = (v: number) => (Math.round(v) || 0).toLocaleString("en-US");

/** His rating: the node's own rating, else the sum of the transformers under it (the city). */
function ratingOf(s: State, node: string) {
  const own = s.tree[node]?.rating_kw;
  if (own) return { kw: own, src: { "data-src": `state/tree/${node}/rating_kw` } };
  const tfs = Object.keys(s.tree).filter((n) => n.startsWith("tf:") && pathOf(s, n).includes(node));
  const kw = tfs.reduce((a, n) => a + (s.tree[n].rating_kw ?? 0), 0);
  const src = node === "region:at" ? { "data-src": "derived", "data-from": "sum(state/tree/tf:*/rating_kw)" } : { "data-src": "derived", "data-from": tfs.map((n) => `state/tree/${n}/rating_kw`).join(" + ") || "0" };
  return { kw, src };
}

function titleOf(s: State, node: string) {
  if (node === "region:at") return `Vienna · all ${Object.keys(s.tree).filter((n) => n.startsWith("tf:")).length} transformers`;
  const what = node.startsWith("sub:") ? "substation" : node.startsWith("feeder:") ? "feeder" : "transformer";
  const parent = s.tree[node]?.parent;
  return `${nice(node)} · ${what}${parent && parent !== "region:at" ? ` · ${nice(parent)}` : ""}`;
}

/** Few round ticks between lo and hi. */
function ticks(lo: number, hi: number, n: number) {
  const raw = (hi - lo) / Math.max(1, n);
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => k >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

function useSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

export default function BigCurve({ ops }: { ops: Ops }) {
  const s = ops.s;
  const node = ops.view;
  const [planOn, setPlanOn] = useState(false);
  const flat = useFlatten(planOn ? node : null);
  const [box, { w, h }] = useSize();
  const [hover, setHover] = useState<number | null>(null);
  const all: NodePoint[] = (s && ops.history?.nodes?.[node]) || [];
  // like dad's chart: one recent stretch, the newest unbroken 24 grid hours (the fast simulator keeps several days)
  const first = lastDay(all);
  const pts = first ? all.slice(first) : all;

  const chart = useMemo(() => {
    if (!s || !pts.length || w < 40 || h < 40) return null;
    const rating = ratingOf(s, node).kw;
    const base = (p: NodePoint) => p.baseline_kw ?? p.total_kw;
    const dataMax = Math.max(1, ...pts.map((p) => Math.max(p.total_kw, base(p))));
    const ratingNear = !!rating && rating < dataMax * 2.2;
    // the diet plan (toggle, off by default): planned_kw over the next 24 grid hours, drawn after the last reading
    const plan = planOn ? flat.plan : null;
    const n = pts.length;
    const step = n > 1 ? median(pts.slice(1).map((p, i) => (((p.h - pts[i].h) % 24) + 24) % 24).filter((d) => d > 0)) || 1 : 1;
    let planX: number[] = [];
    if (plan && plan.hours.length) {
      let off = (((plan.hours[0] - pts[n - 1].h) % 24) + 24) % 24;
      if (off > 12) off -= 24;
      const slot = plan.hours.length > 1 ? plan.hours[1] - plan.hours[0] : 0.25;
      planX = plan.hours.map((_, k) => n - 1 + (off + k * slot) / step);
    }
    const xMax = Math.max(n - 1, ...planX, 1);
    const planMax = plan ? Math.max(...plan.planned_kw) : 0;
    const top = ratingNear ? rating * 1.15 : Math.max(dataMax, planMax) * 1.15;
    const lo = Math.min(0, ...pts.map((p) => Math.min(p.total_kw, base(p))), ...(plan ? plan.planned_kw : []));
    const yt = ticks(lo, top, h < 240 ? 3 : 4);
    const yLabel = (v: number) => `${fmt(v)} kW`;
    const left = Math.max(...yt.map((v) => yLabel(v).length)) * 8.4 + 14;
    const pad = { l: left, r: 14, t: 10, b: 30 };
    const pw = Math.max(10, w - pad.l - pad.r);
    const ph = Math.max(10, h - pad.t - pad.b);
    const yMin = Math.min(lo, yt[0]);
    const yMax = Math.max(top, yt[yt.length - 1]);
    const X = (i: number) => pad.l + (i / xMax) * pw;
    const Y = (v: number) => pad.t + (1 - (v - yMin) / (yMax - yMin || 1)) * ph;
    const line = (vals: number[], xs?: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${(xs ? X(xs[i]) : X(i)).toFixed(1)},${Y(v).toFixed(1)}`).join("");
    const totals = pts.map((p) => p.total_kw);
    const bases = pts.map(base);
    const withPath = line(totals);
    const withFill = `${withPath}L${X(n - 1).toFixed(1)},${Y(0).toFixed(1)}L${X(0).toFixed(1)},${Y(0).toFixed(1)}Z`;
    // orange: every stretch where "without" is above "with", cut at the crossings
    let eaten = "";
    let up: [number, number][] = [];
    let dn: [number, number][] = [];
    const flush = () => {
      if (up.length > 1) eaten += `M${up.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join("L")}L${dn.reverse().map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join("L")}Z`;
      up = [];
      dn = [];
    };
    for (let i = 0; i < n; i++) {
      const d = bases[i] - totals[i];
      if (d > 0) {
        if (!up.length && i > 0) {
          const d0 = bases[i - 1] - totals[i - 1];
          const k = d0 < 0 ? d0 / (d0 - d) : 0;
          const xc = i - 1 + k;
          const yc = totals[i - 1] + (totals[i] - totals[i - 1]) * k;
          up.push([xc, yc]);
          dn.push([xc, yc]);
        }
        up.push([i, bases[i]]);
        dn.push([i, totals[i]]);
      } else if (up.length) {
        const d0 = bases[i - 1] - totals[i - 1];
        const k = d0 / (d0 - d || 1);
        const xc = i - 1 + k;
        const yc = totals[i - 1] + (totals[i] - totals[i - 1]) * k;
        up.push([xc, yc]);
        dn.push([xc, yc]);
        flush();
      }
    }
    flush();
    // his faint band: the signal that is active on this node's path, else the latest one around it
    const act = Object.entries(s.active).find(([a]) => pathOf(s, node).includes(a));
    const recent = Object.entries(s.recent ?? {})
      .filter(([a]) => pathOf(s, node).includes(a) || pathOf(s, a).includes(node))
      .sort((x, y) => Date.parse(y[1].valid_from) - Date.parse(x[1].valid_from))[0];
    const sig = act ? { from: act[1].valid_from, to: act[1].valid_to } : recent ? { from: recent[1].valid_from, to: recent[1].ended_at || recent[1].valid_to } : null;
    let band: [number, number] | null = null;
    if (sig) {
      const a = Date.parse(sig.from);
      const b = Date.parse(sig.to);
      const inside = pts.map((p, i) => [i, Date.parse(p.ts)] as const).filter(([, t]) => t >= a && t <= b).map(([i]) => i);
      if (inside.length) band = [X(inside[0]), Math.max(X(inside[inside.length - 1]), X(inside[0]) + 3)];
    }
    const nx = Math.max(2, Math.min(8, Math.floor(pw / 110)));
    const xt = Array.from({ length: nx }, (_, k) => Math.round((k * (n - 1)) / (nx - 1)));
    return {
      X, Y, pad, pw, ph, yt, yLabel, withPath, withFill, eaten, basePath: line(bases), ratingNear, rating, band, xt, xMax,
      planPath: plan && planX.length ? line(plan.planned_kw, planX) : null,
    };
  }, [s, pts, node, w, h, planOn, flat.plan]);

  if (!s) return null;
  const agg = s.aggregates[node];
  const r = ratingOf(s, node);
  const delta = agg && agg.total_kw != null && agg.baseline_kw != null ? agg.baseline_kw - agg.total_kw : null;
  const pctSrc = agg?.load_pct != null ? { v: agg.load_pct, attrs: { "data-src": `state/aggregates/${node}/load_pct` } } : agg?.total_kw != null && r.kw ? { v: Math.round((100 * agg.total_kw) / r.kw), attrs: { "data-src": "derived", "data-from": `state/aggregates/${node}/total_kw / (${r.src["data-src"] === "derived" ? (r.src as { "data-from": string })["data-from"] : `state/tree/${node}/rating_kw`}) * 100` } } : null;
  const hp = hover != null && pts[hover] ? pts[hover] : null;

  return (
    <section className="panel bc" aria-label="With and without Gridzilla">
      <header className="bc-head">
        <div className="bc-title">
          <h2>{titleOf(s, node)}</h2>
          <span aria-hidden>·</span>
          <span className="bc-rating" {...r.src} data-val={r.kw}>
            {r.kw >= 10000 ? `${fmt(r.kw / 1000)} MVA` : `${fmt(r.kw)} kVA`}
            {chart && !chart.ratingNear ? " (rating off scale)" : ""}
          </span>
        </div>
        <div className="bc-nums">
          {delta != null && (
            <div className="bc-num">
              <b data-src="derived" data-from={`state/aggregates/${node}/baseline_kw - state/aggregates/${node}/total_kw`} data-val={delta}>
                {delta >= 0 ? "−" : "+"}
                {fmt(Math.abs(delta))} kW
              </b>
              <span>vs without Gridzilla</span>
            </div>
          )}
          {pctSrc && (
            <div className="bc-num">
              <b {...pctSrc.attrs} data-val={pctSrc.v}>{pctSrc.v} %</b>
              <span>of rating</span>
            </div>
          )}
        </div>
      </header>

      <Chips s={s} node={node} pick={ops.setView}>
        <button type="button" className={`bc-chip bc-plan${planOn ? " on" : ""}`} aria-pressed={planOn} onClick={() => setPlanOn((v) => !v)}>
          {planOn ? "Hide the diet plan" : "Diet plan"}
        </button>
      </Chips>

      <div className="bc-plot" ref={box} onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          if (!chart) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const i = Math.round(((e.clientX - rect.left - chart.pad.l) / chart.pw) * chart.xMax);
          setHover(i >= 0 && i < pts.length ? i : null);
        }}>
        {!chart ? (
          <p className="bc-wait">{pts.length ? "" : "Loading the curve…"}</p>
        ) : (
          <svg width={w} height={h} role="img" aria-label={`${titleOf(s, node)}: with and without Gridzilla`}>
            {chart.band && <rect className="bc-band" x={chart.band[0]} y={chart.pad.t} width={chart.band[1] - chart.band[0]} height={chart.ph} />}
            {chart.yt.map((v) => (
              <g key={v} data-src="axis">
                <line className="bc-grid" x1={chart.pad.l} x2={chart.pad.l + chart.pw} y1={chart.Y(v)} y2={chart.Y(v)} />
                <text className="bc-axis" x={chart.pad.l - 8} y={chart.Y(v)} dy="0.35em" textAnchor="end">{chart.yLabel(v)}</text>
              </g>
            ))}
            {chart.xt.map((i, k) => (
              <text key={`${i}-${k}`} data-src="axis" className="bc-axis" x={chart.X(i)} y={chart.pad.t + chart.ph + 22} textAnchor={k === 0 ? "start" : k === chart.xt.length - 1 && !chart.planPath ? "end" : "middle"}>
                {hhmm(pts[i].h)}
              </text>
            ))}
            <path className="bc-with-fill" d={chart.withFill} />
            <path className="bc-eaten" d={chart.eaten} />
            {chart.ratingNear && <line className="bc-limit" x1={chart.pad.l} x2={chart.pad.l + chart.pw} y1={chart.Y(chart.rating)} y2={chart.Y(chart.rating)} />}
            <path className="bc-without" d={chart.basePath} />
            <path className="bc-with" d={chart.withPath} />
            {chart.planPath && <path className="bc-planline" d={chart.planPath} />}
            {hp && hover != null && (
              <g className="bc-hover">
                <line x1={chart.X(hover)} x2={chart.X(hover)} y1={chart.pad.t} y2={chart.pad.t + chart.ph} />
                <circle className="dot-with" cx={chart.X(hover)} cy={chart.Y(hp.total_kw)} r={5} />
                {hp.baseline_kw != null && <circle className="dot-without" cx={chart.X(hover)} cy={chart.Y(hp.baseline_kw)} r={5} />}
              </g>
            )}
          </svg>
        )}
        {chart && hp && hover != null && (
          <div className="bc-tip" style={{ left: Math.min(chart.X(hover) + 12, w - 220), top: chart.pad.t + 4 }}>
            <div className="bc-tip-t">{hhmm(hp.h)}</div>
            <div><i className="sw-with" />with <b data-src={`history/nodes/${node}/${first + hover}/total_kw`} data-val={hp.total_kw}>{fmt(hp.total_kw)} kW</b></div>
            {hp.baseline_kw != null && <div><i className="sw-without" />without <b data-src={`history/nodes/${node}/${first + hover}/baseline_kw`} data-val={hp.baseline_kw}>{fmt(hp.baseline_kw)} kW</b></div>}
          </div>
        )}
      </div>

      <div className="bc-legend">
        <span><i className="sw-with" />with Gridzilla (measured)</span>
        <span><i className="sw-without" />without Gridzilla (what the houses would draw)</span>
        <span><i className="sw-eaten" />orange = load taken off the transformer</span>
        <span><i className="sw-limit" />rating</span>
        {planOn && <span><i className="sw-plan" />the diet plan, next 24 grid hours</span>}
      </div>
    </section>
  );
}

function median(xs: number[]) {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
}

/** His chip row: VIENNA · each substation, the selected substation opens into its feeders (and the picked transformer). */
function Chips({ s, node, pick, children }: { s: State; node: string; pick: (n: string) => void; children?: ReactNode }) {
  const path = pathOf(s, node);
  const subs = Object.keys(s.tree).filter((n) => n.startsWith("sub:"));
  const pct = (n: string) => s.aggregates[n]?.load_pct ?? null;
  const chip = (n: string, label: string, cls = "") => (
    <button key={n} type="button" className={`bc-chip ${cls}${n === node ? " on" : path.includes(n) ? " in" : ""}`} aria-pressed={n === node} title={n} onClick={() => pick(n)}>
      {cls.includes("feeder") && <i className="bc-tone" style={{ background: loadTone(pct(n)) }} />}
      {label}
      {s.active[n] ? <span className="bc-sig" aria-label="under a signal"> ●</span> : null}
    </button>
  );
  return (
    <nav className="bc-chips" aria-label="Pick what the curve shows">
      {chip("region:at", "VIENNA", "vienna")}
      {subs.map((sub) => {
        const open = path.includes(sub);
        const feeders = open ? Object.keys(s.tree).filter((f) => s.tree[f].parent === sub) : [];
        return [
          chip(sub, nice(sub), "sub"),
          ...feeders.flatMap((f) => [chip(f, nice(f), "feeder"), ...(node.startsWith("tf:") && path.includes(f) ? [chip(node, nice(node), "feeder tf")] : [])]),
        ];
      })}
      {children}
    </nav>
  );
}

/** Index of the oldest point in the newest unbroken run of at most 24 grid hours (a jump over 3 h breaks the run). */
function lastDay(pts: NodePoint[]): number {
  let span = 0;
  for (let i = pts.length - 1; i > 0; i--) {
    const d = (((pts[i].h - pts[i - 1].h) % 24) + 24) % 24;
    if (d > 3 || span + d > 24) return i;
    span += d;
  }
  return 0;
}
