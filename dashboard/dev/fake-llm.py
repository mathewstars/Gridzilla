#!/usr/bin/env python3
"""DEV ONLY: a fake OpenAI-compatible endpoint that answers like DeepSeek, so the dashboard's AI strip shows real flow
without a real model or key. Never point the live platform at this.

    python3 dashboard/dev/fake-llm.py 8091      then   GZ_LLM_URL=http://localhost:8091/v1
"""
import json, random, re, sys, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def decide(situation: str, ctx: dict) -> dict:
    rel = re.search(r"(ABSORB|SUPPORT) seq (\d+) on (\S+) is active", situation)
    if rel:
        return {"segment": rel.group(3), "mode": "RELEASE", "fields": {}, "duration_min": 15, "start_in_min": 0,
                "note": "The peak is over, your battery is yours again.",
                "rationale": f"Every transformer under {rel.group(3)} is forecast well below its rating. Releasing hands control back to the owners."}
    # Focused prompt: the platform names the target and the allowed segments; the transformers carry their forecast peak.
    tfs = {t: v for t, v in (ctx.get("transformers") or {}).items() if v.get("forecast_peak_pct") is not None}
    if tfs and ctx.get("allowed_segments"):
        tf, v = max(tfs.items(), key=lambda kv: abs(kv[1]["forecast_peak_pct"]))
        pct, at, seg = v["forecast_peak_pct"], v.get("peak_at_h") or ctx.get("sim_hour", 0), ctx["allowed_segments"][0]
        name = tf
        if pct < 0:
            return {"segment": seg, "mode": "ABSORB", "fields": {"export_max_kw": 2.0, "charge_max_kw": 5.0},
                    "duration_min": 120, "start_in_min": 0, "note": "Midday sun is overloading the street: please store it instead of exporting.",
                    "rationale": f"{name} is forecast at {abs(pct)} % reverse flow around {float(at):.1f}h from rooftop solar. Capping export per slot lets the batteries soak up the surplus before the rating is hit."}
        return {"segment": seg, "mode": "SUPPORT", "fields": {"import_max_kw": 3.0},
                "duration_min": 120, "start_in_min": 0, "note": "Evening peak: please run on your battery and take at most 3 kW from the grid.",
                "rationale": f"{name} is forecast at {pct} % around {float(at):.1f}h as heat pumps and EV chargers come on. A per-slot import cap moves that load onto the program batteries and keeps the transformer under its rating."}
    if "Operator warning" in situation:
        return {"mode": "NONE", "rationale": "Noted the operator warning. No transformer is forecast near its rating, so no signal is needed yet."}
    return {"mode": "NONE", "rationale": "Every transformer is forecast inside its rating for the next 90 grid minutes."}


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        msg = body.get("messages", [{}])[-1].get("content", "")
        situation = msg.split("Situation:", 1)[-1].strip()
        try:
            ctx = json.loads(msg.split("Grid state:", 1)[1].split("\n\nSituation:", 1)[0])
        except (IndexError, ValueError):
            ctx = {}
        time.sleep(random.uniform(1.2, 2.8))
        out = json.dumps({"choices": [{"message": {"role": "assistant", "content": json.dumps(decide(situation, ctx))}}]}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8091
    print(f"fake DeepSeek on http://localhost:{port}/v1", flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
