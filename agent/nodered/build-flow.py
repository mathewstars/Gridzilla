#!/usr/bin/env python3
"""Generate gridzilla-flow.json: the Gridzilla agent as a Node-RED flow for Venus OS Large.

    python3 build-flow.py --platform http://192.168.90.119:8080 --broker 192.168.90.119 --device vic-atzgersdorf-07 \
        --path region:at sub:wien-sued feeder:liesing-3 tf:atzgersdorf-1 > gridzilla-flow.json

Import in the editor (menu > Import) or push with the admin API (deploy-flow.sh).
Victron nodes are "custom" input/output nodes on D-Bus services, so no device picking is needed in the editor.
"""
import argparse, json, uuid

ap = argparse.ArgumentParser()
ap.add_argument("--platform", default="http://192.168.90.119:8080")
ap.add_argument("--broker", default="192.168.90.119")
ap.add_argument("--broker-port", default="1883")
ap.add_argument("--tls", action="store_true", help="MQTT over TLS (8883), server cert verified against system CAs")
ap.add_argument("--mqtt-user", default="")
ap.add_argument("--mqtt-pass", default="")
ap.add_argument("--device", default="vic-atzgersdorf-07")
ap.add_argument("--path", nargs="+", default=["region:at", "sub:wien-sued", "feeder:liesing-3", "tf:atzgersdorf-1"])
a = ap.parse_args()

TAB = "gz_tab"
nid = lambda: uuid.uuid4().hex[:16]
nodes = []
def add(**n):
    n.setdefault("id", nid()); n.setdefault("z", TAB); n.setdefault("wires", [])
    nodes.append(n); return n["id"]

nodes.append({"id": TAB, "type": "tab", "label": "Gridzilla agent", "disabled": False, "info": "Grid-serving storage agent. Verify -> scope -> merge with owner limits -> apply -> ack -> watchdog -> revert."})
broker = add(type="mqtt-broker", z=None, name="gridzilla broker", broker=a.broker, port=a.broker_port, clientid=f"gz-{a.device}", autoConnect=True,
             usetls=a.tls, verifyservercert=True, protocolVersion="4", keepalive="30", cleansession=True, autoUnsubscribe=True, birthTopic="", closeTopic="", willTopic="",
             **({"credentials": {"user": a.mqtt_user, "password": a.mqtt_pass}} if a.mqtt_user else {}))
vclient = add(type="victron-client", z=None, name="venus", showValues=True)

# ------------------------------------------------------------------ function sources
F_INIT = f"""
// one-time setup: device key (per boot), config, pin the platform key, register
const dev = {json.dumps(a.device)};
flow.set("device_id", dev);
flow.set("platform", {json.dumps(a.platform)});
flow.set("path", {json.dumps(a.path)});
const dir = require("path").join(os.homedir(), ".node-red", "gridzilla"); fs.mkdirSync(dir, {{ recursive: true }}); flow.set("dir", dir);
const kp = require("path").join(dir, "device.key.pem");
if (!fs.existsSync(kp)) {{ const {{ privateKey }} = crypto.generateKeyPairSync("ed25519"); fs.writeFileSync(kp, privateKey.export({{ type: "pkcs8", format: "pem" }}), {{ mode: 0o600 }}); }}
const priv = crypto.createPrivateKey(fs.readFileSync(kp));
flow.set("device_priv", priv.export({{ type: "pkcs8", format: "pem" }}).toString());
flow.set("device_pub", crypto.createPublicKey(priv).export({{ type: "spki", format: "pem" }}).toString());
const pp = require("path").join(dir, "platform.pub.pem"); if (fs.existsSync(pp)) flow.set("platform_pub", fs.readFileSync(pp, "utf8"));
const st = require("path").join(dir, "state.json"); if (fs.existsSync(st)) {{ const j = JSON.parse(fs.readFileSync(st, "utf8")); flow.set("last_seq", j.last_seq || 0); flow.set("last_hb_seq", j.last_hb_seq || 0); }}
if (!flow.get("owner")) flow.set("owner", {{ min_soc: 20, max_charge_kw: 5, max_discharge_kw: 5, feedin_max_kw: 10, opt_out: false }});
msg.url = flow.get("platform") + "/api/pubkey"; msg.method = "GET";
return msg;
"""
F_PIN = """
if (!flow.get("platform_pub")) { flow.set("platform_pub", msg.payload); fs.writeFileSync(require("path").join(flow.get("dir"), "platform.pub.pem"), msg.payload); node.warn("platform key pinned (TOFU) and stored"); }
msg.url = flow.get("platform") + "/api/register"; msg.method = "POST";
msg.headers = { "Content-Type": "application/json" };
msg.payload = { device: flow.get("device_id"), pubkey_pem: flow.get("device_pub") };
return msg;
"""
F_REG = """
const r = typeof msg.payload === "string" ? JSON.parse(msg.payload) : msg.payload;
if (r && r.path) { flow.set("path", r.path); node.status({ fill: "green", shape: "dot", text: "registered " + r.path.join(">") }); }
else node.status({ fill: "red", shape: "ring", text: "registration failed" });
return null;
"""
F_VERIFY = open("verify.js").read().replace('flow.set("last_seq", doc.seq);',
  'flow.set("last_seq", doc.seq); try { fs.writeFileSync(require("path").join(flow.get("dir"), "state.json"), JSON.stringify({ last_seq: doc.seq, last_hb_seq: flow.get("last_hb_seq") || 0 })); } catch (e) {}')
