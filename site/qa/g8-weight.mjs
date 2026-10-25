// G8 weight, on the build in platform/static/site (npm run qa builds it first; this gate builds it when it is
// missing): the JS the landing page loads (the entry script and its modulepreloads) is at most 300 KB gzipped, every
// chunk listed; every console screenshot (public/shots, webp) is at most 250 KB; the trailer is never preloaded (no
// preload link for an mp4, every <video> preload none or metadata, no mp4 request on a load and full scroll); fonts
// are preloaded only for faces used above the fold at 1440x900 and 390x844; the LCP element is the hero headline or
// the console image, and an image LCP has fetchpriority high.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { spawnSync } from "node:child_process";
import { ENGINE, SITE, arg, launch, newPage, report, scrollThrough } from "./lib.mjs";

const url = String(arg("url", SITE));
const here = path.dirname(new URL(import.meta.url).pathname);
const dist = path.join(here, "../../platform/static/site");
if (!fs.existsSync(path.join(dist, "index.html"))) spawnSync("npm", ["run", "build"], { cwd: path.join(here, ".."), stdio: "inherit" });

const results = [];
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const html = fs.readFileSync(path.join(dist, "index.html"), "utf8");
const base = "/static/site/";
const local = (href) => path.join(dist, href.replace(base, ""));

// landing JS
const entry = [...html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g)].map((m) => m[1]);
const preloads = [...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)].map((m) => m[1]);
const landing = [...new Set([...entry, ...preloads])];
let total = 0;
const assets = path.join(dist, "assets");
const allJs = fs.readdirSync(assets).filter((f) => f.endsWith(".js"));
for (const f of allJs) {
  const gz = zlib.gzipSync(fs.readFileSync(path.join(assets, f)), { level: 9 }).length;
  const onLanding = landing.some((h) => h.endsWith(`/${f}`));
  if (onLanding) total += gz;
  console.log(`INFO G8 chunk ${f}: ${kb(gz)} gzipped${onLanding ? " (landing)" : " (lazy)"}`);
}
results.push([`landing JS ${kb(total)} gzipped across ${landing.length} chunk(s), at most 300 KB`, total <= 300 * 1024 && landing.length > 0, landing.map((h) => path.basename(h)).join(", ")]);
for (const lib of ["react", "motion", "charts"]) results.push([`${lib} is its own chunk`, allJs.some((f) => f.startsWith(`${lib}-`)), ""]);

// console screenshots
const shotsDir = path.join(dist, "shots");
const shots = fs.existsSync(shotsDir) ? fs.readdirSync(shotsDir) : [];
results.push(["console screenshots are in the build", shots.length > 0, shotsDir]);
for (const f of shots) {
  const n = fs.statSync(path.join(shotsDir, f)).size;
  results.push([`screenshot ${f} is webp and at most 250 KB`, f.endsWith(".webp") && n <= 250 * 1024, kb(n)]);
}

