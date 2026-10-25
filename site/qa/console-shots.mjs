// The real console screenshots the site shows (public/shots/*.webp, 2x, light theme), taken from a LOCAL platform
// (GZ_API, default http://localhost:8190) so nothing here calls the live server's /api/flatten or any write.
// The Real plant view needs the real Blatnica plant: a small proxy on :5189 sends exactly two GET reads to the live
// server (/api/state?hh=blatnica, /api/history?devices=real-powerplant-blatnica) and everything else to the local
// platform; the console runs read-only there (?api=), so it refuses every write anyway.
// usage: node qa/console-shots.mjs [--theme dark|light] [--only console,step-plan,...]   (needs cwebp on PATH)
import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { arg, launch } from "./lib.mjs";

const LOCAL = process.env.GZ_API || "http://localhost:8190";
const LIVE = "https://gridzilla.victronlab.sk";
const THEME = String(arg("theme", "dark")); // the page is the deck's dark theme (owner, 25 Oct)
const ONLY = arg("only") ? String(arg("only")).split(",") : null;
const want = (name) => !ONLY || ONLY.includes(name);
const OUT = new URL("../public/shots/", import.meta.url).pathname;
const TMP = new URL("./shots/raw/", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

const liveRead = (u) => /^\/api\/state\?hh=blatnica\b/.test(u) || /^\/api\/history\?devices=real-powerplant-blatnica\b/.test(u);
const proxy = http.createServer((req, res) => {
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
  if (req.method === "OPTIONS") return res.writeHead(204, cors).end();
  const toLive = liveRead(req.url);
  if (toLive && req.method !== "GET") return res.writeHead(405, cors).end();
  const target = new URL(req.url, toLive ? LIVE : LOCAL);
  const lib = target.protocol === "https:" ? https : http;
  const up = lib.request(target, { method: req.method, headers: { accept: "application/json" } }, (r) => {
    res.writeHead(r.statusCode, { ...cors, "content-type": r.headers["content-type"] || "application/json" });
    r.pipe(res);
  });
  up.on("error", () => res.writeHead(502, cors).end());
  req.pipe(up);
});
await new Promise((r) => proxy.listen(5189, r));

const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const hideChrome = () => page.addStyleTag({ content: ".ops-ro{display:none!important}" });

/** The rounded white panel that holds the element whose own text is `text`. */
async function panel(text) {
  const h = await page.evaluateHandle((t) => {
    const all = [...document.querySelectorAll("body *")].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().startsWith(t)));
    for (let e = all[0]; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (parseFloat(cs.borderTopLeftRadius) >= 12 && e.getBoundingClientRect().width > 300) return e;
    }
    return null;
  }, text);
  return h.asElement();
}

async function save(name, buf, width, as = name) {
  if (!want(name)) return;
  const png = `${TMP}${name}.png`;
  fs.writeFileSync(png, buf);
  const args = ["-quiet", "-q", "80", "-m", "6"];
  if (width) args.push("-resize", String(width), "0");
  execFileSync("cwebp", [...args, png, "-o", `${OUT}${as}.webp`]);
  console.log(`${as}.webp ${Math.round(fs.statSync(`${OUT}${as}.webp`).size / 1024)} KB`);
}

const settle = (ms) => page.waitForTimeout(ms);

// 1. The whole console, Operations (the hero image), with the real plant card live
await page.goto(`${LOCAL}/static/new/index.html?theme=${THEME}&api=http://localhost:5189#/`);
await hideChrome();
await settle(9000);
const whole = await page.screenshot();
await save("console", whole);
// console-phone.webp is NOT made here: it is the console's own phone view (Operations, dark, 390 wide at 2x, cropped to
// 780 x 1100) from the phone build's captures (data/gz-mobile/shots/console-390x844-dark-operations.png)

// 2. The signal: what the AI saw, chose, checked and signed
const ai = await panel("What the AI did");
if (ai) await save("step-signal", await ai.screenshot(), 1200);

// 3. The diet plan for the city
await page.goto(`${LOCAL}/static/new/index.html?theme=${THEME}#/plan`);
await settle(7000);
const plan = await panel("Vienna, all transformers");
if (plan) await save("step-plan", await plan.screenshot(), 1600);

// 4. The real plant (live reads through the proxy)
await page.goto(`${LOCAL}/static/new/index.html?theme=${THEME}&api=http://localhost:5189#/plant`);
await hideChrome();
await settle(9000);
const plant = await panel("Blatnica");
if (plant) await save("step-plant", await plant.screenshot(), 1600);

// 5. The audit log
await page.goto(`${LOCAL}/static/new/index.html?theme=${THEME}#/log`);
await settle(5000);
const log = await panel("Platform log");
if (log) {
  const b = await log.boundingBox();
  await save("step-log", await page.screenshot({ clip: { x: b.x, y: b.y, width: b.width, height: Math.min(b.height, 470) } }), 1600);
}

await browser.close();
proxy.close();
