// G2 layout, at 2560x1440, 1440x900, 1024x768, 390x844, 390x667: no two text nodes overlap, no text clipped by its
// container, no horizontal page scroll, the hero headline on 2 lines (3 on a phone: ONE SIGNED LIMIT. / THE WHOLE /
// STREET LISTENS., in sentence case), every pill label on one line, the nav on one line at 1024 and up, every section
// title centred on the page (round 4: the page reads as one centred column), and under 768 px every tap target at least 44 x 44 (links inside a sentence
// excepted, as WCAG 2.5.8 does). Besides the sizes it runs on a real iPhone 14 profile (DPR 3, touch, mobile) in both
// Chrome and WebKit (Safari's engine), and checks there, on the pixels the engine actually paints, that nothing shows
// through the fixed nav bar (its own contents hidden, every pixel of the bar must be the bar colour, at five scroll
// depths) and that no section's title sits behind it once you scroll to that section. Detector after dashboard/qa/layout.mjs.
import { ENGINE, SIZES, SITE, arg, devicePage, launch, launchChrome, launchWebkit, newPage, report, scrollThrough } from "./lib.mjs";

const url = String(arg("url", SITE));
const sizes = arg("sizes") ? String(arg("sizes")).split(",") : SIZES;

function detect(W) {
  const F = { overlap: [], clipped: [], wide: [], headline: [], ctaWrap: [], nav: [], edge: [], tap: [] };
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
  // one layout system: every section title is centred on the page, its text centred in its box
  const mid = document.documentElement.clientWidth / 2;
  for (const e of document.querySelectorAll("main section h2, footer h2")) {
    if (hidden(e)) continue;
    const r = e.getBoundingClientRect();
    const id = e.closest("[id]")?.id || "footer";
    if (Math.abs(r.left + r.width / 2 - mid) > 2) F.edge.push(`#${id} title box centre at x ${Math.round(r.left + r.width / 2)}, the page centre at ${Math.round(mid)}`);
    if (getComputedStyle(e).textAlign !== "center") F.edge.push(`#${id} title text is not centred`);
  }
  // phone: tap targets of at least 44 x 44
  if (W < 768) {
    for (const el of document.querySelectorAll("a[href], button")) {
      if (hidden(el)) continue;
      if (el.closest("p, li > p") && getComputedStyle(el).display === "inline") continue;
      const r = el.getBoundingClientRect();
      if (r.height < 43.5 || r.width < 43.5) F.tap.push(`${label(el)} "${el.textContent.trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
  }
  for (const k of Object.keys(F)) F[k] = [...new Set(F[k])];
  return F;
}

// the nav strip, scrolled to each section in turn: opaque enough to hide what passes under it, and the section's own
// text lands below it (scroll-margin), never behind it
function navCheck() {
  const nav = document.querySelector("nav[aria-label=Main]");
  const out = [];
  const bg = getComputedStyle(nav).backgroundColor.match(/[\d.]+/g)?.map(Number) || [0, 0, 0, 0];
  if ((bg[3] ?? 1) < 0.85) out.push(`nav strip background alpha ${bg[3] ?? 1} (needs 0.85 or more)`);
  const nb = nav.getBoundingClientRect();
  for (const sec of document.querySelectorAll("main section[id]")) {
    sec.scrollIntoView({ block: "start", behavior: "instant" });
    const h = sec.querySelector("h2");
    if (!h) continue;
    const r = h.getBoundingClientRect();
    if (r.top < nb.bottom - 1 && r.bottom > nb.top) out.push(`#${sec.id} title runs under the nav (title top ${Math.round(r.top)}, nav bottom ${Math.round(nb.bottom)})`);
  }
  return out;
}

const browser = await launch();
const rows = [];
// the real phones, in both engines
// (once, on the chromium pass: these runs open both engines themselves)
for (const [engine, open, phone] of ENGINE !== "chromium" ? [] : [["chromium", launchChrome, "iPhone 14"], ["webkit", launchWebkit, "iPhone 14"], ["chromium", launchChrome, "iPhone SE"], ["webkit", launchWebkit, "iPhone SE"]]) {
  let b;
  try { b = await open(); } catch (e) { rows.push([`${engine} ${phone} runs`, false, `${String(e).split("\n")[0]} (npm run qa:setup installs WebKit)`]); continue; }
  const { ctx, page, width } = await devicePage(b, phone);
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(2500);
  await scrollThrough(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1200);
  const f = await page.evaluate(detect, width);
  for (const [k, v] of Object.entries(f)) rows.push([`${engine} ${phone} ${k}`, v.length === 0, v.slice(0, 4).join(" | ")]);
  const n = await page.evaluate(navCheck);
  rows.push([`${engine} ${phone} no section title behind the nav`, n.length === 0, n.slice(0, 4).join(" | ")]);
  // pixels: hide the bar's own contents, screenshot the bar (above its 1 px hairline) at several depths, and require
  // every pixel to be the bar colour; anything else is page content showing through
  const seen = [];
  for (const y of [1200, 2500, 4000, 5000, 7000]) {
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await page.waitForTimeout(400);
    const box = await page.evaluate(() => {
      const nav = document.querySelector("nav[aria-label=Main]");
      for (const c of nav.children) c.style.visibility = "hidden";
      const r = nav.getBoundingClientRect();
      const bg = getComputedStyle(nav).backgroundColor.match(/[\d.]+/g).map(Number);
      return { x: 0, y: Math.max(0, r.top), width: Math.floor(r.width), height: Math.floor(r.height) - 2, bg };
    });
    const png = await page.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: box.height } });
    const worst = await page.evaluate(async ({ b64, bg }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let m = 0;
      for (let i = 0; i < d.length; i += 4) m = Math.max(m, Math.abs(d[i] - bg[0]), Math.abs(d[i + 1] - bg[1]), Math.abs(d[i + 2] - bg[2]));
      return m;
    }, { b64: png.toString("base64"), bg: box.bg });
    await page.evaluate(() => { for (const c of document.querySelector("nav[aria-label=Main]").children) c.style.visibility = ""; });
    if (worst > 6) seen.push(`at y ${y} a bar pixel is ${worst} off the bar colour`);
  }
  rows.push([`${engine} ${phone} nothing shows through the nav bar (pixels)`, seen.length === 0, seen.slice(0, 3).join(" | ")]);
  await ctx.close();
  await b.close();
}
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
