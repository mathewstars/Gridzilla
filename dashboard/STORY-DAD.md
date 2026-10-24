# STORY-DAD: dad's new features on the stage (sync round, 24 Oct)

Contract for folding dad's commits f8c79c2, 07d19f3, 6856838, da6a3c9, 73d04ce, 175bd09, 70d9750 into A and B.
Same rules as STORY.md: every fact is a LIVE number or visual, never a paragraph. Fields checked with curl against
localhost:8081 at 13:05 UTC (sim hour 20.97, scenario cold-evening). Abbreviations as in STORY.md:
S = /api/state?hh=<feeder>&fc=<tf>&tree=1, H = /api/history, F = /api/flatten?node=<node>, W = /api/weather.
DECK = docs/Gridzilla-pitch.pdf (70d9750): static, always labelled as a deck figure, never animated as if live.

## Layout gate (captain's check, applies to everything below)

Every placement must fit at **1240x635** and **1022x884** as well as 1440x900 and 2560. Known bug at 1240x635 in B:
the small "With and without Gridzilla" card collides with itself (Limit line, "With Gridzilla" label, "Now 18:3x" and
forecast labels overlap) and the top-right ring card is clipped at the top. Rule for the new visuals: when a card is
too short for the curve plus labels, drop labels in this order (forecast label, "Now" time, series labels) and keep
the Limit line + one legend line; never overlap, never ellipsis. Check A and B at both sizes before "done".

## (1) The diet plan: HERO idea, "flatten the curve"

What it is: every 2 grid hours a deterministic planner water-fills each transformer and sends SHAPE (two ceilings per
house per 15-min slot, 24 h ahead) on its own channel, under any event signal (tighter ceiling wins). Since 73d04ce it
closes the loop: measured minus planned load (smoothed, clamped to 25 % of rating) is fed into the next plan as bias.

Live fields:
- F.enabled, F.rounds (22), F.renewed_at (ISO), F.sim_hour, F.shape_seq {feeder: seq}
- F.plan (tf, or aggregated for feeder / sub / region:at): rating_kw, houses (already x8), ev_houses, start_h,
  level_kw (L), export_level_kw (Le), ev_kwh, batt_kwh_usable, batt_kwh_free, shaved_kwh, shifted_kwh,
  peak_naive_kw, peak_plan_kw, peak_naive_pct, peak_plan_pct, cars_full, and 96-slot arrays hours[], other_kw[],
  base_kw[], pv_kw[], naive_kw[], planned_kw[]; tf plans also import_max_kw[], export_max_kw[] (per house);
  aggregated plans add tfs[] ({tf, rating_kw, level_kw, peak_naive_pct, peak_plan_pct, houses, ...}).
- F.plan.bias_kw (closed loop): in HEAD's flatten.py but NOT in the running 8081 response yet. Treat as optional.
- S.shape {at, rounds, enabled, feeders: 24}; S.summary.shaped (271 of 272); households[*].telemetry.shape (bool).
- Measured vs planned now: S.aggregates[tf].total_kw vs F.plan.planned_kw[k], k = floor(((S.sim_hour - start_h) mod 24) * 4).

Real JSON (F?node=tf:atzgersdorf-1, arrays cut to 4 of 96):
```json
{"node":"tf:atzgersdorf-1","sim_hour":20.97,"renewed_at":"2026-10-24T13:04:04Z","rounds":22,"enabled":true,
 "shape_seq":{"feeder:liesing-3":739,"feeder:favoriten-1":740},
 "plan":{"tf":"tf:atzgersdorf-1","rating_kw":250,"houses":24,"ev_houses":16,"start_h":20.97,
  "level_kw":150.5,"export_level_kw":62.4,"ev_kwh":224.0,"batt_kwh_usable":26.6,"batt_kwh_free":322.4,
  "shaved_kwh":26.6,"shifted_kwh":224.0,"peak_naive_kw":329.1,"peak_plan_kw":150.5,
  "peak_naive_pct":132,"peak_plan_pct":60,"cars_full":true,
  "hours":[20.97,21.22,21.47,21.72],"other_kw":[43.2,37.1,31.7,27.1],"base_kw":[86.4,14.4,14.4,14.4],
  "pv_kw":[0,0,0,0],"naive_kw":[150.7,51.5,46.1,41.5],"planned_kw":[150.5,150.5,150.5,150.5],
  "import_max_kw":[4.5,4.7,4.9,5.1],"export_max_kw":[4.4,4.1,3.9,3.7]}}
```
City now (F?node=region:at): 33.7 MW -> 22.8 MW, 113 % -> 76 %, 2,168 houses, 1,184 with a car, 16.6 MWh moved.

