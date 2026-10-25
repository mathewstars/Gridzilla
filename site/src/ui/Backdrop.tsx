// One light behind the whole page, the deck's way: a fixed layer under everything. A static CSS gradient in the same
// colours paints first (and is all there is under reduced motion); the WebGL mesh loads after first paint, when the
// browser is idle, and fades in over it. The shader pauses itself off screen and in a hidden tab. Under 768 px it is
// never mounted (the static gradient saves the phone's battery and keeps scrolling smooth).
import { Suspense, lazy, useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

const MeshLight = lazy(() => import("../bg/MeshLight"));

export default function Backdrop() {
  const reduce = useReducedMotion();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (reduce || !matchMedia("(min-width: 768px)").matches) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setReady(true), { timeout: 1500 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(() => setReady(true), 300);
    return () => window.clearTimeout(t);
  }, [reduce]);
  return (
    <div className="mesh-backdrop" aria-hidden="true">
      <div className="mesh-static" />
      {ready && !reduce && (
        <Suspense fallback={null}>
          <div className="mesh-canvas">
            <MeshLight />
          </div>
        </Suspense>
      )}
    </div>
  );
}
