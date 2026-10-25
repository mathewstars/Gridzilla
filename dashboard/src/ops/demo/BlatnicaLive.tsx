// "Blatnica · real plant · live": the captain's family home (Victron Cerbo GX battery + Viessmann Vitocal heat pump + EV
// charger) on Gridzilla for real, read from the LIVE server (live.ts), with dad's labels from his Presentation tab:
// four stats, his 30-minute grid kW line, and the ack/signal footer. No data = "waiting for the plant", never numbers
// we made up; ?plant=sample shows a labelled fixture for design reviews.
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { kwTicks, LIVE_DEVICE, LIVE_HH, PLANT_SAMPLE, SAMPLE_HH, SAMPLE_POINTS, useLiveBlatnica, type LiveHousehold } from "./live";
import type { DevPoint } from "../../api";
import { Key, Swatch } from "../../stage/kit/LiveCurve";
import LoadRing from "../../stage/kit/LoadRing";
import { P } from "../../stage/palette";
import "./blatnica.css";

const HH = `live:state/households/${LIVE_HH}`;
const T = `${HH}/telemetry`;

/** A traced number: data-src into the live payload (or "sample" for the fixture), data-val the raw value. */
function N({ src, val, sample, children }: { src: string; val: number | null | undefined; sample: boolean; children: ReactNode }) {
  return sample ? (
    <span data-src="sample">{children}</span>
  ) : (
    <span data-src={src} data-val={val == null ? undefined : String(val)}>
      {children}
    </span>
  );
}

function Stat({ value, unit, children }: { value: ReactNode; unit: string; children: ReactNode }) {
  return (
    <div className="blat-stat">
      <div className="blat-v">
        {value}
        <span className="blat-u"> {unit}</span>
      </div>
      <div className="blat-l">{children}</div>
    </div>
  );
}

const minus = (s: string) => s.replace("-", "−");

/** The card's one legend key, drawn with the hero's Key + Swatch so both legends match; muted while there is no line. */
function GridKey({ muted }: { muted?: boolean }) {
  return (
    <figcaption className="blat-legend lc-legend" data-src="axis">
      <Key swatch={<Swatch color="var(--blat-blue)" width={3.5} />} label="Grid kW, + import − export, last 30 min" muted={muted} />
    </figcaption>
  );
}

/** His realChart: grid kW, blue 2 px line with a soft fill to zero, "N kW" ticks (max 4) on faint gridlines, no x axis. */
/** The plot's height in px (0 until measured), so the y labels never crowd each other. */
function useHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [h, setH] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setH(e.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, h] as const;
}

/** The labelled ticks for a plot `ph` px tall at 14 px text: under 90 px (or not measured yet) only 0 and the end farthest
 *  from it, "kW" once; taller, every tick that keeps 16 px between labels (thinned around 0, never more than fit). */
function shownTicks(ticks: number[], lo: number, hi: number, ph: number): number[] {
  const far = Math.abs(hi) >= Math.abs(lo) ? hi : lo;
  const two = far === 0 ? [0] : [0, far];
  if (ph < 90) return two;
  const fit = Math.floor(ph / 16) + 1;
  if (ticks.length <= fit) return ticks;
  const z = Math.max(0, ticks.indexOf(0));
  const thin = ticks.filter((_, i) => (i - z) % 2 === 0);
  return thin.length <= fit ? thin : two;
}