Gotcha: the plan starts NOW and runs 24 h, so tonight's peak sits at the END of the arrays (naive peak at hour 18.8
tomorrow). Draw it on a clock axis, not "next 24 h from the left", or the hero peak looks like it is in the past.
Negative values = export at noon; planned_kw is clipped at -export_level_kw (the noon floor).

On stage (big, short):
- "**Flatten the curve.**" (title) · "**132 % -> 60 %**" (peak_naive_pct -> peak_plan_pct, ticks)
- "**224 kWh** of charging moved into the night" (shifted_kwh) · "**Every car full by morning**" only when cars_full
- one small line: "New plan every 2 hours · round 22" (F.rounds) · "**2,168** homes on the plan" (S.summary.shaped 271 x 8, see (2))

Visual: the TARGET SHAPE is the hero. naive_kw = grey "without" hill; planned_kw = the flat target drawn as a
solid green plateau at level L (horizontal line labelled "L", the only label); the live measured line (H total_kw)
is pulled toward it: each new measured point eases onto the plateau. Rating = red limit line. Cars = the valley fill
under the plateau after 22:00 (blue fill = moved charging), batteries = the slice above L eaten (green).
- A (Keynote stage): becomes the main act after the signal story: full-width curve, the pct pair as the giant
  number, title "Flatten the curve." Story phase "flattened" switches to it. Use src/stage/a/feeds.ts useFlatten.
- B (Apple Home): PlanCard (src/stage/b/Cards.tsx) grows to the large card in the hero row; the with/without card
  stays small and must obey the layout gate. Green plateau + grey hill, pct pair top-left like Apple Energy.

## (2) Each simulated household stands for 8 real homes

Live fields: households[*].represents (8, incl. Blatnica), S.summary.households (272), S.summary.houses (2,176 =
272 x 8), S.summary.shaped (271), F.plan.houses / ev_houses (already x8), ratio r = summary.houses / summary.households
(AiSteps.tsx already does this). S.aggregates[*].devices / online / applied are DEVICE counts: multiply by r.

Honest wording: every "homes" number is x8: "**2,176 homes**", "**2,168 homes** on the diet plan" (271 x 8),
"**24 homes** on this street". Say it ONCE, small, near the first homes number:
"each simulated household stands for 8 real homes". Blatnica stays "**1 real home**" (its represents=8 is a model
weight, never say Blatnica is 8 homes). Do not show the deck's "8,070 houses represented": it does not match live
(2,176 program + 3,971 non-program other_houses = 6,147).
- A: one footnote line under the hero number. B: footnote in the scale/footer tile.

## (3) Staggered cohorts: the fleet fills in waves

How it works: a PREPARE, RECOVER or make-room ABSORB (max_soc_by set) without an explicit cohort is split by the
platform into n = 4 cohorts; cohort k's window starts k x (D/n) later, all end at the same deadline. A house is in
cohort k when parseInt(sha256(device id).hex[0:8], 16) % n == k (agent/sim-agent.js line 277).

Live fields: S.active[seg].cohort = [k, n] or null; .valid_from, .valid_to, .mode. S.active keeps only the LAST
cohort doc per segment (k = n-1): reconstruct the waves as step = valid_to - valid_from, cohort k starts at
valid_to - (n - k) x step. Log lines: S.log kind "signal", msg "... staggered over 4 cohorts, N min apart ...".
At 13:05 no cohort signal was active (autopilot sends SUPPORT, cohort null). So the waves are EVENT-ONLY.

On stage: "**Filling in 4 waves**" + "wave 2 of 4" (only while a cohort signal is active).
Visual: in the 3D street the houses light their battery fill in groups: group k = sha256(meterDevice(h)) % n, each
group starts at its window start (crypto.subtle.digest in the browser). No cohort signal = no waves; never fake one.
- A and B: same 3D street (Living3D); B adds the small "wave 2 of 4" line on the signal card.

## (4) Realistic EV charging: 55 % of nights, arrivals over three hours

