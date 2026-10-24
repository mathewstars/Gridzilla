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
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import weather
import flatten

HERE = Path(__file__).parent
KEYS = HERE / "keys"
KID = "gz-2026-10"
BROKER = os.environ.get("GZ_BROKER", "localhost:1883")          # host:port
MQTT_TLS = os.environ.get("GZ_MQTT_TLS", "0") == "1"             # 1 for HiveMQ Cloud / any TLS broker on 8883
MQTT_USER = os.environ.get("GZ_MQTT_USER")
MQTT_PASS = os.environ.get("GZ_MQTT_PASS")
PORT = int(os.environ.get("GZ_PORT", "8080"))
LLM_URL = os.environ.get("GZ_LLM_URL")            # e.g. http://spark-1:8000/v1
LLM_MODEL = os.environ.get("GZ_LLM_MODEL", "deepseek-v4.1")

MODE_FIELDS = {
    "PREPARE": {"target_soc", "charge_max_kw"},
    "ABSORB": {"export_max_kw", "charge_max_kw", "max_soc_by"},
    "SUPPORT": {"import_max_kw", "export_min_kw"},
    "STRETCH": {"discharge_max_kw"},
    "RECOVER": {"charge_max_kw"},
    "RELEASE": set(),
    "SHAPE": {"import_max_kw", "export_max_kw"},   # the daily diet: two per-slot ceilings, on its own channel, under every event signal
}
ALL_FIELDS = ["import_max_kw", "export_max_kw", "export_min_kw", "charge_max_kw", "discharge_max_kw", "target_soc", "max_soc_by"]


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
    "support_count": {},   # f"{node}:{sim day}" -> n
}
LOG = collections.deque(maxlen=300)
HIST_N = 1440                  # 2 h of 5 s samples per node (curves survive a restart: see HIST_FILE)
DEV_HIST_N = 400
NODE_HIST = {n: collections.deque(maxlen=HIST_N) for n in TREE}
DEV_HIST = {d: collections.deque(maxlen=DEV_HIST_N) for d in DEVICES}
HIST_FILE = HERE / "history.json"
try:
    _h = json.loads(HIST_FILE.read_text())
    for n, pts in _h.get("nodes", {}).items():
        if n in NODE_HIST: NODE_HIST[n].extend(pts[-HIST_N:])
    for d, pts in _h.get("devices", {}).items():
        if d in DEV_HIST: DEV_HIST[d].extend(pts[-DEV_HIST_N:])
    print(f"[history] restored {sum(len(v) for v in NODE_HIST.values())} node samples from {HIST_FILE.name}", flush=True)
except FileNotFoundError:
    pass
except Exception as _e:
    print("[history] restore failed:", _e, flush=True)


def save_history():
    tmp = HIST_FILE.with_suffix(".tmp")
    with _lock:
        tmp.write_text(json.dumps({"nodes": {n: list(v) for n, v in NODE_HIST.items()},
                                   "devices": {d: list(v) for d, v in DEV_HIST.items() if d in ("real-powerplant-blatnica", "vicare-blatnica")}}))
    tmp.replace(HIST_FILE)


def sim_hour():
    hs = [t.get("sim_hour") for t in state["telemetry"].values() if t.get("sim_hour") is not None]
    return max(hs) if hs else now().hour + now().minute / 60


# Demo scenario: scales the houses NOT in the program. load_x > 1 = cold evening, pv_x > 1 = sunny noon.
SCENARIO = {"name": os.environ.get("GZ_SCENARIO", "live-weather"), "load_x": 1.0, "pv_x": 1.0}   # the simulated city follows today's real Vienna weather unless told otherwise
SCENARIOS = {"normal": (1.0, 1.0), "cold-evening": (1.2, 1.0), "sunny-noon": (1.0, 5.0),
             "live-weather": (1.0, 1.0)}   # live-weather: per-hour factors from the real forecast (weather.py)
SIM_X = float(os.environ.get("GZ_SIM_X", "60"))   # simulated seconds per real second; sim-agent default is 1 sim minute per second


def sim_day():
    """Day counter in simulated time, so per-day policy limits scale with the simulation speed."""
    return int(time.time() * SIM_X // 86400)


def factors_at(hour):
    """(load_x, pv_x) for grid hour `hour`: the real forecast under live-weather, else the scenario's constants."""
    if SCENARIO["name"] == "live-weather":
        f = weather.factors_at(hour)
        if f:
            return f
    return SCENARIO["load_x"], SCENARIO["pv_x"]


def other_profile_kw(hour):
    """kW per house not in the program: morning bump, midday PV export, evening peak."""
    import math
    hour %= 24
    base = 0.5
    morning = 1.0 * math.exp(-((hour - 7) / 1.0) ** 2)
    evening = 2.9 * math.exp(-((hour - 19) / 2.2) ** 2)      # heat pumps, cooking, a few uncontrolled EV chargers
    sun = max(0.0, math.sin((hour - 6) / 12 * math.pi))
    pv = -2.2 * sun * 0.5          # half of them have PV, exporting at noon
    load_x, pv_x = factors_at(hour)
    return (base + morning + evening) * load_x + pv * pv_x


def sample_history():
    h = sim_hour()
    with _lock:
        for n in TREE:
            prog = 0.0; base = 0.0
            for d in devices_under(n):
                t = state["telemetry"].get(d["id"])
                if t and t.get("grid_kw") is not None:
                    prog += t["grid_kw"] * d.get("represents", 1)
                    base += (t.get("grid_owner_kw") if t.get("grid_owner_kw") is not None else t["grid_kw"]) * d.get("represents", 1)
            other = sum(TREE[t].get("other_houses", 0) * other_profile_kw(h)
                        for t in TREE if n in path_of(t) and t.startswith("tf:"))
            NODE_HIST[n].append({"ts": iso(now()), "h": round(h, 2), "program_kw": round(prog, 1), "baseline_kw": round(base + other, 1),
                                 "other_kw": round(other, 1), "total_kw": round(prog + other, 1)})
        for d in DEVICES:
            t = state["telemetry"].get(d)
            if t:
                DEV_HIST[d].append({"ts": iso(now()), "h": round(h, 2), "soc": t.get("soc"), "grid_kw": t.get("grid_kw"),
                                    "mode": t.get("mode"), "imp_cap": t.get("imp_cap_kw"), "exp_cap": t.get("exp_cap_kw")})


def sampler_loop():
    i = 0
    while True:
        try:
            sample_history()
            i += 1
            if i % 12 == 0: save_history()        # every minute
        except Exception as e:
            print("[sampler]", e)
        time.sleep(5)

if STATE_FILE.exists():
    try:
        saved = json.loads(STATE_FILE.read_text())
        state["seq"] = saved.get("seq", 0)
        state["pubkeys"] = saved.get("pubkeys", {})
        state["recent"] = saved.get("recent", {})
        if saved.get("scenario") in SCENARIOS:
            SCENARIO["name"] = saved["scenario"]; SCENARIO["load_x"], SCENARIO["pv_x"] = SCENARIOS[saved["scenario"]]
    except Exception:
        pass


def persist():
    STATE_FILE.write_text(json.dumps({"seq": state["seq"], "pubkeys": state["pubkeys"], "recent": state.get("recent", {}), "scenario": SCENARIO["name"]}))


def log(kind, msg, **extra):
    entry = {"ts": iso(now()), "kind": kind, "msg": msg, **extra}
    LOG.appendleft(entry)
    print(f"[{kind}] {msg}", flush=True)


# ---------------------------------------------------------------- mqtt
host, port = BROKER.split(":")
mq = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="gridzilla-platform")
if MQTT_TLS:
    mq.tls_set()                                   # system CA bundle; HiveMQ Cloud uses a public certificate
