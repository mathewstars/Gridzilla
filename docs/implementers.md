# Implementing Gridzilla on systems other than Victron

A concept, not code. The point of the protocol is that a vendor integrates **once**, on whichever path suits it, and never has to understand the DSO's grid.

## What any implementation has to do

A Gridzilla agent is eight small functions. Everything else is the vendor's own control stack.

| # | Function | What it needs from the vendor |
|---|---|---|
| 1 | **Pin** the platform public key at registration, trust on first use | an HTTPS call once |
| 2 | **Subscribe** to the signal topics for every node on the device's path, and to the heartbeat | an outbound MQTT (or WebSocket, or long-poll) client; never an inbound port |
| 3 | **Verify** the Ed25519 signature over the envelope bytes, then check sequence, freshness, scope, cohort | one signature check; 30 lines in any language |
| 4 | **Merge** the signal with the owner's limits: minimum SoC, max charge, max discharge, feed-in limit, opt-out. Owner always wins | the owner settings the product already has |
| 5 | **Apply** the merged limits as a ceiling on import, a ceiling on export, a floor on export, a charge or discharge cap, a target SoC by a deadline, or a SoC ceiling by a time | whatever the product uses: export limit, grid setpoint, charge/discharge power limit, schedule |
| 6 | **Ack** with a signed status, the applied limits, SoC and measured grid power | a device key and the meter reading the product already has |
| 7 | **Watch** the heartbeat for live modes; run schedules offline for PREPARE, STRETCH, RECOVER | a timer |
| 8 | **Revert** to owner mode on window end, heartbeat loss, or RELEASE | restore the saved settings |

The signal never names a register, a setpoint or a vendor API. It names a limit at the grid connection point. That is why it is implementable everywhere.

## Three paths, one signal

### Path A · Vendor cloud (fastest to roll out)

The vendor's cloud subscribes to the Gridzilla broker **once for all its devices**, and relays each signal unchanged to the devices behind the right segment. The eight functions run in the vendor's firmware or app. The cloud is a relay, not an authority: it cannot forge a signal because the device still verifies the platform signature end to end.

| Vendor | Where the agent would live | What applies the limits |
|---|---|---|
| **GoodWe** | SEMS portal → inverter firmware (ET / EH / ES series) | export power limit, battery mode (General / Backup / Eco) and eco-mode schedules with charge/discharge power and SoC limits, grid charging on/off |
| **Huawei** | FusionSolar → SUN2000 with LUNA2000 | active power control (export limit), battery working mode (maximise self-consumption / TOU), TOU charge/discharge windows with power and SoC |
| **Sungrow** | iSolarCloud → SH series | export limit, EMS mode (self-consumption / forced), forced charge/discharge schedule with power, SoC reserve |
| **SolarEdge** | monitoring platform → StorEdge | export limit, storage control mode, charge/discharge profile with "maximise export" / "charge from grid" / "discharge to maximise export" |
| **Enphase** | Enlighten → IQ Battery | profile (self-consumption / full backup / savings), battery reserve, scheduled grid charging |
| **Tesla** | Fleet API → Powerwall | operation mode, backup reserve, grid export rule (never / PV only / battery ok), off-grid vehicle charging reserve |
| **SMA** | Sunny Portal / ennexOS → Sunny Boy Storage, Home Manager | active power limitation, battery charge/discharge setpoint over Modbus (SMA "external control") |
| **Fronius** | Solar.web → GEN24 | export limit, battery management (min SoC, charge from grid, "battery calibration"), scheduled charge/discharge |
| **Victron** | VRM → Cerbo GX | this is the demo: ESS max charge/discharge, feed-in limit, grid setpoint, scheduled charging |

For every one of them, the mapping is the same four lines: export ceiling → export limit; import ceiling → discharge to cover load up to the cap; export floor → forced discharge schedule; target SoC → grid charging schedule.

### Path B · Local agent (no vendor cloud, what a homeowner or installer can do today)

