// Pitch gates (PITCH.md "Run": npm run pitch:qa). Needs the pitch server up (dev :5175 or preview :4175) and Chrome.
// usage: node qa/pitch.mjs [--base URL] [--sizes 1920x1080,1240x635] [--quick] [--slides 1,5] [--only g1|g3] [--out DIR]
//   G1  open the deck, step through every slide and build step with ArrowRight like the presenter (slide 1: the first
//       press starts the jingle, the next one moves on), ~2.5 s per press (12 s on the live stage); every console error
//       or warning and every page error fails, and so does a slide the presses never reached.
//   G3  every slide x every step x every size, at "start" (0.4 s after load) and "end" (?freeze=end, 2.5 s; slide 6:
//       8 s so the stage is live): the layout detectors of qa/layout.mjs (overlap, clipped, cut, outside its card, wider
//       than the window, inner scroll; plus console errors), one PNG per cell. Slide 5 skips inner scroll: the stage
//       scrolls inside the shell by design on short windows. notOneScreen is skipped everywhere (the deck never scrolls).
//   --base   default http://localhost:5175/pitch.html (the production preview: http://localhost:4175/pitch.html)
//   --sizes  default 1920x1080,2560x1440,1440x900,1280x800,1240x635; --quick = 1920x1080,1240x635
//   --out    default /tmp/gzpitch/qa (PNGs + report.json)
// Prints {g1:{errors}, g3:{cells,total,byKind,bad}} and exits 1 when anything fails.
import fs from "node:fs";
import { launch, newPage, pool } from "./lib.mjs";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  if (i < 0) return d;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
};
const base = String(arg("base", "http://localhost:5175/pitch.html"));
const quick = !!arg("quick", false);
const sizes = String(arg("sizes", quick ? "1920x1080,1240x635" : "1920x1080,2560x1440,1440x900,1280x800,1240x635")).split(",");
const out = String(arg("out", "/tmp/gzpitch/qa"));
const only = String(arg("only", "all"));
const CONC = 4;
const LIVE = 6; // the live stage slide
fs.mkdirSync(out, { recursive: true });

// Build steps per slide, read from the registry (src/pitch/slides/index.ts) so the gate follows the deck. The slide
// number is the row's position in SLIDES (the files kept their first numbers, so SlideSignals is 4 and Slide4.tsx is 5).
function readSteps() {
  try {
    const src = fs.readFileSync(new URL("../src/pitch/slides/index.ts", import.meta.url), "utf8");
    const body = src.slice(src.indexOf("SLIDES"));
    const rows = body.split("\n").filter((l) => /Component:\s*\w+/.test(l));
    const steps = {};
    rows.forEach((l, i) => (steps[i] = Number(/steps:\s*(\d+)/.exec(l)?.[1] ?? 1)));
    if (Object.keys(steps).length) return steps;
  } catch {}
  return { 0: 1, 1: 1, 2: 2, 3: 2, 4: 1, 5: 1, 6: 6, 7: 1, 8: 2, 9: 1 };
}
// Steps per slide number (0 = the trailer, 1-9 the slides).
const STEPS = readSteps();
const NUMS = Object.keys(STEPS).map(Number).sort((a, b) => a - b);
const N = NUMS[NUMS.length - 1];
const slides = arg("slides") ? String(arg("slides")).split(",").map(Number) : NUMS;
const sep = base.includes("?") ? "&" : "?";
// Both themes by default (dark is the product default); --themes dark or --themes light runs one.
const themes = String(arg("themes", "dark,light")).split(",");

