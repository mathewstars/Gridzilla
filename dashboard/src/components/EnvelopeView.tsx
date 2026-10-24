// "Allowed box for one house": the dynamic operating envelope of one program house drawn over time.
// Light grey band = what Gridzilla allows per 15-minute slot (ceiling = import cap, floor = export cap), ink line =
// what the meter measured, red only where the line leaves the box. Past slots come from the caps the house reported
// applying; the active signal fills the slots ahead of "now".
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { DevPoint, History, Signal, State } from "../api";
import { COLORS, hhmm, housesOf, type House } from "../model";
import { Badge, Empty, PanelTitle } from "./ui";

type Props = { s: State; history: History | null; tf: string; house: string | null; setHouse: (k: string | null) => void };

/** One stretch of time with a fixed box. `imp`/`exp` null = that side is open (no limit from Gridzilla). */
interface Seg {
  a: number;
  b: number;
  imp: number | null;
  exp: number | null;
}

type Win = { a: number; b: number; segs: Seg[]; sig: Signal };

const SAMPLE_H = 5 / 60; // the platform samples device history every 5 grid minutes
const SLACK = 0.1; // kW of meter noise we still call "inside the box"
const BAND = COLORS.fill; // the allowed box: flat light grey
const EDGE = COLORS.muted; // its limit edge

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

/** Default pick: a house under an active signal first, then one that is online, then the busiest meter. */
function interesting(s: State, h: House) {
  return (h.underSignal ? 1000 : 0) + (signalFor(s, batteryOf(h).path) ? 500 : 0) + (h.online ? 100 : 0) + Math.abs(h.grid_kw);
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

function niceStep(span: number, lines: number) {
  for (const st of [0.5, 1, 2, 2.5, 5, 10, 20]) if (span / st <= lines) return st;
  return 50;
}

/** "3", "1.2", "12": kW without a trailing ".0". */
const kw = (v: number) => {
  const a = Math.abs(v);
  return String(+a.toFixed(a >= 10 ? 0 : 1));
};

const segAt = (segs: Seg[], u: number) => segs.find((g) => g.a <= u && g.b > u) ?? null;

/** Outside the box: above the ceiling or below the floor of the slot it falls in. */
function outside(g: Seg | null, v: number) {
  if (!g) return false;
  return (g.imp != null && v > g.imp + SLACK) || (g.exp != null && v < -g.exp - SLACK);
}

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

const remPx = () => (typeof document === "undefined" ? 16 : parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);

// ------------------------------------------------------------------ view
export default function EnvelopeView({ s, history, tf, house, setHouse }: Props) {
  const all = tf && s.tree[tf] ? housesOf(s, tf) : [];
  const withBattery = all.filter((h) => h.kwh > 0);
  const houses = (withBattery.length ? withBattery : all).sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));

  // Auto pick: the most interesting house, kept stable between polls unless one under a signal appears.
  const auto = useRef<string | null>(null);
  const best = houses.length ? houses.reduce((a, b) => (interesting(s, b) > interesting(s, a) ? b : a)) : null;
  const kept = houses.find((h) => h.key === auto.current);
  if (!kept || (best && interesting(s, best) >= 500 && interesting(s, kept) < 500)) auto.current = best?.key ?? null;
  const chosen = houses.find((h) => h.key === house) ?? houses.find((h) => h.key === auto.current) ?? null;

  if (!tf || !s.tree[tf]) return <Shell>{<Empty>Pick a street transformer to see the allowed box of one of its houses.</Empty>}</Shell>;
  if (!chosen)
    return <Shell>{<Empty>No program houses on this street transformer yet. Houses with a battery show up here once they connect.</Empty>}</Shell>;

  return (
    <Shell right={<Stepper houses={houses} chosen={chosen} onPick={setHouse} />}>
      <HouseBox s={s} history={history} h={chosen} />
    </Shell>
  );
}

