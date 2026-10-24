// One transformer's street as a living product render (round 2 stage). The transformer is the hero, front and centre:
// its body turns green / orange / red with its load and eases back when load falls. Behind it the houses: soft white
// clay with solar panels that catch the sun, a battery whose green fill is its charge, a heat pump whose fan spins
// with its kW, a car parked beside the house while it charges, and a small blue light on the roof while the house
// follows Gridzilla. Dots run along the wires into houses taking power and out of houses giving it back, faster for
// more kW. Sun, light and shadows follow grid time and the real cloud cover. Everything that moves is a real reading.
// Perf: every repeated part is one instanced mesh moved in useFrame (no React state per frame), wires are one merged
// geometry, so the whole street is ~30 draw calls.
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject, type RefObject } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { House } from "../../model";
import { P, loadTone } from "../../stage/palette";
import { FLOW_EPS, flowSpeed, type StreetModel } from "./layout";
import { lightAt, newLight } from "./sky";
import type { HoverInfo } from "./Street3D";

type HoverFn = (h: HoverInfo | null) => void;
const noRay = () => {};

// ------------------------------------------------------------------ the street plan (world units ~ metres / 2)
const TF_Z = 4.4; // the transformer, front and centre on the road
const TF_TOP = 4.15; // where its wires leave the roof
const SUB_X = -10.5; // substation on the left, feeding the transformer
const ROW0 = -1.2; // first row of houses
const LOT = 6.2; // between rows
const OFFSET = 5.4; // house centre from the road centre
const ROAD_W = 2.8;
const POLE_X = 1.75; // poles along the right road edge
const POLE_H = 3.9;

interface Lot {
  i: number;
  house: House | null; // null = neighbour outside the program
  x: number;
  z: number;
  side: 1 | -1;
  face: 1 | -1; // the road-facing wall points this way along x
  row: number;
  w: number;
  h: number;
  d: number;
}

function lotsOf(st: StreetModel, slots: number): Lot[] {
  const n = Math.max(slots, st.houses.length);
  return Array.from({ length: n }, (_, i) => {
    const side = (i % 2 === 0 ? -1 : 1) as 1 | -1;
    const row = Math.floor(i / 2);
    const house = st.houses[i]?.house ?? null;
    const big = !!house;
    return {
      i,
      house,
      x: side * OFFSET,
      z: ROW0 - row * LOT,
      side,
      face: (-side) as 1 | -1,
      row,
      w: big ? 3.0 : 2.6,
      h: big ? 2.0 : 1.7,
      d: big ? 3.2 : 2.8,
    };
  });
}

// ------------------------------------------------------------------ shared geometry and materials
const box = new THREE.BoxGeometry(1, 1, 1);
const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 20);
const ball = new THREE.SphereGeometry(1, 16, 12);
const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
/** Triangular prism, base 1 wide on y = 0, apex at y = 1, ridge along z, 1 long. */
const roofGeo = (() => {
  const g = new THREE.CylinderGeometry(1, 1, 1, 3, 1).rotateX(-Math.PI / 2);
  g.scale(1 / Math.sqrt(3), 1 / 1.5, 1);
  g.translate(0, 0.5 / 1.5, 0);
  return g;
})();

const clay = (color: string, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, ...o });

const mat = {
  wall: clay("#ffffff"),
  roof: clay("#fbfbfd", { flatShading: true }),
  window: clay("#d4d9e2", { roughness: 0.35, emissive: new THREE.Color("#ffc977"), emissiveIntensity: 0 }),
  panel: clay("#ffffff", { roughness: 0.32, metalness: 0.25 }), // tinted per panel by the sun
  battShell: clay("#d2d2d7"),
  battFill: clay(P.green, { roughness: 0.6 }),
  hpBody: clay("#e8e8ed"),
  grille: clay("#c7c7cc"),
  blade: clay("#3a3a3c"),
  carBody: clay("#ffffff", { roughness: 0.5 }),
  carGlass: clay("#6e7480", { roughness: 0.25 }),
  marker: new THREE.MeshBasicMaterial({ color: P.blue }),
  pole: clay("#d2d2d7"),
  wire: new THREE.MeshBasicMaterial({ color: "#a1a1a6" }),
  dot: new THREE.MeshBasicMaterial({ color: "#ffffff" }), // coloured per dot
  road: new THREE.MeshBasicMaterial({ color: "#e9e9ee" }),
  tfBase: clay("#e8e8ed"),
  tfBody: clay(P.green, { roughness: 0.62 }),
  tfRoof: clay("#ffffff"),
  bushing: clay("#c7c7cc"),
  sub: clay("#ffffff"),
};

