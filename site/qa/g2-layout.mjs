// G2 layout, at 2560x1440, 1440x900, 1024x768, 390x844, 390x667: no two text nodes overlap, no text clipped by its
// container, no horizontal page scroll, the hero headline on 2 lines (3 on a phone: ONE SIGNED LIMIT. / THE WHOLE /
// STREET LISTENS., in sentence case), every pill label on one line, the nav on one line at 1024 and up. Detector after dashboard/qa/layout.mjs.
import { SIZES, SITE, arg, launch, newPage, report, scrollThrough } from "./lib.mjs";

const url = String(arg("url", SITE));
const sizes = arg("sizes") ? String(arg("sizes")).split(",") : SIZES;

function detect(W) {
  const F = { overlap: [], clipped: [], wide: [], headline: [], ctaWrap: [], nav: [] };
  const hidden = (el) => {
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.05) return true;
      if (e.classList?.contains("sr-only")) return true;
    }
    return false;
  };
  const label = (el) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""}`.slice(0, 70);
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
    // a text rect is the font's whole content box (taller than the line under tight display leading): judge the
    // line box instead, centred in it, so uppercase lines set at 0.92 do not count as overlapping each other
    const lh = parseFloat(getComputedStyle(el).lineHeight);
    for (const r of rg.getClientRects()) {
      if (r.width <= 1 || r.height <= 1) continue;
      const cut = lh && r.height > lh ? (r.height - lh) / 2 : 0;
      boxes.push({ el, t: t.slice(0, 40), l: r.left, t0: r.top + cut, r: r.right, b: r.bottom - cut });
    }
  }
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const iw = Math.min(a.r, b.r) - Math.max(a.l, b.l), ih = Math.min(a.b, b.b) - Math.max(a.t0, b.t0);
      if (iw > 3 && ih > 3) F.overlap.push(`"${a.t}" x "${b.t}"`);
    }
  for (const el of document.querySelectorAll("body *")) {
    if (hidden(el)) continue;
    const cs = getComputedStyle(el);
    const clips = (o) => o === "hidden" || o === "clip";
    const cw = el.clientWidth, ch = el.clientHeight;
    if (!cw || !ch) continue;
    if ((clips(cs.overflowX) && el.scrollWidth > cw + 2) || (clips(cs.overflowY) && el.scrollHeight > ch + 2)) {
      const r = el.getBoundingClientRect();
      const out = boxes.filter((b) => el.contains(b.el) && (b.r > r.right + 2 || b.l < r.left - 2 || b.b > r.bottom + 2 || b.t0 < r.top - 2));
      if (out.length) F.clipped.push(`${label(el)}: "${out[0].t}"`);
    }
    if (cs.textOverflow === "ellipsis" && el.scrollWidth > cw + 1) F.clipped.push(`${label(el)} ellipsis`);
  }
  for (const b of boxes) if (b.r > W + 1 || b.l < -1) F.wide.push(`"${b.t}" beyond the viewport`);
  if (document.documentElement.scrollWidth > W + 1) F.wide.push(`page ${document.documentElement.scrollWidth}px wide`);
  // the hero headline: count its lines
  const h1 = document.querySelector("h1");
  if (h1) {
    const lh = parseFloat(getComputedStyle(h1).lineHeight) || parseFloat(getComputedStyle(h1).fontSize);
    const lines = Math.round(h1.getBoundingClientRect().height / lh);
    const max = W >= 1024 ? 2 : 3;
    if (lines > max) F.headline.push(`${lines} lines (max ${max})`);
  }
  // every pill and button label on one line
  for (const el of document.querySelectorAll("a.pill, button.pill, a[class*=pill], button")) {
    if (hidden(el)) continue;
    const txt = el.querySelector("span") || el;
    const rects = [...(() => { const rg = document.createRange(); rg.selectNodeContents(txt); return rg.getClientRects(); })()].filter((r) => r.width > 1);
    const tops = new Set(rects.map((r) => Math.round(r.top)));
    if (tops.size > 1) F.ctaWrap.push(`"${el.textContent.trim().slice(0, 30)}" wraps`);
  }
  // the nav on one line at desktop
  if (W >= 1024) {
    const links = [...document.querySelectorAll("nav[aria-label=Main] a, nav[aria-label=Main] button")].filter((e) => !hidden(e));
    const tops = new Set(links.map((e) => { const r = e.getBoundingClientRect(); return Math.round(r.top + r.height / 2); }));
    const spread = Math.max(...tops) - Math.min(...tops);
    if (spread > 8) F.nav.push(`nav items spread ${spread}px vertically`);
  }
  for (const k of Object.keys(F)) F[k] = [...new Set(F[k])];
  return F;
}

const browser = await launch();
const rows = [];
for (const size of sizes) {
  const { ctx, page, width } = await newPage(browser, size);
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.waitForTimeout(1500);
  await scrollThrough(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1200);
  const f = await page.evaluate(detect, width);
  for (const [k, v] of Object.entries(f)) rows.push([`${size} ${k}`, v.length === 0, v.slice(0, 4).join(" | ")]);
  await ctx.close();
}
await browser.close();
process.exit(report("G2", rows) ? 1 : 0);
