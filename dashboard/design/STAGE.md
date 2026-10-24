# STAGE: the visual spec of the ONE Gridzilla stage

One stage replaces A (index.html) and B (b.html). It keeps A's clear structure, B's live street (smaller), B's plan card,
puts dad's diet plan (SHAPE) at the centre of the hero chart, and shows the five things the judges score as live facts.
Content contracts stay in STORY.md and STORY-DAD.md; Apple tokens stay in APPLE-R2.md and src/stage/palette.ts; QA hooks in
qa/README.md. Where this file and APPLE-R2.md disagree, this file wins (it is newer and merges both directions).

Design read: a self-playing keynote screen for hackathon judges and grid engineers, Apple product-page and Home-app
Energy language, light only, built on CSS grid + container queries + Motion + react-three-fiber.
Dials: variance 5 (one strong asymmetric hero, calm everywhere else), motion 5 (only data moves), density 5.
Nothing on the stage is clickable. Keys stay invisible (1-4 scenarios, left/right transformer, F fullscreen).

Sources used for this spec (list them again in DESIGN.md): skills website-design, design-taste-frontend, frontend-design,
ui-ux-pro-max, dataviz (form choice, mark specs, anti-patterns). 21st.dev: unlumen "Animate Digits" (id 20071),
kokonutd "Apple Activity Ring" (id 3223), hihahihahoho "Circle Progress" countdown variant (id 1737), danielpetho
"Number Ticker" (id 20459), uilayout "Stats Bento" (id 25311), isaiahbjork "BJORK Live line" (id 39720), uiable
"Chart Area" two-series comparison (id 30819). Judges' brief docs/Challenge-Grid-Serving-Storage_EN.docx, README.md,
protocol/PROTOCOL.md, docs/implementers.md, docs/architecture.html. Renders reviewed: .review/r2-A-*, r2-B-*,
/tmp/gzgate/smoke/now-*.

## 1. What the renders taught us (keep / kill)

| Seen | Verdict |
|---|---|
| A: headline + ring + "112 kW taken off this street" + full curve with green gap + Sees/Thinks/Checks/Acts (r2-A-1440x900) | KEEP the structure and the reading order. It is the clearest screen we have. |
| A: "With" line and "With 281" text in blue, step names in blue | KILL. Blue means interactive and the stage has nothing interactive. Text never wears a series colour (dataviz). The "with" line is ink. |
| A at 390x844: "111 -> 90 %" and "33.7 -> 22.9 MW" on one row run off the screen; "Now" and "Forecast" print on top of each other | KILL. Two number pairs never share a row under 34rem; chart labels go through the placer (section 7.1). |
| B: the 3D street as a living picture (r2-B-1440x900) | KEEP the idea, at roughly 40 % of B's size, with real CC0 houses (section 9). |
| B: huge grey box houses dominating the stage | KILL. |
| B: the small "With and without" card, a pile of overlapping labels at 1240x635 | KILL the card. There is ONE curve on the stage, the hero chart. |
| B at 1240x635: ring card cut at the top, AI and plan cards cut at the bottom | KILL every fixed row height. Rows grow with content; a short window scrolls (section 5). |
| B: "The plan for tonight" card with 174 % -> 75 % | KEEP as a numbers-only card; its curve now lives in the hero chart. |
| B: rows of green home dots, coloured dots before every AI step | KILL (status-dot rows are banned). A green check marks a done step, nothing else. |

## 2. Information hierarchy (what a judge reads, in order, within 10 s)

1. **The claim, top left (0-3 s).** The story sentence ("Gridzilla is flattening the peak.") and the ONE hero figure:
   "**176 kW** taken off this street right now". Load ring beside it: "70 % of its limit; without Gridzilla 112 %".
2. **The proof picture (3-6 s).** The hero chart to its right: grey dashed "without" hill crossing the red limit, the ink
   "with" line staying under it, the green gap between them, and from "Now" onward the **green diet-plan plateau** (the
   target shape) that the live line is pulled onto. The signal's time window sits on the time axis as a draining bar.