const PANEL_DARK = new THREE.Color("#233049");
const PANEL_LIT = new THREE.Color("#8fb0dd");
const DOT_TAKE = new THREE.Color(P.ink); // power going into a house
const DOT_GIVE = new THREE.Color(P.green); // clean power flowing back
const HIDE = 1e-4;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const mtx = (x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0, out = new THREE.Matrix4()) =>
  out.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));

// ------------------------------------------------------------------ static instanced parts
interface Part {
  m: THREE.Matrix4;
  owner: number; // lot index, -1 = none
}

function Instanced({ geo, material, parts, onHover, shadow = true }: { geo: THREE.BufferGeometry; material: THREE.Material; parts: Part[]; onHover?: (owner: number, e: ThreeEvent<PointerEvent | MouseEvent>) => void; shadow?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    parts.forEach((p, i) => mesh.setMatrixAt(i, p.m));
    mesh.count = parts.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [parts]);
  if (!parts.length) return null;
  const at = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    e.stopPropagation();
    if (e.instanceId != null) onHover?.(parts[e.instanceId]?.owner ?? -1, e);
  };
  return (
    <instancedMesh
      key={parts.length}
      ref={ref}
      args={[geo, material, parts.length]}
      castShadow={shadow}
      receiveShadow
      frustumCulled={false}
      raycast={onHover ? undefined : noRay}
      onPointerOver={onHover ? at : undefined}
      onPointerMove={onHover ? at : undefined}
      onClick={onHover ? at : undefined}
    />
  );
}

/** Everything about the houses that only depends on where they stand. */
function useStaticParts(lots: Lot[]) {
  return useMemo(() => {
    const walls: Part[] = [],
      roofs: Part[] = [],
      windows: Part[] = [],
      panels: (Part & { n: THREE.Vector3 })[] = [],
      shells: Part[] = [],
      hpBodies: Part[] = [],
      grilles: Part[] = [],
      poles: Part[] = [];
    for (const l of lots) {
      const { x, z, w, h, d, face } = l;
      const rh = l.house ? 1.25 : 1.05;
      walls.push({ m: mtx(x, h / 2, z, w, h, d), owner: l.i });
      roofs.push({ m: mtx(x, h, z, w + 0.4, rh, d + 0.3), owner: l.i });
      // one wide window on the road side, two on each end wall: glass by day, warm light by night
      windows.push({ m: mtx(x + face * (w / 2 + 0.02), h * 0.62, z, 0.04, h * 0.3, 0.9), owner: l.i });
      for (const end of [-1, 1]) for (const dx of [-0.6, 0.6]) windows.push({ m: mtx(x + dx * (w / 3), h * 0.6, z + end * (d / 2 + 0.02), 0.6, h * 0.3, 0.04), owner: l.i });
      const hs = l.house;
      if (hs?.hasPv) {
        const half = (w + 0.4) / 2;
        const slope = Math.atan2(rh, half);
        const along = Math.hypot(half, rh);
        const n = new THREE.Vector3(face * Math.sin(slope), Math.cos(slope), 0);
        panels.push({
          m: mtx(x + face * (half / 2) + n.x * 0.05, h + rh / 2 + n.y * 0.05, z, along * 0.78, 0.06, d * 0.82, 0, 0, -face * slope),
          owner: l.i,
          n,
        });
      }
      if (hs && hs.kwh > 0) shells.push({ m: mtx(x + face * (w / 2 + 0.09), 0.7, z + 0.85, 0.16, 1.36, 0.62), owner: l.i });
      if (hs?.hasHeat) {
        const bx = x + face * (w / 2 + 0.28);
        hpBodies.push({ m: mtx(bx, 0.44, z - 0.85, 0.5, 0.82, 0.95), owner: l.i });
        grilles.push({ m: mtx(bx + face * 0.255, 0.46, z - 0.85, 0.66, 0.03, 0.66, 0, 0, Math.PI / 2), owner: l.i });
      }
    }
    const rows = Math.max(1, ...lots.map((l) => l.row + 1));
    for (let r = 0; r < rows; r++) poles.push({ m: mtx(POLE_X, POLE_H / 2, ROW0 - r * LOT, 0.14, POLE_H, 0.14), owner: -1 });
    poles.push({ m: mtx((SUB_X + 1.6) / 2 - 0.4, (POLE_H - 0.2) / 2, TF_Z, 0.14, POLE_H - 0.2, 0.14), owner: -1 });
    return { walls, roofs, windows, panels, shells, hpBodies, grilles, poles };
  }, [lots]);
}

