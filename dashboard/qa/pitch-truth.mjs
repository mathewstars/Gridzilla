// G2 data truth for the pitch: on every slide, each number on screen is either live (traces to the API payload the
// page fetched, window.__gz, and matches it) or a labelled figure (data-src="deck" + data-label). Same convention and
// the same audit() as qa/truth.mjs (copied below, unchanged, so the stage gate and the pitch gate agree).
// usage: node qa/pitch-truth.mjs [--base http://localhost:5175/pitch.html] [--sizes 1920x1080] [--out DIR]
import fs from "node:fs";
import { arg, launch, newPage } from "./lib.mjs";

const base = String(arg("base", "http://localhost:5175/pitch.html"));
const sizes = String(arg("sizes", "1920x1080")).split(",");
const out = String(arg("out", "/tmp/gzpitch/truth"));
fs.mkdirSync(out, { recursive: true });
const SLIDES = [
  { n: 1, steps: 1 }, { n: 2, steps: 2 }, { n: 3, steps: 4 }, { n: 4, steps: 2 },
  { n: 5, steps: 1, wait: 12000 }, { n: 6, steps: 1 }, { n: 7, steps: 2 },
];

// ---- audit() copied verbatim from qa/truth.mjs ----
function audit() {
  const gz = window.__gz || {};
  const get = (path) => {
    const [ep, ...rest] = path.trim().split("/");
    let v = gz[ep];
    for (const k of rest) { if (v == null) return undefined; v = v[k]; }
    return v;
  };
  // derived formulas: arithmetic over paths, plus count(...) / sum(...) over collections (qa/README.md)
  const val = (o, path) => path.split("/").reduce((v, k) => (v == null ? v : v[k]), o);
  const splitPath = (q) => { const out = []; let cur = "", depth = 0; for (const c of q) { if (c === "[") depth++; if (c === "]") depth--; if (c === "/" && !depth) { out.push(cur); cur = ""; } else cur += c; } out.push(cur); return out; };
  const cond = (item, expr) => expr.split(/\s+and\s+/).every((cl) => {
    const m = cl.trim().match(/^(abs\()?([\w:./-]+)\)?\s*(==|=|!=|>=|<=|>|<|\s+in\s+)\s*(.+)$/);
    if (!m) { const v = val(item, cl.trim()); return v != null && v !== false; }
    let lhs = val(item, m[2]);
    if (m[1] && typeof lhs === "number") lhs = Math.abs(lhs);
    const op = m[3].trim(), raw = m[4].trim();
    if (op === "in") return raw.split(",").map((x) => x.trim()).includes(String(lhs));
    let rhs;
    if (raw === "null") rhs = null; else if (raw === "true") rhs = true; else if (raw === "false") rhs = false;
    else if (!Number.isNaN(Number(raw))) rhs = Number(raw);
    else { const neg = raw.startsWith("-"); const v = val(item, neg ? raw.slice(1) : raw); rhs = v === undefined ? raw : neg ? -v : v; }
    if (op === "=" || op === "==") return lhs == rhs;
    if (op === "!=") return lhs != rhs;
    if (lhs == null || rhs == null) return false;
    return op === ">" ? lhs > rhs : op === ">=" ? lhs >= rhs : op === "<" ? lhs < rhs : lhs <= rhs;
  });
  const agg = (fn, q) => {
    let cur = [gz];
    for (const seg of splitPath(q.trim())) {
      const m = seg.match(/^([^[]*)((?:\[[^\]]*\])*)$/);
      const key = m[1];
      const filters = [...m[2].matchAll(/\[([^\]]*)\]/g)].map((x) => x[1]);
      cur = key.endsWith("*")
        ? cur.flatMap((o) => (o && typeof o === "object" ? Object.entries(o).filter(([k]) => k.startsWith(key.slice(0, -1))).map(([, v]) => v) : []))
        : cur.map((o) => (o == null ? undefined : o[key]));
      for (const f of filters) cur = cur.filter((it) => it != null && cond(it, f));
    }
    cur = cur.filter((v) => v != null);
    return fn === "count" ? cur.length : cur.reduce((a, v) => a + (typeof v === "number" ? v : 0), 0);
  };
  const evalFrom = (expr) => {
    let e = expr.replace(/\b(count|sum)\(((?:[^()]|\([^()]*\))*)\)/g, (_, fn, q) => `(${agg(fn, q)})`);
    e = e.split(/(\s+|[()])/).map((tok) => {
      if (!/^[a-z][^\s]*\//i.test(tok)) return tok;
      const v = get(tok);
      return typeof v === "number" ? `(${v})` : "NaN";
    }).join("");
    if (!/^[\d\s.()+\-*/eNa]+$/.test(e)) return NaN;
    try { return Function(`return (${e})`)(); } catch { return NaN; }
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
    const text = host.getAttribute("aria-label") || [...host.querySelectorAll("[aria-label]")].map((e) => e.getAttribute("aria-label")).find((l) => /\d/.test(l)) || host.textContent; // Counter: the settled value, not a mid-glide frame
    const shown = parseFloat((text.match(/[-−]?\d[\d,]*(?:\.\d+)?/) || [""])[0].replace(/−/, "-").replace(/,/g, ""));
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
for (const size of sizes)
  for (const s of SLIDES)
    for (let step = 0; step < s.steps; step++) {
      const { ctx, page, errors } = await newPage(browser, size);
      await page.goto(`${base}?slide=${s.n}&step=${step}&freeze=end`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(s.wait ?? 4000);
      const { F, fetched } = await page.evaluate(audit);
      if (errors.length) F.console = errors;
      const count = Object.values(F).reduce((a, v) => a + v.length, 0);
      results.push({ size, slide: s.n, step, count, F, fetched });
      await ctx.close();
    }
await browser.close();
const total = results.reduce((a, r) => a + r.count, 0);
fs.writeFileSync(`${out}/truth.json`, JSON.stringify(results, null, 1));
console.log(JSON.stringify({ gate: "G2", total, results: results.filter((r) => r.count).map((r) => ({ cell: `${r.size} slide ${r.slide} step ${r.step}`, ...Object.fromEntries(Object.entries(r.F).filter(([, v]) => v.length).map(([k, v]) => [k, v.slice(0, 8)])) })) }, null, 1));
process.exitCode = total ? 1 : 0;
