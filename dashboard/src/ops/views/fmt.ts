// Small formatters shared by the shell and the table views.
import type { Signal, State } from "../../api";

/** Grid hour (23.8) as a clock (23:48). */
export const clock = (h: number) => {
  const m = Math.round((((h % 24) + 24) % 24) * 60) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** ISO time as the viewer's wall clock, hh:mm:ss. */
export const wall = (iso: string | null | undefined, secs = true) => {
  if (!iso) return "–";
  const d = new Date(iso);
  if (isNaN(+d)) return "–";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", ...(secs ? { second: "2-digit" } : {}) });
};

export const kw = (v: number | null | undefined, d = 1) => (v == null || !isFinite(v) ? "–" : v.toFixed(d));

/** "tf:mauer-2" -> "Mauer 2", "feeder:x-1" -> "X 1". */
export const nice = (n: string | null | undefined) => {
  if (!n) return "–";
  const body = n.replace(/^[a-z]+:/, "").replace(/[-_]/g, " ");
  return body.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
};

export const kindOf = (n: string) => (n.split(":")[0] === "tf" ? "transformer" : n.split(":")[0] === "sub" ? "substation" : n.split(":")[0]);

/** Human labels for the signal modes (code name shown small next to them). */
export const MODE_LABEL: Record<string, string> = {
  SUPPORT: "Cut the peak",
  ABSORB: "Soak up solar",
  PREPARE: "Charge ahead",
  RECOVER: "Recover",
  RELEASE: "Hand back",
  STRETCH: "Stretch",
};

/** The active signal that covers a node: its own, or one on a parent up the tree. */
export function signalOver(s: State, node: string): Signal | null {
  for (let c: string | null | undefined = node; c; c = s.tree[c]?.parent) if (s.active[c]) return s.active[c];
  return null;
}

export const minsLeft = (to: string) => Math.max(0, Math.round((+new Date(to) - Date.now()) / 60000));

/** One plain-English sentence on hover (title) and on tap on phones (data-tip, shown by the top bar's TapTip). */
export const tip = (t: string) => ({ title: t, "data-tip": t });
