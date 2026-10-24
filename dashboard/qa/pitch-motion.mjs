// G5 motion for the pitch: every slide (and build step) gets a 10 s recording at 1920x1080, and the frame rate and long
// frames are measured while its build plays. Passes when every cell holds >= 55 fps on average and no frame takes
// longer than 100 ms. Whether a move tells the story (not decoration) is judged by eye on the recordings (G4/G5 judges).
// usage: node qa/pitch-motion.mjs [--base http://localhost:5175/pitch.html] [--size 1920x1080] [--secs 10] [--out DIR]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { arg, launch } from "./lib.mjs";

const base = String(arg("base", "http://localhost:5175/pitch.html"));
const [W, H] = String(arg("size", "1920x1080")).split("x").map(Number);
const secs = Number(arg("secs", 10));
const out = String(arg("out", "/tmp/gzpitch/motion"));
fs.mkdirSync(out, { recursive: true });
const ALL = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [3, 0], [3, 1], [3, 2], [3, 3], [4, 0], [4, 1], [5, 0], [5, 1], [6, 0], [7, 0], [7, 1], [7, 2]];
const only = arg("slides") ? String(arg("slides")).split(",").map(Number) : null;
const CELLS = only ? ALL.filter(([n]) => only.includes(n)) : ALL;

const browser = await launch();
const results = [];
for (const [n, step] of CELLS) {
  const dir = `${out}/s${n}-step${step}`;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if ((m.type() === "error" || m.type() === "warning") && !/favicon|DevTools|GPU stall|GL Driver/i.test(m.text())) errors.push(m.text().slice(0, 160)); });
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  // Later steps play when Right is pressed, the way the presenter sees them (each earlier step gets 9 s to finish).
  // Slide 0: Space plays the trailer.
  await page.goto(`${base}?slide=${n}&step=0`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(n === 0 ? 2000 : 300);
  if (n === 0) await page.keyboard.press(" ");
  for (let k = 0; k < step; k++) {
    await page.waitForTimeout(9000);
    await page.keyboard.press("ArrowRight");
  }
  // Record with Chrome's own screencast (cheap GPU readback) while the frame rate is measured in the page.
  const cdp = await ctx.newCDPSession(page);
  let frame = 0;
  cdp.on("Page.screencastFrame", async (f) => {
    fs.writeFileSync(`${dir}/f${String(frame++).padStart(4, "0")}.jpg`, Buffer.from(f.data, "base64"));
    await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 70, maxWidth: W, maxHeight: H });
  const m = await page.evaluate((ms) => new Promise((r) => {
    let n = 0, worst = 0, last = performance.now();
    const t0 = last;
    const f = (t) => { n++; worst = Math.max(worst, t - last); last = t; t - t0 < ms ? requestAnimationFrame(f) : r({ fps: n / (ms / 1000), worst }); };
    requestAnimationFrame(f);
  }), secs * 1000);
  await cdp.send("Page.stopScreencast").catch(() => {});
  await ctx.close();
  const final = `${out}/slide${n}-step${step}.mp4`;
  let video = null;
  try {
    const fps = Math.max(1, Math.round(frame / secs));
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(fps), "-i", `${dir}/f%04d.jpg`, "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p", final]);
    video = final;
  } catch (e) {
    errors.push(`recording failed: ${String(e).slice(0, 120)}`);
  }
  const bad = m.fps < 55 || m.worst > 100 || errors.length > 0;
  results.push({ slide: n, step, fps: Math.round(m.fps * 10) / 10, worstFrameMs: Math.round(m.worst), errors, video: video ? final : null, bad });
}
await browser.close();
fs.writeFileSync(`${out}/motion.json`, JSON.stringify(results, null, 1));
console.log(JSON.stringify({ gate: "G5", bad: results.filter((r) => r.bad).length, results }, null, 1));
process.exitCode = results.some((r) => r.bad) ? 1 : 0;
