# STORY: what the stage must say

The content contract for the ONE presentation stage. Every fact below is a judge take-away from the judges' brief
(docs/Challenge-Grid-Serving-Storage_EN.docx), the pitch deck (docs/Gridzilla-pitch.pdf/.pptx + speaker notes),
docs/architecture.html, docs/implementers.md, protocol/PROTOCOL.md, README.md and STORY-DAD.md.
Each fact is shown as a LIVE number or visual, never a paragraph. Fields were checked with curl against localhost:8081
(24 Oct, 15:15-15:25 Vienna, presenter/QA cycling scenarios) and read-only against gridzilla.victronlab.sk for Blatnica.

Abbreviations: S = /api/state?hh=<feeder>&fc=<tf>&tree=1, H = /api/history, W = /api/weather, F = /api/flatten?node=<tf>,
FC = /api/flatten?node=region:at (the city). `<tf>` = the transformer the stage is showing (auto-picked: highest
S.forecast_peak[tf].pct, or S.autopilot.target.worst). `<seg>` = a key of S.active. N = Date.parse(S.now) (server
clock, keep ticking client-side from the fetch time). X = S.autopilot.sim_x (60: one grid minute per real second).
r = S.summary.houses / S.summary.households (8, see fact 24).

MUST = on screen within the first 10 seconds or in every cycle of the stage. NICE = when room allows or as the stage cycles.
EVENT = only while the live field says it is happening; never faked, never held on screen after it ends.

## The one-line story (deck slide 1, notes 0:00)

"A signed, bounded grid signal that home batteries, cars and heat pumps follow. The owner stays in control."
Headline on stage: **Gridzilla eats the peak.** Sub-line: **Every house keeps it on a leash.**

## What the judges score (the brief, word for word, mapped to facts)

The brief: "the grid operator can, in exceptional situations and for a limited time, influence the operation of a
large number of storage systems in a grid segment" so that "curtailment of generation plants or consumers is avoided
as far as possible", "reducing the need for grid expansion", delivered as "a rough interoperability profile for easily
integrating devices and systems". Each line must be visible as a live fact:

| Judge criterion | Fact(s) | The one live fact a judge must see |
|---|---|---|
| J1 Exceptional situations only | 18, 6 | "**2** of **72** streets under an event right now" / "No event: every battery is the owner's" |
| J2 For a limited time | 17, 16 | Countdown on the active signal: "ends **22:30** · **48 min** left" + "max **24 h**, the house reverts by itself" |
| J3 Owner stays in control | 19, 7 | "Owner wins: **3** homes kept their reserve" / "**12** homes back to owner mode" |
| J4 Curtailment avoided | 20 | "**11.3 MWh** of noon solar into batteries, not curtailed" (plan) + "**62 kW** going into batteries now" |
| J5 Grid expansion deferred | 21, 9, 10 | "**61** of **72** streets would pass their limit tonight. With the plan: **0**" |
| J6 Interoperable profile any vendor can implement | 22, 5, 8 | "Signed Ed25519 · MQTT over TLS · open protocol" + "**Victron** and **Viessmann** at Blatnica answered seq **1244**" |
| J7 Large number of storage systems in a segment | 4, 14, 24 | "**2,176** homes · **72** transformers" (x8, fact 24) |

## Facts

Facts 1-16 keep their numbers (other files and code refer to them). 17-28 are new in this round.

