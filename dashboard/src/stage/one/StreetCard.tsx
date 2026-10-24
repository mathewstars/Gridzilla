// The living street as a small card (design/STAGE.md section 9): the transformer's street in 3D as context, its name
// and the "each home stands for 8" footnote in a column on the left, a small key along the bottom. The camera frames the
// street in the space the words leave free. Only data moves: no camera sway; lots turn green and pulse in cohort waves
// when real readings show homes joining. The canvas stops drawing off-screen and in a hidden tab.
// Props: { st } from useStory(). The shell's card (gzS-street) supplies the size, the radius and the clip.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { StreetScene } from "../../components/street/StreetScene";
import { cohortSignal } from "../../components/street/cohort";
import type { Pad } from "../../components/street/Living3D";
import { nice } from "../../model";
import type { StoryState } from "../useStory";
import "./street.css";

const GAP = 12; // air between the words and the street, px

type Mode = "side" | "stack";

/** How the words sit: a name column beside the street on a wide card, the name above it on a squarer one (with some
 *  give either way so a card on the edge does not flip back and forth). Then the canvas edges the words cover. */
function usePad() {
  const root = useRef<HTMLDivElement>(null);
  const name = useRef<HTMLDivElement>(null);
  const key = useRef<HTMLUListElement>(null);
  const [mode, setMode] = useState<Mode>("side");
  const [pad, setPad] = useState<Pad>({ l: 0, r: 0, t: 0, b: 0 });
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => {
      const n = name.current,
        k = key.current;
      const aspect = el.clientWidth / Math.max(1, el.clientHeight);
      const m: Mode = el.dataset.mode === "stack" ? (aspect > 1.55 ? "side" : "stack") : aspect < 1.4 ? "stack" : "side";
      if (m !== el.dataset.mode) {
        setMode(m); // the words move; the effect runs again with the new mode and measures then
        return;
      }
      const l = n && m === "side" ? Math.round(n.offsetLeft + n.offsetWidth + GAP) : 0;
      const t = n && m === "stack" ? Math.round(n.offsetTop + n.offsetHeight + GAP) : 0;
      const b = k && k.offsetHeight > 0 ? Math.round(el.clientHeight - k.offsetTop + GAP) : 0;
      setPad((p) => (p.l === l && p.t === t && p.b === b ? p : { l, r: 0, t, b }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    [el, name.current, key.current].forEach((x) => x && ro.observe(x));
    return () => ro.disconnect();
  }, [mode]);
  return { root, name, key, pad, mode };
}

export default function StreetCard({ st }: { st: StoryState }) {
  const { s, tf, feeder, weather } = st;
  const { root, name, key, pad, mode } = usePad();
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
    <div ref={root} className="gzs" data-mode={mode}>
      <div ref={scene} className="gzs-scene" role="img" aria-label={label}>
        {ready && <StreetScene s={s!} weather={weather} feeder={feeder} tf={tf} interactive={false} sway={false} pad={pad} paper />}
      </div>
      <div ref={name} className="gzs-name">
        <h3 className="gzs-title">{ready ? `${nice(tf)} street` : "The street"}</h3>
        {!ready ? (
          <p className="gzs-sub gzs-wait">Waiting for the street</p>
        ) : (
          <>
            {per != null && (
              <p className="gzs-sub">
                Each simulated home stands for{" "}
                <b data-src="derived" data-from="state/summary/houses / state/summary/households" data-val={per}>
                  {Math.round(per)}
                </b>{" "}
                real ones
              </p>
            )}
            {wave && (
              <p className="gzs-sub">
                Homes join in{" "}
                <b data-src={`state/active/${wave.seg}/cohort/1`} data-val={wave.n}>
                  {wave.n}
                </b>{" "}
                waves
              </p>
            )}
          </>
        )}
      </div>
      <ul ref={key} className="gzs-key" aria-label="Key">
        <li>
          <i className="gzs-sw gzs-sw-lot" aria-hidden />
          Follows Gridzilla
        </li>
        <li>
          <i className="gzs-sw gzs-sw-in" aria-hidden />
          Power in
        </li>
        <li>
          <i className="gzs-sw gzs-sw-back" aria-hidden />
          Power back
        </li>
      </ul>
    </div>
  );
}
