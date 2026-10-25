// G9 live tile: serve the build with /live-api pointed at a dead port (GZ_LIVE_API=http://127.0.0.1:9, its own
// `vite preview` on GZ_PORT + 1 or GZ_DEAD_PORT), then: the Real plant tile shows the quiet fallback "Live data
// unavailable right now", and G1 still holds over the same 60 s scroll at 1440x900 (0 console errors, 0 failed
// requests) apart from the cut live calls themselves. With --url the page is used as it is (its server must already
// point /live-api at a dead port).
import { spawn } from "node:child_process";
import path from "node:path";
import { PORT, arg, launch, newPage, report } from "./lib.mjs";

const FALLBACK = "Live data unavailable right now";
const LIVE = /\/live-api\/|\/api\/state/;
const secs = Number(arg("secs", 60));
const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..");

let server = null;
let url = arg("url");
if (!url) {
  const port = Number(process.env.GZ_DEAD_PORT || PORT + 1);
  server = spawn("npx", ["vite", "preview", "--port", String(port), "--strictPort"], { cwd: root, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GZ_LIVE_API: "http://127.0.0.1:9" } });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("vite preview (dead live api) did not start")), 20000);
    server.stdout.on("data", (d) => { if (/Local/.test(String(d))) { clearTimeout(t); res(); } });
    server.on("exit", (c) => rej(new Error(`vite preview exited ${c}`)));
  });
  url = `http://localhost:${port}/static/site/`;
}

const browser = await launch();
const { page } = await newPage(browser, "1440x900");
// the shared collectors in lib.mjs keep only the message text; here the source url is needed to set the live calls aside
const errors = [];
const failed = [];
const live = [];
page.on("console", (m) => {
  if (m.type() !== "error" || /favicon/i.test(m.text())) return;
  if (LIVE.test(m.location()?.url || "") || LIVE.test(m.text())) live.push(`console: ${m.text().slice(0, 120)}`);
  else errors.push(m.text().slice(0, 200));
});
page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 200)}`));
page.on("requestfailed", (r) => { if (LIVE.test(r.url())) live.push(`${r.failure()?.errorText} ${r.url()}`); else if (!/favicon/.test(r.url())) failed.push(`${r.failure()?.errorText} ${r.url()}`); });
page.on("response", (r) => { if (r.status() < 400) return; if (LIVE.test(r.url())) live.push(`${r.status()} ${r.url()}`); else if (!/favicon/.test(r.url())) failed.push(`${r.status()} ${r.url()}`); });

await page.goto(String(url), { waitUntil: "networkidle" });
const plant = page.locator("#plant");
const hasPlant = (await plant.count()) > 0;
if (hasPlant) await plant.scrollIntoViewIfNeeded();
await page.waitForTimeout(6000);
const tile = hasPlant ? (await plant.innerText()).replace(/\s+/g, " ") : "";
const spinner = hasPlant ? await plant.locator('[role="progressbar"], [aria-busy="true"], .spinner, .animate-spin').count() : 0;

// the G1 scroll, top to bottom over the remaining time
const h = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
const steps = 40;
for (let i = 1; i <= steps; i++) {
  await page.evaluate((y) => window.scrollTo(0, y), Math.round((h * i) / steps));
  await page.waitForTimeout(Math.max(0, (secs - 16) * 1000) / steps);
}
await page.waitForTimeout(10000);
await browser.close();
server?.kill();

console.log(`INFO G9 live calls set aside: ${live.length}${live.length ? ` (${live.slice(0, 3).join(" | ")})` : ""}`);
process.exit(report("G9", [
  ["the Real plant section is on the page", hasPlant, ""],
  ["the page asked for live data (and the dead port refused it)", live.length > 0, "no /live-api request was made: the live tile is not wired yet"],
  [`the tile shows "${FALLBACK}"`, tile.includes(FALLBACK), tile ? `section text: ${JSON.stringify(tile.slice(0, 160))}` : ""],
  ["the tile shows no spinner", spinner === 0, ""],
  ["no console errors apart from the live call", errors.length === 0, errors.slice(0, 5).join(" | ")],
  ["no failed requests apart from the live call", failed.length === 0, failed.slice(0, 5).join(" | ")],
]) ? 1 : 0);
