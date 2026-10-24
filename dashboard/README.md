# Gridzilla operations console

The new front end: the operator's console (Operations, City, Autopilot, Manual, Households, Real plant, Weather, Log), a demo
mode for the pitch, and the presentation stage. Vite + React + TypeScript + Tailwind, three.js for the 3D street.
The built files go to `platform/static/new/` and are committed, so the platform serves them with no Node on the server:
`http://<platform>/static/new/index.html`.

## Run it on your laptop

You need Node 20 or newer (tested on 26), Python 3 with the platform's requirements, and mosquitto (`brew install mosquitto`).

    python3 -m venv .venv && .venv/bin/pip install -r platform/requirements.txt   # once, at the repo root
    (cd agent && npm ci)                                                           # once, the simulator
    cd dashboard && npm ci                                                         # once

    dashboard/dev/stack.sh start   # local broker :1884, platform :8081, fake DeepSeek :8091, simulator (logs in /tmp/gz-dev)
    dashboard/dev/stack.sh stop    # stops only what it started (its ports and the simulator's saved PID)

The stack never talks to the live platform, broker or AI: everything runs on localhost. `GZ_SPEED=2` makes the simulator run
faster (simulated minutes per real second). `dev/fake-llm.py` answers like DeepSeek, so the autopilot works without a key.

## Develop, build, check

    npm run dev     # http://127.0.0.1:5174/static/new/ with hot reload; /api and /openapi.json go to the platform on :8081
    npm run build   # type check + bundle into ../platform/static/new/ (commit those files with your change)
    npm run qa      # the gates in qa/README.md: build, data truth, layout over 11 sizes x scenarios, live 60 s + fps

`npm run qa -- --dev` checks the dev server instead of the build; `node qa/layout.mjs --theme dark,light --sizes 390x844,360x740`
checks just a few sizes in both themes.

## Routes

- `#/` Operations: the live city, the selected transformer's curve, the Now panel, the composer in a drawer.
- `#/city`, `#/autopilot`, `#/manual`, `#/households`, `#/plant`, `#/weather`, `#/log`: the other sections.
- `#/demo` Demo mode for the pitch and the projector (key D toggles it).
- `#/present` The presentation stage.
- Theme: dark by default; the small sun/moon icon top right, or `?theme=light` / `?theme=dark`.

## Phone layouts (<= 768 px)

They live in the CSS of each part, under `@media (max-width: 760px)` and the container queries: `src/ops/ops.css` (frame),
`src/ops/shell/shell.css` (sidebar and top bar), `src/ops/city/city.css`, `src/ops/now/now.css`, `src/ops/control/control.css`,
`src/ops/feed/feed.css`, `src/ops/demo/demo.css`. Colours come only from the theme variables in `src/index.css`, so both themes
follow. After a change: `npm run build`, `node qa/layout.mjs --theme dark,light --sizes 390x844,390x667,360x740` must print total 0.

## Working on the shared branch

`fm/gz-ui` is shared: always `git pull --rebase origin fm/gz-ui` before you push, never force-push.
