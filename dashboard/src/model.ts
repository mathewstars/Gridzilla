// Derived views of the platform state: which feeder is on screen, which houses sit on it, plain-English names.
import type { Decision, Device, State } from "./api";

// Apple white (DESIGN.md): monochrome, the only hue is system red for "over the limit". Direction, not colour, tells
// taking from giving. The keys stay so every view reads its colours from here.
export const COLORS = {
  take: "#1d1d1f", // house taking power from the grid (drawn above zero / solid)
  give: "#6e6e73", // house giving power back (drawn below zero / hollow)
  signal: "#1d1d1f", // Gridzilla: signals, envelopes, the AI
  ok: "#1d1d1f",
  warn: "#6e6e73",
  crit: "#ff3b30",
  muted: "#86868b",
  ground: "#f5f5f7",
  card: "#ffffff",
  fill: "#e8e8ed",
};

export const nice = (id: string | null | undefined) => {
  if (!id) return "";
  const name = id.includes(":") ? id.split(":")[1] : id;
  return name
    .replace(/-\d+$/, "")
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
};

export const kind = (id: string) => id.split(":")[0];

export function pathOf(s: State, n: string) {
  const out: string[] = [];
  let cur: string | null = n;
  while (cur && s.tree[cur]) {
    out.unshift(cur);
    cur = s.tree[cur].parent;
  }
  return out;
}

export const feeders = (s: State) => Object.keys(s.tree).filter((n) => n.startsWith("feeder:"));
export const tfsOf = (s: State, feeder: string) => Object.keys(s.tree).filter((n) => s.tree[n].parent === feeder);
export const allTfs = (s: State) => Object.keys(s.tree).filter((n) => n.startsWith("tf:"));

export function feederOf(s: State, n: string) {
  if (n.startsWith("feeder:")) return n;
  if (n.startsWith("tf:")) return s.tree[n]?.parent ?? feeders(s)[0];
  return feeders(s)[0];
}

/** Signed load in % of the limit that applies in that direction: import against rating, reverse flow against reverse rating. */
export function loadPct(s: State, n: string, kw: number | null | undefined) {
  const t = s.tree[n];
  if (kw == null || !t?.rating_kw) return null;
  const lim = kw >= 0 ? t.rating_kw : t.reverse_kw ?? t.rating_kw;
  return Math.round((100 * kw) / lim);
}

export function loadColor(pct: number | null) {
  if (pct == null) return COLORS.muted;
  const p = Math.abs(pct);
  return p >= 100 ? COLORS.crit : p >= 85 ? COLORS.warn : COLORS.ok;
}

/** A house on the board: devices of one household are merged (the real Victron plant and its heat pump are one house). */
export interface House {
  key: string;
  devices: Device[];
  tf: string;
  name: string;
  represents: number;
  online: boolean;
  real: boolean;
  soc: number | null;
  kwh: number;
  grid_kw: number;
  pv_kw: number;
  ev_kw: number;
  hp_kw: number;
  hasPv: boolean;
  hasEv: boolean;
  hasHeat: boolean;
  underSignal: boolean;
  ackStatus: string | null;
  ackReason: string | null;
  mode: string;
}

const seenPv = new Set<string>();

