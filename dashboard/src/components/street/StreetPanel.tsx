// "Your street, live": the selected feeder as a 3D town with its overlays (title, how many homes follow Gridzilla,
// a plain-words legend, hover tooltips). Falls back to a flat drawing when the machine has no WebGL.
import { motion, useReducedMotion } from "motion/react";
import { lazy, Suspense, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { State } from "../../api";
import { COLORS, loadColor, nice, type House } from "../../model";
import { Empty } from "../ui";
import { buildStreets, FLOW_EPS, type StreetModel } from "./layout";
import type { HoverInfo } from "./Street3D";

const Street3D = lazy(() => import("./Street3D"));

function hasWebGL() {
  try {
    if (new URLSearchParams(location.search).has("nogl")) return false; // review the flat fallback
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

const kw = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(1));

function houseLines(h: House) {
  if (!h.online) return ["Offline: no reading from this house right now"];
  const out: string[] = [];
  const g = h.grid_kw;
  out.push(Math.abs(g) < FLOW_EPS ? "Balanced: not using the street at all" : g > 0 ? `Taking ${kw(g)} kW from the street` : `Giving ${kw(-g)} kW back to the street`);
  if (h.kwh > 0 && h.soc != null) out.push(`Battery ${Math.round(h.soc)} % full (${((h.kwh * h.soc) / 100).toFixed(1)} of ${h.kwh} kWh)`);
  if (h.pv_kw > 0.05) out.push(`Solar making ${kw(h.pv_kw)} kW`);
  if (h.ev_kw > 0.05) out.push(`Car charging at ${kw(h.ev_kw)} kW`);
  if (h.hp_kw > 0.05) out.push(`Heating running at ${kw(h.hp_kw)} kW`);
  if (h.ackStatus === "refused") out.push(`Said no to the last signal${h.ackReason ? `: ${h.ackReason.replace(/_/g, " ")}` : ""}`);
  if (h.ackStatus === "partial") out.push(`Followed it partly${h.ackReason ? ` (${h.ackReason.replace(/_/g, " ")})` : ""}`);
  return out;
}

function tfStatus(st: StreetModel) {
  if (st.load_kw == null || st.pct == null) return "No reading yet";
  const p = Math.abs(st.pct);
  const back = st.load_kw < 0;
  const flow = back ? `Pushing ${kw(-st.load_kw)} kW back up the line` : `Carrying ${kw(st.load_kw)} kW to the houses`;
  const lim = back ? st.reverse : st.rating;
  return `${flow}: ${p} % of its ${lim} kW limit${p >= 100 ? ", overloaded" : p >= 85 ? ", close to it" : ""}`;
}

function Tooltip({ hover, s, feeder, box }: { hover: HoverInfo; s: State; feeder: string; box: { w: number; h: number } }) {
  const ref = useRef<HTMLDivElement>(null);
  let title = "",
    sub = "",
    tech = "",
    lines: string[] = [],
    tag: { text: string; color: string } | null = null;
  if (hover.kind === "house" && hover.house) {
    const h = hover.house;
    title = h.real ? `${h.name}, a real home` : h.name;
    sub = `In the program, stands for ${h.represents} homes`;
    lines = houseLines(h);
    if (h.underSignal) tag = { text: `Following Gridzilla (${h.mode.toLowerCase()})`, color: COLORS.signal };
    else if (h.online) tag = { text: "Owner in charge of the battery", color: COLORS.muted };
  } else if (hover.kind === "normal" && hover.street) {
    title = "Neighbour, not in the program";
    sub = `One of ${hover.street.others} homes on ${nice(hover.street.tf)}`;
    lines = ["Gridzilla cannot steer this house. Its load still counts on the transformer."];
  } else if (hover.kind === "tf" && hover.street) {
    const st = hover.street;
    title = `${nice(st.tf)} street transformer`;
    sub = `${st.houses.length} program homes, ${st.others} others`;
    tech = `${st.tf}, rated ${st.rating} kW`;
    lines = [tfStatus(st), "Click to show its curve"];
  } else if (hover.kind === "substation") {
    const a = s.aggregates[feeder];
    title = "Substation";
    sub = `Feeds the ${nice(feeder)} line`;
    tech = `${s.tree[feeder]?.parent ?? ""} to ${feeder}`;
    lines = [a?.total_kw == null ? "No reading yet" : a.total_kw >= 0 ? `Sending ${kw(a.total_kw)} kW down the line` : `Taking ${kw(-a.total_kw)} kW back from the line`];
  }
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth,
      h = el.offsetHeight;
    const left = hover.x + 18 + w > box.w - 8 ? hover.x - w - 18 : hover.x + 18;
    const top = Math.min(Math.max(8, hover.y - 24), box.h - h - 8);
    el.style.transform = `translate(${Math.max(8, left)}px, ${Math.max(8, top)}px)`;
  });
  return (
    <div
      ref={ref}
      className="pointer-events-none absolute left-0 top-0 z-30 w-[18rem] max-w-[calc(100%-16px)] rounded-2xl bg-[#0b131f]/95 p-4 shadow-[0_24px_60px_-12px_rgb(0_0_0/0.95),inset_0_1px_0_rgb(255_255_255/0.08),inset_0_0_0_1px_rgb(255_255_255/0.07)] backdrop-blur-md"
    >
      <div className="text-[1rem] font-semibold leading-snug tracking-[-0.01em]">{title}</div>
      <div className="mt-0.5 text-[0.78rem] text-dim">{sub}</div>
      {tag && (
        <div className="mt-2.5 inline-flex rounded-full px-2.5 py-1 text-[0.74rem] font-semibold" style={{ color: tag.color, background: `${tag.color}1f` }}>
          {tag.text}
        </div>
      )}
      <ul className="mt-2.5 space-y-1.5 text-[0.86rem] leading-snug text-fg/90">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      {tech && <div className="tech mt-2.5">{tech}</div>}
    </div>
  );
}

