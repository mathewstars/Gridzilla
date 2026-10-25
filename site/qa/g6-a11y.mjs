// G6 accessibility: axe-core (WCAG 2 A/AA rules) finds 0 serious or critical violations at 1440x900 and 390x844,
// after a full scroll so every section is revealed; every <img> has a non-empty alt; every contrast finding is
// printed with the text of the element it was found on (minor ones and "needs review" ones too, as INFO).
import { AxeBuilder } from "@axe-core/playwright";
import { SITE, arg, launch, newPage, report, scrollThrough } from "./lib.mjs";

const url = String(arg("url", SITE));
const browser = await launch();
const results = [];

for (const size of ["1440x900", "390x844"]) {
  const { ctx, page } = await newPage(browser, size);
  await page.goto(url, { waitUntil: "networkidle" });
  await scrollThrough(page, 80);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1200);

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"]).analyze();
  const bad = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  for (const v of bad) {
    const where = v.nodes.slice(0, 4).map((n) => `${n.target.join(" ")}${n.any?.[0]?.message ? ` (${n.any[0].message.slice(0, 120)})` : ""}`).join(" | ");
    results.push([`${size} axe ${v.impact}: ${v.id}`, false, `${v.help}; ${v.nodes.length} node(s): ${where}`]);
  }
  results.push([`${size} axe: 0 serious or critical violations`, bad.length === 0, bad.length ? bad.map((v) => v.id).join(", ") : `${axe.passes.length} rules passed`]);
  for (const v of axe.violations.filter((v) => !bad.includes(v))) console.log(`INFO G6 ${size} axe ${v.impact}: ${v.id} (${v.nodes.length} node(s)) ${v.help}`);

  // contrast, each finding with its text
  const text = async (sel) => page.evaluate((s) => { try { return (document.querySelector(s)?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 60); } catch { return ""; } }, sel);
  for (const [kind, list] of [["violation", axe.violations], ["needs review", axe.incomplete]]) {
    for (const v of list.filter((v) => v.id === "color-contrast" || v.id === "color-contrast-enhanced")) {
      for (const n of v.nodes) {
        const d = n.any?.[0]?.data || {};
        const line = `contrast ${kind} (${v.id}) "${await text(n.target.join(" "))}": ${d.contrastRatio ? `${d.contrastRatio}:1, ${d.fgColor} on ${d.bgColor}, ${d.fontSize} ${d.fontWeight}` : (n.any?.[0]?.message || "").slice(0, 120)}`;
        console.log(`${kind === "violation" && v.id === "color-contrast" ? "FAIL" : "INFO"} G6 ${size} ${line}`);
      }
    }
  }

  // axe leaves text on gradients unjudged: measure it here against every stop colour of the gradients behind it
  // (a text link's own background-image is its hover underline, not its ground) and the first solid ground
  const unjudged = axe.incomplete.filter((v) => v.id === "color-contrast").flatMap((v) => v.nodes).filter((n) => /gradient/.test(n.any?.[0]?.message || "")).map((n) => n.target.join(" "));
  const measured = await page.evaluate((sels) => {
    const rgb = (s) => (s.match(/rgba?\([^)]+\)|#[0-9a-f]{3,8}\b/gi) || []).map((c) => {
      if (c[0] === "#") { const h = c.length === 4 ? c.slice(1).split("").map((x) => x + x).join("") : c.slice(1, 7); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1); }
      const v = c.match(/[\d.]+/g).map(Number); return [v[0], v[1], v[2], v[3] ?? 1];
    });
    const lum = ([r, g, b]) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    return sels.map((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      const fg = rgb(cs.color)[0];
      const grounds = [];
      for (let e = el; e; e = e.parentElement) {
        const c = getComputedStyle(e);
        if (e !== el && !e.classList.contains("t-link") && c.backgroundImage !== "none") grounds.push(...rgb(c.backgroundImage).filter((x) => x[3] > 0.5));
        const bg = rgb(c.backgroundColor)[0];
        if (bg && bg[3] > 0.5) { grounds.push(bg); break; }
      }
      if (!grounds.length) grounds.push([255, 255, 255, 1]);
      const worst = Math.min(...grounds.map((g) => ratio(fg, g)));
      const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight) >= 700;
      const large = size >= 24 || (bold && size >= 18.66);
      return { text: (el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 60), worst: Math.round(worst * 100) / 100, need: large ? 3 : 4.5, size };
    }).filter(Boolean);
  }, unjudged);
  for (const m of measured) results.push([`${size} contrast on a gradient "${m.text}" ${m.worst}:1 (needs ${m.need}:1 at ${m.size}px)`, m.worst >= m.need, ""]);

  const imgs = await page.evaluate(() => [...document.querySelectorAll("img")].map((i) => ({ src: i.getAttribute("src"), alt: i.getAttribute("alt") })));
  const noAlt = imgs.filter((i) => !i.alt || !i.alt.trim());
  results.push([`${size} every <img> (${imgs.length}) has a non-empty alt`, noAlt.length === 0, noAlt.map((i) => i.src).join(" | ")]);
  await ctx.close();
}
await browser.close();
process.exit(report("G6", results) ? 1 : 0);
