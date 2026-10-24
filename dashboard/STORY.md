# STORY: what the stage must say

The content contract for the presentation stage (A and B). Every fact below is a judge take-away from the pitch deck
(docs/Gridzilla-pitch.pdf + speaker notes), the team board (Presentation + Flattening tabs) and PROTOCOL.md.
Each fact is shown as a LIVE number or visual, never a paragraph. Fields were checked with curl against localhost:8081.
Abbreviations: S = /api/state?hh=<feeder>&fc=<tf>&tree=1, H = /api/history, W = /api/weather, F = /api/flatten?node=<tf>.
`<tf>` = the transformer the stage is showing (auto-picked: highest S.forecast_peak[tf].pct, or S.autopilot.target.worst).

MUST = on screen within the first 10 seconds. NICE = shown when room allows or as the stage cycles.

## The one-line story (deck slide 1, notes 0:00)

"A signed, bounded grid signal that home batteries, cars and heat pumps follow. The owner stays in control."
Headline on stage: **Gridzilla eats the peak.** Sub-line: **Every house keeps it on a leash.**

## Facts

| # | Fact a judge must leave with | Live field(s) | On-stage words (big, short) | Visual | Level |
|---|---|---|---|---|---|
| 1 | The problem: evening heat pumps + EVs push street transformers past their rating; noon solar pushes it backwards | S.aggregates[tf].load_pct, .rating_kw, .total_kw; S.forecast_peak[tf].pct; count of tfs with forecast_peak.pct >= 85 | "**135 %** of what this transformer can carry" / "**4** streets heading past the limit" | Apple Watch load ring: green < 85, orange 85-100, red > 100 (fills past 100 = red overlap). 3D transformer turns the same colour | MUST |
| 2 | With vs without Gridzilla: the gap is the product | S.aggregates[tf].baseline_kw (without) vs .total_kw (with), .rating_kw; H nodes[tf][].baseline_kw / .total_kw over .h | "Without Gridzilla **400 kW**" "With Gridzilla **224 kW**" "Limit **250 kW**" | THE money shot: live curve drawing as points arrive, grey dashed "without" keeps climbing, solid line bends under the red limit line; the gap shaded. Numbers tick | MUST |
| 3 | How much was taken off the transformer right now | baseline_kw - total_kw on S.aggregates[tf] (176 kW at 12:24) | "**176 kW** taken off this street" | Giant counter that ticks | MUST |
| 4 | Homes follow the signal | S.summary.shaped of S.summary.households (192 / 272), .online; S.summary.houses (2176 represented); households[*].ack.status in this feeder (applied / partial / refused) | "**192** of **272** homes following the plan" | Big number + a row/grid of house dots that turn green on ack.status applied, orange on partial | MUST |
| 5 | Every message is signed (Ed25519) and bounded (limits, never setpoints, time window) | S.active[seg].seq, .mode, .issued_at, .valid_to, .import_max_kw / .export_max_kw, .envelope; households[*].ack.verified | "Signal **#196** signed and sent" "Take at most **3 kW**" "until 22:30" | Step 4 of the AI strip lights; a short pulse travels transformer -> houses in 3D on a new seq | MUST |
| 6 | AI decides, a non-AI guard checks (deck: "AI proposes, guard disposes") | S.autopilot.stage: sense -> deepseek -> guard -> send -> idle; .last_trigger; .last_result.mode/.fields/.rationale/.latency_ms; .history[0].verdict (sent / refused / held / pending / none), .detail | Steps: "**Sees** 135 % at 20:38" "**Thinks** DeepSeek, 1.8 s" "**Checks** guard passed" "**Acts** signed, sent" | 4-step strip that lights in sync with autopilot.stage; refused/held shows the guard in red with .detail | MUST |
| 7 | A human can step in; owner always wins | S.autopilot.mode (auto / approve / off), .pending (proposal waiting for an operator); S.hb_paused; ack.status partial + reason (e.g. min_soc) | "Autopilot on. A person can take over any time." / "**Waiting for operator**" when pending / "Owner limits respected: **0** floors crossed" | One quiet line under the AI strip; pending = orange step 4 | MUST (one line) |
| 8 | The real plant in Blatnica runs on it | S.households.blatnica (real: true, kw 13, kwh 15, .telemetry, .ack, .registered); H devices real-powerplant-blatnica / vicare-blatnica (BLATNICA_DEVICE) | "**Blatnica** · real home, live" + battery %, grid kW, EV kW, heat-pump tank °C | BlatnicaTile.tsx (reuse): battery ring + 3 live numbers. Locally telemetry is null and history empty: show "Waiting for the plant" in grey, never a fake value | MUST |
| 9 | The flattening plan (SHAPE, the daily diet: per-slot ceilings for every house, renewed every 2 h) | F.plan: peak_naive_kw / peak_plan_kw, peak_naive_pct -> peak_plan_pct (129 -> 60 on atzgersdorf-1), level_kw (level L), shifted_kwh, cars_full, hours[] + naive_kw[] + planned_kw[] + other_kw[], import_max_kw[]; F.renewed_at; S.summary.shaped | "Peak **129 % -> 60 %**" "**224 kWh** of car charging moved to the night" "Every car full by morning" | 24 h curve: grey "every car charges at once" vs flat line at level L; percentage pair ticks. NOTE: /api/flatten has no hook in api.ts yet, add useFlatten(node) next to useHistory | MUST |
| 10 | Headline result (deck slide 8) | City plan: F?node=region:at plan.peak_naive_kw -> peak_plan_kw (33.7 MW -> 22.8 MW live now), shifted_kwh | Deck says "**97 -> 61 %** Vienna evening peak, 29.0 -> 18.1 MW"; on stage use the LIVE pair, never the deck's frozen numbers | One giant before -> after pair, Apple keynote style | MUST |
| 11 | Weather aware | W.now.temp_c, .cloud_pct, .sun_wm2, .wind_kmh; W.hourly[]; W.stale; S.scenario.name (cold-evening / sunny-noon / normal / live-weather) | "**12°** · cloudy · Wien-Liesing" "Cold evening: heat pumps on" | Sky, sun angle and clouds in 3D follow S.sim_hour + W.now.cloud_pct; solar panels glint by sun_wm2 | NICE (visible in scene) |
| 12 | Grid time runs (the day plays) | S.sim_hour (20.97), S.autopilot.sim_x (60x) | "**20:58**" grid time | Clock in the frosted top bar; sky follows it | MUST (small) |
| 13 | Devices that do the work | S.summary.ev_kw, .hp_kw; households[*].telemetry.soc, .ev_kw, .hp_kw, .grid_kw, .dhw_c | "**837 kW** of car charging held back" | 3D houses: battery fill = soc, EV glow when ev_kw > 0, heat pump fan speed = hp_kw; particles flow at kW speed, direction = sign of grid_kw | NICE |
| 14 | Scale | S.summary.households (272), .houses (2176), count of tf in S.tree (72); 2 real devices | "**272** homes · **72** transformers · **2** real devices" | Small footer counters | NICE |
| 15 | Six signal modes, one grammar | S.active[*].mode, S.recent[*].mode (SUPPORT, ABSORB, PREPARE, STRETCH, RECOVER, RELEASE, SHAPE) | Show only the mode in play: "**SUPPORT** · evening peak" from .note | Word on the step 4 card | NICE |
| 16 | Fail-safe: platform silent -> every house back to owner mode in 120 s | S.hb_paused; S.policy.heartbeat_s | "Heartbeat paused: homes back to owner mode" only when hb_paused is true | Houses fade to grey | NICE (event only) |

