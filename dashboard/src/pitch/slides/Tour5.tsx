// The demo slide's (slide 6) walkthrough as a spotlight: a 70 % black scrim over the console's live Operations view
// with one rounded, feathered cut-out exactly around the area being talked about, and a caption card (heading + one
// line) beside it. No rings, no borders. Each Right MORPHS the cut-out (x, y, size, corner radius) and slides the card
// with it in 250 ms (ease-out), driven by one requestAnimationFrame tween that writes straight to the SVG mask and the
// card's transform (no React re-render per frame). The cut-out's corners follow the panel's own border-radius
// (getComputedStyle; the inner blocks have none, so the nearest rounded ancestor's). Five stops, anchored on the
// Operations view's own parts: Saved tonight (.op2-tonight), the Vienna chart (.op2-curve), What the AI did
// (.op2-tiles), the Blatnica card (.blat), the city chips (.bc-chips).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import "./tour5.css";

interface Stop {
  /** The card's heading (2-4 words). */
  head: string;
  /** [selector, caption, heading if this anchor needs its own] tried in order. */
  try: [string, string, string?][];
  /** Shown as a caption card alone (bottom centre) when no anchor is on screen. */
  alone?: string;
}

export const TOUR: Stop[] = [
  {
    head: "Saved tonight",
    try: [[".op2-tonight", "What Gridzilla saved tonight, across the whole city, and what it did to get there."]],
  },
  {
    head: "All of Vienna, live",
    try: [[".op2-curve", "All 72 transformers added up: with Gridzilla against without, the limit, and the peak it eats."]],
  },
  {
    head: "What the AI did",
    try: [[".op2-tiles", "DeepSeek, self-hosted on our own NVIDIA DGX Spark, proposes · a thirty-line guard disposes · a rule-based fallback when the model is slow or down"]],
  },
  {
    head: "Our family home",
    try: [[".blat", "Blatnica, real and live: the battery, the car charger and the heat pump, following the same signed messages."]],
  },
  {
    head: "Any street, one tap",
    try: [[".bc-chips", "Every substation, feeder and street transformer: the colour is how close each one is to its limit."]],
  },
];

type Box = { l: number; t: number; w: number; h: number };
/** What the overlay points at: the area (null = caption alone), its corner radius and the card's words. */
type Hit = { box: Box | null; r: number; head: string; caption: string };
/** One frame of the spotlight: the cut-out (x, y, w, h, radius, a = how open it is) and the card's top-left. */
type Geo = { x: number; y: number; w: number; h: number; r: number; a: number; cx: number; cy: number };

const MORPH_MS = 250;
const PAD = 6; // the cut-out sits this far outside the panel, so the 8 px feather never darkens its edge
const GAP = 20; // between the cut-out and the card
const EDGE = 16; // the card keeps this far from the window edges

function find(root: HTMLElement | null, stop: Stop) {
  if (!root) return null;
  for (const [sel, caption, head] of stop.try) {
    const el = root.querySelector<HTMLElement>(sel);
    if (el && el.getBoundingClientRect().width > 0) return { el, caption, head: head ?? stop.head };
  }
  return null;
}

/** The panel's own corner radius; the demo's inner blocks have none, so the nearest rounded ancestor's (max 4 up). */
function radiusOf(el: HTMLElement, root: HTMLElement) {
  let x: HTMLElement | null = el;
  for (let i = 0; x && i < 5 && x !== root; i++, x = x.parentElement) {
    const v = getComputedStyle(x).borderTopLeftRadius;
    const n = parseFloat(v);
    if (n > 0) {
      if (!v.includes("%")) return n;
      const b = x.getBoundingClientRect();
      return (n / 100) * Math.min(b.width, b.height);
    }
  }
  return 18;
}

