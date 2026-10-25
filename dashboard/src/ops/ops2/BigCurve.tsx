// The big curve on Operations: dad's Presentation chart (storyChart in platform/static/index.html) copied 1:1 in SVG.
// Blue = with Gridzilla (total_kw, thick, filled to zero), grey dashed = without Gridzilla (baseline_kw), orange fill =
// the load taken off the transformer (where "without" sits above "with"), red dashed = the rating, drawn only when the
// load can reach it (rating < 2.2 x the data max, his rule). Rating of the city = the sum of every transformer's rating.
// Default view is the whole of Vienna (region:at); his chip row (VIENNA · substation · its feeders) picks another node.
// Around the chart: the one-sentence state line and the load ring of the node shown. Our polish is only theme, type
// and layout.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { NodePoint, State } from "../../api";
import { hhmm, nice, pathOf } from "../../model";
import { loadTone } from "../../stage/palette";
import LoadRing from "../../stage/kit/LoadRing";
import type { Ops } from "../useOps";
import "./bigcurve.css";

const fmt = (v: number) => (Math.round(v) || 0).toLocaleString("en-US");

/** His rating: the node's own rating, else the sum of the transformers under it (the city). */
function ratingOf(s: State, node: string) {
  const own = s.tree[node]?.rating_kw;
  // traced through the aggregates: the state poll only carries the tree on its first answer
  if (own) return { kw: own, src: { "data-src": `state/aggregates/${node}/rating_kw` } };
  const tfs = Object.keys(s.tree).filter((n) => n.startsWith("tf:") && pathOf(s, n).includes(node));
  const kw = tfs.reduce((a, n) => a + (s.tree[n].rating_kw ?? 0), 0);
  const src = node === "region:at" ? { "data-src": "derived", "data-from": "sum(state/aggregates/tf:*/rating_kw)" } : { "data-src": "derived", "data-from": tfs.map((n) => `state/aggregates/${n}/rating_kw`).join(" + ") || "0" };
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

/** Where the ring's % comes from: the node's load_pct, else its total over its rating (the city: the sum of ratings). */
function pctOf(s: State, node: string) {
  const agg = s.aggregates[node];
  if (agg?.load_pct != null) return { v: agg.load_pct, attrs: { "data-src": `state/aggregates/${node}/load_pct` } };
  const r = ratingOf(s, node);
  if (agg?.total_kw == null || !r.kw) return null;
  const den = r.src["data-src"] === "derived" ? (r.src as { "data-from": string })["data-from"] : r.src["data-src"];
  return { v: Math.round((100 * agg.total_kw) / r.kw), attrs: { "data-src": "derived", "data-from": `state/aggregates/${node}/total_kw / (${den}) * 100` } };
}

/** A number in running text, tagged for the data-truth gate (qa/README.md). */
function N({ src, val, children }: { src: string; val?: number; children: ReactNode }) {
  return (
    <span data-src={src} data-val={val == null ? undefined : String(val)}>
      {children}
    </span>
  );
}

/** One sentence of state for the node on screen: a signal holding it, a peak coming, or calm. Every number tagged. */
function sentence(s: State, node: string): ReactNode {
  const name = node === "region:at" ? "Vienna" : nice(node);
  const path = pathOf(s, node);
  const sig = Object.entries(s.active).find(([a]) => path.includes(a) || pathOf(s, a).includes(node));
  if (sig) {
    const until = s.sim_hour + ((Date.parse(sig[1].valid_to) - Date.parse(s.now)) / 3_600_000) * (s.autopilot?.sim_x ?? 60);
    return (
      <>
        Gridzilla is holding {path.includes(sig[0]) ? name : nice(sig[0])} inside its limit until <N src="axis">{hhmm(until)}</N>.
      </>
    );
  }
  const tfs = node.startsWith("tf:") ? [node] : Object.keys(s.tree).filter((n) => n.startsWith("tf:") && pathOf(s, n).includes(node));
  const fp = s.forecast_peak ?? {};
  const worst = tfs.filter((t) => fp[t]).sort((a, b) => Math.abs(fp[b].pct) - Math.abs(fp[a].pct))[0];
  const trig = s.autopilot?.trigger_pct ?? 85;
  if (worst && Math.abs(fp[worst].pct) >= trig)
    return (
      <>
        {nice(worst)} is heading to <N src={`state/forecast_peak/${worst}/pct`} val={fp[worst].pct}>{Math.abs(fp[worst].pct)} %</N> of its limit at{" "}
        <N src="axis">{hhmm(fp[worst].h)}</N>. Gridzilla is watching.
      </>
    );
  const pct = s.autopilot?.trigger_pct != null ? <N src="state/autopilot/trigger_pct" val={trig}>{trig} %</N> : <span data-src="axis">{trig} %</span>;
  return node.startsWith("tf:") ? (
    <>{name} stays below {pct} of its limit. The houses run on their own.</>
  ) : (
    <>No transformer in {name} is forecast past {pct} of its limit. The houses run on their own.</>
  );
}

export default function BigCurve({ ops }: { ops: Ops }) {
  const s = ops.s;
  const node = ops.view;
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
    const n = pts.length;
    const xMax = Math.max(n - 1, 1);
    // the top covers the limit, "with" and "without" (dataMax holds both), plus headroom: no series above the plot
    const top = Math.max(ratingNear ? rating : 0, dataMax) * 1.15;
    const lo = Math.min(0, ...pts.map((p) => Math.min(p.total_kw, base(p))));
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
    const line = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
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
    // x ticks: evenly spaced, one label per clock time (a young history has several points in the same minute)
    const nx = Math.max(2, Math.min(8, Math.floor(pw / 110)));
    const seen = new Set<string>();
    const xt = Array.from({ length: nx }, (_, k) => Math.round((k * (n - 1)) / (nx - 1))).filter((i) => {
      const t = hhmm(pts[i].h);
      if (seen.has(t)) return false;
      seen.add(t);
      return true;
    });
    return { X, Y, pad, pw, ph, yt, yLabel, withPath, withFill, eaten, basePath: line(bases), ratingNear, rating, band, xt, xMax };
  }, [s, pts, node, w, h]);

  if (!s) return null;
  const r = ratingOf(s, node);
  const pct = pctOf(s, node);
  const hp = hover != null && pts[hover] ? pts[hover] : null;
  const limitText = r.kw >= 10000 ? `${fmt(r.kw / 1000)} MVA` : `${fmt(r.kw)} kVA`;

  return (
    <section className="panel bc" aria-label="With and without Gridzilla">
      <header className="bc-head">
        <div className="bc-title">
          <h2 {...(node === "region:at" ? { "data-src": "derived", "data-from": "count(state/aggregates/tf:*)", "data-val": Object.keys(s.tree).filter((n) => n.startsWith("tf:")).length } : { "data-src": `state/aggregates/${node}` })}>{titleOf(s, node)}</h2>
          <span className="bc-rating">
            limit{" "}
            <span {...r.src} data-val={r.kw} data-scale={r.kw >= 10000 ? "0.001" : undefined}>{limitText}</span>
          </span>
        </div>
        <p className="bc-sentence" aria-live="polite">{sentence(s, node)}</p>
      </header>

      <Chips s={s} node={node} pick={ops.setView} />

      <div className="bc-body">
        <div className="bc-plot" ref={box} onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            if (!chart) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const i = Math.round(((e.clientX - rect.left - chart.pad.l) / chart.pw) * chart.xMax);
            setHover(i >= 0 && i < pts.length ? i : null);
          }}>
          {!chart ? (
            <p className="bc-wait">{pts.length ? "" : "Loading the curve"}</p>
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
                <text key={`${i}-${k}`} data-src="axis" className="bc-axis" x={chart.X(i)} y={chart.pad.t + chart.ph + 22} textAnchor={k === 0 ? "start" : k === chart.xt.length - 1 ? "end" : "middle"}>
                  {hhmm(pts[i].h)}
                </text>
              ))}
              <defs>
                <clipPath id="bc-plot">
                  <rect x={chart.pad.l} y={chart.pad.t - 2} width={chart.pw} height={chart.ph + 4} />
                </clipPath>
              </defs>
              {/* every series stays inside the plot rect (the gate checks it too) */}
              <g className="bc-series" clipPath="url(#bc-plot)" data-series="">
                <path className="bc-with-fill" d={chart.withFill} />
                <path className="bc-eaten" d={chart.eaten} />
                {chart.ratingNear && <line className="bc-limit" x1={chart.pad.l} x2={chart.pad.l + chart.pw} y1={chart.Y(chart.rating)} y2={chart.Y(chart.rating)} />}
                <path className="bc-without" d={chart.basePath} />
                <path className="bc-with" d={chart.withPath} />
              </g>
              <rect className="bc-plotrect" data-plot="" x={chart.pad.l} y={chart.pad.t} width={chart.pw} height={chart.ph} fill="none" stroke="none" />
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
        <div className="bc-ring" style={{ color: loadTone(pct?.v ?? null) }} {...(pct ? pct.attrs : { "data-src": "axis" })} data-val={pct ? String(pct.v) : undefined}>
          <LoadRing pct={pct?.v ?? null} size={300} />
        </div>
      </div>

      <ul className="bc-legend" aria-label="What the lines mean">
        <li><i className="sw-with" />With Gridzilla (measured)</li>
        <li><i className="sw-without is-dash" />Without Gridzilla<span className="bc-long">&nbsp;(what the houses would draw)</span></li>
        <li className={chart?.eaten ? undefined : "is-muted"}><i className="sw-eaten is-box" />Peak eaten</li>
        <li className={chart?.ratingNear ? undefined : "is-muted"} title={chart && !chart.ratingNear ? "The limit is far above the load, so the chart leaves it out" : undefined}>
          <i className="sw-limit is-dash" />
          {chart && !chart.ratingNear ? "Limit, far above the load" : "Limit"}
        </li>
      </ul>
    </section>
  );
}

