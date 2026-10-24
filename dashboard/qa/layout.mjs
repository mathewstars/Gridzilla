// G3 layout matrix (fix-broken.md, goal.md): the stage at every size, under scenarios 1-4 and after 20 s live; counts layout defects.
// usage: node qa/layout.mjs [--page stage|B] [--sizes all|1240x635,390x844] [--states full|quick] [--dev] [--out DIR]
//   --states quick : current live state only (no scenario change; what builders use)
//   --states full  : scenarios normal, cold-evening, sunny-noon, live-weather (10 s settle each) + "live" (20 s on the page)
//   --dev          : test the Vite dev server (127.0.0.1:5174) instead of the built page on :8081
import { SIZES, launch, ready, stageUrl } from "./lib.mjs";
import fs from "node:fs";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : true); };
const sizes = arg("sizes", "all") === "all" ? SIZES : String(arg("sizes")).split(",");
const pages = [String(arg("page", "stage"))];
const statesMode = arg("states", arg("quick") ? "quick" : "full");
const dev = !!arg("dev", false);
const out = String(arg("out", "/tmp/gzqa/layout"));
fs.mkdirSync(out, { recursive: true });
const themes = String(arg("theme", "")).split(",").filter(Boolean); // ops console: dark,light (empty = page default)
const hash = String(arg("hash", "")); // e.g. /demo for the ops console's demo mode
const url = (p, theme) => stageUrl(dev, p) + (theme ? `?theme=${theme}` : "") + (hash ? `#${hash}` : "");
const API = "http://localhost:8081/api";
const STATES = statesMode === "quick" ? ["now"] : ["normal", "cold-evening", "sunny-noon", "live-weather", "live"];

// In-page detectors. Returns findings by kind; every count must be 0.
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
    // text scrolled out of view inside a deliberate scroll area (data-scroll) is not on screen: it cannot overlap anything
    const sc = el.closest("[data-scroll]");
    if (sc) {
      const r0 = sc.getBoundingClientRect(), rr = el.getBoundingClientRect();
      if (rr.bottom <= r0.top || rr.top >= r0.bottom) continue;
    }
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
    // a deliberate scroll area (the ops console columns, data-scroll) is fine; any other inner scroll hides content
    if (el !== document.body && el !== document.documentElement && !el.dataset?.scroll && ((scrolls(ox) && overX) || (scrolls(oy) && overY))) F.innerScroll.push(label(el));
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

async function setScenario(name) {
  await fetch(`${API}/scenario/${name}`, { method: "POST" }).catch(() => {});
  await new Promise((r) => setTimeout(r, 10000));
}

const browser = await launch();
const results = [];
async function cell(state, p, size, theme = "") {
  const [W, H] = size.split("x").map(Number);
  const phone = W < 500;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error" && !/favicon/.test(m.text())) errors.push(m.text().slice(0, 160)); });
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  try {
    await page.goto(url(p, theme), { waitUntil: "domcontentloaded", timeout: 30000 });
    await ready(page, state === "live" ? 20000 : 4000);
    const f = await page.evaluate(detect, [W >= 1440 && H >= 900, W]);
    f.console = errors;
    const shot = `${out}/${state}-${p}${theme ? "-" + theme : ""}-${size}.png`;
    // Grow the window to the whole page so below-the-fold parts (the 3D street pauses off-screen) render for the capture.
    const fullH = await page.evaluate(() => document.documentElement.scrollHeight);
    if (fullH > H) { await page.setViewportSize({ width: W, height: Math.min(fullH, 6000) }); await page.waitForTimeout(1500); }
    await page.screenshot({ path: shot });
    // The 3D street must show something in every cell: a blank canvas compresses to almost nothing.
    const cv = page.locator("canvas").first();
    if (await cv.count()) {
      const box = await cv.boundingBox();
      if (box && box.width > 120 && box.height > 80) {
        const png = await cv.screenshot().catch(() => null);
        const bytesPerPx = png ? png.length / (box.width * box.height) : 0;
        if (process.env.GZ_QA_DEBUG) console.error("canvas", size, png && png.length, bytesPerPx.toFixed(3));
        if (!png || bytesPerPx < 0.04) f.blank3d = [`street canvas looks blank (${png ? png.length : 0} bytes for ${Math.round(box.width)}x${Math.round(box.height)})`];
      }
    }
    const count = Object.values(f).reduce((a, v) => a + v.length, 0);
    results.push({ state: theme ? `${state}/${theme}` : state, page: p, size, count, f, shot });
  } catch (e) {
    results.push({ state, page: p, size, count: 1, f: { error: [String(e).slice(0, 200)] }, shot: null });
  } finally {
    await ctx.close();
  }
}

const startScenario = (await (await fetch(`${API}/state?tree=0`).catch(() => null))?.json().catch(() => null))?.scenario?.name;
const CONC = 5;
for (const st of STATES) {
  if (!["now", "live"].includes(st)) await setScenario(st);
  const jobs = pages.flatMap((p) => (themes.length ? themes : [""]).flatMap((th) => sizes.map((s) => () => cell(st, p, s, th))));
  const run = async () => { while (jobs.length) await jobs.shift()(); };
  await Promise.all(Array.from({ length: CONC }, run));
}
await browser.close();
if (statesMode !== "quick" && startScenario) await fetch(`${API}/scenario/${startScenario}`, { method: "POST" }).catch(() => {});

const total = results.reduce((a, r) => a + r.count, 0);
const byKind = {};
results.forEach((r) => Object.entries(r.f).forEach(([k, v]) => (byKind[k] = (byKind[k] || 0) + v.length)));
const bad = results.filter((r) => r.count).map((r) => ({ cell: `${r.state}/${r.page}/${r.size}`, shot: r.shot, ...Object.fromEntries(Object.entries(r.f).filter(([, v]) => v.length).map(([k, v]) => [k, v.slice(0, 4)])) }));
const report = { cells: results.length, total, byKind, bad, shots: results.map((r) => r.shot).filter(Boolean) };
fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ gate: "G3", out, cells: results.length, total, byKind, bad: bad.slice(0, 40) }, null, 1));
process.exitCode = total ? 1 : 0;