// Copied from qa/layout.mjs (detect), verbatim: keep the two in step. Called here with oneScreen = false.
function detect([oneScreen, W]) {
  const vw = Math.min(innerWidth, W), vh = innerHeight; // phones may widen the layout viewport: judge against the device width
  const F = { overlap: [], clipped: [], cut: [], outside: [], wide: [], innerScroll: [], notOneScreen: [] };
  const hidden = (el) => {
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.05) return true;
      if (e.classList?.contains("sr-only")) return true;
    }
    return false;
  };
  const label = (el) => {
    const id = el.id ? `#${el.id}` : "";
    const cls = typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
    return `${el.tagName.toLowerCase()}${id}${cls}`.slice(0, 60);
  };
  // text boxes: HTML text nodes by line rect, SVG text by element box
  const boxes = [];
  const seenSvg = new Set();
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const t = n.textContent.replace(/\s+/g, " ").trim();
    if (!t) continue;
    const el = n.parentElement;
    if (!el || hidden(el)) continue;
    const svgText = el.closest("text");
    if (svgText && svgText.ownerSVGElement) {
      if (seenSvg.has(svgText)) continue;
      seenSvg.add(svgText);
      const r = svgText.getBoundingClientRect();
      if (r.width > 1 && r.height > 1) boxes.push({ el: svgText, t: svgText.textContent.trim().slice(0, 40), l: r.left, t0: r.top, r: r.right, b: r.bottom });
      continue;
    }
    const rg = document.createRange();
    rg.selectNodeContents(n);
    for (const r of rg.getClientRects()) if (r.width > 1 && r.height > 1) boxes.push({ el, t: t.slice(0, 40), l: r.left, t0: r.top, r: r.right, b: r.bottom });
  }
  // 1. text over text (different elements, not nested)
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const iw = Math.min(a.r, b.r) - Math.max(a.l, b.l), ih = Math.min(a.b, b.b) - Math.max(a.t0, b.t0);
      if (iw > 3 && ih > 3) F.overlap.push(`"${a.t}" x "${b.t}"`);
    }
  // 2. clipped / inner scroll / 4. outside card, per container
  const all = document.querySelectorAll("body *");
  const cards = [];
  for (const el of all) {
    if (hidden(el)) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (parseFloat(cs.borderTopLeftRadius) >= 12 && r.width >= 120 && r.height >= 60 && !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor)) cards.push(el);
    const ox = cs.overflowX, oy = cs.overflowY;
    const clips = (o) => o === "hidden" || o === "clip";
    const scrolls = (o) => o === "auto" || o === "scroll";
    const cw = el.clientWidth, ch = el.clientHeight;
    if (!cw || !ch) continue;
    const overX = el.scrollWidth > cw + 2, overY = el.scrollHeight > ch + 2;
    if ((clips(ox) && overX) || (clips(oy) && overY)) {
      // only a defect when text inside actually extends beyond the box
      const inside = boxes.filter((b) => el.contains(b.el) && (b.r > r.right + 2 || b.l < r.left - 2 || b.b > r.bottom + 2 || b.t0 < r.top - 2));
      if (inside.length) F.clipped.push(`${label(el)}: "${inside[0].t}"`);
    }
    if (el !== document.body && el !== document.documentElement && ((scrolls(ox) && overX) || (scrolls(oy) && overY))) F.innerScroll.push(label(el));
    if (cs.textOverflow === "ellipsis" && el.scrollWidth > cw + 1) F.cut.push(`${label(el)}: "${el.textContent.trim().slice(0, 40)}"`);
    if (cs.webkitLineClamp && cs.webkitLineClamp !== "none" && el.scrollHeight > ch + 1) F.cut.push(`${label(el)} (line-clamp)`);
  }
  for (const b of boxes) {
    let card = null;
    for (let e = b.el.parentElement; e; e = e.parentElement) if (cards.includes(e)) { card = e; break; }
    if (card) {
      const r = card.getBoundingClientRect();
      if (b.r > r.right + 2 || b.l < r.left - 2 || b.b > r.bottom + 2 || b.t0 < r.top - 2) F.outside.push(`"${b.t}" outside ${label(card)}`);
    }
    if (b.r > vw + 1 || b.l < -1) F.wide.push(`"${b.t}" beyond the viewport`);
  }
  if (document.documentElement.scrollWidth > vw + 1) F.wide.push(`page ${document.documentElement.scrollWidth}px wide`);
  if (oneScreen && document.documentElement.scrollHeight > vh + 1) F.notOneScreen.push(`page ${document.documentElement.scrollHeight}px tall`);
  for (const k of Object.keys(F)) F[k] = [...new Set(F[k])];
  return F;
}

/** The slide numbers on screen now: [data-slide] roots that are visible and inside the window. */
function onScreen() {
  const out = [];
  for (const el of document.querySelectorAll("[data-slide]")) {
    let hid = false;
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.05) { hid = true; break; }
    }
    const r = el.getBoundingClientRect();
    if (!hid && r.width > 0 && r.right > 1 && r.left < innerWidth - 1 && r.bottom > 1 && r.top < innerHeight - 1) out.push(Number(el.dataset.slide));
  }
  return out;
}

const browser = await launch();

