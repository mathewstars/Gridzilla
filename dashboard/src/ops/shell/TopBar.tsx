// Top bar of the operations console: scenario, autopilot mode, heartbeat (fail-safe) with Pause, signals signed today,
// weather, help and the theme switch; nothing else. Every control answers at once (optimistic), then follows the platform; a failure snaps back and
// says why in plain words. One line from 1240 wide (captions drop first, shell.css). Phones (under 900 px) keep only the
// heartbeat and a Menu button that opens the rest in a sheet.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { createPortal } from "react-dom";
import { Cloud, CloudSun, List, Moon, PenNib, Question, Sun, Warning, X } from "@phosphor-icons/react";
import { post, READ_ONLY, READ_ONLY_TEXT } from "../../api";
import type { Ops } from "../useOps";
import { useTheme } from "../theme";
import { clock } from "../views/fmt";
import { useFeed } from "../feed/events";
import Sheet from "./Sheet";
import "./shell.css";

const SCENARIOS = [
  { v: "normal", label: "Normal", hint: "An ordinary day" },
  { v: "cold-evening", label: "Cold", hint: "Cold evening: every house in the city heats and cooks" },
  { v: "sunny-noon", label: "Sunny", hint: "Sunny noon: rooftops push solar back into the grid" },
  { v: "live-weather", label: "Live weather", hint: "Today's real Vienna weather drives the city" },
];
const MODES = [
  { v: "off", label: "Off", hint: "The autopilot only watches" },
  { v: "propose", label: "Propose", hint: "The AI proposes, you approve each signal" },
  { v: "auto", label: "Auto", hint: "The AI signs and sends on its own, within the guard's limits" },
];


function plain(what: string, e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  if (/GZ_LLM_URL/.test(m)) return `${what}: the AI is not connected on this platform, so the autopilot can only be Off.`;
  if (/fetch|network|load failed/i.test(m)) return `${what}: the platform did not answer. Is the local stack running?`;
  if (/not available/.test(m)) return `${what}: this platform does not have that control.`;
  return `${what}: ${m}`;
}

