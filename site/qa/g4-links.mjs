// G4 links and buttons: every <a> has a real href; in-page anchors point at an id that exists; every outside link
// answers below 400 (HEAD, then GET when HEAD is refused; read-only); every <button> has a click handler; the three
// shared CTA labels ("Open the console", "Watch the trailer", "Read the protocol") are written exactly that way
// wherever their intent appears, and no other CTA label carries those intents. Checked at 1440x900 and 390x844 (the
// phone renders the menu sheet's links too). A CTA is a pill or a button; the footer's small text links are
// navigation and are listed, not judged.
import fs from "node:fs";
import { ENGINE, SITE, arg, launch, newPage, report, scrollThrough } from "./lib.mjs";

const url = String(arg("url", SITE));
// the console address, from the one file that holds every outside link
const CONSOLE = fs.readFileSync(new URL("../src/lib/links.ts", import.meta.url), "utf8").match(/console:\s*"([^"#]+)/)[1];
const INTENTS = {
  console: { label: "Open the console", match: (href) => href.startsWith(CONSOLE) },
  protocol: { label: "Read the protocol", match: (href) => /PROTOCOL\.md/.test(href) },
  trailer: { label: "Watch the trailer", match: (href) => /\.mp4($|\?)/.test(href) },
};
const NAME_HINT = { console: /console/i, protocol: /protocol|spec/i, trailer: /trailer|video|film/i };

const browser = await launch();
const results = [];
const anchors = new Map(); // href -> where
const ctaRows = [];
let buttonsChecked = 0;
const notes = new Set(); // small text links that share an intent (navigation, not a CTA): listed, not judged

for (const size of ["1440x900", "390x844"]) {
  const { ctx, page } = await newPage(browser, size);
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(1500);
  await scrollThrough(page, 80);
  // open the phone menu so its sheet is in the DOM
  if (size.startsWith("390")) {
    const menu = page.locator('nav button[aria-expanded]').first();
    if (await menu.count()) { await menu.click(); await page.waitForTimeout(500); }
  }

  const dom = await page.evaluate(() => {
    const name = (el) => (el.getAttribute("aria-label") || el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
    const reactProps = (el) => { const k = Object.keys(el).find((x) => x.startsWith("__reactProps$")); return k ? el[k] : null; };
    const where = (el) => el.closest("section[id], header, footer, nav")?.id || el.closest("section, header, footer, nav")?.tagName.toLowerCase() || "page";
    const links = [...document.querySelectorAll("a")].map((a) => ({
      raw: a.getAttribute("href"), href: a.href, name: name(a), cta: a.classList.contains("pill"), where: where(a),
      target: a.getAttribute("target"), rel: a.getAttribute("rel") || "",
    }));
    const ids = new Set([...document.querySelectorAll("[id]")].map((e) => e.id));
    const buttons = [...document.querySelectorAll("button")].map((b, i) => {
      b.setAttribute("data-g4", String(i));
      const p = reactProps(b);
      return { i, name: name(b), where: where(b), react: !!(p && (p.onClick || p.onPointerDown || p.onMouseDown)), native: !!b.onclick, submit: b.type === "submit" && !!b.form };
    });
    return { links, ids: [...ids], buttons };
  });

  // the DevTools protocol (listener lookup) is Chrome's only; on WebKit a button counts by its React or native handler
  const cdp = ENGINE === "chromium" ? await ctx.newCDPSession(page) : null;
  for (const b of dom.buttons) {
    let listeners = 0;
    if (!b.react && !b.native && cdp) {
      const { result } = await cdp.send("Runtime.evaluate", { expression: `document.querySelector('[data-g4="${b.i}"]')` });
      if (result.objectId) listeners = (await cdp.send("DOMDebugger.getEventListeners", { objectId: result.objectId })).listeners.filter((l) => /click|pointer|mouse/.test(l.type)).length;
    }
    buttonsChecked++;
    results.push([`${size} button "${b.name || "(no name)"}" (${b.where}) has a click handler`, b.react || b.native || b.submit || listeners > 0, ""]);
  }

  const ids = new Set(dom.ids);
  for (const l of dom.links) {
    const label = `${size} link "${l.name.slice(0, 40)}" (${l.where})`;
    const real = !!l.raw && l.raw.trim() !== "" && l.raw !== "#" && !/^javascript:/i.test(l.raw);
    if (!real) { results.push([`${label} has a real href`, false, `href=${JSON.stringify(l.raw)}`]); continue; }
    if (l.raw.startsWith("#")) {
      results.push([`${label} points at an existing id ${l.raw}`, ids.has(decodeURIComponent(l.raw.slice(1))), ""]);
      continue;
    }
    if (/^https?:/.test(l.href) && !l.href.startsWith(new URL(url).origin)) {
      if (!anchors.has(l.href)) anchors.set(l.href, label);
      if (l.target === "_blank" && !/noopener|noreferrer/.test(l.rel)) results.push([`${label} opens a new tab with rel=noopener`, false, l.href]);
    } else if (/^mailto:/.test(l.href)) {
      results.push([`${label} mailto has an address`, /^mailto:[^@\s]+@[^@\s]+\.[a-z]{2,}/i.test(l.href), l.href]);
    }
    if (l.cta) ctaRows.push({ size, name: l.name, href: l.href, where: l.where, kind: "link" });
    else if (Object.values(INTENTS).some((v) => v.match(l.href)) && !Object.values(INTENTS).some((v) => v.label === l.name)) notes.add(`text link "${l.name}" (${l.where}) -> ${l.href}`);
  }

  // close the phone menu again before clicking through the buttons
  if (size.startsWith("390")) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  }
  // which buttons start the trailer: click each visible one and see whether a <video> appears or starts playing (the
  // trailer plays inline in its strip under the hero), then stop it again. The strip's own play control is part of
  // the player, not a page CTA: listed, not judged.
  const playing = () => page.evaluate(() => [...document.querySelectorAll("video")].some((v) => !v.paused));
  const stopAll = () => page.evaluate(() => document.querySelectorAll("video").forEach((v) => v.pause()));
  for (const b of dom.buttons) {
    const loc = page.locator(`[data-g4="${b.i}"]`);
    if (!(await loc.isVisible().catch(() => false))) continue;
    if (/close|menu/i.test(b.name)) continue;
    if (await loc.evaluate((e) => !!e.closest(".trailer-tile")).catch(() => false)) {
      notes.add(`player control "${b.name}" (${b.where}) plays the trailer in its tile`);
      continue;
    }
    const before = await page.locator("video").count();
    await loc.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(800);
    const opened = (await page.locator("video").count()) > before || (await playing());
    if (opened) {
      ctaRows.push({ size, name: b.name, href: "(starts the trailer)", where: b.where, kind: "button", intent: "trailer" });
      await stopAll();
      await page.keyboard.press("Escape");
      await page.waitForTimeout(350);
    } else ctaRows.push({ size, name: b.name, href: "", where: b.where, kind: "button" });
  }
  await ctx.close();
}
await browser.close();

// outside links: HEAD, then GET when HEAD is not allowed (GitHub and some hosts refuse HEAD)
async function status(u) {
  for (const method of ["HEAD", "GET"]) {
    try {
      const r = await fetch(u, { method, redirect: "follow", signal: AbortSignal.timeout(15000), headers: { "user-agent": "Mozilla/5.0 gridzilla-site-qa" } });
      if (method === "GET") r.body?.cancel();
      if (r.status < 400 || method === "GET") return r.status;
    } catch (e) {
      if (method === "GET") return `error ${e.cause?.code || e.name}`;
    }
  }
}
for (const [href, label] of anchors) {
  const s = await status(href);
  results.push([`outside link answers < 400: ${href}`, typeof s === "number" && s < 400, `${s} (first seen: ${label})`]);
}

// CTA intents: every CTA whose target is a shared intent carries exactly its label, and no CTA with that label
// (or a name that hints at the intent) points elsewhere
for (const c of ctaRows) {
  const intent = c.intent || Object.keys(INTENTS).find((k) => c.href && INTENTS[k].match(c.href));
  if (intent) {
    results.push([`${c.size} ${intent} CTA (${c.where}) reads "${INTENTS[intent].label}"`, c.name === INTENTS[intent].label, `found "${c.name}"`]);
    continue;
  }
  for (const [k, v] of Object.entries(INTENTS)) {
    if (c.name === v.label) results.push([`${c.size} "${c.name}" (${c.where}) does what its label says`, false, `goes to ${c.href || "nothing"}`]);
    else if (NAME_HINT[k].test(c.name) && !/close/i.test(c.name)) results.push([`${c.size} CTA "${c.name}" (${c.where}) does not carry the ${k} intent under another label`, false, c.href]);
  }
}
const seen = new Set(ctaRows.filter((c) => c.intent || Object.keys(INTENTS).some((k) => c.href && INTENTS[k].match(c.href))).map((c) => c.name));
for (const v of Object.values(INTENTS)) results.push([`label "${v.label}" is on the page`, seen.has(v.label), ""]);
for (const n of notes) console.log(`INFO G4 ${n}`);
console.log(`G4 checked ${anchors.size} outside links, ${buttonsChecked} buttons, ${ctaRows.length} CTAs`);

process.exit(report("G4", results) ? 1 : 0);
