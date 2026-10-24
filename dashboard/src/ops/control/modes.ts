// The six signal modes and the fields each may carry: a copy of MODE_FIELDS in platform/gridzilla.py (the guard refuses
// any other field) with the team board's defaults (platform/static/index.html, Manual tab).
import type { Mode, Signal, State } from "../../api";
import { nice } from "../../model";

export const MODES: Mode[] = ["SUPPORT", "ABSORB", "PREPARE", "RECOVER", "RELEASE", "STRETCH"];

export const MODE_LABEL: Record<Mode, string> = {
  SUPPORT: "Use batteries",
  ABSORB: "Store the sun",
  PREPARE: "Fill up before",
  RECOVER: "Refill slowly",
  RELEASE: "Hand back",
  STRETCH: "Make it last",
};

export type Field = "import_max_kw" | "export_min_kw" | "export_max_kw" | "charge_max_kw" | "discharge_max_kw" | "target_soc" | "max_soc_by";
export const ALL_FIELDS: Field[] = ["import_max_kw", "export_min_kw", "export_max_kw", "charge_max_kw", "discharge_max_kw", "target_soc", "max_soc_by"];

export const MODE_FIELDS: Record<Mode, Field[]> = {
  PREPARE: ["target_soc", "charge_max_kw"],
  ABSORB: ["export_max_kw", "charge_max_kw", "max_soc_by"],
  SUPPORT: ["import_max_kw", "export_min_kw"],
  STRETCH: ["discharge_max_kw"],
  RECOVER: ["charge_max_kw"],
  RELEASE: [],
};

export const FIELD: Record<Field, { label: string; unit: string; step: number; def: number }> = {
  import_max_kw: { label: "Take at most", unit: "kW", step: 0.5, def: 3 },
  export_min_kw: { label: "Give at least", unit: "kW", step: 0.5, def: 2 },
  export_max_kw: { label: "Push at most", unit: "kW", step: 0.5, def: 2 },
  charge_max_kw: { label: "Charge at most", unit: "kW", step: 0.5, def: 3 },
  discharge_max_kw: { label: "Discharge at most", unit: "kW", step: 0.5, def: 1 },
  target_soc: { label: "Fill to", unit: "%", step: 5, def: 90 },
  max_soc_by: { label: "Make room down to", unit: "%", step: 5, def: 40 },
};

/** Board: STRETCH 720 min, PREPARE 240, everything else 120 (real minutes). */
export const defaultDuration = (m: Mode) => (m === "STRETCH" ? 720 : m === "PREPARE" ? 240 : 120);

export type Level = "sub" | "feeder" | "tf";
export const LEVEL_LABEL: Record<Level, string> = { sub: "Substation", feeder: "Feeder", tf: "Transformer" };

export const levelOf = (n: string): Level | null => {
  const k = n.split(":")[0];
  return k === "sub" || k === "feeder" || k === "tf" ? k : null;
};

/** "Erdberg 47" keeps the number for transformers so two on one street stay apart. */
export function segName(n: string | null | undefined) {
  if (!n) return "";
  if (n.startsWith("tf:")) {
    const id = n.split(":")[1];
    const num = id.match(/-(\d+)$/)?.[1];
    return `${nice(n)}${num ? ` ${num}` : ""}`;
  }
  if (n.startsWith("region:")) return "the whole city";
  return nice(n);
}

export const kindWord = (n: string) => ({ sub: "substation", feeder: "feeder", tf: "transformer", region: "city" } as Record<string, string>)[n.split(":")[0]] ?? "node";

/** Homes behind a node (one simulated meter per home on the platform). */
export const homesUnder = (s: State, n: string) => s.aggregates[n]?.devices ?? 0;

/** "≤3 kW in · ≥2 kW out" from the fields a signal carries. */
export function fieldLine(f: Partial<Record<Field, number | null>> | null | undefined) {
  if (!f) return "";
  return ALL_FIELDS.filter((k) => f[k] != null)
    .map((k) => `${FIELD[k].label.toLowerCase()} ${f[k]} ${FIELD[k].unit}`)
    .join(" · ");
}

export const signalFields = (sig: Signal) => Object.fromEntries(ALL_FIELDS.map((k) => [k, sig[k]])) as Record<Field, number | null>;