type Opt = { v: string; label: string; hint: string };
function Segmented({ id, opts, value, wait, onPick, label }: { id: string; opts: Opt[]; value: string; wait: string | null; onPick: (v: string) => void; label: string }) {
  const reduce = useReducedMotion();
  return (
    <LayoutGroup id={id}>
      <div className="seg" role="radiogroup" aria-label={label}>
        {opts.map((o) => {
          const on = o.v === value;
          return (
            <button
              key={o.v}
              type="button"
              role="radio"
              aria-checked={on}
              title={READ_ONLY ? READ_ONLY_TEXT : o.hint}
              className={`seg-btn${wait === o.v ? " is-wait" : ""}`}
              disabled={!!wait || READ_ONLY}
              onClick={() => !on && onPick(o.v)}
            >
              {on && <motion.span layoutId={`${id}-thumb`} className="seg-thumb" transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 600, damping: 42, mass: 0.6 }} />}
              {o.label}
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

type Want = { scenario?: string; mode?: string; paused?: boolean };

/** compact: only the scenario, heartbeat with Pause/Resume and the theme icon (demo mode). */
export default function TopBar({ ops, compact = false, phone = false }: { ops: Ops; compact?: boolean; phone?: boolean }) {
  const s = ops.s;
  const [menu, setMenu] = useState(false);
  const [theme, setTheme] = useTheme();
  const [want, setWant] = useState<Want>({});
  const [busy, setBusy] = useState<keyof Want | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const errTimer = useRef(0);
  const feed = useFeed(ops.s, ops.history);

  const scenario = want.scenario ?? s?.scenario?.name ?? "normal";
  const mode = want.mode ?? s?.autopilot?.mode ?? "off";
  const paused = want.paused ?? !!s?.hb_paused;

  // Drop an optimistic value once the platform shows it (or after 8 s, so a stale guess never sticks).
  useEffect(() => {
    if (!s) return;
    setWant((w) => {
      const n = { ...w };
      if (n.scenario === s.scenario?.name) delete n.scenario;
      if (n.mode === s.autopilot?.mode) delete n.mode;
      if (n.paused === s.hb_paused) delete n.paused;
      return Object.keys(n).length === Object.keys(w).length ? w : n;
    });
  }, [s]);
  useEffect(() => {
    if (!Object.keys(want).length) return;
    const t = window.setTimeout(() => setWant({}), 8000);
    return () => window.clearTimeout(t);
  }, [want]);

  const showErr = (m: string) => {
    setErr(m);
    window.clearTimeout(errTimer.current);
    errTimer.current = window.setTimeout(() => setErr(null), 9000);
  };

  async function act<K extends keyof Want>(key: K, val: Want[K], path: string, body: unknown, what: string) {
    setErr(null);
    setBusy(key);
    setWant((w) => ({ ...w, [key]: val }));
    try {
      await post(path, body);
      ops.reload();
    } catch (e) {
      setWant((w) => {
        const n = { ...w };
        delete n[key];
        return n;
      });
      showErr(plain(what, e));
    } finally {
      setBusy(null);
    }
  }

  if (!s) return null;
  const wx = ops.weather;
  const now = wx.data?.now;
  const warns = wx.data?.warnings ?? [];
  const worstWarn = warns.find((w) => w.level === "red") ?? warns.find((w) => w.level === "orange") ?? warns[0];
  const place = (wx.data?.location?.name as string | undefined) ?? "Vienna";
  // Signed TODAY (grid day), from what the page sees: autopilot decisions sent plus signed log lines and signals. When
  // the platform's short log does not reach back to midnight the label says from when it counts.
  const signed = feed?.signals ?? 0;
  const since = feed?.since ?? null;
  const signedTip =
    since == null
      ? `Signals the platform signed and sent to houses today (grid day, from 00:00), not counting diet plan updates.`
      : `Signals signed today since ${clock(since)} grid time: the platform only shares its newest log lines, so earlier ones today are not visible here.`;
  const WxIcon = now && (now.cloud_pct ?? 0) > 60 ? Cloud : CloudSun;

  const scenarioSeg = (
    <Segmented
      id="tb-sc"
      label="Scenario"
      opts={SCENARIOS}
      value={scenario}
      wait={busy === "scenario" ? want.scenario ?? null : null}
      onPick={(v) => act("scenario", v, `scenario/${v}`, undefined, "Scenario not changed")}
    />
  );
  const modeSeg = (
    <Segmented
      id="tb-ap"
      label="Autopilot mode"
      opts={MODES}
      value={mode}
      wait={busy === "mode" ? want.mode ?? null : null}
      onPick={(v) => act("mode", v, "autopilot", { mode: v }, "Autopilot mode not changed")}
    />
  );
  const heartbeat = (
    <Chip
      className={`hb ${paused ? "is-dark" : "is-ok"}`}
      title={paused ? "The platform stopped its heartbeat: every house fell back to its owner's own settings" : "The platform's heartbeat reaches every house, so they follow its signals"}
    >
      <span className="chip-dot" />
      <span>{paused ? "Operator dark" : "Houses connected"}</span>
      <button
        type="button"
        className={`tbtn ${paused ? "is-green" : "is-red"}`}
        disabled={busy === "paused" || READ_ONLY}
        onClick={() => act("paused", !paused, paused ? "heartbeat/resume" : "heartbeat/pause", undefined, paused ? "Heartbeat not resumed" : "Heartbeat not paused")}
        title={READ_ONLY ? READ_ONLY_TEXT : paused ? "Resume the heartbeat: houses follow the grid again" : "Pause the heartbeat to show the fail-safe: houses drop back to owner mode"}
      >
        {paused ? "Resume" : "Pause"}
      </button>
    </Chip>
  );
  const signedChip = (
    <Chip title={signedTip}>
      <PenNib size={14} weight="bold" />
      <span data-src="page" data-label="counted by this page from today's feed">{signed.toLocaleString("en-US")}</span>
      <span className="t">signed today{since != null && <span className="tb-since"> since {clock(since)}</span>}</span>
    </Chip>
  );
  const weatherChip =
    wx.available && now ? (
      <Chip className="tb-wx" title={`${place} now: ${Math.round(now.temp_c)} °C outside${wx.data?.summary ? `, ${wx.data.summary}` : ""}`}>
        <WxIcon size={15} weight="bold" />
        <span data-src={wx.sample ? "sample" : "weather/now/temp_c"} data-val={now.temp_c}>{Math.round(now.temp_c)} °C</span>
        <span className="t tb-wx-place">{place}</span>
        {worstWarn && (
          <span title={worstWarn.title} style={{ display: "inline-flex", color: worstWarn.level === "red" ? "var(--sh-red)" : "var(--sh-orange)" }}>
            <Warning size={14} weight="fill" />
          </span>
        )}
      </Chip>
    ) : (
      <Chip className="tb-wx" title="The weather service is not answering; the city keeps running on its last scenario">
        <Cloud size={15} />
        <span className="t">{wx.checking ? "Weather…" : "Weather offline"}</span>
      </Chip>
    );
  const errLine = err && (
    <div className="tb-err" role="alert">
      <Warning size={14} weight="fill" style={{ flex: "none" }} />
      <span title={err}>{err}</span>
      <button type="button" aria-label="Dismiss" onClick={() => setErr(null)}><X size={12} weight="bold" /></button>
    </div>
  );
  const help = () => window.dispatchEvent(new CustomEvent("gz-help"));
  const flip = () => setTheme(theme === "dark" ? "light" : "dark");

  // Phones: only the heartbeat and a Menu button; everything else is in the Menu sheet.
  if (phone)
    return (
      <header className="tb is-phone" data-chrome>
        {heartbeat}
        <span className="tb-spacer" />
        <button type="button" className="tb-menu" aria-haspopup="dialog" aria-expanded={menu} onClick={() => setMenu(true)}>
          <List size={17} weight="bold" />
          Menu
        </button>
        {errLine}
        <Sheet open={menu} title="Menu" onClose={() => setMenu(false)}>
          <div className="sheet-sec">
            <h3 className="sheet-cap">Scenario</h3>
            {scenarioSeg}
          </div>
          <div className="sheet-sec">
            <h3 className="sheet-cap">Autopilot</h3>
            {modeSeg}
          </div>
          <div className="sheet-chips">
            {signedChip}
            {weatherChip}
          </div>
          <div className="sheet-list">
            <button type="button" className="sheet-row" onClick={() => { setMenu(false); help(); }}>
              <Question size={20} />
              <span className="sheet-row-lbl">What is on this screen?</span>
            </button>
            <button type="button" className="sheet-row" onClick={flip}>
              {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
              <span className="sheet-row-lbl">{theme === "dark" ? "Light theme" : "Dark theme"}</span>
            </button>
          </div>
        </Sheet>
        <TapTip />
      </header>
    );

  return (
    <header className={`tb${compact ? " is-compact" : ""}`}>
      <div className="tb-grp">
        <span className="tb-cap tb-cap-opt">Scenario</span>
        {scenarioSeg}
      </div>
      {!compact && (
        <div className="tb-grp">
          <span className="tb-cap">Autopilot</span>
          {modeSeg}
        </div>
      )}
      <span className="tb-sep" />
      {heartbeat}
      {!compact && signedChip}
      {compact ? null : weatherChip}
      {errLine}
      <span className="tb-spacer" />
      <span className="tb-icons">
      <button
        type="button"
        className="ibtn"
        aria-label="What is on this screen?"
        title="What is on this screen? (key ?)"
        onClick={help}
      >
        <Question size={16} weight="bold" />
      </button>
      <button
        type="button"
        className="ibtn"
        aria-label={theme === "dark" ? "Switch to light" : "Switch to dark"}
        title={theme === "dark" ? "Light" : "Dark"}
        onClick={flip}
      >
        {theme === "dark" ? <Sun size={16} weight="bold" /> : <Moon size={16} weight="bold" />}
      </button>
      </span>
      <TapTip />
    </header>
  );
}

/** Phones and tablets have no hover: a tap on anything carrying data-tip shows its one-sentence explanation in a small
 *  bubble above (or below) it for a few seconds. Mouse users get the same sentence from the title attribute. */
function TapTip() {
  const [t, setT] = useState<{ text: string; x: number; y: number; below: boolean } | null>(null);
  useEffect(() => {
    let timer = 0;
    const onUp = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      const el = (e.target as HTMLElement | null)?.closest?.("[data-tip]") as HTMLElement | null;
      window.clearTimeout(timer);
      if (!el) return setT(null);
      const r = el.getBoundingClientRect();
      const below = r.top < 90;
      const half = Math.min(150, window.innerWidth / 2 - 8);
      setT({ text: el.dataset.tip ?? "", x: Math.max(half + 8, Math.min(window.innerWidth - half - 8, r.left + r.width / 2)), y: below ? r.bottom + 6 : r.top - 6, below });
      timer = window.setTimeout(() => setT(null), 4500);
    };
    const hide = () => setT(null);
    document.addEventListener("pointerup", onUp, true);
    window.addEventListener("scroll", hide, true);
    return () => {
      document.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("scroll", hide, true);
      window.clearTimeout(timer);
    };
  }, []);
  if (!t || !t.text) return null;
  return createPortal(
    <div className={`taptip${t.below ? " is-below" : ""}`} role="tooltip" style={{ left: t.x, top: t.y }}>
      {t.text}
    </div>,
    document.body,
  );
}

function Chip({ className = "", title, children }: { className?: string; title?: string; children: ReactNode }) {
  return (
    <div className={`chip ${className}`} title={title} data-tip={title}>
      {children}
    </div>
  );
}