// ------------------------------------------------------------------ wires and the power dots
interface Wire {
  id: string; // "feed", "spine:<row>", "lot:<i>"
  curve: THREE.QuadraticBezierCurve3;
  len: number;
  r: number; // dot radius
}

function sag(a: THREE.Vector3, b: THREE.Vector3, s: number) {
  const mid = a.clone().lerp(b, 0.5);
  mid.y -= s;
  return new THREE.QuadraticBezierCurve3(a, mid, b);
}

function useWires(lots: Lot[]) {
  return useMemo(() => {
    const wires: Wire[] = [];
    const add = (id: string, c: THREE.QuadraticBezierCurve3, r: number) => wires.push({ id, curve: c, len: c.getLength(), r });
    const tfTap = new THREE.Vector3(0.6, TF_TOP, TF_Z);
    add("feed", sag(new THREE.Vector3(SUB_X + 1.6, 3.3, TF_Z), new THREE.Vector3(-0.6, TF_TOP, TF_Z), 0.45), 0.15);
    const rows = Math.max(1, ...lots.map((l) => l.row + 1));
    let prev = tfTap;
    for (let r = 0; r < rows; r++) {
      const top = new THREE.Vector3(POLE_X, POLE_H, ROW0 - r * LOT);
      add(`spine:${r}`, sag(prev, top, 0.3), 0.13);
      prev = top;
    }
    for (const l of lots) {
      const eave = new THREE.Vector3(l.x + l.face * (l.w / 2 + 0.05), l.h + 0.05, l.z + 0.2);
      add(`lot:${l.i}`, sag(new THREE.Vector3(POLE_X, POLE_H, ROW0 - l.row * LOT), eave, 0.35), 0.11);
    }
    const geo = mergeGeometries(wires.map((w) => new THREE.TubeGeometry(w.curve, 20, w.id === "feed" ? 0.04 : 0.028, 5, false)));
    return { wires, geo };
  }, [lots]);
}

const MAX_DOTS = 600;

interface Flow {
  kw: Record<string, number>;
}

/** kW on every wire. + = away from the substation (into the houses), - = back towards it. */
function flowsOf(st: StreetModel, lots: Lot[], otherKw: number): Record<string, number> {
  const kw: Record<string, number> = { feed: st.load_kw ?? 0 };
  const now = new Map(st.houses.map(({ house }) => [house.key, house])); // lots keep the house from layout time

  const perOther = st.others > 0 ? otherKw / st.others : 0; // a neighbour outside the program: the street's average
  const rows = Math.max(1, ...lots.map((l) => l.row + 1));
  const byRow = new Array(rows).fill(0);
  for (const l of lots) {
    const h = l.house ? now.get(l.house.key) ?? l.house : null;
    const v = h ? (h.online ? h.grid_kw : 0) : perOther;
    kw[`lot:${l.i}`] = v;
    byRow[l.row] += v;
  }
  let beyond = 0;
  for (let r = rows - 1; r >= 0; r--) {
    beyond += byRow[r];
    kw[`spine:${r}`] = beyond;
  }
  return kw;
}

