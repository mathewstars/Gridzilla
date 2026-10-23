# Gridzilla protocol v1

Frozen for the hackathon. Change it only by changing this file and the schemas next to it.

## Transport

MQTT, any broker. The home side only ever **subscribes** and **publishes**; it never listens on a port.

| Topic | Direction | Payload | QoS |
|---|---|---|---|
| `gridzilla/sig/<segment>` | platform → devices | signed envelope with a **signal** | 1 |
| `gridzilla/hb` | platform → devices | signed envelope with a **heartbeat** | 0 |
| `gridzilla/ack/<device>` | device → platform | signed envelope with an **ack** | 1 |
| `gridzilla/state/<device>` | device → platform | plain **telemetry** (soc, grid_kw), every 10 s | 0 |

`<segment>` is a node id from the grid tree, e.g. `feeder:liesing-3`. A device subscribes to `gridzilla/sig/<node>` for **every node on its path**, so a feeder-level signal reaches every house under that feeder.

Nothing is retained. Freshness is enforced by the receiver, not by the broker.

## Envelope

Every signed message on the wire is:

```json
{"v": 1, "kid": "gz-2026-10", "payload": "<the JSON document as a string>", "sig": "<base64 Ed25519 signature over the UTF-8 bytes of payload>"}
```

The receiver verifies `sig` over the exact bytes of `payload` **before** parsing it. No canonicalisation, no ambiguity: the bytes that were signed are the bytes that are verified.

- Platform key: Ed25519, public key in `platform/keys/platform.pub.pem`, pinned on every device.
- Device key: Ed25519, generated on the device at first start and **kept on disk**, public key sent once at registration.
- The pinned platform key and the last accepted `seq` are also kept on disk, so a restart neither reopens trust-on-first-use nor the replay window.
- `kid` names the key, so keys can rotate.

## Segment tree

Nodes are `kind:name`. Kinds, top down: `region`, `sub` (110/22 kV substation), `feeder` (22 kV line), `tf` (street transformer). A device's `path` lists the nodes above it, root first:

```json
["region:at", "sub:wien-sued", "feeder:liesing-3", "tf:atzgersdorf-1"]
```

A device accepts a signal only if `signal.segment` is in its `path` and, when `cohort` is set, its id falls in that cohort.

## Signal

See `signal.schema.json`. Fields:

| Field | Type | Meaning |
|---|---|---|
| `seq` | int | Monotonic per platform. A device rejects `seq <= last seen`. |
| `issued_at` | ISO 8601 UTC | A device rejects if older than 120 s or in the future by more than 30 s. |
| `segment` | string | Target node. |
| `mode` | enum | `PREPARE`, `ABSORB`, `SUPPORT`, `STRETCH`, `RECOVER`, `RELEASE` |
| `valid_from`, `valid_to` | ISO 8601 UTC | Window. Max 4 h except `STRETCH` (max 3 days). **The device enforces the bound itself**: it reverts at `valid_to` or at `valid_from` + 4 h, whichever is earlier, whatever the platform sent. |
| `import_max_kw` | number or null | Ceiling on import at the connection point. |
| `export_max_kw` | number or null | Ceiling on export. |
| `export_min_kw` | number or null | Floor on export, **forced feed-in**. The only field that spends the owner's energy for the street. |
| `charge_max_kw` | number or null | Ceiling on battery charge power. |
| `discharge_max_kw` | number or null | Ceiling on battery discharge power. |
| `target_soc` | number or null | Percent to reach by `valid_to` (`PREPARE`). |
| `max_soc_by` | number or null | Percent to be at or **below** by `valid_from` (`ABSORB`): make room for the midday surplus by running the morning load from the battery. |
| `ramp_s` | [min, max] | Device picks a random ramp in this range. |
| `cohort` | [k, n] or null | Address only the devices whose `sha256(device_id) mod n == k`. Lets the platform stagger a segment: cohort [0,2] exports in the morning and charges at noon, cohort [1,2] the reverse, so the transformer never sees everyone at once and nobody is curtailed. No registry change needed; the device checks itself. |
| `note` | string | Operator text, shown to the owner. |

