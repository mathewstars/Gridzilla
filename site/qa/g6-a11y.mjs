// G6 accessibility, at 1440x900 and 390x844 after a full scroll so every section is revealed:
// - axe-core (WCAG 2 A/AA + best practice) finds 0 serious or critical violations;
// - every <img> has a non-empty alt;
// - contrast AA on all text, measured on the real pixels: each text is hidden for a moment, the exact box it sits in
//   is screenshotted, and its colour (with its alpha) is compared with the worst pixel behind it (the darkest and the
//   brightest, at the 2nd and 98th percentile so anti-aliasing does not count). This works on the dark tokens, over
//   the shader canvas, scrims, gradients and screenshots alike, where axe cannot judge. Each finding prints the
//   element's text; body text under 7:1 is listed as INFO (the design target), not a failure.
import { AxeBuilder } from "@axe-core/playwright";
import { SITE, arg, launch, newPage, report, scrollThrough } from "./lib.mjs";

const url = String(arg("url", SITE));
const browser = await launch();
const results = [];

for (const size of ["1440x900", "390x844"]) {
  const { ctx, page } = await newPage(browser, size);
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(1500);
  await scrollThrough(page, 80);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1200);

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"]).analyze();
  const bad = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const textOf = (sel) => page.evaluate((s) => { try { return (document.querySelector(s)?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 60); } catch { return ""; } }, sel);
  for (const v of bad) {
    const where = [];
    for (const n of v.nodes.slice(0, 4)) where.push(`${n.target.join(" ")} "${await textOf(n.target.join(" "))}"${n.any?.[0]?.message ? ` (${n.any[0].message.slice(0, 120)})` : ""}`);
    results.push([`${size} axe ${v.impact}: ${v.id}`, false, `${v.help}; ${v.nodes.length} node(s): ${where.join(" | ")}`]);
  }
  results.push([`${size} axe: 0 serious or critical violations`, bad.length === 0, bad.length ? bad.map((v) => v.id).join(", ") : `${axe.passes.length} rules passed`]);
  for (const v of axe.violations.filter((v) => !bad.includes(v))) console.log(`INFO G6 ${size} axe ${v.impact}: ${v.id} (${v.nodes.length} node(s)) ${v.help}`);

  const imgs = await page.evaluate(() => [...document.querySelectorAll("img")].map((i) => ({ src: i.getAttribute("src"), alt: i.getAttribute("alt") })));
  const noAlt = imgs.filter((i) => !i.alt || !i.alt.trim());
  results.push([`${size} every <img> (${imgs.length}) has a non-empty alt`, noAlt.length === 0, noAlt.map((i) => i.src).join(" | ")]);

  // contrast on the real pixels: every rendered element that carries text of its own
  const n = await page.evaluate(() => {
    // hides a text and its children's text (and currentColor icons) while its box is screenshotted
    const st = document.createElement("style");
    st.textContent = "[data-g6-hide], [data-g6-hide] * { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; transition: none !important; }";
    document.head.append(st);
    let i = 0;
    for (const el of document.querySelectorAll("body *")) {
      if (el.closest("svg, [aria-hidden=true], video, [role=dialog], .sr-only")) continue;
      if (![...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) continue;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || el.getClientRects().length === 0) continue;
      el.setAttribute("data-g6", String(i++));
    }
    return i;
  });
  const below = [];
  for (let i = 0; i < n; i++) {
    const info = await page.evaluate((i) => {
      const el = document.querySelector(`[data-g6="${i}"]`);
      el.scrollIntoView({ block: "center", behavior: "instant" });
      const rects = [];
      for (const c of el.childNodes) {
        if (c.nodeType !== 3 || !c.textContent.trim()) continue;
        const r = document.createRange();
        r.selectNodeContents(c);
        rects.push(...[...r.getClientRects()].filter((x) => x.width > 1 && x.height > 1));
      }
      if (!rects.length) return null;
      const x = Math.max(0, Math.floor(Math.min(...rects.map((r) => r.left))));
      const y = Math.max(0, Math.floor(Math.min(...rects.map((r) => r.top))));
      const w = Math.min(innerWidth, Math.ceil(Math.max(...rects.map((r) => r.right)))) - x;
      const h = Math.min(innerHeight, Math.ceil(Math.max(...rects.map((r) => r.bottom)))) - y;
      if (w < 2 || h < 2) return null;
      // the text's colour, its alpha folded together with every ancestor's opacity
      const cs = getComputedStyle(el);
      const m = cs.color.match(/[\d.]+/g).map(Number);
      let alpha = m[3] ?? 1;
      for (let e = el; e; e = e.parentElement) alpha *= parseFloat(getComputedStyle(e).opacity);
      // text that is invisible by design at this moment (a crossfade's hidden layer) has no contrast to judge; G7
      // covers anything left invisible by mistake
      if (alpha < 0.05) return null;
      // an inline run is hidden with its whole block, so the sentence around it is not taken for background
      let blk = el;
      while (blk.parentElement && getComputedStyle(blk).display.startsWith("inline")) blk = blk.parentElement;
      blk.setAttribute("data-g6-hide", ""); // an attribute, not a class: a React re-render would drop the class
      const px = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight);
      return { clip: { x, y, width: w, height: h }, fg: m.slice(0, 3), alpha, px, large: px >= 24 || (weight >= 700 && px >= 18.66), text: (el.innerText || el.textContent).replace(/\s+/g, " ").trim().slice(0, 50), where: `${el.tagName.toLowerCase()}${typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""} in #${el.closest("[id]")?.id || "page"}` };
    }, i);
    if (!info) continue;
    await page.waitForTimeout(30);
    const png = await page.screenshot({ clip: info.clip, animations: "disabled" });
    await page.evaluate(() => document.querySelectorAll("[data-g6-hide]").forEach((e) => e.removeAttribute("data-g6-hide")));
    const r = await page.evaluate(async ({ b64, fg, alpha }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = new OffscreenCanvas(img.width, img.height);
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, img.width, img.height).data;
      const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      const L = (p) => 0.2126 * lin(p[0]) + 0.7152 * lin(p[1]) + 0.0722 * lin(p[2]);
      const px = [];
      for (let k = 0; k < d.length; k += 4) px.push([d[k], d[k + 1], d[k + 2]]);
      px.sort((a, b) => L(a) - L(b));
      const ends = [px[Math.floor(px.length * 0.02)], px[Math.min(px.length - 1, Math.floor(px.length * 0.98))]];
      const ratio = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
      // the text as drawn: its colour laid over that pixel with its alpha
      const drawn = (bg) => fg.map((v, j) => v * alpha + bg[j] * (1 - alpha));
      const [worst, bg] = ends.map((bg) => [ratio(drawn(bg), bg), bg]).sort((a, b) => a[0] - b[0])[0];
      const hex = (p) => "#" + p.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
      return { worst: Math.round(worst * 100) / 100, bg: hex(bg), fg: hex(fg) };
    }, { b64: png.toString("base64"), fg: info.fg, alpha: info.alpha });
    const need = info.large ? 3 : 4.5;
    const line = `"${info.text}" (${info.where}) ${r.worst}:1 (${r.fg}${info.alpha < 1 ? ` at ${Math.round(info.alpha * 100)} %` : ""} on ${r.bg}, ${info.px}px, needs ${need}:1)`;
    if (r.worst < need) below.push(line);
    else if (!info.large && r.worst < 7) console.log(`INFO G6 ${size} body text under 7:1: ${line}`);
  }
  for (const f of below) results.push([`${size} contrast AA`, false, f]);
  results.push([`${size} contrast AA on all ${n} text elements, on their real pixels`, below.length === 0, below.length ? `${below.length} below AA` : ""]);
  await ctx.close();
}
await browser.close();
process.exit(report("G6", results) ? 1 : 0);