/** His chip row: VIENNA · each substation; the selected substation opens into its feeders, the selected feeder into
 *  its transformers. */
function Chips({ s, node, pick }: { s: State; node: string; pick: (n: string) => void }) {
  const path = pathOf(s, node);
  const subs = Object.keys(s.tree).filter((n) => n.startsWith("sub:"));
  const pct = (n: string) => s.aggregates[n]?.load_pct ?? null;
  // two chips with the same short name (a Stockerau feeder and its Stockerau transformer, or two transformers) keep
  // their number, so no two chips in the row read the same
  const shown = [
    ...subs,
    ...subs.filter((sub) => path.includes(sub)).flatMap((sub) => Object.keys(s.tree).filter((f) => s.tree[f].parent === sub)),
    ...path.filter((f) => f.startsWith("feeder:")).flatMap((f) => Object.keys(s.tree).filter((t) => s.tree[t].parent === f)),
  ];
  const label = (n: string, _sibs: string[]) => {
    const short = nice(n);
    const twin = shown.some((o) => o !== n && nice(o) === short);
    const num = n.match(/-(\d+)$/)?.[1];
    return twin && num ? `${short} ${num}` : short;
  };
  const chip = (n: string, label: string, cls = "") => (
    <button key={n} type="button" className={`bc-chip ${cls}${n === node ? " on" : path.includes(n) ? " in" : ""}`} aria-pressed={n === node} title={n} onClick={() => pick(n)}>
      {(cls === "feeder" || cls === "tf") && <i className="bc-tone" style={{ background: loadTone(pct(n)) }} />}
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
          chip(sub, label(sub, subs), "sub"),
          // the picked feeder opens into its transformers
          ...feeders.flatMap((f) => {
            const tfs = path.includes(f) ? Object.keys(s.tree).filter((t) => s.tree[t].parent === f) : [];
            return [chip(f, label(f, feeders), "feeder"), ...tfs.map((t) => chip(t, label(t, tfs), "tf"))];
          }),
        ];
      })}
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
