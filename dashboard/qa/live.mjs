// G1 (runtime half) and G5: console clean over 60 s of live running; 3D at >= 50 fps at 1440x900 and paused when off-screen;
// a 10 s recording per breakpoint that shows real, data-driven change.
// The 3D scene must count its rendered frames on window.__gz3d.frames (useFrame) so "paused off-screen" is measurable.
// usage: node qa/live.mjs [--dev] [--g1-seconds 60] [--sizes all|1440x900,...] [--no-rec] [--out DIR]
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { SIZES, arg, launch, newPage, ready, pool, stageUrl } from "./lib.mjs";

const dev = !!arg("dev", false);
const g1s = Number(arg("g1-seconds", 60));
const sizes = arg("sizes", "all") === "all" ? SIZES : String(arg("sizes")).split(",");
const out = String(arg("out", "/tmp/gzqa/live"));
fs.mkdirSync(out, { recursive: true });
const F = { console: [], fps: [], offscreen: [], motion: [] };
const browser = await launch();

// G1: 60 s live at 1440x900, every console error or warning counts
{
  const { ctx, page, errors } = await newPage(browser, "1440x900");
  await page.goto(stageUrl(dev), { waitUntil: "domcontentloaded" });
  await ready(page, 0);
  await page.waitForTimeout(g1s * 1000);
  F.console.push(...[...new Set(errors)]);

  // G5a: frame rate while the scene is on screen
  const fps = await page.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < 5000 ? requestAnimationFrame(f) : r(n / 5); }; requestAnimationFrame(f); }));
  const scene = await page.evaluate(() => { const a = window.__gz3d?.frames ?? null; return new Promise((r) => setTimeout(() => r(a == null ? null : ((window.__gz3d.frames - a) / 3)), 3000)); });
  if (fps < 50) F.fps.push(`page ${fps.toFixed(1)} fps at 1440x900`);
  if (scene == null) F.fps.push("window.__gz3d.frames missing: the 3D scene does not report frames");
  else if (scene < 50) F.fps.push(`3D ${scene.toFixed(1)} fps at 1440x900`);
  fs.writeFileSync(`${out}/fps.json`, JSON.stringify({ fps, scene }));
  await ctx.close();
}

// G5b: off-screen pause, on a phone where the page scrolls past the scene
{
  const { ctx, page } = await newPage(browser, "390x844");
  await page.goto(stageUrl(dev), { waitUntil: "domcontentloaded" });
  await ready(page, 3000);
  const r = await page.evaluate(async () => {
    const c = document.querySelector("canvas");
    if (!c || window.__gz3d?.frames == null) return { skip: true };
    // scroll whichever way takes the scene out of view (it may sit at the top or at the bottom of the phone stack)
    const y = c.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, y > document.documentElement.scrollHeight / 2 ? 0 : document.documentElement.scrollHeight);
    await new Promise((res) => setTimeout(res, 800));
    const box = c.getBoundingClientRect();
    if (box.bottom > 0 && box.top < innerHeight) return { skip: true, why: "scene still on screen after scrolling" };
    const a = window.__gz3d.frames;
    await new Promise((res) => setTimeout(res, 2000));
    return { delta: window.__gz3d.frames - a };
  });
  if (r.why) F.offscreen.push(r.why);
  else if (!r.skip && r.delta > 5) F.offscreen.push(`3D kept rendering off-screen: ${r.delta} frames in 2 s`);
  await ctx.close();
}

// G5c: 10 s recording per breakpoint (20 frames, 0.5 s apart), must show change driven by new data
if (!arg("no-rec", false)) {
  await pool(sizes.map((size) => async () => {
    const { ctx, page } = await newPage(browser, size);
    await page.goto(stageUrl(dev), { waitUntil: "domcontentloaded" });
    await ready(page, 3000);
    const dir = `${out}/rec-${size}`;
    fs.mkdirSync(dir, { recursive: true });
    const seq0 = await page.evaluate(() => window.__gz?.state?.now ?? null); // server time of the last poll
    const shots = [];
    for (let i = 0; i < 20; i++) {
      const p = `${dir}/f${String(i).padStart(2, "0")}.png`;
      await page.screenshot({ path: p });
      shots.push(fs.readFileSync(p));
      await page.waitForTimeout(500);
    }
    const seq1 = await page.evaluate(() => window.__gz?.state?.now ?? null);
    const changed = shots.some((b, i) => i && !b.equals(shots[0]));
    if (!changed) F.motion.push(`${size}: nothing changed in 10 s`);
    if (seq0 != null && seq1 === seq0) F.motion.push(`${size}: no new data arrived in 10 s`);
    try {
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "2", "-i", `${dir}/f%02d.png`, "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p", `${out}/rec-${size}.mp4`]);
    } catch (e) { F.motion.push(`${size}: ffmpeg failed ${String(e).slice(0, 80)}`); }
    await ctx.close();
  }), 4);
}
await browser.close();
const total = Object.values(F).reduce((a, v) => a + v.length, 0);
fs.writeFileSync(`${out}/live.json`, JSON.stringify(F, null, 1));
console.log(JSON.stringify({ gate: "G1-runtime+G5", total, ...F, recordings: fs.readdirSync(out).filter((f) => f.endsWith(".mp4")).map((f) => `${out}/${f}`) }, null, 1));
process.exitCode = total ? 1 : 0;
