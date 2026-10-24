#!/usr/bin/env python3
"""Gridzilla agent for a Viessmann heating unit via ViCare (cloud API, PyViCare).

A heating unit is a controllable LOAD. The eight functions are the same as for a battery; only "apply" differs:
  ABSORB / PREPARE  -> raise the hot-water setpoint to the boost value and trigger a one-time charge (soak surplus, fill before event)
  SUPPORT / STRETCH -> lower the hot-water setpoint to the owner's floor (shed load)
  RELEASE / revert  -> restore the previous setpoint
Heating circuit (opt-in, VICARE_HEAT=1): the same signals shift the owner's "normal" room program by VICARE_HEAT_OFFSET K,
  ABSORB / PREPARE -> +offset (store surplus in the floor slab), SUPPORT / STRETCH -> -offset (shed the compressor), capped to
  [VICARE_HEAT_MIN, VICARE_HEAT_MAX]. Never a mode change, never standby, never the compressor directly: SG-Ready semantics.

Env (git-ignored .env or systemd -E):
  GZ_PLATFORM=http://127.0.0.1:8080   GZ_BROKER=mqtts://mqtt.victronlab.sk:8883   GZ_MQTT_USER / GZ_MQTT_PASS
  VICARE_EMAIL  VICARE_PASSWORD  VICARE_CLIENT_ID   GZ_DEVICE=vicare-blatnica
  VICARE_DHW_FLOOR=40  VICARE_DHW_BOOST=60  VICARE_KW=3  (nominal electrical kW while heating water; 0 for a gas boiler)
  VICARE_HEAT=1  VICARE_HEAT_OFFSET=2  VICARE_HEAT_MIN=19  VICARE_HEAT_MAX=27  (heating-circuit offset; default off = DHW only)
  GZ_READ_ONLY=1  -> never write to the unit (first test)
Acks are honest: a write the Viessmann cloud rejects (it returns HTTP 500 under load) is acked "partial", not "applied".
"""
import os, sys, json, time, base64, hashlib, random, threading
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
import urllib.request
import paho.mqtt.client as mqtt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

HERE = Path(__file__).parent
KEYS = HERE / "keys"; KEYS.mkdir(exist_ok=True)
PLATFORM = os.environ.get("GZ_PLATFORM", "http://127.0.0.1:8080")
BROKER = urlparse(os.environ.get("GZ_BROKER", "mqtts://mqtt.victronlab.sk:8883"))
DEVICE = os.environ.get("GZ_DEVICE", "vicare-blatnica")
FLOOR = float(os.environ.get("VICARE_DHW_FLOOR", "40")); BOOST = float(os.environ.get("VICARE_DHW_BOOST", "60"))
NOMINAL_KW = float(os.environ.get("VICARE_KW", "3"))   # Vitocal: compressor ~3 kW electrical while heating water
READ_ONLY = os.environ.get("GZ_READ_ONLY", "0") == "1"
HEAT = os.environ.get("VICARE_HEAT", "0") == "1"
HEAT_OFFSET = float(os.environ.get("VICARE_HEAT_OFFSET", "2")); HEAT_MIN = float(os.environ.get("VICARE_HEAT_MIN", "19")); HEAT_MAX = float(os.environ.get("VICARE_HEAT_MAX", "27"))
HB_TIMEOUT = 120
now = lambda: datetime.now(timezone.utc)
iso = lambda dt: dt.strftime("%Y-%m-%dT%H:%M:%SZ")
log = lambda m: print(f"{iso(now())[11:19]} {DEVICE:22} {m}", flush=True)

