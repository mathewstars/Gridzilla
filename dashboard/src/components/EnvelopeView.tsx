// "Allowed box for one house": the dynamic operating envelope of one program house drawn over time.
// Teal band = what Gridzilla allows per 15-minute slot (ceiling = import cap, floor = export cap), blue/yellow line =
// what the meter measured. Past slots come from the caps the house reported applying; the active signal fills the
// slots ahead of "now".
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DevPoint, History, Signal, State } from "../api";
import { COLORS, hhmm, housesOf, type House } from "../model";
import { Empty, PanelTitle, Segmented, Ticker } from "./ui";

type Props = { s: State; history: History | null; tf: string; house: string | null; setHouse: (k: string | null) => void };

/** One stretch of time with a fixed box. `imp`/`exp` null = that side is open (no limit from Gridzilla). */
interface Seg {
  a: number;
  b: number;
  imp: number | null;
  exp: number | null;
}

const SAMPLE_H = 5 / 60; // the platform samples device history every 5 grid minutes

// ------------------------------------------------------------------ data helpers
function batteryOf(h: House) {
  return h.devices.find((d) => d.kwh > 0) ?? h.devices[0];
}

/** The signal that governs this house: the deepest node on its path with an active limit signal. */
function signalFor(s: State, path: string[]): { node: string; sig: Signal } | null {
  for (const n of [...path].reverse()) {
    const sig = s.active[n];
    if (sig && sig.mode !== "RELEASE") return { node: n, sig };
  }
  return null;
}

function interesting(h: House) {
  return (h.underSignal ? 1000 : 0) + (h.online ? 100 : 0) + Math.abs(h.grid_kw);
}

/** History hours wrap at 24; turn them into one rising axis that ends at the current grid hour. */
function unwrap(points: DevPoint[], nowH: number) {
  const out: { u: number; p: DevPoint }[] = [];
  let off = 0;
  let prev: number | null = null;
  for (const p of points) {
    if (prev != null && p.h < prev - 12) off += 24;
    prev = p.h;
    out.push({ u: p.h + off, p });
  }
  if (out.length) {
    const shift = Math.round((nowH - out[out.length - 1].u) / 24) * 24;
    out.forEach((o) => (o.u += shift));
  }
  return out;
}

function niceStep(span: number) {
  for (const st of [0.5, 1, 2, 2.5, 5, 10, 20]) if (span / st <= 4) return st;
  return 50;
}

const fmt = (kw: number) => (Math.abs(kw) >= 10 ? Math.abs(kw).toFixed(0) : Math.abs(kw).toFixed(1));

