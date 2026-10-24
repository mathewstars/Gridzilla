#!/usr/bin/env python3
"""Gridzilla agent for a Viessmann heating unit via ViCare (cloud API, PyViCare).

A heating unit is a controllable LOAD. The eight functions are the same as for a battery; only "apply" differs:
  ABSORB / PREPARE  -> raise the hot-water setpoint to the boost value and trigger a one-time charge (soak surplus, fill before event)
  SUPPORT / STRETCH -> lower the hot-water setpoint to the owner's floor (shed load)
  RELEASE / revert  -> restore the previous setpoint
Heating-circuit changes are left out on purpose for the demo (comfort), only DHW is touched.

Env (git-ignored .env or systemd -E):
  GZ_PLATFORM=http://127.0.0.1:8080   GZ_BROKER=mqtts://mqtt.victronlab.sk:8883   GZ_MQTT_USER / GZ_MQTT_PASS
  VICARE_EMAIL  VICARE_PASSWORD  VICARE_CLIENT_ID   GZ_DEVICE=vicare-blatnica
  VICARE_DHW_FLOOR=40  VICARE_DHW_BOOST=60  VICARE_KW=3  (nominal electrical kW while heating water; 0 for a gas boiler)
  GZ_READ_ONLY=1  -> never write to the unit (first test)
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
NOMINAL_KW = float(os.environ.get("VICARE_KW", "3")); READ_ONLY = os.environ.get("GZ_READ_ONLY", "0") == "1"
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

# ------------------------------------------------------------------ ViCare
from PyViCare.PyViCare import PyViCare
vic = PyViCare(); vic.initWithCredentials(os.environ["VICARE_EMAIL"], os.environ["VICARE_PASSWORD"], os.environ["VICARE_CLIENT_ID"], str(KEYS / "vicare-token.save"))
dev = vic.devices[0]; unit = dev.asAutoDetectDevice()
log(f"ViCare device: {dev.getModel()} ({dev.getDeviceId()}) via {type(unit).__name__}")

def safe(fn, default=None):
    try: return fn()
    except Exception: return default

def read():
    r = {"dhw_c": safe(lambda: unit.getDomesticHotWaterStorageTemperature()),
         "dhw_set_c": safe(lambda: unit.getDomesticHotWaterConfiguredTemperature()),
         "dhw_mode": safe(lambda: unit.getDomesticHotWaterActiveMode()),
         "outside_c": safe(lambda: unit.getOutsideTemperature()),
         "active": bool(safe(lambda: unit.getBurnerActive(), None) or safe(lambda: unit.getCompressorActive(), None) or safe(lambda: unit.getDomesticHotWaterCharging(), None))}
    return r

def apply_dhw(setpoint, one_time=False):
    if READ_ONLY: log(f"READ-ONLY: would set DHW {setpoint} °C one_time={one_time}"); return
    unit.setDomesticHotWaterTemperature(int(setpoint))
    if one_time: safe(lambda: unit.activateOneTimeCharge())
    log(f"ViCare: DHW setpoint -> {setpoint} °C" + (" + one-time charge" if one_time else ""))

# ------------------------------------------------------------------ agent state
saved = None; effective = None; sig_active = None; end_at = 0; watchdog = False; last_hb = time.time(); lock = threading.Lock()
mq = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"gz-{DEVICE}")
if BROKER.scheme == "mqtts": mq.tls_set()
if os.environ.get("GZ_MQTT_USER"): mq.username_pw_set(os.environ["GZ_MQTT_USER"], os.environ.get("GZ_MQTT_PASS"))

def ack(seq, status, reason, telem):
    doc = {"v": 1, "device": DEVICE, "path": PATH, "seq": seq, "status": status, "reason": reason,
           "applied": {"mode": effective["mode"]} if effective else {}, "soc": 0, "grid_kw": round((NOMINAL_KW if telem.get("active") else 0.0), 2), "ts": iso(now())}
    mq.publish(f"gridzilla/ack/{DEVICE}", sign(doc), qos=1)
    log(f"ack {status}{' (' + reason + ')' if reason else ''} seq={seq} dhw={telem.get('dhw_c')}°C set={telem.get('dhw_set_c')}°C")

def revert(reason):
    global saved, effective, sig_active
    with lock:
        if effective is None: return
        if saved is not None: apply_dhw(saved)
        effective = None; sig_active = None; saved = None
    log(f"REVERT to owner mode ({reason})"); ack(None, "reverted", reason, read())

def on_signal(env):
    global last_seq, saved, effective, sig_active, end_at, watchdog, last_hb
    sig = verify(env)
    if not sig: return ack(None, "refused", "bad_sig", read())
    if sig["segment"] not in PATH: return
    if sig.get("cohort") and int(hashlib.sha256(DEVICE.encode()).hexdigest()[:8], 16) % sig["cohort"][1] != sig["cohort"][0]: return
    age = (now() - datetime.strptime(sig["issued_at"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)).total_seconds()
    if sig["seq"] <= last_seq: return ack(sig["seq"], "refused", "stale_seq", read())
    if age > 120 or age < -30 or datetime.strptime(sig["valid_to"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) < now(): return ack(sig["seq"], "refused", "expired", read())
    last_seq = sig["seq"]; save_state()
    mode = sig["mode"]
    if mode == "RELEASE":
        revert("release"); return ack(sig["seq"], "applied", None, read())
    telem = read()
    if mode in ("ABSORB", "PREPARE"):   target, one_time = BOOST, True
    elif mode in ("SUPPORT", "STRETCH"): target, one_time = FLOOR, False
    else: return ack(sig["seq"], "applied", None, telem)                     # RECOVER: nothing to do for a tank
    ramp = sig["ramp_s"][0] + random.random() * (sig["ramp_s"][1] - sig["ramp_s"][0])
    start = max(0, (datetime.strptime(sig["valid_from"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) - now()).total_seconds()) + ramp / 10
    vf = datetime.strptime(sig["valid_from"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp()
    vt = datetime.strptime(sig["valid_to"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp()
    log(f"{mode} accepted: DHW -> {target} °C in {start:.0f}s")
    def go():
        global saved, effective, sig_active, end_at, watchdog, last_hb
        time.sleep(start)
        with lock:
            if saved is None: saved = telem.get("dhw_set_c") or 50
            effective = {"mode": mode}; sig_active = sig["seq"]
            end_at = min(vt, vf + (4320 if mode == "STRETCH" else 240) * 60); watchdog = mode in ("ABSORB", "SUPPORT"); last_hb = time.time()
            apply_dhw(target, one_time)
        ack(sig["seq"], "applied", None, read())
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

def on_connect(c, u, f, rc, p=None):
    for n in PATH: c.subscribe(f"gridzilla/sig/{n}", qos=1)
    c.subscribe("gridzilla/hb"); log(f"online via {BROKER.hostname}, dhw {read().get('dhw_c')} °C")
mq.on_connect, mq.on_message = on_connect, on_message
mq.reconnect_delay_set(2, 30); mq.connect_async(BROKER.hostname, BROKER.port or 1883, keepalive=30); mq.loop_start()

while True:
    time.sleep(10)
    t = read()
    mq.publish(f"gridzilla/state/{DEVICE}", json.dumps({"soc": 0, "grid_kw": round(NOMINAL_KW if t.get("active") else 0.0, 2), "dhw_c": t.get("dhw_c"), "dhw_set_c": t.get("dhw_set_c"),
                                                        "dhw_mode": t.get("dhw_mode"), "outside_c": t.get("outside_c"), "mode": effective["mode"] if effective else "owner", "ts": iso(now())}))
    if effective:
        if time.time() >= end_at: revert("window_end")
        elif watchdog and time.time() - last_hb > HB_TIMEOUT: revert("heartbeat_lost")
