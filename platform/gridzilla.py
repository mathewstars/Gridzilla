#!/usr/bin/env python3
"""Gridzilla: DSO-side grid signaling platform (hackathon mock).

Run:   python gridzilla.py            (serves http://localhost:8080, needs an MQTT broker)
Env:   GZ_BROKER=localhost:1883  GZ_PORT=8080  GZ_LLM_URL=http://spark:8000/v1  GZ_LLM_MODEL=deepseek-v4.1

What it does
- loads registry.yaml (grid tree, devices, policy)
- composes signals, runs the policy guard, signs them (Ed25519), publishes over MQTT
- sends a signed heartbeat every 30 s
- collects acks and telemetry from devices, verifies ack signatures of registered devices
- serves a one-page operator dashboard
- optional: asks a local OpenAI-compatible LLM (DeepSeek) to PROPOSE a signal; the guard and a human decide
"""
import base64, json, os, sys, threading, time, random, collections, urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import yaml
import paho.mqtt.client as mqtt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse
from pydantic import BaseModel

HERE = Path(__file__).parent
KEYS = HERE / "keys"
KID = "gz-2026-10"
BROKER = os.environ.get("GZ_BROKER", "localhost:1883")
PORT = int(os.environ.get("GZ_PORT", "8080"))
LLM_URL = os.environ.get("GZ_LLM_URL")            # e.g. http://spark-1:8000/v1
LLM_MODEL = os.environ.get("GZ_LLM_MODEL", "deepseek-v4.1")

MODE_FIELDS = {
    "PREPARE": {"target_soc", "charge_max_kw"},
    "ABSORB": {"export_max_kw", "charge_max_kw"},
    "SUPPORT": {"import_max_kw", "export_min_kw"},
    "STRETCH": {"discharge_max_kw"},
    "RECOVER": {"charge_max_kw"},
    "RELEASE": set(),
}
ALL_FIELDS = ["import_max_kw", "export_max_kw", "export_min_kw", "charge_max_kw", "discharge_max_kw", "target_soc"]


def now():
    return datetime.now(timezone.utc)


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------- keys
def load_or_create_key():
    KEYS.mkdir(exist_ok=True)
    priv_path, pub_path = KEYS / "platform.key.pem", KEYS / "platform.pub.pem"
    if priv_path.exists():
        priv = serialization.load_pem_private_key(priv_path.read_bytes(), password=None)
    else:
        priv = Ed25519PrivateKey.generate()
        priv_path.write_bytes(priv.private_bytes(serialization.Encoding.PEM,
                                                 serialization.PrivateFormat.PKCS8,
                                                 serialization.NoEncryption()))
        print(f"[keys] generated new platform key at {priv_path}")
    pub_pem = priv.public_key().public_bytes(serialization.Encoding.PEM,
                                             serialization.PublicFormat.SubjectPublicKeyInfo)
    pub_path.write_bytes(pub_pem)
    return priv, pub_pem.decode()


PRIV, PUB_PEM = load_or_create_key()


def envelope(doc: dict) -> str:
    payload = json.dumps(doc, separators=(",", ":"))
    sig = base64.b64encode(PRIV.sign(payload.encode())).decode()
    return json.dumps({"v": 1, "kid": KID, "payload": payload, "sig": sig})


def verify_env(env: dict, pub_pem: str):
    pub = serialization.load_pem_public_key(pub_pem.encode())
    pub.verify(base64.b64decode(env["sig"]), env["payload"].encode())
    return json.loads(env["payload"])


# ---------------------------------------------------------------- registry
REG = yaml.safe_load((HERE / "registry.yaml").read_text())
TREE, POLICY = REG["tree"], REG["policy"]


def path_of(node):
    out = []
    while node:
        out.append(node)
        node = TREE[node]["parent"]
    return list(reversed(out))


DEVICES = {d["id"]: {**d, "path": path_of(d["tf"])} for d in REG["devices"]}

# ---------------------------------------------------------------- state
STATE_FILE = HERE / "state.json"
_lock = threading.Lock()
state = {
    "seq": 0,
    "hb_seq": 0,
    "active": {},          # node -> signal
    "acks": {},            # device -> last ack (parsed) + verified flag
    "telemetry": {},       # device -> {soc, grid_kw, ts}
    "pubkeys": {},         # device -> pem
    "support_count": {},   # f"{node}:{date}" -> n
}
LOG = collections.deque(maxlen=300)

