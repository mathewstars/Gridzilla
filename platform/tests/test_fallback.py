"""Offline tests for the AI-offline fallback (fallback.py) and its hooks in gridzilla.py. Never touches the network
except a hanging socket on 127.0.0.1 that stands in for a dead DeepSeek. MQTT publishing and state.json writes are mocked.

Run:   cd platform && python3 -m unittest discover -s tests
"""
import json, socket, sys, threading, time, unittest
from datetime import timedelta
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import gridzilla as g  # noqa: E402
import fallback  # noqa: E402

TF = "tf:atzgersdorf-1"
FEEDER = g.TREE[TF]["parent"]


class Clock:
    def __init__(self):
        self.t = 1_000_000.0

    def __call__(self):
        return self.t


def llm_reply(content):
    """A fake urlopen() result carrying one chat completion."""
    r = mock.MagicMock()
    r.read.return_value = json.dumps({"choices": [{"message": {"content": content}}]}).encode()
    r.__enter__.return_value = r
    return r


GOOD_SUPPORT = json.dumps({"segment": TF, "mode": "SUPPORT", "fields": {"import_max_kw": 3}, "duration_min": 60,
                           "start_in_min": 0, "note": "peak", "rationale": "DeepSeek says so"})


class Base(unittest.TestCase):
    def setUp(self):
        self.clock = Clock()
        self.patches = [mock.patch.object(g, "persist"), mock.patch.object(g.mq, "publish"), mock.patch.object(g, "log"),
                        mock.patch.object(g, "LLM_URL", "http://llm.invalid/v1"),
                        mock.patch.object(fallback, "BRAIN", None),
                        mock.patch.dict(g.SCENARIO, {"name": "normal", "load_x": 1.0, "pv_x": 1.0})]
        for p in self.patches:
            p.start()
        self.publish = g.mq.publish
        self.reset()

    def reset(self):
        fallback.BRAIN = fallback.Brain(clock=self.clock)
        self.publish.reset_mock()
        for k in ("active", "acks", "telemetry", "support_count"):
            g.state[k].clear()
        g.AP.update(mode="auto", context="", context_seen="", pending=None, last_trigger=None, last_result=None, target=None, hotspots={})
        g.AP["sent"].clear()
        g.AP["history"].clear()
        for d in g.NODE_HIST.values():
            d.clear()
        self.grid(hour=13.0, program_kw=0.0)

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        for d in g.NODE_HIST.values():
            d.clear()

    def grid(self, hour, program_kw, tf=TF):
        """Simulated houses behind tf online at `hour` grid time, their current net power `program_kw`."""
        for d in g.devices_under(tf):
            if d["id"].startswith("sim-"):
                g.state["telemetry"][d["id"]] = {"soc": 60, "grid_kw": 0, "sim_hour": hour}
        g.NODE_HIST[tf].append({"program_kw": program_kw, "total_kw": program_kw, "other_kw": 0})

    def focus(self):
        situation, focus = g.autopilot_trigger()
        self.assertIsNotNone(situation)
        return focus

    def urlopen(self, **kw):
        return mock.patch("urllib.request.urlopen", **kw)


class Planner(Base):
    def test_single_hot_transformer_is_the_target(self):
        self.grid(13.0, 260.0)
        f = self.focus()
        self.assertEqual((f["node"], f["dir"], f["choices"]), (TF, "import", [TF]))
        self.grid(13.0, -220.0)
        self.assertEqual(self.focus()["dir"], "export")
        self.grid(13.0, 0.0)
        self.assertEqual(g.autopilot_trigger(), (None, None))


