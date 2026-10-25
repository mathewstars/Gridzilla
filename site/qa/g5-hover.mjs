// G5 hover and press: every pill button and every card changes its background colour, transform (or translate/scale)
// or shadow when the mouse rests on it, compared with its resting style; every button and pill on the page is matched
// by an :active rule in the built CSS. At 1440x900, after the reveals have run.
import fs from "node:fs";
import path from "node:path";
import { SITE, arg, launch, newPage, report, scrollThrough } from "./lib.mjs";

const url = String(arg("url", SITE));
const TARGETS = ".pill, .card, .trailer-card, [data-card]";
const PROPS = ["backgroundColor", "transform", "translate", "scale", "boxShadow"];

const browser = await launch();
const { page } = await newPage(browser, "1440x900");
await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(1500);
await scrollThrough(page, 80);
await page.waitForTimeout(800);

const count = await page.evaluate((sel) => {
  const els = [...document.querySelectorAll(sel)];
  els.forEach((e, i) => e.setAttribute("data-g5", String(i)));
  return els.length;
}, TARGETS);

const results = [];
const style = (i) => page.evaluate(([i, props]) => {
  const el = document.querySelector(`[data-g5="${i}"]`);
  const cs = getComputedStyle(el);
  const name = (el.getAttribute("aria-label") || el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 40) || el.className.split(" ")[0];
  const where = el.closest("section[id], header, footer")?.id || el.closest("footer, header")?.tagName.toLowerCase() || "page";
  return { name, where, kind: el.classList.contains("pill") ? "pill" : "card", s: Object.fromEntries(props.map((p) => [p, cs[p]])) };
}, [i, PROPS]);

for (let i = 0; i < count; i++) {
  const loc = page.locator(`[data-g5="${i}"]`);
  if (!(await loc.isVisible())) continue;
  await loc.scrollIntoViewIfNeeded();
  await page.mouse.move(2, 2);
  await page.waitForTimeout(450);
  const rest = await style(i);
  await loc.hover({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(450);
  const hover = await style(i);
  const changed = PROPS.filter((p) => rest.s[p] !== hover.s[p]);
  results.push([`hover changes the ${rest.kind} "${rest.name}" (${rest.where})`, changed.length > 0, changed.length ? changed.join(", ") : "no change in background, transform or shadow"]);
}
await page.mouse.move(2, 2);

// :active rules, read from the stylesheets the built page loaded (Tailwind nests them in layers and media blocks)
const press = await page.evaluate(() => {
  const active = [];
  const walk = (rules) => {
    for (const r of rules) {
      if (r.selectorText && r.selectorText.includes(":active")) active.push(r.selectorText);
      if (r.cssRules) walk(r.cssRules);
    }
  };
  for (const s of document.styleSheets) { try { walk(s.cssRules); } catch {} }
  const bases = active.flatMap((sel) => sel.split(",")).filter((s) => s.includes(":active")).map((s) => s.replace(/:active/g, "").replace(/:not\(\)/g, "").trim() || "*");
  // the element itself, or a child it presses (group-active), is matched once :active is stripped from the rule
  const hits = (el) => bases.some((b) => { try { return el.matches(b) || !!el.querySelector(b); } catch { return false; } });
  const els = [...document.querySelectorAll("button, a.pill")];
  return { rules: active.length, missing: els.filter((e) => !hits(e) && e.getClientRects().length).map((e) => (e.getAttribute("aria-label") || e.innerText).replace(/\s+/g, " ").trim().slice(0, 40)), total: els.length };
});
await browser.close();

const dist = path.join(path.dirname(new URL(import.meta.url).pathname), "../../platform/static/site/assets");
const css = fs.existsSync(dist) ? fs.readdirSync(dist).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(path.join(dist, f), "utf8")).join("\n") : "";
results.push(["built CSS has a .pill:active rule", /\.pill:active/.test(css), css ? "" : `no CSS in ${dist}`]);
for (const tone of ["dark", "light", "onnight"]) results.push([`built CSS has a .pill-${tone}:active rule`, new RegExp(`\\.pill-${tone}:active`).test(css), ""]);
results.push([`every button and pill (${press.total}) has an :active rule (${press.rules} rules found)`, press.missing.length === 0, press.missing.join(" | ")]);

process.exit(report("G5", results) ? 1 : 0);