## Live numbers at write time (12:24 Vienna, cold-evening scenario)

tf:atzgersdorf-1: rating 250 kW, load_pct 90, without 400 kW, with 224 kW. Autopilot last: SUPPORT on sub:schwarzenbergplatz,
3 kW cap, 1815 ms, verdict sent, seq 196, worst tf:nordbahnhof-72 at 135 %. Summary: 272 households, 192 shaped, 2176 houses.
Flatten tf:atzgersdorf-1: 129 % -> 60 %, level 150 kW, 224 kWh of EV charging moved, cars_full true. Weather: 12.2 °C, 93 % cloud.

## Wording rules

- Plain words a grid expert gets in 10 s: "without Gridzilla", "with Gridzilla", "limit", "homes following", "signed and sent".
- Times as hh:mm grid time (hhmm()), power via nice(). No raw ids on stage: "tf:atzgersdorf-1" -> "Atzgersdorf" (plainTrigger / cleanText).
- Deck numbers (97 -> 61 %, -199 kW, 8.3 MWh, 3 GWh, 4.2 kW) are context for the speaker, not stage data. The stage shows live values only.
- No field -> no number. Missing data reads "Waiting for data" in grey; samples only behind ?sample and labelled "Sample".

## Speaker-note beats the stage must support (no clicks)

1. 0:00 "Real plant in Blatnica on the board right now" -> fact 8 visible.
2. 6:30 "Grey is what they would have drawn, blue is what they drew, red is the transformer. The gap is the product." -> fact 2, colours: grey dashed, solid, red limit.
3. 7:00 "Sleeps at 70 instead of 110 %" + water-filling, level L -> fact 9 / 10.
4. 5:30 "AI proposes, guard disposes" -> fact 6 lights up live.