// ------------------------------------------------------------------ sizing
function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect;
      setSize((o) => (Math.abs(o.w - r.width) < 1 && Math.abs(o.h - r.height) < 1 ? o : { w: r.width, h: r.height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

// ------------------------------------------------------------------ view
export default function EnvelopeView({ s, history, tf, house, setHouse }: Props) {
  const all = tf && s.tree[tf] ? housesOf(s, tf) : [];
  const withBattery = all.filter((h) => h.kwh > 0);
  const houses = (withBattery.length ? withBattery : all).sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));

  // Auto pick: the most interesting house, kept stable between polls unless something more relevant appears.
  const auto = useRef<string | null>(null);
  const best = houses.length ? houses.reduce((a, b) => (interesting(b) > interesting(a) ? b : a)) : null;
  const kept = houses.find((h) => h.key === auto.current);
  if (!kept || (best && best.underSignal && !kept.underSignal)) auto.current = best?.key ?? null;
  const chosen = houses.find((h) => h.key === house) ?? houses.find((h) => h.key === auto.current) ?? null;

  if (!tf || !s.tree[tf])
    return <Shell>{() => <Empty>Pick a street transformer to see the allowed box of one of its houses.</Empty>}</Shell>;
  if (!chosen)
    return (
      <Shell>{() => <Empty>No program houses on this street transformer yet. Houses with a battery show up here once they connect.</Empty>}</Shell>
    );

  const pick = (k: string) => setHouse(k);
  return (
    <Shell
      right={(compact) =>
        houses.length < 2 ? null : compact ? (
          <Stepper houses={houses} chosen={chosen} onPick={pick} />
        ) : (
          <div className="scroll-thin -mx-1 max-w-full overflow-x-auto px-1 pb-0.5">
            <Segmented
              id={`env-house-${tf}`}
              size="sm"
              value={chosen.key}
              onChange={pick}
              options={houses.map((h) => ({
                value: h.key,
                title: `${h.name}${h.online ? "" : " (offline)"}${h.underSignal ? ", under a signal" : ""}`,
                label: (
                  <span className={`inline-flex items-center gap-1.5 ${h.online ? "" : "opacity-50"}`}>
                    {h.underSignal && <span className="h-1.5 w-1.5 rounded-full bg-signal shadow-[0_0_8px_var(--color-signal)]" />}
                    {h.name}
                  </span>
                ),
              }))}
            />
          </div>
        )
      }
    >
      {(compact) => <HouseBox s={s} history={history} h={chosen} compact={compact} />}
    </Shell>
  );
}

/** Previous / next house: the picker when the panel is too short for a row of chips (phone layout). */
function Stepper({ houses, chosen, onPick }: { houses: House[]; chosen: House; onPick: (k: string) => void }) {
  const i = Math.max(0, houses.findIndex((h) => h.key === chosen.key));
  const go = (d: number) => onPick(houses[(i + d + houses.length) % houses.length]!.key);
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" className="btn !px-2 !py-1.5" aria-label="Previous house" onClick={() => go(-1)}>
        <CaretLeft size={14} weight="bold" />
      </button>
      <span className="num min-w-[4.5rem] text-center text-[0.82rem] font-medium whitespace-nowrap text-fg">{chosen.name}</span>
      <button type="button" className="btn !px-2 !py-1.5" aria-label="Next house" onClick={() => go(1)}>
        <CaretRight size={14} weight="bold" />
      </button>
    </div>
  );
}

/** Panel frame. Measures itself: under ~340 px tall (the stacked phone layout) the view drops to a compact form. */
function Shell({ children, right }: { children: (compact: boolean) => React.ReactNode; right?: (compact: boolean) => React.ReactNode }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const compact = size.h > 0 && size.h < 340;
  return (
    <div ref={ref} className={`panel @container flex h-full min-h-0 flex-col overflow-hidden ${compact ? "gap-2 p-3.5" : "gap-3 p-4 sm:p-5"}`}>
      <div className={`flex items-start justify-between gap-x-4 gap-y-2 ${compact ? "" : "flex-wrap"}`}>
        <PanelTitle title="Allowed box for one house" tech={compact ? undefined : "dynamic operating envelope, 15-minute slots"} />
        {right?.(compact)}
      </div>
      {children(compact)}
    </div>
  );
}