# ------------------------------------------------------------------ keys, registration (trust on first use, persisted)
kp = KEYS / f"{DEVICE}.key.pem"
if not kp.exists():
    kp.write_bytes(Ed25519PrivateKey.generate().private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
PRIV = serialization.load_pem_private_key(kp.read_bytes(), None)
PUB_PEM = PRIV.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode()
pp = KEYS / "platform.pub.pem"
if not pp.exists():
    pp.write_text(urllib.request.urlopen(f"{PLATFORM}/api/pubkey", timeout=10).read().decode()); log("platform key pinned (TOFU)")
PLATFORM_PUB = serialization.load_pem_public_key(pp.read_bytes())
req = urllib.request.Request(f"{PLATFORM}/api/register", data=json.dumps({"device": DEVICE, "pubkey_pem": PUB_PEM}).encode(), headers={"Content-Type": "application/json"})
reg = json.loads(urllib.request.urlopen(req, timeout=10).read())
PATH = reg["path"]; log(f"registered, path {' > '.join(PATH)}")
state_file = KEYS / f"{DEVICE}.state.json"
st = json.loads(state_file.read_text()) if state_file.exists() else {}
last_seq, last_hb_seq = st.get("last_seq", 0), st.get("last_hb_seq", 0)
def save_state(): state_file.write_text(json.dumps({"last_seq": last_seq, "last_hb_seq": last_hb_seq}))

def verify(env):
    try:
        PLATFORM_PUB.verify(base64.b64decode(env["sig"]), env["payload"].encode()); return json.loads(env["payload"])
    except Exception: return None
def sign(doc):
    payload = json.dumps(doc, separators=(",", ":"))
    return json.dumps({"v": 1, "kid": "dev", "payload": payload, "sig": base64.b64encode(PRIV.sign(payload.encode())).decode()})

# ------------------------------------------------------------------ ViCare, direct REST (the library's login flow fails; the API itself is simple)
import requests
IAM = "https://iam.viessmann-climatesolutions.com/idp/v3"; API = "https://api.viessmann-climatesolutions.com/iot/v2"
CID = os.environ["VICARE_CLIENT_ID"]; REDIRECT = "vicare://oauth-callback/everest"
tok_file = KEYS / "vicare-token.json"; _tok = {"access": None, "exp": 0}

def _login_with_password():
    import secrets
    ver = base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode()
    ch = base64.urlsafe_b64encode(hashlib.sha256(ver.encode()).digest()).rstrip(b"=").decode()
    r = requests.post(f"{IAM}/authorize", params={"client_id": CID, "redirect_uri": REDIRECT, "response_type": "code", "code_challenge": ch, "code_challenge_method": "S256", "scope": "IoT User offline_access"},
                      auth=(os.environ["VICARE_EMAIL"], os.environ["VICARE_PASSWORD"]), allow_redirects=False, timeout=30)
    code = r.headers["Location"].split("code=")[1]
    return requests.post(f"{IAM}/token", data={"grant_type": "authorization_code", "client_id": CID, "redirect_uri": REDIRECT, "code": code, "code_verifier": ver}, timeout=30).json()

def token():
    if _tok["access"] and time.time() < _tok["exp"] - 60: return _tok["access"]
    t = None
    if tok_file.exists():
        rt = json.loads(tok_file.read_text()).get("refresh_token")
        if rt:
            t = requests.post(f"{IAM}/token", data={"grant_type": "refresh_token", "client_id": CID, "refresh_token": rt}, timeout=30).json()
            if "access_token" not in t: t = None
    if t is None: t = _login_with_password()
    tok_file.write_text(json.dumps({"refresh_token": t.get("refresh_token")})); os.chmod(tok_file, 0o600)
    _tok.update(access=t["access_token"], exp=time.time() + int(t.get("expires_in", 3600))); return _tok["access"]

H = lambda: {"Authorization": "Bearer " + token()}
def call(method, url, **kw):
    """Viessmann cloud is slow and flaky: 3 tries, 60 s each."""
    for i in range(3):
        try: return requests.request(method, url, headers=H(), timeout=60, **kw)
        except Exception as e: last = e; time.sleep(3)
    raise last
d = json.loads((KEYS / "vicare-device.json").read_text()) if (KEYS / "vicare-device.json").exists() else None
if d is None:
    inst = call("GET", f"{API}/equipment/installations", params={"includeGateways": "true"}).json()["data"]
    for i in inst:
        for g in i.get("gateways", []):
            for dv in g.get("devices", []):
                if dv.get("deviceType") == "heating": d = {"installation": i["id"], "gateway": g["serial"], "device": dv["id"], "model": dv.get("modelId")}
    (KEYS / "vicare-device.json").write_text(json.dumps(d))
FEAT = f"{API}/features/installations/{d['installation']}/gateways/{d['gateway']}/devices/{d['device']}/features"
HEAT_PROG = "heating.circuits.0.operating.programs.normal"
log(f"ViCare device: {d['model']} at installation {d['installation']}, heating circuit {'ON (offset ' + str(HEAT_OFFSET) + ' K)' if HEAT else 'off (DHW only)'}")

def read():
    try:
        r = call("GET", FEAT); j = r.json()
        if "data" not in j: log(f"ViCare read: HTTP {r.status_code} {str(j)[:120]}"); return {}
        feats = {x["feature"]: x for x in j["data"]}
    except Exception as e:
        log(f"ViCare read failed: {e}"); return {}
    v = lambda f, p="value": ((feats.get(f) or {}).get("properties") or {}).get(p, {}).get("value")
    return {"dhw_c": v("heating.dhw.sensors.temperature.hotWaterStorage"), "dhw_set_c": v("heating.dhw.temperature.main"),
            "dhw_mode": v("heating.dhw.operating.modes.active"), "outside_c": v("heating.sensors.temperature.outside"),
            "one_time": v("heating.dhw.oneTimeCharge", "active"), "active": bool(v("heating.compressors.0", "active") or v("heating.dhw.charging", "active")),
            "heat_set_c": v(HEAT_PROG, "temperature"), "heat_program": v("heating.circuits.0.operating.programs.active"),
            "flow_c": v("heating.circuits.0.temperature"), "comp_pct": v("heating.compressors.0.power")}

def write(what, url, body):
    """One command to the unit. The gateway answers 500 while it is still busy with the previous command: wait and try again."""
    for attempt in range(3):
        r = call("POST", url, json=body)
        log(f"ViCare: {what}: HTTP {r.status_code}" + (f" (attempt {attempt + 1}, retry in 10 s)" if r.status_code >= 500 and attempt < 2 else ""))
        if r.status_code < 500: return r.status_code < 300
        time.sleep(10)
    return False

def apply_dhw(setpoint, one_time=False):
    """Returns True when every write was accepted by the cloud."""
    if READ_ONLY: log(f"READ-ONLY: would set DHW {setpoint} °C one_time={one_time}"); return True
    ok = write(f"DHW setpoint -> {setpoint} °C", f"{FEAT}/heating.dhw.temperature.main/commands/setTargetTemperature", {"temperature": int(setpoint)})
    if one_time: ok = write("one-time charge", f"{FEAT}/heating.dhw.oneTimeCharge/commands/activate", {}) and ok
    return ok

def apply_heat(setpoint):
    """Room setpoint of the owner's 'normal' program (the one active by day). Returns True when accepted."""
    if not HEAT or setpoint is None: return True
    if READ_ONLY: log(f"READ-ONLY: would set heating normal program {setpoint} °C"); return True
    return write(f"heating normal program -> {setpoint} °C", f"{FEAT}/{HEAT_PROG}/commands/setTemperature", {"targetTemperature": int(setpoint)})

# ------------------------------------------------------------------ agent state
saved = None; effective = None; sig_active = None; end_at = 0; watchdog = False; last_hb = time.time(); lock = threading.Lock()
pending_seq = None     # newest accepted signal; a waiting go() applies only while it is still this one (RELEASE clears it)
SAVED_FILE = KEYS / f"{DEVICE}.saved.json"                          # {"dhw_set_c": owner tank setpoint, "heat_set_c": owner room setpoint}
OWNER_DHW_C = float(os.environ.get("VICARE_DHW_OWNER", "50"))     # the owner's normal setpoint, the value every revert must end at
try:
    _pending = json.loads(SAVED_FILE.read_text())
    if _pending.get("dhw_set_c") is not None or _pending.get("heat_set_c") is not None:   # a previous run died while a signal was active: put the owner's values back
        log(f"restoring owner setpoints {_pending} left behind by a previous run")
        if _pending.get("dhw_set_c") is not None: apply_dhw(_pending["dhw_set_c"])
        if _pending.get("heat_set_c") is not None: apply_heat(_pending["heat_set_c"])
        SAVED_FILE.unlink(missing_ok=True)
except FileNotFoundError:
    pass
except Exception as e:
    log(f"restore check failed: {e}")
mq = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"gz-{DEVICE}")
if BROKER.scheme == "mqtts": mq.tls_set()
if os.environ.get("GZ_MQTT_USER"): mq.username_pw_set(os.environ["GZ_MQTT_USER"], os.environ.get("GZ_MQTT_PASS"))

