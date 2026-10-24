# Gridzilla presentation board

The projector page: one feeder as a live 3D street, the selected transformer's curve, the AI brain, a house's allowed box and the weather.
Served by the platform itself at `http://<platform>/static/new/` (FastAPI already serves `platform/static/`), so no Node on the server.

## Develop

    cd dashboard && npm install
    dev/stack.sh start          # local broker :1884, platform :8081, fake DeepSeek :8091, simulator (never the live systems)
    npm run dev                 # http://localhost:5174/static/new/  (proxies /api to :8081)
    dev/stack.sh stop

`?view=street|curve|brain|envelope|weather|header|headline|drawer` shows one view alone. `?weather=sample` uses the bundled weather fixture when `/api/weather` is not there yet.

## Build

    npm run build               # type check + bundle into ../platform/static/new/

Commit the built files in `platform/static/new/` together with the source. All API calls are relative (`/api/...`), same origin.

`dev/` is development only: `fake-llm.py` answers like DeepSeek so the autopilot runs without a model or key.