const reduced = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const lerp = (a: Geo, b: Geo, k: number): Geo => ({
  x: a.x + (b.x - a.x) * k,
  y: a.y + (b.y - a.y) * k,
  w: a.w + (b.w - a.w) * k,
  h: a.h + (b.h - a.h) * k,
  r: a.r + (b.r - a.r) * k,
  a: a.a + (b.a - a.a) * k,
  cx: a.cx + (b.cx - a.cx) * k,
  cy: a.cy + (b.cy - a.cy) * k,
});
const cardWidth = (W: number) => Math.round(Math.min(520, Math.max(320, W * 0.25), W - 2 * EDGE));

export default function Tour5({ step, root, frame }: { step: number; root: HTMLElement | null; frame?: HTMLIFrameElement | null }) {
  const stop = TOUR[step - 1];
  const [hit, setHit] = useState<Hit | null>(null);
  const [W, setW] = useState(() => window.innerWidth);
  const hole = useRef<SVGRectElement>(null);
  const card = useRef<HTMLDivElement>(null);
  // Jump instead of morph when the change came from a resize or a scroll (the panel moved, not the story).
  const snap = useRef(false);
  const anim = useRef<{ cur: Geo | null; from: Geo | null; to: Geo | null; t0: number; raf: number }>({ cur: null, from: null, to: null, t0: 0, raf: 0 });

  // Write one frame straight to the DOM: the mask's cut-out and the card's position.
  const paint = (g: Geo) => {
    const r = hole.current;
    if (r) {
      const rad = Math.max(0, Math.min(g.r, g.w / 2, g.h / 2));
      r.setAttribute("x", g.x.toFixed(2));
      r.setAttribute("y", g.y.toFixed(2));
      r.setAttribute("width", Math.max(0, g.w).toFixed(2));
      r.setAttribute("height", Math.max(0, g.h).toFixed(2));
      r.setAttribute("rx", rad.toFixed(2));
      r.setAttribute("ry", rad.toFixed(2));
      r.setAttribute("fill-opacity", g.a.toFixed(3));
    }
    const c = card.current;
    if (c) c.style.transform = `translate3d(${g.cx.toFixed(2)}px, ${g.cy.toFixed(2)}px, 0)`;
  };

  const tick = (now: number) => {
    const s = anim.current;
    if (!s.from || !s.to) return;
    const k = Math.min(1, (now - s.t0) / MORPH_MS);
    s.cur = lerp(s.from, s.to, 1 - Math.pow(1 - k, 3)); // ease-out
    paint(s.cur);
    s.raf = k < 1 ? requestAnimationFrame(tick) : 0;
  };

  const go = (to: Geo, instant: boolean) => {
    const s = anim.current;
    const same = (a: Geo | null) => !!a && (Object.keys(to) as (keyof Geo)[]).every((k) => Math.abs(a[k] - to[k]) < 0.5);
    if (!instant && same(s.to)) return;
    // A closed cut-out (after step 7) opens where it lands instead of flying in from where it was.
    if (s.cur && s.cur.a < 0.01 && to.a > 0) s.cur = { ...s.cur, x: to.x, y: to.y, w: to.w, h: to.h, r: to.r };
    if (!s.cur || instant || reduced()) {
      if (s.raf) cancelAnimationFrame(s.raf);
      s.raf = 0;
      s.cur = s.to = to;
      paint(to);
      return;
    }
    s.from = s.cur;
    s.to = to;
    s.t0 = performance.now();
    if (!s.raf) s.raf = requestAnimationFrame(tick);
  };

  useEffect(
    () => () => {
      if (anim.current.raf) cancelAnimationFrame(anim.current.raf);
    },
    [],
  );

  // Follow the area: bring it into view once per step (the demo scrolls on short windows), then measure again a few
  // times a second, because the live demo re-renders on every poll.
  useLayoutEffect(() => {
    if (!stop) {
      setHit(null);
      return;
    }
    const first = find(root, stop);
    first?.el.scrollIntoView({ block: "nearest", inline: "nearest" });
    const measure = (jump = false) => {
      snap.current = jump;
      setW(window.innerWidth);
      const f = find(root, stop);
      if (!f || !root) {
        const alone = stop.alone;
        return setHit((h) => (!alone ? null : h && !h.box && h.caption === alone ? h : { box: null, r: 0, head: stop.head, caption: alone }));
      }
      // In the slide 6 frame the area is measured in the iframe's 1920x1080 px: map it to the window (offset + scale).
      const raw = f.el.getBoundingClientRect();
      const fr = frame?.getBoundingClientRect();
      const k = fr && frame ? fr.width / frame.offsetWidth : 1;
      const b = fr ? { left: fr.left + raw.left * k, top: fr.top + raw.top * k, width: raw.width * k, height: raw.height * k } : raw;
      const r = radiusOf(f.el, root) * k;
      setHit((h) =>
        h && h.box && h.caption === f.caption && h.head === f.head && Math.abs(h.r - r) < 0.5 && Math.abs(h.box.l - b.left) < 1 && Math.abs(h.box.t - b.top) < 1 && Math.abs(h.box.w - b.width) < 1 && Math.abs(h.box.h - b.height) < 1
          ? h
          : { box: { l: b.left, t: b.top, w: b.width, h: b.height }, r, head: f.head, caption: f.caption },
      );
    };
    measure();
    const id = window.setInterval(() => measure(), 250);
    const jump = () => measure(true);
    window.addEventListener("resize", jump);
    window.addEventListener("scroll", jump, true);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", jump);
      window.removeEventListener("scroll", jump, true);
    };
  }, [stop, root, frame]);

  // Where the cut-out and the card go for this hit (the card is rendered with its new words first, so its height is
  // real): the card beside the cut-out, right, else left, else below, else above; always fully inside the window.
  useLayoutEffect(() => {
    const c = card.current;
    if (!hit || !c) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cw = c.offsetWidth;
    const ch = c.offsetHeight;
    const clampX = (x: number) => Math.min(Math.max(EDGE, x), vw - cw - EDGE);
    const clampY = (y: number) => Math.min(Math.max(EDGE, y), vh - ch - EDGE);
    let to: Geo;
    if (!hit.box) {
      const last = anim.current.to;
      to = { ...(last ?? { x: vw / 2, y: vh / 2, w: 0, h: 0, r: 0 }), a: 0, cx: (vw - cw) / 2, cy: clampY(vh - ch - Math.max(32, vh * 0.07)) };
    } else {
      const x = hit.box.l - PAD;
      const y = hit.box.t - PAD;
      const w = hit.box.w + 2 * PAD;
      const h = hit.box.h + 2 * PAD;
      let cx: number;
      let cy: number;
      if (x + w + GAP + cw <= vw - EDGE) {
        cx = x + w + GAP;
        cy = y;
      } else if (x - GAP - cw >= EDGE) {
        cx = x - GAP - cw;
        cy = y;
      } else {
        cx = x + (w - cw) / 2;
        cy = y + h + GAP + ch <= vh - EDGE ? y + h + GAP : y - GAP - ch;
      }
      to = { x, y, w, h, r: hit.r + PAD, a: 1, cx: clampX(cx), cy: clampY(cy) };
    }
    go(to, snap.current);
  }, [hit, W]);

  if (!stop || !hit) return null;
  return (
    <div className="t5" aria-live="polite">
      <svg className="t5-scrim" width="100%" height="100%" aria-hidden="true">
        <defs>
          <filter id="t5-feather" x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation="4" />
          </filter>
          <mask id="t5-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
            <rect width="100%" height="100%" fill="#fff" />
            <rect ref={hole} fill="#000" fillOpacity={0} filter="url(#t5-feather)" />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="#000" fillOpacity={0.7} mask="url(#t5-mask)" />
      </svg>
      <div ref={card} className="t5-card" style={{ width: cardWidth(W) }}>
        <div key={step} className="t5-body">
          <p className="t5-step">
            {step} of {TOUR.length}
          </p>
          <h3 className="t5-head">{hit.head}</h3>
          <p className="t5-text">{hit.caption}</p>
        </div>
      </div>
    </div>
  );
}