def ack(seq, status, reason, telem):
    doc = {"v": 1, "device": DEVICE, "path": PATH, "seq": seq, "status": status, "reason": reason,
           "applied": dict(effective) if effective else {}, "soc": 0, "grid_kw": round((NOMINAL_KW if telem.get("active") else 0.0), 2), "ts": iso(now())}
    mq.publish(f"gridzilla/ack/{DEVICE}", sign(doc), qos=1)
    log(f"ack {status}{' (' + reason + ')' if reason else ''} seq={seq} dhw={telem.get('dhw_c')}°C set={telem.get('dhw_set_c')}°C" + (f" room_set={telem.get('heat_set_c')}°C" if HEAT else ""))

def revert(reason):
    global saved, effective, sig_active
    with lock:
        if effective is None: return
        ok = True
        if saved is not None:
            ok = apply_dhw(saved["dhw_set_c"]) and apply_heat(saved.get("heat_set_c"))
        effective = None; sig_active = None
        if ok: saved = None; SAVED_FILE.unlink(missing_ok=True)   # a failed revert keeps the owner's values on disk: retried at the next poll and at restart
        else: log("REVERT: cloud rejected a write, keeping saved values for retry")
    log(f"REVERT to owner mode ({reason})"); ack(None, "reverted" if ok else "partial", reason if ok else "revert_write_failed", read())