if MQTT_USER:
    mq.username_pw_set(MQTT_USER, MQTT_PASS)


def on_connect(client, userdata, flags, rc, props=None):
    if rc != 0:
        log("mqtt", f"connect to {BROKER} refused: {rc}"); return
    log("mqtt", f"connected to {BROKER}" + (" (TLS)" if MQTT_TLS else " (plain)"))
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


def on_disconnect(client, userdata, flags, rc, props=None):
    log("mqtt", f"disconnected from {BROKER} (rc {rc}), reconnecting")


mq.on_connect, mq.on_message, mq.on_disconnect = on_connect, on_message, on_disconnect


def heartbeat_loop():
    while True:
        with _lock:
            state["hb_seq"] += 1
            lx, px = factors_at(sim_hour())
            doc = {"seq": state["hb_seq"], "ts": iso(now()), "wx": {"load_x": round(lx, 3), "pv_x": round(px, 3), "scenario": SCENARIO["name"]}}
        if not HB_PAUSED.is_set():
            mq.publish("gridzilla/hb", envelope(doc), qos=0)
        time.sleep(POLICY["heartbeat_s"])


HB_PAUSED = threading.Event()


# ---------------------------------------------------------------- policy guard
def guard(segment, mode, fields, duration_min, envelope=None):
    if segment not in TREE:
        return f"unknown segment {segment}"
    if mode not in MODE_FIELDS:
        return f"unknown mode {mode}"
    given = {k for k, v in fields.items() if v is not None}
    extra = given - MODE_FIELDS[mode]
    if extra:
        return f"{mode} may not carry {sorted(extra)}"
    limit = POLICY["max_stretch_window_min"] if mode == "STRETCH" else POLICY["max_window_min"]
    floor_s = 30 if mode == "RELEASE" else POLICY["ramp_s"][1] + 30      # real seconds: a device must finish its ramp inside the window
    if not (floor_s <= duration_min * 60 and duration_min <= limit):
        return f"window must be {floor_s} s .. {limit} min (real time) for {mode}"
    if envelope is not None:
        if mode not in ("ABSORB", "SUPPORT", "SHAPE"):
            return "only ABSORB and SUPPORT may carry an envelope"
        imp, exp = envelope.get("import_max_kw") or [], envelope.get("export_max_kw") or []
        if not (0 < envelope.get("slot_s", 0)) or len(imp) > 96 or len(exp) > 96:
            return "envelope needs slot_s > 0 and at most 96 slots"
        if mode != "SHAPE" and ((imp and mode != "SUPPORT") or (exp and mode != "ABSORB")):
            return "import curve belongs to SUPPORT, export curve to ABSORB"
        for c in (envelope.get("by_tf") or {}).values():
            if len(c) > 96 or (mode in ("SUPPORT", "SHAPE") and any(v < POLICY["max_import_cap_floor_kw"] for v in c)) or any(v < 0 for v in c):
                return "per-transformer envelope out of policy"
        if any(v < POLICY["max_import_cap_floor_kw"] for v in imp):
            return f"envelope import cap below policy floor {POLICY['max_import_cap_floor_kw']} kW"
        if any(v < 0 for v in exp):
            return "envelope export cap below 0"
    if mode == "SUPPORT":
        key = f"{segment}:{sim_day()}"
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
STAGGER_N = int(POLICY.get("stagger_cohorts", 4))


def send_signal(segment, mode, fields, duration_min, note="", start_in_min=0, cohort=None, curve=None, stagger=None):
    """A PREPARE, RECOVER or make-room ABSORB without an explicit cohort is split into STAGGER_N cohorts whose windows start
    one after the other and all end at the same deadline: the fleet fills in waves instead of all at once (titration).
    The first cohort's document is returned; the others are sent right after it."""
    if cohort is not None and not (len(cohort) == 2 and 0 <= cohort[0] < cohort[1] <= 16):
        raise HTTPException(400, "cohort must be [k, n] with k < n <= 16")
    n = STAGGER_N if stagger is None else int(stagger)
    fills = mode in ("PREPARE", "RECOVER") or (mode == "ABSORB" and fields.get("max_soc_by") is not None)
    if cohort is None and fills and n > 1 and duration_min >= 2 * n:
        step = duration_min / n
        first = None
        for k in range(n):
            off = int(round(k * step))
            doc = send_signal(segment, mode, fields, int(duration_min - off), note, start_in_min + off, [k, n], curve, stagger=1)
            first = first or doc
        log("signal", f"{mode} -> {segment} staggered over {n} cohorts, {step:.0f} min apart, all done by the same deadline")
        return first
    err = guard(segment, mode, fields, duration_min, curve)
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
            "ramp_s": POLICY["ramp_s"], "note": note or "", "cohort": cohort,
        }
        if curve is not None:
            doc["envelope"] = curve
        if mode == "RELEASE":     # devices under the segment drop whatever they ran, so do the signals of the nodes below it
            for n in [n for n in state["active"] if segment in path_of(n)]:
                doc_old = state["active"].pop(n)
                state.setdefault("recent", {})[n] = {**doc_old, "ended_at": iso(now()), "ended": f"released by seq {seq}"}
        else:
            state["active"][segment] = doc
            state.setdefault("recent", {})[segment] = {**doc, "ended_at": None, "ended": None}
        if mode == "SUPPORT":
            key = f"{segment}:{sim_day()}"
            state["support_count"][key] = state["support_count"].get(key, 0) + 1
        persist()
    mq.publish(f"gridzilla/sig/{segment}", envelope(doc), qos=1)
    log("signal", f"seq {seq} {mode} -> {segment}" + (f" cohort {cohort[0]}/{cohort[1]} " if cohort else " ") + " ".join(f"{k}={v}" for k, v in fields.items() if v is not None)
        + f" for {duration_min:g} min" + (f" with a {len(curve.get('import_max_kw') or curve.get('export_max_kw') or [])}-slot envelope" if curve else ""),
        seq=seq, mode=mode, segment=segment)
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
        last = NODE_HIST[node][-1] if NODE_HIST[node] else {}
        rating = TREE[node].get("rating_kw")
        out[node] = {"devices": len(devs), "online": sum(1 for d in devs if d["id"] in state["telemetry"]),
                     "kwh_available": round(kwh_avail, 1), "kw": kw, "applied": applied,
                     "active": state["active"].get(node, {}).get("mode"),
                     "total_kw": last.get("total_kw"), "program_kw": last.get("program_kw"), "other_kw": last.get("other_kw"), "baseline_kw": last.get("baseline_kw"),
                     "rating_kw": rating, "load_pct": round(100 * last["total_kw"] / rating) if rating and last else None}
    return out


# ---------------------------------------------------------------- forecast and envelopes
ENV_SLOT_SIM_MIN = 15          # one envelope slot = 15 grid minutes, the settlement interval of the meter
ENV_MARGIN = 0.9               # plan to 90 % of the transformer rating, keep 10 % for forecast error


def tfs_under(node):
    return [t for t in TREE if t.startswith("tf:") and node in path_of(t)]