/** Flat drawing of the same street for machines without WebGL. */
function Street2D({ streets, selected, onSelect, compact }: { streets: StreetModel[]; selected: string; onSelect: (tf: string) => void; compact: boolean }) {
  return (
    <div className={`scroll-thin grid h-full content-start gap-3 overflow-auto px-4 pb-20 ${compact ? "grid-cols-1 pt-24" : "grid-cols-3 pt-28"}`}>
      {streets.map((st) => {
        const c = loadColor(st.pct);
        const on = selected === st.tf;
        return (
          <button
            key={st.tf}
            onClick={() => onSelect(st.tf)}
            className="rounded-2xl bg-deck-2 p-4 text-left shadow-[inset_0_1px_0_rgb(255_255_255/0.06),0_14px_30px_-16px_rgb(0_0_0/0.9)] transition hover:bg-deck-3 active:scale-[0.99]"
            style={{ boxShadow: on ? `inset 0 0 0 2px #eef3f9aa, 0 0 30px -10px ${c}` : `inset 0 0 0 1px ${c}44` }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[0.95rem] font-semibold">{nice(st.tf)}</span>
              <span className="num text-[1.5rem] font-semibold leading-none" style={{ color: c }}>
                {st.pct == null ? "-" : `${Math.abs(st.pct)} %`}
              </span>
            </div>
            <div className="mt-1 text-[0.74rem] text-dim">{tfStatus(st)}</div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {st.houses.map(({ house: h }) => (
                <span
                  key={h.key}
                  title={houseLines(h).join("\n")}
                  className="num rounded-lg px-2 py-1 text-[0.76rem] font-medium"
                  style={{
                    background: h.underSignal ? `${COLORS.signal}2a` : "#1a2433",
                    boxShadow: h.underSignal ? `inset 0 0 0 1px ${COLORS.signal}66` : undefined,
                    color: !h.online ? COLORS.muted : h.grid_kw > FLOW_EPS ? COLORS.take : h.grid_kw < -FLOW_EPS ? COLORS.give : "#eef3f9",
                  }}
                >
                  {h.online ? `${h.grid_kw > 0 ? "+" : ""}${h.grid_kw.toFixed(1)} kW` : "offline"}
                </span>
              ))}
            </div>
            <div className="tech mt-2.5">+ {st.others} homes not in the program</div>
          </button>
        );
      })}
    </div>
  );
}

function Swatch({ color, ring }: { color: string; ring?: boolean }) {
  return (
    <span
      aria-hidden
      className="inline-block h-[0.6rem] w-[0.6rem] shrink-0 rounded-full"
      style={ring ? { boxShadow: `inset 0 0 0 2px ${color}, 0 0 10px ${color}aa` } : { background: color, boxShadow: `0 0 10px 1px ${color}cc` }}
    />
  );
}

function Legend({ compact }: { compact: boolean }) {
  const items = [
    { color: COLORS.take, text: compact ? "Taking power" : "Taking power from the street" },
    { color: COLORS.give, text: compact ? "Giving back" : "Giving power back" },
    { color: COLORS.signal, text: "Following Gridzilla", ring: true },
  ];
  return (
    <div
      className={`pointer-events-none absolute bottom-3 left-3 z-20 flex flex-wrap items-center rounded-2xl bg-[#070c14]/75 shadow-[inset_0_1px_0_rgb(255_255_255/0.06),inset_0_0_0_1px_rgb(255_255_255/0.05)] backdrop-blur-md ${
        compact ? "max-w-[calc(100%-24px)] gap-x-3 gap-y-1 px-3 py-2 text-[0.72rem]" : "gap-x-5 gap-y-1 px-4 py-2.5 text-[0.8rem]"
      }`}
    >
      {items.map((i) => (
        <span key={i.text} className="flex items-center gap-2 whitespace-nowrap font-medium text-fg/90">
          <Swatch color={i.color} ring={i.ring} />
          {i.text}
        </span>
      ))}
    </div>
  );
}

export default function StreetPanel({ s, feeder, selected, onSelect, compact }: { s: State; feeder: string; selected: string; onSelect: (tf: string) => void; compact: boolean }) {
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const gl = useMemo(hasWebGL, []);
  const reduce = !!useReducedMotion();
  const streets = useMemo(() => buildStreets(s, feeder, compact ? 2 : 4), [s, feeder, compact]);
  const wrap = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const homes = streets.flatMap((st) => st.houses.map((h) => h.house));
  const following = homes.filter((h) => h.underSignal).length;
  const online = homes.filter((h) => h.online).length;
  // keep a hovered house's tooltip live as new readings arrive
  const liveHover = hover?.house ? { ...hover, house: homes.find((h) => h.key === hover.house!.key) ?? hover.house } : hover?.street ? { ...hover, street: streets.find((st) => st.tf === hover.street!.tf) ?? hover.street } : hover;

  return (
    <div ref={wrap} className="relative flex h-full min-h-0 w-full flex-1 overflow-hidden rounded-[inherit] bg-[#070b12]">
      {streets.length === 0 ? (
        <Empty>No street transformers on this feeder yet.</Empty>
      ) : gl ? (
        <Suspense fallback={<div className="absolute inset-0 animate-pulse bg-deck-2/40" />}>
          <motion.div className="absolute inset-0" initial={reduce ? false : { opacity: 0, scale: 1.02 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}>
            <Street3D streets={streets} selected={selected} onSelect={onSelect} onHover={setHover} compact={compact} still={reduce} />
          </motion.div>
        </Suspense>
      ) : (
        <Street2D streets={streets} selected={selected} onSelect={onSelect} compact={compact} />
      )}

      {/* soft vignette so the overlays sit on calm ground */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[15] bg-[radial-gradient(120%_90%_at_50%_45%,transparent_55%,rgb(5_8_13/0.75))]" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-[15] h-28 bg-gradient-to-b from-[#070b12]/90 to-transparent" />

      <div className={`pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 ${compact ? "p-3.5" : "p-5"}`}>
        <div className="min-w-0">
          <h2 className={`font-semibold leading-tight tracking-[-0.02em] text-fg ${compact ? "text-[1.15rem]" : "text-[1.45rem]"}`}>Your street, live</h2>
          <div className={`mt-0.5 font-medium text-dim ${compact ? "text-[0.78rem]" : "text-[0.9rem]"}`}>
            {nice(feeder)} line, {streets.length} street transformer{streets.length === 1 ? "" : "s"}
          </div>
        </div>
        {homes.length > 0 && (
          <div className={`shrink-0 rounded-2xl bg-[#06131a]/80 text-right shadow-[inset_0_0_0_1px_rgb(51_225_201/0.28)] backdrop-blur-md ${compact ? "px-3 py-1.5" : "px-4 py-2"}`}>
            <div className={`num font-semibold leading-none text-signal ${compact ? "text-[1.1rem]" : "text-[1.45rem]"}`}>
              {following}
              <span className="text-[0.6em] font-medium text-dim"> of {homes.length}</span>
            </div>
            <div className={`mt-1 font-medium text-fg/80 ${compact ? "text-[0.66rem]" : "text-[0.74rem]"}`}>
              {following ? "homes following Gridzilla" : online ? "homes, owners in charge" : "homes, none online yet"}
            </div>
          </div>
        )}
      </div>

      {streets.length > 0 && <Legend compact={compact} />}
      {gl && !compact && streets.length > 0 && (
        <div className="pointer-events-none absolute bottom-4 right-5 z-20 text-[0.74rem] font-medium text-faint">Drag to look around. Click a transformer for its curve.</div>
      )}
      {liveHover && <Tooltip hover={liveHover} s={s} feeder={feeder} box={box} />}
    </div>
  );
}