function PowerDots({ wires, flow, still }: { wires: Wire[]; flow: MutableRefObject<Flow>; still: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const phase = useRef<Record<string, number>>({});
  const p = useMemo(() => new THREE.Vector3(), []);
  const m = useMemo(() => new THREE.Matrix4(), []);
  useLayoutEffect(() => {
    // create the per-dot colour buffer once
    ref.current?.setColorAt(0, DOT_TAKE);
  }, []);
  useFrame((_, dt) => {
    const mesh = ref.current;
    if (!mesh) return;
    const step = still ? 0 : Math.min(dt, 0.05);
    let k = 0;
    for (const w of wires) {
      const f = flow.current.kw[w.id] ?? 0;
      if (Math.abs(f) < FLOW_EPS) continue;
      const n = Math.max(2, Math.round(w.len / 1.3));
      let ph = (phase.current[w.id] ?? Math.random()) + (step * flowSpeed(f) * Math.sign(f)) / w.len;
      ph -= Math.floor(ph);
      phase.current[w.id] = ph;
      const c = f > 0 ? DOT_TAKE : DOT_GIVE;
      for (let j = 0; j < n && k < MAX_DOTS; j++, k++) {
        w.curve.getPoint((ph + j / n) % 1, p);
        m.makeScale(w.r, w.r, w.r).setPosition(p);
        mesh.setMatrixAt(k, m);
        mesh.setColorAt(k, c);
      }
    }
    mesh.count = k;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[ball, mat.dot, MAX_DOTS]} raycast={noRay} frustumCulled={false} />;
}

// ------------------------------------------------------------------ the parts that react to readings
interface Env {
  sun: number;
  sunDir: THREE.Vector3;
}

/** Battery fills, heat-pump fans, charging cars and Gridzilla roof lights, eased toward each new reading. */
function LiveParts({ lots, live, still }: { lots: Lot[]; live: MutableRefObject<Map<string, House & { shape: boolean }>>; still: boolean }) {
  const fill = useRef<THREE.InstancedMesh>(null);
  const blade = useRef<THREE.InstancedMesh>(null);
  const car = useRef<THREE.InstancedMesh>(null);
  const glass = useRef<THREE.InstancedMesh>(null);
  const marker = useRef<THREE.InstancedMesh>(null);
  const prog = useMemo(() => lots.filter((l) => l.house), [lots]);
  const batt = useMemo(() => prog.filter((l) => l.house!.kwh > 0), [prog]);
  const hp = useMemo(() => prog.filter((l) => l.house!.hasHeat), [prog]);
  // eased state per lot: shown battery level, fan angle and speed, car and marker size
  const st = useRef(new Map<number, { soc: number; ang: number; spin: number; car: number; mark: number }>());
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const ease = (k: number) => (still ? 1 : 1 - Math.exp(-dt * k));
    const get = (i: number) => {
      let v = st.current.get(i);
      if (!v) st.current.set(i, (v = { soc: -1, ang: 0, spin: 0, car: 0, mark: 0 }));
      return v;
    };
    batt.forEach((l, k) => {
      const h = live.current.get(l.house!.key) ?? l.house!;
      const v = get(l.i);
      const target = h.online ? Math.max(0, Math.min(100, h.soc ?? 0)) / 100 : 0;
      v.soc = v.soc < 0 ? target : v.soc + (target - v.soc) * ease(2.5);
      const hgt = Math.max(HIDE, 1.2 * v.soc);
      fill.current?.setMatrixAt(k, mtx(l.x + l.face * (l.w / 2 + 0.1), 0.08 + hgt / 2, l.z + 0.85, 0.18, hgt, 0.48, 0, 0, 0, _m));
    });
    hp.forEach((l, k) => {
      const h = live.current.get(l.house!.key) ?? l.house!;
      const v = get(l.i);
      const kw = h.online ? h.hp_kw : 0;
      const target = kw > 0.05 ? 3 + Math.min(kw, 12) * 1.6 : 0; // radians per second
      v.spin += (target - v.spin) * ease(1.5);
      if (!still) v.ang += v.spin * dt;
      const bx = l.x + l.face * (l.w / 2 + 0.28 + 0.285);
      for (let j = 0; j < 2; j++) blade.current?.setMatrixAt(2 * k + j, mtx(bx, 0.46, l.z - 0.85, 0.02, 0.58, 0.09, v.ang + (j * Math.PI) / 2, 0, 0, _m));
    });
    prog.forEach((l, k) => {
      const h = live.current.get(l.house!.key) ?? l.house!;
      const v = get(l.i);
      v.car += ((h.online && h.ev_kw > 0.05 ? 1 : 0) - v.car) * ease(4);
      v.mark += ((h.underSignal || (h as { shape?: boolean }).shape ? 1 : 0) - v.mark) * ease(4);
      const c = Math.max(HIDE, v.car);
      const cz = l.z + l.d / 2 + 1.05; // beside the house, nose to the road
      car.current?.setMatrixAt(k, mtx(l.x + l.face * 0.2, 0.36 * c, cz, 1.9 * c, 0.5 * c, 0.95 * c, 0, 0, 0, _m));
      glass.current?.setMatrixAt(k, mtx(l.x + l.face * 0.05, 0.76 * c, cz, 0.95 * c, 0.3 * c, 0.78 * c, 0, 0, 0, _m));
      const s = Math.max(HIDE, 0.17 * v.mark);
      marker.current?.setMatrixAt(k, mtx(l.x, l.h + 1.25 + 0.12, l.z + 0.9, s, s, s, 0, 0, 0, _m));
    });
    for (const r of [fill, blade, car, glass, marker]) if (r.current) r.current.instanceMatrix.needsUpdate = true;
  });
  const im = (ref: RefObject<THREE.InstancedMesh>, geo: THREE.BufferGeometry, material: THREE.Material, n: number, shadow = true) =>
    n > 0 && <instancedMesh key={`${material.uuid}:${n}`} ref={ref} args={[geo, material, n]} castShadow={shadow} receiveShadow raycast={noRay} frustumCulled={false} />;
  return (
    <>
      {im(fill, box, mat.battFill, batt.length)}
      {im(blade, box, mat.blade, hp.length * 2)}
      {im(car, box, mat.carBody, prog.length)}
      {im(glass, box, mat.carGlass, prog.length)}
      {im(marker, ball, mat.marker, prog.length, false)}
    </>
  );
}