Which fields each mode may carry (the policy guard refuses anything else):

| Mode | Allowed fields | Intent |
|---|---|---|
| `PREPARE` | `target_soc`, `charge_max_kw` | Fill before the event, gently. Can only raise SoC; the guard refuses `target_soc` below 50. Target design, not in the hackathon build: the agent picks the cheapest window before `valid_to`, the DSO waives the network fee in that window, and the guard refuses a PREPARE with no following SUPPORT or outage window. Today the agent starts charging at `valid_from`. |
| `ABSORB` | `export_max_kw`, `charge_max_kw`, `max_soc_by` | PV surplus. The agent works down a ladder: make room in the morning, charge the battery at noon, shift loads (boiler, heat pump, EV) into the surplus, and only then curtail. Curtailed energy is reported in the ack and compensated, or credited to the supplier's virtual battery as if exported. Pair with an evening `SUPPORT` so the same energy is exported later, paid. |
| `SUPPORT` | `import_max_kw`, `export_min_kw` | Peak or deficit: "take 3 kW only", "give at least 2 kW". |
| `STRETCH` | `discharge_max_kw` | Street is dark; ration to last until `valid_to` (= expected restoration). **Implies `export_max_kw = 0`**: the agent locks export so nothing can backfeed into a line under repair. Anti-islanding already prevents it; the signal says it anyway. |
| `RECOVER` | `charge_max_kw` | After restoration: staggered recharge. |
| `RELEASE` | none | End of event. |

## Heartbeat

```json
{"seq": 9001, "ts": "2026-10-24T17:00:30Z"}
```

Every 30 s, with a monotonic `seq` and a timestamp. A device accepts a heartbeat only if `seq` is greater than the last one it saw and `ts` is within 90 s, so a captured heartbeat cannot be replayed to keep a device in a live mode. A device in `ABSORB` or `SUPPORT` reverts to owner mode after 120 s without a valid heartbeat. `PREPARE`, `STRETCH` and `RECOVER` are schedules: they run to `valid_to` without heartbeats, because they are owner-favourable and the link is expected to die in exactly those situations.

## Ack

See `ack.schema.json`. Sent on every accepted or rejected signal, and again on revert.

| Field | Meaning |
|---|---|
| `device` | Device id. |
| `path` | The device's path in the tree. |
| `seq` | The signal's `seq`, or `null` for a spontaneous revert. |
| `status` | `applied`, `partial`, `refused`, `reverted` |
| `reason` | `null`, `min_soc`, `owner_limit`, `stale_seq`, `bad_sig`, `out_of_scope`, `expired`, `bad_mode`, `heartbeat_lost`, `window_end`, `opt_out` |
| `applied` | The limits actually in force after merging with owner limits. |
| `soc` | Percent. |
| `grid_kw` | Measured at the connection point. Positive = import, negative = export. |
| `curtailed_kwh` | Optional. Energy the inverter could have produced but did not because of the signal, since the window began. Basis for compensation. |
| `ts` | ISO 8601 UTC. |

## Merge rule

`effective = tighter(signal, owner)` for every field. Owner limits are: `min_soc`, `max_charge_kw`, `max_discharge_kw`, `feedin_max_kw`, `opt_out`. A signal can never loosen an owner limit: `export_max_kw` is applied as `min(signal, feedin_max_kw)`, and a `STRETCH` always sets `export_max_kw = 0`. An owner with `opt_out` refuses every signal except `RELEASE` with reason `opt_out`. If `export_min_kw` cannot be met because `soc <= min_soc`, the device applies `export_min_kw = 0` and acks `partial` with reason `min_soc`.

## Settlement

The ack is for awareness and audit. Payment follows the DSO smart meter at the connection point, per 15-minute interval, against the limits in the signal. Not part of the hackathon build.
