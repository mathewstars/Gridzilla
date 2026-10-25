// G3 copy: the rendered text has no em or en dash, no lorem, no TODO, no forbidden word, no "[", no double spaces;
// at most one eyebrow (a small uppercase tracked label) on the whole page. The forbidden word is also kept out of
// the source (src/, qa/, index.html).
import fs from "node:fs";
import path from "node:path";
import { SITE, arg, launch, newPage, report, scrollThrough } from "./lib.mjs";

const url = String(arg("url", SITE));
const BANNED_WORD = ["capt", "ain"].join("");
const browser = await launch();
const { page } = await newPage(browser, "1440x900");
await page.goto(url, { waitUntil: "networkidle" });
await scrollThrough(page);
const { text, eyebrows, alts } = await page.evaluate(() => {
  const eyebrows = [];
  for (const el of document.querySelectorAll("body *")) {
    if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    if (el.closest("nav, button, a, svg")) continue;
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize);
    const ls = parseFloat(cs.letterSpacing) / fs;
    if (cs.textTransform === "uppercase" && fs <= 15 && ls >= 0.04) eyebrows.push(el.textContent.trim().slice(0, 40));
  }
  const alts = [...document.querySelectorAll("img[alt]")].map((i) => i.alt).filter(Boolean).join("\n");
  return { text: document.body.innerText, eyebrows, alts };
});
await browser.close();

const all = `${text}\n${alts}`;
const find = (re) => (all.match(re) || []).slice(0, 3).map((m) => JSON.stringify(m)).join(" ");
const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const srcHits = [];
const walk = (d) => {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) { if (!/node_modules|shots/.test(f.name)) walk(p); }
    else if (/\.(tsx?|mjs|css|html|md)$/.test(f.name) && new RegExp(BANNED_WORD, "i").test(fs.readFileSync(p, "utf8"))) srcHits.push(path.relative(root, p));
  }
};
["src", "qa"].forEach((d) => walk(path.join(root, d)));
if (new RegExp(BANNED_WORD, "i").test(fs.readFileSync(path.join(root, "index.html"), "utf8"))) srcHits.push("index.html");

process.exit(report("G3", [
  ["no em dash", !/—/.test(all), find(/.{0,20}—.{0,20}/g)],
  ["no en dash", !/–/.test(all), find(/.{0,20}–.{0,20}/g)],
  ["no lorem", !/lorem/i.test(all), find(/.{0,20}lorem.{0,20}/gi)],
  ["no TODO", !/TODO/.test(all), find(/.{0,20}TODO.{0,20}/g)],
  ["no forbidden word on the page", !new RegExp(BANNED_WORD, "i").test(all), ""],
  ["no forbidden word in the source", srcHits.length === 0, srcHits.join(", ")],
  ["no [", !/\[/.test(all), find(/.{0,20}\[.{0,20}/g)],
  ["no double spaces", !/\S {2,}\S/.test(all), find(/.{0,20}\S {2,}\S.{0,20}/g)],
  ["at most one eyebrow", eyebrows.length <= 1, eyebrows.join(" | ")],
]) ? 1 : 0);
