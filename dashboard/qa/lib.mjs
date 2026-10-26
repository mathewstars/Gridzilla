// Shared bits of the stage QA gates (see qa/README.md). Headless Chrome on the real GPU (Metal), so 3D frame rates are honest.
import { chromium } from "playwright-core";

export const SIZES = ["2560x1440", "1920x1080", "1680x1050", "1440x900", "1280x800", "1240x635", "1022x884", "1024x600", "390x844", "390x667", "360x740"];
/** The phone matrix (qa/README.md "Phones"): portrait small, short and large, and landscape. */
export const PHONES = ["390x844", "390x667", "430x932", "844x390"];
/** A phone viewport (src/phone.ts): under 900 wide or 500 tall; it gets a touch screen and the mobile viewport. */
export const isPhone = (w, h) => w < 900 || h <= 500;
export const SCENARIOS = ["normal", "cold-evening", "sunny-noon", "live-weather"];
export const API = process.env.GZ_QA_API || "http://localhost:8081/api";

export function arg(k, d) {
  const i = process.argv.indexOf(`--${k}`);
  if (i < 0) return d;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
}

/** The stage URL: the built page on the local platform, or the Vite dev server with --dev. */
export function stageUrl(dev, page = "stage") {
  // GZ_QA_BASE points the gates at another server (e.g. http://localhost:8241/static/new/ for a second local platform)
  const base = process.env.GZ_QA_BASE || (dev ? "http://127.0.0.1:5174/static/new/" : "http://localhost:8081/static/new/");
  if (page === "B") return base + "b.html";
  return base + (dev ? "" : "index.html");
}

export const launch = () =>
  chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });

/** reducedMotion: "reduce" | "no-preference" (the gates run phones both ways). */
export async function newPage(browser, size, reducedMotion = "no-preference") {
  const [width, height] = size.split("x").map(Number);
  const phone = isPhone(width, height);
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone, reducedMotion });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => {
    if ((m.type() === "error" || m.type() === "warning") && !/favicon|DevTools|GPU stall|GL Driver Message/i.test(m.text())) errors.push(`${m.type()}: ${m.text().slice(0, 180)}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 180)}`));
  return { ctx, page, errors, width, height };
}

export async function scenario(name, settleMs = 10000) {
  await fetch(`${API}/scenario/${name}`, { method: "POST" }).catch(() => {});
  await new Promise((r) => setTimeout(r, settleMs));
}

export async function currentScenario() {
  const s = await fetch(`${API}/state?tree=0`).then((r) => r.json()).catch(() => null);
  return s?.scenario?.name ?? null;
}

/** Run jobs with a fixed number in flight. */
export async function pool(jobs, n) {
  const q = [...jobs];
  await Promise.all(Array.from({ length: n }, async () => { while (q.length) await q.shift()(); }));
}

/** Wait until the stage shows live data (the page has fetched /api/state and left the splash), then let it settle. */
export async function ready(page, settleMs = 4000, maxMs = 90000) {
  await page.waitForFunction(() => !!window.__gz?.state && !/Connecting to the grid|Waiting for the platform/.test(document.body.innerText), null, { timeout: maxMs, polling: 500 }).catch(() => {});
  await page.waitForTimeout(settleMs);
}
