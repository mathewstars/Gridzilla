// npm run qa: build the site, serve the build with `vite preview` on :5181, run every gate (qa/g*.mjs, in order),
// stop the server, exit non-zero if any gate failed. Flags: --no-build, --only g2 (one gate), --url (test elsewhere).
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { arg } from "./lib.mjs";

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
  server = spawn("npx", ["vite", "preview", "--port", "5181", "--strictPort"], { cwd: root, stdio: ["ignore", "pipe", "pipe"], env: process.env });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("vite preview did not start")), 20000);
    server.stdout.on("data", (d) => { if (/Local/.test(String(d))) { clearTimeout(t); res(); } });
    server.on("exit", (c) => rej(new Error(`vite preview exited ${c}`)));
  });
}

const gates = fs.readdirSync(here).filter((f) => /^g\d.*\.mjs$/.test(f)).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1))).filter((f) => !only || f.startsWith(`${only}-`) || f === `${only}.mjs`);
let failed = 0;
for (const g of gates) {
  console.log(`\n== ${g}`);
  const r = spawnSync("node", [path.join(here, g), ...(ext ? ["--url", String(ext)] : [])], { cwd: root, stdio: "inherit", env: process.env });
  if (r.status) failed++;
}
server?.kill();
console.log(`\n${failed ? `FAIL: ${failed} of ${gates.length} gates` : `PASS: all ${gates.length} gates`}`);
process.exit(failed ? 1 : 0);