3. **The judges' five (6-10 s).** One strip of five live facts directly under the hero: time-limited signal (countdown),
   owner in control, nothing curtailed, no transformer upgrade needed, any vendor (Victron + Viessmann in Blatnica).
4. **How it works (second look).** Sees / Thinks / Checks / Acts with the guard, the living street, the plan numbers.
5. **Context (glance).** Frosted bar: grid clock, scenario, weather, "Autopilot on".

Rule: exactly one hero figure per view (the kW taken off). Everything else is display size or smaller.

## 3. The judges' five, each a live fact (no paragraphs)

Every value carries `data-src` / `data-val` (qa/README.md). `S` = /api/state?hh=<feeder of tf>&fc=<tf>&tree=1,
`F` = /api/flatten?node=<tf>, `Fc` = /api/flatten?node=region:at, `r` = S.summary.houses / S.summary.households (8).
`tf` = the transformer on stage (useStory pick). `sig` = signalOn(S, tf).

| # | Criterion (brief) | Big value | Label (one line) | Small line | Live source | No-data state |
|---|---|---|---|---|---|---|
| P1 | DSO steers only in exceptional situations, **for a limited time** | `1:12` + "h left" (grid time, digits roll each grid minute) | "Signal #196 ends 22:30, then owner mode" | "Never longer than 24 h" | remaining = (Date.parse(sig.valid_to) - serverNow) / 60000 x S.autopilot.sim_x grid min; serverNow = Date.parse(S.now) + (performance.now() - receivedAt); total = (valid_to - valid_from) same way; end = hhmm((S.sim_hour + remaining/60) % 24); cap = S.policy.max_window_min / 60 (STRETCH: max_stretch_window_min) | No event signal: big "None" in tertiary, label "No event signal: owners decide", small "Last one ran 2 h, ended 19:44" from S.recent |
| P2 | **The owner stays in control** | `21 of 24` homes | "follow the signal; owner limits always win" | "3 kept their battery reserve" (count by ack.reason: min_soc = "battery reserve", owner_limit = "own limit", opt_out = "opted out"); none: "No owner had to say no" | S.households[h].tf == tf: ack.status applied vs partial/refused with reason; counts x r | "Waiting for replies" grey |
| P3 | **Curtailment avoided** | `0 kW` | "cut off right now" | "Without Gridzilla: 1.2 MW over the limit on 9 streets" | with = sum over tfs of max(0, abs(total_kw) - limit), without = same with baseline_kw; limit = rating_kw for import, reverse_kw for export (S.tree); street count = tfs with baseline over limit | both 0: big "0 kW", small "No street near its limit right now" |
| P4 | **Grid expansion deferred** | `9` | "transformer upgrades not needed tonight" | "Tonight's peak fits the rating with the plan" | Fc.plan.tfs[]: count(peak_naive_pct > 100 and peak_plan_pct <= 100) | count 0: big "68 of 72", label "transformers inside their rating with the plan" |
| P5 | **Interoperable profile any vendor can implement** | "Victron + Viessmann" (head size, the one text value) | "real home in Blatnica, same signed signal" | "Signed replies: 271 of 271 verified" | S.households.blatnica: devices real-powerplant-blatnica (Victron), vicare-blatnica (Viessmann, brand names = registry labels, `data-src="deck" data-label="registry"`), telemetry.rx age, ack.verified; verified count = households with ack.verified true / with an ack | Plant silent: label "Blatnica: waiting for the plant" in tertiary, never a fake value |

Field gaps (ask the platform owner, do not fake): ack.curtailed_kwh is not copied into households[*].ack (needed for noon
"solar kept, not curtailed"); the fleet's vendor mix (GoodWe, Huawei, SMA, Fronius in registry.yaml) is not in any stage
endpoint. Until they exist P3 shows kW over the limit only and P5 names the two real brands only.

## 4. Merged screen, card by card

