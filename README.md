# Gridzilla

**A grid signaling platform for grid-serving storage.**
Gridzilla is the DSO's monster. It stomps on grid congestion by asking home batteries to charge or discharge, but every house keeps it on a leash.

Built at the Energy Bridge Critical Infrastructure Hackathon, Vienna, 23–25 October 2026, for the *Grid-Serving Storage* challenge (see `docs/Challenge-Grid-Serving-Storage_EN.docx`).

Team: Mathew, Peter, Matthew.

## The idea in one paragraph

A distribution system operator (DSO) sees a transformer or feeder about to overload. Today its only tools are curtailing PV or building more grid. Gridzilla gives it a third tool: a **signed, bounded, segment-scoped signal** that tells the batteries in that segment how much the home may import or export for a limited time. The signal reaches Victron, GoodWe and any other system through three vendor-agnostic paths, and always ends in a **local policy agent** that merges it with the owner's own limits before anything is written to the inverter. The DSO never gets raw control of a device.

## Architecture

Full architecture page with diagrams, signal model, threat model and demo script: [`docs/architecture.html`](docs/architecture.html)
(live copy: https://claude.ai/artifact/EKMwWEAfzeujPU5DGsgVpi)

```mermaid
flowchart LR
  subgraph DSO["DSO zone"]
    OPS[Grid operations<br/>congestion forecast per segment]
    GZ[Gridzilla signaling platform<br/>registry · composer · policy guard<br/>signing · publish bus · audit]
    OPS -->|need for segment S| GZ
  end
  subgraph PATHS["Transport paths"]
    A[Path A · vendor cloud<br/>VRM, SEMS]
    B[Path B · local agent<br/>Node-RED on Cerbo GX, HA, EMS]
    C[Path C · standards gateway<br/>EEBus / OpenADR / control box]
  end
  subgraph HOME["Home zone"]
    PA[Local policy agent<br/>verify · scope · merge with owner limits<br/>heartbeat · revert]
    DEV[Inverter + battery<br/>Victron ESS · GoodWe ET · any]
    PA -->|bounded limit| DEV
  end
  GZ -->|signed signal| A --> PA
  GZ -->|signed signal| B --> PA
  GZ -->|signed signal| C --> PA
  DEV -.->|ack · refusal · measured kW| GZ
```

## The signals

A signal is an envelope at the grid connection point, never a device setpoint.

**Everyday case: congestion on a street transformer**

| Mode | When | Effect |
|---|---|---|
| `ABSORB` | PV surplus congestion | lower export limit, allow grid charging |
| `SUPPORT` | load peak, or grid up but short of generation | lower import limit, houses run on their batteries, demand on the transformer and everything above it drops |
| `RELEASE` | event over | owner mode resumes (also on expiry or lost heartbeat) |

**Crisis case: outage, destroyed transformer, load shedding**

| Mode | When | Effect | Realistic today |
|---|---|---|---|
| `PREPARE` | warning: forecast attack, storm, planned shedding window | charge to a target SoC by a deadline, staggered and power-capped so the charging itself does not overload the transformer or deepen an upstream deficit | yes, people in Ukraine do it by hand from the outage calendar |
| `SUPPORT` | grid up but short | as above; this is "discharge when energy is valuable", and it needs no export at all | yes, this is what demand flexibility services pay for |
| `STRETCH` | street dead, expected restoration time known | each house islands on its own inverter; the agent rations discharge and sheds heat pump, EV charger and boiler to last until restoration | partly, needs a comms path that survives the outage (GX LTE) or a cached schedule |
| `RECOVER` | transformer replaced | staggered recharge so 70 kWh of batteries do not refill on top of cold-load pickup | yes |

A dead transformer cannot be fed from the street: inverters must disconnect from a dead grid and there is no grid-forming anchor. A street island from home batteries is the future slide, not the product.

Fields: `segment_id`, `mode`, `import_limit_kw`, `export_limit_kw`, `target_soc`, `valid_from`, `valid_to`, `ramp_s`, `seq`, `issued_at`, `signature`.

`PREPARE` and `STRETCH` are signed schedules the agent executes offline if the link dies. Live heartbeats apply to the congestion limits only, where losing contact must revert to owner mode.

## Security principles

1. Every signal is signed by the platform and verified at the device, end to end, even through a vendor cloud.
2. Signals are limits with a bounded duration, never setpoints. The platform's policy guard caps magnitude, duration and frequency.
3. The owner's limits (minimum SoC, max current, opt-out) always win. The merge can only tighten the DSO envelope.
4. Fail-safe revert: the agent must keep hearing heartbeats to stay in grid-serving mode.
5. Outbound-only connections from the home. No inbound listeners, no port forwarding.
6. Replay protection through sequence numbers and short validity windows.
7. Randomized ramps so no signal can create a synchronized step on the grid.
8. The DSO sees aggregate segment data, not household behaviour.
9. `PREPARE` and `STRETCH` can only raise target SoC or lower discharge. `SUPPORT` is the only signal that spends energy and it is capped in depth and duration, so a compromised platform cannot drain the street the night before a strike.

## Reference installation and demo

The reference plant is a Victron ESS system (Cerbo GX, MultiPlus-II, MPPT, battery, grid meter) on VRM. The local policy agent runs as a Node-RED flow on Venus OS. Demo script: valid signal, refused signal below minimum SoC, replayed signal, platform outage with fail-safe revert. See the architecture page for the Victron and GoodWe mappings.

## Repository layout

```
docs/architecture.html   architecture page (diagrams, signal, threats, demo script)
docs/Challenge-*.docx    the original challenge text
```

Code for the mock platform and the Node-RED agent flow will land here during the hackathon.
