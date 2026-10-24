// Dad's Blatnica panel (board, Presentation tab): the real house on Gridzilla. Grid kW (taking from or sending to the
// grid), battery % full, car charger, heat pump and its water tank, how fresh the reading is, the signal covering the
// house and its last signed reply. Silent plant = "waiting for the plant", never invented numbers (`?plant=sample`
// shows a labelled fixture for design reviews).
import type { ReactNode } from "react";
import { BLATNICA_DEVICE, type HouseholdTelemetry, type State } from "../../api";
import { nice } from "../../model";
import { modeTitle } from "../../components/brain/plain";
import { useNow } from "../control/ui";
import type { Ops } from "../useOps";
import "./plant.css";

const SAMPLE = typeof location !== "undefined" && new URLSearchParams(location.search).get("plant") === "sample";
const SAMPLE_T: HouseholdTelemetry = { soc: 64, grid_kw: -1.8, ev_kw: 7.2, hp_kw: 1.4, dhw_c: 47.5, dhw_set_c: 50, boiler_c: null, heat: "heatpump", ev: 11, mode: "owner" };
const T0 = "state/households/blatnica/telemetry";

function Stat({ label, value, unit, src, val, children }: { label: string; value: string; unit: string; src: string; val: number | null; children?: ReactNode }) {
  return (
    <div className="pc-stat">
      <div className="pc-label">{label}</div>
      <div className="pc-num">
        <span data-src={src} data-val={val != null ? String(val) : undefined}>{value}</span>
        <span className="pc-unit">&nbsp;{unit}</span>
      </div>
      {children && <div className="pc-sub">{children}</div>}
    </div>
  );
}

function Line({ pts }: { pts: number[] }) {
  if (pts.length < 2) return null;
  const lo = Math.min(0, ...pts), hi = Math.max(0.5, ...pts);
  const W = 300, H = 40;
  const y = (x: number) => H - 3 - ((x - lo) / (hi - lo || 1)) * (H - 6);
  const d = pts.map((x, i) => `${i ? "L" : "M"}${((i / (pts.length - 1)) * W).toFixed(1)},${y(x).toFixed(1)}`).join("");
  return (
    <svg className="pc-line" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Grid power of the house over the last minutes">
      <line x1="0" x2={W} y1={y(0)} y2={y(0)} className="pc-zero" vectorEffect="non-scaling-stroke" />
      <path d={d} className="pc-path" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const STATUS: Record<string, string> = { applied: "followed it", partial: "followed it partly", refused: "refused it", reverted: "went back to the owner" };

export default function PlantCard({ ops }: { ops: Ops }) {
  const now = useNow();
  const s = ops.s as State;
  const h = s.households?.blatnica;
  const live = h?.telemetry ?? null;
  const t = live ?? (SAMPLE ? SAMPLE_T : null);
  const ageS = live?.rx ? Math.max(0, Math.round((now - Date.parse(live.rx)) / 1000)) : null;
  const sig = h ? Object.entries(s.active).find(([n]) => (h.path ?? []).includes(n)) : undefined;
  const pts = (ops.history?.devices?.[BLATNICA_DEVICE] ?? []).slice(-60).map((p) => p.grid_kw).filter((x): x is number => x != null);
  const ack = h?.ack ?? null;
  const g = t?.grid_kw ?? null;
  const sk = (k: string) => (live ? `${T0}/${k}` : "sample");

  return (
    <section className="panel pc" aria-label="Blatnica, a real house on Gridzilla">
      <header className="pc-head">
        <h2 className="pc-title">Blatnica, a real house</h2>
        <span className="pc-age">
          {live ? (
            ageS != null ? (
              <>Updated <span data-src={`${T0}/rx`}>{ageS}</span> s ago</>
            ) : (
              "Live"
            )
          ) : SAMPLE ? (
            "Design sample, not live"
          ) : (
            "Waiting for the plant"
          )}
        </span>
      </header>
      {t ? (
        <>
          <div className="pc-grid">
            <Stat label="Grid" value={g == null ? "-" : Math.abs(g).toFixed(1)} unit="kW" src={sk("grid_kw")} val={g}>
              {g == null ? "no reading" : g > 0.05 ? "taking from the grid" : g < -0.05 ? "sending to the grid" : "balanced"}
            </Stat>
            <Stat label="Battery" value={t.soc == null ? "-" : t.soc.toFixed(0)} unit="% full" src={sk("soc")} val={t.soc} />
            <Stat label="Car charger" value={t.ev_kw.toFixed(1)} unit="kW" src={sk("ev_kw")} val={t.ev_kw}>
              {t.ev_kw > 0.05 ? "charging" : "idle"}
            </Stat>
            <Stat label="Heat pump" value={t.hp_kw.toFixed(1)} unit="kW" src={sk("hp_kw")} val={t.hp_kw}>
              {t.dhw_c != null ? (
                <>
                  water tank <span data-src={sk("dhw_c")} data-val={t.dhw_c}>{t.dhw_c.toFixed(0)}</span>&nbsp;°C
                </>
              ) : (
                "no tank reading"
              )}
            </Stat>
          </div>
          {live && <Line pts={pts} />}
        </>
      ) : (
        <p className="pc-wait">No readings from the real house right now. They appear the moment it reports.</p>
      )}
      <div className="pc-foot">
        <div>
          {sig ? (
            <>
              Covered by <b>{modeTitle(sig[1].mode)}</b>, #<span data-src={`state/active/${sig[0]}/seq`} data-val={sig[1].seq}>{sig[1].seq}</span> on {nice(sig[0])}
            </>
          ) : (
            "No signal on its street: the owner is in charge"
          )}
        </div>
        <div>
          {ack?.status ? (
            <>
              Last reply: {STATUS[ack.status] ?? ack.status}
              {ack.seq != null && (
                <>
                  {" "}(#<span data-src="state/households/blatnica/ack/seq" data-val={ack.seq}>{ack.seq}</span>)
                </>
              )}
              , signature {ack.verified === false ? <span className="pc-red">failed the check</span> : "checked"}
            </>
          ) : (
            "No signed reply yet"
          )}
        </div>
      </div>
    </section>
  );
}
