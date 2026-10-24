// The pitch as a PDF: every slide at its last build step, 1920x1080, one slide per page.
// usage: node qa/pitch-pdf.mjs [--base http://localhost:5175/pitch.html] [--out ../platform/static/new/pitch.pdf]
//   Opens <base>?slide=N&step=last&freeze=end for each slide, waits 2.5 s (the live demo 10 s), screenshots it, then
//   prints the screenshots into one PDF with page size 1920x1080. Prints the output path and any console errors.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { arg, launch } from "./lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const base = String(arg("base", "http://localhost:5175/pitch.html"));
const out = path.resolve(String(arg("out", path.join(here, "../../platform/static/new/pitch.pdf"))));
const shotsDir = fs.mkdtempSync(path.join(os.tmpdir(), "gzpitch-pdf-"));

const browser = await launch();
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
let label = "";
page.on("console", (m) => {
  if ((m.type() === "error" || m.type() === "warning") && !/favicon|DevTools|GPU stall|GL Driver/i.test(m.text())) errors.push(`${label}: ${m.type()}: ${m.text().slice(0, 200)}`);
});
page.on("pageerror", (e) => errors.push(`${label}: pageerror: ${String(e).slice(0, 200)}`));

// The slide list (count, steps, which one is live) comes from the deck itself, so the PDF follows slides/index.ts.
const url = (n, step) => `${base}${base.includes("?") ? "&" : "?"}slide=${n}&step=${step}&freeze=end`;
await page.goto(url(1, 0), { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => !!window.__pitch?.slides, null, { timeout: 30000 });
const slides = await page.evaluate(() => window.__pitch.slides);

const pngs = [];
for (const [k, s] of slides.entries()) {
  const n = k + 1;
  const step = Math.max(0, s.steps - 1);
  label = `slide ${n}`;
  await page.goto(url(n, step), { waitUntil: "domcontentloaded" });
  await page.waitForFunction((want) => window.__pitch?.slide === want, n, { timeout: 30000 });
  await page.waitForTimeout(s.id === "demo" ? 10000 : 2500);
  const file = path.join(shotsDir, `slide${n}.png`);
  await page.screenshot({ path: file });
  pngs.push(file);
}

// One page per slide, the screenshot edge to edge.
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: 1920px 1080px; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
img { display: block; width: 1920px; height: 1080px; break-after: page; }
img:last-child { break-after: auto; }
</style></head><body>${pngs.map((f) => `<img src="data:image/png;base64,${fs.readFileSync(f).toString("base64")}">`).join("")}</body></html>`;
const pdfPage = await ctx.newPage();
await pdfPage.setContent(html, { waitUntil: "load" });
fs.mkdirSync(path.dirname(out), { recursive: true });
await pdfPage.pdf({ path: out, width: "1920px", height: "1080px", printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
await browser.close();

console.log(JSON.stringify({ pdf: out, pages: pngs.length, shots: pngs, errors }, null, 1));
