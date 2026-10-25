// Shared bits of the site gates (qa/README.md). Headless Chrome through playwright-core, like dashboard/qa/lib.mjs.
import { chromium, webkit, devices } from "playwright-core";

export const SIZES = ["2560x1440", "1440x900", "1024x768", "390x844", "390x667", "430x932"];
/** The port `vite preview` serves the build on (qa/run.mjs starts it); GZ_PORT moves it when 5181 is taken. */
export const PORT = Number(process.env.GZ_PORT || 5181);
/** The page under test: the built site served by `vite preview` (qa/run.mjs starts it), or --url. */
export const SITE = process.env.GZ_SITE_URL || `http://localhost:${PORT}/static/site/`;

export function arg(k, d) {
  const i = process.argv.indexOf(`--${k}`);
  if (i < 0) return d;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
}

/** The engine every gate runs on: chromium (Chrome) or webkit (Safari's engine); `npm run qa` runs both (GZ_ENGINES). */
export const ENGINE = process.env.GZ_ENGINE === "webkit" ? "webkit" : "chromium";
export const launch = () => (ENGINE === "webkit" ? webkit.launch({ headless: true }) : chromium.launch({ channel: "chrome", headless: true }));
export const launchChrome = () => chromium.launch({ channel: "chrome", headless: true });
/** WebKit, the engine of Safari on every iPhone (`npm run qa:setup` installs it once). */
export const launchWebkit = () => webkit.launch({ headless: true });

/** A page on a real device profile (playwright's devices[name]: its viewport, DPR 3, touch, mobile, user agent). */
export async function devicePage(browser, name) {
  const ctx = await browser.newContext({ ...devices[name] });
  const page = await ctx.newPage();
  return { ctx, page, width: devices[name].viewport.width, height: devices[name].viewport.height };
}

export async function newPage(browser, size, opts = {}) {
  const [width, height] = size.split("x").map(Number);
  const phone = width < 500;
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: opts.dpr ?? 1, isMobile: phone, hasTouch: phone, reducedMotion: opts.reducedMotion ?? "no-preference" });
  const page = await ctx.newPage();
  const errors = [];
  const failed = [];
  page.on("console", (m) => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 200)}`));
  page.on("requestfailed", (r) => { if (!/favicon/.test(r.url())) failed.push(`${r.failure()?.errorText} ${r.url()}`); });
  page.on("response", (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) failed.push(`${r.status()} ${r.url()}`); });
  return { ctx, page, errors, failed, width, height };
}

/** Scroll the whole page once, slowly, so every reveal and lazy image fires; then back to the top. */
export async function scrollThrough(page, stepMs = 120) {
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  const vh = await page.evaluate(() => innerHeight);
  for (let y = 0; y < h; y += Math.round(vh * 0.6)) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.waitForTimeout(stepMs);
  }
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(400);
}

export function report(gate, results) {
  let fails = 0;
  for (const [name, ok, detail] of results) {
    if (!ok) fails++;
    console.log(`${ok ? "PASS" : "FAIL"} ${gate}${ENGINE === "webkit" ? "/webkit" : ""} ${name}${detail ? `: ${detail}` : ""}`);
  }
  return fails;
}