F_MERGE = open("merge.js").read()
F_SIGN = """
// sign an ack document with the device key -> envelope
const payload = JSON.stringify(msg.ackdoc);
const sig = crypto.sign(null, Buffer.from(payload, "utf8"), crypto.createPrivateKey(flow.get("device_priv"))).toString("base64");
msg.payload = JSON.stringify({ v: 1, kid: "dev", payload, sig });
return msg;
"""
F_APPLY = """
// msg.payload = plan {writes:[{setting,value}], start_at, end_at, watchdog} or "revert"
const W = { "/Settings/CGwacs/MaxFeedInPower": 0, "/Settings/CGwacs/MaxChargePower": 1, "/Settings/CGwacs/MaxDischargePower": 2, "/Settings/CGwacs/AcPowerSetPoint": 3 };
const out = [null, null, null, null];
if (msg.payload === "revert") {
  const saved = flow.get("saved") || {};
  for (const [s, i] of Object.entries(W)) if (saved[s] != null) out[i] = { payload: saved[s] };
  flow.set("effective", null); flow.set("plan", null);
  node.status({ fill: "grey", shape: "ring", text: "owner mode" });
  return out;
}
const plan = msg.payload;
if (!flow.get("saved")) flow.set("saved", { ...(flow.get("current") || {}) });   // snapshot once, restore on revert
flow.set("plan", plan);
const delay = Math.max(0, plan.start_at - Date.now());
setTimeout(() => {
  const o = [null, null, null, null];
  for (const w of plan.writes) if (W[w.setting] != null) o[W[w.setting]] = { payload: w.value };
  node.send(o);
  node.status({ fill: "yellow", shape: "dot", text: (flow.get("effective") || {}).mode + " until " + new Date(plan.end_at).toISOString().slice(11, 16) });
}, delay);
return null;
"""
F_WATCH = """
// every 5 s: window end or heartbeat loss -> revert
const plan = flow.get("plan"); if (!plan) return null;
const eff = flow.get("effective") || {};
const hbAge = (Date.now() - (flow.get("last_hb") || 0)) / 1000;
let reason = null;
if (Date.now() >= plan.end_at) reason = "window_end";
else if (plan.watchdog && hbAge > plan.hb_timeout_s) reason = "heartbeat_lost";
if (!reason) return null;
const ts = new Date().toISOString().replace(/\\.\\d{3}Z$/, "Z");
const ack = { topic: `gridzilla/ack/${flow.get("device_id")}`, ackdoc: { v: 1, device: flow.get("device_id"), path: flow.get("path"), seq: null,
  status: "reverted", reason, applied: {}, soc: flow.get("soc") || 0, grid_kw: flow.get("grid_kw") || 0, ts } };
node.warn("REVERT: " + reason);
return [{ payload: "revert" }, ack];
"""
F_TELEM = """
const eff = flow.get("effective");
msg.topic = `gridzilla/state/${flow.get("device_id")}`;
msg.payload = JSON.stringify({ soc: flow.get("soc") || 0, grid_kw: flow.get("grid_kw") || 0, mode: eff ? eff.mode : "owner",
  ts: new Date().toISOString().replace(/\\.\\d{3}Z$/, "Z") });
return msg;
"""
F_SOC = 'flow.set("soc", msg.payload); return null;'
F_GRID = """
// sum of the three grid phases, W -> kW, + import / - export
const g = flow.get("gridw") || {}; g[msg.topic || msg.path || "L"] = msg.payload; flow.set("gridw", g);
flow.set("grid_kw", Object.values(g).reduce((s, v) => s + (v || 0), 0) / 1000);
return null;
"""
F_CUR = """
// remember current ESS settings so revert can restore them
const c = flow.get("current") || {}; c[msg.path || msg.topic] = msg.payload; flow.set("current", c); return null;
"""
F_OWNER = """
// owner limits straight from ESS settings: min SoC
const o = flow.get("owner") || {}; o.min_soc = msg.payload; flow.set("owner", o); return null;
"""