| Area | Content | From |
|---|---|---|
| `bar` | "Gridzilla" left; grid clock `20:58` (rolling digits) + scenario in plain words centre; right: "12° Cloudy" + "Autopilot on" (or "Waiting for operator" in orange when autopilot.pending) | A + B |
| `story` | story sentence (state-driven, STORY.md wording), "Atzgersdorf, 24 homes on this street", hero figure kW taken off, load ring with with/without % | A |
| `curve` | legend row above the plot, then the hero chart: past measured with vs without + green gap, Now, future diet plan (naive hill vs green plateau at L), limit, signal window band | A curve + dad's SHAPE |
| `proof` | the judges' five, one white tile with five columns (not five cards) | new |
| `ai` | Sees / Thinks / Checks / Acts + one quiet line "A person can take over any time" | A (kit/AiSteps) |
| `street` | the 3D street, small card, name overlay top left, footnote "each simulated household stands for 8 real homes" | B, refined |
| `plan` | "Diet plan for tonight": 132 % -> 60 %, 224 kWh moved into the night, every car full by morning, new plan every 2 h (round 22), 2,168 homes on the plan, city 33.7 -> 22.8 MW | B PlanCard + STORY-DAD |

Deck figures (STORY-DAD 5) and STRETCH appear only as one tertiary footnote line in `plan` when it has room, labelled
"Measured on the fleet run, 24 Oct (deck)". Never animated, never the hero.

## 5. Layout

### 5.1 Mechanism (applies to every size)
- One page grid inside `main.stage { container: stage / inline-size; min-height: 100dvh; }`. Never `height: 100vh`,
  never `overflow: hidden` on anything that holds text. If content needs more height than the window, the page scrolls.
- Rows are `auto` or `Nfr` (which is `minmax(auto, Nfr)`), never `minmax(<length>, 1fr)` and never a fixed px height:
  a row can never be shorter than its content, so nothing clips. Minimum sizes live on the cards (`min-height`).
- Charts and the 3D canvas are `position: absolute; inset: 0` inside a sized box, so they never push their own box
  (no ResizeObserver feedback loops). The box has the minimum size; the drawing fills whatever the grid gives it.
- Every card is `container-type: inline-size` and switches its inside layout with its own `@container` queries.
- Page gutter: `clamp(16px, 2.2vw, 56px)`; gap between cards: `clamp(12px, 1.1vw, 24px)`; card padding
  `clamp(16px, 1.6vw, 36px)`. Card radius 28px for `curve`-sized tiles, 18px for the rest and on phones.

### 5.2 Class (a): >= 1440x900, one screen, no scroll
12 columns. The mins below add up to about 50rem + bar (852 px at 1440x900, 1242 px at 2560x1440, 988 px at
1920x1080), so these sizes fit one screen; the `fr` split hands out the rest.

```css
@container stage (min-width: 1180px) {
  .grid {
    grid-template-columns: repeat(12, minmax(0, 1fr));
    grid-template-rows: 5fr auto 3fr;
    grid-template-areas:
      "story story story story story curve curve curve curve curve curve curve"
      "proof proof proof proof proof proof proof proof proof proof proof proof"
      "ai    ai    ai    ai    street street street street plan plan plan plan";
  }
  .curve  { min-height: 25rem; }   /* plot >= 520 x 300 px at 1440 */
  .story  { min-height: 25rem; }
  .ai, .street, .plan { min-height: 13.5rem; }
}
/* .stage keeps min-height: 100dvh only (never height): the fr rows fill exactly one screen when the mins fit,
   and grow (page scrolls) when they do not. One screen at >= 1440x900 is a G3 check, not a CSS clamp. */
```