// ------------------------------------------------------------------ G1: the run of show, key by key
async function g1(theme) {
  const { ctx, page, errors } = await newPage(browser, "1920x1080");
  const trace = [];
  const seen = new Set();
  try {
    await page.goto(`${base}${sep}theme=${theme}`, { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(2500);
    let cur = (await page.evaluate(onScreen))[0];
    trace.push({ press: 0, slide: cur });
    if (cur) seen.add(cur);
    // Every step of every slide, one press for the jingle on slide 1, then a few spare presses at the end: the deck
    // must stay on the last slide.
    // Slide 0: one press plays the trailer, the next skips it to the title. Then every step of slides 1-9.
    const presses = 2 + NUMS.filter((n) => n > 0).reduce((a, n) => a + STEPS[n], 0) + 1;
    for (let k = 1; k <= presses; k++) {
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(500);
      const now = await page.evaluate(onScreen);
      cur = now.length === 1 ? now[0] : now.join("+") || "none";
      await page.waitForTimeout(cur === LIVE ? 11500 : 2000);
      const settled = await page.evaluate(onScreen);
      const s = settled.length === 1 ? settled[0] : settled.join("+") || "none";
      trace.push({ press: k, slide: s });
      if (typeof s === "number") seen.add(s);
      else errors.push(`after press ${k}: on screen ${s} (expected exactly one slide)`);
    }
    for (const i of NUMS) if (!seen.has(i)) errors.push(`slide ${i} never came on screen while stepping through`);
    const last = trace[trace.length - 1].slide;
    if (last !== N) errors.push(`ended on slide ${last}, expected ${N}`);
  } catch (e) {
    errors.push(`G1 run failed: ${String(e).slice(0, 200)}`);
  } finally {
    await ctx.close();
  }
  return { errors: [...new Set(errors)], trace };
}

// ------------------------------------------------------------------ G3: layout matrix
const results = [];
async function cell(slide, step, size, phase, theme) {
  const [W] = size.split("x").map(Number);
  const { ctx, page, errors } = await newPage(browser, size);
  const shot = `${out}/${theme}-s${slide}-step${step}-${phase}-${size}.png`;
  try {
    const url = `${base}${sep}theme=${theme}&slide=${slide}&step=${step}${phase === "end" ? "&freeze=end" : ""}`;
    await page.goto(url, { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(phase === "start" ? 400 : slide === LIVE ? 8000 : 2500);
    // The slide 6 walkthrough is an overlay that sits over the demo by design: judge the demo with it hidden, then
    // check the overlay on its own (its caption card fully inside the window).
    const tour = slide === LIVE && step > 0;
    if (tour) await page.evaluate(() => document.querySelectorAll(".t5").forEach((e) => (e.style.visibility = "hidden")));
    const f = await page.evaluate(detect, [false, W]);
    // Slide 6 runs the Operations view in a 1920x1080 iframe (pitch-ops.html): judge what is inside it too.
    if (slide === LIVE)
      for (const fr of page.frames())
        if (fr.url().includes("pitch-ops")) {
          const g = await fr.evaluate(detect, [false, 1920]);
          for (const [k, v] of Object.entries(g)) f[k] = [...(f[k] || []), ...v.map((x) => `frame: ${x}`)];
        }
    if (tour) {
      await page.evaluate(() => document.querySelectorAll(".t5").forEach((e) => (e.style.visibility = "")));
      f.tour = await page.evaluate(() => {
        const card = document.querySelector(".t5-card");
        if (!card) return [];
        const r = card.getBoundingClientRect();
        return r.left < 0 || r.top < 0 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1 ? [`tour caption outside the window`] : [];
      });
    }
    delete f.notOneScreen;
    if (slide === LIVE) delete f.innerScroll;
    const here = await page.evaluate(onScreen);
    f.wrongSlide = here.length === 1 && here[0] === slide ? [] : [`on screen: ${here.join("+") || "none"}`];
    await page.screenshot({ path: shot });
    f.console = errors.slice();
    const count = Object.values(f).reduce((a, v) => a + v.length, 0);
    results.push({ slide, step, size, phase, theme, count, f, shot });
  } catch (e) {
    results.push({ slide, step, size, phase, theme, count: 1, f: { error: [String(e).slice(0, 200)] }, shot: null });
  } finally {
    await ctx.close();
  }
}

let g1res = { errors: [], trace: [], skipped: true };
if (only !== "g3") {
  const runs = [];
  for (const t of themes) runs.push({ theme: t, ...(await g1(t)) });
  g1res = { errors: runs.flatMap((r) => r.errors.map((e) => `${r.theme}: ${e}`)), trace: runs[0].trace, traces: Object.fromEntries(runs.map((r) => [r.theme, r.trace.map((x) => x.slide).join(" ")])) };
}
if (only !== "g1") {
  const jobs = [];
  for (const s of slides) for (let st = 0; st < (STEPS[s] ?? 1); st++) for (const size of sizes) for (const ph of ["start", "end"]) for (const t of themes) jobs.push(() => cell(s, st, size, ph, t));
  await pool(jobs, CONC);
}
await browser.close();

results.sort((a, b) => a.slide - b.slide || a.step - b.step || a.size.localeCompare(b.size) || a.phase.localeCompare(b.phase));
const total = results.reduce((a, r) => a + r.count, 0);
const byKind = {};
results.forEach((r) => Object.entries(r.f).forEach(([k, v]) => v.length && (byKind[k] = (byKind[k] || 0) + v.length)));
const bad = results
  .filter((r) => r.count)
  .map((r) => ({ cell: `${r.theme}/s${r.slide}/step${r.step}/${r.size}/${r.phase}`, shot: r.shot, ...Object.fromEntries(Object.entries(r.f).filter(([, v]) => v.length).map(([k, v]) => [k, v.slice(0, 4)])) }));
const g3 = { cells: results.length, total, byKind, bad };
const report = { base, sizes, steps: STEPS, g1: g1res, g3: { ...g3, shots: results.map((r) => r.shot).filter(Boolean) } };
fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ out, g1: { errors: g1res.errors, traces: g1res.traces }, g3: { cells: g3.cells, total, byKind, bad: bad.slice(0, 40) } }, null, 1));
process.exitCode = g1res.errors.length || total ? 1 : 0;