| # | Fact a judge must leave with | Live field(s) and how to compute | On-stage words (big, short) | Visual | data-src (qa/README.md) | Level |
|---|---|---|---|---|---|---|
| 1 | The problem: evening heat pumps + EVs push street transformers past their rating; noon solar pushes it backwards | S.aggregates[tf].load_pct (negative = backflow, % of reverse rating), .rating_kw, .total_kw; S.forecast_peak[tf].pct; count of tfs with forecast_peak.pct >= 85 | "**135 %** of what this transformer can carry" / noon: "Backflow **77 %**" / "**4** streets heading past the limit" | Apple Watch load ring: green < 85, orange 85-100, red > 100 (fills past 100 = red overlap). Negative load_pct: same ring, label "backflow", fills the other way. 3D kiosk turns the same colour | `state/aggregates/<tf>/load_pct`; count needs `count()` (see G2 gaps) | MUST |
| 2 | With vs without Gridzilla: the gap is the product | S.aggregates[tf].baseline_kw (without) vs .total_kw (with), .rating_kw; H nodes[tf][].baseline_kw / .total_kw over .h | "Without Gridzilla **400 kW**" "With Gridzilla **224 kW**" "Limit **250 kW**" | THE money shot: live curve drawing as points arrive, grey dashed "without" keeps climbing, solid line bends under the red limit line; the gap shaded. Numbers tick | `state/aggregates/<tf>/baseline_kw`, `.../total_kw`, `.../rating_kw` | MUST |
| 3 | How much was taken off the transformer right now | baseline_kw - total_kw on S.aggregates[tf] (only when baseline_kw > 0; at noon see fact 20) | "**176 kW** taken off this street" | Giant counter that ticks | `derived` from `state/aggregates/<tf>/baseline_kw - state/aggregates/<tf>/total_kw` | MUST |
| 4 | Homes follow the signal | S.aggregates[<seg>].applied (devices with latest ack applied/partial) x r; S.summary.shaped x r (on the diet plan); S.summary.online. Rule: an ack `refused` + `stale_seq` whose .seq equals the active seq is a duplicate delivery, NOT an owner refusal (108 of 272 households showed this at 15:17 while .applied held the SUPPORT limits): never draw it red, never call it "refused" | "**192** homes following the signal" / no event: "**2,168** homes on the diet plan" | Big number + house dots: green applied, orange partial (owner limit), grey owner mode | `derived`: `state/aggregates/<seg>/applied * state/summary/houses / state/summary/households`; `state/summary/shaped` | MUST |
| 5 | Every message is signed (Ed25519) and bounded (limits, never setpoints, time window) | S.active[seg].seq, .mode, .issued_at, .valid_to, .import_max_kw / .export_max_kw, .envelope; households[*].ack.verified | "Signal **#923** signed and sent" "Take at most **3 kW**" "until 22:30" | Step 4 of the AI strip lights; a short pulse travels kiosk -> houses in 3D on a new seq | `state/active/<seg>/seq`, `state/active/<seg>/import_max_kw` | MUST |
| 6 | AI decides, a non-AI guard checks (deck: "AI proposes, guard disposes") | S.autopilot.stage: sense -> deepseek -> guard -> send -> idle; .last_trigger; .last_result.mode/.fields/.rationale/.latency_ms; .history[0].verdict (sent / refused / held / pending / none), .detail; .target.worst_pct | Steps: "**Sees** 135 % at 20:38" "**Thinks** DeepSeek, 1.5 s" "**Checks** guard passed" "**Acts** signed, sent" | 4-step strip that lights in sync with autopilot.stage; refused/held shows the guard in red with .detail | `state/autopilot/target/worst_pct`, `state/autopilot/last_result/latency_ms` (data-scale 0.001) | MUST |
| 7 | A human can step in | S.autopilot.mode (auto / approve / off), .pending; S.hb_paused | "Autopilot on. A person can take over any time." / "**Waiting for operator**" when pending | One quiet line under the AI strip; pending = orange step 4 | text only | MUST (one line) |
| 8 | The real home in Blatnica runs on it (Victron plant + Viessmann heat pump) | S.households.blatnica (real: true, .telemetry.soc/.grid_kw/.ev_kw/.hp_kw/.dhw_c, .ack.status/.seq/.verified, .registered); H devices real-powerplant-blatnica / vicare-blatnica (.mode, .soc, .grid_kw). LOCAL 8081: registered false, telemetry null, history empty. PROD (gridzilla.victronlab.sk, 15:19): soc 31, grid -0.17 kW, dhw 52.7 °C, ack applied seq 1244 verified | "**Blatnica** · real home, live" + battery **31 %**, grid **0.2 kW**, hot water **53 °C** | BlatnicaTile (reuse): battery ring + 3 live numbers. Not registered: "Waiting for the plant" in grey, never a fake value | `state/households/blatnica/telemetry/soc`, `.../grid_kw`, `.../dhw_c` | MUST |
| 9 | The diet plan (SHAPE: per-slot ceilings for every house, renewed every 2 grid hours). Detail in STORY-DAD.md (1) | F.plan: peak_naive_pct -> peak_plan_pct (132 -> 60 on atzgersdorf-1), level_kw (L), shifted_kwh, cars_full, hours[] + naive_kw[] + planned_kw[], rating_kw; F.renewed_at, F.rounds; S.summary.shaped | "**Flatten the curve.**" "Peak **132 % -> 60 %**" "**224 kWh** of car charging moved to the night" "Every car full by morning" | Hero curve on a clock axis: grey "without" hill vs green plateau at L, red limit line | `flatten/plan/peak_naive_pct`, `flatten/plan/peak_plan_pct`, `flatten/plan/shifted_kwh` | MUST |
| 10 | Headline result for the city | FC plan.peak_naive_pct -> peak_plan_pct (115 % -> 62 % at 15:20), peak_naive_kw -> peak_plan_kw (34.3 -> 18.6 MW), shifted_kwh | "Vienna tonight **115 % -> 62 %**" "**34.3 MW** becomes **18.6 MW**" | One giant before -> after pair, keynote style. Deck pair ("79 -> 45 %, 23.7 -> 13.4 MW", slide 8) only as a small labelled footnote | `flatten:region:at/plan/peak_naive_pct` (data-scale 0.001 for MW), see G2 gap b | MUST |
| 11 | Weather aware | W.now.temp_c, .cloud_pct, .sun_wm2; W.summary; W.stale; S.scenario.name | "**12°** · cloudy · Wien-Liesing" / "Cold evening: heat pumps on" | Sky and sun follow S.sim_hour + W.now.cloud_pct; panels glint by sun_wm2. "Real Vienna weather" only when scenario.name == live-weather, else the scenario in plain words | `weather/now/temp_c` | NICE (visible in scene) |
| 12 | Grid time runs (the day plays) | S.sim_hour, X | "**20:58**" grid time | Clock in the frosted top bar | `state/sim_hour` (shown as hh:mm, no data-val) | MUST (small) |
| 13 | Devices that do the work | S.summary.ev_kw, .hp_kw (already x8); households[*].telemetry.soc, .ev_kw, .hp_kw, .grid_kw | "**837 kW** of car charging held back" | 3D houses: battery fill = soc, EV glow when ev_kw > 0, heat-pump fan = hp_kw; particles at kW speed, direction = sign of grid_kw | `state/summary/ev_kw` | NICE |
| 14 | Scale | S.summary.houses (2,176), count of tf in S.tree (72), feeders (24), substations (8); 2 real devices | "**2,176** homes · **72** transformers · **2** real devices" | Small footer counters | `state/summary/houses`; tree counts need `count()` | NICE |
| 15 | Seven modes, one grammar | S.active[*].mode, S.recent[*].mode (PREPARE, ABSORB, SUPPORT, STRETCH, RECOVER, RELEASE, SHAPE), .note | Only the mode in play: "**SUPPORT** · evening peak" | Word on the step 4 card | text only | NICE |
| 16 | Fail-safe: platform silent -> every house back to owner mode in 120 s | S.hb_paused; S.policy.heartbeat_s (30); 120 s revert is protocol v1 | "Heartbeat paused: homes back to owner mode" only when hb_paused is true; standing small line "No heartbeat for **120 s**: owner mode" | Houses fade to grey | `deck` data-label="protocol v1" for 120 | MUST (small line) / EVENT |
| 17 | LIMITED TIME: every signal has a window and a visible end | S.active[seg].valid_from, .valid_to (real UTC). remaining_s = (Date.parse(valid_to) - N) / 1000; grid minutes left = remaining_s * X / 60; end on the grid clock = S.sim_hour + remaining_s * X / 3600 (hh:mm). Progress = (N - valid_from) / (valid_to - valid_from). Autopilot SUPPORT = 120 grid min = 2 real min, so the countdown visibly ticks one grid minute per second. Ended early: S.recent[seg].ended ("released by seq 413") + .ended_at. Bounds: S.policy.max_window_min (1440), .max_stretch_window_min (4320) | "Ends **22:30** · **48 min** left" -> at 0: "**Back to the owner**" / early: "Released early" + "Max **24 h** per signal. The house reverts by itself." | Draining ring or bar on the signal card, Apple Timer style, same colour as the mode; the 3D houses under the segment lose their tint at 0. Never a countdown when S.active is empty | `state/active/<seg>/valid_to` (no data-val: the ticking minutes are time, not a payload number); `state/policy/max_window_min` data-val 1440 data-scale 0.0166667 | MUST |
| 18 | EXCEPTIONAL ONLY: the DSO steps in on a few streets, for a while; everyone else is untouched | Streets under an event = tfs whose path (S.tree parents) contains a key of S.active (or S.autopilot.hotspots[tf].covered, refreshed every autopilot run); total = tfs in S.tree. Events running = number of keys in S.active (SHAPE is never in S.active). Brakes: S.policy.autopilot_max_per_hour (6), .autopilot_cooldown_min (10), .autopilot_trigger_pct (85); S.autopilot.history[*].verdict held/refused | "**2** of **72** streets under an event right now" / none: "**No event.** Every battery is the owner's" / "Trigger only past **85 %**" | Small 72-dot strip (one per transformer), grey = owner, mode colour = under an event; the dots light and go out as events start and end | `count()` over `state/active` and tree (G2 gap a); `state/policy/autopilot_trigger_pct` | MUST |
| 19 | OWNER STAYS IN CONTROL: the owner's limits always win, and control comes back | Ack per household: .ack.status partial with .reason min_soc / owner_limit, refused with opt_out = owner won (count them, seq == active seq); status reverted (window_end, heartbeat_lost, release) = control handed back; S.log kind "ack" msg "...: reverted (release)..." per device; households[*].telemetry.mode == "owner" = running on the owner's own settings. Guard floor: S.policy.max_import_cap_floor_kw (2): the DSO can never cap a home below 2 kW. Release text: S.autopilot.last_result.note when mode RELEASE ("The peak is over, your battery is yours again.") | "Owner wins: **3** homes kept their reserve" (EVENT) / "**271** homes on their owner's settings" (no event) / "Never below **2 kW** per home" / on release: "Your battery is yours again." | One owner line on the signal card; houses that answered partial get an orange ring; on revert the house dot goes grey with a short fade | `derived` count (G2 gap a); `state/policy/max_import_cap_floor_kw` | MUST |
| 20 | CURTAILMENT AVOIDED: noon solar goes into batteries instead of being cut | (a) Plan, always available: absorbed_kwh = sum over slots i with F.plan.naive_kw[i] < 0 of max(0, planned_kw[i] - naive_kw[i]) * 0.25 (planned is clipped at -export_level_kw, the batteries take the rest). 230.9 kWh on tf:mauer-2, 11.3 MWh on FC at 15:20. It equals F.plan.batt_kwh_free whenever the surplus fills the batteries (230.7 / 11,291), so fallback = batt_kwh_free with the words "battery room kept for noon solar". (b) Live at noon (baseline_kw < 0): kW absorbed now = S.aggregates[tf].total_kw - baseline_kw (atzgersdorf -191 -> -130 = 62 kW); backflow % without = baseline_kw / rating_kw. (c) ABSORB events: S.active[seg].export_max_kw, .max_soc_by | "**11.3 MWh** of noon solar into batteries, not curtailed" / noon: "**62 kW** of solar going into batteries now" "Backflow **52 %** instead of **77 %**" | Noon part of the hero curve: the dip below zero is cut at -Le (green "export level" line), the area between the naive dip and Le filled green = solar soaked up | `derived` sum (G2 gap a) or `flatten/plan/batt_kwh_free`; `derived` `state/aggregates/<tf>/total_kw - state/aggregates/<tf>/baseline_kw` | MUST |
| 21 | GRID EXPANSION DEFERRED: the peak stays under the rating, so no bigger transformer | FC plan.tfs[]: over_without = count(peak_naive_pct > 100) (61 of 72 at 15:20), over_with = count(peak_plan_pct > 100) (0). Per street: headroom = F.plan.rating_kw - peak_plan_kw (250 - 150.5 = 99.5 kW on atzgersdorf-1). Live now: count tfs in S.aggregates with baseline_kw > rating_kw but total_kw <= rating_kw (5 of 5 at 15:17) | "**61** of **72** streets would pass their limit tonight. With the plan: **0**" / "**100 kW** of room left for new heat pumps and cars" / deck footnote: "A street transformer upgrade: 50-150 k€ (deck)" | Two big numbers side by side, red 61 -> green 0; on the hero curve the gap between plateau and red limit labelled as room | `count()` over `flatten:region:at/plan/tfs` (G2 gap a); `derived` `flatten/plan/rating_kw - flatten/plan/peak_plan_kw`; cost `deck` data-label="deck estimate" | MUST |
| 22 | INTEROPERABLE PROFILE any vendor implements once: signed open protocol, proven on two real vendors | Live proof: S.households.blatnica.devices (real-powerplant-blatnica = Victron Cerbo GX, vicare-blatnica = Viessmann Vitocal via ViCare; vendor names are in /api/devices .vendor), each device's ack in S.log (kind ack, .device, .status) and H devices[...].mode; households[*].ack.verified (count true = signatures checked end to end); S.active[seg].seq. Static protocol facts (PROTOCOL.md, implementers.md): Ed25519 signature, MQTT over TLS, outbound only, 7 modes, 8 agent functions, 3 paths (vendor cloud / local agent / standards gateway: EEBus, OpenADR, OCPP, SunSpec) | "**Open protocol.** Signed Ed25519 · MQTT over TLS · any vendor" / "**Victron** + **Viessmann** at Blatnica: both answered signal **#1244**" / "**271** of **272** answers signature-checked" / "8 functions · 3 paths · no vendor API in the signal" | One row of two real-vendor chips with a live tick per ack (green applied, grey reverted); below, a quiet "same signal, any vendor" line. When Blatnica is not registered: chips grey "Waiting for the plant" | `state/households/blatnica/ack/seq`; verified count `count()` (G2 gap a); static counts `deck` data-label="protocol v1" | MUST |
| 23 | The diet plan keeps itself fresh | F.rounds, F.renewed_at; next plan in = (Date.parse(renewed_at) + 120 s - N) * X (2 grid hours, SHAPE_EVERY_S); S.shape.feeders (24) | "New plan every **2 hours** · round **27**" / "next plan in **1 h 40 min**" | Small line under the hero curve; a soft redraw of the plateau when rounds changes | `flatten/rounds`; renewal interval `deck` data-label="platform setting" | NICE |
| 24 | Each simulated household stands for 8 real homes (STORY-DAD.md (2)) | households[*].represents (8); r = S.summary.houses / S.summary.households (2,176 / 272); S.summary.shaped x r (2,168); F.plan.houses already x8. Blatnica stays "1 real home" | Once, small, near the first homes number: "each simulated household stands for **8** real homes" | Footnote line | `derived` `state/summary/houses / state/summary/households` | MUST (one line) |
| 25 | Staggered cohorts: the fleet fills in waves (STORY-DAD.md (3)) | S.active[seg].cohort = [k, n]; step = valid_to - valid_from; wave k starts at valid_to - (n - k) x step; house wave = sha256(device id) mod n | "**Filling in 4 waves**" "wave **2** of **4**" | 3D battery fills light up group by group | `state/active/<seg>/cohort/0`, `.../cohort/1` | EVENT (NICE) |
| 26 | Realistic EV charging (STORY-DAD.md (4)) | households[*].telemetry.ev (charger kW) and .ev_kw > 0 (charging now); F.plan.ev_houses, ev_kwh | "A car charges on about half the nights, arriving 17:00 to 20:00" + "**6** of **148** cars charging now" | Legend line under the curve; only cars with ev_kw > 0 glow in 3D | `count()` over `state/households` (G2 gap a); legend text has no live digits except the count | NICE |
| 27 | STRETCH, the vision (STORY-DAD.md (5)) | S.policy.max_stretch_window_min (4320 = 3 days). Never shown as active unless S.active has mode STRETCH | "**STRETCH** · the vision: a dark street islands on its own batteries" "signal ready, up to **3 days**" | Final beat / one grey "vision" tile | `state/policy/max_stretch_window_min` data-val 4320 data-scale 0.000694 | NICE |
| 28 | What is real, what is modelled (deck slide 9) | DECK only: "−176 kW one street, Speising-22: 574 → 398 kW, 31 %", "−5.2 MW Vienna, 2,184 enrolled houses, 19 %", "1 real house in the fleet tonight" | One quiet row: "Measured on the fleet run, 24 Oct (deck)" | Small footnote tile | `deck` data-label="measured on the fleet run (deck)" | NICE |

