#!/bin/sh
# Push gridzilla-flow.json to a Node-RED on Venus OS through the admin API, as a new flow tab (existing tabs untouched).
#   NR_URL=https://192.168.90.147:1881 NR_USER=admin NR_PASS=... [NR_FLOW_ID=<existing tab id>] ./deploy-flow.sh gridzilla-flow.json
set -e
FLOW="${1:-gridzilla-flow.json}"
NR_URL="${NR_URL:-https://192.168.90.147:1881}"
NR_USER="${NR_USER:-admin}"
[ -n "$NR_PASS" ] || { echo "set NR_PASS"; exit 1; }
TOKEN=$(curl -k -s -X POST "$NR_URL/auth/token" -H "Content-Type: application/json" \
  -d "{\"client_id\":\"node-red-admin\",\"grant_type\":\"password\",\"scope\":\"*\",\"username\":\"$NR_USER\",\"password\":\"$NR_PASS\"}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')
# POST /flow adds one flow (tab + its nodes). Config nodes (mqtt-broker, victron-client) go in "configs".
python3 - "$FLOW" <<'EOF' > /tmp/gz-flow-body.json
import json, sys
nodes = json.load(open(sys.argv[1]))
tab = next(n for n in nodes if n["type"] == "tab")
configs = [n for n in nodes if n["type"] in ("mqtt-broker", "victron-client")]
body = {"id": tab["id"], "label": tab["label"], "info": tab.get("info", ""),
        "nodes": [n for n in nodes if n["type"] != "tab" and n not in configs], "configs": configs}
json.dump(body, sys.stdout)
EOF
if [ -n "$NR_FLOW_ID" ]; then   # replace an existing tab in place
  python3 -c "import json,sys; b=json.load(open('/tmp/gz-flow-body.json')); b['id']=sys.argv[1]; json.dump(b, open('/tmp/gz-flow-body.json','w'))" "$NR_FLOW_ID"
  code=$(curl -k -s -o /tmp/gz-flow-resp.json -w "%{http_code}" -X PUT "$NR_URL/flow/$NR_FLOW_ID" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @/tmp/gz-flow-body.json)
else
  code=$(curl -k -s -o /tmp/gz-flow-resp.json -w "%{http_code}" -X POST "$NR_URL/flow" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @/tmp/gz-flow-body.json)
fi
echo "deploy: HTTP $code"; cat /tmp/gz-flow-resp.json; echo
