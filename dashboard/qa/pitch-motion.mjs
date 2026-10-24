// G5 motion for the pitch: every slide (and build step) gets a 10 s recording at 1920x1080, and the frame rate and long
// frames are measured while its build plays. Passes when every cell holds >= 55 fps on average and no frame takes
// longer than 100 ms. Whether a move tells the story (not decoration) is judged by eye on the recordings (G4/G5 judges).
// usage: node qa/pitch-motion.mjs [--base http://localhost:5175/pitch.html] [--size 1920x1080] [--secs 10] [--out DIR]
import fs from "node:fs";
import { arg, launch } from "./lib.mjs";

const base = String(arg("base", "http://localhost:5175/pitch.html"));
const [W, H] = String(arg("size", "1920x1080")).split("x").map(Number);
const secs = Number(arg("secs", 10));
const out = String(arg("out", "/tmp/gzpitch/motion"));
fs.mkdirSync(out, { recursive: true });
const CELLS = [[1, 0], [2, 0], [3, 0], [3, 1], [4, 0], [5, 0], [6, 0], [7, 0], [7, 1]];

const browser = await launch();
const results = [];
for (const [n, step] of CELLS) {
  const dir = `${out}/s${n}-step${step}`;
  fs.rmSync(dir, { recursive: true, force: true });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, recordVideo: { dir, size: { width: W, height: H } } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if ((m.type() === "error" || m.type() === "warning") && !/favicon|DevTools|GPU stall|GL Driver/i.test(m.text())) errors.push(m.text().slice(0, 160)); });
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  // Step 1 builds play when Right is pressed on step 0, the way the presenter sees them.
  await page.goto(`${base}?slide=${n}&step=0`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(step ? 12000 : 300);
  if (step) await page.keyboard.press("ArrowRight");
  const m = await page.evaluate((ms) => new Promise((r) => {
    let n = 0, worst = 0, last = performance.now();
    const t0 = last;
    const f = (t) => { n++; worst = Math.max(worst, t - last); last = t; t - t0 < ms ? requestAnimationFrame(f) : r({ fps: n / (ms / 1000), worst }); };
    requestAnimationFrame(f);
  }), secs * 1000);
  await ctx.close();
  const video = fs.readdirSync(dir).filter((f) => f.endsWith(".webm")).map((f) => `${dir}/${f}`)[0];
  const final = `${out}/slide${n}-step${step}.webm`;
  if (video) fs.renameSync(video, final);
  const bad = m.fps < 55 || m.worst > 100 || errors.length > 0;
  results.push({ slide: n, step, fps: Math.round(m.fps * 10) / 10, worstFrameMs: Math.round(m.worst), errors, video: video ? final : null, bad });
}
await browser.close();
fs.writeFileSync(`${out}/motion.json`, JSON.stringify(results, null, 1));
console.log(JSON.stringify({ gate: "G5", bad: results.filter((r) => r.bad).length, results }, null, 1));
process.exitCode = results.some((r) => r.bad) ? 1 : 0;