## Live numbers at write time

15:15-15:25 Vienna; presenter/QA scripts were switching scenarios (sunny-noon / cold-evening), so sim_hour jumped.
- tf:atzgersdorf-1 plan: rating 250 kW, 132 % -> 60 %, L 150.5 kW, 224 kWh moved, cars_full true. Noon: without -191 kW, with -130 kW.
- City plan (FC): 115 % -> 62 %, 34.3 -> 18.6 MW, 2,168 houses, 1,184 with a car; 61 of 72 tfs over rating without, 0 with; 11.3 MWh noon solar absorbed.
- tf:mauer-2 plan (rating 630 kW): 119 % -> 80 %, 231 kWh noon solar absorbed.
- S: 272 households, 271 online, 271 shaped, 2,176 houses; active SUPPORT on tf:essling-13 seq 923, 13:17:17 -> 13:19:17 UTC
  (120 grid min), 3 kW cap. Autopilot: last RELEASE on feeder:liesing-3, 1,509 ms, verdict sent; history 18 sent / 2 held.
- Policy: window max 1440 min, STRETCH 4320 min, import cap floor 2 kW, heartbeat 30 s, trigger 85 %, release 60 %, 6 per hour.
- Blatnica (prod): soc 31 %, grid -0.17 kW, hot water 52.7 °C (set 50), ack applied seq 1244 verified; vicare-blatnica applied
  ABSORB then "reverted (release)". Local 8081: not registered.
