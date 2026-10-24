// Plain-English helpers for the AI brain strip: turn the autopilot's technical sentences into lines a judge reads at a glance.
import type { Decision, Envelope, WeatherFeed } from "../../api";
import { MODE_WORDS, hhmm, nice } from "../../model";

/** Replace raw node ids ("tf:kagran-16", or the bare "kagran-16" when `ids` lists the grid's nodes) with their names
 *  and decimal hours ("19.0h") with clock time. */
export function cleanText(t: string | null | undefined, ids: string[] = []) {
  if (!t) return "";
  let out = t.replace(/\b(?:tf|feeder|sub|substation|street|node):[\w-]+/g, (id) => nice(id));
  ids.forEach((id) => {
    const slug = id.split(":")[1];
    if (slug && /-\d+$/.test(slug)) out = out.replace(new RegExp(`\\b${slug}\\b`, "g"), nice(id));
  });
  return out
    .replace(/\b(\d{1,2}\.\d{1,2})\s?h\b/g, (_, h) => hhmm(+h))
    .replace(/\s+\|\s+guard ok$/i, "")
    .replace(/(\d) (%|kWh|kW|h|min|s|°C)(?=[\s.,;:)]|$)/g, "$1\u00a0$2") // keep "118 %" on one line
    .trim();
}

/** The worst forecast in a congestion trigger, so the card can show one big number. */
export function worstOf(trigger: string | null | undefined) {
  if (!trigger) return null;
  // Planner trigger: "<node>: 2 of 3 transformers forecast past 85 % ...; worst tf:x 99 % at 20.60h, 50 kW over."
  const pl = trigger.match(/(\d+) of (\d+) transformers forecast past .*?worst (tf:[\w-]+) (-?\d+) % at ([\d.]+)h/);
  if (pl) return { tf: pl[3], pct: +pl[4], at: hhmm(+pl[5]), others: +pl[1] - 1 };
  const hot = [...trigger.matchAll(/(tf:[\w-]+) now (-?\d+|None) %, forecast (-?\d+) % at ([\d.]+)h/g)];
  if (!hot.length) return null;
  const w = hot.reduce((a, b) => (Math.abs(+b[3]) > Math.abs(+a[3]) ? b : a));
  return { tf: w[1], pct: +w[3], at: hhmm(+w[4]), others: hot.length - 1 };
}

/** Split a paragraph into sentences, so long reasoning is shortened at a full stop and never cut mid-word. */
export const sentences = (t: string) =>
  t
    .split(/(?<=[.!?])\s+(?=[A-Z"])/)
    .map((x) => x.trim())
    .filter(Boolean);

/** What the AI sees of the weather, in one short line. Null when the feed is offline. */
export function weatherLine(w: WeatherFeed) {
  const now = w.available ? w.data?.now : null;
  if (!now) return null;
  const sun = now.sun_wm2 ?? null;
  const sky =
    sun != null
      ? sun >= 600
        ? "strong sun"
        : sun >= 200
          ? "some sun"
          : sun > 20
            ? "cloudy"
            : "dark"
      : now.cloud_pct != null
        ? now.cloud_pct >= 70
          ? "cloudy"
          : "clear sky"
        : null;
  const wind = (now.wind_kmh ?? 0) >= 40 ? `wind ${Math.round(now.wind_kmh!)} km/h` : null;
  const parts = [`${Math.round(now.temp_c)} °C`, sky, wind].filter(Boolean).join(", ");
  return `${w.sample ? "Sample weather" : "Weather"}: ${parts}`;
}

export const modeTitle = (m: string | null | undefined) => (m ? MODE_WORDS[m]?.title ?? nice(m.toLowerCase()) : "");
export const modePlain = (m: string | null | undefined) => (m ? MODE_WORDS[m]?.plain ?? "" : "");

/** Grid minutes as a short duration. */
export function dur(min: number | null | undefined) {
  if (!min) return "";
  if (min < 60) return `${Math.round(min)} min`;
  const h = min / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
}

const kw = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1)} kW`;

/** The allowed box in one line: the tightest slot of the envelope (or the flat field) per house. */
export function boxLine(env: Envelope | null | undefined, fields: Record<string, number | null> | null | undefined) {
  const imp = env?.import_max_kw?.length ? Math.min(...env.import_max_kw) : fields?.import_max_kw ?? null;
  const exp = env?.export_max_kw?.length ? Math.min(...env.export_max_kw) : fields?.export_max_kw ?? null;
  if (imp != null) return `Up to ${kw(imp)} from the grid per house`;
  if (exp != null) return `Up to ${kw(exp)} back to the street per house`;
  return null;
}

/** Guard and autopilot refusals in plain words. The raw reason stays visible underneath as the technical caption. */
export function plainReason(detail: string | null | undefined, mode?: string | null) {
  if (!detail) return null;
  const d = detail;
  let m: RegExpMatchArray | null;
  if ((m = d.match(/cooldown: autopilot signalled (\S+) less than (\d+)/)))
    return `${nice(m[1])} got a signal less than ${m[2]} min ago. Giving it time to work`;
  if (/real-time cooldown/.test(d)) return "A street with real homes was signalled moments ago";
  if ((m = d.match(/limit (\d+) signals per grid day/))) return `Daily limit reached: at most ${m[1]} signals a day`;
  if ((m = d.match(/limit (\d+) signals per real hour/))) return `Real homes get at most ${m[1]} signals an hour`;
  if (/never sent autonomously/.test(d)) return `"${modeTitle(mode)}" always needs a person to approve it`;
  if ((m = d.match(/operator signal seq \d+ on (\S+) overlaps/))) return `An operator's own signal is already running on ${nice(m[1])}`;
  if (/window must be/.test(d)) return "The time window is outside what the rules allow";
  if ((m = d.match(/SUPPORT already sent (\d+)x today for (\S+)/))) return `${nice(m[2])} already used its ${m[1]} battery calls today`;
  if ((m = d.match(/import cap below policy floor ([\d.]+)/))) return `Would leave a house under ${m[1]} kW, below the guaranteed minimum`;
  if (/export_min_kw above policy/.test(d)) return "Would force houses to push out more than allowed";
  if (/exceeds reverse rating/.test(d)) return "Would push more power back than the transformer can take";
  if (/unknown segment/.test(d)) return "DeepSeek named a part of the grid that does not exist";
  if (/unknown mode/.test(d)) return "DeepSeek asked for a signal type that does not exist";
  if (/may not carry/.test(d)) return "The signal carried settings its type may not use";
  if (/envelope/.test(d)) return "The allowed box broke a safety rule";
  if (/target_soc below/.test(d)) return "Asked batteries to fill too little to matter";
  if (/operator approved/.test(d)) return "Approved by the operator";
  if (/nothing pending/.test(d)) return "That proposal is no longer waiting";
  return cleanText(d);
}

export type Verdict = Decision["verdict"];

/** Short label for a verdict chip in the ticker and the Checks card. */
export const VERDICT_WORD: Record<Verdict, string> = {
  sent: "Sent",
  held: "Held back",
  refused: "Refused",
  error: "AI error",
  none: "No action",
  pending: "Waiting",
  rejected: "Rejected",
  expired: "Expired",
};
