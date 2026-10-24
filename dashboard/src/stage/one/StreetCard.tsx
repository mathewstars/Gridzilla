// The living street as a card (design/STAGE.md section 9): the transformer's street in 3D, seen from the side so it runs
// left to right across the card's full width. The name and the "each house stands for 8" line sit above it, one plain
// line about the green lots and the dots below it; the camera frames the street in the band between them, so text
// never sits on a house. Only data moves: no camera sway; lots turn green and pulse in cohort waves when real readings
// show homes joining. The canvas keeps a still frame while off-screen and in a hidden tab, and draws again on new data.
// Props: { st } from useStory(). The shell's card (gzS-street) supplies the size, the radius and the clip.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { StreetScene } from "../../components/street/StreetScene";
import { cohortSignal } from "../../components/street/cohort";
import type { Pad } from "../../components/street/Living3D";
import { nice } from "../../model";
import type { StoryState } from "../useStory";
import "./street.css";

const GAP = 6; // air between the words and the street, px

/** The canvas edges the words cover: the header on top, the note along the bottom. */
function usePad() {
  const root = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const note = useRef<HTMLParagraphElement>(null);
  const [pad, setPad] = useState<Pad>({ l: 0, r: 0, t: 0, b: 0 });
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => {
      const h = head.current,
        n = note.current;
      const t = h ? Math.round(h.offsetTop + h.offsetHeight + GAP) : 0;
      const b = n && n.offsetHeight > 0 ? Math.round(el.clientHeight - n.offsetTop + GAP) : 0;
      setPad((p) => (p.t === t && p.b === b ? p : { l: 0, r: 0, t, b }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    [el, head.current, note.current].forEach((x) => x && ro.observe(x));
    return () => ro.disconnect();
  }, []);
  return { root, head, note, pad };
}

export default function StreetCard({ st }: { st: StoryState }) {
  const { s, tf, feeder, weather } = st;
  const { root, head, note, pad } = usePad();
  const scene = useRef<HTMLDivElement>(null);

  // a new transformer on stage: the street crossfades in (0.6 s), the words change in place
  const lastTf = useRef(tf);
  useEffect(() => {
    if (lastTf.current && tf && lastTf.current !== tf && !matchMedia("(prefers-reduced-motion: reduce)").matches)
      scene.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 600, easing: "cubic-bezier(.25,.1,.3,1)" });
    lastTf.current = tf;
  }, [tf]);

  const ready = !!s && !!tf && !!s.tree[tf];
  const sum = s?.summary;
  const per = sum && sum.households > 0 ? sum.houses / sum.households : null;
  const wave = ready ? cohortSignal(s!, tf) : null;
  const pct = ready ? s!.aggregates?.[tf]?.load_pct : null;
  const label = ready
    ? `The ${nice(tf)} street in 3D: green lots are homes following Gridzilla${pct != null ? `, the transformer kiosk is at ${Math.abs(pct)} % of its limit` : ""}.`
    : "The street, waiting for data";

  return (
    <div ref={root} className="gzs">
      <div ref={scene} className="gzs-scene" role="img" aria-label={label}>
        {ready && <StreetScene s={s!} weather={weather} feeder={feeder} tf={tf} interactive={false} sway={false} pad={pad} paper across />}
      </div>
      <div ref={head} className="gzs-head">
        <h3 className="gzs-title">{ready ? `${nice(tf)} street` : "The street"}</h3>
        {!ready ? (
          <p className="gzs-sub gzs-wait">Waiting for the street</p>
        ) : (
          per != null && (
            <p className="gzs-sub">
              Each house stands for{" "}
              <b data-src="derived" data-from="state/summary/houses / state/summary/households" data-val={per}>
                {Math.round(per)}
              </b>{" "}
              homes
            </p>
          )
        )}
      </div>
      {ready && (
        <p ref={note} className="gzs-note">
          Green lots follow Gridzilla
          {wave && (
            <>
              , joining in{" "}
              <b data-src={`state/active/${wave.seg}/cohort/1`} data-val={wave.n}>
                {wave.n}
              </b>{" "}
              waves
            </>
          )}
          . Dots are power on the wires.
        </p>
      )}
    </div>
  );
}
