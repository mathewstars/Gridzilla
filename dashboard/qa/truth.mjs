// G2 data truth: every number on screen must trace to the live API payload the page fetched (window.__gz) and match it.
// Convention (qa/README.md): an element showing a live number carries
//   data-src="state/aggregates/tf:x/total_kw"  (endpoint/path into window.__gz; '/' separated, keys may contain ':')
//   data-src="derived" data-from="state/aggregates/tf:x/baseline_kw - state/aggregates/tf:x/total_kw"  (+ - * / and parentheses)
//   data-src="deck"   for a labelled static fact from the pitch deck (allowed, must also have data-label)
//   data-src="axis"   on a chart axis / tick group (scaffolding, not a fact)
//   data-val="<raw number>" the value it shows before formatting, data-scale="0.001" when shown in other units (kW -> MW)
// usage: node qa/truth.mjs [--dev] [--sizes 1440x900,390x844] [--out DIR]
import fs from "node:fs";
import { arg, launch, newPage, stageUrl } from "./lib.mjs";

const dev = !!arg("dev", false);
const sizes = String(arg("sizes", "1440x900,390x844")).split(",");
const out = String(arg("out", "/tmp/gzqa/truth"));
fs.mkdirSync(out, { recursive: true });

function audit() {
  const gz = window.__gz || {};
  const get = (path) => {
    const [ep, ...rest] = path.trim().split("/");
    let v = gz[ep];
    for (const k of rest) { if (v == null) return undefined; v = v[k]; }
    return v;
  };
  const evalFrom = (expr) => {
    const js = expr.replace(/[a-z_]+\/[^\s()+\-*/]+(?:\/[^\s()+*/]+)*/gi, (p) => { const v = get(p); return typeof v === "number" ? `(${v})` : "NaN"; });
    if (!/^[\d\s.()+\-*/eNa]+$/.test(js)) return NaN;
    try { return Function(`return (${js})`)(); } catch { return NaN; }
  };
  const visible = (el) => {
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.05 || e.classList?.contains("sr-only")) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const sample = /[?&](weather|plant)=sample/.test(location.search);
  const F = { untraced: [], mismatch: [], shownVsVal: [], missingData: [], fixture: [] };
  const seen = new Set();
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const t = n.textContent;
    if (!/\d/.test(t) || !n.parentElement || !visible(n.parentElement)) continue;
    const host = n.parentElement.closest("[data-src]");
    if (!host) { F.untraced.push(t.trim().slice(0, 50)); continue; }
    if (seen.has(host)) continue;
    seen.add(host);
    const src = host.dataset.src;
    if (src === "axis") continue;
    if (src === "deck") { if (!host.dataset.label) F.untraced.push(`deck fact without data-label: ${t.trim().slice(0, 40)}`); continue; }
    if (src === "sample") { if (!sample) F.fixture.push(t.trim().slice(0, 40)); continue; }
    const val = parseFloat(host.dataset.val);
    const truth = src === "derived" ? evalFrom(host.dataset.from || "") : get(src);
    if (truth === undefined || truth === null || Number.isNaN(truth)) { F.missingData.push(`${src}${host.dataset.from ? " = " + host.dataset.from : ""}`); continue; }
    if (typeof truth === "number" && !Number.isNaN(val)) {
      const tol = Math.max(0.6, Math.abs(truth) * 0.01);
      if (Math.abs(val - truth) > tol) F.mismatch.push(`${src}: page ${val} vs api ${truth}`);
    }
    // the text on screen must be the formatted data-val (after the counter settles)
    const shown = parseFloat((host.textContent.match(/[-−]?\d[\d,]*(?:\.\d+)?/) || [""])[0].replace(/−/, "-").replace(/,/g, ""));
    const scale = parseFloat(host.dataset.scale || "1");
    if (!Number.isNaN(val) && !Number.isNaN(shown)) {
      const want = val * scale;
      const tol = Math.max(0.51, Math.abs(want) * 0.01) * (host.dataset.abs ? 1 : 1);
      if (Math.abs(Math.abs(shown) - Math.abs(want)) > tol) F.shownVsVal.push(`${src}: shows ${shown}, data-val ${want}`);
    }
  }
  for (const k of Object.keys(F)) F[k] = [...new Set(F[k])];
  return { F, fetched: Object.keys(gz).filter((k) => !k.endsWith("@")) };
}

const browser = await launch();
const results = [];
for (const size of sizes) {
  const { ctx, page } = await newPage(browser, size);
  await page.goto(stageUrl(dev), { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(12000);
  // freshness: what the page holds must be the live platform's current state (seq within a few ticks)
  const pageSeq = await page.evaluate(() => window.__gz?.state?.seq ?? null);
  const apiSeq = await fetch("http://localhost:8081/api/state?tree=0").then((r) => r.json()).then((s) => s.seq).catch(() => null);
  const { F, fetched } = await page.evaluate(audit);
  if (pageSeq == null) F.missingData.push("window.__gz.state missing (page fetched nothing?)");
  else if (apiSeq != null && Math.abs(apiSeq - pageSeq) > 40) F.mismatch.push(`stale state: page seq ${pageSeq}, api seq ${apiSeq}`);
  const count = Object.values(F).reduce((a, v) => a + v.length, 0);
  results.push({ size, count, F, fetched });
  await ctx.close();
}
await browser.close();
const total = results.reduce((a, r) => a + r.count, 0);
fs.writeFileSync(`${out}/truth.json`, JSON.stringify(results, null, 1));
console.log(JSON.stringify({ gate: "G2", total, results: results.map((r) => ({ size: r.size, count: r.count, ...Object.fromEntries(Object.entries(r.F).filter(([, v]) => v.length).map(([k, v]) => [k, v.slice(0, 8)])) })) }, null, 1));
process.exitCode = total ? 1 : 0;
