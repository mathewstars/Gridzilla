# Apple R2: visual contract for stage A and stage B

Brief: /Users/matthewstafurik/firstmate/data/gz-ui/redesign-2.md. Palette: src/stage/palette.ts. Older tokens: DESIGN.md.
Read as: a self-playing keynote screen for judges and grid engineers, Apple product-page and Home-app language, light only.
Dials: variance 6, motion 6 (only real data changes move), density 4. Nothing on the stage is clickable.

## 1. Apple tokens taken from production CSS (fetched 24 Oct 2026)
Sources: apple.com/iphone (overview.built.css), apple.com/apple-watch-series-10 (artisan css), globalheader.css.
- Frosted bar: `background: rgba(250,250,252,.8)`; `backdrop-filter: saturate(180%) blur(20px)`. Fallback with no blur support:
  `rgba(250,250,252,.92)`. Height: 52px (Apple local nav), 44px on phone. Only one 1px line under it, `rgba(0,0,0,.08)`. No other borders.
- Headline type found on the pages (all weight 600): 96/1.04/-.015em, 80/1.05/-.015em, 64/1.0625/-.009em, 56/1.07/-.005em,
  48/1.083/-.003em, 40/1.1/0. Body 17/1.47/-.022em, small 14/1.43/-.016em. The bigger the type, the tighter the tracking.
- Tiles: radius 28px for big tiles (`--sk-tile-border-radius:28px`), 18px for small ones. White tile on `#f5f5f7` ground.
  Shadow `8px 8px 16px 0 rgba(0,0,0,.08)` (Apple tile), softened to `0 4px 24px rgba(0,0,0,.06)` for many tiles side by side.
- Easing: `cubic-bezier(.4,0,.6,1)` (78 uses, state changes), `cubic-bezier(.25,.1,.3,1)` (13 uses, things settling in).
- Only `#0071e3` blue appears as a hue in their CSS: colour is rare and carries meaning. We follow that.

## 2. Type scale (px at 1440 wide; rem with root 16px)
The root already scales in src/index.css (`clamp(15px, .55vw + 8px, 23px)`: 16px at 1440, 22px at 2560), so set everything in rem.
| token | 1440 | rem | line-height | tracking | use |
|---|---|---|---|---|---|
| mega | 128 | 8 | 1.0 | -0.02em | ONE number per screen (A: peak %) |
| display | 80 | 5 | 1.05 | -0.015em | big live numbers (kW, homes, ring centre in B scene) |
| head-xl | 56 | 3.5 | 1.07 | -0.005em | the story sentence |
| head | 40 | 2.5 | 1.1 | 0 | card numbers |
| title | 28 | 1.75 | 1.14 | 0.007em | card titles, AI step words |
| sub | 21 | 1.3125 | 1.19 | 0.011em | secondary lines under numbers |
| body | 17 | 1.0625 | 1.47 | -0.022em | status line, captions on the curve |
| small | 14 | 0.875 | 1.43 | -0.016em | axis labels. Smallest size on the stage (5 m projector rule) |
Rules: weight 600 for numbers and headlines, 400 for body, nothing else. All numbers `tabular-nums`. Units sit after the number at
0.5em, weight 600, colour secondary (`86` big + `%` small, like apple.com "33 hours"). No uppercase labels, no letter-spaced
eyebrows, no ellipsis or line-clamp anywhere: shorten the words or let them wrap. Phone (390): mega 4.5rem, display 3.5rem,
head-xl 2.25rem, head 2rem, everything else unchanged.

