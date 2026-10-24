// N: the presenter notes for the slide on screen, a white sheet at the bottom of the window (real px), at most 40 %
// of the height, scrolling when long. Lines come from src/pitch/script.ts.
import { NOTES } from "../script";
import { SLIDES } from "../slides";

export default function Notes({ i, step, lift }: { i: number; step: number; lift: boolean }) {
  const n = NOTES[i];
  const d = SLIDES[i];
  if (!n || !d) return null;
  return (
    <aside className={`p-notes${lift ? " is-lifted" : ""}`} aria-label="Presenter notes">
      <div className="p-notes-head">
        <span className="p-notes-title">
          {i + 1}. {d.title}
          {d.steps > 1 ? <span className="p-notes-step">, step {step + 1} of {d.steps}</span> : null}
        </span>
        <span className="p-notes-meta">
          {n.who}, {n.time}
        </span>
      </div>
      <ul className="p-notes-lines">
        {n.lines.map((l, k) => (
          <li key={k}>{l}</li>
        ))}
      </ul>
      {n.keys ? <p className="p-notes-keys">{n.keys}</p> : null}
    </aside>
  );
}