// trailer and fonts in the html
const preloadLinks = [...html.matchAll(/<link[^>]+rel="preload"[^>]*>/g)].map((m) => m[0]);
results.push(["no preload link for the trailer (mp4)", !preloadLinks.some((l) => /\.mp4/.test(l)), preloadLinks.filter((l) => /\.mp4/.test(l)).join(" ")]);
const fontPreloads = preloadLinks.filter((l) => /as="font"/.test(l)).map((l) => path.basename(l.match(/href="([^"]+)"/)[1], ".woff2"));

const browser = await launch();
const usedAbove = new Set();
for (const size of ["1440x900", "390x844", "390x667", "430x932"]) {
  const { ctx, page, width } = await newPage(browser, size);
  const mp4 = [];
  const mesh = [];
  const shots = [];
  page.on("request", (r) => { if (/\.mp4(\?|$)/.test(r.url())) mp4.push(r.url()); if (/MeshLight/.test(r.url())) mesh.push(r.url()); });
  page.on("response", async (r) => { if (/shots\/console[^/]*\.webp/.test(r.url())) shots.push({ url: r.url(), bytes: (await r.body().catch(() => Buffer.alloc(0))).length }); });
  await page.addInitScript(() => {
    window.__lcp = [];
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp.push(e); }).observe({ type: "largest-contentful-paint", buffered: true }); } catch {}
  });
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.waitForTimeout(2000);

  const fold = await page.evaluate(() => {
    const faces = new Set();
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      if (!n.textContent.trim()) continue;
      const el = n.parentElement;
      const r = el.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= innerHeight || !r.width) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || el.closest("[hidden], [aria-hidden=true]")) continue;
      const fam = cs.fontFamily.split(",")[0].replace(/["']/g, "").trim();
      faces.add(`${fam.replace(/\s+/g, "")}-${cs.fontWeight}`);
    }
    const lcp = window.__lcp.at(-1);
    const el = lcp?.element;
    return {
      faces: [...faces],
      lcp: el ? { tag: el.tagName.toLowerCase(), inH1: !!el.closest("h1"), hero: !!el.closest("header"), src: el.currentSrc || el.getAttribute?.("src") || "", fp: el.getAttribute?.("fetchpriority") || "", text: (el.innerText || "").slice(0, 40) } : null,
      videos: [...document.querySelectorAll("video")].map((v) => v.getAttribute("preload")),
    };
  });
  fold.faces.forEach((f) => usedAbove.add(f));
  console.log(`INFO G8 ${size} faces above the fold: ${fold.faces.join(", ")}`);

  const l = fold.lcp;
  const isHeadline = l && (l.tag === "h1" || l.inH1);
  const isConsole = l && l.tag === "img" && /console/.test(l.src);
  // WebKit has no largest-contentful-paint API: the LCP checks are Chrome's
  if (ENGINE === "chromium") {
    results.push([`${size} LCP element is the hero headline or the console image`, !!(isHeadline || isConsole), l ? `${l.tag} ${l.src || JSON.stringify(l.text)}` : "no LCP entry"]);
    if (l?.tag === "img") results.push([`${size} the LCP image has fetchpriority high`, l.fp === "high", l.src]);
  } else console.log(`INFO G8/webkit ${size} LCP not checked (WebKit has no LCP API)`);
  results.push([`${size} every <video> on load has preload none or metadata`, fold.videos.every((p) => p === "none" || p === "metadata"), fold.videos.join(", ")]);

  // the phone gets the light as a static gradient (no shader chunk) and its own console copy, at most 120 KB
  if (width < 768) {
    results.push([`${size} the mesh shader is not loaded under 768 px`, mesh.length === 0, mesh.join(" ")]);
    const big = shots.filter((s) => s.bytes > 120 * 1024 || !/console-phone/.test(s.url));
    results.push([`${size} the console image is the phone copy, at most 120 KB`, shots.length > 0 && big.length === 0, shots.map((s) => `${path.basename(s.url)} ${(s.bytes / 1024).toFixed(1)} KB`).join(", ") || "no console image"]);
  } else results.push([`${size} the mesh shader loads (lazily) on a desktop`, mesh.length > 0, ""]);

  await scrollThrough(page, 80);
  results.push([`${size} no trailer request on a load and full scroll`, mp4.length === 0, mp4.join(" ")]);
  await ctx.close();
}

// the trailer dialog's video, once opened, also asks for none or metadata (it autoplays on the click, that is fine)
{
  const { ctx, page } = await newPage(browser, "1440x900");
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(1500);
  const btn = page.getByRole("button", { name: "Watch the trailer" }).first();
  if (await btn.count()) {
    await btn.click();
    await page.waitForTimeout(400);
    const pre = await page.evaluate(() => [...document.querySelectorAll("video")].map((v) => v.getAttribute("preload")));
    results.push(["the trailer dialog's <video> has preload none or metadata", pre.length > 0 && pre.every((p) => p === "none" || p === "metadata"), pre.join(", ") || "no video after the click"]);
  }
  await ctx.close();
}
await browser.close();

for (const f of fontPreloads) results.push([`preloaded font ${f} is used above the fold`, usedAbove.has(f), `above the fold: ${[...usedAbove].join(", ")}`]);
results.push([`at most two font faces preloaded`, fontPreloads.length <= 2, fontPreloads.join(", ")]);

process.exit(report("G8", results) ? 1 : 0);