function HouseBox({ s, history, h, compact }: { s: State; history: History | null; h: House; compact: boolean }) {
  const nowH = s.sim_hour;
  const simX = s.autopilot?.sim_x || 60;
  const batt = batteryOf(h);
  const tel = batt.telemetry;
  const active = signalFor(s, batt.path);
  const pts = useMemo(() => unwrap(history?.devices?.[batt.id] ?? [], nowH), [history, batt.id, nowH]);

  const simAt = (iso: string) => nowH + ((Date.parse(iso) - Date.parse(s.now)) / 3.6e6) * simX;

  // Active signal window and its slots.
  let win: { a: number; b: number; segs: Seg[]; sig: Signal } | null = null;
  if (active) {
    const sig = active.sig;
    const a = simAt(sig.valid_from);
    const b = simAt(sig.valid_to);
    const env = sig.envelope;
    const curve = env && (env.import_max_kw ?? env.export_max_kw);
    const segs: Seg[] = [];
    if (env && curve && curve.length) {
      const slotH = (env.slot_sim_min || 15) / 60;
      curve.forEach((_, k) => {
        const sa = a + k * slotH;
        const sb = k === curve.length - 1 ? Math.max(b, sa + slotH) : sa + slotH;
        if (sa >= b) return;
        segs.push({
          a: sa,
          b: Math.min(sb, b),
          imp: env.import_max_kw ? env.import_max_kw[k] : sig.import_max_kw,
          exp: env.export_max_kw ? env.export_max_kw[k] : sig.export_max_kw,
        });
      });
    } else if (sig.import_max_kw != null || sig.export_max_kw != null) {
      segs.push({ a, b, imp: sig.import_max_kw, exp: sig.export_max_kw });
    }
    if (segs.length) win = { a, b, segs, sig };
  }

  // Past boxes: the caps the house itself reported applying.
  const past: Seg[] = [];
  pts.forEach(({ u, p }, i) => {
    if (p.imp_cap == null && p.exp_cap == null) return;
    const next = pts[i + 1]?.u ?? nowH;
    let b = next - u > SAMPLE_H * 2.5 ? u + SAMPLE_H : next;
    let a = u;
    if (win) {
      if (a >= win.a) return;
      b = Math.min(b, win.a);
    }
    if (b > a) past.push({ a, b, imp: p.imp_cap, exp: p.exp_cap });
  });

  // Time window: a few hours back, the active box ahead.
  const [ref, size] = useSize<HTMLDivElement>();
  const narrow = size.w > 0 && size.w < 520;
  const back = narrow ? 2.5 : 4;
  const first = pts[0]?.u;
  const x0 = Math.min(nowH - 1, Math.max(nowH - back, first ?? nowH - 1));
  const x1 = Math.max(nowH + (narrow ? 1 : 1.5), win ? Math.min(win.b, nowH + (narrow ? 2.5 : 4)) : 0);

  const segs = [...past, ...(win?.segs ?? [])]
    .map((g) => ({ ...g, a: Math.max(g.a, x0), b: Math.min(g.b, x1) }))
    .filter((g) => g.b > g.a);
  const line = pts.filter(({ u }) => u >= x0 - SAMPLE_H && u <= nowH + 0.01);
  const last = pts.length ? pts[pts.length - 1] : null;

  // Live numbers.
  const grid = tel ? tel.grid_kw : h.online ? h.grid_kw : null;
  const nowSeg = segs.find((g) => g.a <= nowH && g.b > nowH) ?? null;
  const capImp = nowSeg ? nowSeg.imp : tel?.imp_cap_kw ?? null;
  const capExp = nowSeg ? nowSeg.exp : tel?.exp_cap_kw ?? null;

  const story = explain({ h, grid, win, nowH, capImp, capExp, llm: s.llm });

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${compact ? "gap-2" : "gap-3"}`}>
      <div className="grid gap-x-6 gap-y-2 @[46rem]:grid-cols-[minmax(0,1fr)_auto] @[46rem]:items-end">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={story.key}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className={`max-w-[60ch] leading-snug font-medium tracking-[-0.01em] text-fg ${compact ? "line-clamp-3 text-[0.92rem]" : "text-[1.08rem]"}`}
          >
            {story.text}
          </motion.p>
        </AnimatePresence>
        {!compact && <Stats h={h} grid={grid} capImp={capImp} capExp={capExp} underBox={!!win} />}
      </div>
      <div ref={ref} className={`relative flex-1 ${compact ? "min-h-[5rem]" : "min-h-[9rem]"}`}>
        {size.w > 0 && size.h > 0 && (
          <Chart
            w={size.w}
            hgt={size.h}
            x0={x0}
            x1={x1}
            nowH={nowH}
            segs={segs}
            line={line}
            last={last && h.online ? last : null}
            liveGrid={grid}
            win={win}
            narrow={narrow}
            offline={!h.online}
            noHistory={!pts.length}
          />
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ plain sentence
function explain({
  h,
  grid,
  win,
  nowH,
  capImp,
  capExp,
  llm,
}: {
  h: House;
  grid: number | null;
  win: { a: number; b: number; segs: Seg[]; sig: Signal } | null;
  nowH: number;
  capImp: number | null;
  capExp: number | null;
  llm: boolean;
}): { key: string; text: string } {
  const g = grid ?? 0;
  const flow = g > 0.05 ? `It is taking ${fmt(g)} kW` : g < -0.05 ? `It is giving ${fmt(g)} kW back` : "It takes nothing from the street";
  if (!h.online) {
    return win
      ? { key: "off-sig", text: `This house is offline. Gridzilla's box for its street holds until ${hhmm(win.b)}; the line shows its last readings.` }
      : { key: "off", text: "This house is offline right now. The line shows its last readings." };
  }
  if (win && win.a > nowH + 0.02) {
    const first = win.segs[0];
    const lim = first?.imp ?? first?.exp;
    return {
      key: `soon-${win.sig.seq}`,
      text:
        lim != null
          ? `A box starts at ${hhmm(win.a)}: at most ${fmt(lim)} kW ${first?.imp != null ? "from the street" : "back to the street"}. Until then the house runs its own battery.`
          : `A box starts at ${hhmm(win.a)}. Until then the house runs its own battery.`,
    };
  }
  if (win && capImp != null) {
    const inside = g <= capImp + 0.1;
    return {
      key: `imp-${win.sig.seq}-${inside}`,
      text: `Gridzilla allows this house at most ${fmt(capImp)} kW from the street until ${hhmm(win.b)}. ${flow}: ${inside ? "inside the box." : "above the box, the battery is catching up."}`,
    };
  }
  if (win && capExp != null) {
    const inside = g >= -capExp - 0.1;
    return {
      key: `exp-${win.sig.seq}-${inside}`,
      text: `Gridzilla allows this house to push at most ${fmt(capExp)} kW back until ${hhmm(win.b)}. ${flow}: ${inside ? "inside the box." : "outside the box, the battery is catching up."}`,
    };
  }
  if (win) return { key: `sig-${win.sig.seq}`, text: `A Gridzilla signal runs on this street until ${hhmm(win.b)}. ${flow}.` };
  return {
    key: "open",
    text: `No signal right now: the house runs its own battery.${llm ? "" : " The AI autopilot is off."} ${flow}.`,
  };
}