Model facts (agent/sim-agent.js, platform/flatten.py): a car charges on 55 % of nights, 6-26 kWh (avg 16), arrives
in the 3 h after its plug-in time (17:00 -> 17:00-20:00); the planner's "without" curve uses the same cars
(EV_P_CHARGE 0.55, arrivals 17:00-21:30, 11 kW until full).

Live fields: households[*].telemetry.ev_kw (charging now), .ev (charger kW, 22 seen), S.summary.ev_kw (x8 already),
F.plan.ev_houses, F.plan.ev_kwh (= ev_houses x 16 x 0.55; 224 kWh on atzgersdorf-1).
On stage: small honest line under the curve: "A car charges on about half the nights, arriving 17:00 to 20:00".
Visual: in 3D, cars arrive one by one over the evening (only houses with ev_kw > 0 glow, so roughly half the cars
stay dark: that is real, not a bug). The "without" hill now ramps over 3 h instead of a cliff at 17:00.
- A and B: same; the line sits in the curve card's legend row (B) / under the hero curve (A).

## (5) STRETCH vision and the deck's measured numbers (DECK, static)

STRETCH, word for word (deck slide 4): "STRETCH · vision. Street is dark: grid-forming inverters island the street,
batteries are rationed until restoration, export locked to zero. Today's home inverters cannot form a grid; the
signal is ready for the ones that will"
Close (slide 15): "The vision: streets that island on grid-forming inverters when the 22 kV line is gone, rationed by
the same signal."
Slide 14: "Plus a tool for the outage: PREPARE before it, RECOVER after it, and with grid-forming inverters STRETCH
keeps a dark street alive from its own batteries"
Live hook: S.policy.max_stretch_window_min (4320 = 3 days). Stage words: "**STRETCH** · the vision: a dark street
islands on its own batteries" + "signal ready, up to 3 days". Never show STRETCH as active unless S.active has it.

Real vs modelled, slide 9 "What is real, what is modelled, and what the numbers mean", word for word:
- "−176 kW one street, Speising-22: 574 → 398 kW at the evening peak, 31 %, measured tonight"
- "−5.2 MW Vienna with 2,184 enrolled houses: 26.6 → 21.7 MW at the evening peak, 19 %, measured tonight"
- "0 kW on a street where no car charged tonight: the gap is the cars and the batteries, nothing else"
- "1 real house in the fleet tonight. The fleet is the part we are asking you to build"
- REAL TODAY: "Measured on streets with cars: 18-31 % off the evening peak, inside what published smart-charging and
  home-battery pilots report (3-6 kW per EV house, 1-2 kW per battery at the peak)"
- MODELLED: "Program houses carry ~30 % of a street's evening load here: a 2030 picture, not a street today"
Honest label: these were measured on the running SIMULATED fleet, not in Blatnica. Label: "Measured on the fleet run,
24 Oct (deck)". Only the control path is real in Blatnica.
Headline result, slide 8 "The monster is on a diet: water-filling flattens every street", word for word:
"79 → 45 % the planner's forecast for tonight, of transformer rating: 23.7 MW becomes 13.4 MW. Measured result on the
next slide" · "10.5 MWh of car charging moved from dinner into the night valley; every car full by 07:00".
Rule: the hero pct pair on stage is LIVE (F region:at); the deck pair appears only as a small labelled footnote.
Deck slide 3 still says "Four-hour maximum"; live policy is 24 h (max_window_min 1440): do not quote the 4 h.
- A: STRETCH as the final beat ("The vision"), deck numbers as one quiet "measured on the fleet run" row.
- B: STRETCH as one tile in the signals row (grey "vision" state); deck row as a small footnote tile.

## (6) Other new things from the board and platform

- Board Flattening tab and strip: "{summary.online} households live · {summary.shaped} on the diet plan" and
  "each simulated household stands for {represents} real ones". Carry the shaped count (x8) into A and B, see (2).
- Live weather is now the default, persisted scenario (175bd09): S.scenario.name ("cold-evening" right now, so a
  presenter may have switched it); the planner uses W's hourly solar forecast. Show "Real Vienna weather" only when
  S.scenario.name == "live-weather", else show the scenario name in plain words ("Cold evening test").
- Autopilot judges "event over" on the counterfactual (73d04ce): a cap holding the peak is not released into it.
  No new field; it shows as the curve staying flat. Nothing to add on stage.
- Signal modes now include PREPARE and RECOVER; SHAPE has its own channel; windows up to 24 h, STRETCH up to 3 days
  (S.policy.max_window_min, max_stretch_window_min).
