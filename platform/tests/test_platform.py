"""Offline tests for gridzilla.py: heartbeat counter, state file, staggered cohorts, the applied count and the operator key.
Never touches the network or a broker: the platform is imported from a copy in a temp folder (so its keys, state.json and
history stay there) and MQTT publishes are captured instead of sent.

Run:   cd platform && python3 -m unittest discover -s tests      (needs the platform's requirements, see run.sh)
"""
import asyncio, importlib.util, json, shutil, sys, tempfile, time, unittest
from pathlib import Path

PLATFORM = Path(__file__).resolve().parents[1]
try:
    import fastapi, paho.mqtt, yaml, cryptography  # noqa: F401
    DEPS = True
except ImportError:
    DEPS = False

TF, FEEDER = "tf:siebenhirten-3", "feeder:liesing-3"


def load(folder, name):
    """Import gridzilla.py from folder as a fresh module, the way a platform (re)start does."""
    sys.path.insert(0, str(folder))
    try:
        spec = importlib.util.spec_from_file_location(name, folder / "gridzilla.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
    finally:
        sys.path.remove(str(folder))
    mod.sent = []
    mod.mq.publish = lambda topic, payload, qos=0: mod.sent.append((topic, json.loads(json.loads(payload)["payload"])))
    return mod


@unittest.skipUnless(DEPS, "platform requirements not installed")
class PlatformTest(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        for f in ("gridzilla.py", "flatten.py", "weather.py", "registry.yaml"):
            shutil.copy(PLATFORM / f, self.dir / f)
        (self.dir / "static").mkdir()
        self.t0 = int(time.time())
        self.gz = load(self.dir, "gz_test")

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_heartbeat_seq_starts_above_any_earlier_run(self):
        # devices refuse a heartbeat seq at or below the last one they saw; an earlier run sent far fewer than one per second
        self.assertGreaterEqual(self.gz.state["hb_seq"], self.t0)

    def test_state_file_is_atomic_with_a_backup(self):
        gz = self.gz
        gz.send_signal(TF, "SUPPORT", {"import_max_kw": 3}, 5)
        seq = gz.state["seq"]
        self.assertEqual(json.loads((self.dir / "state.json").read_text())["seq"], seq)
        self.assertEqual(json.loads((self.dir / "state.json.bak").read_text())["seq"], seq)
        self.assertFalse((self.dir / "state.json.tmp").exists())
        (self.dir / "state.json").write_text('{"seq": 4')            # torn write from an old crash
        self.assertEqual(load(self.dir, "gz_test_restart").state["seq"], seq)

    def test_deleting_state_json_resets_even_with_a_backup(self):
        self.gz.send_signal(TF, "SUPPORT", {"import_max_kw": 3}, 5)
        (self.dir / "state.json").unlink()                              # the README reset step
        self.assertTrue((self.dir / "state.json.bak").exists())
        self.assertEqual(load(self.dir, "gz_test_reset").state["seq"], 0)

    def test_stagger_cohorts_count_as_the_autopilots_own(self):
        gz = self.gz
        doc = gz.send_proposal({"segment": TF, "mode": "ABSORB", "fields": {"max_soc_by": 40}, "duration_min": 16 * gz.SIM_X}, "test")
        sigs = [d for t, d in gz.sent if t.startswith("gridzilla/sig/")]
        self.assertEqual(len(sigs), gz.STAGGER_N)
        self.assertEqual(doc["seq"], sigs[0]["seq"])                   # the dashboard still gets the first cohort back
        self.assertEqual(gz.state["active"][TF]["seq"], sigs[-1]["seq"])
        self.assertEqual(set(gz.AP["sent"][-1]["seqs"]), {d["seq"] for d in sigs})
        self.assertIsNone(gz.needs_operator({"mode": "ABSORB", "segment": TF}))

    def test_stagger_cohorts_get_their_own_slice_of_the_envelope(self):
        gz = self.gz
        curve = {"slot_s": 60, "slot_sim_min": 15, "start_sim_h": 12.0, "import_max_kw": None,
                 "export_max_kw": [5.0, 1.0, 4.0, 3.0, 4.5, 4.0, 3.5, 4.2, 4.4, 4.6, 4.8, 5.0, 5.0, 5.0, 5.0, 5.0],
                 "by_tf": {TF: [float(i) for i in range(16)]}}
        gz.send_signal(TF, "ABSORB", {"max_soc_by": 40}, 16, curve=curve)
        sigs = [d for t, d in gz.sent if t.startswith("gridzilla/sig/")]
        for d in sigs:
            off = round((gz.datetime.fromisoformat(d["valid_from"][:-1]) - gz.datetime.fromisoformat(sigs[0]["valid_from"][:-1])).total_seconds() / 60)
            self.assertEqual(d["envelope"]["export_max_kw"], curve["export_max_kw"][off:])
            self.assertEqual(d["envelope"]["by_tf"][TF], curve["by_tf"][TF][off:])
            self.assertEqual(d["export_max_kw"], min(curve["export_max_kw"][off:]))   # flat fallback = tightest slot it carries
        self.assertEqual([d["export_max_kw"] for d in sigs], [1.0, 3.5, 4.4, 5.0])
        self.assertEqual(gz.cohort_curve(curve, 30)["export_max_kw"], [5.0])         # never an empty curve
        self.assertEqual(gz.state["active"][TF]["seq"], sigs[-1]["seq"])
        self.assertEqual(gz.state["active"][TF]["envelope"], curve)                  # the board still draws the whole plan
        self.assertEqual(gz.state["recent"][TF]["envelope"]["start_sim_h"], curve["start_sim_h"])
        self.assertEqual(sigs[-1]["envelope"]["export_max_kw"], curve["export_max_kw"][12:])

    def test_applied_counts_only_acks_of_the_running_event(self):
        gz = self.gz
        devs = [d["id"] for d in gz.devices_under(TF)]
        gz.SHAPE["seq"][FEEDER] = 900
        for d in gz.DEVICES:                                          # every house acks the daily plan
            gz.on_message(None, None, type("M", (), {"topic": f"gridzilla/ack/{d}", "payload": json.dumps({"payload": json.dumps(
                {"device": d, "seq": 900, "status": "applied"})}).encode()})())
        self.assertEqual(gz.aggregates()["region:at"]["applied"], 0)
        self.assertEqual(gz.state["acks"], {})
        doc = gz.send_signal(TF, "SUPPORT", {"import_max_kw": 3}, 5)
        for d in devs:
            gz.on_message(None, None, type("M", (), {"topic": f"gridzilla/ack/{d}", "payload": json.dumps({"payload": json.dumps(
                {"device": d, "seq": doc["seq"], "status": "applied"})}).encode()})())
        ag = gz.aggregates()
        self.assertEqual((ag["region:at"]["applied"], ag[TF]["applied"]), (len(devs), len(devs)))
        self.assertEqual(gz.households()[devs[0]]["ack"]["seq"], doc["seq"])

    def gate(self, method, path, headers=()):
        """Run one request through the operator gate; 200 means it reached the endpoint."""
        from starlette.requests import Request
        from starlette.responses import Response
        req = Request({"type": "http", "method": method, "path": path, "query_string": b"", "scheme": "http",
                       "headers": [(k.lower().encode(), v.encode()) for k, v in headers]})
        async def endpoint(_):
            return Response("ok")
        return asyncio.run(self.gz.operator_gate(req, endpoint)).status_code

    def test_operator_key_off_by_default(self):
        self.assertEqual(self.gz.OPERATOR_KEY, "")
        self.assertEqual(self.gate("POST", "/api/signal"), 200)
        self.assertEqual(self.gate("POST", "/api/heartbeat/pause"), 200)

    def test_operator_key_guards_every_post(self):
        from starlette.requests import Request
        gz = self.gz
        gz.OPERATOR_KEY = "s3cret"
        for path in ("/api/signal", "/api/autopilot", "/api/autopilot/approve", "/api/scenario/normal", "/api/heartbeat/pause",
                     "/api/replay/3", "/api/shape/off", "/api/advise"):
            self.assertEqual(self.gate("POST", path), 401, path)
        self.assertEqual(self.gate("POST", "/api/signal", [("X-GZ-Key", "wrong")]), 401)
        self.assertEqual(self.gate("POST", "/api/signal", [("X-GZ-Key", "s3cret")]), 200)
        self.assertEqual(self.gate("POST", "/api/register"), 200)       # devices have no key
        self.assertEqual(self.gate("GET", "/api/state"), 200)           # the board stays readable for anyone
        login = lambda key, hdr=(): gz.login(Request({"type": "http", "method": "GET", "path": "/login", "query_string": b"", "scheme": "http",
                                                      "headers": [(k.encode(), v.encode()) for k, v in hdr]}), key)
        self.assertEqual(login("wrong").status_code, 401)
        r = login("s3cret", [("x-forwarded-proto", "https")])
        cookie = r.headers["set-cookie"]
        self.assertEqual((r.status_code, r.headers["location"]), (303, "/"))
        for flag in ("HttpOnly", "SameSite=strict", "Secure"):
            self.assertIn(flag.lower(), cookie.lower())
        self.assertNotIn("secure", login("s3cret").headers["set-cookie"].lower())   # plain http: no Secure flag
        self.assertEqual(self.gate("POST", "/api/signal", [("Cookie", cookie.split(";")[0])]), 200)
        self.assertIn("gz_key=", gz.logout().headers["set-cookie"])


if __name__ == "__main__":
    unittest.main()