class Rules(Base):
    def test_support_on_import_congestion_passes_the_real_guard(self):
        self.grid(13.0, 260.0)
        p = fallback.rules_proposal(g, self.focus(), "test")
        self.assertEqual((p["mode"], p["segment"], p["source"]), ("SUPPORT", TF, "rules"))
        self.assertTrue(p["rationale"].startswith("AI offline: "))
        self.assertIsNone(p["guard"])
        curve = p["envelope"]["import_max_kw"]
        self.assertEqual(p["fields"], {"import_max_kw": max(g.POLICY["max_import_cap_floor_kw"], min(curve))})
        self.assertGreaterEqual(p["fields"]["import_max_kw"], g.POLICY["max_import_cap_floor_kw"])
        self.assertEqual(p["duration_min"], g.POLICY["max_window_min"])     # flat forecast never falls back: capped
        self.assertEqual(p["start_in_min"], 0)

    def test_absorb_on_reverse_flow(self):
        self.grid(13.0, -220.0)
        p = fallback.rules_proposal(g, self.focus(), "test")
        self.assertEqual((p["mode"], p["segment"]), ("ABSORB", TF))
        self.assertIsNone(p["guard"])
        self.assertEqual(p["fields"], {"export_max_kw": min(p["envelope"]["export_max_kw"])})

    def test_feeder_target_gets_per_transformer_envelopes(self):
        others = [t for t in g.tfs_under(FEEDER) if t != TF]
        self.grid(13.0, 260.0)
        hot2 = others[0]
        self.grid(13.0, 1.1 * g.TREE[hot2]["rating_kw"], tf=hot2)
        f = self.focus()
        self.assertEqual(f["node"], FEEDER)
        p = fallback.rules_proposal(g, f, "test")
        self.assertEqual((p["mode"], p["segment"], p["guard"]), ("SUPPORT", FEEDER, None))
        self.assertIn(TF, p["envelope"]["by_tf"])
        self.assertEqual(p["fields"]["import_max_kw"], max(2, min(p["envelope"]["import_max_kw"])))
        self.assertIn(p["segment"], f["choices"])

    def test_duration_until_forecast_back_under_release(self):
        hot, cold = 0.95 * 250, 0.5 * 250
        fc = [{"h": 13 + k / 4, "total_kw": hot if 2 <= k <= 6 else cold, "other_kw": 0} for k in range(17)]
        with mock.patch.object(g, "forecast", lambda *a, **k: fc):
            self.assertEqual(fallback.duration_sim_min(g, TF, "import"), 7 * 15)
            self.assertEqual(fallback.duration_sim_min(g, TF, "export"), g.ENV_SLOT_SIM_MIN)

    def test_release_and_warning(self):
        f = {"node": TF, "choices": [TF], "release": True}
        self.assertEqual(fallback.rules_proposal(g, f, "test")["mode"], "NONE")     # the signal already ended
        g.state["active"][TF] = {"seq": 7, "mode": "SUPPORT", "valid_to": g.iso(g.now() + timedelta(minutes=30))}
        p = fallback.rules_proposal(g, f, "test")
        self.assertEqual((p["mode"], p["segment"], p["guard"]), ("RELEASE", TF, None))
        p = fallback.rules_proposal(g, None, "test")
        self.assertEqual(p["mode"], "NONE")
        self.assertTrue(p["needs_operator"])

    def test_never_invents_segments(self):
        self.grid(13.0, 260.0)
        for f in ({"node": "tf:nowhere", "choices": ["tf:nowhere"], "dir": "import"},
                  {"node": TF, "choices": [FEEDER], "dir": "import"}, {"node": TF, "dir": "import"}):
            self.assertEqual(fallback.rules_proposal(g, f, "test")["mode"], "NONE", f)

    def test_rules_proposal_vets_exactly_like_deepseek(self):
        """The same proposal coming from DeepSeek gets the same envelope and guard verdict: rules can't send more."""
        self.grid(13.0, 260.0)
        focus = self.focus()
        rules = fallback.rules_proposal(g, focus, "test")
        as_ai = {k: rules[k] for k in ("segment", "mode", "fields", "duration_min", "start_in_min", "note", "rationale")}
        with self.urlopen(return_value=llm_reply(json.dumps(as_ai))):
            ai = g.ask_llm("x", focus)
        for k in ("segment", "mode", "fields", "duration_min", "envelope", "guard"):
            self.assertEqual(ai[k], rules[k], k)