/** Previous / next house: two white round buttons around the house name. */
function Stepper({ houses, chosen, onPick }: { houses: House[]; chosen: House; onPick: (k: string) => void }) {
  const i = Math.max(0, houses.findIndex((h) => h.key === chosen.key));
  const go = (d: number) => onPick(houses[(i + d + houses.length) % houses.length]!.key);
  const many = houses.length > 1;
  const round = "btn btn-white h-8 w-8 shrink-0 !p-0";
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {many && (
        <button type="button" className={round} aria-label="Previous house" onClick={() => go(-1)}>
          <CaretLeft size={16} weight="bold" />
        </button>
      )}
      <span className="min-w-[4.25rem] text-center text-[1.0625rem] font-semibold whitespace-nowrap text-ink tabular-nums">
        {chosen.name}
        {!chosen.online && <span className="font-normal text-tertiary"> (offline)</span>}
      </span>
      {many && (
        <button type="button" className={round} aria-label="Next house" onClick={() => go(1)}>
          <CaretRight size={16} weight="bold" />
        </button>
      )}
    </div>
  );
}

/** Card frame: title and house switcher on top, the view fills the rest. */
function Shell({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <section className="panel @container flex h-full min-h-0 flex-col gap-3 overflow-hidden p-4 @[30rem]:p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <PanelTitle title="Allowed box for one house" />
        {right}
      </div>
      {children}
    </section>
  );
}