```
1440 x 900
+---------------------------------------------------------------------------------------------------+
| Gridzilla                       20:58  Cold evening test                    12° Cloudy  Autopilot on |  52 frosted
+---------------------------------------------------------------------------------------------------+
| Gridzilla is flattening       | [ink] With 224 kW  [- -] Without 400 kW  [green] Plan 150  [red] Limit|
| the evening peak.             |                                                                    |
| Atzgersdorf, 24 homes         |  Limit 250 kW -------------------------------.--- red --------------|
|                               |            ...without....  /\               |   /''''\ (grey hill)|
|  176 kW        (( ring ))     |  ___ink with____/ \_green gap   Now 20:58 |=====plan L=====green  |
|  taken off this street        |                                            |                       |
|  right now      70 % of limit |  15:00     18:00     21:00     00:00     03:00     06:00     09:00   |
|                 without 112 % |  [####signal #196 until 22:30 ==---]      (axis band, outside plot) |
+-------------------------------+--------------------------------------------------------------------+
|  1:12 h left      | 21 of 24 homes      | 0 kW          | 9               | Victron + Viessmann    |  proof
|  Signal ends 22:30| follow; owner wins  | cut off now   | upgrades not    | real home in Blatnica  |  strip
|  [=====-------]   | 3 kept reserve      | w/o: 1.2 MW   | needed tonight  | 271 of 271 verified    |
+-------------------+--------+------------+---------------+-----+-----------+------------------------+
| Sees       Thinks          | [3D street, 12 houses, kiosk]    | Diet plan for tonight            |
| 135 %      DeepSeek 1.8 s  | Atzgersdorf                      | 132 % -> 60 %                    |
| Checks     Acts            |                                  | 224 kWh moved into the night     |
| Guard ok   #196 signed     | each household = 8 real homes    | every car full by morning        |
+----------------------------+----------------------------------+----------------------------------+
```

At 1680x1050, 1920x1080 and 2560x1440 the same template; the root font clamp (`clamp(15px, .55vw + 8px, 23px)`)
scales type and mins together, so proportions hold and the hero chart gets the extra pixels.

### 5.3 Class (b): 1024-1439 wide, or any window shorter than the one-screen mins (1240x635, 1024x600, 1022x884)
The page scrolls; nothing clips, nothing shrinks below its minimum.
- 1180-1439 wide (1280x800, 1240x635): the class (a) template unchanged; the mins exceed the window, so rows take
  their mins and the page scrolls. At 1240x635 the first screen shows bar + story + hero chart (375 px) + the top of
  the proof strip: the money shot is always above the fold.
- 600-1179 wide (1022x884, 1024x600): 6 columns, chart full width.

```css
@container stage (min-width: 600px) and (max-width: 1179px) {
  .grid {
    grid-template-columns: repeat(6, minmax(0, 1fr));
    grid-template-rows: auto auto auto auto auto;
    grid-template-areas:
      "story  story  story  story  story  story"
      "curve  curve  curve  curve  curve  curve"
      "proof  proof  proof  proof  proof  proof"
      "ai     ai     ai     ai     ai     ai"
      "street street street plan   plan   plan";
  }
  .curve { min-height: 22rem; }
  .street, .plan { min-height: 15rem; }
}
```

```
1022 x 884 (scrolls)
+------------------------------------------------------------+
| Gridzilla              20:58 Cold evening       Autopilot on|
+------------------------------------------------------------+
| Gridzilla is flattening the peak.  | 176 kW   (( ring ))   |  story: sentence left, figure + ring right
| Atzgersdorf, 24 homes              | taken off right now   |
+------------------------------------------------------------+
| legend (wraps to 2 lines)                                  |
| hero chart, plot >= 360 x 260                              |
+------------------------------------------------------------+
| proof: 5 columns while each >= 11rem, else 3 + 2           |
+------------------------------------------------------------+
| Sees | Thinks | Checks | Acts   (4 across)                 |
+-----------------------------+------------------------------+
| 3D street (16:10)           | Diet plan for tonight        |
+-----------------------------+------------------------------+
```

### 5.4 Class (c): phones 360-430 wide, stacked
```css
@container stage (max-width: 599px) {
  .grid { grid-template-columns: minmax(0, 1fr);
          grid-template-areas: "story" "curve" "proof" "ai" "plan" "street"; }
  .curve  { min-height: 19rem; }   /* plot >= 280 x 200 px */
  .street { aspect-ratio: 16 / 10; min-height: 13rem; }
}
```
- Bar 44px: "Gridzilla" + clock only. Gutter 16px. Cards radius 18px.
- Story: sentence, place line, hero figure with the ring beside it when the story card is >= 21rem wide, else ring
  under the figure. Ring 5.5rem.