def program_houses(tf):
    """Connection points in the program behind tf that are online: battery devices only. A controllable load such as
    vicare-blatnica sits behind a house that is already counted, so it shares that house's envelope."""
    return sum(d.get("represents", 1) for d in devices_under(tf) if d["id"] in state["telemetry"] and d.get("kwh", 0) > 0)


def forecast(node, hours=3.0, step_min=ENV_SLOT_SIM_MIN, counterfactual=False):
    """Transformer load ahead, assuming program houses keep their current net power. With counterfactual=True the
    program houses are taken at what they would draw with no signal at all (owner mode), which is the honest test for
    "is the event over": the measured load is low *because* the signal holds it."""
    h0, out = sim_hour(), []
    for k in range(int(hours * 60 / step_min) + 1):
        h = h0 + k * step_min / 60
        other = sum(TREE[t].get("other_houses", 0) * other_profile_kw(h) for t in tfs_under(node))
        last = NODE_HIST[node][-1] if NODE_HIST[node] else None
        prog = 0.0 if not last else ((last["baseline_kw"] - last["other_kw"]) if counterfactual and last.get("baseline_kw") is not None else last["program_kw"])
        out.append({"h": round(h % 24, 2), "other_kw": round(other, 1), "total_kw": round(other + prog, 1)})
    return out


def compute_envelope(node, mode, duration_sim_min, start_in_sim_min=0.0):
    """Dynamic operating envelope: per-house import (SUPPORT) or export (ABSORB) ceiling per 15-min slot,
    from forecast headroom = 90 % of the transformer rating minus the load of the houses not in the program,
    shared over the program houses. For a feeder or substation the tightest transformer under it wins."""
    n = max(1, min(96, round(duration_sim_min / ENV_SLOT_SIM_MIN)))
    h0, curve = sim_hour() + start_in_sim_min / 60, []
    for k in range(n):
        h = h0 + k * ENV_SLOT_SIM_MIN / 60
        caps = []
        for t in tfs_under(node):
            houses = program_houses(t)
            if not houses:
                continue
            other = TREE[t].get("other_houses", 0) * other_profile_kw(h)
            if mode == "SUPPORT":
                caps.append((ENV_MARGIN * TREE[t]["rating_kw"] - other) / houses)
            else:
                caps.append((ENV_MARGIN * TREE[t].get("reverse_kw", TREE[t]["rating_kw"]) + other) / houses)
        cap = min(caps) if caps else 15.0
        lo = POLICY["max_import_cap_floor_kw"] if mode == "SUPPORT" else 0.0
        curve.append(round(min(15.0, max(lo, cap)), 1))
    env = {"slot_s": round(ENV_SLOT_SIM_MIN * 60 / SIM_X, 3), "slot_sim_min": ENV_SLOT_SIM_MIN, "start_sim_h": round(h0 % 24, 2),
           "import_max_kw": curve if mode == "SUPPORT" else None,
           "export_max_kw": curve if mode == "ABSORB" else None}
    under = tfs_under(node)
    if len(under) > 1:        # one curve per street transformer: each house follows its own transformer's headroom
        env["by_tf"] = {t: compute_envelope(t, mode, duration_sim_min, start_in_sim_min)["import_max_kw" if mode == "SUPPORT" else "export_max_kw"]
                        for t in under if program_houses(t)}
    return env


# ---------------------------------------------------------------- flattening: the monster's diet (flatten.py)
SHAPE_EVERY_S = int(os.environ.get("GZ_SHAPE_EVERY_S", "120"))      # re-plan every 2 grid hours
SHAPE = {"plans": {}, "at": None, "seq": {}, "rounds": 0, "enabled": os.environ.get("GZ_SHAPE", "1") != "0", "bias": {}}


def shape_feedback():
    """Closed loop: how far the measured load sits above (or below) the last plan at this moment, per transformer,
    smoothed and clamped, becomes extra uncontrolled load in the next plan. Thermal loads and cars the model did not
    count show up here instead of in an overshoot."""
    h = sim_hour()
    for tf, p in SHAPE["plans"].items():
        if not NODE_HIST[tf]:
            continue
        k = int(((h - p["start_h"]) % 24) * 4)
        if not 0 <= k < len(p["planned_kw"]):
            continue
        err = NODE_HIST[tf][-1]["total_kw"] - p["planned_kw"][k]
        lim = 0.25 * TREE[tf]["rating_kw"]
        SHAPE["bias"][tf] = max(-lim, min(lim, 0.5 * SHAPE["bias"].get(tf, 0.0) + 0.5 * err))


def fleet_under(tf):
    """(houses, ev houses, usable battery kWh for the peak, free battery kWh for the noon surplus) behind a transformer."""
    houses = ev = usable = free = 0.0
    for d in devices_under(tf):
        t = state["telemetry"].get(d["id"])
        if not t or d.get("kwh", 0) <= 0:
            continue
        r = d.get("represents", 1); houses += r
        if d.get("ev_kw") or t.get("ev"): ev += r
        soc = t.get("soc") if t.get("soc") is not None else 50
        usable += r * d["kwh"] * max(0.0, (soc - 20) / 100) * 0.9
        free += r * d["kwh"] * max(0.0, (100 - soc) / 100)
    return int(houses), int(ev), usable, free


def flatten_plan(node=None):
    """Plans per transformer (fresh), aggregated for a feeder, substation or the city when node is given."""
    h0 = sim_hour()
    pv_x = lambda h: factors_at(h)[1]            # the real solar forecast shapes the export level and the valley
    plans = {}
    for tf in [t for t in TREE if t.startswith("tf:")]:
        houses, ev, usable, free = fleet_under(tf)
        if not houses:
            continue
        other = (lambda t: (lambda h: TREE[t].get("other_houses", 0) * other_profile_kw(h)))(tf)
        plans[tf] = flatten.plan_tf(tf, TREE[tf], h0, other, houses, ev, pv_x, usable, free, bias_kw=SHAPE["bias"].get(tf, 0.0))
    if node is None:
        return plans
    if node.startswith("tf:"):
        return plans.get(node)
    under = [plans[t] for t in tfs_under(node) if t in plans]
    rating = TREE[node].get("rating_kw") or sum(TREE[t]["rating_kw"] for t in tfs_under(node))
    return flatten.aggregate(under, node, rating)


def shape_round():
    """One SHAPE per feeder, carrying every transformer's curves (by_tf); the segment-wide curve is the tightest one."""
    shape_feedback()
    plans = flatten_plan()
    if not plans:
        return
    sent = 0
    for feeder in [n for n in TREE if n.startswith("feeder:")]:
        tfs = [t for t in tfs_under(feeder) if t in plans]
        if not tfs:
            continue
        n = flatten.SLOTS
        imp = [round(min(plans[t]["import_max_kw"][k] for t in tfs), 1) for k in range(n)]
        exp = [round(min(plans[t]["export_max_kw"][k] for t in tfs), 1) for k in range(n)]
        curve = {"slot_s": round(flatten.DT * 3600 / SIM_X, 3), "slot_sim_min": 15, "start_sim_h": round(sim_hour() % 24, 2),
                 "import_max_kw": imp, "export_max_kw": exp,
                 "by_tf": {t: plans[t]["import_max_kw"] for t in tfs}, "by_tf_export": {t: plans[t]["export_max_kw"] for t in tfs}}
        duration_min = 24 * 60 / SIM_X                                   # 24 grid hours, real minutes
        with _lock:
            state["seq"] += 1; seq = state["seq"]
            t0 = now()
            doc = {"v": 1, "seq": seq, "issued_at": iso(t0), "segment": feeder, "mode": "SHAPE",
                   "valid_from": iso(t0), "valid_to": iso(t0 + timedelta(minutes=duration_min)),
                   **{k: None for k in ALL_FIELDS}, "ramp_s": POLICY["ramp_s"],
                   "note": "Gridzilla diet plan: your car is full by morning, the street stays flat", "cohort": None, "envelope": curve}
            SHAPE["seq"][feeder] = seq
            persist()
        mq.publish(f"gridzilla/shape/{feeder}", envelope(doc), qos=1)
        sent += 1
    SHAPE["plans"] = plans; SHAPE["at"] = iso(now()); SHAPE["rounds"] += 1
    city = flatten.aggregate(list(plans.values()), "region:at", sum(TREE[t]["rating_kw"] for t in plans))
    log("shape", f"diet plan renewed on {sent} feeders: Vienna peak {city['peak_naive_kw'] / 1000:.2f} MW without -> {city['peak_plan_kw'] / 1000:.2f} MW planned, "
                 f"{city['shifted_kwh']:.0f} kWh of car charging moved into the valley, {city['shaved_kwh']:.0f} kWh of peak eaten by batteries")