// ------------------------------------------------------------------ small stats
const ACK: Record<string, { text: string; on: boolean }> = {
  applied: { text: "Following it", on: true },
  partial: { text: "Partly following", on: true },
  refused: { text: "Refused", on: false },
  reverted: { text: "Back on its own", on: false },
};

function Stats({ h, grid, capImp, capExp, underBox }: { h: House; grid: number | null; capImp: number | null; capExp: number | null; underBox: boolean }) {
  const ack = h.ackStatus ? ACK[h.ackStatus] : null;
  const cap = capImp != null ? `${fmt(capImp)} kW in` : capExp != null ? `${fmt(capExp)} kW out` : "Open";
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-2">
      <Stat label="Battery">
        {h.soc != null ? (
          <>
            <Ticker value={h.soc} /> %
          </>
        ) : (
          <span className="text-dim">-</span>
        )}
      </Stat>
      <Stat label={grid != null && grid < -0.05 ? "Giving back" : "Taking"}>
        {grid == null ? (
          <span className="text-dim">offline</span>
        ) : (
          <span style={{ color: grid < -0.05 ? COLORS.give : grid > 0.05 ? COLORS.take : undefined }}>
            <Ticker value={Math.abs(grid)} decimals={1} /> kW
          </span>
        )}
      </Stat>
      <Stat label="Allowed now">
        <span className={cap === "Open" ? "text-dim" : "text-signal"}>{cap}</span>
      </Stat>
      <Stat label="House reply" title={h.ackReason ?? undefined}>
        <span className={ack?.on ? "text-signal" : "text-dim"}>{ack ? ack.text : underBox ? "No reply yet" : "No signal yet"}</span>
      </Stat>
    </dl>
  );
}

