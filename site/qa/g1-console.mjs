// G1 console: 0 console errors and 0 failed requests over a slow full scroll of the page, 60 s, at 1440x900.
import { SITE, arg, launch, newPage, report } from "./lib.mjs";

const url = String(arg("url", SITE));
const secs = Number(arg("secs", 60));
const browser = await launch();
const { page, errors, failed } = await newPage(browser, "1440x900");
await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(1500);
const h = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
const steps = 40;
for (let i = 1; i <= steps; i++) {
  await page.evaluate((y) => window.scrollTo(0, y), Math.round((h * i) / steps));
  await page.waitForTimeout(((secs - 10) * 1000) / steps);
}
await page.waitForTimeout(10000);
await browser.close();
process.exit(report("G1", [
  ["no console errors", errors.length === 0, errors.slice(0, 5).join(" | ")],
  ["no failed requests", failed.length === 0, failed.slice(0, 5).join(" | ")],
]) ? 1 : 0);