function GridLine({ pts }: { pts: DevPoint[] }) {
  const [box, ph] = useHeight<HTMLDivElement>();
  const v = pts.map((p) => p.grid_kw);
  const nums = v.filter((x): x is number => x != null);
  if (nums.length < 2) return <div className="blat-chart blat-chart-empty">collecting the last 30 minutes</div>;
  const { lo, hi, ticks: all } = kwTicks(nums);
  const ticks = shownTicks(all, lo, hi, ph);
  const sparse = ph < 90; // two labels: the unit once, on the far one
  const W = 1000, H = 100;
  const x = (i: number) => (i / (v.length - 1)) * W;
  const y = (k: number) => ((hi - k) / (hi - lo)) * H;
  // one segment per run of readings (a gap in the data stays a gap)
  const runs: [number, number][][] = [];
  v.forEach((k, i) => {
    if (k == null) return runs.push([]);
    if (!runs.length) runs.push([]);
    runs[runs.length - 1].push([x(i), y(k)]);
  });
  const segs = runs.filter((r) => r.length > 1);
  const line = segs.map((r) => r.map(([a, b], j) => `${j ? "L" : "M"}${a.toFixed(1)},${b.toFixed(2)}`).join("")).join("");
  const fill = segs
    .map((r) => `M${r[0][0].toFixed(1)},${y(0).toFixed(2)}` + r.map(([a, b]) => `L${a.toFixed(1)},${b.toFixed(2)}`).join("") + `L${r[r.length - 1][0].toFixed(1)},${y(0).toFixed(2)}Z`)
    .join("");
  const dec = ticks.some((t) => Math.abs(t - Math.round(t)) > 1e-6) ? (ticks.some((t) => Math.abs(t * 10 - Math.round(t * 10)) > 1e-6) ? 2 : 1) : 0;
  return (
    <div ref={box} className="blat-chart" role="img" aria-label="Blatnica grid kW, last 30 minutes">
      <div className="blat-ticks" data-src="axis">
        {ticks.map((t) => (
          <span key={t} style={{ top: `${(y(t) / H) * 100}%` }}>
            {minus(t.toFixed(dec))}
            {sparse && t === 0 ? "" : " kW"}
          </span>
        ))}
      </div>
      <svg className="blat-plot" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
        {ticks.map((t) => (
          <line key={t} className={t === 0 ? "blat-zero" : "blat-grid"} x1="0" x2={W} y1={y(t)} y2={y(t)} vectorEffect="non-scaling-stroke" />
        ))}
        <path className="blat-fill" d={fill} />
        <path className="blat-line" d={line} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

export type LivePlant = ReturnType<typeof useLiveBlatnica>;

/** What the card and the hero both read from one live poll: the plant (or the labelled sample), its age, its points. */
function usePlant({ state, stateFailed, history }: LivePlant) {
  const now = useNow(1000);
  const liveH = state?.households?.[LIVE_HH] ?? null;
  const live = !stateFailed && liveH?.telemetry ? liveH : null;
  const sample = !live && PLANT_SAMPLE;
  const h: LiveHousehold | null = live ?? (sample ? SAMPLE_HH : null);
  const t = h?.telemetry ?? null;
  const ageS = live?.telemetry?.rx ? Math.max(0, Math.round((now - Date.parse(live.telemetry.rx)) / 1000)) : null;
  const pts = live ? (history?.devices?.[LIVE_DEVICE] ?? []).slice(-120) : sample ? SAMPLE_POINTS : [];
  return { state, live, sample, h, t, ageS, pts };
}

/** The card is the way into Blatnica mode: a click (or Enter / Space) puts the plant in the hero. */
export default function BlatnicaLive({ plant, onOpen, open }: { plant: LivePlant; onOpen?: () => void; open?: boolean }) {
  const { state, live, sample, h, t, ageS, pts } = usePlant(plant);
  const press = onOpen
    ? {
        role: "button",
        tabIndex: 0,
        "aria-pressed": !!open,
        title: open ? "Blatnica is in the hero (B or a city dot to go back)" : "Show Blatnica in the hero (B)",
        onClick: onOpen,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        },
      }
    : {};

  const head = (
    <header className="blat-head">
      <h2 className="blat-title">Blatnica · real plant · live</h2>
      {sample ? (
        <span className="blat-sample">Sample</span>
      ) : (
        <span className="blat-hint">
          {ageS != null ? (
            <>
              <i className={`blat-dot${ageS > 120 ? " is-stale" : ""}`} aria-hidden />
              live · updated{" "}
              <span data-src="page" data-label="seconds since the plant's last reading (telemetry.rx)">
                {ageS} s
              </span>{" "}
              ago<span className="blat-via"> · Cerbo GX + Vitocal via Gridzilla agents</span>
            </>
          ) : (
            "offline"
          )}
        </span>
      )}
    </header>
  );

  if (!h || !t) {
    return (
      <section className={`panel blat${onOpen ? " is-press" : ""}${open ? " is-open" : ""}`} aria-live="polite" {...press}>
        {head}
        <figure className="blat-fig">
          <div className="blat-chart blat-chart-empty">Blatnica: waiting for the plant</div>
          <GridKey muted />
        </figure>
      </section>
    );
  }

  const g = t.grid_kw;
  const gridLabel = g != null && g > 0.05 ? "grid import" : g != null && g < -0.05 ? "grid export" : "grid · balanced";
  const evOn = t.ev_kw != null && t.ev_kw > 0;
  const path = h.path ?? (h.tf ? [h.tf] : []);
  const sig = Object.entries(live ? (state?.active ?? {}) : {}).find(([n]) => path.includes(n));
  const ak = h.ack ?? {};
  const short = (n: string) => n.replace(/^[a-z]+:/, "");

  const heat: ReactNode[] = [];
  if (t.dhw_c != null)
    heat.push(
      <span key="tank">
        tank <N src={`${T}/dhw_c`} val={t.dhw_c} sample={sample}>{t.dhw_c.toFixed(1)} °C</N>
        {t.dhw_set_c != null && (
          <>
            {" → "}
            <N src={`${T}/dhw_set_c`} val={t.dhw_set_c} sample={sample}>{t.dhw_set_c} °C</N>
          </>
        )}
      </span>,
    );
  if (t.heat_set_c != null)
    heat.push(
      <span key="room">
        room → <N src={`${T}/heat_set_c`} val={t.heat_set_c} sample={sample}>{t.heat_set_c} °C</N>
      </span>,
    );
  if (t.flow_c != null)
    heat.push(
      <span key="flow">
        floor flow <N src={`${T}/flow_c`} val={t.flow_c} sample={sample}>{t.flow_c.toFixed(0)} °C</N>
      </span>,
    );

  return (
    <section className={`panel blat${onOpen ? " is-press" : ""}${open ? " is-open" : ""}`} {...press}>
      {head}
      <div className="blat-stats">
        <Stat
          unit="kW"
          value={
            <N src={`${T}/grid_kw`} val={g} sample={sample}>
              {g == null ? "–" : minus(`${g > 0 ? "+" : ""}${g.toFixed(2)}`)}
            </N>
          }
        >
          {gridLabel}
        </Stat>
        <Stat unit="%" value={<N src={`${T}/soc`} val={t.soc} sample={sample}>{t.soc == null ? "–" : t.soc.toFixed(0)}</N>}>
          battery SoC
          <span className="blat-more">
          {h.kwh != null && (
            <>
              {" · "}
              <N src={`${HH}/kwh`} val={h.kwh} sample={sample}>{h.kwh} kWh</N>
            </>
          )}
          {" · owner floor "}
          <span data-src="deck" data-label="owner's battery floor in Blatnica">20 %</span>
          </span>
        </Stat>
        <Stat unit="kW" value={<N src={`${T}/ev_kw`} val={t.ev_kw} sample={sample}>{t.ev_kw == null ? "–" : t.ev_kw.toFixed(1)}</N>}>
          EV charger
          <span className="blat-more">
          {" · "}
          {t.ev != null ? (
            <N src={`${T}/ev`} val={t.ev} sample={sample}>{t.ev} kW</N>
          ) : (
            <span data-src="deck" data-label="Blatnica's EV station">11 kW</span>
          )}{" "}
          station</span> · {evOn ? "charging" : "idle"}
        </Stat>
        <Stat unit="kW" value={<N src={`${T}/hp_kw`} val={t.hp_kw} sample={sample}>{t.hp_kw == null ? "–" : t.hp_kw.toFixed(1)}</N>}>
          heat pump
          <span className="blat-more">
          {/* a break may fall between the parts, never inside one */}
          {heat.map((part, i) => (
            <Fragment key={i}>
              {" "}
              <span className="blat-part">· {part}</span>
            </Fragment>
          ))}
          </span>
        </Stat>
      </div>
      <figure className="blat-fig">
        <GridLine pts={pts} />
        <GridKey muted={pts.filter((p) => p.grid_kw != null).length < 2} />
      </figure>
      <p className="blat-foot">
        {sig ? (
          <>
            <b>{sig[1].mode}</b> seq{" "}
            <span data-src={`live:state/active/${sig[0]}/seq`} data-val={String(sig[1].seq)}>
              {sig[1].seq}
            </span>{" "}
            on <span data-src={`live:state/active/${sig[0]}/segment`}>{short(sig[0])}</span>
          </>
        ) : (
          "owner mode"
        )}
        {" · "}
        {ak.status ? `last ack ${ak.status}${ak.reason ? ` (${ak.reason})` : ""} · signature ${ak.verified === false ? "✗" : "✓"}` : "no ack yet"}
      </p>
    </section>
  );
}

// ---- Blatnica mode on the demo hero (blatnica-showcase.md): the real plant centre stage, everything from live:state and
// live:history, the same hero frame (title, sentence, chart + ring) as a transformer.

/** Battery tone on the console's scale: red at or under the owner's 20 % floor, orange under 40 %, green above. */
const socTone = (soc: number | null | undefined) => (soc == null ? P.tertiary : soc <= 20 ? P.red : soc < 40 ? P.orange : P.green);

/** Round steps for a kW axis between lo and hi with at most n labels. */
function niceTicks(lo: number, hi: number, n: number) {
  const steps = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100];
  for (const st of steps) {
    const a = Math.floor(lo / st - 1e-9) * st, b = Math.ceil(hi / st - 1e-9) * st;
    if (Math.round((b - a) / st) + 1 <= Math.max(2, n)) {
      const t: number[] = [];
      for (let v = a; v <= b + st / 2; v += st) t.push(Math.round(v * 100) / 100);
      return { lo: a, hi: b, ticks: t, step: st };
    }
  }
  return { lo, hi, ticks: [lo, hi], step: hi - lo };
}