def shape_loop():
    time.sleep(40)                                                        # let the houses register first
    while True:
        if SHAPE["enabled"]:
            try:
                shape_round()
            except Exception as e:
                print("[shape]", e, flush=True)
        time.sleep(SHAPE_EVERY_S)


# ---------------------------------------------------------------- LLM advisor (DeepSeek, OpenAI-compatible)
ADVISOR_SYSTEM = """You are the control brain of Gridzilla, a DSO platform that sends bounded signals to home batteries.
You choose one signal or none. A deterministic policy guard checks it; if it passes, the platform signs and sends it without a human.
Signal modes and allowed fields:
- PREPARE: target_soc (50-100), charge_max_kw. Fill batteries gently before a forecast event or outage window.
- ABSORB: export_max_kw, charge_max_kw. PV surplus / reverse flow: cap export, batteries and EVs soak it up.
- SUPPORT: import_max_kw ("take N kW only"), export_min_kw ("give at least N kW"). Load peak or deficit while the grid is up.
- STRETCH: discharge_max_kw. Street is dead; ration batteries until expected restoration (duration = expected restoration).
- RECOVER: charge_max_kw. After restoration, recharge. (PREPARE, RECOVER and make-room ABSORB are automatically staggered over cohorts by the platform, so the fleet fills in waves.)
- RELEASE: end the event on that segment.
Underneath you, the platform's flattening plan (SHAPE) already runs on every feeder all day: per-slot import and export
ceilings that spread car charging into the night valley and let batteries eat the evening peak. Do not send SUPPORT or
ABSORB merely to flatten a normal day; send them for what the plan cannot see: a forecast above rating despite the plan,
a cold snap, an outage, PV backflow beyond the plan's export level.
For ABSORB and SUPPORT the platform attaches a dynamic operating envelope: a per-house ceiling for every 15-minute slot,
computed from the forecast headroom of each transformer. Your flat import_max_kw / export_max_kw is the fallback for devices
that cannot follow a curve, so choose it as the tightest value you expect to need.
Rules: signals are limits at the grid connection point, never setpoints. Pick the segment at the level where the constraint is:
a street transformer only helps itself; a feeder or substation constraint can be served by every battery under it.
Use the forecast: act BEFORE the transformer reaches its rating, size duration_min to cover the forecast congestion.
All times (duration_min, start_in_min) are in grid minutes; the grid clock is sim_hour.
Policy: a signal may run up to 24 grid hours (1440 min) and be renewed without limit, so continuous control is normal; STRETCH up to 4320, export_min_kw max 5 per device, import_max_kw min 2, max two SUPPORT per node per grid day.
Answer with ONLY a JSON object: {"segment": "...", "mode": "...", "fields": {...}, "duration_min": N, "start_in_min": N, "note": "one sentence for the owners", "rationale": "two sentences for the operator"}
When the grid state lists allowed_segments, the segment MUST be one of them: the target covers every hot transformer at once,
a listed transformer alone only helps that street. Prefer the target unless you have a reason.
Weather (grid hours, real forecast): a cold or windy-cold evening ahead means a bigger heat-pump peak, so PREPARE batteries
earlier and SUPPORT through the peak; strong sun at midday means PV backflow, so ABSORB. An official warning is context,
not a reason for a crisis signal by itself.
If no signal is needed right now, answer {"mode": "NONE", "rationale": "..."}."""


class Advise(BaseModel):
    situation: str


def real_min(sim_min):
    return sim_min / SIM_X


REAL_MIN_WINDOW_MIN = POLICY.get("autopilot_real_min_window_min", 5)    # real devices run in real time, not at GZ_SIM_X
REAL_COOLDOWN_MIN = POLICY.get("autopilot_real_cooldown_min", 5)
REAL_MAX_PER_HOUR = POLICY.get("autopilot_real_max_per_hour", 6)


def has_real(node):
    """True if a device under node that is not simulated is online: it needs real-time windows and brakes."""
    return any(not d["id"].startswith("sim-") and d["id"] in state["telemetry"] for d in devices_under(node))


def real_window(segment, mode, sim_dur):
    """Real minutes for a window DeepSeek gave in grid minutes, floored so every device can finish its ramp."""
    if mode == "RELEASE":
        return max(real_min(sim_dur), 1.0)
    floor = REAL_MIN_WINDOW_MIN if has_real(segment) else (POLICY["ramp_s"][1] + 30) / 60
    return max(real_min(sim_dur), floor)


def focus_context(focus):
    """Only the part of the grid the decision is about: the target, its transformers, their forecast and batteries."""
    node = focus["node"]
    ag = aggregates()
    tfs = {}
    for t in tfs_under(node):
        devs = [d for d in devices_under(t) if d.get("kwh", 0) > 0 and d["id"] in state["telemetry"]]
        socs = [state["telemetry"][d["id"]].get("soc") for d in devs if state["telemetry"][d["id"]].get("soc") is not None]
        h = AP["hotspots"].get(t, {})
        tfs[t] = {"rating_kw": TREE[t]["rating_kw"], "load_pct_now": ag[t]["load_pct"], "forecast_peak_pct": h.get("pct"),
                  "peak_at_h": h.get("at_h"), "program_houses": program_houses(t), "avg_battery_soc": round(sum(socs) / len(socs)) if socs else None,
                  "forecast_kw_next_3h": [p["total_kw"] for p in forecast(t)][::2]}
    shp = {t: {"level_kw": p["level_kw"], "planned_peak_pct": p["peak_plan_pct"], "naive_peak_pct": p["peak_naive_pct"]} for t, p in SHAPE["plans"].items() if t in tfs}
    return {"sim_hour": round(sim_hour(), 2), "target": node, "path": path_of(node), "allowed_segments": focus["choices"], "flattening_plan": shp,
            "transformers": tfs, "active_signals_overlapping": {n: {k: s.get(k) for k in ("seq", "mode", "valid_to") if s.get(k) is not None}
                                                                for n, s in state["active"].items() if overlaps(n, node)}}


