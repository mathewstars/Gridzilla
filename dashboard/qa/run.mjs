// `npm run qa`: the stage gates in order (goal.md). G1 build + typecheck, G2 data truth, G3 layout matrix, G1 runtime + G5 motion and
// performance. Stops at the first failing gate unless --all. Visual judging (G4) runs separately, over the screenshots this leaves.
// usage: npm run qa [-- --dev] [-- --quick]   (--quick: current state only, a few sizes, no recordings; for builders)
import { execSync } from "node:child_process";
import fs from "node:fs";
import { arg } from "./lib.mjs";

const dev = !!arg("dev", false);
const quick = !!arg("quick", false);
const all = !!arg("all", false);
const out = String(arg("out", `/tmp/gzqa/run-${new Date().toISOString().slice(11, 19).replace(/:/g, "")}`));
fs.mkdirSync(out, { recursive: true });
const flag = dev ? " --dev" : "";
const steps = [
  ["G1 build", "npx tsc --noEmit -p . && npm run build --silent && rm -f tsconfig.tsbuildinfo", !dev],
  ["G2 truth", `node qa/truth.mjs${flag} --out ${out}/truth${quick ? " --sizes 1440x900" : ""}`, true],
  ["G3 layout", `node qa/layout.mjs${flag} --out ${out}/layout${quick ? " --states quick --sizes 1240x635,1022x884,1440x900,390x844" : ""}`, true],
  ["G1+G5 live", `node qa/live.mjs${flag} --out ${out}/live${quick ? " --g1-seconds 15 --no-rec" : ""}`, true],
];
const summary = [];
let failed = false;
for (const [name, cmd, run] of steps) {
  if (!run) { summary.push({ gate: name, skipped: true }); continue; }
  if (failed && !all) { summary.push({ gate: name, skipped: "earlier gate failed" }); continue; }
  const t0 = Date.now();
  let ok = true, tail = "";
  try { tail = execSync(cmd, { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64e6 }).toString(); }
  catch (e) { ok = false; tail = `${e.stdout || ""}${e.stderr || ""}`; failed = true; }
  summary.push({ gate: name, ok, seconds: Math.round((Date.now() - t0) / 1000), tail: tail.slice(-3000) });
  console.log(`${ok ? "PASS" : "FAIL"} ${name} (${Math.round((Date.now() - t0) / 1000)} s)`);
}
fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 1));
console.log(`summary: ${out}/summary.json`);
process.exitCode = failed ? 1 : 0;
