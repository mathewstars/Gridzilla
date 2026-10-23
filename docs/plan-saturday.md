# Saturday plan, 24 October 2026

Three people, one day, one real battery. The protocol is frozen in `protocol/PROTOCOL.md`. Build to it, do not debate it.

## Split

| Who | Owns | Done when |
|---|---|---|
| Mathew | Victron side: Node-RED agent on a real Cerbo GX, plus `agent/sim-agent.js` houses | A real SUPPORT signal moves the real battery, acks show on the dashboard, revert works |
| Peter | DSO side: `platform/gridzilla.py`, dashboard, DeepSeek advisor | Four signals, three refusals, heartbeat pause and replay all demoable from the dashboard |
| Matthew | The deliverable: IES profile document, slides, demo script, backup video | Profile reviewed by a mentor, video recorded, slides final |

## Status Friday night

- DSO platform, Mosquitto and four simulated houses run as user services on the Linux box on the site LAN (192.168.90.119). Dashboard on :8080, reachable over Tailscale. Advisor wired to the LLM gateway on :9000.
- The real Cerbo GX (192.168.90.147, portal c0619ab3794e) runs the "Gridzilla agent" Node-RED flow, registered its key, sends telemetry, and acknowledged a RELEASE with a verified signature.
- Not yet done on the real plant: a limiting signal. Battery was at 20 % on Friday night; first live SUPPORT after PV has charged it on Saturday, or a PREPARE in the morning.
- Redeploy the flow: `agent/nodered/build-flow.py` then `deploy-flow.sh` (needs NR_PASS = GX security-profile password, username admin).

## Timeline

| Time | What |
|---|---|
| 09:00 | Everyone: `git pull`, run the stack locally (see README quickstart), watch one signal go end to end on the simulated houses. 15 minutes. |
| 09:15–13:00 | Build in parallel. Mathew: pin key, register, verify, one ESS write on the Cerbo. Peter: broker reachable from the Cerbo, dashboard polish, advisor prompt against DeepSeek. Matthew: profile draft from `docs/architecture.html`. |
| 13:00–14:00 | Integration one: real SUPPORT to `tf:atzgersdorf-1`, real battery exports, ack arrives, dashboard shows it. |
| 14:00–17:00 | Scenarios: refusal below min SoC, replay rejection, heartbeat loss and revert, PREPARE with deadline, feeder-level signal reaching both villages. Advisor proposes, guard refuses one, human approves another. |
| 17:00–18:00 | Full rehearsal. Record the video. |
| 18:00–20:00 | Slides, profile polish, README, final commit with tag `interim`. |

## Demo script, three minutes

1. Situation in the advisor box: "Feeder Liesing-3 at 110 % 17:00–19:00." DeepSeek proposes SUPPORT on the feeder. Guard says ok. Operator approves. Signal is signed and published.
2. Dashboard: four simulated houses and the real Victron plant go to `applied`, grid power goes to −2 kW, VRM shows the real battery discharging.
3. Operator asks for 8 kW feed-in. Guard refuses: above policy and above the transformer reverse rating. Nothing is sent.
4. Replay last signal. Every agent refuses `stale_seq`.
5. Pause heartbeat. 120 s later every agent reverts to owner mode, real battery returns to self-consumption.
6. Close: "The DSO never touched an inverter. The meter is the judge. Every house keeps Gridzilla on a leash."

## Cut order if time runs out

RECOVER, STRETCH, PREPARE deadline scheduling, the fourth simulated house, the advisor. Never cut: one real signal to one real battery, one refusal, one heartbeat revert.
