// Stage version of the street: only the living 3D render of one transformer's street, filling its parent, so the
// stage directions (A and B) can frame it themselves. No card, no list, no title. Plain-English tooltip on hover;
// a flat drawing when the machine has no WebGL. The 3D stops drawing while it is off-screen or the tab is hidden.
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { State, Weather, WeatherFeed } from "../../api";
import { feederOf } from "../../model";
import { cohortSignal } from "./cohort";
import { buildStreets } from "./layout";
import { cloudAt } from "./sky";
import type { Pad } from "./Living3D";
import type { HoverInfo } from "./Street3D";
import { hasWebGL, Street2D, Tooltip, useReducedMotion } from "./StreetPanel";

const Living3D = lazy(() => import("./Living3D"));

export interface StreetSceneProps {
  s: State;
  weather?: Weather | WeatherFeed | null;
  feeder?: string; // optional: found from the transformer when left out
  tf: string; // the hero transformer
  onSelect?: (tf: string) => void; // clicking the transformer
  interactive?: boolean; // false = no hover, no drag (pure projection)
  sway?: boolean; // slow camera sway (default on; the stage turns it off so only data moves)
  pad?: Pad; // canvas edges covered by text (px): the street is framed in the rest
  paper?: boolean; // sky closer to white, for a white card
  across?: boolean; // camera from the side: the street runs left to right across a wide card
}

/** True while the element is at least partly in the viewport and the tab is visible. */
export function useOnScreen(ref: RefObject<HTMLElement>) {
  const [inView, setInView] = useState(true);
  const [shown, setShown] = useState(() => typeof document === "undefined" || !document.hidden);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    // a little early, so the scene is already moving as it scrolls in
    const io = new IntersectionObserver((es) => setInView(es[es.length - 1].isIntersecting), { threshold: 0, rootMargin: "120px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  useEffect(() => {
    const f = () => setShown(!document.hidden);
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, []);
  return inView && shown;
}

export function StreetScene({ s, weather, feeder, tf, onSelect, interactive = true, sway = true, pad, paper, across }: StreetSceneProps) {
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const gl = useMemo(hasWebGL, []);
  const still = useReducedMotion();
  const fd = feeder || feederOf(s, tf);
  const streets = useMemo(() => buildStreets(s, fd, 0), [s, fd]);
  const st = streets.find((x) => x.tf === tf) ?? streets[0];
  // houses following the SHAPE flattening plan count as following Gridzilla too
  const shapeKeys = useMemo(() => new Set(Object.values(s.households ?? {}).filter((h) => h.telemetry?.shape).map((h) => h.id)), [s]);
  const otherKw = (s.aggregates[st?.tf ?? ""] as { other_kw?: number } | undefined)?.other_kw ?? 0;
  const cloud = cloudAt(weather, s.sim_hour);
  const waves = st ? cohortSignal(s, st.tf)?.n ?? null : null;

  const wrap = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const run = useOnScreen(wrap);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // keep a hovered tooltip live as new readings arrive
  const live =
    hover?.house && st
      ? { ...hover, house: st.houses.find((h) => h.house.key === hover.house!.key)?.house ?? hover.house }
      : hover?.street && st
        ? { ...hover, street: st }
        : hover;

  return (
    <div ref={wrap} className="relative h-full w-full min-h-0">
      {!st ? null : gl ? (
        <>
          {/* a still drawing of the street under the canvas: it shows until the 3D has drawn its first frame */}
          <StreetPoster pad={pad} />
          <Suspense fallback={null}>
            <div className="absolute inset-0">
              <Living3D st={st} shapeKeys={shapeKeys} otherKw={otherKw} hour={s.sim_hour} cloud={cloud} onHover={interactive ? setHover : () => {}} onSelect={onSelect} interactive={interactive} still={still} run={run} sway={sway} waves={waves} pad={pad} paper={paper} across={across} />
            </div>
          </Suspense>
        </>
      ) : (
        <Street2D streets={[st]} />
      )}
      {interactive && live && <Tooltip hover={live} s={s} feeder={fd} box={box} hint={onSelect ? "Click to show its curve" : ""} />}
    </div>
  );
}

/** A light line drawing of a street (two rows of houses along a road, the kiosk at its head), no data on it. */
function StreetPoster({ pad }: { pad?: Pad }) {
  const houses = [0, 1, 2, 3, 4, 5];
  return (
    <svg
      aria-hidden
      className="absolute"
      style={{ left: pad?.l ?? 0, right: pad?.r ?? 0, top: pad?.t ?? 0, bottom: pad?.b ?? 0, width: "auto", height: "auto" }}
      viewBox="0 0 200 90"
      preserveAspectRatio="xMidYMid meet"
    >
      <g transform="rotate(-8 100 45)">
        <rect x="28" y="40" width="160" height="10" rx="2" fill="#ededf0" />
        {[24, 58].map((y) =>
          houses.map((i) => (
            <g key={`${y}:${i}`} transform={`translate(${46 + i * 24} ${y})`}>
              <path d="M0 8 L9 0 L18 8 Z" fill="#d2d2d7" />
              <rect x="1.5" y="8" width="15" height="9" fill="#ececf0" />
            </g>
          )),
        )}
        <rect x="8" y="36" width="16" height="16" rx="1.5" fill="#34c759" opacity="0.85" />
      </g>
    </svg>
  );
}

export default StreetScene;