/** Panels tint and shine with how squarely the sun hits them right now. */
function Panels({ parts, env }: { parts: (Part & { n: THREE.Vector3 })[]; env: MutableRefObject<Env> }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const c = useMemo(() => new THREE.Color(), []);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    parts.forEach((p, i) => {
      mesh.setMatrixAt(i, p.m);
      mesh.setColorAt(i, PANEL_DARK);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [parts]);
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    parts.forEach((p, i) => {
      const hit = env.current.sun * Math.max(0, p.n.dot(env.current.sunDir));
      mesh.setColorAt(i, c.copy(PANEL_DARK).lerp(PANEL_LIT, Math.min(1, hit * 1.15)));
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  if (!parts.length) return null;
  return <instancedMesh key={parts.length} ref={ref} args={[box, mat.panel, parts.length]} castShadow receiveShadow raycast={noRay} frustumCulled={false} />;
}

// ------------------------------------------------------------------ the hero transformer
const FINS = [-1.05, -0.35, 0.35, 1.05];

function B(p: { material: THREE.Material; s: [number, number, number]; at: [number, number, number] }) {
  return <mesh geometry={box} material={p.material} scale={p.s} position={p.at} castShadow receiveShadow />;
}

function Transformer({ st, onHover, onSelect, interactive }: { st: StreetModel; onHover: HoverFn; onSelect?: (tf: string) => void; interactive: boolean }) {
  const tone = loadTone(st.pct);
  const from = useRef(new THREE.Color(tone));
  const to = useRef(new THREE.Color(tone));
  const t0 = useRef(-1);
  useEffect(() => {
    from.current.copy(mat.tfBody.color);
    to.current.set(tone);
    t0.current = -1; // start the 0.6 s ease on the next frame
  }, [tone]);
  useFrame(({ clock }) => {
    if (t0.current < 0) t0.current = clock.elapsedTime;
    const t = Math.min(1, (clock.elapsedTime - t0.current) / 0.6);
    const e = 1 - Math.pow(1 - t, 3);
    mat.tfBody.color.copy(from.current).lerp(to.current, e);
  });
  const at = (e: ThreeEvent<PointerEvent | MouseEvent>) => onHover({ kind: "tf", street: st, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
  const ev = interactive
    ? {
        onPointerOver: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          at(e);
          if (onSelect) document.body.style.cursor = "pointer";
        },
        onPointerMove: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          at(e);
        },
        onPointerOut: () => {
          onHover(null);
          document.body.style.cursor = "";
        },
        onClick: (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          at(e);
          onSelect?.(st.tf);
        },
      }
    : {};
  return (
    <group position={[0, 0, TF_Z]} {...ev}>
      <B material={mat.tfBase} s={[4.8, 0.26, 3.8]} at={[0, 0.13, 0]} />
      <B material={mat.tfBody} s={[3.6, 3.1, 2.7]} at={[0, 0.26 + 1.55, 0]} />
      {/* cooling fins on the long sides, same colour as the body */}
      {FINS.map((dx) => [-1, 1].map((sd) => <B key={`${dx}:${sd}`} material={mat.tfBody} s={[0.16, 2.5, 0.26]} at={[dx, 0.26 + 1.45, sd * 1.45]} />))}
      <B material={mat.tfRoof} s={[4.0, 0.3, 3.1]} at={[0, 0.26 + 3.1 + 0.15, 0]} />
      {[-0.6, 0, 0.6].map((dx) => (
        <mesh key={dx} geometry={cyl} material={mat.bushing} scale={[0.22, 0.5, 0.22]} position={[dx, 3.66 + 0.25, 0]} castShadow />
      ))}
    </group>
  );
}

function Substation({ onHover, interactive }: { onHover: HoverFn; interactive: boolean }) {
  const at = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    e.stopPropagation();
    onHover({ kind: "substation", x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
  };
  return (
    <group position={[SUB_X, 0, TF_Z]} {...(interactive ? { onPointerOver: at, onPointerMove: at, onPointerOut: () => onHover(null), onClick: at } : {})}>
      <mesh geometry={box} material={mat.tfBase} scale={[4.4, 0.2, 3.6]} position-y={0.1} receiveShadow />
      {[-1, 1].map((dx) => (
        <mesh key={dx} geometry={box} material={mat.sub} scale={[1.6, 2.8, 2.3]} position={[dx * 1.05, 1.6, 0]} castShadow receiveShadow />
      ))}
      <mesh geometry={cyl} material={mat.pole} scale={[0.14, 3.3, 0.14]} position={[1.6, 1.65, 0]} castShadow />
    </group>
  );
}

// ------------------------------------------------------------------ sky: sun, light and shadows follow grid time
function SkyRig({ hour, cloud, env, centerZ, shadowRef }: { hour: number; cloud: number; env: MutableRefObject<Env>; centerZ: number; shadowRef: RefObject<THREE.ShadowMaterial> }) {
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const { scene } = useThree();
  const light = useMemo(newLight, []);
  const shown = useRef({ h: hour, c: cloud });
  const target = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => {
    scene.background = new THREE.Color(P.ground);
    scene.add(target);
    return () => {
      scene.remove(target);
    };
  }, [scene, target]);
  useFrame((_, dtRaw) => {
    const k = 1 - Math.exp(-Math.min(dtRaw, 0.1) * 1.8);
    // grid time moves in poll-sized steps: ease the shown hour toward it the short way round midnight
    let dh = hour - shown.current.h;
    dh = ((dh % 24) + 36) % 24 - 12;
    shown.current.h = Math.abs(dh) > 6 ? hour : shown.current.h + dh * k;
    shown.current.c += (cloud - shown.current.c) * k;
    lightAt(shown.current.h, shown.current.c, light);
    target.position.set(0, 0, centerZ);
    target.updateMatrixWorld();
    if (sun.current) {
      sun.current.position.copy(light.dir).multiplyScalar(45).add(target.position);
      sun.current.intensity = light.intensity;
      sun.current.color.copy(light.color);
      sun.current.target = target;
    }
    if (hemi.current) {
      hemi.current.intensity = light.hemi;
      hemi.current.color.copy(light.hemiSky);
    }
    if (scene.background instanceof THREE.Color) scene.background.copy(light.bg);
    if (shadowRef.current) shadowRef.current.opacity = light.shadow;
    mat.window.emissiveIntensity = light.windows * 1.3;
    env.current.sun = light.sun;
    env.current.sunDir.copy(light.sunDir);
  });
  return (
    <>
      <hemisphereLight ref={hemi} args={["#ffffff", "#f2f2f5", 1.6]} />
      <directionalLight
        ref={sun}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-26}
        shadow-camera-right={26}
        shadow-camera-top={26}
        shadow-camera-bottom={-26}
        shadow-camera-near={1}
        shadow-camera-far={110}
      />
    </>
  );
}

// ------------------------------------------------------------------ camera: frame the street, sway slowly
const PHI = 1.0; // from straight above: ~33 degrees above the horizon
const THETA = 0.42; // from the front right
const SWAY = 0.26; // radians either way
const SWAY_S = 48; // seconds for one slow sway

function CameraRig({ pts, still, interactive }: { pts: THREE.Vector3[]; still: boolean; interactive: boolean }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, size, clock } = useThree();
  const lastTouch = useRef(-100);
  const sph = useMemo(() => new THREE.Spherical(), []);
  const off = useMemo(() => new THREE.Vector3(), []);
  const target = useMemo(() => new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3()), [pts]);

  // the smallest distance at which the street fits, then a lens shift that centres it (raycasting stays correct)
  const frame = useMemo(() => {
    const w = Math.max(1, size.width),
      h = Math.max(1, size.height);
    const cam = new THREE.PerspectiveCamera((camera as THREE.PerspectiveCamera).fov, w / h, 0.5, 2000);
    const v = new THREE.Vector3();
    const edge = 0.86; // room for the sway
    const extent = (r: number) => {
      cam.position.copy(target).add(v.setFromSphericalCoords(r, PHI, THETA));
      cam.lookAt(target);
      cam.updateMatrixWorld();
      let x0 = Infinity,
        x1 = -Infinity,
        y0 = Infinity,
        y1 = -Infinity,
        behind = false;
      for (const p of pts) {
        v.copy(p).project(cam);
        if (v.z >= 1) behind = true;
        x0 = Math.min(x0, v.x);
        x1 = Math.max(x1, v.x);
        y0 = Math.min(y0, v.y);
        y1 = Math.max(y1, v.y);
      }
      return { x0, x1, y0, y1, behind };
    };
    let lo = 4,
      hi = 800;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      const e = extent(mid);
      if (!e.behind && e.x1 - e.x0 <= 2 * edge && e.y1 - e.y0 <= 2 * edge) hi = mid;
      else lo = mid;
    }
    const e = extent(hi);
    return { radius: hi, offX: ((e.x0 + e.x1) / 2) * (w / 2), offY: (-(e.y0 + e.y1) / 2) * (h / 2), w, h };
  }, [camera, size.width, size.height, pts, target]);

  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.setViewOffset(frame.w, frame.h, frame.offX, frame.offY, frame.w, frame.h);
    cam.position.copy(target).add(off.setFromSphericalCoords(frame.radius, PHI, THETA));
    cam.lookAt(target);
    controls.current?.target.copy(target);
    controls.current?.update();
    cam.far = frame.radius * 4;
    cam.updateProjectionMatrix();
  }, [camera, frame, target, off]);

  // a slow sway around the front; after someone drags, wait 6 s and ease back into it
  useFrame(({ clock }, dt) => {
    if (clock.elapsedTime - lastTouch.current < 6) return;
    off.copy(camera.position).sub(target);
    sph.setFromVector3(off);
    const want = THETA + (still ? 0 : SWAY * Math.sin((clock.elapsedTime * 2 * Math.PI) / SWAY_S));
    const k = still ? 1 : Math.min(1, Math.min(dt, 0.05) * 1.2);
    sph.theta += (want - sph.theta) * k;
    sph.phi += (PHI - sph.phi) * k;
    sph.radius += (frame.radius - sph.radius) * k;
    off.setFromSpherical(sph);
    camera.position.copy(target).add(off);
    camera.lookAt(target);
  });
  if (!interactive) return null;
  return (
    <OrbitControls
      ref={controls}
      target={target}
      enablePan={false}
      enableZoom={false}
      enableDamping={!still}
      dampingFactor={0.12}
      rotateSpeed={0.5}
      minPolarAngle={0.35}
      maxPolarAngle={1.25}
      onStart={() => (lastTouch.current = 1e9)}
      onEnd={() => (lastTouch.current = clock.elapsedTime)}
    />
  );
}

