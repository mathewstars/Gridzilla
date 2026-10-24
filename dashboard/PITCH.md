# Gridzilla pitch: the web presentation

Dad's 30 s trailer, then seven slides, for the Energy Bridge hackathon in Vienna, 4:20 hard stop. Script and run of show:
`/Users/matthewstafurik/firstmate/data/gz-ui/pitch-script.md` (notes copied into `src/pitch/script.ts`).
Dad's deck numbers (checked): `docs/Gridzilla-pitch.pdf`, `docs/PRESENTATION.md` on main (copied into `src/pitch/facts.ts`).

## Handoff (state at 19:35, 24 Oct)

1. Branch fm/gz-pitch, rebased on fm/gz-ui 64b87ce; dev server `npm run pitch:dev` (5175), preview `npm run pitch:preview` (4175).
2. Deck = slide 0 trailer + slides 1-7 (`src/pitch/slides/index.ts`); every beat is a Right press; nothing auto-dims.
   Story arc: slide 2 opens on the six o'clock street (story step), slide 6 "Our family home in Blatnica", slide 7 the six o'clock line, then the punchline.
3. Slide 5 embeds `DemoView` (src/ops/demo, stage worker's) + `Tour5.tsx` walkthrough (steps 1-7, Esc skips).
4. Background: Paper Shaders Mesh Gradient (21st.dev @paper-design, `bg/mesh-gradient.tsx`) via `shell/Backdrop.tsx`.
5. Fonts: Clash Display + General Sans in `public/pitch/fonts`; slide 5 keeps the console's own type (`slide5.css`).
6. Read-only live mode: `src/pitch/liveMode.ts` (`?api=<base>` or `?api=proxy` + `GZ_API`); POSTs refused in the page.
7. Gates: `qa/pitch.mjs` (G1+G3, both themes), `qa/pitch-truth.mjs` (G2), `qa/pitch-motion.mjs` (G5), `qa/pitch-pdf.mjs`.
8. Last results: G1 0 errors, G3 0/252 cells, G2 clean except DemoView's untagged numbers (not ours), G5 ~60 fps.
9. Open: final art-director read of every capture; DemoView fills only ~70 % of 1920x1080 and its legend wraps (stage worker).
10. Trailer is copied at build time (`qa/pitch-trailer.mjs`), never committed; do not commit platform/static/new/pitch/trailer.mp4.

## Run

    npm run pitch:dev        # http://localhost:5175/pitch.html, /api proxied to the local platform on :8081
    npm run pitch:preview    # production build on http://localhost:4175/pitch.html
    npm run pitch:pdf        # the seven slides at 1920x1080 into ../platform/static/new/pitch.pdf (run after a build)
    npm run pitch:qa         # gates G1 + G3 over every slide, both themes
    npm run pitch:trailer    # copies docs/Gridzilla-trailer.mp4 (or origin/main's) to public/pitch/trailer.mp4

The trailer is 16 MB, so it is copied at build time and not committed (public/pitch/.gitignore); pitch:dev and
pitch:preview copy it first. Gate scripts: qa/pitch.mjs (G1, G3), qa/pitch-truth.mjs (G2), qa/pitch-motion.mjs (G5).

URL: `?slide=N` (0 = the trailer, 1-7 the slides), `&step=S` (0-based build step), `&freeze=end` (final state at once,
for QA and print), `&theme=dark|light` (dark is the default, like the rest of the product).
Swap the trailer: replace docs/Gridzilla-trailer.mp4 (it carries the jingle; there is no separate audio any more).

## Every beat is a key press

Nothing dims, moves on or changes content by itself: each spoken beat is one Right. Slide 2: Right brings the three facts,
Right brings the closing line under them. Slide 3: Right for noon, Right for "The operator asks...", Right for the AI loop.
Slide 4: Right draws the Gridzilla line and drops the big number from red to green. Slide 5: Right walks the demo
(seven areas). Slide 7: Right for "So at six tomorrow...", Right for the last line. The only automatic move is the trailer's hard cut into the title at
its last frame, which the captain asked for. Entry builds (a typed message, numbers counting, a ring lighting once)
finish within a few seconds and then hold.

## Slide 5 walkthrough

Steps 1-7 of slide 5 light one area of the live demo at a time, with a crisp blue outline, the rest dimmed 15 % (no
blur) and a one-line caption beside it: the street curve, the ring, the AI steps, the signals running, the city dots,
what just happened, and the Pause (a caption alone: Peter pauses it on dad's board). The last Right leaves the slide;
Esc skips the rest of the walkthrough. Anchors (`src/pitch/slides/Tour5.tsx`): `#gz-tour-*` ids if the console adds
them, then DemoView's parts (`.demo-curve`, `.demo-ring`, `.gz-steps`, `.demo-sigs`, `.demo-city`, `.fstrip`).

## Read-only live mode (the real Blatnica plant)

The real plant talks only to the live server, never to a local copy. To show the live server's data without ever
writing to it:

    GZ_API=https://gridzilla.victronlab.sk npm run pitch:dev    # the Vite proxy reads the live server
    open http://localhost:5175/pitch.html?api=proxy             # every POST is refused in the page

`?api=<base url>` sends every GET to `<base>/api/...`; `?api=proxy` keeps GETs on `/api/...` (the Vite proxy, target
`$GZ_API`). In both, every non-GET is refused before it leaves the browser with "read-only, live server"
(`src/pitch/liveMode.ts`), so scenario keys and console buttons cannot change anything. A base on another origin needs
cross-origin headers, which the platform does not send today, so for a live server use `?api=proxy`. Without `?api`
the deck reads and writes its own origin as before. Tested only against the local platform.

## Fonts

Clash Display (500, 600) for titles, headlines and big numbers; General Sans (400, 500, 600) for body, captions and
labels; both from Fontshare (free), self-hosted in `public/pitch/fonts` (no CDN at show time). Neither font has
tabular figures, so numbers that count hold their width with hidden copies. The demo on slide 5 keeps the console's
own type.

## Presenter keys (nothing visible on the slides)

Right or Space: next build step, then next slide. On slide 0 the first press plays the trailer with sound, a second
press skips it; at its last frame the deck hard-cuts to the title by itself. Left: back. F: full screen. T: small
elapsed timer (starts with the trailer). N: the presenter notes for this slide. D: dark or light. Esc: slide overview.
1-4 set the live scenario on the title slide (before you start) and on slide 5; Left and Right always move slides.

## Design read

A keynote-style pitch for hackathon judges who have watched twenty pitches today, in Apple product-launch language,
light only, on the stage's own tokens. Dials: variance 6, motion 6 (story only), density 2 (one idea per slide).
One memorable thing per slide; everything around it quiet.

## System (every slide)

- Canvas 1920x1080 design px, white. Shell scales it to the window (letterboxed in white). Side margin 120, top/bottom
  96, 12 columns, 40 gutter. Tokens and type classes in `src/pitch/pitch.css`; colours = `src/stage/palette.ts`.
- Type: SF Pro / Inter, weight 600 headlines and numbers, 400 body. Scale: giant 340, mega 220, display 144, head-xl 96,
  head 72, title 52, sub 40, body 34, small 30. **Smallest text anywhere 30px.** Units at 0.5em in secondary after the
  number. Tabular numbers. Sentence case. No uppercase eyebrows, no tracked labels, no ellipsis, no line-clamp.
- Colour with meaning only: green `#34c759` inside the limit / stored / done, orange `#ff9500` peak building, red
  `#ff3b30` over the limit, blue `#0071e3` interactive only (never on a slide). Text is ink, secondary or tertiary;
  colour lives on marks (lines, fills, rings, checks). Red text only at 72px or more (3.5:1 on white). Never green or
  orange text.
- Depth: tiles are `#f5f5f7` on white with radius 28, or white cards with the soft shadow. No borders, no hairlines.
- Banned: gradients, glows, neon, glass, dark theme, pills/chips, status-dot rows, tiny tracked uppercase labels,
  ellipsis cut-offs, entrance-animation soup, stock-photo feel, fake data shown as real, em dashes, emoji.
- Plain English only. Never on a slide: DSO, SoC, setpoint, heartbeat, envelope, kWh-jargon without a unit word.
  Say "grid operator", "message", "limit", "maker of the box", "battery".
- Motion: every move tells the story or shows data. Ease `cubic-bezier(.25,.1,.3,1)`, 0.5-1.2 s per move, no bounce, no
  spring overshoot, no looping decoration, transform/opacity/pathLength only. A slide's whole build finishes inside
  the first 60 % of its beat. `useReducedMotion()` or `freeze === "end"` renders the final state at once.
- Live numbers carry `data-src` (endpoint/path, e.g. `flatten:region:at/plan/peak_plan_pct`) and `data-val`; deck
  figures carry `data-src="deck" data-label="..."` and say on the slide where they come from.

## Slides

| # | Beat | Who | What is on screen | Steps |
|---|---|---|---|---|
| 0 | 0:00, 30 s | | Dad's trailer full-bleed on black, with its jingle; hard cut into slide 1 at its end. | Space plays it |
| 1 | 0:30 | Matthew | One centred column on the moving hero background: GRIDZILLA, "A grid signal for home batteries, cars and heat pumps.", team and track. Reveal under 0.7 s. | 1 |
| 2 | 0:32, 25 s | Matthew | "Europe's largest battery is in people's basements. The grid can use none of it." Three cards with living drawings and fast count-ups: Slovakia 0 signals (a battery cut off from the grid), Germany 4.2 kW (a dimmer stuck on one device), Ukraine 3 GWh (cells gone idle). Right: "The storage exists. The signal does not." below them. | 2 |
| 3 | 0:55, 40 s | Matthew | The one message typed out as a signed card (the only typing in the deck): "This street, next three hours, take at most 3 kW per house." It travels to four boxes (Victron, GoodWe, Viessmann, car charger) that light in turn: battery first, car second, hot water third. Step 2: the changed words slide to "give at most 2 kW", the boxes re-light, "The operator asks. The house decides. The owner can always say no." Step 3: "The loop, every 15 minutes": a ring of five stations lit in turn with live numbers (gathers, thinks, checks, signs and sends, houses reply), one lap, then it rests. | 4 (Right = noon, Right = closing line, Right = loop) |
| 4 | 1:35, 40 s | Peter | One big curve from the live diet plan (`/api/flatten?node=region:at`), the next 24 hours in one continuous line. On entry: the evening without Gridzilla heads past the limit, the big number in red. Right: the Gridzilla line bends under the limit, the orange slice is the peak eaten, green is the charging moved, the number drops to the green plan peak. Clean ground, no background. Labelled illustration only if the API is down. | 2 (Right = with Gridzilla) |
| 5 | 2:15, 75 s | Matthew | The console's demo mode (`DemoView`, `src/ops/demo`), full-bleed, imported, warm from the first frame; then the seven-step walkthrough. | 8 (Right = next area) |
| 6 | 3:30, 25 s | Dad | Split screen, both live. Real: the Blatnica plant (or "waiting for the plant", honestly). Simulated: the city heat grid of all 72 street transformers. Measured numbers under each, labelled "measured on 24 Oct 2026". | 1 |
| 7 | 3:55, 25 s | Matthew | "One street transformer to pilot on. This winter." alone. Step 2: "It eats peaks for breakfast." alone on the hero background. | 3 (Right = six o'clock line, Right = last line) |

## Files

- `pitch.html`, `src/pitch/main.tsx`: entry. `src/pitch/Deck.tsx` + `deck.css`: shell, keys, timer, notes, overview.
- `src/pitch/types.ts`: the slide contract (`SlideProps`: step, active, freeze, jingle). `src/pitch/slides/index.ts`:
  order, beat times, steps. `src/pitch/slides/SlideN.tsx` (+ `slideN.css`): one file pair per slide.
- `src/pitch/script.ts`: presenter notes. `src/pitch/facts.ts`: deck figures, one place to re-check them.
- `public/pitch/trailer.mp4`: dad's trailer, copied at build time (`qa/pitch-trailer.mjs`), not committed.
- `src/pitch/slides/Slide0.tsx` + `src/pitch/shell/useTrailer.ts`: the trailer slide and its playback.
- `src/pitch/bg/mesh-gradient.tsx` + `src/pitch/shell/Backdrop.tsx`: the background family.
- `qa/pitch-shot.mjs`: screenshots of one slide at chosen seconds. `qa/pitch.mjs`: gates. `qa/pitch-pdf.mjs`: the PDF.

## Backgrounds

One family, from 21st.dev, installed as published: Paper Shaders' animated **Mesh Gradient** (`src/pitch/bg/mesh-gradient.tsx`).
The shell draws it once behind every slide that has one (`src/pitch/shell/Backdrop.tsx`), so the light keeps moving
across slide changes: full strength on slides 1 and 7, dimmed to about 60 % on 2, 3 and 6; slide 4 and the live demo
have none. Palette: green and teal on near-black (dark), pale greens (light); speed 0.4. Slides change with one 0.3 s
crossfade; the trailer's end is a hard cut.

## 21st.dev components used

| Component | Author | 21st.dev | Where | What was adapted |
|---|---|---|---|---|
| Mesh Gradient (Paper Shaders) | @paper-design | https://21st.dev/@paper-design/components/mesh-gradient (demo id 17795) | the deck background, slides 1, 2, 3, 6, 7 | Published code unchanged (marked `@ts-nocheck` for our strict null checks); one appended `setPalette()` sets the palette per theme, the speed and stops time for reduced motion. Paper Shaders is Apache-2.0. |
| Count Up | @unlumen | https://21st.dev/@unlumen/components/count-up (demo id 20068) | slide 2 and slide 6 counters | Odometer digits only; ref-measured instead of react-use-measure, eased tween with no spring overshoot, plain tabular text at rest. |
| Typewriter Text | @educalvolpz | https://21st.dev/@educalvolpz/components/typewriter-text (demo id 18768) | slide 3, the signed message | Its per-character timeout engine; the final text laid out invisibly so nothing reflows; freeze and reduced motion show the full text. The only typing in the deck. |
| Line graph | @motiondotdev | https://21st.dev/@motiondotdev/components/motion-line-graph (demo id 24687) | slide 4, the curve | pathLength draw-in; hover dropped (projector); our data, limit line and labels. |

Considered and not used: Static Mesh Gradient · Sea (@paper-design, id 21808) as a calmer sibling; the captain asked for
the same moving gradient on every content slide instead.
