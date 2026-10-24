// Screenshots of one pitch slide at chosen moments, for builders and judges.
// usage: node qa/pitch-shot.mjs --slide 3 [--step 1] [--at 0.3,4,12,end] [--size 1920x1080,1240x635] [--out DIR] [--base URL]
//   --at   seconds after the slide comes on screen; "end" loads it with ?freeze=end (the final state, no animation)
//   --base defaults to the dev server http://localhost:5175/pitch.html
// Prints the PNG paths and any console errors or warnings as JSON.
import fs from "node:fs";
import { launch } from "./lib.mjs";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i < 0 ? d : process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : true;
};
const slide = Number(arg("slide", 1));
const step = Number(arg("step", 0));
const ats = String(arg("at", "0.3,end")).split(",");
const sizes = String(arg("size", "1920x1080")).split(",");
const out = String(arg("out", `/tmp/gzpitch/shots/s${slide}`));
const base = String(arg("base", "http://localhost:5175/pitch.html"));
const theme = String(arg("theme", "dark"));
fs.mkdirSync(out, { recursive: true });

const browser = await launch();
const shots = [];
const errors = [];
for (const size of sizes) {
  const [width, height] = size.split("x").map(Number);
  for (const at of ats) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on("console", (m) => {
      if ((m.type() === "error" || m.type() === "warning") && !/favicon|DevTools|GPU stall|GL Driver/i.test(m.text())) errors.push(`${size} ${at}: ${m.type()}: ${m.text().slice(0, 200)}`);
    });
    page.on("pageerror", (e) => errors.push(`${size} ${at}: pageerror: ${String(e).slice(0, 200)}`));
    const freeze = at === "end" ? "&freeze=end" : "";
    await page.goto(`${base}?theme=${theme}&slide=${slide}&step=${step}${freeze}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(at === "end" ? 2500 : Number(at) * 1000);
    const file = `${out}/${theme}-s${slide}-step${step}-${String(at).replace(".", "_")}-${size}.png`;
    await page.screenshot({ path: file });
    shots.push(file);
    await ctx.close();
  }
}
await browser.close();
console.log(JSON.stringify({ shots, errors }, null, 1));