if STATE_FILE.exists():
    try:
        saved = json.loads(STATE_FILE.read_text())
        state["seq"] = saved.get("seq", 0)
        state["pubkeys"] = saved.get("pubkeys", {})
    except Exception:
        pass


def persist():
    STATE_FILE.write_text(json.dumps({"seq": state["seq"], "pubkeys": state["pubkeys"]}))


def log(kind, msg, **extra):
    entry = {"ts": iso(now()), "kind": kind, "msg": msg, **extra}
    LOG.appendleft(entry)
    print(f"[{kind}] {msg}", flush=True)


# ---------------------------------------------------------------- mqtt
host, port = BROKER.split(":")
mq = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="gridzilla-platform")


def on_connect(client, userdata, flags, rc, props=None):
    log("mqtt", f"connected to {BROKER}")
    client.subscribe([("gridzilla/ack/#", 1), ("gridzilla/state/#", 0)])


def on_message(client, userdata, m):
    topic = m.topic.split("/")
    try:
        body = json.loads(m.payload.decode())
    except Exception:
        return
    if topic[1] == "state":
        with _lock:
            state["telemetry"][topic[2]] = {**body, "rx": iso(now())}
        return
    if topic[1] == "ack":
        dev = topic[2]
        verified = False
        try:
            pem = state["pubkeys"].get(dev)
            if pem:
                ack = verify_env(body, pem)
                verified = True
            else:
                ack = json.loads(body["payload"])
        except Exception as e:
            log("ack", f"{dev}: bad ack signature ({e})")
            return
        with _lock:
            state["acks"][dev] = {**ack, "verified": verified, "rx": iso(now())}
        log("ack", f"{dev}: {ack['status']}" + (f" ({ack['reason']})" if ack.get("reason") else "")
            + f" soc={ack.get('soc')} grid={ack.get('grid_kw')} kW" + ("" if verified else " [unverified]"),
            device=dev, status=ack["status"])


mq.on_connect, mq.on_message = on_connect, on_message


def heartbeat_loop():
    while True:
        with _lock:
            state["hb_seq"] += 1
            doc = {"seq": state["hb_seq"], "ts": iso(now())}
        if not HB_PAUSED.is_set():
            mq.publish("gridzilla/hb", envelope(doc), qos=0)
        time.sleep(POLICY["heartbeat_s"])


HB_PAUSED = threading.Event()


# ---------------------------------------------------------------- policy guard
def guard(segment, mode, fields, duration_min):
    if segment not in TREE:
        return f"unknown segment {segment}"
    if mode not in MODE_FIELDS:
        return f"unknown mode {mode}"
    given = {k for k, v in fields.items() if v is not None}
    extra = given - MODE_FIELDS[mode]
    if extra:
        return f"{mode} may not carry {sorted(extra)}"
    limit = POLICY["max_stretch_window_min"] if mode == "STRETCH" else POLICY["max_window_min"]
    if not (1 <= duration_min <= limit):
        return f"window must be 1..{limit} min for {mode}"
    if mode == "SUPPORT":
        key = f"{segment}:{now().date()}"
        if state["support_count"].get(key, 0) >= POLICY["max_support_per_node_per_day"]:
            return f"SUPPORT already sent {POLICY['max_support_per_node_per_day']}x today for {segment}"
        em = fields.get("export_min_kw")
        if em is not None and em > POLICY["max_export_min_kw_per_device"]:
            return f"export_min_kw above policy max {POLICY['max_export_min_kw_per_device']}"
        im = fields.get("import_max_kw")
        if im is not None and im < POLICY["max_import_cap_floor_kw"]:
            return f"import cap below policy floor {POLICY['max_import_cap_floor_kw']} kW"
        rev = TREE[segment].get("reverse_kw")
        n = len(devices_under(segment))
        if em is not None and rev and em * n > rev:
            return f"feed-in floor {em} kW x {n} devices exceeds reverse rating {rev} kW of {segment}"
    if mode == "PREPARE" and fields.get("target_soc") is not None and fields["target_soc"] < 50:
        return "PREPARE target_soc below 50 makes no sense"
    return None


def devices_under(node):
    return [d for d in DEVICES.values() if node in d["path"]]


