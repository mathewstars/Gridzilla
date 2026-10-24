// Small layout helpers for the stage kit: real text widths (canvas measureText in the page font), a box-size hook, and
// a greedy label placer. Labels are placed in priority order; each tries its candidate spots and takes the first one
// that stays inside the bounds and touches no label or marker already placed, else it is dropped. Nothing overlaps.
import { useEffect, useRef, useState } from "react";

let ctx: CanvasRenderingContext2D | null = null;
let family = "";
const cache = new Map<string, number>();

/** Width in px of `text` at `size` px and `weight`, in the page's own font. */
export function textW(text: string, size: number, weight = 400): number {
  if (typeof document === "undefined") return text.length * size * 0.56;
  if (!ctx) {
    ctx = document.createElement("canvas").getContext("2d");
    family = getComputedStyle(document.body).fontFamily || "system-ui, -apple-system, sans-serif";
  }
  if (!ctx) return text.length * size * 0.56;
  const key = `${weight}|${text}`;
  let w100 = cache.get(key);
  if (w100 == null) {
    ctx.font = `${weight} 100px ${family}`;
    // Tabular numerals are a touch wider than proportional ones; 3 % covers it.
    w100 = ctx.measureText(text).width * 1.03;
    if (cache.size > 4000) cache.clear();
    cache.set(key, w100);
  }
  return (w100 * size) / 100;
}

/** Content-box size of an element, kept fresh by a ResizeObserver. */
export function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [box, setBox] = useState({ w: 0, h: 0, rem: 16 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const w = Math.round(e.contentRect.width);
      const h = Math.round(e.contentRect.height);
      setBox((b) => (b.w === w && b.h === h && b.rem === rem ? b : { w, h, rem }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box] as const;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const hit = (a: Rect, b: Rect, gap = 0) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

/** A label to place: its text box size, and candidate top-left corners in order of preference. */
export interface LabelReq<K extends string = string> {
  id: K;
  w: number;
  h: number;
  spots: { x: number; y: number }[];
  /** Own area for this label (default: the shared bounds). */
  bounds?: Rect;
  /** Alternatives share a group: the first one placed wins, the rest are skipped (e.g. a long and a short wording). */
  group?: string;
}

/** Greedy placement in the order given. `bounds` keeps every label fully visible, `blocked` are markers to keep clear
 *  of. Returns the chosen box per id; a missing id was dropped. */
export function placeLabels<K extends string>(reqs: LabelReq<K>[], bounds: Rect, blocked: Rect[] = [], gap = 4) {
  const placed: Rect[] = [];
  const out = new Map<K, Rect>();
  const groups = new Set<string>();
  for (const r of reqs) {
    if (r.group && groups.has(r.group)) continue;
    const bd = r.bounds ?? bounds;
    for (const s of r.spots) {
      const box = { x: s.x, y: s.y, w: r.w, h: r.h };
      if (box.x < bd.x || box.y < bd.y || box.x + box.w > bd.x + bd.w || box.y + box.h > bd.y + bd.h) continue;
      if (box.x < bounds.x || box.y < bounds.y || box.x + box.w > bounds.x + bounds.w || box.y + box.h > bounds.y + bounds.h) continue;
      if (placed.some((p) => hit(p, box, gap)) || blocked.some((b) => hit(b, box, 1))) continue;
      placed.push(box);
      out.set(r.id, box);
      if (r.group) groups.add(r.group);
      break;
    }
  }
  return out;
}