def ask_llm(situation: str, focus=None):
    if not LLM_URL:
        raise HTTPException(503, "GZ_LLM_URL not set")
    if focus:
        ctx = focus_context(focus)
    else:
        ag = aggregates()
        hot = sorted(AP["hotspots"].items(), key=lambda kv: -abs(kv[1]["pct"]))[:8]
        ctx = {"sim_hour": round(sim_hour(), 2), "hottest_transformers": {t: {"forecast_peak_pct": h["pct"], "feeder": h["feeder"], "sub": h["sub"]} for t, h in hot},
               "substations": {n: {"load_pct_now": ag[n]["load_pct"]} for n in TREE if n.startswith("sub:")},
               "active_signals": {n: {k: s.get(k) for k in ("seq", "mode", "valid_to") if s.get(k) is not None} for n, s in state["active"].items()}}
    ctx["weather"] = weather.llm_context(sim_hour())
    body = {"model": LLM_MODEL, "temperature": 0.2, "max_tokens": 1500,
            "messages": [{"role": "system", "content": ADVISOR_SYSTEM},
                         {"role": "user", "content": f"Grid state:\n{json.dumps(ctx)}\n\nSituation: {situation}"}]}
    req = urllib.request.Request(f"{LLM_URL.rstrip('/')}/chat/completions", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json", "X-Session-Id": "gridzilla-advisor",
                                          "Authorization": f"Bearer {os.environ.get('GZ_LLM_KEY', 'none')}"})
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=120) as r:
        text = json.loads(r.read())["choices"][0]["message"]["content"]
    latency = round((time.time() - t0) * 1000)
    text = text.strip().strip("`")
    if text.startswith("json"):
        text = text[4:]
    start, end = text.find("{"), text.rfind("}")
    proposal = json.loads(text[start:end + 1])
    proposal["latency_ms"] = latency
    if proposal.get("mode") == "NONE":
        proposal["guard"] = None
        log("advisor", f"no signal needed ({latency} ms): {proposal.get('rationale', '')}")
        return proposal
    sim_dur = float(proposal.get("duration_min") or (ENV_SLOT_SIM_MIN if proposal.get("mode") == "RELEASE" else 0))
    proposal["duration_min"] = sim_dur
    mode, seg = proposal.get("mode"), proposal.get("segment")
    grid_limit = POLICY["max_stretch_window_min"] if mode == "STRETCH" else POLICY["max_window_min"]
    if seg in TREE and mode in ("ABSORB", "SUPPORT") and sim_dur > 0:
        proposal["envelope"] = compute_envelope(seg, mode, sim_dur, float(proposal.get("start_in_min") or 0))
    if focus and seg not in focus["choices"]:
        proposal["guard"] = f"segment {seg} is not one of the allowed segments {focus['choices']}"
    elif not (0 < sim_dur <= grid_limit):        # the policy window is in grid minutes, check it before converting
        proposal["guard"] = f"window must be 0..{grid_limit} grid minutes for {mode}"
    else:
        proposal["guard"] = guard(seg, mode, proposal.get("fields") or {},
                                  real_window(seg, mode, sim_dur) if seg in TREE else real_min(sim_dur), proposal.get("envelope"))
    log("advisor", f"proposed {proposal.get('mode')} -> {proposal.get('segment')} for {sim_dur:g} grid min ({latency} ms): "
        f"{proposal.get('rationale', '')}" + (f" | GUARD: {proposal['guard']}" if proposal["guard"] else " | guard ok"))
    return proposal


# ---------------------------------------------------------------- autopilot
# Deterministic triggers decide WHEN to ask DeepSeek; DeepSeek decides WHAT; the guard decides whether it is allowed.
# "auto" (default when an LLM is configured): a guard-approved decision is signed and sent at once, within the autopilot's
# own limits (cooldown per segment, max signals per grid day). "propose": it waits for one click. "off": nothing runs.
# All autopilot times are grid (sim) minutes.
AP = {"mode": os.environ.get("GZ_AUTOPILOT", "auto" if LLM_URL else "off"), "context": "", "context_seen": "",
      "last_run": None, "last_trigger": None, "last_result": None, "pending": None, "busy": False, "stage": "idle",
      "sent": collections.deque(maxlen=200), "history": collections.deque(maxlen=20), "hotspots": {}, "target": None}
AP_INTERVAL_S = POLICY.get("autopilot_interval_s", 10)
AP_TRIGGER_PCT = POLICY.get("autopilot_trigger_pct", 85)     # forecast |load| at or above this within the horizon asks for a signal
AP_RELEASE_PCT = POLICY.get("autopilot_release_pct", 60)     # every transformer under an active signal below this asks for a release
AP_HORIZON_MIN = POLICY.get("autopilot_horizon_min", 90)     # look-ahead, grid minutes
AP_COOLDOWN_MIN = POLICY.get("autopilot_cooldown_min", 30)   # grid minutes
AP_MAX_PER_DAY = POLICY.get("autopilot_max_per_day", 48)     # per grid day


def prune_expired():
    """Signals past valid_to are over on the devices (they revert on their own); drop them so the node is free again."""
    t = iso(now())
    with _lock:
        for n in [n for n, s in state["active"].items() if s["valid_to"] <= t]:
            log("signal", f"seq {state['active'][n]['seq']} {state['active'][n]['mode']} on {n} ended (window over)")
            doc = state["active"].pop(n)
            state.setdefault("recent", {})[n] = {**doc, "ended_at": doc["valid_to"], "ended": "window over"}


def covered(tf):
    return any(n in path_of(tf) for n in state["active"])


def grid_age_min(at):
    return (now() - at).total_seconds() * SIM_X / 60


def hotspots():
    """Forecast peak per street transformer over the autopilot horizon: the map the planner and the board work from."""
    steps = int(AP_HORIZON_MIN / ENV_SLOT_SIM_MIN) + 1
    out = {}
    for tf in (n for n in TREE if n.startswith("tf:")):
        rating, rev = TREE[tf]["rating_kw"], TREE[tf].get("reverse_kw", TREE[tf]["rating_kw"])
        fc = forecast(tf)[:steps]
        worst = max(fc, key=lambda p: abs(p["total_kw"]) / (rating if p["total_kw"] >= 0 else rev))
        lim = rating if worst["total_kw"] >= 0 else rev
        out[tf] = {"pct": round(100 * worst["total_kw"] / lim), "at_h": worst["h"], "kw": worst["total_kw"],
                   "excess_kw": round(max(0.0, abs(worst["total_kw"]) - AP_TRIGGER_PCT / 100 * lim), 1),
                   "feeder": TREE[tf]["parent"], "sub": TREE[TREE[tf]["parent"]]["parent"], "covered": covered(tf)}
    return out


