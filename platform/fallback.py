"""AI-offline fallback for the Gridzilla autopilot: "If the AI dies, the grid doesn't notice."

When DeepSeek is down, slow or answers garbage, a few fixed safety rules keep steering. They only fill in WHAT to send
for the target the autopilot's planner already chose (plan_target / autopilot_trigger's `focus`); the proposal then
goes down the exact same path as DeepSeek's: vet_proposal (envelope, allowed segments, guard), needs_operator,
autopilot_allowed (brakes, cooldowns), send_proposal, record.

  import congestion under the target   -> SUPPORT on the target, flat import cap = tightest slot of its envelope
  reverse flow (PV backflow)           -> ABSORB on the target, flat export cap = tightest slot of its envelope
  autopilot signal no longer needed    -> RELEASE of that signal's node
  anything else (operator note,        -> no action, "rules: needs operator" in the history
  PREPARE / STRETCH / RECOVER)

A circuit breaker stops hammering a dead endpoint: after BREAKER_AFTER failures in a row the LLM is skipped for
BREAKER_S real seconds, then probed again; one good answer closes it. The rules never invent a segment: they only
act on the planner's target, which is always the first of its allowed segments.

gridzilla.py runs as __main__, so this module never imports it: every function takes the gridzilla module as `g`.
"""
import os, time
from datetime import datetime, timezone

TIMEOUT_S = float(os.environ.get("GZ_LLM_TIMEOUT_S", "15"))    # real seconds; at GZ_SIM_X=60 that is 15 grid minutes
BREAKER_AFTER = 2                                              # consecutive AI failures that open the breaker
BREAKER_S = 60                                                 # real seconds the breaker stays open before a probe