## 3. Colour (meaning only, src/stage/palette.ts)
- Ground `#f5f5f7`, tiles `#fff`, ink `#1d1d1f`, secondary `#6e6e73`, tertiary `#86868b`, track/fill `#e8e8ed`.
- green `#34c759` = inside the limit, stored, clean (battery fill, area between the two curves, ring under 85%, done AI steps).
- orange `#ff9500` = peak building (ring and transformer 85 to 99%, the curve segment heading for the limit).
- red `#ff3b30` = over the limit, either direction (ring past 100%, "without Gridzilla" segment above the limit, refused by guard).
- blue `#0071e3` = interactive only. The stage has nothing interactive, so blue should not appear on the stage.
- Use `loadTone(pct)` for every load colour so A and B agree. Colour never stands alone: the number or word sits next to it.
- Banned: decorative gradients, glows, neon, coloured or glowing borders, dark theme, pills/chips, status-dot rows.
  The only allowed blend is the 3D sky, because it is data (grid time and real cloud cover), not decoration.

## 4. Motion contract (every move = a real data change)
- Numbers: Motion `useSpring` (stiffness 90, damping 24) on the value, `useTransform` to format, write to the text node, never to
  React state per frame. They tick from old to new on each poll. Clock digits roll (see 21st "Animate Digits").
- Curve: when a new point arrives, the "with" line extends to it over the poll interval with linear timing, so the line keeps
  moving like a live ECG. The "now" line sits at the newest point. The "without" line is drawn ahead from the forecast.
- Ring: arc length springs to the new %, 1.2s, ease `(.25,.1,.3,1)`; colour crosses green/orange/red over 0.6s.
- AI steps light in sync with `autopilot.stage`: sense = Sees, deepseek = Thinks, guard = Checks, send = Acts. Active step ink,
  waiting steps tertiary, done steps get a green check. After send, the line "Signed and sent at 21:44" appears and the ack count
  ticks up as signed replies arrive. Idle: show the last real decision from `autopilot.history`, with its time.
- Scene (both): particles flow along wires in the real sign of power (import toward houses, export toward the transformer),
  speed = 0.4 + |kW| / 20 units/s, count rises with |kW|, capped. Transformer body colour = `loadTone`. Battery fill height =
  real SoC. Panels brighten with sun height. Heat pump fan spins with its kW. Sun position and sky colour follow grid time
  (`now`), cloud cover from `/api/weather`.
- Auto-pick: show `autopilot.target` if set, else the transformer with the worst `forecast_peak`. Stay at least 30s, switch on a
  new trigger, crossfade 0.6s. Keys (invisible): 1-4 scenarios via POST /api/scenario/{normal|cold-evening|sunny-noon|live-weather},
  left/right transformer, F fullscreen.
- No entrance animations, no loops that do not carry data, no hover effects. `prefers-reduced-motion`: values jump, particles stop.
- Fixtures only behind `?sample=1`, with the word "Sample" visible in the top bar.

## 5. 21st.dev patterns to copy (approach only, nothing installed)
1. unlumen "Animate Digits" (id 20071): split the formatted number into characters, key each by position, AnimatePresence slides
   only the digits that changed (y 0.4em to 0, 0.35s). Use for the grid clock and the A mega number.
2. kokonutd "Apple Activity Ring" (id 3223): two SVG circles, track and arc, `rotate(-90)`, `strokeLinecap="round"`, Motion
   animates `pathLength`. We add Watch overflow: past 100% a second lap draws on top in red, its start cap carries a small shadow
   `drop-shadow(0 0 2px rgba(0,0,0,.35))` so the overlap reads (Watch does exactly this). Stroke width = 12% of the ring
   diameter, track = same hue at 18% opacity on white.
3. isaiahbjork "BJORK Live line" (id 39720) + mirukullacode "Chart Line" (id 39296): one SVG path, new points appended, head dot
   at the newest point, y-domain eased instead of jumping, draw-in by `pathLength` only when data arrives.

## 6. Direction A "Keynote stage" (apple.com product page)
Idea: one giant live curve, the story in huge type, everything else is a short row of facts.
1440x900 (no scroll), 12 columns, 64px side margin, 24px gutter:
- Bar 52px, frosted: left "Gridzilla" (sub, 600). Centre grid clock `21:45` (sub, tabular) + "Cold evening" in secondary.
  Right: one live status sentence (body, secondary), e.g. "Autopilot acted 2 min ago. 37 of 40 homes following."
