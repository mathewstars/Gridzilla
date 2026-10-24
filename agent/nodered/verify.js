// Node-RED function node: VERIFY + SCOPE + FRESHNESS
// Wire: [mqtt in: gridzilla/sig/# and gridzilla/hb] -> this -> [merge.js]
// Setup tab: Modules -> add "crypto" as `crypto` (Node-RED >= 1.3, functionExternalModules: true in settings).
// On Venus OS Large: /data/home/nodered/.node-red/settings-user.js  ->  functionExternalModules: true
//
// Context expected (set once at registration / in a startup inject):
//   flow.platform_pub   : platform public key PEM, fetched from GET /api/pubkey and pinned (trust on first use)
//   flow.device_id      : e.g. "real-powerplant-blatnica"
//   flow.path           : ["region:at","sub:wien-sued","feeder:liesing-3","tf:atzgersdorf-1"]
//   flow.last_seq       : last accepted signal seq (persisted context store recommended)
//
// Outputs: 1 = verified signal (msg.signal), 2 = ack to publish (msg.topic/msg.payload), 3 = heartbeat ok (msg.hb = true)

const env = msg.payload;                              // {v, kid, payload, sig}
const pubPem = flow.get("platform_pub");
if (!pubPem) { node.error("no pinned platform key"); return null; }

const ok = env && env.v === 1 && typeof env.payload === "string" && typeof env.sig === "string" &&
  crypto.verify(null, Buffer.from(env.payload, "utf8"), crypto.createPublicKey(pubPem), Buffer.from(env.sig, "base64"));

const ack = (seq, status, reason) => ({
  topic: `gridzilla/ack/${flow.get("device_id")}`,
  ackdoc: { v: 1, device: flow.get("device_id"), path: flow.get("path"), seq, status, reason,
            applied: flow.get("effective") || {}, soc: flow.get("soc") || 0, grid_kw: flow.get("grid_kw") || 0,
            ts: new Date().toISOString().replace(/\.\d{3}Z$/, "Z") }
});

if (!ok) { node.warn("bad_sig"); return [null, ack(null, "refused", "bad_sig"), null]; }

const doc = JSON.parse(env.payload);

if (msg.topic === "gridzilla/hb") {
  const hbAge = (Date.now() - Date.parse(doc.ts)) / 1000;
  if (!(doc.seq > (flow.get("last_hb_seq") || 0)) || hbAge > 90 || hbAge < -30) return null;   // replayed or stale heartbeat: ignore
  flow.set("last_hb_seq", doc.seq); flow.set("last_hb", Date.now());
  return [null, null, { hb: true }];
}

if (!(flow.get("path") || []).includes(doc.segment)) return null;        // not for me
if (doc.cohort && (parseInt(crypto.createHash("sha256").update(flow.get("device_id")).digest("hex").slice(0, 8), 16) % doc.cohort[1]) !== doc.cohort[0]) return null; // not my cohort

const lastSeq = flow.get("last_seq") || 0;
if (doc.seq <= lastSeq) { node.warn(`stale_seq ${doc.seq} <= ${lastSeq}`); return [null, ack(doc.seq, "refused", "stale_seq"), null]; }

const age = (Date.now() - Date.parse(doc.issued_at)) / 1000;
if (age > 120 || age < -30 || Date.parse(doc.valid_to) < Date.now()) return [null, ack(doc.seq, "refused", "expired"), null];

flow.set("last_seq", doc.seq);
msg.signal = doc;
return [msg, null, null];
