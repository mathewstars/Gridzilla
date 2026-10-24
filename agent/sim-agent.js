#!/usr/bin/env node
/**
 * Gridzilla simulated home agent.
 * Runs N simulated houses (battery + PV + load) that behave exactly like the Node-RED agent on a Cerbo GX:
 * verify -> scope -> merge with owner limits -> apply -> ack -> heartbeat watchdog -> revert.
 *
 *   npm install
 *   GZ_PLATFORM=http://localhost:8080 GZ_BROKER=mqtt://localhost:1883 node sim-agent.js [houses.json]
 *
 * One simulated minute per real second (SPEED). Telemetry every 10 s. Clock: UTC.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mqtt = require("mqtt");

const PLATFORM = process.env.GZ_PLATFORM || "http://localhost:8080";
const BROKER = process.env.GZ_BROKER || "mqtt://localhost:1883";
const SPEED = +(process.env.GZ_SPEED || 1);           // simulated minutes per real second
const HB_TIMEOUT_S = 120;                               // revert after this long without heartbeat
const KEYS = path.join(__dirname, "keys");
fs.mkdirSync(KEYS, { recursive: true });

const houses = JSON.parse(fs.readFileSync(process.argv[2] || path.join(__dirname, "houses.json"), "utf8"));
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const log = (dev, msg) => console.log(`${nowIso().slice(11, 19)} ${dev.padEnd(16)} ${msg}`);

// ------------------------------------------------------------ keys
function deviceKey(id) {
  const p = path.join(KEYS, `${id}.key.pem`);
  if (!fs.existsSync(p)) {
    const { privateKey } = crypto.generateKeyPairSync("ed25519");
    fs.writeFileSync(p, privateKey.export({ type: "pkcs8", format: "pem" }));
  }
  const priv = crypto.createPrivateKey(fs.readFileSync(p));
  const pub = crypto.createPublicKey(priv).export({ type: "spki", format: "pem" }).toString();
  return { priv, pub };
}

// Platform key: trust on first use, pinned to disk afterwards.
async function platformKey() {
  const p = path.join(KEYS, "platform.pub.pem");
  if (!fs.existsSync(p)) {
    const pem = await (await fetch(`${PLATFORM}/api/pubkey`)).text();
    fs.writeFileSync(p, pem);
    console.log(`[keys] pinned platform public key from ${PLATFORM} -> ${p}`);
  }
  return crypto.createPublicKey(fs.readFileSync(p));
}

function verifyEnvelope(env, pubKey) {
  if (!env || env.v !== 1 || typeof env.payload !== "string" || typeof env.sig !== "string") return null;
  const ok = crypto.verify(null, Buffer.from(env.payload, "utf8"), pubKey, Buffer.from(env.sig, "base64"));
  return ok ? JSON.parse(env.payload) : null;
}
function sign(doc, privKey) {
  const payload = JSON.stringify(doc);
  const sig = crypto.sign(null, Buffer.from(payload, "utf8"), privKey).toString("base64");
  return JSON.stringify({ v: 1, kid: "dev", payload, sig });
}

// Last accepted seq survives a restart, so a replay inside the 120 s freshness window is still refused.
const seqFile = id => path.join(KEYS, `${id}.seq`);
function loadSeq(id) { try { return +fs.readFileSync(seqFile(id), "utf8") || 0; } catch { return 0; } }
function saveSeq(id, seq) { fs.writeFileSync(seqFile(id), String(seq)); }

// ------------------------------------------------------------ house model
function makeHouse(cfg, keys) {
  return {
    cfg, keys,
    soc: cfg.soc ?? 60,
    simMinutes: (cfg.start_hour ?? 16) * 60,
    lastSeq: loadSeq(cfg.id),
    lastHb: Date.now(),
    signal: null,          // active parsed signal
    effective: null,       // merged limits in force
    grid_kw: 0, load_kw: 0, pv_kw: 0, batt_kw: 0,
    mq: null,
  };
}
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function profiles(h) {
  const hour = (h.simMinutes / 60) % 24;
  const base = h.cfg.base_load_kw ?? 0.6;
  const evening = hour >= 17 && hour <= 21 ? (h.cfg.peak_load_kw ?? 3.5) : 0;
  const morning = hour >= 6 && hour <= 8 ? 1.5 : 0;
  const load = base + evening + morning;
  const sun = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
  const pv = (h.cfg.pv_kwp ?? 6) * sun * 0.7;
  const ev = h.cfg.ev || {};                                   // {kw, plugged:[from,to]} car at home and wanting charge
  const plugged = ev.kw && hour >= (ev.plugged?.[0] ?? 17) && hour < (ev.plugged?.[1] ?? 23);
  if (plugged && h.evDay !== Math.floor(h.simMinutes / 1440)) { h.evDay = Math.floor(h.simMinutes / 1440); h.evNeedKwh = 6 + Math.random() * 20; }   // a commute: 6-26 kWh per day
  const wants = plugged && (h.evNeedKwh || 0) > 0;
  return { load, pv, evMax: wants ? ev.kw : 0 };
}

// Envelope curve: per-slot ceilings that replace the flat import/export caps while the signal runs.
// Slot i covers [valid_from + i*slot_s, +slot_s); after the last slot the last value holds. Export never above the owner's feed-in limit.
function currentLimits(h) {
  const e = h.effective;
  if (!e) return {};
  const env = h.signal && h.signal.envelope;
  if (!env) return { ...e };
  const i = clamp(Math.floor((Date.now() - Date.parse(h.signal.valid_from)) / 1000 / env.slot_s), 0, Infinity);
  const pick = a => (Array.isArray(a) && a.length ? a[Math.min(i, a.length - 1)] : null);
  const out = { ...e, slot: i };
  const mine = env.by_tf && env.by_tf[h.cfg.path[h.cfg.path.length - 1]];   // per-transformer curve beats the segment-wide one
  const imp = pick(mine && env.import_max_kw ? mine : env.import_max_kw), exp = pick(mine && env.export_max_kw ? mine : env.export_max_kw);
  if (imp != null) out.import_max_kw = imp;
  if (exp != null) out.export_max_kw = Math.min(exp, h.cfg.feedin_max_kw);
  return out;
}

function step(h) {
  const { cfg } = h;
  const o = cfg.owner;
  const e = currentLimits(h);                    // effective limits with the current envelope slot applied
  const { load: houseLoad, pv, evMax } = profiles(h);
  const dtH = SPEED / 60;
  // EV charger: the most elastic load. Owner mode charges at full power when plugged in.
  // Under an import cap it is throttled before the battery is touched; under an export cap it soaks the surplus.
  let ev = evMax;
  if (e.import_max_kw != null && ev > 0) {
    const without = houseLoad - pv;                                        // import with no EV and no battery
    ev = clamp(e.import_max_kw - Math.max(0, without), 0, evMax);  // keep the cap with the charger alone if possible
    if (ev < 1.4) ev = 0;                                                    // below 6 A single phase the car stops anyway
  }
  if (e.export_max_kw != null && evMax > 0 && pv - houseLoad > e.export_max_kw)
    ev = Math.min(evMax, pv - houseLoad - e.export_max_kw);        // ABSORB: put the surplus into the car
  if (e.mode === "STRETCH") ev = 0;                  // street dark: no car charging
  // Thermal loads: heat pump and/or electric boiler, each a hot-water tank that cools and gets reheated.
  // The agent moves their setpoints like the ViCare agent does: boost under ABSORB/PREPARE, floor under SUPPORT/STRETCH.
  let hp = 0;
  const heats = Array.isArray(cfg.heat) ? cfg.heat : (cfg.heat ? [cfg.heat] : []);
  if (!h.tanks) h.tanks = heats.map(ht => ({ c: ht.dhw_set_c, set: ht.dhw_set_c, heating: false }));
  const hour = (h.simMinutes / 60) % 24;
  heats.forEach((ht, i) => {
    const tk = h.tanks[i];
    tk.set = e.mode === "ABSORB" || e.mode === "PREPARE" ? ht.boost_c : (e.mode === "SUPPORT" || e.mode === "STRETCH" ? ht.floor_c : ht.dhw_set_c);
    const draw = (hour >= 6 && hour <= 8) || (hour >= 18 && hour <= 22) ? 0.25 : 0.04;          // °C per sim minute: showers morning and evening
    tk.c -= draw * dtH * 60 + 0.01 * dtH * 60;                                                   // plus standing loss
    if (tk.c < tk.set - 5) tk.heating = true;
    if (tk.c >= tk.set) tk.heating = false;
    if (e.mode === "STRETCH") tk.heating = false;                                                // dark street: no thermal load
    if (tk.heating) { hp += ht.kw; tk.c += (ht.type === "heatpump" ? 0.35 : 0.2) * dtH * 60; }  // heat pump ~3x the heat per kW of a resistive boiler
  });
  h.dhw_c = h.tanks[0] ? h.tanks[0].c : null; h.dhw_set_c = h.tanks[0] ? h.tanks[0].set : null;
  h.boiler_c = h.tanks[1] ? h.tanks[1].c : null;
  h.hp_kw = hp;
  const load = houseLoad + ev + hp;
  h.ev_kw = ev;
  if (ev > 0) h.evNeedKwh = Math.max(0, (h.evNeedKwh || 0) - ev * dtH);      // the car fills up and stops
  const islanded = e.mode === "STRETCH";
  let chargeMax = Math.min(cfg.kw, o.max_charge_kw, e.charge_max_kw ?? Infinity);
  let dischargeMax = Math.min(cfg.kw, o.max_discharge_kw, e.discharge_max_kw ?? Infinity);
  if (h.soc >= 100) chargeMax = 0;
  if (h.soc <= o.min_soc) dischargeMax = 0;

  // owner mode: self-consumption
  let surplus = pv - load;
  let batt = surplus > 0 ? Math.min(surplus, chargeMax) : -Math.min(-surplus, dischargeMax); // + charge, - discharge
  let grid = load - pv + batt;                                                                // + import, - export

  if (islanded) {
    // street is dead: no grid at all; the battery covers what dischargeMax allows, the rest of the load is shed
    grid = 0;
    batt = pv >= load ? Math.min(pv - load, chargeMax) : -Math.min(load - pv, dischargeMax);
  } else {
    if (e.max_soc_by != null && h.soc > e.max_soc_by && load > pv) {  // ABSORB make-room: run the house from the battery, no export
      batt = -Math.min(load - pv, dischargeMax); grid = load - pv + batt;
    }
    if (e.target_soc != null && h.soc < e.target_soc) {               // PREPARE: charge from grid
      batt = chargeMax; grid = load - pv + batt;
    }
    if (e.import_max_kw != null && grid > e.import_max_kw) {           // SUPPORT: take N kW only
      const need = grid - e.import_max_kw;
      const extra = Math.min(need, dischargeMax + batt);                // batt may be >0 (charging) -> stop charging first
      batt -= extra; grid = load - pv + batt;
    }
    if (e.export_min_kw != null && grid > -e.export_min_kw) {          // SUPPORT: give at least N kW
      const want = -e.export_min_kw;
      const extra = Math.min(grid - want, dischargeMax + batt);
      batt -= extra; grid = load - pv + batt;
      grid = Math.max(grid, -(cfg.feedin_max_kw));
    }
    if (e.export_max_kw != null && grid < -e.export_max_kw) {          // ABSORB: cap export, charge instead
      const over = -e.export_max_kw - grid;
      const extra = Math.min(over, chargeMax - batt);
      batt += extra; grid = load - pv + batt;
      if (grid < -e.export_max_kw) { h.curtailed_kwh = (h.curtailed_kwh || 0) + (-e.export_max_kw - grid) * dtH; grid = -e.export_max_kw; } // rest is curtailed PV, counted for compensation
    }
  }
  h.soc = clamp(h.soc + (batt * dtH) / cfg.kwh * 100, 0, 100);
  h.load_kw = load; h.pv_kw = pv; h.batt_kw = batt; h.grid_kw = grid;
  h.simMinutes += SPEED;

  // owner reserve reached during a live event: tell the platform once that the limits can no longer be held
  const spending = e.export_min_kw != null || e.import_max_kw != null;
  if (spending && h.soc <= o.min_soc && !h.reportedMinSoc) {
    h.reportedMinSoc = true;
    if (e.export_min_kw != null) { e.export_min_kw = 0; h.effective.export_min_kw = 0; }
    ack(h, h.signal ? h.signal.seq : null, "partial", "min_soc");
  }
  if (!spending) h.reportedMinSoc = false;
  if (!h.effective) h.curtailed_kwh = 0;
}

// ------------------------------------------------------------ agent logic (same as the Node-RED flow)
function merge(h, sig) {
  const o = h.cfg.owner;
  if (o.opt_out) return { eff: null, status: "refused", reason: "opt_out" };
  const eff = { mode: sig.mode, import_max_kw: null, export_max_kw: null, export_min_kw: null, charge_max_kw: null, discharge_max_kw: null, target_soc: null, max_soc_by: null };
  let status = "applied", reason = null;
  if (sig.import_max_kw != null) eff.import_max_kw = sig.import_max_kw;
  if (sig.export_max_kw != null) eff.export_max_kw = Math.min(sig.export_max_kw, h.cfg.feedin_max_kw); // never above the owner's feed-in limit
  if (sig.mode === "STRETCH") eff.export_max_kw = 0;                        // street is dark: lock export, no backfeed
  if (sig.charge_max_kw != null) eff.charge_max_kw = Math.min(sig.charge_max_kw, o.max_charge_kw);
  if (sig.discharge_max_kw != null) eff.discharge_max_kw = Math.min(sig.discharge_max_kw, o.max_discharge_kw);
  if (sig.target_soc != null) eff.target_soc = sig.target_soc;             // can only raise SoC: always owner-favourable
  if (sig.max_soc_by != null) eff.max_soc_by = Math.max(sig.max_soc_by, o.min_soc); // make room, never below the owner reserve
  if (sig.export_min_kw != null) {
    const cap = Math.min(h.cfg.feedin_max_kw, o.max_discharge_kw);
    if (h.soc <= o.min_soc) { eff.export_min_kw = 0; status = "partial"; reason = "min_soc"; }
    else if (sig.export_min_kw > cap) { eff.export_min_kw = cap; status = "partial"; reason = "owner_limit"; }
    else eff.export_min_kw = sig.export_min_kw;
  }
  return { eff, status, reason };
}

function ack(h, seq, status, reason) {
  const doc = { v: 1, device: h.cfg.id, path: h.cfg.path, seq, status, reason,
    applied: h.effective || {}, soc: +h.soc.toFixed(1), grid_kw: +h.grid_kw.toFixed(2), ts: nowIso(),
    curtailed_kwh: h.curtailed_kwh ? +h.curtailed_kwh.toFixed(2) : null };
  h.mq.publish(`gridzilla/ack/${h.cfg.id}`, sign(doc, h.keys.priv), { qos: 1 });
  log(h.cfg.id, `ack ${status}${reason ? " (" + reason + ")" : ""} seq=${seq} soc=${h.soc.toFixed(0)}% grid=${h.grid_kw.toFixed(1)}kW`);
}

function revert(h, reason) {
  if (!h.effective) return;
  h.effective = null; h.signal = null;
  log(h.cfg.id, `REVERT to owner mode (${reason})`);
  ack(h, null, "reverted", reason);
}

function onSignal(h, env, platformPub) {
  const sig = verifyEnvelope(env, platformPub);
  if (!sig) { log(h.cfg.id, "refused: bad_sig"); return ack(h, null, "refused", "bad_sig"); }
  if (!h.cfg.path.includes(sig.segment)) return;                               // not for me, silently ignore
  if (sig.cohort && (parseInt(crypto.createHash("sha256").update(h.cfg.id).digest("hex").slice(0, 8), 16) % sig.cohort[1]) !== sig.cohort[0]) return; // not my cohort
  const age = (Date.now() - Date.parse(sig.issued_at)) / 1000;
  if (sig.seq <= h.lastSeq) { log(h.cfg.id, `refused: stale_seq (${sig.seq} <= ${h.lastSeq})`); return ack(h, sig.seq, "refused", "stale_seq"); }
  if (age > 120 || age < -30) return ack(h, sig.seq, "refused", "expired");
  if (Date.parse(sig.valid_to) < Date.now()) return ack(h, sig.seq, "refused", "expired");
  h.lastSeq = sig.seq; saveSeq(h.cfg.id, sig.seq);
  if (sig.mode === "RELEASE") { h.effective = null; h.signal = null; log(h.cfg.id, "RELEASE -> owner mode"); return ack(h, sig.seq, "applied", null); }
  const { eff, status, reason } = merge(h, sig);
  if (status === "refused") return ack(h, sig.seq, status, reason);
  const ramp = sig.ramp_s[0] + Math.random() * (sig.ramp_s[1] - sig.ramp_s[0]);
  const startIn = Math.max(0, Date.parse(sig.valid_from) - Date.now());
  log(h.cfg.id, `${sig.mode} accepted (${status}${reason ? ", " + reason : ""}), starts in ${(startIn / 1000).toFixed(0)}s, ramp ${ramp.toFixed(0)}s`);
  setTimeout(() => {
    h.signal = sig; h.effective = eff; h.lastHb = Date.now();
    ack(h, sig.seq, status, reason);
    const live = ["ABSORB", "SUPPORT"].includes(sig.mode);                     // these need heartbeats; schedules do not
    const maxEnd = Date.parse(sig.valid_from) + (sig.mode === "STRETCH" ? 4320 : 240) * 60 * 1000;   // protocol window bound, enforced on the device
    const endIn = Math.min(Date.parse(sig.valid_to), maxEnd) - Date.now();
    setTimeout(() => { if (h.signal === sig) revert(h, "window_end"); }, endIn);
    if (live) {
      const wd = setInterval(() => {
        if (h.signal !== sig) return clearInterval(wd);
        if (Date.now() - h.lastHb > HB_TIMEOUT_S * 1000) { clearInterval(wd); revert(h, "heartbeat_lost"); }
      }, 5000);
    }
  }, startIn + ramp * 1000 / 10);                                              // ramp shortened 10x for the demo
}

// ------------------------------------------------------------ main
(async () => {
  const platformPub = await platformKey();
  for (const [idx, cfg] of houses.entries()) {
    await new Promise(r => setTimeout(r, 150));                                              // gentle on the broker and the platform
    const keys = deviceKey(cfg.id);
    const reg = await fetch(`${PLATFORM}/api/register`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device: cfg.id, pubkey_pem: keys.pub }) });
    if (!reg.ok) { console.error(`${cfg.id}: registration failed: ${await reg.text()}`); continue; }
    cfg.path = (await reg.json()).path;
    const h = makeHouse(cfg, keys);
    h.mq = mqtt.connect(BROKER, { clientId: `gz-${cfg.id}`, username: process.env.GZ_MQTT_USER, password: process.env.GZ_MQTT_PASS,
      rejectUnauthorized: true });   // BROKER may be mqtts://host:8883 (HiveMQ Cloud); the public cert is verified
    h.mq.on("connect", () => {
      cfg.path.forEach(n => h.mq.subscribe(`gridzilla/sig/${n}`, { qos: 1 }));
      h.mq.subscribe("gridzilla/hb");
      log(cfg.id, `online, path ${cfg.path.join(" > ")}, soc ${h.soc}%`);
    });
    h.mq.on("message", (topic, buf) => {
      let env; try { env = JSON.parse(buf.toString()); } catch { return; }
      if (topic === "gridzilla/hb") {
        const hb = verifyEnvelope(env, platformPub); if (!hb) return;
        const age = (Date.now() - Date.parse(hb.ts)) / 1000;
        if (!(hb.seq > (h.lastHbSeq || 0)) || age > 90 || age < -30) return;   // replayed or stale heartbeat
        h.lastHbSeq = hb.seq; h.lastHb = Date.now(); return;
      }
      onSignal(h, env, platformPub);
    });
    setInterval(() => step(h), 1000);
    setInterval(() => h.mq.publish(`gridzilla/state/${cfg.id}`, JSON.stringify({
      soc: +h.soc.toFixed(1), grid_kw: +h.grid_kw.toFixed(2), load_kw: +h.load_kw.toFixed(2), pv_kw: +h.pv_kw.toFixed(2),
      batt_kw: +h.batt_kw.toFixed(2), ev_kw: +(h.ev_kw || 0).toFixed(2), hp_kw: +(h.hp_kw || 0).toFixed(2),
      dhw_c: h.dhw_c != null ? +h.dhw_c.toFixed(1) : null, dhw_set_c: h.dhw_set_c ?? null, boiler_c: h.boiler_c != null ? +h.boiler_c.toFixed(1) : null,
      heat: (Array.isArray(cfg.heat) ? cfg.heat : (cfg.heat ? [cfg.heat] : [])).map(x => x.type).join("+") || null, ev: cfg.ev ? cfg.ev.kw : 0, mode: h.effective ? h.effective.mode : "owner",
      imp_cap_kw: currentLimits(h).import_max_kw ?? null, exp_cap_kw: currentLimits(h).export_max_kw ?? null, sim_hour: +((h.simMinutes / 60) % 24).toFixed(2), ts: nowIso() })), 10000);
  }
})();
