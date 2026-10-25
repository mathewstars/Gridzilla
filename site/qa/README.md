# Site gates

Run them all from `site/`:

```
npm run qa                  # build, serve the build on :5181, run G1 to G9, save the screenshots
GZ_PORT=5211 npm run qa     # same, on another port when 5181 is taken (G9 uses GZ_PORT + 1, or GZ_DEAD_PORT)
npm run qa -- --only g4     # one gate
npm run qa -- --no-build    # skip the build, test what is already in platform/static/site
node qa/g4-links.mjs --url http://localhost:5211/static/site/   # one gate against a server you started
```

Each gate prints one `PASS` or `FAIL` line per check (and `INFO` lines that are notes, not judgements) and exits non-zero on any `FAIL`. `npm run qa` ends with `PASS: all 9 gates` or `FAIL: n of 9 gates`, then saves the first screen and the whole page at 2560x1440, 1440x900, 1024x768, 390x844 and 390x667 into `qa/shots/` (gitignored) and prints the paths.

| Gate | What it checks | A failure means |
| --- | --- | --- |
| G1 console (`g1-console.mjs`) | A slow 60 s scroll at 1440x900 gives no console error and no failed request. | Something on the page is broken: a script error, a missing image, font or file. |
| G2 layout (`g2-layout.mjs`) | At the five sizes: no text on top of other text, no cut-off text, no sideways scroll, the headline on 2 lines, button labels and the nav on one line. | Something looks broken at that size; open the shot for that size. |
| G3 copy (`g3-copy.mjs`) | The page text has no long dashes, no lorem, no TODO, no "[", no double spaces, at most one small caps label above a heading; the banned word is in neither the page nor the source. | A word or symbol slipped in that the spec forbids. |
| G4 links (`g4-links.mjs`) | Every link goes somewhere real, every #anchor exists, every outside link answers (read-only HEAD or GET), every button does something, and "Open the console", "Watch the trailer", "Read the protocol" are the only labels for those three jobs. | A dead or empty link, a button that does nothing, or one job with two different button labels. |
| G5 hover (`g5-hover.mjs`) | Every pill and card visibly changes (colour, lift or shadow) when the mouse is on it, and every button has a pressed style in the built CSS. | A flat button or card that does not react, or a button with no press feedback. |
| G6 accessibility (`g6-a11y.mjs`) | axe finds no serious or critical problem at 1440x900 and 390x844, every image has alt text, text on gradients has enough contrast (measured here, axe cannot). | People on screen readers or with weaker eyes would struggle; the line names the element and its text. |
| G7 reduced motion (`g7-motion.mjs`) | With "reduce motion" switched on, nothing is left invisible or shifted after 1 s, and the page says the same words as a normal visit. | Someone who turned animations off sees blank or misplaced parts of the page. |
| G8 weight (`g8-weight.mjs`) | The landing JS is at most 300 KB gzipped (every chunk listed), each screenshot webp at most 250 KB, the trailer never downloads until clicked, only above-the-fold fonts are preloaded, the biggest first thing on screen is the headline or the console image (marked high priority). | The page got heavier or slower to show its first screen. |
| G9 live tile (`g9-live.mjs`) | With the live server unreachable (its own preview with GZ_LIVE_API at a dead port) the Real plant tile says "Live data unavailable right now", shows no spinner, and the page still has no other errors over 60 s. | When the plant is offline the page looks broken instead of quiet. |

Needs Chrome installed (playwright-core uses the `chrome` channel) and network access for G4 (outside links) and the GitHub avatars.
