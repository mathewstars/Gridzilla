// The ONE Gridzilla stage (design/STAGE.md). The shell: calls useStory() once, draws the frosted top bar and lays the
// parts out in named grid areas for the three size classes (one/stage.css). Each part gets { st } and fills its card.
// Nothing here is clickable: presenter keys live in useStory.
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { State, Weather } from "../api";
import { allTfs } from "../model";
import { P } from "./palette";
import { useStory, type StoryState } from "./useStory";
import Hero from "./one/Hero";
import HeroCurve from "./one/HeroCurve";
import Facts from "./one/Facts";
import AiCard from "./one/AiCard";
import StreetCard from "./one/StreetCard";
import PlanCard from "./one/PlanCard";
import "./one/stage.css";

const EASE = [0.25, 0.1, 0.3, 1] as const;

// ------------------------------------------------------------------ grid clock

/** Grid time in whole minutes (0..1439), ticking between polls at the simulator's speed and re-anchored on every poll.
 *  It never steps back a few minutes when a poll lands slightly behind; a scenario jump moves it at once. */
function useGridClock(s: State | null) {
  const anchor = useRef<{ h: number; t: number; rate: number } | null>(null);
  const shown = useRef<number | null>(null);
  const [min, setMin] = useState<number | null>(null);

  useEffect(() => {
    if (!s || !Number.isFinite(s.sim_hour)) return;
    const prev = anchor.current;
    // Two polls with the same grid hour: the simulator is paused, so the clock stands still too.
    const paused = prev != null && Math.abs(s.sim_hour - prev.h) < 1e-6;
    anchor.current = { h: s.sim_hour, t: performance.now(), rate: paused ? 0 : s.autopilot?.sim_x || 1 };
  }, [s]);

  useEffect(() => {
    const tick = () => {
      const a = anchor.current;
      if (!a) return;
      // Extrapolate at most 8 real seconds: if polls stop, the clock stops instead of running away.
      const dt = Math.min(performance.now() - a.t, 8000);
      const h = a.h + (dt / 3_600_000) * a.rate;
      const m = (((Math.round(h * 60) % 1440) + 1440) % 1440);
      const cur = shown.current;
      if (cur != null) {
        const back = (((cur - m) % 1440) + 1440) % 1440;
        if (back > 0 && back <= 5) return; // a poll slightly behind the ticking clock: hold, never tick backwards
      }
      if (m !== cur) {
        shown.current = m;
        setMin(m);
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, []);

  return min;
}

const hhmmMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Text whose changed characters roll in (Animate Digits idea, 21st.dev id 20071): each character is its own span keyed
 *  by position and value, so only a changed digit re-mounts and slides up inside its own clipped slot (never drawn
 *  below the baseline). With `roll` false (the grid clock runs faster than a minute per 5 real seconds) the digits
 *  swap in place, so the clock never jitters on a projector. */
function Rolling({ text, roll }: { text: string; roll: boolean }) {
  const still = useReducedMotion() || !roll;
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);
  return (
    <>
      {[...text].map((ch, i) =>
        still ? (
          <span key={i} aria-hidden>
            {ch}
          </span>
        ) : (
          <span key={i} aria-hidden className="gzS-dig">
            <motion.span
              key={ch}
              className="inline-block"
              initial={mounted.current ? { y: "100%" } : false}
              animate={{ y: 0 }}
              transition={{ duration: 0.25, ease: EASE }}
            >
              {ch}
            </motion.span>
          </span>
        ),
      )}
    </>
  );
}

// ------------------------------------------------------------------ top bar words

/** The scenario in plain words, always shown, worded to fit the grid clock: the scenarios scale load or sun all day
 *  (platform SCENARIOS), so "Cold evening" never sits next to an 11:18 clock nor "Sunny noon" next to 23:58. */
function scenarioWord(name: string | undefined, h: number) {
  const hr = ((h % 24) + 24) % 24;
  if (name === "cold-evening") return hr >= 16 || hr < 1 ? "Cold evening" : hr < 6 ? "Cold night" : "Cold day";
  if (name === "sunny-noon") return hr >= 10 && hr < 15 ? "Sunny noon" : hr >= 6 && hr < 20 ? "Sunny day" : "Sunny scenario";
  if (name === "normal") return "Normal day";
  if (name === "live-weather") return "Live weather";
  return name ? name.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()) : null;
}

/** The weather the grid runs on right now: the grid_view hour that matches the grid clock (platform weather.py). */
function gridWeather(w: Weather | null, simHour: number) {
  const gv = w?.grid_view ?? [];
  const h = Math.floor(((simHour % 24) + 24) % 24);
  const i = gv.findIndex((g) => g && Math.round(g.h) % 24 === h && Number.isFinite(g.temp_c));
  if (i < 0) return null;
  const g = gv[i];
  const word = g.cloud_pct >= 70 ? "Cloudy" : g.cloud_pct >= 30 ? "Partly cloudy" : g.sun_wm2 > 50 ? "Sunny" : "Clear";
  return { i, temp: g.temp_c, word };
}

/** One live status sentence about who is steering. Orange only while a decision waits for a person. */
function statusLine(st: StoryState): { text: string; tone: string } {
  const ap = st.s?.autopilot;
  if (st.error) return { text: "Reconnecting, last data shown", tone: P.tertiary };
  if (!ap) return { text: "Waiting for the autopilot", tone: P.tertiary };
  if (ap.pending) return { text: "Waiting for operator", tone: P.orange };
  if (ap.mode === "off") return { text: "Autopilot off, a person is in charge", tone: P.secondary };
  if (ap.busy) {
    const doing: Record<string, string> = {
      sense: "Autopilot is reading the grid",
      deepseek: "Autopilot is thinking",
      guard: "Autopilot is checking the guard",
      send: "Autopilot is signing a signal",
    };
    if (doing[ap.stage]) return { text: doing[ap.stage], tone: P.ink };
  }
  if (ap.mode === "propose") return { text: "Autopilot on, a person approves", tone: P.secondary };
  return { text: "Autopilot on", tone: P.secondary };
}

function TopBar({ st }: { st: StoryState }) {
  const s = st.s as State;
  const min = useGridClock(s);
  const scen = scenarioWord(s.scenario?.name, s.sim_hour);
  const wx = gridWeather(st.weather.available ? st.weather.data : null, s.sim_hour);
  const status = statusLine(st);
  return (
    <header className="gzS-bar">
      <div className="gzS-brand min-w-0">Gridzilla</div>
      <div className="gzS-clock">
        {min != null && (
          <span className="gzS-time" data-src="state/sim_hour" aria-label={`Grid time ${hhmmMin(min)}`}>
            <Rolling text={hhmmMin(min)} roll={(s.autopilot?.sim_x || 1) <= 12} />
          </span>
        )}
        {scen && <span className="gzS-scen">{scen}</span>}
      </div>
      <div className="gzS-status min-w-0">
        {wx && (
          <span className="gzS-wx">
            <span data-src={`weather/grid_view/${wx.i}/temp_c`} data-val={String(wx.temp)}>
              {Math.round(wx.temp)}°
            </span>{" "}
            {wx.word}
          </span>
        )}
        <span style={{ color: status.tone }}>{status.text}</span>
      </div>
    </header>
  );
}

// ------------------------------------------------------------------ shell

/** Splash while there is nothing true to show. "Connecting to the grid" is the phrase the QA gate waits on. */
function Splash({ line, small }: { line: string; small?: string }) {
  return (
    <div className="gzS gzS-splash">
      <div className="gzS-splash-in">
        <p className="gzS-splash-brand">Gridzilla</p>
        <p className="gzS-splash-line">{line}</p>
        {small && <p className="gzS-splash-small">{small}</p>}
      </div>
    </div>
  );
}

/** One card in a named grid area. The card owns the surface, padding, radius and the size container; the part fills it. */
function Card({ area, children }: { area: string; children: ReactNode }) {
  return (
    <section className={`gzS-card gzS-${area}`} data-card={area}>
      {children}
    </section>
  );
}

export default function Stage() {
  const st = useStory();
  const { s, tf, story, error } = st;

  if (!s) {
    return error ? (
      <Splash line="The grid platform is not answering yet." small="Trying again every few seconds." />
    ) : (
      <Splash line="Connecting to the grid." />
    );
  }
  if (!tf || !story) {
    // The first transformer is picked on the poll after the first state; an empty grid says so plainly.
    return allTfs(s).length ? <Splash line="Connecting to the grid." /> : <Splash line="No transformers on this grid yet." />;
  }

  return (
    <div className="gzS">
      <TopBar st={st} />
      <main className="gzS-grid">
        <Card area="story">
          <Hero st={st} />
        </Card>
        <Card area="curve">
          <HeroCurve st={st} />
        </Card>
        <Card area="proof">
          <Facts st={st} />
        </Card>
        <Card area="ai">
          <AiCard st={st} />
        </Card>
        <Card area="street">
          <StreetCard st={st} />
        </Card>
        <Card area="plan">
          <PlanCard st={st} />
        </Card>
      </main>
    </div>
  );
}
