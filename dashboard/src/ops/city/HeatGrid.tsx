// The city heat grid: every transformer as one cell, grouped by substation (rows) and feeder (three per row). The number
// is the live load in % of its limit, the tint says what it means (green inside, orange from 85 %, red at or over 100 %
// in either direction), the bar under the number fills with the load. A dot = an active signal covers it, a ring = the
// diet plan eats a peak there. Hover or focus shows a plain tooltip, click selects it for the whole console.
import { useMemo, useRef, useState } from "react";
import type { Flatten, State } from "../../api";
import { hhmm, MODE_WORDS, nice } from "../../model";
import { loadTone, P } from "../../stage/palette";
import { cityGroups, type TfCell } from "./cityData";

const fmtKw = (kw: number | null) => (kw == null ? "no reading" : `${Math.abs(kw) >= 100 ? Math.round(kw) : kw.toFixed(1)} kW`);

function tint(pct: number | null) {
  const p = Math.abs(pct ?? 0);
  const amt = p >= 100 ? 30 : p >= 85 ? 24 : 14;
  return `color-mix(in srgb, ${loadTone(pct)} ${amt}%, var(--color-card))`;
}

interface Tip { cell: TfCell; x: number; y: number; below: boolean }

export default function HeatGrid({ s, city, selected, onSelect }: { s: State; city: Flatten | null; selected: string; onSelect: (tf: string) => void }) {
  const groups = useMemo(() => cityGroups(s, city), [s, city]);
  const all = groups.flatMap((g) => g.feeders.flatMap((f) => f.tfs));
  const over = all.filter((c) => Math.abs(c.pct ?? 0) >= 100).length;
  const near = all.filter((c) => Math.abs(c.pct ?? 0) >= 85 && Math.abs(c.pct ?? 0) < 100).length;
  const signalled = all.filter((c) => c.signal).length;
  const dieting = groups.flatMap((g) => g.feeders).filter((f) => f.diet).length;
  const box = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);

  const show = (cell: TfCell, el: HTMLElement) => {
    const b = box.current?.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (!b) return;
    const below = r.top - b.top < 110;
    const half = Math.min(120, b.width / 2); // half the widest tooltip: keep it inside the panel
    setTip({ cell, x: Math.max(half, Math.min(b.width - half, r.left - b.left + r.width / 2)), y: below ? r.bottom - b.top + 6 : r.top - b.top - 6, below });
  };
  // keep an open tooltip live as new readings arrive
  const live = tip ? { ...tip, cell: all.find((c) => c.id === tip.cell.id) ?? tip.cell } : null;

  return (
    <div className="panel cg" ref={box} onMouseLeave={() => setTip(null)}>
      <header className="cg-head">
        <h2 className="cg-title">Live city</h2>
        <div className="cg-counts num">
          <span>{all.length} transformers</span>
          <span style={{ color: over ? P.red : undefined }}>{over} over</span>
          <span style={{ color: near ? P.orange : undefined }}>{near} near the limit</span>
          <span>{signalled} under a signal</span>
          <span>diet plan on {dieting} feeders</span>
        </div>
      </header>

      <div className="cg-grid" role="grid" aria-label="Transformers by substation and feeder">
        {groups.map((g) => (
          <div className="cg-sub" role="row" key={g.id}>
            <div className="cg-subname">
              <span className="cg-subtitle">{nice(g.id)}</span>
              <span className="cg-submax num" style={{ color: g.worst >= 100 ? P.red : g.worst >= 85 ? P.orange : undefined }}>
                max {g.worst} %
              </span>
            </div>
            {g.feeders.map((f) => (
              <div className="cg-feeder" key={f.id}>
                <div className="cg-fname">
                  {f.diet && <i className="cg-diet cg-inline" aria-label="diet plan running" />}
                  {nice(f.id)}
                </div>
                <div className="cg-cells">
                  {f.tfs.map((c) => {
                    const sel = c.id === selected;
                    const p = Math.abs(c.pct ?? 0);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="gridcell"
                        className={`cg-cell num${sel ? " is-sel" : ""}`}
                        style={{ background: tint(c.pct) }}
                        aria-label={`${nice(c.id)}: ${c.pct ?? "no"} % of its limit${c.signal ? `, signal ${c.signal.mode}` : ""}`}
                        aria-pressed={sel}
                        onClick={() => onSelect(c.id)}
                        onMouseEnter={(e) => show(c, e.currentTarget)}
                        onFocus={(e) => show(c, e.currentTarget)}
                        onBlur={() => setTip(null)}
                      >
                        <span className="cg-pct" style={{ color: p >= 100 ? P.red : undefined }}>
                          {c.pct == null ? "–" : c.pct < 0 ? `−${p}` : p}
                        </span>
                        <span className="cg-bar" style={{ width: `calc((100% - 6px) * ${Math.min(100, p) / 100})`, background: loadTone(c.pct) }} />
                        {c.signal && <span className="cg-sig" aria-hidden />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <footer className="cg-legend">
        <span><i className="cg-sw" style={{ background: P.green }} />inside the limit</span>
        <span><i className="cg-sw" style={{ background: P.orange }} />85 % and up</span>
        <span><i className="cg-sw" style={{ background: P.red }} />over, either direction</span>
        <span><i className="cg-sig cg-inline" />signal</span>
        <span><i className="cg-diet cg-inline" />feeder on the diet plan</span>
        <span><i className="cg-selsw" />selected</span>
      </footer>

      {live && <Tooltip tip={live} s={s} />}
    </div>
  );
}

function Tooltip({ tip, s }: { tip: Tip; s: State }) {
  const c = tip.cell;
  const back = (c.kw ?? 0) < 0;
  const p = Math.abs(c.pct ?? 0);
  return (
    <div className={`cg-tip${tip.below ? " is-below" : ""}`} style={{ left: tip.x, top: tip.y }} role="tooltip">
      <div className="cg-tip-name">{nice(c.id)}</div>
      <div className="cg-tip-row num">
        {back ? "Pushing back " : "Drawing "}
        {fmtKw(c.kw == null ? null : Math.abs(c.kw))}
        {c.limit != null && ` of ${Math.round(c.limit)} kW`}
      </div>
      <div className="cg-tip-row num" style={{ color: loadTone(c.pct) === P.green ? undefined : loadTone(c.pct) }}>
        {c.pct == null ? "No load reading" : `${p} % of its ${back ? "backflow " : ""}limit`}
      </div>
      <div className="cg-tip-row">
        {c.signal ? `Signal: ${MODE_WORDS[c.signal.mode]?.title ?? c.signal.mode} (${c.signal.mode})` : "No signal on it"}
      </div>
      {c.diet && <div className="cg-tip-row num">Diet plan: peak {c.diet.from} % → {c.diet.to} %</div>}
      {c.peak && !c.diet && <div className="cg-tip-row num">Forecast peak {c.peak.pct} % at {hhmm(c.peak.h)}</div>}
      <div className="cg-tip-hint">{s.tree[c.id]?.parent ? `${nice(s.tree[c.id].parent)} feeder · click to open` : "click to open"}</div>
    </div>
  );
}
