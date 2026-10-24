#!/usr/bin/env bash
# DEV ONLY: the whole Gridzilla stack on this laptop, isolated from the live systems.
# Local broker :1884, platform :8081, fake DeepSeek :8091, simulator. Logs in $LOGS (default /tmp/gz-dev).
# Usage: dashboard/dev/stack.sh start|stop
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOGS="${LOGS:-/tmp/gz-dev}"; mkdir -p "$LOGS"
MOSQ="$(command -v mosquitto || echo /opt/homebrew/opt/mosquitto/sbin/mosquitto)"
# Stops only what this script started: listeners on its own ports, and the simulator by its saved PID (never pattern kills).
stop() {
  for p in 1884 8081 8091; do lsof -ti tcp:$p -sTCP:LISTEN | xargs kill 2>/dev/null; done
  [ -f "$LOGS/sim.pid" ] && kill "$(cat "$LOGS/sim.pid")" 2>/dev/null; rm -f "$LOGS/sim.pid"; true
}
if [ "${1:-start}" = stop ]; then stop; exit 0; fi
stop; sleep 1
nohup "$MOSQ" -p 1884 >"$LOGS/mosquitto.log" 2>&1 &
nohup python3 "$ROOT/dashboard/dev/fake-llm.py" 8091 >"$LOGS/llm.log" 2>&1 &
(cd "$ROOT/platform" && GZ_PORT=8081 GZ_BROKER=localhost:1884 GZ_LLM_URL=http://localhost:8091/v1 GZ_LLM_KEY= \
  nohup "$ROOT/.venv/bin/python" gridzilla.py >"$LOGS/platform.log" 2>&1 &)
sleep 3
(cd "$ROOT/agent" && GZ_PLATFORM=http://localhost:8081 GZ_BROKER=mqtt://localhost:1884 GZ_SPEED="${GZ_SPEED:-1}" \
  nohup node sim-agent.js >"$LOGS/sim.log" 2>&1 & echo $! >"$LOGS/sim.pid")
echo "stack up: http://localhost:8081/static/new/  (logs in $LOGS)"