- Chart: legend 2 lines above the plot, window 12 h (now -3 h to now +9 h), x ticks every 3 h, labels kept: Limit, Now.
- Proof: 2 columns; P1 (countdown) spans both columns and comes first; P5 spans both (its value is text).
- AI: 2 x 2. Plan: number pairs stacked, never side by side. Street last, below the fold, paused until visible.
- 360x740 and 390x667 use the same layout; nothing depends on height.

### 5.5 Per-card container breakpoints
| Card | Breakpoint (card width) | Change |
|---|---|---|
| story | < 34rem | figure and ring stack; sentence max 3 lines (`text-wrap: balance`) |
| story | >= 40rem and class (b) | two columns: sentence left, figure + ring right |
| curve | plot < 520px wide | x ticks every 6 h (3 h on phone window), drop "Gridzilla acted" marker label |
| curve | any | the card min-height (section 7.1) guarantees the minimum plot; the plot is never squashed below it |
| proof | each fact < 11rem | `grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr))` wraps to 3 + 2, then 2 columns |
| ai | < 30rem | 2 x 2; >= 44rem 4 across |
| plan | < 22rem | city line and deck footnote drop; pairs stack |
| street | < 18rem tall | footnote hides (it is repeated nowhere essential) |

## 6. Type (rem; root clamps 15-23 px, 16 px at 1440)
| Token | font-size | Use | line-height / tracking |
|---|---|---|---|
| hero | `clamp(3.25rem, 2.2rem + 4.6vw, 8rem)` | the ONE figure (kW taken off) | 1.0 / -0.02em, proportional figures |
| display | `clamp(2.25rem, 1.4rem + 2.2vw, 5rem)` | plan pair, proof values (in tiles: `clamp(1.75rem, 14cqi, 2.75rem)`) | 1.05 / -0.015em |
| head-xl | `clamp(1.75rem, 1rem + 2vw, 3.5rem)` | story sentence, max 3 lines | 1.07 / -0.005em |
| head | `clamp(1.5rem, 1rem + 1vw, 2.5rem)` | AI step values, ring centre | 1.1 / 0 |
| title | `clamp(1.125rem, .9rem + .45vw, 1.75rem)` | card titles, AI step names | 1.14 / .007em |
| body | 1.0625rem | labels under numbers | 1.47 / -0.022em |
| small | .875rem | axis ticks, footnotes; smallest on stage (5 m rule at 1440) | 1.43 / -0.016em |
Weights 600 for numbers and headings, 400 for body. Units after a number at 0.5em, 600, secondary. `tabular-nums` only
on the clock, the countdown, axis ticks and the AI values (they change in place); hero and display figures stay
proportional (dataviz). No uppercase, no eyebrows, no ellipsis, no line-clamp: shorten or wrap. No em dashes.

## 7. Dataviz rules per element

### 7.1 Hero chart (one per stage; the only curve)
- Form: line chart over grid clock time, past + future on one axis; one y-scale in kW (no dual axis).
- X domain: now -6 h to now +18 h (phone: -3 h to +9 h), clock labels `hh:00` every 3 h (6 h when the plot < 520 px).
  The plan arrays start at now; draw them by their own `hours[]` on the clock axis (STORY-DAD gotcha).
- Y domain: min(0, lowest value) to 1.08 x max(limit, highest "without" value), eased over 0.8 s, never jumping.
  Ticks: 0 and one round value; hairline gridlines `rgba(0,0,0,.06)` solid; tick text small tertiary, right side.
- Marks (palette.ts):
  - With Gridzilla (H nodes[tf].total_kw, past): ink, 2.5px, round caps; end dot r 5 with 2px surface ring at Now.
  - Without Gridzilla (H baseline_kw past, F.plan.naive_kw future): tertiary 2px dashed `6 5`; the part above the
    limit turns red (dashed stays, colour carries "over").
  - Diet plan target (F.plan.planned_kw from Now): green 2.5px solid plateau at L. This is the hero idea: the live
    line ends at Now and the green plateau continues from it, so the eye reads "the street is held to this shape".
  - Energy moved: green wash 12 % between without and with (past) and between naive and planned (future, both the
    eaten hill above L and the filled car valley below it). One colour, one meaning: Gridzilla moved this energy.
  - Limit: red 1.5px solid line across the plot (reverse limit at -reverse_kw only when the domain goes below
    -0.5 x reverse_kw, noon export).
  - Signal window: a 4 % ink band in the plot from valid_from to valid_to, and in the axis band under the ticks a 6px
    rounded bar: elapsed part ink, remaining part fill `#e8e8ed`, same graphic as P1 so the two read as one thing.
  - Now: 1px ink 25 % vertical line, full plot height.
