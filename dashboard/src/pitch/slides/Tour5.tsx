// Slide 5's walkthrough: each Right lights one area of the live demo with a crisp outline and a one-line caption the
// presenter talks over. The rest stays readable (dimmed 15 %, no blur). Anchors, tried in order: #gz-tour-* ids (if
// the console adds them), DemoView's own parts (.demo-curve, .demo-ring, .gz-steps, .demo-sigs, .demo-city, .fstrip),
// then the presentation stage's (if slide 5 ever shows the stage again). The Pause lives on dad's board, not in the
// demo, so step 7 is a caption alone. Captions in the run of show's plain words (firstmate data/gz-ui/pitch-script.md).
import { useEffect, useLayoutEffect, useState } from "react";
import "./tour5.css";

interface Stop {
  /** [selector, caption] tried in order. */
  try: [string, string][];
  /** Shown as a caption card alone (bottom centre) when no anchor is on screen. */
  alone?: string;
}

export const TOUR: Stop[] = [
  {
    try: [
      ["#gz-tour-curve", "This street tonight, live: with Gridzilla against without, the limit, tonight's plan, and the peak it eats."],
      [".demo-curve", "This street tonight, live: with Gridzilla against without, the limit, tonight's plan, and the peak it eats."],
      ['[data-card="curve"]', "This street tonight, live: with Gridzilla against without, the limit, tonight's plan, and the peak it eats."],
    ],
  },
  {
    try: [
      ["#gz-tour-ring", "How full this transformer is right now, against its limit."],
      [".demo-ring", "How full this transformer is right now, against its limit."],
      [".gzH-ring", "How full this transformer is right now, against its limit."],
    ],
  },
  {
    try: [
      ["#gz-tour-ai", "The AI saw the peak coming and wrote the message in about a second. The rules checked it, the platform signed it and sent it."],
      [".demo-now .gz-steps", "Sees, thinks, checks, acts: the AI wrote the message in about a second, the rules checked it, the platform signed and sent it."],
      ['[data-card="ai"]', "The AI saw the peak coming and wrote the message in about a second. The rules checked it, the platform signed it and sent it."],
    ],
  },
  {
    try: [
      ["#gz-tour-signals", "A limit for a limited time: every message runs out by itself, then the owners decide again."],
      [".demo-sigs", "Signals running, each with its countdown: a limit for a limited time, then the owners decide again."],
      [".gzF > :nth-child(1)", "A limit for a limited time: every message runs out by itself, then the owners decide again."],
    ],
  },
  {
    try: [
      ["#gz-tour-city", "The whole city: 72 transformers, the colour is how close each one is to its limit."],
      [".demo-city", "The whole city: 72 transformers, the colour is how close each one is to its limit."],
      ['[data-card="street"]', "One street: every home here follows the plan, and nobody gets cut off."],
    ],
  },
  {
    try: [
      ["#gz-tour-feed", "What just happened: signed messages out, signed replies back from the houses."],
      [".fstrip", "What just happened: signed messages out, signed replies back from the houses."],
      [".gzF > :nth-child(5)", "Any maker of the box can join: every message is signed, every reply comes back signed and checked."],
    ],
  },
  {
    try: [
      ["#gz-tour-heartbeat", "Pause: the operator goes dark. Every house is back to owner mode within two minutes."],
      [".gzF > :nth-child(2)", "The owner always wins: if the operator goes dark, every house is back to owner mode within two minutes."],
    ],
    alone: "Now the operator goes dark (Peter pauses it on the board). Every house is back to owner mode within two minutes.",
  },
];

type Box = { l: number; t: number; w: number; h: number };

function find(root: HTMLElement | null, stop: Stop) {
  if (!root) return null;
  for (const [sel, caption] of stop.try) {
    const el = root.querySelector<HTMLElement>(sel);
    if (el && el.getBoundingClientRect().width > 0) return { el, caption };
  }
  return null;
}

export default function Tour5({ step, root }: { step: number; root: HTMLElement | null }) {
  const stop = TOUR[step - 1];
  const [hit, setHit] = useState<{ box: Box; caption: string } | null>(null);

  // Bring the area into view once per step (the demo scrolls on short windows).
  useEffect(() => {
    const f = stop ? find(root, stop) : null;
    f?.el.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [stop, root]);

  // Follow the area: the live demo re-renders on every poll, so measure again a few times a second.
  useLayoutEffect(() => {
    if (!stop) {
      setHit(null);
      return;
    }
    const measure = () => {
      const f = find(root, stop);
      if (!f) return setHit(stop.alone ? { box: { l: 0, t: 0, w: 0, h: 0 }, caption: stop.alone } : null);
      const r = f.el.getBoundingClientRect();
      setHit((h) =>
        h && h.caption === f.caption && Math.abs(h.box.l - r.left) < 1 && Math.abs(h.box.t - r.top) < 1 && Math.abs(h.box.w - r.width) < 1 && Math.abs(h.box.h - r.height) < 1
          ? h
          : { box: { l: r.left, t: r.top, w: r.width, h: r.height }, caption: f.caption },
      );
    };
    measure();
    const id = window.setInterval(measure, 250);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", measure);
    };
  }, [stop, root]);

  if (!stop || !hit) return null;
  if (hit.box.w === 0) {
    // No area to point at: the caption alone, bottom centre.
    const cw = Math.min(640, window.innerWidth * 0.5);
    return (
      <div className="t5" aria-live="polite">
        <div className="t5-card" style={{ left: (window.innerWidth - cw) / 2, top: window.innerHeight - 200, width: cw }}>
          <p className="t5-text">{hit.caption}</p>
          <p className="t5-step">
            {step} of {TOUR.length}
          </p>
        </div>
      </div>
    );
  }
  const pad = 8;
  const { l, t, w, h } = hit.box;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const cw = Math.min(460, W * 0.34);
  // The caption sits beside the area where there is room: right, left, below, above; always on screen.
  let cl: number;
  let ct: number;
  if (l + w + pad + 20 + cw <= W - 16) {
    cl = l + w + pad + 20;
    ct = t;
  } else if (l - pad - 20 - cw >= 16) {
    cl = l - pad - 20 - cw;
    ct = t;
  } else {
    cl = Math.min(Math.max(16, l), W - cw - 16);
    ct = t + h + pad + 20 + 160 <= H ? t + h + pad + 20 : Math.max(16, t - pad - 20 - 160);
  }
  ct = Math.min(Math.max(16, ct), H - 176);
  return (
    <div className="t5" aria-live="polite">
      <div className="t5-ring" style={{ left: l - pad, top: t - pad, width: w + 2 * pad, height: h + 2 * pad }} />
      <div className="t5-card" style={{ left: cl, top: ct, width: cw }}>
        <p className="t5-text">{hit.caption}</p>
        <p className="t5-step">
          {step} of {TOUR.length}
        </p>
      </div>
    </div>
  );
}