# ---------------------------------------------------------------- compose and send
def send_signal(segment, mode, fields, duration_min, note="", start_in_min=0):
    err = guard(segment, mode, fields, duration_min)
    if err:
        log("guard", f"REFUSED {mode} for {segment}: {err}")
        raise HTTPException(400, err)
    with _lock:
        state["seq"] += 1
        seq = state["seq"]
        t0 = now() + timedelta(minutes=start_in_min)
        doc = {
            "v": 1, "seq": seq, "issued_at": iso(now()), "segment": segment, "mode": mode,
            "valid_from": iso(t0), "valid_to": iso(t0 + timedelta(minutes=duration_min)),
            **{k: fields.get(k) for k in ALL_FIELDS},
            "ramp_s": POLICY["ramp_s"], "note": note or "",
        }
        if mode == "RELEASE":
            state["active"].pop(segment, None)
        else:
            state["active"][segment] = doc
        if mode == "SUPPORT":
            key = f"{segment}:{now().date()}"
            state["support_count"][key] = state["support_count"].get(key, 0) + 1
        persist()
    mq.publish(f"gridzilla/sig/{segment}", envelope(doc), qos=1)
    log("signal", f"seq {seq} {mode} -> {segment} " + " ".join(f"{k}={v}" for k, v in fields.items() if v is not None)
        + f" for {duration_min} min", seq=seq, mode=mode, segment=segment)
    return doc


# ---------------------------------------------------------------- aggregates
def aggregates():
    out = {}
    for node in TREE:
        devs = devices_under(node)
        kwh_avail = kw = 0.0
        applied = 0
        for d in devs:
            t = state["telemetry"].get(d["id"]) or state["acks"].get(d["id"]) or {}
            soc = t.get("soc")
            if soc is not None:
                kwh_avail += d["kwh"] * soc / 100
                kw += d["kw"]
            a = state["acks"].get(d["id"])
            if a and a.get("status") in ("applied", "partial"):
                applied += 1
        out[node] = {"devices": len(devs), "online": sum(1 for d in devs if d["id"] in state["telemetry"]),
                     "kwh_available": round(kwh_avail, 1), "kw": kw, "applied": applied,
                     "active": state["active"].get(node, {}).get("mode")}
    return out


# ---------------------------------------------------------------- LLM advisor (DeepSeek, OpenAI-compatible)
ADVISOR_SYSTEM = """You are the operator assistant of Gridzilla, a DSO platform that sends bounded signals to home batteries.
You PROPOSE one signal. You never send it. A deterministic policy guard and a human operator decide.
Signal modes and allowed fields:
- PREPARE: target_soc (50-100), charge_max_kw. Fill batteries gently before a forecast event or outage window.
- ABSORB: export_max_kw, charge_max_kw. PV surplus: cap export, allow charging.
- SUPPORT: import_max_kw ("take N kW only"), export_min_kw ("give at least N kW"). Peak or deficit while the grid is up.
- STRETCH: discharge_max_kw. Street is dead; ration batteries until expected restoration (duration = expected restoration).
- RECOVER: charge_max_kw. After restoration, staggered recharge.
- RELEASE: end the event.
Rules: signals are limits at the grid connection point, never setpoints. Pick the segment at the level where the constraint is:
a street transformer only helps itself; a feeder or substation constraint can be served by every battery under it.
Policy: window max 240 min (STRETCH up to 4320), export_min_kw max 5 per device, import_max_kw min 2, max two SUPPORT per node per day.
Answer with ONLY a JSON object: {"segment": "...", "mode": "...", "fields": {...}, "duration_min": N, "start_in_min": N, "note": "one sentence for the owners", "rationale": "two sentences for the operator"}"""


class Advise(BaseModel):
    situation: str