def on_signal(env):
    global last_seq, saved, effective, sig_active, end_at, watchdog, last_hb, pending_seq
    sig = verify(env)
    if not sig: return ack(None, "refused", "bad_sig", read())
    if sig["segment"] not in PATH: return
    if sig.get("cohort") and int(hashlib.sha256(DEVICE.encode()).hexdigest()[:8], 16) % sig["cohort"][1] != sig["cohort"][0]: return
    age = (now() - datetime.strptime(sig["issued_at"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)).total_seconds()
    if sig["seq"] <= last_seq: return ack(sig["seq"], "refused", "stale_seq", read())
    if age > 120 or age < -30 or datetime.strptime(sig["valid_to"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) < now(): return ack(sig["seq"], "refused", "expired", read())
    last_seq = sig["seq"]; save_state()
    mode = sig["mode"]
    with lock: pending_seq = None if mode == "RELEASE" else sig["seq"]
    if mode == "RELEASE":
        revert("release"); return ack(sig["seq"], "applied", None, read())
    telem = read()
    if mode in ("ABSORB", "PREPARE"):   target, one_time, hdir = BOOST, True, +1
    elif mode in ("SUPPORT", "STRETCH"): target, one_time, hdir = FLOOR, False, -1
    else: return ack(sig["seq"], "applied", None, telem)                     # RECOVER: nothing to do for a tank or a slab
    ramp = sig["ramp_s"][0] + random.random() * (sig["ramp_s"][1] - sig["ramp_s"][0])
    start = max(0, (datetime.strptime(sig["valid_from"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) - now()).total_seconds()) + ramp / 10
    vf = datetime.strptime(sig["valid_from"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp()
    vt = datetime.strptime(sig["valid_to"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp()
    log(f"{mode} accepted: DHW -> {target} °C in {start:.0f}s")
    def go():
        global saved, effective, sig_active, end_at, watchdog, last_hb
        time.sleep(start)
        with lock:
            if pending_seq != sig["seq"] or time.time() >= vt:          # released or replaced while waiting: never apply a stale signal
                log(f"seq {sig['seq']} not applied (released, replaced or over before it started)"); return
            if saved is None:
                dhw_owner = telem.get("dhw_set_c") or OWNER_DHW_C
                if dhw_owner in (FLOOR, BOOST): dhw_owner = OWNER_DHW_C          # never "save" a value we set ourselves
                saved = {"dhw_set_c": dhw_owner, "heat_set_c": telem.get("heat_set_c") if HEAT else None}
                SAVED_FILE.write_text(json.dumps(saved))
            heat_target = None
            if HEAT and saved.get("heat_set_c") is not None:
                heat_target = min(HEAT_MAX, max(HEAT_MIN, saved["heat_set_c"] + hdir * HEAT_OFFSET))
            effective = {"mode": mode, "dhw_set_c": target, **({"heat_set_c": heat_target} if heat_target is not None else {})}; sig_active = sig["seq"]
            end_at = min(vt, vf + (4320 if mode == "STRETCH" else 1440) * 60); watchdog = mode in ("ABSORB", "SUPPORT"); last_hb = time.time()
            ok = apply_dhw(target, one_time)
            ok = apply_heat(heat_target) and ok
        ack(sig["seq"], "applied" if ok else "partial", None if ok else "cloud_write_failed", read())
    threading.Thread(target=go, daemon=True).start()

def on_message(c, u, m):
    global last_hb, last_hb_seq
    try: env = json.loads(m.payload.decode())
    except Exception: return
    if m.topic == "gridzilla/hb":
        hb = verify(env)
        if hb and hb["seq"] > last_hb_seq and abs((now() - datetime.strptime(hb["ts"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)).total_seconds()) < 90:
            last_hb_seq = hb["seq"]; last_hb = time.time()
        return
    on_signal(env)

announced = False
def on_connect(c, u, f, rc, p=None):
    global announced
    for n in PATH: c.subscribe(f"gridzilla/sig/{n}", qos=1)
    c.subscribe("gridzilla/hb"); log(f"online via {BROKER.hostname}, dhw {read().get('dhw_c')} °C")
    if not announced:                       # a fresh start is owner mode: tell the platform, so a stale ack from the previous run does not linger
        announced = True; ack(last_seq, "reverted", "agent_restart", read())
mq.on_connect, mq.on_message = on_connect, on_message
mq.reconnect_delay_set(2, 30); mq.connect_async(BROKER.hostname, BROKER.port or 1883, keepalive=30); mq.loop_start()

POLL_S = int(os.environ.get("VICARE_POLL_S", "90"))   # Viessmann allows ~1450 calls a day: 90 s keeps us under 1000
while True:
    time.sleep(POLL_S)
    t = read()
    mq.publish(f"gridzilla/state/{DEVICE}", json.dumps({"soc": 0, "grid_kw": round(NOMINAL_KW if t.get("active") else 0.0, 2), "dhw_c": t.get("dhw_c"), "dhw_set_c": t.get("dhw_set_c"),
                                                        "dhw_mode": t.get("dhw_mode"), "outside_c": t.get("outside_c"), "heat_set_c": t.get("heat_set_c"), "flow_c": t.get("flow_c"),
                                                        "comp_pct": t.get("comp_pct"), "mode": effective["mode"] if effective else "owner", "ts": iso(now())}))
    if saved is not None and effective is None:                      # a revert the cloud rejected earlier: try again
        log("retrying owner-setpoint restore")
        if apply_dhw(saved["dhw_set_c"]) and apply_heat(saved.get("heat_set_c")): saved = None; SAVED_FILE.unlink(missing_ok=True)
    if effective:
        if time.time() >= end_at: revert("window_end")
        elif watchdog and time.time() - last_hb > HB_TIMEOUT: revert("heartbeat_lost")