- Hero row, 520px, starts 48px under the bar:
  cols 1-4: story sentence (head-xl, wraps to max 3 lines) driven by state: "The evening peak is building." / "Gridzilla is
  flattening it." / "Back under the limit." Under it, 32px gap: mega peak % WITH Gridzilla in `loadTone`; one line below in
  title: "Without Gridzilla 124%" with the number in red when over. Then transformer name in body secondary.
  cols 5-12: the curve, full height, no tile, straight on the ground. "With" line ink 3px; "without" line tertiary 2px dashed,
  its part above the limit turns red; the gap between them filled green at 15% (energy moved). Limit = 1px ink 40% line with
  "Limit 400 kW" at its right end (small). X axis = grid hours (small), no y gridlines, two y labels max.
- Facts row, 200px, 48px under the hero, no tiles, 5 equal-width columns separated only by space:
  homes following (display number + "of 40 homes following") | AI steps (four title words in one line, live) |
  signed (display count of signed messages today + "0 refused by the safety guard" or the real refused count) |
  weather (display temp + sub "Sunny, 1.2 kW sun per home" from /api/weather) | Blatnica (display battery % + "real home in
  Blatnica, heat pump 2.1 kW", reuse BlatnicaTile data).
2560x1440: same grid, margins 120px, hero 860px tall, facts 300px; rem scaling does the type.
390x844 (vertical scroll allowed): bar 44px (name + clock), story head-xl, mega number, "without" line, curve full width 280px
tall, AI steps as 2x2, then the four facts stacked as number + one line each, 32px apart.

## 7. Direction B "Apple Home energy" (Home Grid Forecast + Weather app)
Idea: a living street you could touch, with a few large live cards beside it, like the Home app dashboard.
1440x900 (no scroll), 12 columns, 24px outer margin, 16px gaps, rows after the 52px bar: r1 528px, r2 256px.
- Bar: same as A.
- Scene tile cols 1-8 r1, radius 28px, the 3D street (react-three-fiber): transformer hero object in front, 6-10 houses with
  panels, battery boxes, heat pumps, wires with particles. Top-left overlay inside the tile, ink on sky: transformer name (title)
  and its live kW (display) with "now" in sub. Sky colour from grid time; at night ink text switches to white (only exception).
- Forecast tile cols 1-8 r2: Home "Grid Forecast" style. Title "Tonight" + the with/without curve 180px tall, same marks as A,
  plus one sub line: "Peak 86% with Gridzilla, 124% without."
- Ring tile cols 9-12, top of r1 (256px): Watch ring 180px diameter, centre number head + "%", beside it "of the limit" and
  "37 of 40 homes following" (sub).
- AI tile cols 9-12, bottom of r1 (256px): the four steps stacked (title), each with one plain line from `plainReason` /
  `boxLine`, check marks on done steps, then "Signed and sent at 21:44, 12 acks".
- Blatnica tile cols 9-10 r2 and Weather tile cols 11-12 r2: Blatnica = battery as a vertical fill (green) + %, EV and heat
  pump kW in sub. Weather = Weather-app style: temp (display), condition word, sun and cloud % from /api/weather.
2560x1440: margins 40px, gaps 24px, r1 900px, r2 420px, ring 300px.
390x844 (scroll): scene edge to edge, 360px tall, no radius; then 16px gutter cards stacked: ring, AI, forecast,
Blatnica + Weather side by side (2 columns). Card radius 18px on phone.

## 8. Pre-flight for both (check before screenshots)
- Fits one screen at 1440x900 and 2560x1440, no scrollbar; 390x844 has no sideways scroll.
- Zero buttons, dropdowns, arrows on screen. Keys still work.
- Every number on screen is live from /api/state, /api/history or /api/weather, or the page says "Sample".
- A judge reads the with vs without gap from 5 m in under 10 seconds.