- Legend: always present, one row ABOVE the plot, outside it: short line keys (ink solid, grey dashed, green solid,
  red solid) + label in secondary + live value in ink: "With Gridzilla 224 kW", "Without 400 kW", "Diet plan 150 kW",
  "Limit 250 kW". Wraps to two rows; never overlaps the plot. Text never in the series colour.
- Direct labels in the plot, placed by kit/layout.ts `placeLabels` in this priority, each with 2 to 4 candidate spots
  (above/below, left/right of the anchor), dropped when no spot is free, never nudged off their anchor:
  1. "Limit 250 kW" at the right end, above the line (alt: below); short form "250 kW".
  2. "Now 20:58" at the top of the Now line (alt: left of it); short form "Now".
  3. "Plan 150 kW" on the plateau just right of Now.
  4. "Without Gridzilla 132 %" at the apex of the future hill (alt: the past baseline maximum).
  5. "Gridzilla acted 19:16" at the newest signal start.
  Drop order when tight is the reverse (5, 4, 3, 2); Limit always stays (STORY-DAD layout gate). Axis tick labels are
  placed first and block the area they occupy. Labels are SVG `<text>` measured with `textW`, never HTML on top of SVG.
- Minimum plot: 520 x 300 px (class a), 360 x 260 (class b), 280 x 200 (phone). The card keeps the axis band and the
  legend inside its own min-height (no nested scroll, dataviz anti-pattern).
- No tooltips (nothing is interactive on a stage). A visually hidden `<table>` twin lists the last 6 h and the plan
  hourly for screen readers; `aria-label` states the insight ("Peak 132 % without, 60 % with the plan").

### 7.2 Load ring (story)
- Form: meter against a limit, two laps like Apple Watch: outer = without Gridzilla, inner = with Gridzilla.
- Arc colour `loadTone(pct)` per lap (green < 85, orange 85-99, red >= 100); track = the same hue at 18 %.
  Past 100 % a second lap draws on top in red, its start cap with `drop-shadow(0 0 2px rgba(0,0,0,.35))`.
- Stroke 12 % of the diameter, round caps, starts at 12 o'clock. Size `clamp(5.5rem, 22cqi, 10rem)`.
- Centre: "70" head + "%" at 0.5em, ink. Beside it (below when narrow): "of its limit now" and "Without Gridzilla
  112 %", both ink/secondary with a small ring-arc key, never coloured text. Colour never stands alone.

### 7.3 Countdown (P1) and window bar
- Form: meter. Big digits `h:mm` + "h left", the digits that change roll (Animate Digits). Under it the window bar:
  12px tall, radius 6, elapsed ink, remaining `#e8e8ed`, a 2px surface gap between the two parts. Updates every real
  second from the clock offset, re-anchored on each /api/state poll; the bar empties to the left as time runs out.
- At 0 the tile switches to the no-signal state within one poll, never shows negative time.

### 7.4 Stat tiles (proof strip, plan card)
- Contract (dataviz): label sentence case, value 600 proportional, unit at 0.5em secondary, optional one small line.
  Values in ink; the only coloured values are load percentages in `loadTone` (plan pair: 132 % red, 60 % green) and
  always with the word or arrow next to them. No sparklines (the hero chart carries the trend).
- Five facts share ONE tile with five columns separated by space only (no hairlines, no dividers). Columns align
  their value baselines.
- Number pairs ("132 % -> 60 %", "33.7 -> 22.8 MW") use a real arrow glyph in tertiary between the numbers and stack
  vertically when the card is < 22rem.

### 7.5 AI steps
- Four steps in reading order. Step name in title: ink when done or active, tertiary when waiting. A done step gets
  a green check (Phosphor `CheckCircle` fill, the only icon on the stage); a refused or held guard gets a red
  `XCircle` and its `.detail` line. Values in head, ink; one secondary line each. No coloured dots, no blue.

