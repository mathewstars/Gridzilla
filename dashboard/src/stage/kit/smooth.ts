// Smooth chart lines the way Apple's charts draw them: monotone cubic through the points (Fritsch-Carlson), so the
// curve never overshoots a reading. Works in either x direction, which lets a filled band run back along its lower edge.

type Pt = [number, number];

const f = (n: number) => n.toFixed(1);

/** Path through `pts`; starts with M, or with L when `join` continues an existing path. */
export function smoothPath(raw: Pt[], join = false): string {
  const pts: Pt[] = [];
  for (const p of raw) if (!pts.length || Math.abs(p[0] - pts[pts.length - 1][0]) > 0.05) pts.push(p);
  const n = pts.length;
  if (!n) return "";
  const head = `${join ? "L" : "M"}${f(pts[0][0])},${f(pts[0][1])}`;
  if (n < 3) return head + pts.slice(1).map((p) => `L${f(p[0])},${f(p[1])}`).join("");
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1][0] - pts[i][0];
    m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i];
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) t[i] = 0;
    else t[i] = (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]);
  }
  t[n - 1] = m[n - 2];
  let d = head;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const h = dx[i] / 3;
    d += `C${f(x0 + h)},${f(y0 + t[i] * h)},${f(x1 - h)},${f(y1 - t[i + 1] * h)},${f(x1)},${f(y1)}`;
  }
  return d;
}

/** Closed band between an upper and a lower edge sampled at the same x positions. */
export function smoothBand(top: Pt[], bottom: Pt[]): string {
  if (top.length < 2) return "";
  return smoothPath(top) + smoothPath([...bottom].reverse(), true) + "Z";
}