LIBS = [{"var": "crypto", "module": "crypto"}, {"var": "fs", "module": "fs"}, {"var": "os", "module": "os"}]
def fn(name, code, outputs=1, libs=True, x=0, y=0):
    return add(type="function", name=name, func=code.strip(), outputs=outputs, noerr=0, initialize="", finalize="",
               libs=LIBS if libs else [], x=x, y=y)

# ------------------------------------------------------------------ startup / registration
i_start = add(type="inject", name="on start", props=[{"p": "payload"}], repeat="", crontab="", once=True, onceDelay="5", topic="", payload="", payloadType="date", x=120, y=60)
f_init = fn("init + device key", F_INIT, x=320, y=60)
h_pub = add(type="http request", name="GET /api/pubkey", method="use", ret="txt", paytoqs="ignore", url="", persist=False, authType="", x=540, y=60)
f_pin = fn("pin platform key", F_PIN, x=760, y=60)
h_reg = add(type="http request", name="POST /api/register", method="use", ret="txt", paytoqs="ignore", url="", persist=False, authType="", x=980, y=60)
f_reg = fn("store path", F_REG, libs=False, x=1180, y=60)
for s, d in [(i_start, f_init), (f_init, h_pub), (h_pub, f_pin), (f_pin, h_reg), (h_reg, f_reg)]:
    next(n for n in nodes if n["id"] == s)["wires"] = [[d]]

# ------------------------------------------------------------------ signal path
f_verify = fn("verify + scope + freshness", F_VERIFY, outputs=3, x=420, y=220)
m_ins = []
for i, t in enumerate([f"gridzilla/sig/{p}" for p in a.path] + ["gridzilla/hb"]):
    m_ins.append(add(type="mqtt in", name="", topic=t, qos="1", datatype="json", broker=broker, nl=False, rap=True, rh=0, inputs=0, x=150, y=160 + i * 40, wires=[[f_verify]]))
f_merge = fn("merge with owner limits", F_MERGE, outputs=3, libs=False, x=680, y=220)
f_sign = fn("sign ack", F_SIGN, x=940, y=300)
m_ack = add(type="mqtt out", name="ack", topic="", qos="1", retain="false", broker=broker, x=1140, y=300)
f_apply = fn("apply plan / revert", F_APPLY, outputs=4, libs=False, x=940, y=200)
outs = []
for i, (p, nm) in enumerate([("/Settings/CGwacs/MaxFeedInPower", "ESS max feed-in W"), ("/Settings/CGwacs/MaxChargePower", "ESS max charge W"),
                             ("/Settings/CGwacs/MaxDischargePower", "ESS max discharge W"), ("/Settings/CGwacs/AcPowerSetPoint", "ESS grid setpoint W")]):
    outs.append(add(type="victron-output-custom", name=nm, service="com.victronenergy.settings", path=p,
                    serviceObj={"service": "com.victronenergy.settings", "name": "Settings"}, pathObj={"path": p, "type": "float", "name": nm},
                    initial="", onlyChanges=False, x=1200, y=160 + i * 40))
f_sched = fn("schedule revert", "flow.set('plan_end', msg.payload.end_at); return null;", libs=False, x=940, y=380)
next(n for n in nodes if n["id"] == f_verify)["wires"] = [[f_merge], [f_sign], []]
next(n for n in nodes if n["id"] == f_merge)["wires"] = [[f_apply], [f_sign], [f_sched]]
next(n for n in nodes if n["id"] == f_sign)["wires"] = [[m_ack]]
next(n for n in nodes if n["id"] == f_apply)["wires"] = [[o] for o in outs]

