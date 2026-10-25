// Esc: the slide overview, a light table of the seven slides. Each thumbnail is the slide itself at a small scale in
// its final state (freeze "end", last step); the live demo is a plain tile so the 3D stage is never mounted twice.
// The selected tile is ringed in blue (interactive). Arrow keys move (handled in Deck.tsx), Enter or click jumps.
import { SLIDES } from "../slides";

const W = 1920;
const H = 1080;
const PAD = 40;
const GAP = 28;
/** Room under each thumbnail for its label (two lines when the name wraps). */
const LABEL = 64;

/** The biggest thumbnails that fit the window, trying 4, 3 and 2 columns. Two rows of four read best as a light
 *  table, so fewer columns win only when they make the thumbnails clearly bigger. */
export function overviewLayout(winW: number, winH: number) {
  let best = { cols: 4, tw: 0 };
  for (const cols of [4, 3, 2]) {
    const rows = Math.ceil(SLIDES.length / cols);
    const byW = (winW - 2 * PAD - (cols - 1) * GAP) / cols;
    const byH = (((winH - 2 * PAD - (rows - 1) * GAP) / rows - LABEL) * W) / H;
    const tw = Math.floor(Math.max(80, Math.min(byW, byH)));
    if (tw > best.tw * 1.12) best = { cols, tw };
  }
  return best;
}

interface Props {
  sel: number;
  cur: number;
  winW: number;
  winH: number;
  onPick: (i: number) => void;
  onHover: (i: number) => void;
}

export default function Overview({ sel, cur, winW, winH, onPick, onHover }: Props) {
  const { cols, tw } = overviewLayout(winW, winH);
  const th = Math.round((tw * H) / W);
  const s = tw / W;
  return (
    <div className="p-over" role="dialog" aria-label="Slide overview">
      <div className="p-over-grid" style={{ gridTemplateColumns: `repeat(${cols}, ${tw}px)` }}>
        {SLIDES.map((d, i) => (
          <button
            key={d.id}
            type="button"
            tabIndex={-1}
            className={`p-over-item${i === sel ? " is-sel" : ""}`}
            onClick={() => onPick(i)}
            onMouseEnter={() => onHover(i)}
            aria-current={i === cur ? "page" : undefined}
          >
            <div className="p-thumb" style={{ width: tw, height: th }}>
              {d.fullBleed ? (
                <div className="p-thumb-live" style={{ fontSize: Math.max(18, Math.round(tw * 0.075)) }}>
                  {d.id === "trailer" ? "Trailer" : "Live demo"}
                </div>
              ) : (
                <div className="p-thumb-canvas" style={{ transform: `scale(${s})` }} aria-hidden>
                  <d.Component step={d.steps - 1} active freeze="end" jingle="ended" />
                </div>
              )}
            </div>
            <span className="p-over-label">
              <span className="p-over-name">
                {i + 1}. {d.title}
              </span>
              <span className="p-over-at">{i === cur ? "Now" : `${Math.floor(d.at / 60)}:${String(d.at % 60).padStart(2, "0")}`}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
