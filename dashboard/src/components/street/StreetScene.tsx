// Stage version of the street: only the living 3D render of one transformer's street, filling its parent, so the
// stage directions (A and B) can frame it themselves. No card, no list, no title. Plain-English tooltip on hover;
// a flat drawing when the machine has no WebGL.
import { lazy, Suspense, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { State, Weather, WeatherFeed } from "../../api";
import { feederOf } from "../../model";
import { buildStreets } from "./layout";
import { cloudAt } from "./sky";
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
}

export function StreetScene({ s, weather, feeder, tf, onSelect, interactive = true }: StreetSceneProps) {
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

  const wrap = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
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
        <Suspense fallback={null}>
          <div className="absolute inset-0">
            <Living3D st={st} shapeKeys={shapeKeys} otherKw={otherKw} hour={s.sim_hour} cloud={cloud} onHover={interactive ? setHover : () => {}} onSelect={onSelect} interactive={interactive} still={still} />
          </div>
        </Suspense>
      ) : (
        <Street2D streets={[st]} />
      )}
      {interactive && live && <Tooltip hover={live} s={s} feeder={fd} box={box} hint={onSelect ? "Click to show its curve" : ""} />}
    </div>
  );
}

export default StreetScene;