- Weather: 12.2 °C, 100 % cloud, 274 W/m², not stale.

## Gaps and the honest alternative (read before building)

1. **Curtailed kWh is not in the API.** The agent reports `curtailed_kwh` in every ack (agent/sim-agent.js:261) but the
   platform drops it (platform/gridzilla.py:1103 keeps only status, reason, seq, verified, applied). So never show
   "0 kWh curtailed" or "N kWh curtailed". Use fact 20 (a) and (b). Proposal for dad: pass curtailed_kwh into the ack
   summary and sum it per node in aggregates().
2. **"0 owner floors crossed" (deck slide 7) has no live field.** Owner min_soc is not in the API. Show the live owner
   facts of fact 19 instead; the deck number only as a labelled footnote ("0 owner floors crossed (deck)").
3. **Blatnica is offline on the local stack** (registered false, telemetry null, history empty). It is live on
   gridzilla.victronlab.sk. If the pitch runs from 8081, facts 8 and 22 show "Waiting for the plant". Decision for the
   captain: present against the prod platform, or bridge the local stack to the public broker.
4. **Duplicate stale_seq acks** (fact 4 rule): 108 of 272 households showed `refused stale_seq` for the very seq they
   applied. Not an owner refusal. Never paint it red or count it in fact 19.
5. **Deck vs live:** deck slide 3 and 12 say "Four-hour maximum"; live policy is 24 h (max_window_min 1440): say 24 h.
   Deck slide 11 "8,070 houses represented" does not match live (2,176): never show it. Deck slide 8 "79 -> 45 %" and
   slide 7 "−199 kW" are frozen: footnote only.
