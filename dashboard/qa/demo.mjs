// Demo gates (demo-polish.md), #/demo in the console and bare (?bare=1, the deck's embed), dark and light, all at once:
//   G1 soak: 0 console errors / page errors over --seconds (default 60).
//   G4 legend keys: both legends list all their keys at t = 2 s and t = 20 s after load. The hero shows dad's six keys
//      (muted while a series has no data, never missing); the Blatnica card shows its one key (also while it waits).
// usage: node qa/demo.mjs [--dev] [--seconds 60] [--size 1920x1080] [--q hero=blatnica]
import { arg, launch, stageUrl } from "./lib.mjs";

const dev = !!arg("dev", false);
const secs = Number(arg("seconds", 60));
const [W, H] = String(arg("size", "1920x1080")).split("x").map(Number);
const extra = String(arg("q", "")); // e.g. --q hero=blatnica: the demo in Blatnica mode (its legend keys are checked instead)
const plantMode = /hero=blatnica/.test(extra);

const PLANT = ["Grid kW (measured)", "Import limit", "Battery SoC"];
const HERO = ["With Gridzilla (measured)", "Without Gridzilla (what the houses would draw)", "Peak eaten", "Charging moved", "The plan", "Limit"];
const BLAT = ["Grid kW, + import − export, last 30 min"];
const CELLS = [["console", "dark"], ["console", "light"], ["bare", "dark"], ["bare", "light"]];

const keysAt = (page) =>
  page.evaluate(() => {
    const keys = (sel) => [...document.querySelectorAll(`${sel} [data-key]`)].filter((e) => getComputedStyle(e).display !== "none").map((e) => e.dataset.key);
    return { hero: keys(".demo-curve .lc-legend"), blat: keys(".blat .lc-legend") };
  });
const missing = (got, want) => want.filter((k) => !got.includes(k));

const browser = await launch();
const results = await Promise.all(
  CELLS.map(async ([mode, theme]) => {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error" && !/favicon/.test(m.text())) errors.push(m.text().slice(0, 160)); });
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
    const t0 = Date.now();
    await page.goto(stageUrl(dev) + `?${mode === "bare" ? "bare=1&" : ""}theme=${theme}${extra ? "&" + extra : ""}#/demo`, { waitUntil: "domcontentloaded", timeout: 30000 });
    const legend = [];
    for (const at of [2, 20]) {
      await page.waitForTimeout(Math.max(0, at * 1000 - (Date.now() - t0)));
      const k = await keysAt(page);
      const m = [...missing(k.hero, plantMode ? PLANT : HERO).map((x) => `hero "${x}"`), ...missing(k.blat, BLAT).map((x) => `blatnica "${x}"`)];
      if (m.length) legend.push(`t=${at}s missing ${m.join(", ")}`);
    }
    await page.waitForTimeout(Math.max(0, secs * 1000 - (Date.now() - t0)));
    await ctx.close();
    return { cell: `${mode}/${theme}`, console: [...new Set(errors)], legend };
  }),
);
await browser.close();
const g1 = results.reduce((n, r) => n + r.console.length, 0);
const g4 = results.reduce((n, r) => n + r.legend.length, 0);
const bad = results.filter((r) => r.console.length || r.legend.length);
console.log(JSON.stringify({ gate: "G1 soak + G4 legend keys", seconds: secs, size: `${W}x${H}`, G1: g1, G4: g4, bad }, null, 1));
process.exitCode = g1 + g4 ? 1 : 0;