class Brain:
    """Health of the AI advisor and who decided last."""

    def __init__(self, clock=time.time):
        self.clock = clock
        self.simulated_down = False
        self.failures = 0
        self.open_until = None          # epoch seconds, None = breaker closed
        self.ok = True
        self.last_error = None
        self.last = None                # "ai" | "rules": who produced the last decision

    def available(self, llm_url):
        """(True, None) if the LLM may be called now, else (False, why)."""
        if not llm_url:
            return False, "GZ_LLM_URL not set, rules only"
        if self.simulated_down:
            return False, "AI outage simulated (demo)"
        if self.open_until is not None and self.clock() < self.open_until:
            return False, f"circuit breaker open after {self.failures} failures"
        return True, None

    def success(self):
        self.failures, self.open_until, self.ok, self.last_error = 0, None, True, None

    def failure(self, err):
        self.failures += 1
        self.ok, self.last_error = False, err
        if self.failures >= BREAKER_AFTER:
            self.open_until = self.clock() + BREAKER_S

    def simulate(self, down):
        self.simulated_down = down
        if down:
            self.ok, self.last_error = False, "AI outage simulated (demo)"
        else:                            # operator says the AI is back: probe it on the next decision
            self.open_until = None
            if self.last_error == "AI outage simulated (demo)":
                self.ok, self.last_error = True, None

    def public(self, llm_url):
        until = self.open_until if self.open_until is not None and self.clock() < self.open_until else None
        return {"ok": bool(llm_url) and self.ok and not self.simulated_down and until is None,
                "simulated_down": self.simulated_down, "failures": self.failures,
                "breaker_open_until": datetime.fromtimestamp(until, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if until else None,
                "last_error": self.last_error if llm_url else "GZ_LLM_URL not set, rules only", "timeout_s": TIMEOUT_S}


BRAIN = Brain()


def brain(llm_url):
    """Who decided last ("ai" | "rules"); before the first decision, who would decide."""
    return BRAIN.last or ("ai" if llm_url else "rules")


def err_text(e):
    return f"{type(e).__name__}: {getattr(e, 'detail', None) or e}"[:200]


def check_answer(g, p):
    """DeepSeek answered, but is it usable? Anything that is not a known mode on a known segment counts as garbage."""
    if not isinstance(p, dict):
        raise ValueError("answer is not a JSON object")
    mode = p.get("mode")
    if mode == "NONE":
        return
    if mode not in g.MODE_FIELDS:
        raise ValueError(f"garbage answer: unknown mode {mode!r}")
    if p.get("segment") not in g.TREE:
        raise ValueError(f"garbage answer: unknown segment {p.get('segment')!r}")
    if not isinstance(p.get("fields") or {}, dict):
        raise ValueError("garbage answer: fields is not an object")


def decide(g, situation, focus):
    """One decision for the trigger: DeepSeek if it is healthy, else the rules. Returns a proposal in ask_llm's shape
    with "source" set. Never sends anything itself; autopilot_step runs it through the normal path."""
    ok, why = BRAIN.available(g.LLM_URL)
    if ok:
        g.AP["stage"] = "deepseek"
        try:
            p = g.ask_llm(situation, focus)
            check_answer(g, p)
            if BRAIN.simulated_down:      # the outage switch was thrown while the call was in flight
                raise RuntimeError("AI outage simulated (demo) during the call")
            BRAIN.success()
            p["source"] = BRAIN.last = "ai"
            return p
        except Exception as e:
            BRAIN.failure(err_text(e))
            why = BRAIN.last_error
            g.log("autopilot", f"AI failed ({why})" + (f", breaker open for {BREAKER_S} s" if BRAIN.open_until else "")
                  + ", safety rules take over")
    g.AP["stage"] = "rules"
    p = rules_proposal(g, focus, why or "AI unavailable")
    p["source"] = BRAIN.last = "rules"
    return p


# ---------------------------------------------------------------- the rules
def needs_op(why):
    return {"mode": "NONE", "segment": None, "fields": None, "rationale": f"AI offline: {why}. Rules: needs operator.",
            "needs_operator": True, "guard": None, "latency_ms": 0}


def duration_sim_min(g, tf, direction):
    """Grid minutes from now until tf's forecast is back under the release threshold after its worst slot inside the
    trigger horizon, at least one envelope slot and at most the policy window."""
    rating = g.TREE[tf]["rating_kw"]
    limit = g.TREE[tf].get("reverse_kw", rating) if direction == "export" else rating
    step, cap = g.ENV_SLOT_SIM_MIN, g.POLICY["max_window_min"]
    fc = g.forecast(tf, hours=cap / 60, step_min=step)
    load = [-p["total_kw"] if direction == "export" else p["total_kw"] for p in fc]
    steps = int(g.AP_HORIZON_MIN / step) + 1
    k0 = max(range(min(steps, len(load))), key=lambda k: load[k])     # recomputed: the grid clock moved while the AI timed out
    for k in range(k0 + 1, len(load)):
        if load[k] < g.AP_RELEASE_PCT / 100 * limit:
            return float(max(step, min(cap, k * step)))
    return float(cap)


def rules_proposal(g, focus, why="AI unavailable"):
    """Deterministic proposal for the planner's focus. Same shape as ask_llm's answer, already vetted by
    g.vet_proposal with the same focus (envelope, allowed segments, guard)."""
    node = (focus or {}).get("node")
    if not focus or node not in g.TREE or node not in (focus.get("choices") or []):
        return needs_op(f"{why}; this trigger needs a human (no automatic PREPARE / STRETCH / RECOVER)")
    if focus.get("release"):
        sig = g.state["active"].get(node) or {}
        p = {"segment": node, "mode": "RELEASE", "fields": {}, "duration_min": float(g.ENV_SLOT_SIM_MIN), "start_in_min": 0,
             "note": "The grid event is over, thank you.",
             "rationale": f"AI offline: {why}. Safety rule: every transformer under {node} is forecast below "
                          f"{g.AP_RELEASE_PCT} %, so release {sig.get('mode', 'the signal')} seq {sig.get('seq')}."}
    else:
        if not any(g.program_houses(t) for t in g.tfs_under(node)):
            return needs_op(f"{why}; no program houses online under {node}")
        direction = "export" if focus.get("dir") == "export" else "import"
        mode = "SUPPORT" if direction == "import" else "ABSORB"
        hot = [t for t in focus.get("hot") or [] if t in g.TREE and node in g.path_of(t)] or g.tfs_under(node)
        dur = max(duration_sim_min(g, t, direction) for t in hot)
        env = g.compute_envelope(node, mode, dur, 0.0)
        curve = env["import_max_kw"] if mode == "SUPPORT" else env["export_max_kw"]
        if mode == "SUPPORT":
            fields = {"import_max_kw": max(g.POLICY["max_import_cap_floor_kw"], min(curve))}
            what, note = "import peak", f"Evening peak on your street: please keep grid import under {fields['import_max_kw']:g} kW for a while."
        else:
            fields = {"export_max_kw": max(0.0, min(curve))}
            what, note = "PV backflow", f"Too much solar on your street: please keep grid export under {fields['export_max_kw']:g} kW for a while."
        k = next(iter(fields))
        p = {"segment": node, "mode": mode, "fields": fields, "duration_min": dur, "start_in_min": 0, "note": note,
             "rationale": f"AI offline: {why}. Safety rule for the {what} under {node} ({len(hot)} hot, worst {focus.get('worst')} "
                          f"{focus.get('worst_pct')} %): {mode} with the per-transformer envelope, flat {k}={fields[k]:g} kW per house, "
                          f"for {dur:g} grid minutes until the forecast is back under {g.AP_RELEASE_PCT} %."}
    p["latency_ms"] = 0
    p["source"] = "rules"
    return g.vet_proposal(p, focus)