6. **SHAPE is daily, events are exceptional.** Judges may ask why a daily plan fits "exceptional, limited time". The
   answer on stage: the plan sends ceilings only (never a command), expires on its own, owner limits win
   ("A ceiling, never a command. Expires by itself."). Event signals (S.active) carry the J1/J2 story.
7. **Interop vendor mix:** /api/devices labels the simulated fleet huawei 61, goodwe 58, fronius 55, sma 46, sim 51.
   Those are simulated labels, not real devices: do not show them as vendor proof. Only Victron + Viessmann are real.
8. **History integrals** (kWh over the day from H) are unreliable while scenarios jump the grid clock. Use F for kWh.
9. F.plan.bias_kw (closed loop) is still absent from the running 8081 response: optional.

## G2 (data truth) gaps for the code agents

The current `derived` grammar in qa/truth.mjs allows only + - * / and parentheses on numeric paths. Facts 1, 14, 18, 19,
20, 21, 22, 26 need:
- a) aggregation: proposed `count(<path>/*/<field> <op> <n>)`, `count(<path>/*)`, `sum(<path>/*)`, `sumif(...)`, e.g.
  `count(flatten:region:at/plan/tfs/*/peak_naive_pct > 100)`. Until truth.mjs supports it, these numbers cannot pass G2.
