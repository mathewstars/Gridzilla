// One household, opened from the Households table: its numbers now, its last signed reply, and the proof that it obeys
// (dad's "Envelope curve"): per 15-minute grid slot the allowed box (import cap above zero, export cap below zero) as a
// light stepped band, and the meter's measured grid power as a blue line inside it, red only where it leaves the box.
// Data: the house's device history (imp_cap / exp_cap / grid_kw per reading), polled with the console's one history call.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, X } from "@phosphor-icons/react";
import { meterDevice, type DevPoint, type Household } from "../../api";
import type { Ops } from "../useOps";
import { MODE_LABEL, clock, kw, nice } from "./fmt";
import "./house.css";

const WINDOW_H = 6; // grid hours shown

type Pt = { x: number; h: number; g: number | null; imp: number | null; exp: number | null };
type Slot = { x0: number; x1: number; imp: number | null; exp: number | null };

/** The last WINDOW_H grid hours as an unwrapped time axis (x = grid hours, last reading at its own h). Readings arrive
 *  every few grid minutes; a jump backwards of more than half a day means the simulator restarted, so the window ends there. */
function windowOf(pts: DevPoint[]): Pt[] {
  if (!pts.length) return [];
  const out: Pt[] = [];
  let x = pts[pts.length - 1].h;
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    if (i < pts.length - 1) {
      const d = (((pts[i + 1].h - p.h) % 24) + 24) % 24;
      if (d > 12) break;
      x -= d;
    }
    if (out.length && out[0].x === x) continue; // same grid moment twice: keep the newer reading
    out.unshift({ x, h: p.h, g: p.grid_kw, imp: p.imp_cap, exp: p.exp_cap });
    if (out[out.length - 1].x - x >= WINDOW_H) break;
  }
  return out;
}

/** Group readings into 15-minute grid slots; the slot's box is the last cap the house reported in it. */
function slotsOf(w: Pt[]): Slot[] {
  const m = new Map<number, Slot>();
  for (const p of w) {
    const k = Math.floor(p.x * 4);
    const s = m.get(k) ?? { x0: k / 4, x1: (k + 1) / 4, imp: null, exp: null };
    if (p.imp != null) s.imp = p.imp;
    if (p.exp != null) s.exp = p.exp;
    m.set(k, s);
  }
  // a slot with no reading keeps the box of the slot before it (the cap holds until the house reports a new one)
  const ks = [...m.keys()];
  const out: Slot[] = [];
  if (!ks.length) return out;
  let prev: Slot | null = null;
  for (let k = Math.min(...ks); k <= Math.max(...ks); k++) {
    const s: Slot = m.get(k) ?? { x0: k / 4, x1: (k + 1) / 4, imp: prev?.imp ?? null, exp: prev?.exp ?? null };
    out.push(s);
    prev = s;
  }
  return out;
}

const inside = (p: Pt, s: Slot | undefined) =>
  p.g == null || !s || ((s.imp == null || p.g <= s.imp + 0.05) && (s.exp == null || p.g >= -s.exp - 0.05));

function niceStep(span: number) {
  const raw = span / 5;
  const e = Math.pow(10, Math.floor(Math.log10(raw)));
  return [1, 2, 2.5, 5, 10].map((m) => m * e).find((v) => v >= raw) ?? raw;
}

