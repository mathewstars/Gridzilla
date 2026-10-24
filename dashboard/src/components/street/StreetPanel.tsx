// "Your street, live": the selected feeder as a white clay model, with the feeder's transformers listed beside it
// (load, plain status, click to show the curve) and plain-English hover tooltips. Falls back to a flat drawing when
// the machine has no WebGL. Phones get a lighter scene with the list under it.
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { State } from "../../api";
import { MODE_WORDS, nice, type House } from "../../model";
import { Empty } from "../ui";
import { buildStreets, FLOW_EPS, type StreetModel } from "./layout";
import type { HoverInfo } from "./Street3D";

const Street3D = lazy(() => import("./Street3D"));

export function hasWebGL() {
  try {
    if (new URLSearchParams(location.search).has("nogl")) return false; // review the flat fallback
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** True when the viewer asked the system for less motion: the power dots then stand still. */
export function useReducedMotion() {
  const q = "(prefers-reduced-motion: reduce)";
  const [on, setOn] = useState(() => typeof matchMedia !== "undefined" && matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const f = () => setOn(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return on;
}

const kw = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(1));
const isOver = (st: StreetModel) => Math.abs(st.pct ?? 0) >= 100;

/** Why an owner's box said no or followed only partly, in the owner's words (never the raw reply codes). */
const REASON_WORDS: Record<string, string> = {
  min_soc: "kept its battery reserve",
  owner_limit: "kept the owner's own limit",
  opt_out: "the owner opted out",
  stale_seq: "already had it",
};
const reasonWords = (r: string) => REASON_WORDS[r] ?? r.replace(/_/g, " ");

function houseLines(h: House) {
  if (!h.online) return ["Offline: no reading from this house right now"];
  const out: string[] = [];
  const g = h.grid_kw;
  out.push(Math.abs(g) < FLOW_EPS ? "Balanced: not using the street at all" : g > 0 ? `Taking ${kw(g)} kW from the street` : `Giving ${kw(-g)} kW back to the street`);
  if (h.kwh > 0 && h.soc != null) out.push(`Battery ${Math.round(h.soc)} % full (${((h.kwh * h.soc) / 100).toFixed(1)} of ${h.kwh} kWh)`);
  if (h.pv_kw > 0.05) out.push(`Solar making ${kw(h.pv_kw)} kW`);
  if (h.ev_kw > 0.05) out.push(`Car charging at ${kw(h.ev_kw)} kW`);
  if (h.hp_kw > 0.05) out.push(`Heating running at ${kw(h.hp_kw)} kW`);
  if (h.ackStatus === "refused") out.push(`Said no to the last signal${h.ackReason ? `: ${reasonWords(h.ackReason)}` : ""}`);
  if (h.ackStatus === "partial") out.push(`Followed it partly${h.ackReason ? ` (${reasonWords(h.ackReason)})` : ""}`);
  return out;
}

/** Short plain status for the list. Reverse flow over the limit counts as over too. */
function tfShort(st: StreetModel, compact = false) {
  if (st.load_kw == null || st.pct == null) return "No reading yet";
  const p = Math.abs(st.pct);
  if (p >= 100) return compact ? "Over the limit" : st.load_kw < 0 ? "Over the limit: solar flowing back" : "Over the limit: too much demand";
  if (p >= 85) return "Close to the limit";
  return "Within the limit";
}

function tfStatus(st: StreetModel) {
  if (st.load_kw == null || st.pct == null) return "No reading yet";
  const p = Math.abs(st.pct);
  const back = st.load_kw < 0;
  const flow = back ? `Pushing ${kw(-st.load_kw)} kW back up the line` : `Carrying ${kw(st.load_kw)} kW to the houses`;
  const lim = back ? st.reverse : st.rating;
  return `${flow}: ${p} % of its ${lim} kW limit${p >= 100 ? ", over the limit" : p >= 85 ? ", close to it" : ""}`;
}

export function Tooltip({ hover, s, feeder, box, hint = "Click to show its curve" }: { hover: HoverInfo; s: State; feeder: string; box: { w: number; h: number }; hint?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  let title = "",
    sub = "",
    tech = "",
    state = "",
    alert = false,
    lines: string[] = [];
  if (hover.kind === "house" && hover.house) {
    const h = hover.house;
    title = h.real ? `${h.name}, a real home` : h.name;
    sub = `In the program, stands for ${h.represents} homes`;
    lines = houseLines(h);
    if (h.underSignal) state = `Following Gridzilla: ${(MODE_WORDS[h.mode]?.title ?? h.mode).toLowerCase()}`;
    else if (h.online) state = "Owner in charge of the battery";
  } else if (hover.kind === "normal" && hover.street) {
    title = "Neighbour, not in the program";
    sub = `One of ${hover.street.others} homes on ${nice(hover.street.tf)}`;
    lines = ["Gridzilla cannot steer this house. Its load still counts on the transformer."];
  } else if (hover.kind === "tf" && hover.street) {
    const st = hover.street;
    title = `${nice(st.tf)} street transformer`;
    sub = `${st.houses.length} program homes, ${st.others} others`;
    tech = `Rated ${st.rating} kW${st.reverse != null && st.reverse !== st.rating ? `, ${st.reverse} kW going back` : ""}`;
    state = tfShort(st);
    alert = isOver(st);
    lines = hint ? [tfStatus(st), hint] : [tfStatus(st)];
  } else if (hover.kind === "substation") {
    const a = s.aggregates[feeder];
    title = "Substation";
    sub = `Feeds the ${nice(feeder)} line`;
    tech = s.tree[feeder]?.parent ? `${nice(s.tree[feeder].parent)} to the ${nice(feeder)} line` : "";
    lines = [a?.total_kw == null ? "No reading yet" : a.total_kw >= 0 ? `Sending ${kw(a.total_kw)} kW down the line` : `Taking ${kw(-a.total_kw)} kW back from the line`];
  }
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth,
      h = el.offsetHeight;
    // beside the pointer when there is room, otherwise above or below it, so it never sits on what it describes
    let left = hover.x + 18,
      top = Math.min(Math.max(8, hover.y - 24), box.h - h - 8);
    if (left + w > box.w - 8) left = hover.x - w - 18;
    if (left < 8) {
      left = Math.min(Math.max(8, hover.x - w / 2), box.w - w - 8);
      top = hover.y - h - 18 >= 8 ? hover.y - h - 18 : hover.y + 18;
    }
    el.style.transform = `translate(${Math.max(8, left)}px, ${Math.max(8, top)}px)`;
  });
  return (
    <div
      ref={ref}
      className="pointer-events-none absolute left-0 top-0 z-30 w-[17rem] max-w-[calc(100%-16px)] rounded-[14px] bg-white p-4 text-ink shadow-[0_8px_32px_rgb(0_0_0/0.12),0_1px_3px_rgb(0_0_0/0.08)]"
    >
      <div className="text-[1.0625rem] font-semibold leading-snug tracking-[-0.022em]">{title}</div>
      <div className="t-small mt-0.5">{sub}</div>
      {state && <div className={`mt-2 text-[0.875rem] font-semibold tracking-[-0.016em] ${alert ? "text-red" : "text-ink"}`}>{state}</div>}
      <ul className="mt-1.5 space-y-1 text-[0.875rem] leading-snug tracking-[-0.016em] text-ink">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      {tech && <div className="t-caption mt-2">{tech}</div>}
    </div>
  );
}

/** The feeder's transformers, left to right as they stand in the street. Clicking one shows its curve. */
function TfList({ streets, selected, onSelect, compact }: { streets: StreetModel[]; selected: string; onSelect: (tf: string) => void; compact: boolean }) {
  const others = streets.reduce((a, st) => a + st.others, 0);
  return (
    <div className={compact ? "shrink-0" : "flex w-[14.5rem] shrink-0 flex-col"}>
      <div className={compact ? "grid grid-cols-3 gap-1.5" : "flex flex-col gap-1.5"}>
        {streets.map((st) => {
          const on = st.tf === selected;
          const over = isOver(st);
          return (
            <button
              key={st.tf}
              type="button"
              onClick={() => onSelect(st.tf)}
              aria-pressed={on}
              aria-label={`${nice(st.tf)} transformer, ${st.pct == null ? "no reading" : `${Math.abs(st.pct)} percent of its limit`}, ${tfShort(st)}. Show its curve.`}
              className={`grid rounded-[14px] text-left transition-[background-color,transform] duration-[250ms] ease-[cubic-bezier(0,0,0.5,1)] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_#fff,0_0_0_5px_#1d1d1f] active:scale-[0.98] ${
                compact ? "px-2.5 py-2" : "grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 px-3.5 py-1.5"
              } ${on ? "bg-ink text-white" : "bg-ground text-ink hover:bg-fill active:bg-fill-press"}`}
            >
              <span className={`block min-w-0 font-semibold ${compact ? "text-[0.8125rem] leading-tight tracking-[-0.01em]" : "text-[1.0625rem] leading-tight tracking-[-0.022em]"}`}>
                {nice(st.tf)}
              </span>
              <span
                className={`block font-semibold leading-none tracking-[-0.015em] ${compact ? "mt-1 text-[1.5rem]" : "text-[1.75rem]"} ${over ? "text-red" : ""}`}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {st.pct == null ? "-" : `${Math.abs(st.pct)} %`}
              </span>
              <Status st={st} on={on} compact={compact} />
            </button>
          );
        })}
      </div>
      {!compact && (
        <div className="t-caption mt-auto px-1 pt-2">
          {others > 0 && <p>Plus {others.toLocaleString("en-US")} homes not in the program.</p>}
        </div>
      )}
    </div>
  );
}

function Status({ st, on, compact }: { st: StreetModel; on: boolean; compact: boolean }) {
  const over = isOver(st);
  return (
    <span
      className={`mt-0.5 block leading-snug ${compact ? "text-[0.75rem] tracking-[-0.01em]" : "col-span-2 text-[0.875rem] tracking-[-0.016em]"} ${
        over ? "font-semibold text-red" : on ? "text-white/70" : "text-secondary"
      }`}
    >
      {tfShort(st, compact)}
    </span>
  );
}

/** Flat drawing of the same street for machines without WebGL: one column per transformer, its homes under it. */
export function Street2D({ streets }: { streets: StreetModel[] }) {
  return (
    <div className="grid h-full grid-cols-3 content-start gap-2">
      {streets.map((st) => (
        <div key={st.tf} className="flex min-w-0 flex-col gap-1">
          <div className={`rounded-[10px] px-2.5 py-1.5 text-[0.875rem] font-semibold leading-tight ${isOver(st) ? "bg-red text-white" : "bg-fill text-ink"}`}>{nice(st.tf)}</div>
          {st.houses.map(({ house: h }) => {
            const g = h.grid_kw;
            return (
              <div
                key={h.key}
                title={houseLines(h).join("\n")}
                className={`flex flex-wrap items-baseline justify-between gap-x-2 rounded-[10px] px-2.5 py-1 text-[0.75rem] leading-tight ${
                  h.underSignal ? "bg-ink text-white" : "bg-white text-ink shadow-[0_1px_4px_rgb(0_0_0/0.1)]"
                }`}
              >
                <span className="font-semibold">{h.name}</span>
                <span className={h.underSignal ? "text-white/70" : "text-secondary"} style={{ fontVariantNumeric: "tabular-nums" }}>
                  {!h.online ? "Offline" : Math.abs(g) < FLOW_EPS ? "Balanced" : g > 0 ? `Taking ${kw(g)} kW` : `Giving ${kw(-g)} kW`}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function StreetPanel({ s, feeder, selected, onSelect, compact }: { s: State; feeder: string; selected: string; onSelect: (tf: string) => void; compact: boolean }) {
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const gl = useMemo(hasWebGL, []);
  const still = useReducedMotion();
  const streets = useMemo(() => buildStreets(s, feeder, compact ? 0 : 6), [s, feeder, compact]);
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
  const n = streets.length;
  const subtitle = `${nice(feeder)} line: ${n} street transformer${n === 1 ? "" : "s"}, ${
    following ? `${following} of ${homes.length} homes following Gridzilla` : online ? `${homes.length} homes in the program, owners in charge` : `${homes.length} homes in the program, none online yet`
  }`;
  // keep a hovered house's tooltip live as new readings arrive
  const liveHover = hover?.house ? { ...hover, house: homes.find((h) => h.key === hover.house!.key) ?? hover.house } : hover?.street ? { ...hover, street: streets.find((st) => st.tf === hover.street!.tf) ?? hover.street } : hover;

  return (
    <div className={`flex h-full min-h-0 w-full flex-col ${compact ? "gap-2 p-4" : "gap-3 p-5"}`}>
      {/* title and plain subtitle on one line, so the model gets the height */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h2 className="t-title text-ink">Your street, live</h2>
        <span className="t-small">{subtitle}</span>
      </div>
      {streets.length === 0 ? (
        <Empty>No street transformers on this line yet.</Empty>
      ) : (
        <div className={`flex min-h-0 flex-1 ${compact ? "flex-col gap-2" : "gap-5"}`}>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div ref={wrap} className="relative min-h-0 flex-1">
              {gl ? (
                <Suspense fallback={null}>
                  <div className="absolute inset-0">
                    <Street3D streets={streets} selected={selected} onSelect={onSelect} onHover={setHover} compact={compact} still={still} />
                  </div>
                </Suspense>
              ) : (
                <Street2D streets={streets} />
              )}
              {liveHover && <Tooltip hover={liveHover} s={s} feeder={feeder} box={box} />}
            </div>
            <p className="t-caption mt-1">
              {gl
                ? `Dots run into a home taking power, out of one giving it back. Dark base: following Gridzilla.${compact ? "" : " Dark bar: battery."}`
                : "Dark: following Gridzilla right now. Red: over the limit."}
            </p>
          </div>
          <TfList streets={streets} selected={selected} onSelect={onSelect} compact={compact} />
        </div>
      )}
    </div>
  );
}