function Stat({ label, children, title }: { label: string; children: React.ReactNode; title?: string }) {
  return (
    <div className="min-w-0" title={title}>
      <dt className="tech">{label}</dt>
      <dd className="num m-0 text-[0.98rem] font-semibold whitespace-nowrap text-fg">{children}</dd>
    </div>
  );
}

// ------------------------------------------------------------------ chart
function Chart({
  w,
  hgt,
  x0,
  x1,
  nowH,
  segs,
  line,
  last,
  liveGrid,
  win,
  narrow,
  offline,
  noHistory,
}: {
  w: number;
  hgt: number;
  x0: number;
  x1: number;
  nowH: number;
  segs: Seg[];
  line: { u: number; p: DevPoint }[];
  last: { u: number; p: DevPoint } | null;
  liveGrid: number | null;
  win: { a: number; b: number; sig: Signal } | null;
  narrow: boolean;
  offline: boolean;
  noHistory: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const reduce = useReducedMotion();

  const padL = narrow ? 30 : 38;
  const padR = 10;
  const padT = 26;
  const padB = 24;
  const pw = Math.max(10, w - padL - padR);
  const ph = Math.max(10, hgt - padT - padB);

  // y domain from what is on screen, zero always inside, both directions given some room.
  const vals: number[] = [];
  line.forEach(({ p }) => p.grid_kw != null && vals.push(p.grid_kw));
  if (liveGrid != null) vals.push(liveGrid);
  segs.forEach((g) => {
    if (g.imp != null) vals.push(g.imp);
    if (g.exp != null) vals.push(-g.exp);
  });
  let top = Math.max(1.5, ...vals) * 1.15;
  let bot = Math.min(-1, ...vals) * 1.15;
  top = Math.max(top, -bot * 0.35);
  bot = Math.min(bot, -top * 0.35);
  const step = niceStep(top - bot);

  const X = (u: number) => padL + ((u - x0) / (x1 - x0)) * pw;
  const Y = (kw: number) => padT + ((top - kw) / (top - bot)) * ph;
  const y0 = Y(0);
  const yTop = padT;
  const yBot = padT + ph;

  // Ticks.
  const yt: number[] = [];
  for (let v = Math.ceil(bot / step) * step; v <= top + 1e-9; v += step) yt.push(+v.toFixed(2));
  const hourStep = (x1 - x0) / (pw / (narrow ? 70 : 80)) > 1 ? 2 : 1;
  const xt: number[] = [];
  for (let u = Math.ceil(x0 / hourStep) * hourStep; u <= x1; u += hourStep) xt.push(u);

  // Measured line: runs of readings; a missing stretch is bridged by a faint dashed line, not invented data.
  const runs: [number, number][][] = [];
  const bridges: [number, number, number, number][] = [];
  let run: [number, number][] = [];
  let prev: { u: number; kw: number } | null = null;
  line.forEach(({ u, p }) => {
    if (p.grid_kw == null) return;
    const pt: [number, number] = [X(Math.max(u, x0)), Y(p.grid_kw)];
    if (prev && u - prev.u > SAMPLE_H * 3) {
      if (run.length) runs.push(run);
      bridges.push([X(Math.max(prev.u, x0)), Y(prev.kw), pt[0], pt[1]]);
      run = [];
    }
    run.push(pt);
    prev = { u, kw: p.grid_kw };
  });
  // Bring the line up to "now" with the live reading so the dot sits on the now line.
  const lastRead = prev as { u: number; kw: number } | null;
  if (run.length && liveGrid != null && !offline && lastRead && nowH - lastRead.u < SAMPLE_H * 3) run.push([X(nowH), Y(liveGrid)]);
  if (run.length) runs.push(run);
  const lineD = runs.map((r) => r.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("")).join(" ");
  const areaD = runs
    .filter((r) => r.length > 1)
    .map((r) => `M${r[0]![0].toFixed(1)},${y0} ${r.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join("")} L${r[r.length - 1]![0].toFixed(1)},${y0} Z`)
    .join(" ");

  // Box edges: ceiling (import cap) and floor (export cap) as step lines.
  const edge = (pick: (g: Seg) => number | null, sign: 1 | -1) => {
    let d = "";
    let px: number | null = null;
    [...segs]
      .sort((a, b) => a.a - b.a)
      .forEach((g) => {
        const v = pick(g);
        if (v == null) {
          px = null;
          return;
        }
        const yy = Y(sign * v).toFixed(1);
        const xa = X(g.a);
        d += `${px != null && Math.abs(px - xa) < 1.5 ? "L" : "M"}${xa.toFixed(1)},${yy} L${X(g.b).toFixed(1)},${yy} `;
        px = X(g.b);
      });
    return d.trim();
  };
  const ceil = edge((g) => g.imp, 1);
  const floor = edge((g) => g.exp, -1);
  // Band fill: one polygon per contiguous run of the same kind, so slots join without seams.
  const bands: { d: string; kind: "down" | "up" | "both" }[] = [];
  {
    const sorted = [...segs].sort((a, b) => a.a - b.a);
    const kindOf = (g: Seg) => (g.imp != null && g.exp == null ? "down" : g.exp != null && g.imp == null ? "up" : "both");
    let grp: Seg[] = [];
    const flush = () => {
      if (!grp.length) return;
      const topY = (g: Seg) => (g.imp != null ? Y(g.imp) : yTop - 4);
      const botY = (g: Seg) => (g.exp != null ? Y(-g.exp) : yBot + 4);
      const up = grp.map((g) => `L${X(g.a).toFixed(1)},${topY(g).toFixed(1)} L${X(g.b).toFixed(1)},${topY(g).toFixed(1)}`).join(" ");
      const down = [...grp].reverse().map((g) => `L${X(g.b).toFixed(1)},${botY(g).toFixed(1)} L${X(g.a).toFixed(1)},${botY(g).toFixed(1)}`).join(" ");
      bands.push({ d: `M${up.slice(1)} ${down} Z`, kind: kindOf(grp[0]!) });
      grp = [];
    };
    sorted.forEach((g) => {
      const last = grp[grp.length - 1];
      if (last && (Math.abs(X(g.a) - X(last.b)) > 1.5 || kindOf(g) !== kindOf(last))) flush();
      grp.push(g);
    });
    flush();
  }
  const hasBox = segs.length > 0;
  const nowX = X(nowH);
  const nowInside = nowH >= x0 && nowH <= x1;

  // Where to write "Allowed box": middle of the widest run that has a ceiling (or floor).
  // Sits inside the band, clear of its tightest edge: in the slots ahead of "now" when there is room, else over all of it.
  const label = (() => {
    if (!segs.length) return null;
    const future = segs.filter((g) => g.b > nowH).map((g) => ({ ...g, a: Math.max(g.a, nowH) }));
    const futureW = future.length ? X(Math.max(...future.map((g) => g.b))) - X(Math.min(...future.map((g) => g.a))) : 0;
    const ref = futureW >= 120 ? future : segs;
    const a = Math.min(...ref.map((g) => g.a));
    const b = Math.max(...ref.map((g) => g.b));
    if (X(b) - X(a) < 90) return null;
    const cx = (X(a) + X(b)) / 2;
    const imps = ref.filter((g) => g.imp != null).map((g) => g.imp!);
    const exps = ref.filter((g) => g.exp != null).map((g) => g.exp!);
    const yy = imps.length ? Y(Math.min(...imps)) + 20 : exps.length ? Y(-Math.min(...exps)) - 12 : yTop + 20;
    return { cx, y: Math.min(Math.max(yy, yTop + 14), yBot - 6) };
  })();

  return (
    <svg width={w} height={hgt} className="absolute inset-0 block overflow-visible" role="img" aria-label="Allowed box and measured grid power of one house over time">
      <defs>
        <linearGradient id={`${id}-down`} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={yTop} y2={yBot}>
          <stop offset="0" stopColor={COLORS.signal} stopOpacity="0.30" />
          <stop offset={Math.max(0.05, Math.min(0.95, (y0 - yTop) / ph))} stopColor={COLORS.signal} stopOpacity="0.16" />
          <stop offset="1" stopColor={COLORS.signal} stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id={`${id}-up`} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={yBot} y2={yTop}>
          <stop offset="0" stopColor={COLORS.signal} stopOpacity="0.30" />
          <stop offset={Math.max(0.05, Math.min(0.95, (yBot - y0) / ph))} stopColor={COLORS.signal} stopOpacity="0.16" />
          <stop offset="1" stopColor={COLORS.signal} stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id={`${id}-take`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={COLORS.take} stopOpacity="0.16" />
          <stop offset="1" stopColor={COLORS.take} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-give`} x1="0" x2="0" y1="1" y2="0">
          <stop offset="0" stopColor={COLORS.give} stopOpacity="0.16" />
          <stop offset="1" stopColor={COLORS.give} stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}-above`}>
          <rect x={0} y={0} width={w} height={y0} />
        </clipPath>
        <clipPath id={`${id}-below`}>
          <rect x={0} y={y0} width={w} height={Math.max(0, hgt - y0)} />
        </clipPath>
        <clipPath id={`${id}-plot`}>
          <rect x={padL} y={yTop - 2} width={pw} height={ph + 4} />
        </clipPath>
        <filter id={`${id}-glow`} x="-10%" y="-50%" width="120%" height="200%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>

      {/* plot well */}
      <rect x={padL} y={yTop} width={pw} height={ph} rx={10} fill="rgb(0 0 0 / 0.22)" />
      {nowInside && <rect x={nowX} y={yTop} width={Math.max(0, padL + pw - nowX)} height={ph} fill="rgb(255 255 255 / 0.018)" />}

      {/* y grid */}
      {yt.map((v) => (
        <g key={v}>
          {v !== 0 && <line x1={padL} x2={padL + pw} y1={Y(v)} y2={Y(v)} stroke="rgb(255 255 255 / 0.05)" />}
          <text x={padL - 8} y={Y(v)} dy="0.35em" textAnchor="end" className="num fill-faint text-[0.68rem]">
            {Math.abs(v) < 1e-9 ? "0" : `${v > 0 ? "" : "-"}${Math.abs(v)}`}
          </text>
        </g>
      ))}
      <text x={padL - 8} y={yTop - 12} textAnchor="end" className="fill-faint text-[0.62rem]">
        kW
      </text>

      {/* x ticks */}
      {xt.filter((u) => X(u) > padL + 16 && X(u) < padL + pw - 18).map((u) => (
        <text key={u} x={X(u)} y={yBot + 16} textAnchor="middle" className="num fill-faint text-[0.68rem]">
          {hhmm(u)}
        </text>
      ))}

      <g clipPath={`url(#${id}-plot)`}>
        {/* the allowed box */}
        <AnimatePresence>
          {hasBox && (
            <motion.g
              key={win ? `sig-${win.sig.seq}` : "past"}
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              {bands.map((b, i) => (
                <path
                  key={i}
                  d={b.d}
                  fill={b.kind === "down" ? `url(#${id}-down)` : b.kind === "up" ? `url(#${id}-up)` : COLORS.signal}
                  fillOpacity={b.kind === "both" ? 0.16 : 1}
                />
              ))}
              {[ceil, floor].filter(Boolean).map((d, i) => (
                <g key={i}>
                  <path d={d} fill="none" stroke={COLORS.signal} strokeWidth={6} opacity={0.55} filter={`url(#${id}-glow)`} />
                  <path d={d} fill="none" stroke={COLORS.signal} strokeWidth={2.25} strokeLinejoin="round" />
                </g>
              ))}
              {label && (
                <text x={label.cx} y={label.y} textAnchor="middle" className="fill-signal text-[0.78rem] font-semibold tracking-[0.01em]">
                  Allowed box
                </text>
              )}
            </motion.g>
          )}
        </AnimatePresence>

        {/* zero line */}
        <line x1={padL} x2={padL + pw} y1={y0} y2={y0} stroke="rgb(255 255 255 / 0.22)" strokeWidth={1} />

        {/* measured grid power: blue above zero, yellow below */}
        {bridges.map(([ax, ay, bx, by], i) => (
          <line key={`gap-${i}`} x1={ax} y1={ay} x2={bx} y2={by} stroke="rgb(238 243 249 / 0.28)" strokeWidth={1.5} strokeDasharray="2 5" />
        ))}
        {lineD && (
          <>
            <path d={areaD} fill={`url(#${id}-take)`} clipPath={`url(#${id}-above)`} />
            <path d={areaD} fill={`url(#${id}-give)`} clipPath={`url(#${id}-below)`} />
            <path d={lineD} fill="none" stroke={COLORS.take} strokeWidth={5} opacity={0.35} filter={`url(#${id}-glow)`} clipPath={`url(#${id}-above)`} />
            <path d={lineD} fill="none" stroke={COLORS.give} strokeWidth={5} opacity={0.35} filter={`url(#${id}-glow)`} clipPath={`url(#${id}-below)`} />
            <path d={lineD} fill="none" stroke={COLORS.take} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#${id}-above)`} />
            <path d={lineD} fill="none" stroke={COLORS.give} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#${id}-below)`} />
          </>
        )}
      </g>

      {/* direction words, so nobody has to know the sign convention */}
      <text x={padL + 10} y={yTop + 16} className="text-[0.72rem] font-medium" fill={COLORS.take} opacity={0.9}>
        {ph < 130 || narrow ? "Taking" : "Taking from the street"}
      </text>
      <text x={padL + 10} y={yBot - 9} className="text-[0.72rem] font-medium" fill={COLORS.give} opacity={0.9}>
        Giving back
      </text>

      {/* now */}
      {nowInside && (
        <g>
          <line x1={nowX} x2={nowX} y1={yTop - 6} y2={yBot} stroke="rgb(238 243 249 / 0.55)" strokeWidth={1.25} strokeDasharray="3 4" />
          <text x={nowX} y={yTop - 10} textAnchor="middle" className="num fill-fg text-[0.72rem] font-semibold">
            now {hhmm(nowH)}
          </text>
          {liveGrid != null && !offline && (last || noHistory) && (
            <g>
              {!reduce && (
                <motion.circle
                  cx={nowX}
                  cy={Y(liveGrid)}
                  fill="none"
                  stroke={liveGrid < -0.05 ? COLORS.give : COLORS.take}
                  strokeWidth={2}
                  initial={{ r: 5, opacity: 0.8 }}
                  animate={{ r: 15, opacity: 0 }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                />
              )}
              <circle cx={nowX} cy={Y(liveGrid)} r={4.5} fill={liveGrid < -0.05 ? COLORS.give : COLORS.take} stroke="#05080d" strokeWidth={2} />
            </g>
          )}
        </g>
      )}

      {/* honest empty states inside the plot */}
      {noHistory && !hasBox && (
        <text x={nowInside && nowX - padL > 160 ? padL + (nowX - padL) / 2 : padL + pw / 2} y={padT + ph / 2} dy="0.35em" textAnchor="middle" className="fill-dim text-[0.82rem]">
          {offline ? "No readings from this house yet" : "Collecting the first readings"}
        </text>
      )}
      {!noHistory && !hasBox && (
        <text x={padL + pw - 10} y={yTop + 16} textAnchor="end" className="fill-faint text-[0.72rem]">
          No box: the house decides
        </text>
      )}
    </svg>
  );
}
