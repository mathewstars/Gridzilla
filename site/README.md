# Gridzilla website (`site/`)

The public landing page. Vite + React 18 + TypeScript + Tailwind v4 + Motion + Phosphor. Built to
`platform/static/site/` (committed, like `platform/static/new/`), so the live server shows it at
https://gridzilla.victronlab.sk/static/site/ after a `git pull`, no build step there.

- `npm install`, then `npm run dev` (port 5180, `PORT=` to change). `/api` goes to a local platform (`GZ_API`,
  default http://localhost:8190), `/live-api` to the live server, GET only, for the real plant tile.
- `npm run build` writes `platform/static/site/`. Commit the built files with the source.
- `npm run qa` builds, serves the build on :5181 and runs every gate in `qa/` (G1 to G9, see `qa/README.md`).
- `npm run shots` retakes the console screenshots in `public/shots/` from a local platform (2x, `--theme dark` for
  this site), including `console-phone.webp`, the 1360 px copy the phone loads (G8 keeps it under 120 KB).
  Start one first on free ports, see `dashboard/dev/stack.sh` for how (the site lane used broker 1890, platform 8190).
- Design: `DESIGN.md` (tokens in `src/styles/tokens.css`; the full brief is the team's site spec).

Never point the site or its scripts at a write endpoint of the live server; `/api/flatten` only on a local platform.

The Real plant tile (`src/lib/live.ts`) reads the Blatnica house with GET only. Since the hackathon the house is the
simulated twin `sim-blatnica-01`; while the server no longer carries the real plant (`blatnica`) the tile says
"Simulated since the hackathon". Keep the Real plant and AI copy in the past tense for what ran during the hackathon.
