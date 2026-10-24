# Stage QA gates

`npm run qa` runs the gates in order against the built page on the local platform (`http://localhost:8081/static/new/index.html`);
`npm run qa -- --dev` tests the Vite dev server, `-- --quick` is the fast builder loop (current state, four sizes, no recordings).
Needs the local stack running (`dev/stack.sh start`) and Google Chrome installed (headless, Metal GPU, via playwright-core).

| gate | script | passes when |
|---|---|---|
| G1 | typecheck + `npm run build`, then `live.mjs` | clean build; no console error or warning in 60 s live |
| G2 | `truth.mjs` | every visible number traces to the API payload the page fetched and matches it |
| G3 | `layout.mjs` | 11 sizes x scenarios 1-4 + 20 s live: 0 overlapping text, 0 clipped, 0 cut, 0 outside its card, 0 wider than the viewport, one screen at >= 1440x900 |
| G4 | visual judges (Workflow, outside this folder) | over the G3 screenshots |
| G5 | `live.mjs` | >= 50 fps at 1440x900, 3D paused off-screen, 10 s recording per size shows real change |

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
- `data-src="axis"`: chart ticks and scaffolding.
- `data-src="sample"`: fixture values, allowed only with `?weather=sample` / `?plant=sample`.

The 3D scene counts rendered frames on `window.__gz3d.frames` (in `useFrame`) so G5 can prove it pauses off-screen.
