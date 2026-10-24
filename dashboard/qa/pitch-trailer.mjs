// Copies dad's trailer into the pitch at build time (it is 16 MB, so it is not committed twice):
// docs/Gridzilla-trailer.mp4 from this checkout, else from origin/main (git fetch first), to public/pitch/trailer.mp4.
// usage: node qa/pitch-trailer.mjs   (run by npm run pitch:dev / pitch:preview / pitch:pdf)
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const dst = new URL("../public/pitch/trailer.mp4", import.meta.url);
const local = new URL("../../docs/Gridzilla-trailer.mp4", import.meta.url);
try {
  if (fs.existsSync(local)) fs.copyFileSync(local, dst);
  else {
    try {
      execFileSync("git", ["fetch", "-q", "origin"], { stdio: "ignore" });
    } catch {
      /* offline: use what origin/main already has */
    }
    fs.writeFileSync(dst, execFileSync("git", ["show", "origin/main:docs/Gridzilla-trailer.mp4"], { maxBuffer: 64 * 1024 * 1024 }));
  }
  console.log(`trailer: ${fs.statSync(dst).size} bytes in public/pitch/trailer.mp4`);
} catch (e) {
  console.warn(`trailer: not copied (${String(e).slice(0, 120)}); slide 0 will skip straight to the title`);
}
