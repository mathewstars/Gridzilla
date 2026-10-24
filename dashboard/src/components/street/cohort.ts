// Staggered cohorts (STORY-DAD (3)): the platform splits a PREPARE, RECOVER or ABSORB signal over n cohorts and a house
// is in cohort k when parseInt(sha256(device id).hex[0:8], 16) % n == k (agent/sim-agent.js). We hash the same way here,
// synchronously (crypto.subtle only exists on https or localhost, the stage may run on a plain LAN address).
import type { Signal, State } from "../../api";
import { pathOf, type House } from "../../model";

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** The first 32 bits of sha256(text), as an unsigned number (= parseInt(hex.slice(0, 8), 16)). */
export function sha256Head(text: string): number {
  const msg = new TextEncoder().encode(text);
  const len = Math.ceil((msg.length + 9) / 64) * 64;
  const buf = new Uint8Array(len);
  buf.set(msg);
  buf[msg.length] = 0x80;
  const bits = msg.length * 8;
  const dv = new DataView(buf.buffer);
  dv.setUint32(len - 8, Math.floor(bits / 2 ** 32));
  dv.setUint32(len - 4, bits >>> 0);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const r = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < len; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    H[0] += a;
    H[1] += b;
    H[2] += c;
    H[3] += d;
    H[4] += e;
    H[5] += f;
    H[6] += g;
    H[7] += h;
  }
  return H[0];
}

/** The device that owns the house's meter (the heat pump agent is a separate device behind it), as the agent hashes it. */
export const meterOf = (h: House) => h.devices.find((d) => !/vicare/.test(d.id))?.id ?? h.devices[0]?.id ?? h.key;

const memo = new Map<string, number>();
/** Which of n cohorts a house falls in. */
export function cohortOf(h: House, n: number): number {
  const id = meterOf(h);
  let v = memo.get(id);
  if (v == null) memo.set(id, (v = sha256Head(id)));
  return v % n;
}

/** The staggered signal over this transformer right now (its own, its feeder's or its substation's), else null. */
export function cohortSignal(s: State, tf: string): { seg: string; sig: Signal; n: number } | null {
  const path = new Set(pathOf(s, tf));
  let best: { seg: string; sig: Signal; n: number } | null = null;
  for (const [seg, sig] of Object.entries(s.active ?? {})) {
    const n = sig.cohort?.[1] ?? 0;
    if (path.has(seg) && n > 1 && (!best || sig.seq > best.sig.seq)) best = { seg, sig, n };
  }
  return best;
}