def plan_target(hs):
    """Pick ONE target for this cycle: the node that covers the most forecast overload that no signal handles yet.
    A feeder is chosen when two or more of its transformers run hot in the same direction, a substation when two or more
    of its feeders do; otherwise the single worst transformer. Returns None when nothing is hot."""
    hot = {tf: h for tf, h in hs.items() if abs(h["pct"]) >= AP_TRIGGER_PCT and not h["covered"]}
    if not hot:
        return None
    by_dir = {}
    for tf, h in hot.items():
        by_dir.setdefault("import" if h["pct"] > 0 else "export", {})[tf] = h
    direction, group = max(by_dir.items(), key=lambda kv: sum(h["excess_kw"] for h in kv[1].values()))
    feeders, subs = {}, {}
    for tf, h in group.items():
        feeders.setdefault(h["feeder"], []).append(tf)
    for f, tfs in feeders.items():
        if len(tfs) >= 2:
            subs.setdefault(TREE[f]["parent"], []).append(f)
    cands = []
    for s, fs in subs.items():
        if len(fs) >= 2:
            cands.append((s, [t for f in fs for t in feeders[f]]))
    for f, tfs in feeders.items():
        if len(tfs) >= 2 and not any(f in subs.get(s, []) and len(subs[s]) >= 2 for s in subs):
            cands.append((f, tfs))
    for tf in group:
        if len(feeders[group[tf]["feeder"]]) < 2:
            cands.append((tf, [tf]))
    node, tfs = max(cands, key=lambda c: sum(group[t]["excess_kw"] for t in c[1]))
    worst = max(tfs, key=lambda t: abs(group[t]["pct"]))
    choices = [node] + ([] if node.startswith("tf:") else sorted(tfs, key=lambda t: -abs(group[t]["pct"]))[:4])
    return {"node": node, "dir": direction, "hot": sorted(tfs, key=lambda t: -abs(group[t]["pct"])), "worst": worst,
            "worst_pct": group[worst]["pct"], "worst_at_h": group[worst]["at_h"], "under": len(tfs_under(node)),
            "excess_kw": round(sum(group[t]["excess_kw"] for t in tfs), 1), "choices": choices,
            "others": len(hot) - len(tfs)}


def autopilot_trigger():
    """Return (situation sentence, focus) if something deserves DeepSeek's attention, else (None, None)."""
    hs = hotspots()
    AP["hotspots"] = hs
    t = plan_target(hs)
    if AP.get("force"):
        AP["force"] = False
        ag = aggregates()
        tops = sorted(((n, ag[n]["load_pct"] or 0) for n in TREE if n.startswith("tf:")), key=lambda kv: -abs(kv[1]))[:5]
        where = "; ".join(f"{n} at {p} %" for n, p in tops)
        return (f"Operator asked for a review now, grid hour {sim_hour():.1f}. Highest transformers: {where}. If nothing needs a signal, say so and propose RELEASE for nothing or the least invasive ABSORB/SUPPORT only where the forecast justifies it.", t)
    if t:
        what = "load peak, houses import" if t["dir"] == "import" else "PV surplus, reverse flow"
        return (f"{t['node']}: {len(t['hot'])} of {t['under']} transformers forecast past {AP_TRIGGER_PCT} % within {AP_HORIZON_MIN} grid "
                f"minutes ({what}); worst {t['worst']} {t['worst_pct']} % at {t['worst_at_h']:.2f}h, {t['excess_kw']:.0f} kW over.", t)
    steps = int(AP_HORIZON_MIN / ENV_SLOT_SIM_MIN) + 1
    for node, sig in state["active"].items():
        mine = next((s for s in AP["sent"] if s["seq"] == sig["seq"]), None)   # never second-guess an operator's own signal
        if not mine or grid_age_min(mine["at"]) < AP_COOLDOWN_MIN:
            continue
        if sig["mode"] in ("ABSORB", "SUPPORT") and all(
                max(abs(p["total_kw"]) for p in forecast(tf, counterfactual=True)[:steps]) < AP_RELEASE_PCT / 100 * TREE[tf]["rating_kw"]
                for tf in tfs_under(node)):      # judged on what the houses would draw without the signal, so a cap that is holding the peak is not released into it
            return (f"{sig['mode']} seq {sig['seq']} on {node} is active but every transformer under it is forecast below "
                    f"{AP_RELEASE_PCT} % for the next {AP_HORIZON_MIN} grid minutes. Release it if the event is over.",
                    {"node": node, "choices": [node], "release": True})
    if AP["context"] and AP["context"] != AP["context_seen"]:
        return "Operator note: " + AP["context"], None
    return None, None


def overlaps(a, b):
    return a in path_of(b) or b in path_of(a)


def needs_operator(p):
    """Auto mode only sends everyday congestion control on its own. Everything else waits for one click."""
    if p["mode"] not in ("ABSORB", "SUPPORT", "RELEASE"):
        return f"{p['mode']} is never sent autonomously"
    mine = {s["seq"] for s in AP["sent"]}
    for n, sig in state["active"].items():
        if overlaps(n, p["segment"]) and sig["seq"] not in mine:
            return f"operator signal seq {sig['seq']} on {n} overlaps {p['segment']}"
    return None


def autopilot_allowed(segment, mode=None):
    if mode == "RELEASE":
        return None               # releasing is always safe: cooldowns and rate limits brake new restrictions, never the end of one
    if has_real(segment):     # real devices run in real time: brakes on the wall clock too
        real = [s for s in AP["sent"] if s.get("real")]
        if len([s for s in real if (now() - s["at"]).total_seconds() < 3600]) >= REAL_MAX_PER_HOUR:
            return f"limit {REAL_MAX_PER_HOUR} signals per real hour to segments with real devices"
        if real and (now() - real[-1]["at"]).total_seconds() < REAL_COOLDOWN_MIN * 60:
            return f"real-time cooldown: a segment with real devices was signalled less than {REAL_COOLDOWN_MIN} real minutes ago"
    recent = [s for s in AP["sent"] if grid_age_min(s["at"]) < 24 * 60]
    if len(recent) >= AP_MAX_PER_DAY:
        return f"autopilot limit {AP_MAX_PER_DAY} signals per grid day reached"
    last = next((s for s in reversed(AP["sent"]) if s["segment"] == segment), None)
    if last and grid_age_min(last["at"]) < AP_COOLDOWN_MIN:
        return f"cooldown: autopilot signalled {segment} less than {AP_COOLDOWN_MIN} grid minutes ago"
    return None


def send_proposal(p, by):
    fields = {k: (p.get("fields") or {}).get(k) for k in ALL_FIELDS}
    start_sim = float(p.get("start_in_min") or 0)
    dur_real = real_window(p["segment"], p["mode"], float(p.get("duration_min") or ENV_SLOT_SIM_MIN))
    if p.get("envelope"):     # recompute at send time for the window actually sent (floor, approval delay)
        p["envelope"] = compute_envelope(p["segment"], p["mode"], dur_real * SIM_X, start_sim)
    if p.get("envelope"):     # flat fallback for devices that ignore the curve: the tightest slot
        curve = p["envelope"].get("import_max_kw") or p["envelope"].get("export_max_kw")
        key = "import_max_kw" if p["envelope"].get("import_max_kw") else "export_max_kw"
        fields[key] = min(curve) if fields.get(key) is None else min(fields[key], min(curve))
    doc = send_signal(p["segment"], p["mode"], fields, dur_real,
                      p.get("note") or "", real_min(start_sim), curve=p.get("envelope"))
    AP["sent"].append({"at": now(), "segment": p["segment"], "seq": doc["seq"], "real": has_real(p["segment"])})
    log("autopilot", f"{by}: sent seq {doc['seq']} {p['mode']} -> {p['segment']}")
    return doc


AP_HIST_FILE = HERE / "autopilot-history.json"
try:
    for _h in reversed(json.loads(AP_HIST_FILE.read_text())[:20]):
        AP["history"].appendleft(_h)
except Exception:
    pass


def record(p, verdict, detail="", seq=None):
    AP["history"].appendleft({"at": iso(now()), "sim_h": round(sim_hour(), 2), "trigger": p.get("situation"),
                              "mode": p.get("mode"), "segment": p.get("segment"), "rationale": p.get("rationale"),
                              "fields": p.get("fields"), "duration_min": p.get("duration_min"), "envelope": p.get("envelope"),
                              "latency_ms": p.get("latency_ms"), "verdict": verdict, "detail": detail, "seq": seq,
                              "target": (p.get("focus") or {}).get("node"), "hot": (p.get("focus") or {}).get("hot"),
                              "worst_pct": (p.get("focus") or {}).get("worst_pct")})
    try:
        AP_HIST_FILE.write_text(json.dumps(list(AP["history"])))
    except Exception:
        pass