const clockOf = (ms: number) => new Date(ms).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit", hour12: false });

/** His real chart, big: grid kW (blue 2.5 px, soft fill to zero), kW ticks on gridlines, time labels, the zero line marked
 *  "+ import / − export", the applied import limit dashed red, and SoC as a thin grey dashed line on a 0-100 % right axis. */
function PlantChart({ pts, limit, limitSrc }: { pts: DevPoint[]; limit: number | null; limitSrc: string }) {
  const [box, setBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const rows = pts.filter((p) => p.grid_kw != null && Number.isFinite(Date.parse(p.ts)));
  const socRows = pts.filter((p) => p.soc != null && Number.isFinite(Date.parse(p.ts)));
  const hasSoc = socRows.length > 1;
  const { w: W, h: H } = box;
  const padL = 70, padR = hasSoc ? 56 : 14, padT = 12, padB = 26;
  const pw = Math.max(1, W - padL - padR), ph = Math.max(1, H - padT - padB);
  let body: ReactNode = null;
  if (W > 0 && H > 0 && rows.length > 1) {
    const ts = rows.map((p) => Date.parse(p.ts));
    const t0 = ts[0], t1 = ts[ts.length - 1] || t0 + 1;
    const vals = rows.map((p) => p.grid_kw as number);
    const ax = niceTicks(Math.min(0, ...vals, limit ?? 0), Math.max(0, ...vals, limit ?? 0) || 0.2, Math.floor(ph / 26) + 1);
    const x = (t: number) => padL + ((t - t0) / Math.max(1, t1 - t0)) * pw;
    const y = (k: number) => padT + ((ax.hi - k) / (ax.hi - ax.lo || 1)) * ph;
    const ys = (soc: number) => padT + ((100 - soc) / 100) * ph;
    const line = rows.map((p, i) => `${i ? "L" : "M"}${x(ts[i]).toFixed(1)},${y(p.grid_kw as number).toFixed(1)}`).join("");
    const fill = `M${x(t0).toFixed(1)},${y(0).toFixed(1)}` + rows.map((p, i) => `L${x(ts[i]).toFixed(1)},${y(p.grid_kw as number).toFixed(1)}`).join("") + `L${x(t1).toFixed(1)},${y(0).toFixed(1)}Z`;
    const socLine = socRows.map((p, i) => `${i ? "L" : "M"}${x(Date.parse(p.ts)).toFixed(1)},${ys(p.soc as number).toFixed(1)}`).join("");
    const dec = ax.step < 1 ? (ax.step < 0.5 && ax.step !== 0.25 ? 1 : 2) : 0;
    // time labels every 5 / 10 / 15 min, as many as fit at ~70 px apart
    const span = t1 - t0;
    const every = [5, 10, 15, 30].map((m) => m * 60000).find((m) => span / m <= pw / 70) ?? 30 * 60000;
    const times: number[] = [];
    for (let t = Math.ceil(t0 / every) * every; t <= t1; t += every) times.push(t);
    body = (
      <svg width={W} height={H} className="plant-svg" data-src="axis" aria-hidden>
        {ax.ticks.map((k) => (
          <g key={k}>
            <line x1={padL} x2={W - padR} y1={y(k)} y2={y(k)} stroke={k === 0 ? P.secondary : "var(--color-fill)"} strokeWidth={1} strokeOpacity={k === 0 ? 0.6 : 1} />
            <text x={padL - 8} y={y(k)} dy="0.35em" textAnchor="end" className="plant-tick">{minus(k.toFixed(dec))} kW</text>
          </g>
        ))}
        {ax.lo < 0 && ax.hi > 0 && (
          <text x={W - padR - 6} y={y(0) - 6} textAnchor="end" className="plant-zero">+ import / − export</text>
        )}
        {hasSoc &&
          (ph >= 40 ? [0, 50, 100] : ph >= 20 ? [0, 100] : []).map((v) => ( // never closer than 16 px at 14 px text
            <text key={v} x={W - padR + 8} y={ys(v)} dy="0.35em" className="plant-tick">{v} %</text>
          ))}
        <path d={fill} fill="var(--plant-blue)" fillOpacity={0.14} />
        {hasSoc && <path d={socLine} fill="none" stroke={P.secondary} strokeWidth={1.5} strokeDasharray="4 4" />}
        <path d={line} fill="none" stroke="var(--plant-blue)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {limit != null && (
          <g>
            <line x1={padL} x2={W - padR} y1={y(limit)} y2={y(limit)} stroke={P.red} strokeWidth={2} strokeDasharray="6 5" />
            <text x={padL + 6} y={y(limit) - 6} className="plant-limit" data-src={limitSrc} data-val={limit}>import limit {limit} kW</text>
          </g>
        )}
        {times.map((t) => (
          <text key={t} x={x(t)} y={H - 6} textAnchor="middle" className="plant-tick">{clockOf(t)}</text>
        ))}
      </svg>
    );
  }
  return (
    <div ref={ref} className="plant-chart" role="img" aria-label="Blatnica grid kW, last 30 minutes">
      {body ?? <p className="demo-wait">{rows.length > 1 ? "" : "Collecting the plant's last 30 minutes"}</p>}
    </div>
  );
}