def ask_llm(situation: str):
    if not LLM_URL:
        raise HTTPException(503, "GZ_LLM_URL not set")
    ctx = {"time_utc": iso(now()), "tree": {n: {**TREE[n], **aggregates()[n]} for n in TREE},
           "devices": [{"id": d["id"], "tf": d["tf"], "kw": d["kw"], "kwh": d["kwh"],
                        "soc": (state["telemetry"].get(d["id"]) or {}).get("soc")} for d in DEVICES.values()],
           "active_signals": state["active"]}
    body = {"model": LLM_MODEL, "temperature": 0.2,
            "messages": [{"role": "system", "content": ADVISOR_SYSTEM},
                         {"role": "user", "content": f"Grid state:\n{json.dumps(ctx)}\n\nSituation: {situation}"}]}
    req = urllib.request.Request(f"{LLM_URL.rstrip('/')}/chat/completions", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json",
                                          "Authorization": f"Bearer {os.environ.get('GZ_LLM_KEY', 'none')}"})
    with urllib.request.urlopen(req, timeout=120) as r:
        text = json.loads(r.read())["choices"][0]["message"]["content"]
    text = text.strip().strip("`")
    if text.startswith("json"):
        text = text[4:]
    start, end = text.find("{"), text.rfind("}")
    proposal = json.loads(text[start:end + 1])
    proposal["guard"] = guard(proposal.get("segment"), proposal.get("mode"), proposal.get("fields", {}),
                              int(proposal.get("duration_min", 0)))
    log("advisor", f"proposed {proposal.get('mode')} -> {proposal.get('segment')}: {proposal.get('rationale', '')}"
        + (f" | GUARD: {proposal['guard']}" if proposal["guard"] else " | guard ok"))
    return proposal


# ---------------------------------------------------------------- api
app = FastAPI(title="Gridzilla")


class Signal(BaseModel):
    segment: str
    mode: str
    import_max_kw: Optional[float] = None
    export_max_kw: Optional[float] = None
    export_min_kw: Optional[float] = None
    charge_max_kw: Optional[float] = None
    discharge_max_kw: Optional[float] = None
    target_soc: Optional[float] = None
    duration_min: int = 60
    start_in_min: int = 0
    note: str = ""


class Register(BaseModel):
    device: str
    pubkey_pem: str


@app.get("/")
def index():
    return FileResponse(HERE / "static" / "index.html")


@app.get("/api/pubkey", response_class=PlainTextResponse)
def pubkey():
    return PUB_PEM


@app.get("/api/state")
def get_state():
    with _lock:
        return {"now": iso(now()), "seq": state["seq"], "tree": TREE, "aggregates": aggregates(),
                "devices": {k: {**v, "ack": state["acks"].get(k), "telemetry": state["telemetry"].get(k),
                                "registered": k in state["pubkeys"]} for k, v in DEVICES.items()},
                "active": state["active"], "log": list(LOG), "hb_paused": HB_PAUSED.is_set(),
                "llm": bool(LLM_URL), "policy": POLICY}


@app.post("/api/register")
def register(r: Register):
    if r.device not in DEVICES:
        raise HTTPException(404, "device not in registry")
    with _lock:
        state["pubkeys"][r.device] = r.pubkey_pem
        persist()
    log("registry", f"{r.device} registered its public key")
    return {"ok": True, "path": DEVICES[r.device]["path"], "platform_pubkey": PUB_PEM}


@app.post("/api/signal")
def post_signal(s: Signal):
    fields = {k: getattr(s, k) for k in ALL_FIELDS}
    return send_signal(s.segment, s.mode, fields, s.duration_min, s.note, s.start_in_min)


@app.post("/api/advise")
def advise(a: Advise):
    return ask_llm(a.situation)


@app.post("/api/heartbeat/{action}")
def hb(action: str):
    """pause|resume: simulate a platform outage for the fail-safe demo"""
    (HB_PAUSED.set if action == "pause" else HB_PAUSED.clear)()
    log("demo", f"heartbeat {'PAUSED (platform outage)' if action == 'pause' else 'resumed'}")
    return {"paused": HB_PAUSED.is_set()}


@app.post("/api/replay/{seq}")
def replay(seq: int):
    """re-publish an old signal unchanged: the agents must reject it (stale_seq)"""
    for node, doc in list(state["active"].items()):
        if doc["seq"] == seq:
            mq.publish(f"gridzilla/sig/{node}", envelope(doc), qos=1)
            log("demo", f"REPLAYED seq {seq} to {node} (agents should refuse: stale_seq)")
            return {"ok": True}
    raise HTTPException(404, "no active signal with that seq")


def main():
    mq.connect(host, int(port), keepalive=30)
    mq.loop_start()
    threading.Thread(target=heartbeat_loop, daemon=True).start()
    import uvicorn
    log("platform", f"Gridzilla up on http://localhost:{PORT}  broker={BROKER}  llm={LLM_URL or 'off'}")
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="warning")


if __name__ == "__main__":
    main()