// ------------------------------------------------------------------ the scene
export interface LivingProps {
  st: StreetModel;
  shapeKeys: Set<string>; // houses following the SHAPE flattening plan
  otherKw: number; // the transformer's load from homes outside the program
  hour: number; // grid time
  cloud: number; // 0..1
  onHover: HoverFn;
  onSelect?: (tf: string) => void;
  interactive: boolean;
  still: boolean;
  slots?: number;
}

export default function Living3D({ st, shapeKeys, otherKw, hour, cloud, onHover, onSelect, interactive, still, slots = 6 }: LivingProps) {
  const layoutKey = `${st.tf}|${st.houses.map((h) => `${h.house.key}:${h.house.hasPv ? 1 : 0}${h.house.kwh > 0 ? 1 : 0}${h.house.hasHeat ? 1 : 0}`).join(",")}|${slots}`;
  const lots = useMemo(() => lotsOf(st, slots), [layoutKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const parts = useStaticParts(lots);
  const { wires, geo } = useWires(lots);
  useEffect(() => () => geo.dispose(), [geo]);

  // latest readings live in refs, so useFrame reads them without re-rendering
  const live = useRef(new Map<string, House & { shape: boolean }>());
  const flow = useRef<Flow>({ kw: {} });
  useEffect(() => {
    live.current = new Map(st.houses.map(({ house }) => [house.key, { ...house, shape: shapeKeys.has(house.key) }]));
    flow.current = { kw: flowsOf(st, lots, otherKw) };
  }, [st, lots, otherKw, shapeKeys]);
  const env = useRef<Env>({ sun: 0, sunDir: new THREE.Vector3(0, 1, 0) });
  const shadowMat = useRef<THREE.ShadowMaterial>(null);

  const hoverLot = (owner: number, e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const l = lots[owner];
    if (!l) return;
    const x = e.nativeEvent.offsetX,
      y = e.nativeEvent.offsetY;
    if (l.house) onHover({ kind: "house", house: live.current.get(l.house.key) ?? l.house, x, y });
    else onHover({ kind: "normal", street: st, x, y });
  };
  const hov = interactive ? hoverLot : undefined;

  const rows = Math.max(1, ...lots.map((l) => l.row + 1));
  const back = ROW0 - (rows - 1) * LOT - 2.2;
  const centerZ = (TF_Z + back) / 2;
  const pts = useMemo(() => {
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    return [v(SUB_X - 2.3, 0, TF_Z + 1.9), v(SUB_X - 2.3, 3.2, TF_Z), v(0, 0, TF_Z + 2.0), v(0, TF_TOP + 0.4, TF_Z), v(-OFFSET - 1.8, 0, back), v(OFFSET + 1.8, 0, back), v(-OFFSET - 1.8, 3.3, back), v(OFFSET + 1.8, 3.3, back), v(OFFSET + 1.8, 0, TF_Z)];
  }, [back]);
  const roadLen = TF_Z + 1 - back;

  return (
    <Canvas
      flat
      shadows
      dpr={[1, 1.75]}
      camera={{ fov: 26, near: 0.5, far: 400, position: [10, 30, 40] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      style={{ pointerEvents: interactive ? "auto" : "none" }}
      onPointerMissed={() => onHover(null)}
      onPointerLeave={() => onHover(null)}
    >
      <SkyRig hour={hour} cloud={cloud} env={env} centerZ={centerZ} shadowRef={shadowMat} />
      {/* the ground is the background itself: only the shadows show on it, so it stays light at every hour */}
      <mesh geometry={plane} scale={[400, 1, 400]} receiveShadow raycast={noRay}>
        <shadowMaterial ref={shadowMat} opacity={0.12} color="#1d1d1f" />
      </mesh>
      <ContactShadows key={layoutKey} frames={1} position={[-2, 0.012, centerZ]} scale={[34, roadLen + 8]} resolution={1024} blur={2.4} far={2.5} opacity={0.42} color="#1d1d1f" />
      <mesh geometry={plane} material={mat.road} scale={[ROAD_W, 1, roadLen]} position={[0, 0.006, (TF_Z + 1 + back) / 2]} raycast={noRay} />
      <Substation onHover={onHover} interactive={interactive} />
      <Transformer st={st} onHover={onHover} onSelect={onSelect} interactive={interactive} />
      <Instanced geo={box} material={mat.wall} parts={parts.walls} onHover={hov} />
      <Instanced geo={roofGeo} material={mat.roof} parts={parts.roofs} onHover={hov} />
      <Instanced geo={box} material={mat.window} parts={parts.windows} shadow={false} />
      <Panels parts={parts.panels} env={env} />
      <Instanced geo={box} material={mat.battShell} parts={parts.shells} />
      <Instanced geo={box} material={mat.hpBody} parts={parts.hpBodies} />
      <Instanced geo={cyl} material={mat.grille} parts={parts.grilles} />
      <Instanced geo={cyl} material={mat.pole} parts={parts.poles} />
      <LiveParts lots={lots} live={live} still={still} />
      <mesh geometry={geo} material={mat.wire} raycast={noRay} />
      <PowerDots wires={wires} flow={flow} still={still} />
      <CameraRig pts={pts} still={still} interactive={interactive} />
    </Canvas>
  );
}
