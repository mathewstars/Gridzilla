# Gridzilla pitch: the web presentation

Seven slides for the Energy Bridge hackathon in Vienna, 4:20 hard stop. Script and run of show:
`/Users/matthewstafurik/firstmate/data/gz-ui/pitch-script.md` (notes copied into `src/pitch/script.ts`).
Dad's deck numbers (checked): `docs/Gridzilla-pitch.pdf`, `docs/PRESENTATION.md` on main (copied into `src/pitch/facts.ts`).

## Run

    npm run pitch:dev        # http://localhost:5175/pitch.html, /api proxied to the local platform on :8081
    npm run pitch:preview    # production build on http://localhost:4175/pitch.html
    npm run pitch:pdf        # all seven slides at 1920x1080 into ../platform/static/new/pitch.pdf
    npm run pitch:qa         # gates G1 + G3 over every slide

URL: `?slide=N` (1-based), `&step=S` (0-based build step), `&freeze=end` (final state at once, for QA and print).
Swap the jingle: replace `public/pitch/jingle.m4a` with any audio file of the same name.

## Presenter keys (nothing visible on the slides)

Right or Space: next build step, then next slide. Left: back. F: full screen. T: small elapsed timer (starts at the
first Space on slide 1). N: the presenter notes for this slide. Esc: slide overview. On slide 5 the stage's own keys
work (1-4 scenarios, its transformer keys); Left and Right still move slides.

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
| 1 | 0:00, 30 s | Matthew | "GRIDZILLA" huge and still while the 31 s jingle plays. When it ends, one line fades in: "Now you probably wonder what the monster really is." | Space starts the jingle |
| 2 | 0:30, 25 s | Matthew | "Europe's largest battery is in people's basements. The grid can use none of it." Three facts counting up: Slovakia 0 signals, Germany 4.2 kW one-device dimmer, Ukraine 3 GWh idle. End: "The storage exists. The signal does not." | 1 |
| 3 | 0:55, 40 s | Matthew | The one message typed out as a signed card: "This street, next three hours, take at most 3 kW per house." It travels to four boxes (Victron, GoodWe, Viessmann, car charger) that light in turn; each sorts it out: battery first, car second, hot water third. Step 2: same card at noon, "give at most 2 kW", sun into the batteries. Closing: "The operator asks. The house decides. The owner can always say no." | 2 (Right = noon) |
| 4 | 1:35, 40 s | Peter | One big curve from the live diet plan (`/api/flatten?node=region:at`): at six the cars come home and the transformer heads past its limit (109-110 %); with Gridzilla it stays flat near 70 %, the cars trickle through the night and are full by seven. Labelled illustration only if the API is down. | 1 |
| 5 | 2:15, 75 s | Matthew | The live stage (`src/stage/Stage.tsx`), full-bleed, imported, its keys working. | 1 |
| 6 | 3:30, 25 s | Dad | Two halves. Real: a Victron plant and a Viessmann heat pump in Slovakia reacting to a signed message (live proof from the API). Simulated: two thousand houses, the same cars with and without; measured -31 % one street, -5.2 MW Vienna, 0 on a street with no cars, labelled "measured on 24 Oct 2026". | 1 |
| 7 | 3:55, 25 s | Matthew | The ask: one street transformer to pilot on, this winter. Sign-up two weeks, a second maker one week, we own the plant. Step 2: "It eats peaks for breakfast." alone on white. | 2 (Right = last line) |

## Files

- `pitch.html`, `src/pitch/main.tsx`: entry. `src/pitch/Deck.tsx` + `deck.css`: shell, keys, timer, notes, overview.
- `src/pitch/types.ts`: the slide contract (`SlideProps`: step, active, freeze, jingle). `src/pitch/slides/index.ts`:
  order, beat times, steps. `src/pitch/slides/SlideN.tsx` (+ `slideN.css`): one file pair per slide.
- `src/pitch/script.ts`: presenter notes. `src/pitch/facts.ts`: deck figures, one place to re-check them.
- `public/pitch/jingle.m4a`: the jingle (31.6 s).
- `qa/pitch-shot.mjs`: screenshots of one slide at chosen seconds. `qa/pitch.mjs`: gates. `qa/pitch-pdf.mjs`: the PDF.

## 21st.dev components used

(filled in by the builders: name, author, id, what was adapted)
