// The plain views beside Operations: City, Autopilot, Manual, Households, Real plant, Weather, Log. Dense tables built
// straight from the data the console already polls (useOps), so switching views never waits for a fetch.
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import { useGridState, type Decision, type Household, type LogEntry, type RecentSignal, type Signal, type WeatherHour } from "../../api";
import type { Ops } from "../useOps";
import type { Route } from "../shell/Sidebar";
import Table, { type Col } from "./Table";
import HeatGrid from "../city/HeatGrid";
import HouseDetail from "./HouseDetail";
import Flex from "../city/Flex";
import "../city/city.css";
import { MODE_LABEL, clock, kw, minsLeft, nice, signalOver, wall } from "./fmt";
import "../shell/shell.css";
import PlantPage from "../plant/PlantPage";

export default function OtherView({ route, ops }: { route: Route; ops: Ops }) {
  if (!ops.s) return null;
  switch (route) {
    case "city": return <City ops={ops} />;
    case "autopilot": return <Autopilot ops={ops} />;
    case "manual": return <Manual ops={ops} />;
    case "households": return <Households ops={ops} />;
    case "plant": return <PlantPage />;
    case "weather": return <WeatherView ops={ops} />;
    case "log": return <Log ops={ops} />;
    default: return null;
  }
}

// ------------------------------------------------------------------ bits
function Head({ title, desc, children }: { title: string; desc: string; children?: ReactNode }) {
  return (
    <div className="vw-head">
      <div>
        <h1 className="vw-title">{title}</h1>
        <div className="vw-desc">{desc}</div>
      </div>
      {children && <div className="vw-stats">{children}</div>}
    </div>
  );
}
const Stat = ({ k, v, tone, hint, from }: { k: string; v: ReactNode; tone?: string; hint?: string; from?: string }) => (
  <span className="chip" title={hint} data-tip={hint}>
    {tone && <span className="chip-dot" style={{ background: tone }} />}
    <span className="t">{k}</span>
    {/* from: the count's formula for the data-truth gate (qa/README.md); without it the value is a page count */}
    <span data-src={from ? "derived" : "page"} data-from={from} data-label={from ? undefined : hint ?? k} data-val={from && typeof v === "number" ? v : undefined}>{v}</span>
  </span>
);
const Card = ({ title, right, children }: { title?: string; right?: ReactNode; children: ReactNode }) => (
  <section className="vw-card">
    {(title || right) && (
      <div className="vw-card-h">
        <span className="vw-card-t">{title}</span>
        {right}
      </div>
    )}
    {children}
  </section>
);

const toneOf = (pct: number | null | undefined) => {
  const p = Math.abs(pct ?? 0);
  return p >= 100 ? "r" : p >= 85 ? "o" : "g";
};
const TONE = { r: "var(--sh-red)", o: "var(--sh-orange)", g: "var(--sh-green)" } as const;

function Load({ pct }: { pct: number | null | undefined }) {
  if (pct == null) return <span className="dim">–</span>;
  const t = toneOf(pct);
  return (
    <span className="loadbar">
      <span style={{ color: t === "g" ? undefined : TONE[t], fontWeight: t === "g" ? 400 : 600 }}>{Math.round(pct)} %</span>
      <i><b style={{ width: `${Math.min(100, Math.abs(pct))}%`, background: TONE[t] }} /></i>
    </span>
  );
}

const ModeTag = ({ mode }: { mode: string | null | undefined }) =>
  mode ? (
    <span className="tag b" title={mode} style={{ maxWidth: "100%", whiteSpace: "normal", overflowWrap: "anywhere" }}>
      {MODE_LABEL[mode] ?? mode} <span style={{ opacity: 0.6, fontWeight: 500 }}>{mode}</span>
    </span>
  ) : (
    <span className="dim">–</span>
  );

const VERDICT: Record<string, [string, string]> = {
  sent: ["g", "Sent"],
  pending: ["o", "Waiting for you"],
  held: ["o", "Held"],
  refused: ["r", "Refused by guard"],
  rejected: ["r", "Rejected"],
  error: ["r", "Error"],
  expired: ["", "Expired"],
  none: ["", "No action"],
};