def autopilot_step():
    AP["last_run"] = iso(now())
    p = AP["pending"]
    if p and grid_age_min(datetime.fromisoformat(p["at"].replace("Z", "+00:00"))) > 60:
        log("autopilot", f"proposal {p['mode']} -> {p['segment']} expired unapproved")
        AP["pending"] = None
        record(p, "expired")
    prune_expired()
    AP["stage"] = "sense"
    situation, focus = autopilot_trigger()
    AP["target"] = focus if focus and not focus.get("release") else None
    if not situation or AP["pending"]:
        AP["stage"] = "idle"
        return
    AP["last_trigger"] = situation
    if situation.startswith("Operator note"):
        AP["context_seen"] = AP["context"]
    elif AP["context"]:
        situation += " Standing operator warning: " + AP["context"]
    log("autopilot", f"trigger: {situation}")
    AP["stage"] = "deepseek"
    p = ask_llm(situation, focus)
    p["situation"], p["at"], p["focus"] = situation, iso(now()), focus
    AP["last_result"] = p
    AP["stage"] = "guard"
    if p.get("mode") == "NONE":
        record(p, "none")
        return
    if p["guard"]:
        record(p, "refused", p["guard"])
        return
    hand = needs_operator(p) if AP["mode"] == "auto" else None
    if AP["mode"] == "auto" and not hand:
        why = autopilot_allowed(p["segment"], p.get("mode"))
        if why:
            p["guard"] = why
            log("autopilot", f"held back {p['mode']} -> {p['segment']}: {why}")
            record(p, "held", why)
            return
        try:
            AP["stage"] = "send"
            doc = send_proposal(p, "auto")
            record(p, "sent", seq=doc["seq"])
        except HTTPException as e:
            p["guard"] = e.detail
            record(p, "refused", e.detail)
    else:
        AP["pending"] = p
        record(p, "pending", hand or "")
        log("autopilot", f"waiting for operator: {p['mode']} -> {p['segment']}" + (f" ({hand})" if hand else ""))


def autopilot_loop():
    while True:
        time.sleep(AP_INTERVAL_S)
        if AP["mode"] == "off" or not LLM_URL or AP["busy"]:
            continue
        AP["busy"] = True
        try:
            autopilot_step()
        except Exception as e:
            AP["last_result"] = {"error": str(e), "at": iso(now())}
            record({"situation": AP["last_trigger"]}, "error", str(e))
            log("autopilot", f"advisor call failed: {e}")
        finally:
            AP["busy"] = False
            AP["stage"] = "idle"


def autopilot_public():
    return {k: AP[k] for k in ("mode", "context", "last_run", "last_trigger", "last_result", "pending", "busy", "stage", "target", "hotspots")} | {
        "history": list(AP["history"]), "trigger_pct": AP_TRIGGER_PCT, "release_pct": AP_RELEASE_PCT,
        "horizon_min": AP_HORIZON_MIN, "cooldown_min": AP_COOLDOWN_MIN, "max_per_day": AP_MAX_PER_DAY,
        "interval_s": AP_INTERVAL_S, "sim_x": SIM_X}


# ---------------------------------------------------------------- api
app = FastAPI(title="Gridzilla")
app.mount("/static", StaticFiles(directory=str(HERE / "static")), name="static")


class Signal(BaseModel):
    segment: str
    mode: str
    import_max_kw: Optional[float] = None
    export_max_kw: Optional[float] = None
    export_min_kw: Optional[float] = None
    charge_max_kw: Optional[float] = None
    discharge_max_kw: Optional[float] = None
    target_soc: Optional[float] = None
    max_soc_by: Optional[float] = None
    duration_min: int = 60
    start_in_min: int = 0
    note: str = ""
    cohort: Optional[list] = None


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
def get_state(hh: str = "", fc: str = "", tree: int = 1):
    """hh: node whose households to include ("all" = every one; blatnica and real devices always); fc: node that gets its full
    forecast (every tf gets only its forecast peak); tree=0 skips the static tree after the first load."""
    prune_expired()
    with _lock:
        ap = autopilot_public()
        hist = ap.get("history") or []
        ap["history"] = [h if i < 4 else {k: v for k, v in h.items() if k != "envelope"} for i, h in enumerate(hist[:25])]
        allh = households()
        tot = {"households": len(allh), "online": sum(1 for h in allh.values() if h["telemetry"]), "shaped": sum(1 for h in allh.values() if h["telemetry"] and h["telemetry"].get("shape")),
               "houses": sum(h.get("represents", 1) for h in allh.values()),
               "ev_kw": round(sum(((h["telemetry"] or {}).get("ev_kw") or 0) * h.get("represents", 1) for h in allh.values()), 1),
               "hp_kw": round(sum(((h["telemetry"] or {}).get("hp_kw") or 0) * h.get("represents", 1) for h in allh.values()), 1)}
        if hh == "all":
            sel = allh
        else:
            sel = {k: h for k, h in allh.items() if h["real"] or (hh and hh in path_of(h["tf"]))}
        peaks = {}
        for n in TREE:
            if not n.startswith("tf:"): continue
            f = forecast(n); best = None
            for p in f:
                lim = TREE[n]["rating_kw"] if p["total_kw"] >= 0 else (TREE[n].get("reverse_kw") or TREE[n]["rating_kw"])
                pct = round(100 * p["total_kw"] / lim)
                if best is None or abs(pct) > abs(best["pct"]): best = {"pct": pct, "h": p["h"]}
            if best: peaks[n] = best
        out = {"now": iso(now()), "sim_hour": round(sim_hour(), 2), "seq": state["seq"], "aggregates": aggregates(), "summary": tot,
               "households": sel, "active": state["active"], "recent": state.get("recent", {}), "shape": {"at": SHAPE["at"], "rounds": SHAPE["rounds"], "enabled": SHAPE["enabled"], "feeders": len(SHAPE["seq"])}, "log": list(LOG)[:60], "hb_paused": HB_PAUSED.is_set(),
               "llm": bool(LLM_URL), "policy": POLICY, "autopilot": ap, "scenario": SCENARIO,
               "forecast_peak": peaks, "forecast": {fc: forecast(fc)} if fc in TREE and not fc.startswith("region") else {}}
        if tree: out["tree"] = TREE
        return out


@app.get("/api/devices")
def get_devices():
    """raw per-device view, for debugging; the board uses households"""
    with _lock:
        return {k: {**v, "ack": state["acks"].get(k), "telemetry": state["telemetry"].get(k), "registered": k in state["pubkeys"]} for k, v in DEVICES.items()}