function HouseBox({ s, history, h }: { s: State; history: History | null; h: House }) {
  const nowH = s.sim_hour;
  const simX = s.autopilot?.sim_x || 60;
  const batt = batteryOf(h);
  const tel = batt.telemetry;
  const active = signalFor(s, batt.path);
  const pts = useMemo(() => unwrap(history?.devices?.[batt.id] ?? [], nowH), [history, batt.id, nowH]);

  const simAt = (iso: string) => nowH + ((Date.parse(iso) - Date.parse(s.now)) / 3.6e6) * simX;

  // Active signal window and its slots.
  let win: Win | null = null;
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
    const a = u;
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
    .filter((g) => g.b > g.a)
    .sort((a, b) => a.a - b.a);
  const line = pts.filter(({ u }) => u >= x0 - SAMPLE_H && u <= nowH + 0.01);

  // Live numbers and the house's signed reply (the card's one badge).
  const grid = tel ? tel.grid_kw : h.online ? h.grid_kw : null;
  const ack = win && win.a <= nowH + 0.02 && h.online && h.ackStatus ? ACK[h.ackStatus] : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      <Sentence h={h} grid={grid} win={win} nowH={nowH} />
      <div ref={ref} className="relative min-h-[6rem] flex-1">
        {ack && (
          <div className="absolute top-0 right-0 z-10" title={h.ackReason ?? undefined}>
            <Badge alert={ack.alert}>{ack.text}</Badge>
          </div>
        )}
        {size.w > 0 && size.h > 0 && (
          <Chart
            w={size.w}
            hgt={size.h}
            x0={x0}
            x1={x1}
            nowH={nowH}
            segs={segs}
            line={line}
            liveGrid={h.online ? grid : null}
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
const ACK: Record<string, { text: string; alert?: boolean }> = {
  applied: { text: "Following" },
  partial: { text: "Partly following" },
  refused: { text: "Refused", alert: true },
};

const B = ({ children }: { children: ReactNode }) => <span className="font-semibold whitespace-nowrap tabular-nums">{children}</span>;

/** What the house does right now, in a few words: "takes 1.2 kW", "sends 0.4 kW back", "takes nothing from the street". */
function flow(g: number) {
  if (g > 0.05)
    return (
      <>
        takes <B>{kw(g)} kW</B>
      </>
    );
  if (g < -0.05)
    return (
      <>
        sends <B>{kw(g)} kW</B> back
      </>
    );
  return <>takes nothing from the street</>;
}

/** The rule of the box: "may take up to 3 kW from the street", "may not send power back to the street", or both. */
function rule(imp: number | null, exp: number | null) {
  const take = imp == null ? null : imp <= 0.05 ? <>may not take power from the street</> : (
    <>
      may take up to <B>{kw(imp)} kW</B> from the street
    </>
  );
  const give = exp == null ? null : exp <= 0.05 ? <>may not send power back</> : (
    <>
      may send at most <B>{kw(exp)} kW</B> back
    </>
  );
  if (take && give)
    return (
      <>
        {take} and {give}
      </>
    );
  if (give) return <>{give} to the street</>;
  return take;
}

/** How long the current slot's caps hold: up to the next slot with a different box, or the end of the signal. */
function holdsUntil(win: Win, nowH: number) {
  const i = win.segs.findIndex((g) => g.a <= nowH && g.b > nowH);
  if (i < 0) return win.b;
  let end = win.segs[i].b;
  for (let k = i + 1; k < win.segs.length; k++) {
    const g = win.segs[k];
    if (g.imp !== win.segs[i].imp || g.exp !== win.segs[i].exp || Math.abs(g.a - end) > 1e-6) break;
    end = g.b;
  }
  return end;
}

function Sentence({ h, grid, win, nowH }: { h: House; grid: number | null; win: Win | null; nowH: number }) {
  const g = grid ?? 0;
  const n = h.name;
  const started = win && win.a <= nowH + 0.02;
  let text: ReactNode;

  if (!h.online) {
    text = win ? (
      <>
        {n} is offline. A Gridzilla box holds on its street until <B>{hhmm(win.b)}</B>; the line shows its last readings.
      </>
    ) : (
      <>{n} is offline right now. The line shows its last readings.</>
    );
  } else if (win && !started) {
    const r = rule(win.segs[0]?.imp ?? null, win.segs[0]?.exp ?? null);
    text = r ? (
      <>
        From <B>{hhmm(win.a)}</B> {n} {r}. Until then it runs on its own and {flow(g)}.
      </>
    ) : (
      <>
        A Gridzilla signal starts at <B>{hhmm(win.a)}</B>. Until then {n} runs on its own and {flow(g)}.
      </>
    );
  } else if (win) {
    const seg = segAt(win.segs, nowH) ?? win.segs[win.segs.length - 1]!;
    const r = rule(seg.imp, seg.exp);
    const out = outside(seg, g);
    const over = seg.imp != null && g > seg.imp + SLACK;
    text = r ? (
      <>
        {n} {r} until <B>{hhmm(holdsUntil(win, nowH))}</B>. Right now it {flow(g)}:{" "}
        {out ? <span className="text-red">{over ? "above" : "outside"} the box, its battery is catching up.</span> : "inside the box."}
      </>
    ) : (
      <>
        A Gridzilla signal runs on this street until <B>{hhmm(win.b)}</B>. Right now {n} {flow(g)}.
      </>
    );
  } else {
    text = (
      <>
        No signal right now: {n} runs on its own. It {flow(g)}.
      </>
    );
  }

  return (
    <p className="m-0 max-w-[46ch] text-[1.0625rem] leading-[1.38] tracking-[-0.016em] text-ink @[34rem]:text-[1.25rem] @[34rem]:tracking-[0.004em]">
      {text}
    </p>
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
  liveGrid,
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
  liveGrid: number | null;
  narrow: boolean;
  offline: boolean;
  noHistory: boolean;
}) {
  const id = `env-plot-${useId().replace(/:/g, "")}`;
  const rem = remPx();
  const padL = rem * 2.4;
  const padR = rem * 0.4;
  const padT = rem * 1.5;
  const padB = rem * 1.5;
  const pw = Math.max(10, w - padL - padR);
  const ph = Math.max(10, hgt - padT - padB);

  // y domain: the measured line decides the scale, so it never lies flat at the bottom. A cap far above what the house
  // does is drawn running off the top (its value is written in the band) instead of squashing the line.
  const lineVals: number[] = [];
  line.forEach(({ p }) => p.grid_kw != null && lineVals.push(p.grid_kw));
  if (liveGrid != null) lineVals.push(liveGrid);
  const reach = Math.max(1, ...lineVals.map(Math.abs)) * 2.5;
  const vals = [...lineVals];
  segs.forEach((g) => {
    if (g.imp != null && g.imp <= reach) vals.push(g.imp);
    if (g.exp != null && g.exp <= reach) vals.push(-g.exp);
  });
  let top = Math.max(1, ...vals) * 1.18;
  let bot = Math.min(-0.5, ...vals) * 1.18;
  top = Math.max(top, -bot * 0.3);
  bot = Math.min(bot, -top * 0.3);
  // Both sides of zero keep room for their direction word.
  const room = Math.min(0.45, (rem * 1.6) / ph);
  top = Math.max(top, (room * -bot) / (1 - room));
  bot = Math.min(bot, -(room * top) / (1 - room));
  const step = niceStep(top - bot, ph < 140 ? 3 : 4);

  const X = (u: number) => padL + ((u - x0) / (x1 - x0)) * pw;
  const Y = (v: number) => padT + ((top - Math.min(top, Math.max(bot, v))) / (top - bot)) * ph;
  const y0 = Y(0);
  const yTop = padT;
  const yBot = padT + ph;

  // Ticks.
  const yt: number[] = [];
  for (let v = Math.ceil(bot / step) * step; v <= top + 1e-9; v += step) yt.push(+v.toFixed(2));
  const hourStep = (x1 - x0) / (pw / (rem * 4.5)) > 1 ? 2 : 1;
  const xt: number[] = [];
  for (let u = Math.ceil(x0 / hourStep) * hourStep; u <= x1; u += hourStep) xt.push(u);

  // Measured line: runs of readings; a missing stretch is bridged by a faint dashed line, not invented data.
  type P = { x: number; y: number; out: boolean };
  const runs: P[][] = [];
  const bridges: [P, P][] = [];
  let run: P[] = [];
  let prev: { u: number; pt: P } | null = null;
  line.forEach(({ u, p }) => {
    if (p.grid_kw == null) return;
    const pt = { x: X(Math.max(u, x0)), y: Y(p.grid_kw), out: outside(segAt(segs, u), p.grid_kw) };
    if (prev && u - prev.u > SAMPLE_H * 3) {
      if (run.length) runs.push(run);
      bridges.push([prev.pt, pt]);
      run = [];
    }
    run.push(pt);
    prev = { u, pt };
  });
  // Bring the line up to "now" with the live reading so the dot sits on the now line.
  const lastRead = prev as { u: number; pt: P } | null;
  const liveOut = liveGrid != null && outside(segAt(segs, nowH - 1e-6), liveGrid);
  if (run.length && liveGrid != null && !offline && lastRead && nowH - lastRead.u < SAMPLE_H * 3)
    run.push({ x: X(nowH), y: Y(liveGrid), out: liveOut });
  if (run.length) runs.push(run);
  const f = (n: number) => n.toFixed(1);
  const lineD = runs.map((r) => r.map((p, i) => `${i ? "L" : "M"}${f(p.x)},${f(p.y)}`).join("")).join(" ");
  // Red only where the line is outside the box.
  const redD = runs
    .flatMap((r) => r.slice(1).map((p, i) => [r[i]!, p] as const))
    .filter(([a, b]) => a.out || b.out)
    .map(([a, b]) => `M${f(a.x)},${f(a.y)}L${f(b.x)},${f(b.y)}`)
    .join("");

  // Box edges: ceiling (import cap) and floor (export cap) as step lines; a cap off the chart has no edge on screen.
  const edge = (pick: (g: Seg) => number | null, sign: 1 | -1) => {
    let d = "";
    let px: number | null = null;
    segs.forEach((g) => {
      const v = pick(g);
      if (v == null || (sign === 1 ? v > top : -v < bot)) {
        px = null;
        return;
      }
      const yy = f(Y(sign * v));
      const xa = X(g.a);
      d += `${px != null && Math.abs(px - xa) < 1.5 ? "L" : "M"}${f(xa)},${yy} L${f(X(g.b))},${yy} `;
      px = X(g.b);
    });
    return d.trim();
  };
  const ceil = edge((g) => g.imp, 1);
  const floor = edge((g) => g.exp, -1);
  // Band fill: one step polygon per contiguous run of slots, so slots join without seams.
  const bands: string[] = [];
  {
    let grp: Seg[] = [];
    const topY = (g: Seg) => (g.imp != null ? Y(g.imp) : yTop);
    const botY = (g: Seg) => (g.exp != null ? Y(-g.exp) : yBot);
    const flush = () => {
      if (!grp.length) return;
      const up = grp.map((g) => `L${f(X(g.a))},${f(topY(g))} L${f(X(g.b))},${f(topY(g))}`).join(" ");
      const down = [...grp].reverse().map((g) => `L${f(X(g.b))},${f(botY(g))} L${f(X(g.a))},${f(botY(g))}`).join(" ");
      bands.push(`M${up.slice(1)} ${down} Z`);
      grp = [];
    };
    segs.forEach((g) => {
      const last = grp[grp.length - 1];
      if (last && Math.abs(X(g.a) - X(last.b)) > 1.5) flush();
      grp.push(g);
    });
    flush();
  }
  const hasBox = segs.length > 0;
  const nowX = X(nowH);
  const nowInside = nowH >= x0 && nowH <= x1;

  // "Allowed box" written inside the band, in the slots ahead of "now" when there is room, clear of its tightest edge.
  const label = (() => {
    if (!segs.length) return null;
    const future = segs.filter((g) => g.b > nowH).map((g) => ({ ...g, a: Math.max(g.a, nowH + (rem * 0.6 * (x1 - x0)) / pw) }));
    const futureW = future.length ? X(Math.max(...future.map((g) => g.b))) - X(Math.min(...future.map((g) => g.a))) : 0;
    const ref = futureW >= rem * 7 ? future : segs;
    const a = Math.min(...ref.map((g) => g.a));
    const b = Math.max(...ref.map((g) => g.b));
    if (X(b) - X(a) < rem * 6) return null;
    const imps = ref.filter((g) => g.imp != null).map((g) => g.imp!);
    const exps = ref.filter((g) => g.exp != null).map((g) => g.exp!);
    const offTop = imps.length > 0 && Math.max(...imps) > top;
    let yy = imps.length ? Y(Math.min(...imps)) + rem * 1.25 : exps.length ? Y(-Math.min(...exps)) - rem * 0.6 : yTop + rem * 1.25;
    // keep the zero line from striking through the words
    if (Math.abs(yy - rem * 0.35 - y0) < rem * 0.8) yy = imps.length ? y0 + rem * 1.25 : y0 - rem * 0.6;
    const text = offTop ? `Allowed box, up to ${kw(Math.max(...imps))} kW` : "Allowed box";
    return { x: (X(a) + X(b)) / 2, y: Math.min(Math.max(yy, yTop + rem * 1.1), yBot - rem * 0.5), text };
  })();

  const t = "text-[0.8125rem]";
  return (
    <svg width={w} height={hgt} className="absolute inset-0 block" role="img" aria-label="Allowed box and measured grid power of one house over time">
      <defs>
        <clipPath id={id}>
          <rect x={padL} y={yTop - 2} width={pw} height={ph + 4} />
        </clipPath>
      </defs>

      {/* y ticks, no grid lines */}
      {yt.map((v) => (
        <text key={v} x={padL - rem * 0.5} y={Y(v)} dy="0.35em" textAnchor="end" className={`fill-tertiary tabular-nums ${t}`}>
          {Math.abs(v) < 1e-9 ? "0" : `${v > 0 ? "" : "-"}${Math.abs(v)}`}
        </text>
      ))}
      <text x={padL - rem * 0.5} y={yTop - rem * 0.55} textAnchor="end" className={`fill-tertiary ${t}`}>
        kW
      </text>

      {/* x ticks */}
      {xt
        .filter((u) => X(u) > padL + rem * 1.4 && X(u) < padL + pw - rem * 1.4 && (!nowInside || Math.abs(X(u) - nowX) > rem * 4))
        .map((u) => (
          <text key={u} x={X(u)} y={yBot + rem * 1.1} textAnchor="middle" className={`fill-tertiary tabular-nums ${t}`}>
            {hhmm(u)}
          </text>
        ))}

      <g clipPath={`url(#${id})`}>
        {/* the allowed box */}
        {bands.map((d, i) => (
          <path key={i} d={d} fill={BAND} />
        ))}
        {[ceil, floor].filter(Boolean).map((d, i) => (
          <path key={i} d={d} fill="none" stroke={EDGE} strokeWidth={1.5} strokeLinejoin="round" />
        ))}

        {/* zero line */}
        <line x1={padL} x2={padL + pw} y1={y0} y2={y0} stroke={COLORS.muted} strokeWidth={1} />

        {/* measured grid power */}
        {bridges.map(([a, b], i) => (
          <line key={`gap-${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={COLORS.muted} strokeWidth={1.5} strokeDasharray="2 5" />
        ))}
        {lineD && <path d={lineD} fill="none" stroke={COLORS.take} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
        {redD && <path d={redD} fill="none" stroke={COLORS.crit} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
      </g>

      {label && (
        <text x={label.x} y={label.y} textAnchor="middle" className={`fill-secondary font-semibold ${t}`}>
          {label.text}
        </text>
      )}

      {/* direction words on either side of zero, so nobody has to know the sign convention */}
      <text x={padL + rem * 0.5} y={y0 - rem * 0.45} className={`fill-secondary font-medium ${t}`}>
        {narrow ? "↑ Taking" : "↑ Taking from the street"}
      </text>
      <text x={padL + rem * 0.5} y={y0 + rem * 1.1} className={`fill-secondary font-medium ${t}`}>
        {narrow ? "↓ Giving back" : "↓ Giving back to the street"}
      </text>

      {/* now */}
      {nowInside && (
        <g>
          <line x1={nowX} x2={nowX} y1={yTop - rem * 0.3} y2={yBot} stroke={COLORS.take} strokeWidth={1} />
          <text x={nowX} y={yBot + rem * 1.1} textAnchor="middle" className={`fill-ink font-semibold tabular-nums ${t}`}>
            Now {hhmm(nowH)}
          </text>
          {liveGrid != null && !offline && (
            <circle cx={nowX} cy={Y(liveGrid)} r={rem * 0.32} fill={liveOut ? COLORS.crit : COLORS.take} stroke={COLORS.card} strokeWidth={2} />
          )}
        </g>
      )}

      {/* honest empty states inside the plot */}
      {noHistory && !hasBox && (
        <text
          x={nowInside ? nowX - rem * 0.75 : padL + pw - rem * 0.5}
          y={y0 - yTop > yBot - y0 ? (yTop + y0) / 2 - rem * 0.4 : (y0 + yBot) / 2 + rem * 0.4}
          dy="0.35em"
          textAnchor="end"
          className={`fill-tertiary ${t}`}
        >
          {offline ? "No readings from this house yet" : "Collecting the first readings"}
        </text>
      )}
      {!noHistory && !hasBox && !narrow && (
        <text x={padL + pw - rem * 0.5} y={yTop + rem * 0.95} textAnchor="end" className={`fill-tertiary ${t}`}>
          No box: the house decides
        </text>
      )}
    </svg>
  );
}