# ------------------------------------------------------------------ watchdog
i_wd = add(type="inject", name="every 5 s", props=[{"p": "payload"}], repeat="5", crontab="", once=False, onceDelay=0.1, topic="", payload="", payloadType="date", x=130, y=480)
f_wd = fn("watchdog: window end / heartbeat lost", F_WATCH, outputs=2, libs=False, x=420, y=480, )
next(n for n in nodes if n["id"] == i_wd)["wires"] = [[f_wd]]
next(n for n in nodes if n["id"] == f_wd)["wires"] = [[f_apply], [f_sign]]

# ------------------------------------------------------------------ measurements and telemetry
v_soc = add(type="victron-input-custom", name="battery SoC", service="com.victronenergy.system", path="/Dc/Battery/Soc",
            serviceObj={"service": "com.victronenergy.system", "name": "System"}, pathObj={"path": "/Dc/Battery/Soc", "type": "float", "name": "SoC"},
            initial="", onlyChanges=False, roundValues="1", x=140, y=580)
f_soc = fn("flow.soc", F_SOC, libs=False, x=380, y=580)
next(n for n in nodes if n["id"] == v_soc)["wires"] = [[f_soc]]
f_grid = fn("flow.grid_kw", F_GRID, libs=False, x=380, y=640)
for i, L in enumerate(["L1", "L2", "L3"]):
    g = add(type="victron-input-custom", name=f"grid {L} W", service="com.victronenergy.system", path=f"/Ac/Grid/{L}/Power",
            serviceObj={"service": "com.victronenergy.system", "name": "System"}, pathObj={"path": f"/Ac/Grid/{L}/Power", "type": "float", "name": f"grid {L}"},
            initial="", onlyChanges=False, roundValues="0", x=140, y=640 + i * 40)
    next(n for n in nodes if n["id"] == g)["wires"] = [[f_grid]]
f_cur = fn("flow.current (saved for revert)", F_CUR, libs=False, x=420, y=800)
for i, p in enumerate(["/Settings/CGwacs/MaxFeedInPower", "/Settings/CGwacs/MaxChargePower", "/Settings/CGwacs/MaxDischargePower", "/Settings/CGwacs/AcPowerSetPoint"]):
    c = add(type="victron-input-custom", name=f"current {p.split('/')[-1]}", service="com.victronenergy.settings", path=p,
            serviceObj={"service": "com.victronenergy.settings", "name": "Settings"}, pathObj={"path": p, "type": "float", "name": p},
            initial="", onlyChanges=False, roundValues="0", x=160, y=780 + i * 40)
    next(n for n in nodes if n["id"] == c)["wires"] = [[f_cur]]
v_min = add(type="victron-input-custom", name="owner min SoC", service="com.victronenergy.settings", path="/Settings/CGwacs/BatteryLife/MinimumSocLimit",
            serviceObj={"service": "com.victronenergy.settings", "name": "Settings"}, pathObj={"path": "/Settings/CGwacs/BatteryLife/MinimumSocLimit", "type": "float", "name": "min SoC"},
            initial="", onlyChanges=False, roundValues="0", x=160, y=960)
f_owner = fn("flow.owner.min_soc", F_OWNER, libs=False, x=420, y=960)
next(n for n in nodes if n["id"] == v_min)["wires"] = [[f_owner]]
i_tel = add(type="inject", name="every 10 s", props=[{"p": "payload"}], repeat="10", crontab="", once=False, onceDelay=0.1, topic="", payload="", payloadType="date", x=130, y=1040)
f_tel = fn("telemetry", F_TELEM, libs=False, x=380, y=1040)
m_tel = add(type="mqtt out", name="state", topic="", qos="0", retain="false", broker=broker, x=600, y=1040)
next(n for n in nodes if n["id"] == i_tel)["wires"] = [[f_tel]]
next(n for n in nodes if n["id"] == f_tel)["wires"] = [[m_tel]]

# victron nodes need the client config id
for n in nodes:
    if n["type"].startswith("victron-input") or n["type"].startswith("victron-output"):
        n["client"] = vclient
print(json.dumps(nodes, indent=1))
