// Node-RED function node: MERGE WITH OWNER LIMITS + APPLY PLAN
// Wire: [verify.js out 1] -> this -> out 1: Victron writes, out 2: ack, out 3: schedule revert
//
// Owner limits come from the ESS settings on the GX (read once with victron nodes or set in flow context):
//   flow.owner = { min_soc: 20, max_charge_kw: 5, max_discharge_kw: 5, feedin_max_kw: 10, opt_out: false }
// Saved ESS values for revert (read before the first write):
//   flow.saved = { AcPowerSetPoint, MaxChargePower, MaxDischargePower, MaxFeedInPower }
//
// Output 1 is a list of {setting, value} pairs for the Victron "ESS control" / settings nodes:
//   /Settings/CGwacs/MaxFeedInPower, /Settings/CGwacs/MaxChargePower, /Settings/CGwacs/MaxDischargePower, /Settings/CGwacs/AcPowerSetPoint

const sig = msg.signal;
const o = flow.get("owner");
const soc = flow.get("soc") || 0;
const dev = flow.get("device_id");
const ts = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const ack = (status, reason, applied) => ({ topic: `gridzilla/ack/${dev}`,
  ackdoc: { v: 1, device: dev, path: flow.get("path"), seq: sig.seq, status, reason, applied: applied || {},
            soc, grid_kw: flow.get("grid_kw") || 0, ts: ts() } });

if (sig.mode === "RELEASE") {
  flow.set("effective", null);
  return [{ payload: "revert" }, ack("applied", null, {}), null];
}
if (o.opt_out) return [null, ack("refused", "opt_out"), null];

const eff = { mode: sig.mode, import_max_kw: null, export_max_kw: null, export_min_kw: null,
              charge_max_kw: null, discharge_max_kw: null, target_soc: null };
let status = "applied", reason = null;

if (sig.import_max_kw != null) eff.import_max_kw = sig.import_max_kw;
if (sig.export_max_kw != null) eff.export_max_kw = Math.min(sig.export_max_kw, o.feedin_max_kw);  // never above the owner's feed-in limit
if (sig.mode === "STRETCH") eff.export_max_kw = 0;                            // street is dark: lock export, no backfeed
if (sig.charge_max_kw != null) eff.charge_max_kw = Math.min(sig.charge_max_kw, o.max_charge_kw);
if (sig.discharge_max_kw != null) eff.discharge_max_kw = Math.min(sig.discharge_max_kw, o.max_discharge_kw);
if (sig.target_soc != null) eff.target_soc = sig.target_soc;                 // only ever raises SoC
if (sig.export_min_kw != null) {
  const cap = Math.min(o.feedin_max_kw, o.max_discharge_kw);
  if (soc <= o.min_soc)            { eff.export_min_kw = 0;   status = "partial"; reason = "min_soc"; }
  else if (sig.export_min_kw > cap) { eff.export_min_kw = cap; status = "partial"; reason = "owner_limit"; }
  else                              { eff.export_min_kw = sig.export_min_kw; }
}
flow.set("effective", eff);

// Translate the envelope into ESS writes. Everything is a limit; the grid setpoint is the one "push".
const W = 1000;
const writes = [];
if (eff.export_max_kw != null) writes.push({ setting: "/Settings/CGwacs/MaxFeedInPower", value: eff.export_max_kw * W });
if (eff.charge_max_kw != null) writes.push({ setting: "/Settings/CGwacs/MaxChargePower", value: eff.charge_max_kw * W });
if (eff.discharge_max_kw != null) writes.push({ setting: "/Settings/CGwacs/MaxDischargePower", value: eff.discharge_max_kw * W });
if (eff.export_min_kw != null && eff.export_min_kw > 0)
  writes.push({ setting: "/Settings/CGwacs/AcPowerSetPoint", value: -eff.export_min_kw * W });   // forced feed-in
else if (eff.import_max_kw != null)
  writes.push({ setting: "/Settings/CGwacs/AcPowerSetPoint", value: 0, cap_import_w: eff.import_max_kw * W }); // keep grid <= cap; a small loop node enforces the cap
if (eff.target_soc != null)                                               // PREPARE: pull charge power from the grid until target SoC (watchdog ends it)
  writes.push({ setting: "/Settings/CGwacs/AcPowerSetPoint", value: Math.round((eff.charge_max_kw ?? o.max_charge_kw) * W) });

const ramp = sig.ramp_s[0] + Math.random() * (sig.ramp_s[1] - sig.ramp_s[0]);
const live = ["ABSORB", "SUPPORT"].includes(sig.mode);     // needs heartbeat; PREPARE/STRETCH/RECOVER run offline to valid_to
const maxEnd = Date.parse(sig.valid_from) + (sig.mode === "STRETCH" ? 4320 : 240) * 60 * 1000;   // protocol: 4 h max, STRETCH 3 days
const endAt = Math.min(Date.parse(sig.valid_to), maxEnd);                                        // device enforces it, not only the platform
const plan = { seq: sig.seq, writes, start_at: Math.min(Math.max(Date.now(), Date.parse(sig.valid_from)) + ramp * 1000, endAt - 1000),
               end_at: endAt, watchdog: live, hb_timeout_s: 120 };   // the ramp never pushes the writes past the window

return [{ payload: plan }, ack(status, reason, eff), { payload: { end_at: plan.end_at, watchdog: live } }];
