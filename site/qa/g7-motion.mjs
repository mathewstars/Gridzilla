// G7 reduced motion: with prefers-reduced-motion: reduce emulated, load at 1440x900 and wait 1 s, without scrolling:
// no rendered element is left at opacity 0 or with a non-identity transform (translate, scale, rotate included), and
// the page's text equals the text of a normal load that was scrolled through and let settle. The live tile's
// request is cut in both loads so its numbers cannot differ between them.
import { SITE, arg, launch, newPage, report, scrollThrough } from "./lib.mjs";

const url = String(arg("url", SITE));
const browser = await launch();
const cutLive = (page) => page.route(/\/(live-)?api\//, (r) => r.abort());
const text = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());

// the normal load, for the reference text
const normal = await newPage(browser, "1440x900");
await cutLive(normal.page);
await normal.page.goto(url, { waitUntil: "load", timeout: 60000 });
await normal.page.waitForTimeout(1500);
await scrollThrough(normal.page, 150);
await normal.page.waitForTimeout(2500); // tickers settle
const normalText = await text(normal.page);
await normal.ctx.close();

const reduced = await newPage(browser, "1440x900", { reducedMotion: "reduce" });
await cutLive(reduced.page);
await reduced.page.goto(url, { waitUntil: "load", timeout: 60000 });
await reduced.page.waitForTimeout(1000);
const left = await reduced.page.evaluate(() => {
  const out = { hidden: [], moved: [] };
  const label = (el) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""} "${(el.innerText || el.getAttribute("alt") || "").replace(/\s+/g, " ").trim().slice(0, 30)}"`;
  const identity = (v) => !v || v === "none" || v === "matrix(1, 0, 0, 1, 0, 0)" || v === "matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)";
  const plain = (v) => !v || v === "none" || /^0px( 0px)*$/.test(v) || v === "1" || v === "1 1" || v === "0deg";
  for (const el of document.querySelectorAll("body *")) {
    if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") continue;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    if (parseFloat(cs.opacity) === 0) out.hidden.push(label(el));
    // layout centring with -translate-x-1/2 is not motion: only report it when it is not a whole -50 % shift
    const moved = !identity(cs.transform) || !plain(cs.scale) || !plain(cs.rotate) || (!plain(cs.translate) && !/^-50%|^calc\(-50%/.test(cs.translate) && !/-50%/.test(el.style.translate || ""));
    if (moved) out.moved.push(`${label(el)} transform=${cs.transform} translate=${cs.translate} scale=${cs.scale}`);
  }
  return out;
});
const reducedText = await text(reduced.page);
await reduced.ctx.close();
await browser.close();

let diff = "";
if (reducedText !== normalText) {
  let i = 0;
  while (i < reducedText.length && reducedText[i] === normalText[i]) i++;
  diff = `first difference at char ${i}: reduced "${reducedText.slice(Math.max(0, i - 30), i + 40)}" vs normal "${normalText.slice(Math.max(0, i - 30), i + 40)}"`;
}
process.exit(report("G7", [
  ["no element left at opacity 0", left.hidden.length === 0, left.hidden.slice(0, 8).join(" | ")],
  ["no element left with a transform", left.moved.length === 0, left.moved.slice(0, 8).join(" | ")],
  ["same text as a normal load", reducedText === normalText, diff],
]) ? 1 : 0);
