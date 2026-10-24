// T: the small elapsed timer in the bottom-right corner of the window (real px, not on the canvas).
// Elapsed time from the first Space on slide 1, then quietly how far off the run of show it is for the slide on
// screen: "-0:04" ahead of its beat, "+0:06" past it, "on time" inside it. The tile tints orange when more than 10 s
// behind and red past the 4:20 hard stop. Text stays ink.
import { useEffect, useState } from "react";
import { END_AT, SLIDES } from "../slides";

const fmt = (s: number) => {
  const t = Math.floor(Math.max(0, s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

export default function Timer({ t0, i }: { t0: number | null; i: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (t0 == null) return;
    const id = window.setInterval(() => tick((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, [t0]);

  const e = t0 == null ? 0 : (performance.now() - t0) / 1000;
  const at = SLIDES[i].at;
  const next = SLIDES[i + 1]?.at ?? END_AT;
  const delta = t0 == null ? 0 : e < at ? e - at : e > next ? e - next : 0;
  const tone = e > END_AT ? " is-late" : delta > 10 ? " is-behind" : "";
  const off = t0 == null ? "not started" : Math.abs(delta) < 1 ? "on time" : delta > 0 ? `+${fmt(delta)}` : `−${fmt(-delta)}`;

  return (
    <div className={`p-timer${tone}`} role="timer" aria-label="Elapsed time">
      <span className="p-timer-main">{fmt(e)}</span>
      <span className="p-timer-off">{off}</span>
    </div>
  );
}
