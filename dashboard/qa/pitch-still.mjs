// The still of the console for slide 6 on phones (Slide5.tsx shows it under 900 px wide instead of the live iframe).
// Opens the console at 1440x900, device scale 2, in both themes, waits for live data, saves public/pitch/console-<theme>.webp
// and the walkthrough's anchor boxes (the Tour5 selectors, as fractions of the frame) in src/pitch/slides/consoleStill.json.
// Read-only: it only loads the page (GET). usage: node qa/pitch-still.mjs [--base https://gridzilla.victronlab.sk/static/new/index.html]
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { launch, ready } from "./lib.mjs";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i < 0 ? d : process.argv[i + 1];
};
const base = arg("base", "https://gridzilla.victronlab.sk/static/new/index.html");
const W = 1440;
const H = 900;
const pub = new URL("../public/pitch/", import.meta.url).pathname;
const json = new URL("../src/pitch/slides/consoleStill.json", import.meta.url).pathname;
// The walkthrough's anchors, in its order (src/pitch/slides/Tour5.tsx TOUR).
const SELECTORS = [".op2-tonight", ".op2-curve", ".op2-tiles", ".blat", ".bc-chips", '.sb-item[href="#/plan"]', '.sb-item[href="#/plant"]'];

const browser = await launch();
const out = { w: W, h: H, anchors: {} };
for (const theme of ["dark", "light"]) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(`${base}?theme=${theme}#/`, { waitUntil: "load", timeout: 60000 });
  await ready(page, 8000);
  // the help hint and any tooltip off; the page at the top
  await page.evaluate(() => scrollTo(0, 0));
  const anchors = await page.evaluate((sels) => {
    const r = {};
    for (const s of sels) {
      const el = document.querySelector(s);
      if (!el) continue;
      const b = el.getBoundingClientRect();
      let rad = 0;
      for (let x = el, i = 0; x && i < 5; i++, x = x.parentElement) {
        const v = parseFloat(getComputedStyle(x).borderTopLeftRadius);
        if (v > 0) { rad = v; break; }
      }
      r[s] = { x: b.left / innerWidth, y: b.top / innerHeight, w: b.width / innerWidth, h: Math.min(b.height, innerHeight - b.top) / innerHeight, r: rad / innerWidth };
    }
    return r;
  }, SELECTORS);
  if (theme === "dark") out.anchors = anchors;
  const png = `${pub}console-${theme}.png`;
  await page.screenshot({ path: png });
  execFileSync("cwebp", ["-quiet", "-q", "80", png, "-o", `${pub}console-${theme}.webp`]);
  fs.rmSync(png);
  await ctx.close();
}
await browser.close();
// rounded to 4 places: stable diffs
const round = (o) => JSON.parse(JSON.stringify(o, (_, v) => (typeof v === "number" ? Math.round(v * 1e4) / 1e4 : v)));
fs.writeFileSync(json, JSON.stringify(round(out), null, 1) + "\n");
console.log(JSON.stringify(round(out), null, 1));
