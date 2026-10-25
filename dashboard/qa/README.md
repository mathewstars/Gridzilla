# Stage QA gates

`npm run qa` runs the gates in order against the built page on the local platform (`http://localhost:8081/static/new/index.html`);
`npm run qa -- --dev` tests the Vite dev server, `-- --quick` is the fast builder loop (current state, four sizes, no recordings).
Needs the local stack running (`dev/stack.sh start`) and Google Chrome installed (headless, Metal GPU, via playwright-core).

| gate | script | passes when |
|---|---|---|
| G1 | typecheck + `npm run build`, then `live.mjs` and `demo.mjs` | clean build; no console error or warning in 60 s live (`demo.mjs`: #/demo console and bare, dark and light, at once) |
| G2 | `truth.mjs` | every visible number traces to the API payload the page fetched and matches it |
| G3 | `layout.mjs` | 11 sizes x scenarios 1-4 + 20 s live: 0 overlapping text, 0 clipped, 0 cut, 0 outside its card, 0 wider than the viewport, 0 scroll cuts (visible text crossing the bottom or right edge of its nearest scrolling box; a `data-scroll="page"` column is exempt), 0 series outside their plot (a chart marking `data-plot` + `data-series` keeps every line and area inside the plot rect, measured before clipping), one screen at >= 1440x900. `--hash /demo` checks the demo, `--bare` the page alone (?bare=1) |
| G4 | `demo.mjs` (legend keys); visual judges (Workflow, outside this folder) | both demo legends list all their keys at 2 s and 20 s after load (the hero's six, muted while a series has no data; the Blatnica key), console and bare, dark and light; the judges look over the G3 screenshots |
| G5 | `live.mjs` | live data on screen within 3 s of opening (3 cold loads); >= 50 fps at 1440x900, 3D paused off-screen, 10 s recording per size shows real change |

## Phones

Phones are under 900 px wide or 500 px tall (`src/phone.ts`; CSS `ops/phone.css`, the deck's `shell/TouchNav.tsx`). The last two
steps of `npm run qa` check them at 390x844, 390x667, 430x932 and 844x390, dark and light, with prefers-reduced-motion
`reduce` and `no-preference`:

- console: `node qa/layout.mjs --states quick --sizes phones --theme dark,light --motion reduce,no-preference --hash /,/plan,/plant,/city,/autopilot,/manual,/households,/log,/weather`
- deck: `node qa/pitch.mjs --base <server>/pitch.html --sizes phones --motion reduce,no-preference` (G1 taps through the whole
  run of show at each phone size; G3 every slide and step at start and end)

On top of the G1 and G3 checks above, a phone cell fails when the first screen shows 3 texts or fewer besides the bars
(a blank landing; on the deck this holds for slide 0, every other slide needs at least one text), a bar or sheet control (`.tab-item`, `.tb-menu`, the deck's arrows, Play, Open the console, sheet rows)
is under 44x44 px, or the page requests a three.js file. Two layout rules for phones: a fixed bar marked `data-chrome`
(tab bar, phone top bar, the deck's touch controls) floats over content without counting as overlap, and a sideways
chip row marked `data-scroll="row"` only counts its visible part (the half chip at its edge says it scrolls).

`GZ_QA_BASE=http://localhost:8241/static/new/ GZ_QA_API=http://localhost:8241/api` points every gate at a second local
platform when :8081 is taken. The deck's phone still of the console comes from `node qa/pitch-still.mjs` (GET only).

## Data-truth convention (G2)

Every element that shows a live number carries where it came from:

- `data-src="state/aggregates/tf:x/total_kw"`: endpoint then path into the payload (`/` separated; keys may contain `:`).
  Endpoints are the poll paths in `src/api.ts`: `state`, `history`, `weather`, `flatten`. The page keeps the last payload of each on `window.__gz`.
- `data-val="123.4"`: the raw value before formatting; `data-scale="0.001"` when shown in other units (kW as MW).
- `data-src="derived" data-from="state/aggregates/tf:x/baseline_kw - state/aggregates/tf:x/total_kw"`: computed values (+ - * / and parentheses).
- Inside `data-from`, `count(<collection>)` and `sum(<collection>/<field>)` aggregate over a collection: a `*` segment takes every child
  (`tf:*` only keys starting with `tf:`), `[filters]` keep children where every clause holds. Clauses join with `and`; each is
  `field op value` (`= != > >= < <=`, `in a,b`), `abs(field) op value`, `field != null`, or a bare `field` (present and not false).
  Value may be a number, `true`/`false`/`null`, another field of the same child (`rating_kw`), or a string.
  Example: `count(state/aggregates/tf:*[total_kw != null and abs(total_kw) <= rating_kw])`.
- `data-src="deck" data-label="measured in Blatnica"`: a static fact from the pitch deck, labelled on screen.
- `data-src="axis"`: chart ticks, clock times and scaffolding.
- `data-src="page" data-label="..."`: a count this page keeps itself (today's signals seen in the feed); no single API field holds it, so it must say so.
- `data-src="sample"`: fixture values, allowed only with `?weather=sample` / `?plant=sample`.

The 3D scene counts rendered frames on `window.__gz3d.frames` (in `useFrame`) so G5 can prove it pauses off-screen.
