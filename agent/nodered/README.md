# Node-RED agent on the Cerbo GX

> **Status (25 Oct 2026):** reference implementation only. This flow ran on the real Blatnica Cerbo GX during the hackathon
> (23-25 Oct 2026); it is disabled there now and the Blatnica house is the simulated twin `sim-blatnica-01` in `agent/houses.json`.

The real device side. Same logic as `sim-agent.js`, split into function nodes you paste into Node-RED on Venus OS Large.

## Flow shape

```
[inject: startup] -> [http request GET /api/pubkey] -> [function: pin key to flow.platform_pub]
                  -> [http request POST /api/register {device, pubkey_pem}] -> [function: store path]

[mqtt in gridzilla/sig/region:at]   \
[mqtt in gridzilla/sig/sub:wien-sued]   \
[mqtt in gridzilla/sig/feeder:liesing-3] -> [function verify.js] -> out1 -> [function merge.js] -> out1 -> [function: apply plan] -> [victron ESS settings nodes]
[mqtt in gridzilla/sig/tf:atzgersdorf-1] /                         -> out2 -> [function: sign ack] -> [mqtt out]
[mqtt in gridzilla/hb]              /                            -> out3 -> (heartbeat ok)
                                                                                      -> out2 -> [function: sign ack] -> [mqtt out]
                                                                                      -> out3 -> [function: arm revert timer + watchdog]

[victron: grid meter power]  -> [function: flow.grid_kw = payload/1000]
[victron: battery SoC]       -> [function: flow.soc = payload]
[inject every 10 s]          -> [function: telemetry {soc, grid_kw, mode}] -> [mqtt out gridzilla/state/<device>]
[inject every 5 s]           -> [function: watchdog: if effective is live and Date.now()-flow.last_hb > 120000 -> revert]
```

## Function nodes

- `verify.js`: signature over the envelope bytes, scope against `flow.path`, sequence and freshness. Outputs the parsed signal, a refusal ack, or a heartbeat tick.
- `merge.js`: owner limits always win. Produces the ESS writes, the ack, and the revert schedule.
- Sign ack (small): `crypto.sign(null, Buffer.from(JSON.stringify(msg.ackdoc)), flow.get("device_priv"))` → `{v:1, kid:"dev", payload, sig}`.
- Apply plan: save current ESS values to `flow.saved` on first write, then write each `{setting, value}` through the Victron settings node at `start_at`. Revert = write `flow.saved` back.

## Victron settings used

| Envelope field | D-Bus setting |
|---|---|
| `export_max_kw` | `/Settings/CGwacs/MaxFeedInPower` (W) |
| `charge_max_kw` | `/Settings/CGwacs/MaxChargePower` (W) |
| `discharge_max_kw` | `/Settings/CGwacs/MaxDischargePower` (W) |
| `export_min_kw` (forced feed-in) | `/Settings/CGwacs/AcPowerSetPoint` = negative W |
| `import_max_kw` | setpoint 0 plus a cap loop: if grid power > cap, lower the setpoint |
| `target_soc` (PREPARE) | scheduled charging slot with target SoC until `valid_to` |
| owner `min_soc` | `/Settings/CGwacs/BatteryLife/MinimumSocLimit`, read, never written |

## Crypto in function nodes

Node-RED ≥ 1.3: in the function node's **Setup** tab add module `crypto` as `crypto`. Requires `functionExternalModules: true` in settings. On Venus OS Large that file is `/data/home/nodered/.node-red/settings-user.js`. Ed25519 is built into Node's crypto since Node 12, no npm package needed.

Timebox: 30 minutes. If the sandbox refuses, switch `verify.js` to HMAC-SHA256 with a shared secret for the demo and state on the slide that Ed25519 is the production choice.
