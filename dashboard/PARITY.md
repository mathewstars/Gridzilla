# Parity: dad's board vs the new operations console

Reference: `platform/static/index.html` (dad's board, read only). New console: `dashboard/src/ops/`.
Audited 2026-10-24 against main merged into `fm/gz-ui` (208841b), with the local stack on :8081.

Dad's board has **five tabs**: Presentation, Flattening, Autopilot, Manual, Households. "City" and "Log" are not
tabs of their own: they are panels inside Autopilot (heat map, log) and Presentation (city strip, ticker).

What the board loads (every 3 s): `GET /api/state?hh=<feeder|node|all>&fc=<selected>&tree=0|1`, every 2nd tick
`GET /api/history?nodes=…&devices=…&limit=120`, on the Flattening tab `GET /api/flatten?node=<selected>` (every
~30 s), every 20 ticks `GET /api/weather`. What it POSTs: `signal`, `advise`, `autopilot {mode}` / `autopilot {context}`,
`autopilot/review|approve|reject`, `scenario/<name>`, `heartbeat/pause|resume`, `replay/<seq>`.

Need: **must** = an operator or a judge loses something real without it; **nice** = helps, not essential; **no** =
fine to leave out. New-console places: `#/` Operations (Live city = HeatGrid, curve = TfCurve, Now panel = NowPanel
with AiCard + ActiveList, New signal drawer = Composer, What just happened = FeedStrip), `#/demo`, and the view tables
`#/city #/autopilot #/manual #/households #/plant #/weather #/log`.

## Header (on every tab)

| What it is | Data source | New console | Need | Suggestion |
|---|---|---|---|---|
| Grid clock "HH:MM sim" | `state.sim_hour` | TopBar clock "Grid 23:58" | must | done |
| Where you are: "Vienna · sub › feeder › tf" | tree path of the selected / story node | TfCurve subtitle "Stockerau feeder · Bisamberg" (only for the selected transformer) | nice | done for transformers |
| Last signed number "seq N" | `state.seq` | SignalCard aside "last signed #N" exists but SignalCard is not mounted; on `#/` only per-signal #N | nice | add "last #N" to the TopBar "signed today" chip |
| Heartbeat pill on / PAUSED | `state.hb_paused` | TopBar chip "Houses connected / Operator dark" + Pause/Resume | must | done |
| AI pill "DeepSeek · autonomous / operator approves / off" | `state.autopilot.mode`, `state.llm` | TopBar Autopilot Off/Propose/Auto + AiCard "Brain" | must | done |
| Tab switch, remembered in localStorage | local | Sidebar routes (hash) | must | done |

## Presentation tab (dad's default)

| What it is | Data source | New console | Need | Suggestion |
|---|---|---|---|---|
| Tile 1 SENSE: worst forecast % (+/−), which transformer, "forecast N min ahead", "trigger at ±85 % · every 15 grid min" | `forecast_peak` (worst by abs pct), `autopilot.horizon_min/trigger_pct/interval_s` | `#/demo` AiSteps "Sees" (short); `#/` AiCard "Target" line | must | put the four tiles on `#/` too (top of the Now panel), keep AiSteps on demo |
| Tile 2 DEEPSEEK DECIDES: mode → segment, rationale (110 chars), "answered in X s · N min · fields" | `autopilot.history[0]` `.mode .segment .rationale .latency_ms .duration_min .fields` | `#/demo` AiSteps "Thinks" (latency + mode name only); AiCard "Last call" (mode, segment, verdict) | must | add the rationale line and the fields under the step |
| Tile 3 GUARD: verdict (SENT/REFUSED…), detail, "deterministic policy, not AI" | `history[0].verdict .detail` | AiSteps "Checks" (Guard passed / refused + plain reason) | must | done on demo; add the "rule check, not AI" caption |
| Tile 4 SIGNED SIGNAL: seq, mode on segment, "N applied, M partial", "Ed25519 · MQTT over TLS" | last `sent` decision + households' `ack.seq/status` | AiSteps "Acts" (#seq signed, cap, homes); feed line "24 of 24 houses applied" | must | show applied / partial / refused split, not only homes |
| Active stage highlighted while the AI works | `autopilot.busy`, `.stage` | AiSteps lights the active step (demo only); AiCard "Next look: now, asking the AI" | nice | done |
| Countdown "next DeepSeek review N s" + mode word + Review now | `autopilot.last_run + interval_s`, `.mode`; POST `autopilot/review` | AiCard "Next look in 0:07" + "Look now" (`#/`); not on `#/demo` | must | add the countdown to the demo Now card |
| Full rationale line: time · DeepSeek on <segment>: <rationale> · trigger: <trigger> | `history[0].rationale .trigger .sim_h` | only in `#/autopilot` table ("What it saw", "Why"); on `#/` only for a waiting proposal | must | AiCard: show the last decision's rationale (two lines, expand on click) |
| Weather line: temp, feels, cloud, sun W/m², wind, gusts, official warnings, summary, "live weather drives the city" / scenario | `/api/weather` `now.*`, `warnings`, `summary`; `state.scenario.name` | TopBar chip (temp, place, warning icon); `#/weather` view (all of it, hourly) | nice | done (one click away) |
| Pin the story chart: follow autopilot / pin Blatnica / selected | `history` first `sent` segment; `households.blatnica.tf` | `#/` auto-picks the hottest covered transformer (useOps); demo picks the AI's target; no Blatnica pin | nice | demo: a "B" key or chip to pin Blatnica's transformer |
| Story chart: with Gridzilla (measured) vs without (baseline), orange = load taken off, rating, signal window band | `/api/history` node `total_kw`, `baseline_kw`; `tree.rating_kw`; `active` / `recent` window | TfCurve / demo Hero LiveCurve: With, Without, Peak eaten, Limit, signal window, plus the plan | must | done for a transformer |
| Same chart for a FEEDER, SUBSTATION or the WHOLE CITY (VIENNA chip; title in MVA) | history for `feeder:`/`sub:`/`region:at`; summed ratings | MISSING: TfCurve and Hero only take a `tf:` | must | let the curve take any node; add a "Vienna" chip above the heat grid and on demo |
| Delta "−X kW vs without Gridzilla · Y % of rating · 23:15 evening peak" | last history point `baseline_kw − total_kw`; `aggregates.load_pct`; time-of-day words | MISSING on `#/` (TfCurve renders LiveCurve with `header={false}`, which hides the kept-off number; its header shows live kW, %, limit) | must | show "kept off now X kW" beside live kW in the TfCurve header (`keptOff()` already exists) |
| Signal on this node: "SUPPORT active on X · seq · fields · until HH:MM" or "no active signal · last: mode seq … ended (reason)" | `active`, `recent[].ended_at/.ended` | active: Now panel ActiveList; last ended: `#/manual` "Recently ended" | nice | done |
| Blatnica real plant tiles: grid ±kW import/export/balanced; SoC % (15 kWh, owner floor 20 %); EV kW + station size, charging/idle; heat pump kW + tank °C → set °C + room set °C | `households.blatnica.telemetry` `grid_kw soc ev_kw ev hp_kw dhw_c dhw_set_c heat_set_c` | `#/plant` view (battery, grid, heat pump, car, hot water + set, mode, follows plan); not on `#/` or `#/demo`; room setpoint, station size, capacity / floor missing | must | small "Real house · Blatnica" card on `#/` (Now column) and on demo; add room setpoint |
| Blatnica age "live · updated N s ago · Cerbo GX + Vitocal via Gridzilla agents" | `telemetry.rx` | `#/plant` "Last reading" (wall time, not age); Sidebar green dot | must | show "N s ago" so a judge sees it is live |
| Blatnica grid kW chart, last 30 min | `/api/history` device `real-powerplant-blatnica` `grid_kw` | `#/plant` "Recent readings" table (12 rows), no chart | nice | a sparkline in the plant card |
| Blatnica signal + last reply: mode seq on node / owner mode · last ack status (reason) seq · signature ✓/✗ | `active` on its path; `blatnica.ack` | `#/plant` "Last reply to a signal" card (status, #, reason, signature); signal covering it missing | must | put it in the same Blatnica card on `#/` |
| City chips: VIENNA · each substation · each feeder, coloured by load, ● when a signal is on it; click selects the node | `tree`, `aggregates[].load_pct`, `active` | MISSING: HeatGrid selects transformers only; substation rows show "busiest N %" | nice | make substation and feeder names clickable (select the node for the curve) |
| City strip: 72 cells with % and colour, ring if under signal | `aggregates[tf].load_pct/.active` | HeatGrid on `#/` (richer); CityDots on demo | must | done |
| Strip hint: N transformers · over rating · under signal · households live · on the diet plan | `summary.online`, `summary.shaped` | HeatGrid header has transformers / over / near / under a signal / diet plan on N feeders; households live and houses on the plan missing | nice | add "2,168 houses on the plan · N homes reporting" to the HeatGrid header |
| Ticker "What happened": last 6 decisions with verdict, mode → segment, rationale | `autopilot.history` | FeedStrip: 3 newest events (decisions, log, acks), no rationale; `#/log` | nice | done (rationale lives in AiCard / Autopilot) |

## Flattening tab (the diet plan)

| What it is | Data source | New console | Need | Suggestion |
|---|---|---|---|---|
| Node picker: VIENNA / substation / feeder / its transformers | `tree`; refetch `/api/flatten?node=` | MISSING: the plan is fetched for the selected tf and for `region:at` only | must | same node picker as the curve ("Vienna" chip + clickable feeders) |
| Plan status: "SHAPE renewed HH:MM UTC · round N · every 2 grid hours" or "diet plan OFF"; N program houses, M with a car | `flatten.enabled/.renewed_at/.rounds`, `plan.houses/.ev_houses` | Feed line "Diet plan renewed for 24 feeders · 2,168 houses"; HeatGrid "diet plan on N feeders"; no round / OFF state | must | one line under the Tonight strip: "Diet plan on · renewed 23:58 · round 14" |
| Tile: peak without Gridzilla (kW/MW, % of rating) | `plan.peak_naive_kw/_pct` | HeatGrid tooltip "Diet plan: peak X % → Y %"; demo sentence | must | Tonight strip (`#/` and demo hero) |
| Tile: peak with the diet plan (kW, %, level L) | `plan.peak_plan_kw/_pct/.level_kw` | tooltip only; "The plan" line on the curve | must | Tonight strip |
| Tile: peak eaten (kW, % off the top, kWh from batteries) | `peak_naive_kw − peak_plan_kw`, `plan.shaved_kwh` | MISSING as a number ("Peak eaten" is only a legend swatch) | must | Tonight strip: "peak cut X kW (Y %)" |
| Tile: car charging moved into the night (kWh/MWh), every car full by 07:00 or "level raised" | `plan.shifted_kwh`, `plan.cars_full` | MISSING as a number ("Charging moved" swatch only) | must | Tonight strip: "X kWh moved to the night · all cars full by 7" |
| Tile: noon export level, kWh of battery room for PV | `plan.export_level_kw`, `plan.batt_kwh_free` | MISSING | nice | Flattening detail (new view or curve tooltip) |
| 24 h chart: without (cars charge on plug-in), with the plan, load nobody controls (other + base − PV), level L, rating, eaten fill | `plan.naive_kw/.planned_kw/.other_kw/.base_kw/.pv_kw/.level_kw/.rating_kw` | TfCurve future half: Without, The plan, Charging moved, Limit (transformer only); uncontrolled load and level L line missing; no city-wide version | must (city-wide) / nice (uncontrolled, L) | curve for any node fixes the city-wide case; add L as a labelled dashed line |
| Chart delta "X kW off the peak · 120 % → 84 % of rating" | same | MISSING | must | Tonight strip covers it |
| "How the monster eats a peak" 4 steps (sense; count flexibility: `ev_kwh`, `batt_kwh_usable`, `batt_kwh_free`; water-fill to L; send per-slot ceilings as one SHAPE per feeder, owner limits win) | `plan.*` | MISSING (HelpOverlay explains in words, no live numbers) | nice (judge) | a "How the diet plan works" section in a Diet plan view, or a help card with the live numbers |
| Monster paragraph ("Gridzilla is on a diet…") | `plan.*` | demo sentence "Peak coming at …: X %. Gridzilla is moving Y kW…" | nice | done in spirit |
| Transformers in this plan: each tf "naive % → plan %", worst without / worst with | `plan.tfs[]` | HeatGrid diet ring + tooltip per cell; no list, no worst summary | must (judge: "% of transformers kept inside") | `#/city` table: add "Tonight without / with plan, %" columns; Tonight strip "N of M streets kept under the limit" |

## Autopilot tab (dad's operator screen; holds the City and Log panels)

| What it is | Data source | New console | Need | Suggestion |
|---|---|---|---|---|
| KPI: kWh stored in program batteries | `aggregates["region:at"].kwh_available × represents` | MISSING | must | Tonight strip ("flex ready: X MWh in batteries") |
| KPI: inverter capacity in the program (kW) | `aggregates["region:at"].kw × represents` | MISSING | nice | `#/city` header stat |
| KPI: EVs charging now (kW) | `summary.ev_kw` | MISSING (per house only, `#/households`) | must | Tonight strip / HeatGrid header |
| KPI: heat pumps + boilers now (kW) | `summary.hp_kw` | MISSING | must | same place as EV |
| KPI: worst transformer % + name | max abs `aggregates[tf].load_pct` | HeatGrid "busiest N %" per substation; `#/city` sorted by load | nice | done |
| KPI: transformers over rating | count abs pct ≥ 100 | HeatGrid header; Sidebar City badge; `#/city` | must | done |
| KPI: active signals | `Object.keys(active)` | Now panel "Signals running N now"; Sidebar Manual badge | must | done |
| KPI: households online / total · houses represented | `summary.online/.households/.houses` | `#/households` header (Homes, Reporting, Houses represented) | nice | add to HeatGrid header |
| City heat map: substations × transformers, % + name, colour, signal ring, pulsing AI target, tooltip (kW of kVA, forecast peak at, mode, "DeepSeek's target") | `aggregates`, `autopilot.hotspots`, `autopilot.target.hot` | HeatGrid (`#/`) with tooltip, signal dot, diet ring; the AI-target pulse is MISSING | nice | outline the AI's target cells |
| City hint: N tf · over · near · under signal | computed | HeatGrid header | must | done |
| Selected feeder schematic: substation box (110/22 kV, kW), feeder (22 kV, kW), each tf box (kVA, kW, %, load bar with 100 % mark, program kW, kWh available, other houses, active mode), house circles (SoC or tank °, EV / HP flags, colour by mode / ack, ring = real) | `aggregates[sub/feeder/tf]`, `tree.other_houses`, `households[].telemetry/.ack` | MISSING (StreetCard 3D exists in `city/StreetCard.tsx` but is not mounted) | nice (judge likes it, operator uses the tables) | a "Feeder" card under the curve, or mount StreetCard; at least "program kW · kWh ready · houses" per tf in the curve header |
| Feeder dropdown + transformer tabs with % | `tree`, `aggregates` | HeatGrid click selects; feeder level not selectable | nice | covered by clickable feeders above |
| AI mode buttons Autonomous / Operator approves / Off | POST `autopilot {mode}` | TopBar Off / Propose / Auto | must | done |
| Review now | POST `autopilot/review` | AiCard "Look now" | must | done |
| Scenario buttons Normal / Cold evening / Sunny noon / Live weather | POST `scenario/<name>`; `state.scenario.name` | TopBar Normal / Cold / Sunny / Live weather | must | done |
| Loop hint: every N s · looks N grid min ahead · N min cooldown · max N per grid day | `autopilot.interval_s/.horizon_min/.cooldown_min/.max_per_day` | AiCard "looks every 15 s"; `#/autopilot` description (horizon, trigger); cooldown and max per day MISSING | nice | add both to `#/autopilot` header stats |
| Control-loop diagram: SENSE → TRIGGER → DEEPSEEK → GUARD → SIGN + PUBLISH → HOUSES, with values, live stage highlight, banner "AUTONOMOUS · no human in the loop, the guard is the brake" | `autopilot.*`, `history`, households acks | AiSteps (4 steps, demo only); TopBar mode | must (judge) | AiSteps on `#/` too (same four tiles as Presentation) |
| Target box: node, "N of M transformers past 85 % · worst X +Y % at HH:MM · Z kW over", covers (chips), DeepSeek may pick (chips), N more queued | `autopilot.target.node/.hot/.under/.worst/.worst_pct/.worst_at_h/.excess_kw/.choices/.others` | AiCard "Target": node, N of M, worst %, time; kW over, covers list, choices, queued MISSING | nice | add "Z kW over" and "N more queued" to the Target line |
| "Every transformer inside 85 % or already under a signal" / "Watching the forecast" | `autopilot.hotspots` | AiCard "Every transformer stays under 85 %…" | nice | done |
| Waiting proposal: mode → segment, duration, fields, rationale, Approve and send / Reject | `autopilot.pending`; POST `autopilot/approve|reject` | AiCard proposal block (+ guard tag, envelope sparkline); demo NowCard | must | done |
| DeepSeek error text | `autopilot.last_result.error` | MISSING (history "error" verdict shows as "AI error") | nice | show the error under "Last call" |
| Decisions list: time, verdict pill, mode → segment, N hot, duration, seq, DeepSeek latency, rationale + detail, envelope sparkline with kW range, "N transformer curves" | `autopilot.history[]` | `#/autopilot` table: time, what it saw, decision, outcome (#seq), latency, why; sparkline, duration, hot count, per-tf curve count MISSING | nice | add a sparkline + duration column |
| Operator note for DeepSeek + Set note | POST `autopilot {context}`; `autopilot.context` | AiCard note input + Save note; `#/autopilot` shows the note | must | done |
| Active signals: mode, segment, cohort k/n, fields, HH:MM–HH:MM, progress bar, seq | `active[]` | Now panel ActiveList (countdown, bar, wave k of n, fields, slots, sparkline, Release); `#/manual` table | must | done (better) |
| Transformer load chart: total load, program houses, rating, forecast (dashed), reverse rating | history `total_kw/.program_kw`; `forecast[sel]`; `tree.rating_kw/.reverse_kw` | TfCurve: with / without / limit / plan; program houses line and the raw forecast MISSING | nice | optional "program houses" line in the curve |
| Envelope chart: per-house ceiling per 15-min slot vs measured average program house; hint "mode seq on node · N × 15 min · active / ended" | `active[].envelope` or last `sent` decision envelope; device history `grid_kw` | MISSING (only sparklines) | must (judge: proof houses obey the curve) | an "Allowed box vs what houses did" card opened from an active signal row |
| Program households: SoC bars for up to 12 houses (offline = gap) | `households[].telemetry.soc` | MISSING as chart (numbers in `#/households`) | nice | skip, or mini bars in the Feeder card |
| Program households: grid kW lines per house + legend; "each simulated household stands for N real ones" | device history `grid_kw`; `represents` | MISSING chart; "×N" next to house names in `#/households` | nice | skip |
| Log: time, kind (colour by kind), message cut at 170 chars, full on hover | `state.log[]` | `#/log` view: time, kind tag, full message, filter by kind; FeedStrip plain-English lines | must | done |

## Manual tab

| What it is | Data source | New console | Need | Suggestion |
|---|---|---|---|---|
| Segment: any node incl. `region:at` | `tree` | Composer drawer: substation / feeder / transformer; whole city MISSING | nice | add "Whole city" level |
| Mode buttons PREPARE … RELEASE, fields per mode, mode resets duration (720/240/120) | MODE_FIELDS | Composer (plain names + code), same defaults | must | done |
| Fields import_max / export_min / export_max / charge_max / discharge_max / target_soc / max_soc_by | form | Composer, with units | must | done |
| Duration, Start in, Cohort k of n, Note to owners | form | Composer, validated | must | done |
| Sign and publish, "Guard refused: …" | POST `signal` | Composer (result line in words) | must | done |
| Advisor: situation text, Propose a signal, proposal (mode → segment, fields, minutes, rationale, guard ok / guard: …), Load into form | POST `advise` | Composer "Ask the AI" + question input + Load into form | must | done |
| Fail-safe demo: Pause heartbeat (outage), Resume, with the line "what the houses do when the DSO disappears or repeats itself" | POST `heartbeat/pause|resume` | TopBar Pause/Resume + tooltip; FailSafeCard (story text, "N homes listen") is written but NOT mounted | must (judge story) | mount FailSafeCard text in the Now panel, or show a banner while paused ("Operator dark: N homes back on owner settings") |
| Replay last signal (stale-seq test) | POST `replay/<max active seq>` | Composer "Replay last"; feed line "N houses refused the replayed old signal" | must | done; surface it next to Pause for the fail-safe story |
| Release a signal | (board: sign RELEASE by hand) | ActiveList "Release" button per signal | must | done (better) |

## Households tab

| What it is | Data source | New console | Need | Suggestion |
|---|---|---|---|---|
| Filter: selected node / whole city; search id or transformer; "N of M households · scope" | `/api/state?hh=<node|all>` | `#/households`: always whole city (loads in background) + text filter; Homes / Reporting / Houses represented | nice | add "Only the selected transformer" toggle |
| Household id + its devices (meter + heat pump agent), dot colour; real house bold and first | `households[].devices`, `.real` | name + ×represents, "Blatnica (real)"; device list and real-first sort MISSING | nice | sort real first by default |
| Transformer | `.tf` | yes | must | done |
| Battery SoC % (blank when the house has no battery) | `telemetry.soc`, `.kwh` | "Battery, % full" | must | done |
| Grid kW, signed +import / −export | `telemetry.grid_kw` | "From grid, kW" (sign shown, header says "from grid") | must | label "Grid, kW (+ in, − out)" |
| EV kW / charger size | `telemetry.ev_kw`, `.ev` | "Car charging, kW"; size MISSING | nice | "3.7 / 11" |
| Heat kW · HP or boiler · tank °C → set °C | `telemetry.hp_kw/.heat/.dhw_c/.dhw_set_c` | "Heat pump, kW" only; type and tank MISSING | must (boiler vs heat pump and tank temp are the comfort proof) | add "Heat" column: kW · type · tank → set |
| Mode (owner / signal mode / offline) | `telemetry.mode` | Mode tag | must | done |
| Last ack status (reason) | `ack.status/.reason` | "Last reply" + #seq + reason | must | done |
| Signature ✓ / ✗ / – (– = not registered, ✗ = verification FAILED) | `registered`, `ack.verified` | "Checked" / "Not checked" / – | must | say "Failed" (red) when `verified === false` on a registered house, "–" when unregistered; "Not checked" hides a failed check |

## Shown nowhere on dad's board

`GZ_SOC0` and grid-day boundaries are not shown on the board. "Signed today" (TopBar) and "yesterday" marks in
FeedStrip are new-console additions.

## MISSING and needed

**Operations view (`#/`)**
- A "Tonight" outcome strip under the top bar: peak without vs with the plan, peak cut kW and %, kWh of car charging moved to the night + "all cars full by 7", kWh from batteries, transformers kept under their limit (N of M), from `/api/flatten?node=region:at` and the selected node. Labelled in words.
- Curve for any node: feeder, substation and the whole city ("Vienna" chip, MVA), with vs without; make substation and feeder names in the heat grid clickable.
- "Kept off now: X kW vs without Gridzilla" in the TfCurve header (`keptOff()` exists; the header is hidden today).
- Diet plan status line: on / off, renewed at, round N, houses on the plan.
- City-wide live flex numbers: kWh stored in program batteries, EVs charging kW, heat pumps + boilers kW, homes reporting.

**Now panel**
- The four AI tiles (Sees, Thinks, Checks, Acts) as on demo, with the last decision's full rationale and the fields it sent.
- Signed tile with the split: N applied, N partial, N refused.
- Blatnica real-house card: grid, battery, car, heat pump + tank + room setpoint, "updated N s ago", signal covering it, last reply + signature.
- Fail-safe story in words (FailSafeCard is written but not mounted): what happens when the heartbeat stops, plus Replay next to it.
- Target extras: kW over the limit, how many more are queued.

**View tables**
- `#/households`: Heat column (kW · heat pump or boiler · tank → set), EV charger size, signature "Failed" vs "–" vs "Checked", real house first.
- `#/city`: tonight's peak without / with the diet plan per transformer.
- `#/autopilot`: envelope sparkline + duration per decision; cooldown and max-per-day in the header; last AI error text.
- `#/plant`: room setpoint, "N s ago", a small grid kW sparkline.

**A new view (Diet plan, or a card opened from a signal)**
- The full Flattening picture for any node: 24 h without / with / uncontrolled load / level L / rating, the 5 tiles (incl. noon export level and battery room), the 4 "how it works" steps with live numbers, and the per-transformer list naive % → plan %.
- Envelope proof: per-house allowed ceiling per 15-min slot vs what the houses really drew.

**Demo (`#/demo`)**
- Tonight strip in the hero (same numbers as Operations).
- "Vienna" whole-city curve option and a Blatnica pin.
- Next-review countdown and the last rationale in the Now card.
- Blatnica live tiles (the real house is the strongest proof for judges).