export function PlantHero({ plant }: { plant: LivePlant }) {
  const { live, sample, h, t, ageS, pts } = usePlant(plant);
  const ak = h?.ack ?? {};
  const lim = ak.applied?.import_max_kw ?? null;
  const following = lim != null && (ak.status === "applied" || ak.status === "partial");
  const limSrc = `${HH}/ack/applied/import_max_kw`;
  const hasSoc = pts.filter((p) => p.soc != null).length > 1;
  const stat = (src: string, v: number | null | undefined, digits: number, unit: string, label: ReactNode, sign = false) => (
    <div className="plant-stat">
      <div className="plant-v">
        <N src={src} val={v} sample={sample}>{v == null ? "–" : minus(`${sign && v > 0 ? "+" : ""}${v.toFixed(digits)}`)}</N>
        <span className="plant-u"> {unit}</span>
      </div>
      <div className="plant-l">{label}</div>
    </div>
  );
  const g = t?.grid_kw;
  return (
    <section className="panel demo-hero plant-hero">
      <header className="demo-hero-head">
        <div>
          <h1 className="demo-name">Blatnica · real plant · live</h1>
          <p className="demo-where">
            {sample ? (
              <span className="blat-sample">Sample</span>
            ) : ageS != null ? (
              <>
                <i className={`blat-dot${ageS > 120 ? " is-stale" : ""}`} aria-hidden />
                updated <span data-src="page" data-label="seconds since the plant's last reading (telemetry.rx)">{ageS} s</span> ago · Cerbo GX + Vitocal via Gridzilla agents
              </>
            ) : (
              "waiting for the plant"
            )}
          </p>
        </div>
        <p className="demo-sentence">
          {!h || !t ? (
            "Our family home in Blatnica: waiting for its next reading."
          ) : following ? (
            <>
              Our family home follows a signed signal right now: at most <N src={limSrc} val={lim} sample={sample}>{lim} kW</N> from the grid, battery and heat pump
              answering, {ak.verified ? "signature checked" : "signature not checked"}.
            </>
          ) : (
            <>
              Our family home runs on its own right now: Victron battery, Viessmann heat pump,{" "}
              {t.ev != null ? <N src={`${T}/ev`} val={t.ev} sample={sample}>{t.ev} kW</N> : <span data-src="deck" data-label="Blatnica's EV station">11 kW</span>} charger,
              all reporting live.
            </>
          )}
        </p>
      </header>
      <div className="demo-hero-body">
        <div className="demo-curve plant-curve">
          <div className="lc-legend flex flex-wrap items-center gap-x-[1.25em] gap-y-[0.35em]" style={{ lineHeight: 1.3, paddingBottom: "0.5em" }}>
            <Key swatch={<Swatch color="var(--plant-blue)" width={3.5} />} label="Grid kW (measured)" muted={pts.filter((p) => p.grid_kw != null).length < 2} />
            <Key swatch={<Swatch color={P.red} width={2.5} dashed />} label="Import limit" muted={lim == null} />
            <Key swatch={<Swatch color={P.secondary} width={2} dashed />} label="Battery SoC" muted={!hasSoc} />
          </div>
          <PlantChart pts={pts} limit={lim} limitSrc={limSrc} />
          {t && (
            <div className="plant-stats">
              {stat(`${T}/grid_kw`, g, 2, "kW", g != null && g > 0.05 ? "grid import" : g != null && g < -0.05 ? "grid export" : "grid · balanced", true)}
              {stat(`${T}/soc`, t.soc, 0, "%", "battery SoC")}
              {stat(`${T}/ev_kw`, t.ev_kw, 1, "kW", <>EV charger · {t.ev_kw != null && t.ev_kw > 0 ? "charging" : "idle"}</>)}
              {stat(
                `${T}/hp_kw`,
                t.hp_kw,
                1,
                "kW",
                <>
                  heat pump
                  <span className="plant-more">
                    {t.dhw_c != null && (
                      <>
                        {" "}
                        <span className="blat-part">· tank <N src={`${T}/dhw_c`} val={t.dhw_c} sample={sample}>{t.dhw_c.toFixed(1)} °C</N></span>
                      </>
                    )}
                    {t.heat_set_c != null && (
                      <>
                        {" "}
                        <span className="blat-part">· room → <N src={`${T}/heat_set_c`} val={t.heat_set_c} sample={sample}>{t.heat_set_c} °C</N></span>
                      </>
                    )}
                  </span>
                </>,
              )}
            </div>
          )}
        </div>
        <div className="demo-ring" style={{ color: socTone(t?.soc) }} {...(sample ? { "data-src": "sample" } : { "data-src": `${T}/soc`, "data-val": t?.soc == null ? undefined : String(t.soc) })}>
          <LoadRing pct={t?.soc ?? null} size={400} sublabel="Battery" />
        </div>
      </div>
      {!live && !sample && <span className="sr-only">The live plant is not reachable from here.</span>}
    </section>
  );
}