export function housesOf(s: State, tf: string): House[] {
  const groups = new Map<string, Device[]>();
  Object.values(s.devices)
    .filter((d) => d.tf === tf)
    .forEach((d) => {
      const k = d.household ?? d.id;
      groups.set(k, [...(groups.get(k) ?? []), d]);
    });
  return [...groups.entries()].map(([key, devs]) => {
    const online = devs.filter((d) => d.telemetry);
    const batt = devs.find((d) => d.kwh > 0);
    const t = (batt ?? devs[0]).telemetry;
    const sum = (f: (d: Device) => number | undefined) => online.reduce((a, d) => a + (f(d) ?? 0), 0);
    const pv = sum((d) => d.telemetry?.pv_kw);
    if (pv > 0.05) seenPv.add(key);
    const under = online.some((d) => d.telemetry?.mode && d.telemetry.mode !== "owner");
    const ack = devs.map((d) => d.ack).find((a) => a) ?? null;
    const real = devs.some((d) => !d.id.startsWith("sim-"));
    // Prefer the platform's merged household (one meter, one truth); fall back to merging devices here on older platforms.
    const hh = s.households?.[key];
    if (hh) {
      const ht = hh.telemetry;
      return {
        key,
        devices: devs,
        tf,
        name: devs[0].household ? nice(devs[0].household) : `House ${key.replace(/^sim-[a-z]+-/, "")}`,
        represents: hh.represents ?? 1,
        online: !!ht,
        real: hh.real,
        soc: ht?.soc ?? null,
        kwh: hh.kwh,
        grid_kw: ht?.grid_kw ?? 0,
        pv_kw: pv,
        ev_kw: ht?.ev_kw ?? 0,
        hp_kw: ht?.hp_kw ?? 0,
        hasPv: seenPv.has(key) || hh.kwh > 0,
        hasEv: devs.some((d) => d.ev_kw) || (ht?.ev ?? 0) > 0,
        hasHeat: devs.some((d) => d.heat) || !!ht?.heat,
        underSignal: !!ht && ht.mode !== "owner",
        ackStatus: hh.ack?.status ?? null,
        ackReason: hh.ack?.reason ?? null,
        mode: ht ? ht.mode : "offline",
      };
    }
    return {
      key,
      devices: devs,
      tf,
      name: devs[0].household ? nice(devs[0].household) : `House ${key.replace(/^sim-[a-z]+-/, "")}`,
      represents: batt?.represents ?? devs[0].represents ?? 1,
      online: online.length > 0,
      real,
      soc: t?.soc ?? null,
      kwh: batt?.kwh ?? 0,
      grid_kw: sum((d) => (d.kwh > 0 || !batt ? d.telemetry?.grid_kw : 0)),
      pv_kw: pv,
      ev_kw: sum((d) => d.telemetry?.ev_kw),
      hp_kw: sum((d) => d.telemetry?.hp_kw),
      hasPv: seenPv.has(key) || (batt?.kwh ?? 0) > 0,
      hasEv: devs.some((d) => d.ev_kw),
      hasHeat: devs.some((d) => d.heat),
      underSignal: under,
      ackStatus: ack?.status ?? null,
      ackReason: ack?.reason ?? null,
      mode: online.find((d) => d.telemetry?.mode && d.telemetry.mode !== "owner")?.telemetry?.mode ?? (online.length ? "owner" : "offline"),
    };
  });
}