function EnvelopeChart({ dev, pts }: { dev: string; pts: DevPoint[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(560);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(260, Math.round(el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const w = useMemo(() => windowOf(pts), [pts]);
  const slots = useMemo(() => slotsOf(w), [w]);
  if (w.length < 2) return <div className="hd-empty">No readings from this house yet. The chart fills in as it reports.</div>;

  const H = W < 420 ? 240 : 280;
  const pad = { l: 52, r: 12, t: 28, b: 32 };
  const x0 = w[0].x, x1 = w[w.length - 1].x;
  const vals = w.flatMap((p) => [p.g ?? 0]).concat(slots.flatMap((s) => [s.imp ?? 0, -(s.exp ?? 0)]), [0]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const span0 = Math.max(1, hi - lo);
  lo -= span0 * 0.08;
  hi += span0 * 0.08;
  const step = niceStep(hi - lo);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const X = (x: number) => pad.l + ((x - x0) / Math.max(1e-6, x1 - x0)) * (W - pad.l - pad.r);
  const Y = (v: number) => pad.t + ((hi - v) / (hi - lo)) * (H - pad.t - pad.b);
  const cx = (x: number) => X(Math.min(x1, Math.max(x0, x)));

  // the band: one rectangle per slot, clipped to the window; its top and bottom edges drawn as stepped lines
  const rects = slots.map((s) => ({ s, a: cx(s.x0), b: cx(s.x1) })).filter((r) => r.b > r.a);
  const edge = (f: (s: Slot) => number | null) => {
    let d = "";
    let prev: number | null = null;
    for (const { s, a, b } of rects) {
      const v = f(s);
      if (v == null) { prev = null; continue; }
      d += prev == null ? `M${a},${Y(v)}` : `L${a},${Y(v)}`;
      d += `L${b},${Y(v)}`;
      prev = v;
    }
    return d;
  };
  const line = w.filter((p) => p.g != null).map((p, i) => `${i ? "L" : "M"}${X(p.x).toFixed(1)},${Y(p.g!).toFixed(1)}`).join("");
  const slotAt = (x: number) => slots.find((s) => x >= s.x0 && x < s.x1);
  // red only where the line leaves the box: per segment, judged at both ends against the slot each end sits in
  const out: string[] = [];
  for (let i = 1; i < w.length; i++) {
    const a = w[i - 1], b = w[i];
    if (a.g == null || b.g == null) continue;
    if (!inside(a, slotAt(a.x)) || !inside(b, slotAt(b.x))) out.push(`M${X(a.x).toFixed(1)},${Y(a.g).toFixed(1)}L${X(b.x).toFixed(1)},${Y(b.g).toFixed(1)}`);
  }
  const outsideN = w.filter((p) => !inside(p, slotAt(p.x))).length;
  const yt: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) yt.push(Math.round(v * 100) / 100);
  const xt: number[] = [];
  for (let v = Math.ceil(x0); v <= x1; v += x1 - x0 > 4 ? 1 : 0.5) xt.push(v);

  return (
    <div className="hd-chart" ref={box}>
      <svg width={W} height={H} role="img" aria-label="Allowed box per 15-minute slot and the house's measured grid power">
        <g data-src="axis" className="hd-axis">
          {yt.map((v) => (
            <g key={v}>
              <line x1={pad.l} x2={W - pad.r} y1={Y(v)} y2={Y(v)} className={v === 0 ? "hd-zero" : "hd-grid"} />
              <text x={pad.l - 8} y={Y(v)} dy="0.35em" textAnchor="end">{v === 0 ? "0" : `${v > 0 ? "+" : "−"}${Math.abs(v)}`}</text>
            </g>
          ))}
          {xt.map((v) => (
            <text key={v} x={X(v)} y={H - 8} textAnchor="middle">{clock(v)}</text>
          ))}
          <text x={pad.l - 8} y={12} textAnchor="end" className="hd-unit">kW</text>
        </g>
        {rects.map(({ s, a, b }, i) =>
          s.imp == null && s.exp == null ? null : (
            <rect key={i} x={a} width={b - a} y={Y(s.imp ?? hi)} height={Math.max(0, Y(-(s.exp ?? -lo)) - Y(s.imp ?? hi))} className="hd-band" />
          ),
        )}
        <path d={edge((s) => s.imp)} className="hd-edge" />
        <path d={edge((s) => (s.exp == null ? null : -s.exp))} className="hd-edge" />
        <path d={line} className="hd-line" />
        {out.length > 0 && <path d={out.join("")} className="hd-out" />}
      </svg>
      <div className="hd-legend">
        <span><i className="sw-band" />Allowed box <small>per 15 min</small></span>
        <span><i className="sw-line" />What it drew</span>
        <span><i className="sw-out" />Outside the box</span>
        <span className="hd-legend-n" data-src="page" data-label={`readings of ${dev} outside the allowed box in the last ${WINDOW_H} grid hours`}>
          {outsideN === 0 ? "Stayed inside the whole time" : `${outsideN} of ${w.length} readings outside`}
        </span>
      </div>
    </div>
  );
}

const modeWords = (m: string | undefined) =>
  !m ? "No reading" : m === "owner" ? "Owner's own settings" : MODE_LABEL[m] ? `${MODE_LABEL[m]}, following a signal` : m;

export default function HouseDetail({ h, ops, onClose }: { h: Household | null; ops: Ops; onClose: () => void }) {
  const open = !!h;
  const [last, setLast] = useState<Household | null>(h);
  useEffect(() => { if (h) setLast(h); }, [h]);
  const cur = h ?? last;
  const dev = cur ? meterDevice(cur) : "";
  const { setHouseDev } = ops;
  useEffect(() => {
    setHouseDev(open ? dev : "");
  }, [open, dev, setHouseDev]);
  useEffect(() => () => setHouseDev(""), [setHouseDev]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [open, onClose]);
  const pts = (dev && ops.history?.devices?.[dev]) || [];
  const lastPt = pts.length ? pts.length - 1 : -1;
  const t = cur?.telemetry;
  const S = cur ? `state/households/${cur.id}` : "";
  const g = t?.grid_kw;

  return (
    <div className={`hd${open ? " is-open" : ""}`} aria-hidden={!open}>
      <div className="hd-scrim" onClick={onClose} />
      <aside className="hd-sheet" data-scroll="drawer" role="dialog" aria-label={cur ? `House ${cur.id}` : "House"}>
        {cur && (
          <>
            <header className="hd-head">
              <div className="hd-name">
                <h2>{cur.real ? "Blatnica (real house)" : nice(cur.id.replace(/^sim-/, ""))}</h2>
                <div className="hd-sub">
                  On {nice(cur.tf)}
                  {cur.represents > 1 && <span data-src={`${S}/represents`} data-val={cur.represents}> · stands for {cur.represents} real houses</span>}
                </div>
              </div>
              <button type="button" className="btn hd-x" onClick={onClose} aria-label="Close">
                <X size={16} weight="bold" />
              </button>
            </header>

            <div className="hd-kpis">
              <div className="hd-kpi">
                <div className="k">Battery</div>
                {t?.soc != null ? <div className="v" data-src={`${S}/telemetry/soc`} data-val={t.soc}>{Math.round(t.soc)}<small>% full</small></div> : <div className="v dim">–</div>}
              </div>
              <div className="hd-kpi">
                <div className="k">Grid now</div>
                {g != null ? (
                  <div className="v" data-src={`${S}/telemetry/grid_kw`} data-val={g}>{kw(Math.abs(g))}<small>{g < -0.05 ? "kW out" : "kW in"}</small></div>
                ) : <div className="v dim">–</div>}
              </div>
              <div className="hd-kpi">
                <div className="k">Allowed now</div>
                {lastPt >= 0 && pts[lastPt].imp_cap != null ? (
                  <div className="v">
                    <span data-src={`history/devices/${dev}/${lastPt}/imp_cap`} data-val={pts[lastPt].imp_cap!}>{kw(pts[lastPt].imp_cap)}</span>
                    <small>kW in</small>
                    {pts[lastPt].exp_cap != null && (
                      <span className="hd-kpi-2" data-src={`history/devices/${dev}/${lastPt}/exp_cap`} data-val={pts[lastPt].exp_cap!}>{kw(pts[lastPt].exp_cap)}<small>kW out</small></span>
                    )}
                  </div>
                ) : <div className="v dim">–</div>}
              </div>
            </div>

            <div className="hd-rows">
              <div className="hd-row"><span className="k">Mode</span><span>{modeWords(t?.mode)}{t?.mode && t.mode !== "owner" && <span className="dim"> {t.mode}</span>}</span></div>
              <div className="hd-row">
                <span className="k">Last signed reply</span>
                {cur.ack ? (
                  <span className="hd-ack">
                    <span className={`tag ${cur.ack.status === "applied" ? "g" : cur.ack.status === "refused" ? "r" : "o"}`}>{cur.ack.status}</span>
                    {cur.ack.seq != null && <span data-src={`${S}/ack/seq`} data-val={cur.ack.seq}>signal #{cur.ack.seq}</span>}
                    {cur.ack.reason && <span className="dim">{cur.ack.reason.replace(/_/g, " ")}</span>}
                  </span>
                ) : <span className="dim">No reply yet</span>}
              </div>
              <div className="hd-row">
                <span className="k">Signature</span>
                {cur.ack ? <span className={`tag ${cur.ack.verified ? "g" : "r"}`}>{cur.ack.verified ? "Checked, Ed25519" : "Not checked"}</span> : <span className="dim">–</span>}
              </div>
            </div>

            <section className="hd-card">
              <h3 className="hd-title">What this house may draw and what it did <small>envelope</small></h3>
              <p className="hd-desc">Last {WINDOW_H} grid hours. Above zero the house takes power, below zero it gives power back.</p>
              <EnvelopeChart dev={dev} pts={pts} />
            </section>

            <button type="button" className="btn hd-go" onClick={() => { ops.select(cur.tf); location.hash = "#/"; }}>
              Show its transformer on Operations <ArrowRight size={14} weight="bold" />
            </button>
          </>
        )}
      </aside>
    </div>
  );
}
