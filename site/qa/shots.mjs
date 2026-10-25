// Screenshots for review at the five sizes: the first screen and the whole page, into qa/shots/.
// usage: node qa/shots.mjs [--url URL] [--sizes 1440x900,390x844] [--copy DIR]
import fs from "node:fs";
import { SIZES, SITE, arg, launch, newPage, scrollThrough } from "./lib.mjs";

const url = String(arg("url", SITE));
const sizes = arg("sizes") ? String(arg("sizes")).split(",") : SIZES;
const out = new URL("./shots/", import.meta.url).pathname;
fs.mkdirSync(out, { recursive: true });
const copy = arg("copy");

const browser = await launch();
for (const size of sizes) {
  const { ctx, page } = await newPage(browser, size);
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${out}fold-${size}.png` });
  await scrollThrough(page, 150);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}page-${size}.png`, fullPage: true });
  await ctx.close();
  console.log(`shot ${size}: ${out}fold-${size}.png ${out}page-${size}.png`);
}
await browser.close();
if (copy) {
  fs.mkdirSync(copy, { recursive: true });
  for (const f of fs.readdirSync(out).filter((f) => f.endsWith(".png"))) fs.copyFileSync(out + f, `${copy}/${f}`);
  console.log(`copied to ${copy}`);
}