## 8. Colour meaning (src/stage/palette.ts, unchanged)
- Ground `#f5f5f7`, card `#fff`, ink `#1d1d1f`, secondary `#6e6e73` (5.0:1 on white: the floor for text that matters),
  tertiary `#86868b` (axis ticks, waiting states, footnotes only), fill `#e8e8ed` (tracks).
- green = inside the limit / energy moved / done; orange = peak building (85-99 %) / waiting for operator;
  red = over the limit (either direction), refused by the guard. Blue does not appear on the stage.
- `loadTone(pct)` for every load colour, so ring, transformer kiosk, chart segment and plan pair agree.
- Banned: gradients (except the 3D sky, which is data), glows, coloured borders, pills/chips, status-dot rows, dark mode.

## 9. 3D street card (smaller, premium)
- Kenney "City Kit (Suburban)" CC0 glTF (fallback Quaternius CC0): 12 houses in two rows facing a street, pitched
  roofs, windows, a driveway car per EV house, panels on the PV houses, one green substation kiosk at the street end.
- Camera FOV 30, pulled back so houses fill at most 55 % of the card height; slight top-down angle (about 35 deg).
- Soft hemisphere light + one sun whose height follows grid time; `ContactShadows` (drei) under the houses; matte
  materials (roughness 0.8), no outlines.
- Data on the models only: kiosk body mixes 60 % `loadTone`; battery box fill = SoC; car glows only when ev_kw > 0
  (about half stay dark, that is real); particles along wires in the real power direction, speed 0.4 + |kW| / 20;
  one pulse from kiosk to houses on a new signal seq; cohort waves only while a cohort signal is active.
- Overlay: transformer name (title) top left; footnote small bottom left. Ink text, white when the sky is night.
- Performance: dpr [1, 1.75], `frameloop` "never" when the card is off-screen (IntersectionObserver) or the tab is
  hidden, >= 50 fps at 1440x900 (G5). `window.__gz3d.frames` counts frames (qa/README.md).

## 10. Motion (every move is a data change)
- Numbers: Motion `useSpring` (stiffness 90, damping 24) on the value, formatted into the text node, never React
  state per frame. Clock and countdown digits roll per changed digit (0.35 s).
- Hero chart: the "with" line extends to each new point over the poll interval (linear), the plateau re-draws only
  on a new plan round (`F.rounds`), the y-domain eases. Ring arcs spring 1.2 s `cubic-bezier(.25,.1,.3,1)`.
- AI steps light with `autopilot.stage`; a new decision replays them 0.3 s apart once.
- Transformer switch (useStory, >= 45 s stay): crossfade story + chart + street 0.6 s. No entrance animations, no
  loops without data, no hover effects. `prefers-reduced-motion`: values jump, particles and pulses stop.

## 11. QA hooks (G2, G3)
- Every card root: `data-card="story|curve|proof|ai|street|plan"`; G3 "outside its card" checks against it.
- Every live number: `data-src` + `data-val` (+ `data-scale`, `data-from` for derived values such as P1-P4).
  Countdown: `data-src="derived" data-from="state/active/<seg>/valid_to - state/now"` with a tolerance of one poll.
- Chart labels are SVG `<text>`: G3's SVG overlap detector must see 0 intersections after `placeLabels`.
- Sizes in the G3 matrix map to classes: 2560x1440, 1920x1080, 1680x1050, 1440x900 = (a); 1280x800, 1240x635,
  1022x884, 1024x600 = (b); 390x844, 390x667, 360x740 = (c).

## 12. Pre-flight for the builder
- One screen and no scrollbar at 1440x900 and larger; scroll, never clip, everywhere else; no sideways scroll ever.
- The five judge facts are visible above the fold at >= 1240x635 (bottom of the first screen is fine).
- One hero figure, one curve, one ring, one countdown. No blue, no dots, no pills, no ellipsis, no em dashes.
- Every number traces to /api/state, /api/history, /api/weather or /api/flatten, or reads "Waiting for ..." in grey.
