// N: a small presenter aid at the bottom of the window, off by default and only ever toggled by N (no URL or stored
// state turns it on). One line for the step on screen (two lines at most), General Sans 18 px on a 60 % scrim; the
// slide number matches the script (0 trailer ... 7 close). A key badge says another beat follows on this slide.
import { NOTES } from "../script";
import { SLIDES } from "../slides";

export default function Notes({ i, step, lift }: { i: number; step: number; lift: boolean }) {
  const n = NOTES[i];
  const d = SLIDES[i];
  if (!n || !d) return null;
  const k = Math.min(step, n.steps.length - 1);
  const more = step < d.steps - 1;
  return (
    <aside className={`p-notes${lift ? " is-lifted" : ""}`} aria-label="Presenter notes">
      <span className="p-notes-where">
        {i} {d.title}
        {d.steps > 1 ? ` · ${step + 1}/${d.steps}` : ""} · {n.who}
      </span>
      <p className="p-notes-text">{n.steps[k]}</p>
      {more ? (
        <kbd className="p-notes-key" aria-label="Right: next beat on this slide">
          →
        </kbd>
      ) : null}
    </aside>
  );
}
