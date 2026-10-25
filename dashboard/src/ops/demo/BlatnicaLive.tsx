// "Blatnica · real plant · live": the captain's family home (Victron Cerbo GX battery + Viessmann Vitocal heat pump + EV
// charger) on Gridzilla for real, read from the LIVE server (live.ts), with dad's labels from his Presentation tab:
// four stats, his 30-minute grid kW line, and the ack/signal footer. No data = "waiting for the plant", never numbers
// we made up; ?plant=sample shows a labelled fixture for design reviews.
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { kwTicks, LIVE_DEVICE, LIVE_HH, PLANT_SAMPLE, SAMPLE_HH, SAMPLE_POINTS, useLiveBlatnica, type LiveHousehold } from "./live";
import type { DevPoint } from "../../api";
import { Key, Swatch } from "../../stage/kit/LiveCurve";
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
function GridLine({ pts }: { pts: DevPoint[] }) {
  const v = pts.map((p) => p.grid_kw);
  const nums = v.filter((x): x is number => x != null);
  if (nums.length < 2) return <div className="blat-chart blat-chart-empty">collecting the last 30 minutes</div>;
  const { lo, hi, ticks } = kwTicks(nums);
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
    <div className="blat-chart" role="img" aria-label="Blatnica grid kW, last 30 minutes">
      <div className="blat-ticks" data-src="axis">
        {ticks.map((t) => (
          <span key={t} style={{ top: `${(y(t) / H) * 100}%` }}>
            {minus(t.toFixed(dec))} kW
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

export default function BlatnicaLive() {
  const { state, stateFailed, history } = useLiveBlatnica();
  const now = useNow(1000);
  const liveH = state?.households?.[LIVE_HH] ?? null;
  const live = !stateFailed && liveH?.telemetry ? liveH : null;
  const sample = !live && PLANT_SAMPLE;
  const h: LiveHousehold | null = live ?? (sample ? SAMPLE_HH : null);
  const t = h?.telemetry ?? null;
  const ageS = live?.telemetry?.rx ? Math.max(0, Math.round((now - Date.parse(live.telemetry.rx)) / 1000)) : null;
  const pts = live ? (history?.devices?.[LIVE_DEVICE] ?? []).slice(-120) : sample ? SAMPLE_POINTS : [];

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
      <section className="panel blat" aria-live="polite">
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
    <section className="panel blat">
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
