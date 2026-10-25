// Renders og/og.html to public/og.png at 1200x630 (the link preview image). usage: npm run og
import path from "node:path";
import { chromium } from "playwright-core";

const here = path.dirname(new URL(import.meta.url).pathname);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(`file://${path.join(here, "og.html")}`);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.join(here, "../public/og.png") });
await browser.close();
console.log("public/og.png written");