- b) two flatten nodes collide: api.ts `publish()` keys window.__gz by endpoint only, so F (tf) and FC (region:at) overwrite
  each other. Proposal: key flatten payloads as `flatten:<node>` (paths above use `flatten/...` for F and
  `flatten:region:at/...` for FC).
- c) countdowns (fact 17, 23) are time arithmetic on ISO strings: point data-src at the ISO field and leave out data-val.

## Wording rules

- Plain words a grid expert gets in 10 s: "without Gridzilla", "with Gridzilla", "limit", "homes following", "signed and
  sent", "ends 22:30", "back to the owner", "not curtailed", "no bigger transformer".
- Times as hh:mm grid time (hhmm()), power via nice(). No raw ids on stage: "tf:atzgersdorf-1" -> "Atzgersdorf".
- Every "homes" number is x8 (fact 24); Blatnica is "1 real home".
- Deck numbers are context for the speaker, not stage data. The stage shows live values; deck values only as labelled footnotes.
- No field -> no number. Missing data reads "Waiting for data" in grey; samples only behind ?sample and labelled "Sample".

## Speaker-note beats the stage must support (no clicks)

1. 0:00 "Real plant and a Viessmann heat pump in Blatnica on the board right now" -> facts 8 and 22 visible.
2. 2:00 "Limits not setpoints, owner wins, device enforces time bounds itself" -> facts 17, 19 on the signal card.
3. 5:30 "AI proposes, guard disposes" -> fact 6 lights up live; fact 18 shows it is a few streets, not the city.
4. 6:30 "Grey is what they would have drawn, blue is what they drew, red is the transformer. The gap is the product." -> fact 2.
5. 7:00 "Sleeps at 70 instead of 110 %" + water-filling, level L -> facts 9, 10, 21; noon dip -> fact 20.
6. 13:30 "Any vendor, four lines each" -> fact 22.
7. 14:30 close: "the vision" -> fact 27.