const open = (ops: Ops, tf: string) => {
  ops.select(tf);
  location.hash = "#/";
};

// ------------------------------------------------------------------ City
type TfRow = { tf: string; feeder: string; sub: string; pct: number | null; kw: number | null; rating: number | null; sig: Signal | null; peak: { pct: number; h: number } | null };

function City({ ops }: { ops: Ops }) {
  const s = ops.s!;
  const rows = useMemo<TfRow[]>(
    () =>
      Object.keys(s.tree)
        .filter((n) => n.startsWith("tf:"))
        .map((tf) => {
          const feeder = s.tree[tf]?.parent ?? "";
          const a = s.aggregates[tf];
          return {
            tf, feeder, sub: s.tree[feeder]?.parent ?? "",
            pct: a?.load_pct ?? null, kw: a?.total_kw ?? null, rating: a?.rating_kw ?? s.tree[tf]?.rating_kw ?? null,
            sig: signalOver(s, tf), peak: s.forecast_peak?.[tf] ?? null,
          };
        }),
    [s],
  );
  const over = rows.filter((r) => Math.abs(r.pct ?? 0) >= 100).length;
  const near = rows.filter((r) => toneOf(r.pct) === "o").length;
  const cols: Col<TfRow>[] = [
    { key: "tf", label: "Transformer", cell: (r) => <b style={{ fontWeight: 600 }} data-src={`state/aggregates/${r.tf}`}>{nice(r.tf)}</b>, sort: (r) => r.tf },
    { key: "feeder", label: "Feeder", cell: (r) => <span className="mut" data-src={`state/aggregates/${r.feeder}`}>{nice(r.feeder)}</span>, sort: (r) => r.feeder },
    { key: "sub", label: "Substation", cell: (r) => <span className="mut" data-src={`state/aggregates/${r.sub}`}>{nice(r.sub)}</span>, sort: (r) => r.sub },
    { key: "pct", label: "Load, % of limit", right: true, phone: "aside", phoneLabel: "", cell: (r) => <span data-src={`state/aggregates/${r.tf}/load_pct`} data-val={r.pct ?? undefined}><Load pct={r.pct} /></span>, sort: (r) => (r.pct == null ? null : Math.abs(r.pct)) },
    { key: "kw", label: "Power now, kW", right: true, cell: (r) => <span data-src={`state/aggregates/${r.tf}/total_kw`} data-val={r.kw ?? undefined}>{kw(r.kw)}</span>, sort: (r) => r.kw },
    { key: "rating", label: "Limit, kW", right: true, cell: (r) => <span className="mut" data-src={`state/aggregates/${r.tf}/rating_kw`} data-val={r.rating ?? undefined}>{kw(r.rating, 0)}</span>, sort: (r) => r.rating },
    { key: "peak", label: "Peak ahead, % of limit", right: true, className: "nw", cell: (r) => (r.peak ? <span style={{ color: r.peak && toneOf(r.peak.pct) !== "g" ? TONE[toneOf(r.peak.pct)] : undefined }}><span data-src={`state/forecast_peak/${r.tf}/pct`} data-val={r.peak.pct}>{r.peak.pct} %</span> <span className="dim" data-src="axis">at {clock(r.peak.h)}</span></span> : <span className="dim">–</span>), sort: (r) => (r.peak ? Math.abs(r.peak.pct) : null) },
    { key: "sig", label: "Active signal", cell: (r) => (r.sig ? <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6, alignItems: "center", minWidth: 0 }}><ModeTag mode={r.sig.mode} /><span className="dim" style={{ overflowWrap: "anywhere" }} data-src={`state/active/${r.sig.segment}`}>#{r.sig.seq}{r.sig.segment !== r.tf ? ` on ${nice(r.sig.segment)}` : ""}</span></span> : <span className="dim">none</span>), sort: (r) => (r.sig ? r.sig.seq : null) },
  ];
  return (
    <div className="vw" data-scroll="view">
      <Head title="City" desc="Every transformer in the city, live. Click a tile to pick it, click a row to open it in Operations.">
        <Stat k="Transformers" v={rows.length} hint="Every street transformer in the simulated Vienna grid" from="count(state/aggregates/tf:*)" />
        <Stat k="Over limit" v={over} hint="Transformers carrying more than their limit right now, in either direction" tone={over ? "var(--sh-red)" : "var(--sh-green)"} from="count(state/aggregates/tf:*[abs(load_pct) >= 100])" />
        <Stat k="Near limit" v={near} hint="Transformers at 85 % of their limit or more" tone={near ? "var(--sh-orange)" : "var(--sh-green)"} />
        <Stat k="Signals running" v={Object.keys(s.active).length} hint="Signals the grid operator has running right now; each ends on its own" from="count(state/active/*)" />
      </Head>
      <Flex s={s} />
      <div className="vw-heat">
        <HeatGrid s={s} city={ops.city} selected={ops.tf} onSelect={ops.select} />
      </div>
      <Card>
        <Table rows={rows} cols={cols} rowKey={(r) => r.tf} onRow={(r) => open(ops, r.tf)} initial={{ key: "pct", dir: -1 }} />
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ Autopilot
function Autopilot({ ops }: { ops: Ops }) {
  const ap = ops.s!.autopilot;
  const hist = ap?.history ?? [];
  const cols: Col<Decision>[] = [
    { key: "t", label: "Grid time", className: "nw", cell: (d) => <span>{clock(d.sim_h)} <span className="dim">{wall(d.at, false)}</span></span>, sort: (d) => d.at },
    { key: "trigger", label: "What it saw", className: "wrap", phone: "line", cell: (d) => <span className="mut">{d.trigger ?? "–"}</span> },
    { key: "mode", label: "Decision", className: "nw", cell: (d) => <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><ModeTag mode={d.mode} />{d.segment && <span className="dim">{nice(d.segment)}</span>}</span>, sort: (d) => d.mode },
    { key: "verdict", label: "Outcome", className: "nw", phone: "aside", phoneLabel: "", cell: (d) => { const [t, l] = VERDICT[d.verdict] ?? ["", d.verdict]; return <span title={d.detail || undefined}><span className={`tag ${t}`}>{l}</span>{d.seq != null && <span className="dim"> #{d.seq}</span>}</span>; }, sort: (d) => d.verdict },
    { key: "lat", label: "AI answered in", right: true, className: "nw", cell: (d) => (d.latency_ms != null ? `${(d.latency_ms / 1000).toFixed(1)} s` : <span className="dim">–</span>), sort: (d) => d.latency_ms },
    { key: "why", label: "Why", className: "wrap", phone: "line", cell: (d) => <span>{d.rationale ?? d.detail ?? "–"}{d.verdict !== "sent" && d.detail && d.rationale ? <span className="dim"> · {d.detail}</span> : null}</span> },
  ];
  const sent = hist.filter((d) => d.verdict === "sent").length;
  return (
    <div className="vw">
      <Head title="Autopilot" desc={`The AI looks ahead ${ap?.horizon_min ?? "–"} grid minutes and acts when a transformer is forecast past ${ap?.trigger_pct ?? "–"} % of its limit. Every decision passes the guard first.`}>
        <Stat k="Mode" v={ap?.mode === "auto" ? "Auto" : ap?.mode === "propose" ? "Propose" : "Off"} tone={ap?.mode === "auto" ? "var(--sh-green)" : ap?.mode === "propose" ? "var(--sh-blue)" : undefined} />
        <Stat k="Brain" v={ops.s!.llm ? "AI" : "Rules"} />
        <Stat k="Now" v={ap?.busy ? `working (${ap.stage})` : "idle"} />
        <Stat k="Sent" v={`${sent} of the last ${hist.length} decisions`} hint="How many of the AI's recent decisions became a signed signal" />
        {ap?.pending && <Stat k="Waiting" v="1 proposal" tone="var(--sh-orange)" />}
      </Head>
      {ap?.context && (
        <Card title="Operator note for the AI"><div style={{ padding: "10px 14px", fontSize: "0.8125rem" }}>{ap.context}</div></Card>
      )}
      <Card title="Decisions, newest first" right={<span className="t-caption">last {hist.length} decisions</span>}>
        <Table rows={hist} cols={cols} rowKey={(d) => `${d.at}-${d.seq ?? ""}-${d.mode ?? ""}`} empty={<><b>No decisions yet</b>The AI is asked when a transformer is forecast past {ap?.trigger_pct ?? "–"} %.</>} />
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ Manual
function signalCols(): Col<Signal>[] {
  return [
    { key: "seq", label: "Signed #", className: "nw", cell: (g) => <b style={{ fontWeight: 600 }}>#{g.seq}</b>, sort: (g) => g.seq },
    { key: "seg", label: "Where", className: "nw", cell: (g) => nice(g.segment), sort: (g) => g.segment },
    { key: "mode", label: "Mode", className: "nw", phone: "aside", phoneLabel: "", cell: (g) => <ModeTag mode={g.mode} />, sort: (g) => g.mode },
    { key: "lim", label: "Limits", className: "nw", cell: (g) => <span className="mut">{limits(g)}</span> },
    { key: "win", label: "Window", className: "nw", cell: (g) => <span className="mut">{wall(g.valid_from, false)} – {wall(g.valid_to, false)}</span>, sort: (g) => g.valid_from },
    { key: "left", label: "Time left", right: true, className: "nw", cell: (g) => (g.valid_to ? `${minsLeft(g.valid_to)} min` : "–"), sort: (g) => g.valid_to },
    { key: "note", label: "Note", className: "wrap", phone: "line", cell: (g) => <span className="mut">{g.note || "–"}</span> },
  ];
}
function limits(g: Signal) {
  const p: string[] = [];
  if (g.import_max_kw != null) p.push(`take ≤ ${g.import_max_kw} kW`);
  if (g.export_max_kw != null) p.push(`give ≤ ${g.export_max_kw} kW`);
  if (g.export_min_kw != null) p.push(`give ≥ ${g.export_min_kw} kW`);
  if (g.charge_max_kw != null) p.push(`charge ≤ ${g.charge_max_kw} kW`);
  if (g.discharge_max_kw != null) p.push(`discharge ≤ ${g.discharge_max_kw} kW`);
  if (g.target_soc != null) p.push(`battery to ${g.target_soc} %`);
  if (g.envelope) p.push("per-slot plan");
  return p.join(" · ") || "–";
}

function Manual({ ops }: { ops: Ops }) {
  const s = ops.s!;
  const act = Object.values(s.active);
  const recent = Object.values(s.recent ?? {}).filter((r) => r.ended_at) as RecentSignal[];
  const rcols: Col<RecentSignal>[] = [
    ...(signalCols().filter((c) => c.key !== "left" && c.key !== "note") as unknown as Col<RecentSignal>[]),
    { key: "ended", label: "Ended", className: "nw", cell: (g) => <span className="mut">{wall(g.ended_at, false)} · {g.ended ?? "–"}</span>, sort: (g) => g.ended_at },
  ];
  return (
    <div className="vw">
      <Head title="Manual" desc="Sign and send a signal yourself. The signal composer lives in Operations, in the right column, next to the AI card." />
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "12px 14px" }}>
          <span style={{ fontSize: "0.875rem" }}>Signal composer is in <b>Operations, right column</b>.</span>
          <a className="btn btn-primary" href="#/" style={{ textDecoration: "none", fontSize: "0.8125rem", padding: "0.45rem 0.9rem" }}>
            Open the composer <ArrowRight size={14} weight="bold" />
          </a>
        </div>
      </Card>
      <Card title="Active signals" right={<span className="t-caption">{act.length} running now</span>}>
        <Table rows={act} cols={signalCols()} rowKey={(g) => String(g.seq)} initial={{ key: "seq", dir: -1 }} empty={<><b>No signal is active</b>Every house runs on its owner's settings.</>} />
      </Card>
      {recent.length > 0 && (
        <Card title="Recently ended">
          <Table rows={recent} cols={rcols} rowKey={(g) => `${g.segment}-${g.seq}`} initial={{ key: "ended", dir: -1 }} />
        </Card>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Households
function Households({ ops }: { ops: Ops }) {
  // The console polls only the selected feeder's houses; this view asks for all of them in the background and shows
  // the feeder's houses until that answer lands, so the switch is instant.
  const all = useGridState("all", "");
  const src = all.hhOf === "all" && all.data?.households ? all.data.households : ops.s!.households ?? {};
  // which payload the table shows, for the data-truth tags (api.ts keeps the all-homes answer under "state:all")
  const SP = all.hhOf === "all" && all.data?.households ? "state:all" : "state";
  const [q, setQ] = useState("");
  // The house whose detail drawer is open (clicking a row); it stays live from the same payload as the table.
  const [pick, setPick] = useState("");
  const picked = pick ? src[pick] ?? ops.s!.households?.[pick] ?? null : null;
  const close = useCallback(() => setPick(""), []);
  const rows = useMemo(() => {
    const v = Object.values(src);
    const f = q.trim().toLowerCase();
    return f ? v.filter((h) => `${h.id} ${h.tf} ${h.telemetry?.mode ?? ""}`.toLowerCase().includes(f)) : v;
  }, [src, q]);
  const total = Object.keys(src).length;
  const online = Object.values(src).filter((h) => h.telemetry).length;
  const cols: Col<Household>[] = [
    { key: "id", label: "House", cell: (h) => <span data-src={`${SP}/households/${h.id}`}><b style={{ fontWeight: 600 }}>{h.real ? "Blatnica (real)" : nice(h.id.replace(/^sim-/, ""))}</b>{h.represents > 1 && <span className="dim" data-src={`${SP}/households/${h.id}/represents`} data-val={h.represents}> ×{h.represents}</span>}</span>, sort: (h) => h.id },
    { key: "tf", label: "Transformer", cell: (h) => <span className="mut" data-src={`state/aggregates/${h.tf}`}>{nice(h.tf)}</span>, sort: (h) => h.tf },
    { key: "soc", label: "Battery, %", right: true, phone: "aside", phoneLabel: "Battery", cell: (h) => (h.telemetry?.soc != null ? <span data-src={`${SP}/households/${h.id}/telemetry/soc`} data-val={h.telemetry.soc}>{Math.round(h.telemetry.soc)} %</span> : <span className="dim">–</span>), sort: (h) => h.telemetry?.soc },
    { key: "grid", label: "Grid, kW", phoneLabel: "From grid, kW", right: true, cell: (h) => <span data-src={`${SP}/households/${h.id}/telemetry/grid_kw`} data-val={h.telemetry?.grid_kw ?? undefined}>{kw(h.telemetry?.grid_kw)}</span>, sort: (h) => h.telemetry?.grid_kw },
    { key: "ev", label: "Car, kW", phoneLabel: "Car charging, kW", right: true, cell: (h) => <span data-src={`${SP}/households/${h.id}/telemetry/ev_kw`} data-val={h.telemetry?.ev_kw ?? undefined}>{kw(h.telemetry?.ev_kw)}</span>, sort: (h) => h.telemetry?.ev_kw },
    { key: "hp", label: "Heat, kW", phoneLabel: "Heat pump, kW", right: true, cell: (h) => <span data-src={`${SP}/households/${h.id}/telemetry/hp_kw`} data-val={h.telemetry?.hp_kw ?? undefined}>{kw(h.telemetry?.hp_kw)}</span>, sort: (h) => h.telemetry?.hp_kw },
    { key: "mode", label: "Mode", className: "nw", cell: (h) => (h.telemetry ? <span className={`tag ${h.telemetry.mode === "owner" ? "" : "b"}`}>{h.telemetry.mode === "owner" ? "Owner" : h.telemetry.mode}</span> : <span className="tag">offline</span>), sort: (h) => h.telemetry?.mode },
    { key: "ack", label: "Last reply", className: "nw", cell: (h) => (h.ack ? <span title={h.ack.reason ?? undefined}><span className={`tag ${h.ack.status === "applied" ? "g" : h.ack.status === "refused" ? "r" : "o"}`}>{h.ack.status}</span>{h.ack.seq != null && <span className="dim" data-src={`${SP}/households/${h.id}/ack/seq`} data-val={h.ack.seq}> #{h.ack.seq}</span>}</span> : <span className="dim">–</span>), sort: (h) => h.ack?.seq },
    { key: "sig", label: "Signature", phoneLabel: "Signature", className: "nw", cell: (h) => (h.ack?.verified ? <span className="tag g">Checked</span> : h.ack ? <span className="tag">Not checked</span> : <span className="dim">–</span>), sort: (h) => (h.ack?.verified ? 1 : 0) },
  ];
  return (
    <div className="vw" data-scroll="view">
      <Head title="Households" desc="Every home in the programme: what its battery, car and heat pump do now and how it answered the last signal. Click a home to see what it may draw and what it did.">
        <Stat k="Homes" v={total} hint="Simulated homes in the programme (each can stand for several real houses)" />
        <Stat k="Reporting" v={online} hint="Homes that sent a reading recently" tone={online ? "var(--sh-green)" : undefined} />
        {ops.s!.summary && <Stat k="Houses represented" v={ops.s!.summary.houses.toLocaleString("en-US")} />}
      </Head>
      <Card
        title={all.hhOf === "all" ? "All homes" : `Homes on ${nice(ops.feeder)} (loading the rest)`}
        right={<input className="vw-input" type="search" placeholder="Filter by name, transformer, mode" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter homes" />}
      >
        <Table rows={rows} cols={cols} rowKey={(h) => h.id} onRow={(h) => setPick(h.id)} empty={q ? "No home matches that filter." : "No homes yet."} />
      </Card>
      <HouseDetail h={picked} ops={ops} onClose={close} />
    </div>
  );
}

// ------------------------------------------------------------------ Weather
function WeatherView({ ops }: { ops: Ops }) {
  const wx = ops.weather;
  const d = wx.data;
  if (!wx.available || !d) {
    return (
      <div className="vw">
        <Head title="Weather" desc="Live Vienna weather that drives the city in the Live weather scenario." />
        <Card><div className="vw-empty"><b>{wx.checking ? "Checking the weather service" : "Weather offline"}</b>The city keeps running on its scenario. The forecast appears here when the weather service answers.</div></Card>
      </div>
    );
  }
  const hours = (d.hourly ?? []).slice(0, 24);
  const warns = d.warnings ?? [];
  const cols: Col<WeatherHour>[] = [
    { key: "h", label: "Hour", cell: (w) => (w.hour != null ? `${String(w.hour).padStart(2, "0")}:00` : w.time?.slice(11, 16) ?? "–") },
    { key: "t", label: "Temperature, °C", right: true, phone: "aside", cell: (w) => w.temp_c.toFixed(1) },
    { key: "f", label: "Feels like, °C", right: true, cell: (w) => <span className="mut">{w.feels_c != null ? w.feels_c.toFixed(1) : "–"}</span> },
    { key: "c", label: "Cloud cover, %", right: true, cell: (w) => (w.cloud_pct != null ? `${Math.round(w.cloud_pct)} %` : "–") },
    { key: "s", label: "Sunshine, W/m²", right: true, cell: (w) => (w.sun_wm2 != null ? Math.round(w.sun_wm2) : "–") },
    { key: "w", label: "Wind, km/h", right: true, cell: (w) => (w.wind_kmh != null ? Math.round(w.wind_kmh) : "–") },
    { key: "g", label: "Gusts, km/h", right: true, cell: (w) => <span className="mut">{w.gust_kmh != null ? Math.round(w.gust_kmh) : "–"}</span> },
    { key: "p", label: "Rain, mm", right: true, cell: (w) => (w.precip_mm != null ? w.precip_mm.toFixed(1) : "–") },
  ];
  return (
    <div className="vw">
      <Head title="Weather" desc={d.summary ? String(d.summary) : `Live weather for ${d.location?.name ?? "Vienna"}.`}>
        {d.now && <Stat k="Now" v={`${d.now.temp_c.toFixed(1)} °C`} />}
        <Stat k="Place" v={String(d.location?.name ?? "Vienna")} />
        <Stat k="Updated" v={wall(d.fetched_at, false)} tone={d.stale ? "var(--sh-orange)" : "var(--sh-green)"} />
        {wx.sample && <Stat k="Source" v="sample" tone="var(--sh-orange)" />}
      </Head>
      <Card title="Warnings" right={<span className="t-caption">{warns.length ? `${warns.length} active` : "none"}</span>}>
        {warns.length ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {warns.map((w, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 14px", boxShadow: i ? "inset 0 1px 0 var(--sh-line)" : undefined, fontSize: "0.8125rem", flexWrap: "wrap" }}>
                <span className={`tag ${w.level === "red" ? "r" : w.level === "orange" ? "o" : "o"}`}>{w.level}</span>
                <span style={{ fontWeight: 500 }}>{w.title}</span>
                {(w.from || w.to) && <span className="t-caption">{wall(w.from, false)} – {wall(w.to, false)}</span>}
              </div>
            ))}
          </div>
        ) : (
          <div className="vw-empty" style={{ padding: "14px" }}>No weather warnings for {d.location?.name ?? "Vienna"}.</div>
        )}
      </Card>
      <Card title="Next 24 hours">
        <Table rows={hours} cols={cols} rowKey={(w) => `${w.time ?? w.hour}`} />
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ Log
const KIND_TONE: Record<string, string> = { signal: "b", guard: "r", ack: "g", autopilot: "b", advisor: "b", demo: "o" };

function Log({ ops }: { ops: Ops }) {
  const log = ops.s!.log ?? [];
  const kinds = useMemo(() => Array.from(new Set(log.map((e) => e.kind))).sort(), [log]);
  const [k, setK] = useState("all");
  const rows = (k === "all" ? log : log.filter((e) => e.kind === k)).map((e, i) => ({ ...e, i }));
  const cols: Col<LogEntry & { i: number }>[] = [
    { key: "ts", label: "Time", className: "nw", cell: (e) => <span className="mut">{wall(e.ts)}</span> },
    { key: "kind", label: "Kind", className: "nw", phone: "aside", phoneLabel: "", cell: (e) => <span className={`tag ${e.status === "refused" ? "r" : KIND_TONE[e.kind] ?? ""}`}>{e.kind}</span> },
    { key: "msg", label: "What happened", className: "wrap", phone: "line", phoneLabel: "", cell: (e) => <span>{e.msg}</span> },
  ];
  return (
    <div className="vw">
      <Head title="Log" desc="Everything the platform did, newest first: signals signed, houses answering, autopilot steps and demo switches.">
        <Stat k="Newest log lines shown" v={log.length} />
      </Head>
      <Card
        title="Platform log"
        right={
          <div className="seg" role="radiogroup" aria-label="Show kind">
            {["all", ...kinds].map((x) => (
              <button key={x} type="button" role="radio" aria-checked={k === x} className="seg-btn" onClick={() => setK(x)} style={k === x ? { background: "var(--sh-thumb)", boxShadow: "0 1px 3px rgb(0 0 0 / 0.12)" } : undefined}>
                {x === "all" ? "All" : x}
              </button>
            ))}
          </div>
        }
      >
        <Table rows={rows} cols={cols} rowKey={(e) => `${e.ts}-${e.i}`} empty="Nothing of that kind in the last entries." />
      </Card>
    </div>
  );
}