class Wiring(Base):
    def hot(self):
        self.grid(13.0, 260.0)

    def test_healthy_ai_decides(self):
        self.hot()
        with self.urlopen(return_value=llm_reply(GOOD_SUPPORT)):
            g.autopilot_step()
        h = g.AP["history"][0]
        self.assertEqual((h["source"], h["verdict"], h["mode"]), ("ai", "sent", "SUPPORT"))
        self.assertEqual(g.autopilot_public()["brain"], "ai")

    def test_timeout_falls_back_to_rules_and_sends(self):
        self.hot()
        with self.urlopen(side_effect=TimeoutError("timed out")):
            g.autopilot_step()
        h = g.AP["history"][0]
        self.assertEqual((h["source"], h["verdict"], h["mode"], h["segment"]), ("rules", "sent", "SUPPORT", TF))
        self.publish.assert_called_once()
        self.assertEqual(g.state["active"][TF]["mode"], "SUPPORT")
        pub = g.autopilot_public()
        self.assertEqual(pub["brain"], "rules")
        self.assertEqual((pub["ai"]["ok"], pub["ai"]["failures"]), (False, 1))
        self.assertIn("TimeoutError", pub["ai"]["last_error"])

    def test_garbage_falls_back(self):
        for content in ("I am a teapot", '{"mode": "YOLO"}', '{"mode": "SUPPORT", "segment": "tf:atlantis"}', "[1, 2]"):
            with self.subTest(content=content):
                self.reset()
                self.hot()
                with self.urlopen(return_value=llm_reply(content)):
                    g.autopilot_step()
                self.assertEqual((g.AP["history"][0]["source"], g.AP["history"][0]["verdict"]), ("rules", "sent"))

    def test_ai_none_is_respected(self):
        self.hot()
        with self.urlopen(return_value=llm_reply('{"mode": "NONE", "rationale": "fine"}')):
            g.autopilot_step()
        self.assertEqual((g.AP["history"][0]["source"], g.AP["history"][0]["verdict"]), ("ai", "none"))
        self.publish.assert_not_called()

    def test_hanging_llm_is_cut_at_the_timeout(self):
        srv = socket.socket()
        srv.bind(("127.0.0.1", 0))
        srv.listen(1)
        conns = []
        threading.Thread(target=lambda: conns.append(srv.accept()), daemon=True).start()
        self.hot()
        try:
            with mock.patch.object(g, "LLM_URL", f"http://127.0.0.1:{srv.getsockname()[1]}/v1"), \
                    mock.patch.object(fallback, "TIMEOUT_S", 0.5):
                t0 = time.time()
                g.autopilot_step()
                self.assertLess(time.time() - t0, 5)
        finally:
            srv.close()
            for c, _ in conns:
                c.close()
        self.assertEqual((g.AP["history"][0]["source"], g.AP["history"][0]["verdict"]), ("rules", "sent"))

    def test_slow_drip_llm_is_cut_at_the_total_deadline(self):
        """urllib's timeout is per socket read: a server dripping one byte at a time must still lose after TIMEOUT_S."""
        srv = socket.socket()
        srv.bind(("127.0.0.1", 0))
        srv.listen(1)
        stop = threading.Event()

        def drip():
            c, _ = srv.accept()
            c.recv(65536)
            c.sendall(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 100000\r\n\r\n")
            while not stop.wait(0.1):
                try:
                    c.sendall(b" ")
                except OSError:
                    break
            c.close()
        threading.Thread(target=drip, daemon=True).start()
        self.hot()
        try:
            with mock.patch.object(g, "LLM_URL", f"http://127.0.0.1:{srv.getsockname()[1]}/v1"), \
                    mock.patch.object(fallback, "TIMEOUT_S", 0.5):
                t0 = time.time()
                g.autopilot_step()
                self.assertLess(time.time() - t0, 4)
        finally:
            stop.set()
            srv.close()
        self.assertEqual((g.AP["history"][0]["source"], g.AP["history"][0]["verdict"]), ("rules", "sent"))
        self.assertIn("TimeoutError", fallback.BRAIN.last_error)

    def test_outage_switch_during_a_call_is_not_a_real_failure(self):
        self.hot()

        def answer_after_down(*a, **k):
            g.demo_ai("down")
            return llm_reply(GOOD_SUPPORT)
        with self.urlopen(side_effect=answer_after_down):
            g.autopilot_step()
        self.assertEqual(g.AP["history"][0]["source"], "rules")
        self.assertEqual((fallback.BRAIN.failures, fallback.BRAIN.last_error), (0, None))
        g.demo_ai("up")
        self.assertTrue(g.autopilot_public()["ai"]["ok"])

    def test_demo_up_does_not_hide_a_real_outage(self):
        self.hot()
        with self.urlopen(side_effect=ConnectionRefusedError("dead")):
            g.autopilot_step()
            g.state["active"].clear()
            g.AP["sent"].clear()
            g.autopilot_step()
        g.demo_ai("down")
        g.demo_ai("up")
        ai = g.autopilot_public()["ai"]
        self.assertEqual((ai["ok"], ai["failures"], ai["breaker_open_until"]), (False, 2, None))   # probe on the next decision
        self.assertIn("ConnectionRefusedError", ai["last_error"])

    def test_loose_none_is_a_decision_not_garbage(self):
        self.hot()
        with self.urlopen(return_value=llm_reply('{"mode": "none", "rationale": "meter glitch"}')):
            g.autopilot_step()
        self.assertEqual((g.AP["history"][0]["source"], g.AP["history"][0]["verdict"]), ("ai", "none"))
        self.assertEqual(fallback.BRAIN.failures, 0)
        self.publish.assert_not_called()

    def test_simulated_outage_makes_no_call_and_up_returns_to_ai(self):
        self.hot()
        g.demo_ai("down")
        with self.urlopen(side_effect=AssertionError("no LLM call while the AI is down")) as u:
            g.autopilot_step()
            u.assert_not_called()
        self.assertEqual(g.AP["history"][0]["source"], "rules")
        self.assertTrue(g.autopilot_public()["ai"]["simulated_down"])
        g.demo_ai("up")
        self.grid(13.0, -220.0)       # a new event on a free transformer
        g.state["active"].clear()
        g.AP["sent"].clear()
        with self.urlopen(return_value=llm_reply('{"mode": "NONE", "rationale": "fine"}')) as u:
            g.autopilot_step()
            u.assert_called_once()
        self.assertEqual(g.AP["history"][0]["source"], "ai")
        self.assertEqual(g.autopilot_public()["brain"], "ai")

    def test_breaker_opens_after_two_failures_and_closes_on_success(self):
        b = fallback.BRAIN
        self.hot()
        with self.urlopen(side_effect=ConnectionRefusedError("down")) as u:
            g.autopilot_step()
            g.state["active"].clear()
            g.AP["sent"].clear()
            g.autopilot_step()
            self.assertEqual(u.call_count, 2)
            self.assertIsNotNone(b.open_until)
            self.assertIsNotNone(g.autopilot_public()["ai"]["breaker_open_until"])
            g.state["active"].clear()
            g.AP["sent"].clear()
            self.clock.t += fallback.BREAKER_S - 1
            g.autopilot_step()                       # still open: straight to rules, no call
            self.assertEqual(u.call_count, 2)
            self.assertEqual(g.AP["history"][0]["source"], "rules")
            self.clock.t += 2
            g.state["active"].clear()
            g.AP["sent"].clear()
            g.autopilot_step()                       # probe fails: open again
            self.assertEqual(u.call_count, 3)
            self.assertEqual(b.open_until, self.clock.t + fallback.BREAKER_S)
        self.clock.t += fallback.BREAKER_S + 1
        g.state["active"].clear()
        g.AP["sent"].clear()
        with self.urlopen(return_value=llm_reply('{"mode": "NONE", "rationale": "fine"}')):
            g.autopilot_step()                       # probe succeeds: closed
        self.assertEqual((b.failures, b.open_until, g.autopilot_public()["ai"]["ok"]), (0, None, True))
        self.assertEqual(g.AP["history"][0]["source"], "ai")

    def test_rules_respect_cooldown(self):
        self.hot()
        g.AP["sent"].append({"at": g.now(), "segment": TF, "seq": 99, "real": False})
        g.demo_ai("down")
        g.autopilot_step()
        h = g.AP["history"][0]
        self.assertEqual((h["source"], h["verdict"]), ("rules", "held"))
        self.assertIn("cooldown", h["detail"])
        self.publish.assert_not_called()

    def test_rules_respect_the_daily_support_limit(self):
        self.hot()
        g.state["support_count"][f"{TF}:{g.sim_day()}"] = g.POLICY["max_support_per_node_per_day"]
        g.demo_ai("down")
        g.autopilot_step()
        self.assertEqual((g.AP["history"][0]["verdict"], g.AP["history"][0]["source"]), ("refused", "rules"))
        self.publish.assert_not_called()

    def test_rules_respect_needs_operator(self):
        """An autopilot SUPPORT on the feeder is over, but an operator's own signal sits under it: wait for a click."""
        feeder = FEEDER
        old = g.now() - timedelta(minutes=2 * g.AP_COOLDOWN_MIN / g.SIM_X * 60)
        t = g.iso(g.now() + timedelta(minutes=30))
        g.state["active"][feeder] = {"seq": 1, "mode": "SUPPORT", "valid_to": t}
        g.state["active"][TF] = {"seq": 2, "mode": "SUPPORT", "valid_to": t}
        g.AP["sent"].append({"at": old, "segment": feeder, "seq": 1, "real": False})
        g.demo_ai("down")
        g.autopilot_step()
        h = g.AP["history"][0]
        self.assertEqual((h["source"], h["mode"], h["segment"], h["verdict"]), ("rules", "RELEASE", feeder, "pending"))
        self.assertIn("operator signal seq 2", h["detail"])
        self.publish.assert_not_called()
        self.assertIn(TF, g.state["active"])

    def test_rules_release_their_own_signal(self):
        old = g.now() - timedelta(minutes=2 * g.AP_COOLDOWN_MIN / g.SIM_X * 60)
        g.state["active"][TF] = {"seq": 5, "mode": "SUPPORT", "valid_to": g.iso(g.now() + timedelta(minutes=30))}
        g.AP["sent"].append({"at": old, "segment": TF, "seq": 5, "real": False})
        g.demo_ai("down")
        g.autopilot_step()
        h = g.AP["history"][0]
        self.assertEqual((h["source"], h["mode"], h["verdict"]), ("rules", "RELEASE", "sent"))
        self.assertNotIn(TF, g.state["active"])

    def test_propose_mode_waits_for_a_click(self):
        self.hot()
        g.AP["mode"] = "propose"
        g.demo_ai("down")
        g.autopilot_step()
        self.assertEqual((g.AP["history"][0]["verdict"], g.AP["pending"]["source"]), ("pending", "rules"))
        self.publish.assert_not_called()

    def test_ai_off_list_segment_is_a_refusal_not_an_outage(self):
        self.hot()
        off = GOOD_SUPPORT.replace(TF, FEEDER)
        with self.urlopen(return_value=llm_reply(off)):
            g.autopilot_step()
        h = g.AP["history"][0]
        self.assertEqual((h["source"], h["verdict"]), ("ai", "refused"))
        self.assertIn("allowed segments", h["detail"])
        self.publish.assert_not_called()

    def test_warning_needs_operator(self):
        g.AP["context"] = "storm warning tonight"
        g.demo_ai("down")
        g.autopilot_step()
        h = g.AP["history"][0]
        self.assertEqual((h["source"], h["verdict"], h["detail"]), ("rules", "none", "rules: needs operator"))
        self.publish.assert_not_called()


class RulesOnly(Base):
    def test_modes_allowed_without_llm_url(self):
        with mock.patch.object(g, "LLM_URL", None):
            self.assertEqual(g.set_autopilot(g.Autopilot(mode="auto"))["mode"], "auto")
            pub = g.autopilot_public()
            self.assertEqual((pub["brain"], pub["ai"]["ok"]), ("rules", False))
            self.grid(13.0, 260.0)
            with self.urlopen(side_effect=AssertionError("no LLM configured")):
                g.autopilot_step()
        self.assertEqual((g.AP["history"][0]["source"], g.AP["history"][0]["verdict"]), ("rules", "sent"))


if __name__ == "__main__":
    unittest.main()