export function hhmm(h: number) {
  const m = Math.round((((h % 24) + 24) % 24) * 60);
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Fleet-wide headline numbers. Each simulated device stands for `represents` real houses. */
export function headline(s: State) {
  const devs = Object.values(s.devices);
  let kwh = 0,
    kw = 0,
    houses = 0,
    online = 0,
    under = 0,
    obeying = 0;
  devs.forEach((d) => {
    const r = d.represents ?? 1;
    if (d.kwh > 0) houses += r;
    const t = d.telemetry;
    if (!t || d.kwh <= 0) return;
    online += r;
    kwh += (d.kwh * (t.soc ?? 0) * r) / 100;
    kw += d.kw * r;
    if (t.mode && t.mode !== "owner") {
      under += r;
      if (d.ack && (d.ack.status === "applied" || d.ack.status === "partial")) obeying += r;
    }
  });
  // Trimmed payload: households only for the feeder on screen, so city-wide numbers come from the root aggregate and the
  // server's summary (aggregates count devices; each simulated household stands for `houses / households` real ones).
  const root = Object.keys(s.tree).find((n) => !s.tree[n].parent);
  if (s.summary && root && s.aggregates[root]) {
    const r = s.summary.households ? s.summary.houses / s.summary.households : 1;
    const a = s.aggregates[root];
    kwh = a.kwh_available * r;
    kw = a.kw * r;
    houses = s.summary.houses;
    online = s.summary.online * r;
    obeying = a.applied * r;
    under = Object.keys(s.active).filter((n) => !Object.keys(s.active).some((m) => m !== n && pathOf(s, n).includes(m)))
      .reduce((acc, n) => acc + (s.aggregates[n]?.devices ?? 0) * r, 0);
  }
  const tfs = allTfs(s);
  let worst = tfs[0],
    worstPct = 0;
  tfs.forEach((tf) => {
    const p = loadPct(s, tf, s.aggregates[tf]?.total_kw);
    if (p != null && Math.abs(p) >= Math.abs(worstPct)) {
      worst = tf;
      worstPct = p;
    }
  });
  const over = tfs.filter((tf) => Math.abs(loadPct(s, tf, s.aggregates[tf]?.total_kw) ?? 0) >= 100).length;
  return { kwh, kw, houses, online, under, obeying, worst, worstPct, over };
}

/** Outcome of the newest signal the platform sent, from the houses' signed acks. */
export function outcome(s: State, d: Decision | undefined) {
  if (!d || d.seq == null || !d.segment) return null;
  const devs = Object.values(s.devices).filter((x) => x.path.includes(d.segment!) && x.kwh > 0);
  let total = 0,
    obeyed = 0,
    partial = 0,
    refused = 0,
    ended = 0;
  devs.forEach((x) => {
    const r = x.represents ?? 1;
    if (!x.telemetry) return;
    total += r;
    const a = x.ack;
    if (!a) return;
    if (a.seq === d.seq && a.status === "applied") obeyed += r;
    else if (a.seq === d.seq && a.status === "partial") partial += r;
    else if (a.seq === d.seq && a.status === "refused") refused += r;
    else if (a.status === "reverted") ended += r;
  });
  return { total, obeyed, partial, refused, ended };
}

export const MODE_WORDS: Record<string, { title: string; plain: string }> = {
  SUPPORT: { title: "Use your battery", plain: "Houses run on their batteries and take less from the street" },
  ABSORB: { title: "Store the sun", plain: "Houses store solar power instead of pushing it onto the street" },
  RELEASE: { title: "Hand back control", plain: "The event is over, owners run their batteries again" },
  PREPARE: { title: "Fill up before", plain: "Batteries charge gently before a forecast event" },
  STRETCH: { title: "Make it last", plain: "Street is dark, batteries ration until power returns" },
  RECOVER: { title: "Refill slowly", plain: "Staggered recharge after the outage" },
  NONE: { title: "No action needed", plain: "Every transformer stays inside its limits" },
};

/** Turn the autopilot's trigger sentence into a short line a judge can read. */
export function plainTrigger(t: string | null | undefined) {
  if (!t) return null;
  const hot = [...t.matchAll(/(tf:[\w-]+) now (-?\d+|None) %, forecast (-?\d+) % at ([\d.]+)h/g)];
  if (hot.length) {
    const [, tf, , pct, at] = hot.reduce((a, b) => (Math.abs(+b[3]) > Math.abs(+a[3]) ? b : a));
    const p = +pct;
    return p < 0
      ? `${nice(tf)} will hit ${Math.abs(p)} % of its limit around ${hhmm(+at)} as solar pours back in`
      : `${nice(tf)} will hit ${p} % of its limit around ${hhmm(+at)} as the evening peak builds`;
  }
  const pl = t.match(/^(\S+): (\d+) of (\d+) transformers forecast past .*?worst (tf:[\w-]+) (-?\d+) % at ([\d.]+)h, (\d+) kW over/);
  if (pl) {
    const p = +pl[5];
    const many = +pl[2] > 1 ? ` (${pl[2]} of ${pl[3]} on ${nice(pl[1])})` : "";
    return p < 0
      ? `${nice(pl[4])} will hit ${Math.abs(p)} % of its limit around ${hhmm(+pl[6])} as solar pours back in${many}`
      : `${nice(pl[4])} will hit ${p} % of its limit around ${hhmm(+pl[6])} as the evening peak builds${many}`;
  }
  const rel = t.match(/(ABSORB|SUPPORT) seq (\d+) on (\S+) is active/);
  if (rel) return `${nice(rel[3])} is calm again, the signal can end`;
  if (t.startsWith("Operator warning")) return `Operator warning: ${t.replace("Operator warning: ", "")}`;
  return t;
}