def households():
    """One house = everything behind one meter. Devices with the same `household` are merged: the battery/inverter device
    owns SoC and the grid reading, the heating device owns the tank; EV and heat kW add up; the status is the weakest member."""
    out = {}
    for d in DEVICES.values():
        hid = d.get("household") or d["id"]
        h = out.setdefault(hid, {"id": hid, "tf": d["tf"], "devices": [], "real": not d["id"].startswith("sim-"),
                                 "kw": 0, "kwh": 0, "represents": d.get("represents", 1), "telemetry": None, "ack": None, "registered": True})
        h["devices"].append(d["id"]); h["kw"] += d.get("kw", 0); h["kwh"] += d.get("kwh", 0)
        h["registered"] = h["registered"] and d["id"] in state["pubkeys"]
        t = state["telemetry"].get(d["id"]); a = state["acks"].get(d["id"])
        if t:
            m = h["telemetry"] or {"soc": None, "grid_kw": 0.0, "ev_kw": 0.0, "hp_kw": 0.0, "dhw_c": None, "dhw_set_c": None, "boiler_c": None, "heat_set_c": None, "flow_c": None,
                                   "heat": None, "ev": 0, "mode": "owner", "rx": t.get("rx")}
            if d.get("kwh"):                                   # the battery device is the meter owner
                m["soc"] = t.get("soc"); m["grid_kw"] = t.get("grid_kw") or 0.0
            elif m["soc"] is None and t.get("soc") not in (None, 0):
                m["soc"] = t.get("soc")
            m["ev_kw"] += t.get("ev_kw") or 0.0
            m["hp_kw"] += t.get("hp_kw") or (t.get("grid_kw") if not d.get("kwh") else 0) or 0.0   # a heating-only device reports its draw as grid_kw
            if t.get("dhw_c") is not None: m["dhw_c"], m["dhw_set_c"] = t.get("dhw_c"), t.get("dhw_set_c")
            if t.get("heat_set_c") is not None: m["heat_set_c"], m["flow_c"] = t.get("heat_set_c"), t.get("flow_c")   # heat pump room program and flow temperature
            if t.get("boiler_c") is not None: m["boiler_c"] = t.get("boiler_c")
            kinds = [k for k in (m["heat"], t.get("heat") or ("heatpump" if d.get("heat") == "heatpump" and not d.get("kwh") else None)) if k]
            m["heat"] = "+".join(dict.fromkeys("+".join(kinds).split("+"))) if kinds else None
            m["ev"] = max(m["ev"], t.get("ev") or (d.get("ev_kw") or 0))
            if t.get("mode") and t["mode"] != "owner": m["mode"] = t["mode"]
            if t.get("shape"): m["shape"] = True
            m["rx"] = max(m["rx"] or "", t.get("rx") or "")
            h["telemetry"] = m
        if a:
            rank = {"refused": 3, "partial": 2, "reverted": 1, "applied": 0}
            if h["ack"] is None or rank.get(a.get("status"), 0) > rank.get(h["ack"].get("status"), 0) or (a.get("seq") or 0) > (h["ack"].get("seq") or 0):
                h["ack"] = {k: a.get(k) for k in ("status", "reason", "seq", "verified", "applied")}
    return out


@app.get("/api/weather")
def get_weather():
    return weather.snapshot(sim_hour())


@app.get("/api/history")
def history(nodes: str = "", devices: str = "", limit: int = 120):
    """?nodes=a,b&devices=x,y -> only those series, downsampled to at most `limit` points each"""
    def thin(seq):
        seq = list(seq); step = max(1, len(seq) // max(1, limit)); out = seq[::step]
        if seq and out[-1] is not seq[-1]: out.append(seq[-1])
        return out
    want_n = [n for n in nodes.split(",") if n]; want_d = [d for d in devices.split(",") if d]
    with _lock:
        return {"nodes": {n: thin(NODE_HIST[n]) for n in want_n if n in NODE_HIST},
                "devices": {d: thin(DEV_HIST[d]) for d in want_d if d in DEV_HIST}}

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
    return send_signal(s.segment, s.mode, fields, s.duration_min, s.note, s.start_in_min, s.cohort)


@app.get("/api/flatten")
def get_flatten(node: str = "region:at"):
    if node not in TREE:
        raise HTTPException(404, "unknown node")
    p = flatten_plan(node)
    return {"node": node, "sim_hour": round(sim_hour(), 2), "renewed_at": SHAPE["at"], "rounds": SHAPE["rounds"], "enabled": SHAPE["enabled"],
            "shape_seq": SHAPE["seq"], "plan": p}


@app.post("/api/shape/{onoff}")
def set_shape(onoff: str):
    SHAPE["enabled"] = onoff == "on"
    if SHAPE["enabled"]:
        threading.Thread(target=shape_round, daemon=True).start()
    log("shape", "diet plan " + ("on" if SHAPE["enabled"] else "off (houses keep the last plan until it expires)"))
    return {"enabled": SHAPE["enabled"]}


@app.post("/api/advise")
def advise(a: Advise):
    return ask_llm(a.situation)


class Autopilot(BaseModel):
    mode: Optional[str] = None       # off | propose | auto
    context: Optional[str] = None    # standing operator note, e.g. "heat wave tomorrow, high evening load"


@app.post("/api/autopilot")
def set_autopilot(a: Autopilot):
    if a.mode is not None:
        if a.mode not in ("off", "propose", "auto"):
            raise HTTPException(400, "mode must be off, propose or auto")
        if a.mode != "off" and not LLM_URL:
            raise HTTPException(503, "GZ_LLM_URL not set")
        AP["mode"] = a.mode
        log("autopilot", f"mode {a.mode}")
    if a.context is not None and a.context != AP["context"]:
        AP["context"] = a.context.strip()
        log("autopilot", f"operator warning: {AP['context'] or '(cleared)'}")
    return autopilot_public()


@app.post("/api/scenario/{name}")
def set_scenario(name: str):
    """demo: scale the houses not in the program (cold-evening, sunny-noon, normal, live-weather)"""
    if name not in SCENARIOS:
        raise HTTPException(400, f"scenario must be one of {sorted(SCENARIOS)}")
    SCENARIO["name"], (SCENARIO["load_x"], SCENARIO["pv_x"]) = name, SCENARIOS[name]
    log("demo", f"scenario {name}: other houses load x{SCENARIO['load_x']}, PV x{SCENARIO['pv_x']}")
    persist()
    return SCENARIO


@app.post("/api/autopilot/{decision}")
def decide_autopilot(decision: str):
    """approve|reject the proposal waiting in propose mode"""
    if decision == "review":                      # ask DeepSeek now, whatever the load (demo and operator use)
        AP["force"] = True
        log("autopilot", "operator asked for a review now")
        return {"ok": True}
    if decision not in ("approve", "reject"):
        raise HTTPException(400, "decision must be approve, reject or review")
    p = AP["pending"]
    if not p:
        raise HTTPException(404, "nothing pending")
    AP["pending"] = None
    if decision == "reject":
        log("autopilot", f"operator rejected {p['mode']} -> {p['segment']}")
        record(p, "rejected")
        return {"ok": True}
    doc = send_proposal(p, "operator approved")
    record(p, "sent", "operator approved", doc["seq"])
    return doc


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
    mq.reconnect_delay_set(min_delay=2, max_delay=30)
    mq.connect_async(host, int(port), keepalive=30)   # never block or crash on a broker outage; paho reconnects
    mq.loop_start()
    threading.Thread(target=heartbeat_loop, daemon=True).start()
    threading.Thread(target=sampler_loop, daemon=True).start()
    threading.Thread(target=autopilot_loop, daemon=True).start()
    threading.Thread(target=shape_loop, daemon=True).start()
    threading.Thread(target=weather.loop, args=(TREE,), daemon=True).start()
    import uvicorn
    log("platform", f"Gridzilla up on http://localhost:{PORT}  broker={BROKER}  llm={LLM_URL or 'off'}")
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="warning")


if __name__ == "__main__":
    main()