Any local controller that already talks to the inverter runs the agent. The vendor does nothing.

| Controller | How it talks to the hardware | Status |
|---|---|---|
| **Node-RED on Venus OS** | D-Bus, Modbus TCP, MQTT | built, this repo |
| **Home Assistant** | integrations for GoodWe, Huawei, SolarEdge, Fronius, SMA, Sungrow, Solax, Deye, Enphase, Tesla; an automation per signal mode | concept, a weekend |
| **EVCC** | already controls chargers and reads batteries from most brands; has a "battery grid charge" and "export limit" concept; one new input: the Gridzilla envelope | concept, upstream feature request |
| **OpenEMS** (FENECON and others) | open-source EMS with controllers for peak shaving, grid-optimised charging; a Gridzilla controller is one more scheduler input | concept |
| **SunSpec Modbus** | model 123 (immediate controls: WMaxLimPct, OutPFSet, WChaMax) and model 124 (storage: StorCtl_Mod, OutWRte, InWRte, MinRsvPct) on any SunSpec-compliant inverter | the generic hardware mapping; most modern inverters expose it |

Path B is where the hackathon demo lives and where the first real users would come from: installers like VictronLab who already run Node-RED or Home Assistant for customers.

### Path C · Standards gateway (regulated, certified, slow)

Where the regulator demands certified hardware, the Gridzilla signal terminates in a gateway that re-expresses it on a standard:

| Standard | How the signal maps |
|---|---|
| **EEBus SPINE / LPC & LPP use cases** (the German §14a path) | `import_max_kw` → Limitation of Power Consumption; `export_max_kw` → Limitation of Power Production. EEBus already defines exactly these two limits with a duration and a fail-safe value. Gridzilla adds the floor, the SoC targets and the signature on top. |
| **OpenADR 3.0** | each mode is an event with an interval payload: `IMPORT_CAPACITY_LIMIT`, `EXPORT_CAPACITY_LIMIT`, `SIMPLE` levels; the Gridzilla segment is the OpenADR target |
| **IEC 61850-7-420 / IEC 61850-90-7 DER** | schedules and power limits on the DER logical nodes (DRCC, DWMX, DEXC) |
| **OCPP 2.0.1 smart charging** | `SetChargingProfile` with a composite schedule for EV chargers; TxDefaultProfile for the import cap |
| **Smart meter gateway with control box** (BSI TR-03109, FNN Steuerbox) | the certified channel; the control box runs functions 3 to 8 and the inverter sees only a relay or a Modbus limit |

Path C is the one a regulator will eventually mandate. Gridzilla is designed so that moving a device from Path B to Path C changes nothing in the signal.

## EV chargers

Chargers are the most elastic load in the house and the agent sheds them **before** it touches the battery. Any charger that supports OCPP 1.6J or 2.0.1, the go-e API, a Modbus profile (Wallbox, Alfen, ABL, KEBA), or EVCC can be throttled from 32 A down to the 6 A minimum or paused. Under ABSORB the car soaks the surplus at noon; under SUPPORT it is throttled first; under STRETCH it is off; under PREPARE it can be filled the night before together with the battery. Vehicle-to-home and vehicle-to-grid add a 60 kWh battery to the same signals, with one extra registry field: which segment the car is plugged into right now.

## What stays the vendor's business

- How to hit a limit at the connection point with its own hardware.
- Which loads to shed in which order (charger, boiler, heat pump), within the owner's preferences.
- The owner UI: showing the note, the active limit, the opt-out switch.
- Battery health: the cycle cap is enforced by the agent against the owner's setting.

## What stays the DSO's business

- The registry, the segment tree and the device-to-meter-point binding.
- The policy guard and the signing key.
- Settlement against the smart meter.

A vendor that implements the eight functions on Path A, or an installer on Path B, is done. There is no second integration when the DSO changes its grid, adds a feeder, or moves a village to another substation. That is the whole argument for a signal that names limits, not devices.
