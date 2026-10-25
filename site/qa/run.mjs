// npm run qa: build the site, serve the build with `vite preview` on :5181 (GZ_PORT), run every gate (qa/g*.mjs, in order)
// on Chrome and on WebKit (GZ_ENGINES),
// save the review screenshots, stop the server, exit non-zero if any gate failed. Flags: --no-build, --only g2 (one gate), --url (test elsewhere).
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PORT, arg } from "./lib.mjs";

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.join(here, "..");
const only = arg("only");
const ext = arg("url");

if (!arg("no-build") && !ext) {
  const b = spawnSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
  if (b.status) process.exit(b.status);
}

let server = null;
if (!ext) {
  server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { cwd: root, stdio: ["ignore", "pipe", "pipe"], env: process.env, detached: true });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("vite preview did not start")), 20000);
    server.stdout.on("data", (d) => { if (/Local/.test(String(d))) { clearTimeout(t); res(); } });
    server.on("exit", (c) => rej(new Error(`vite preview exited ${c}`)));
  });
}

const gates = fs.readdirSync(here).filter((f) => /^g\d.*\.mjs$/.test(f)).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1))).filter((f) => !only || f.startsWith(`${only}-`) || f === `${only}.mjs`);
// every gate on each engine: Chrome, then WebKit (Safari's engine on every iPhone); GZ_ENGINES=chromium narrows it
const engines = (process.env.GZ_ENGINES || "chromium,webkit").split(",").map((e) => e.trim()).filter(Boolean);
let failed = 0;
let runs = 0;
for (const engine of engines) {
  for (const g of gates) {
    console.log(`\n== ${g} (${engine})`);
    const r = spawnSync("node", [path.join(here, g), ...(ext ? ["--url", String(ext)] : [])], { cwd: root, stdio: "inherit", env: { ...process.env, GZ_ENGINE: engine } });
    runs++;
    if (r.status) failed++;
  }
}
// the review screenshots at the five sizes (qa/shots/, gitignored), on every full run
if (!only) {
  console.log("\n== shots");
  spawnSync("node", [path.join(here, "shots.mjs"), ...(ext ? ["--url", String(ext)] : [])], { cwd: root, stdio: "inherit", env: process.env });
}
// stop only the server this run started: its own process group (npx and the vite under it), never other previews
if (server) try { process.kill(-server.pid); } catch {}
console.log(`\n${failed ? `FAIL: ${failed} of ${runs} gate runs` : `PASS: all ${runs} gate runs (${gates.length} gates on ${engines.join(" and ")})`}`);
process.exit(failed ? 1 : 0);
