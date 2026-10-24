// One transformer's street as a calm product render (round 2 stage). A believable suburban street at real scale:
// 10 to 16 houses from Kenney's CC0 "City Kit (Suburban)" (public/models, License.txt) with slate roofs, trees in the
// back gardens and a driveway in each front yard. The transformer is a green substation kiosk at the head of the
// street (louvres, a double door) whose body turns green / orange from 85 % / red at 100 % of its limit and eases back
// when load falls. Solar panels on the PV roofs catch the sun, a battery's green fill is its charge, a heat pump's fan
// spins with its kW, a car stands in the driveway while it charges. Dots run along the wires into houses taking power
// and out of houses giving it back, faster for more kW. Sun, light and shadows follow grid time and real cloud cover.
// A house that follows Gridzilla (diet plan or a signal) stands on a green lot; when real readings show houses switching,
// their lots grow in and pulse, grouped by cohort while a staggered signal runs (the fleet fills in waves).
// Perf: every repeated part (each house model too) is one instanced mesh moved in useFrame (no React state per frame),
// wires are one merged geometry, so the whole street stays around 35 draw calls. The canvas stops drawing when the
// parent says so (off-screen or hidden tab) and counts its frames on window.__gz3d.frames for the QA gate G5.
import { ContactShadows, OrbitControls, useGLTF, useTexture } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject, type RefObject } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { House } from "../../model";
import { cohortOf } from "./cohort";
import { P, loadTone } from "../../stage/palette";
import { FLOW_EPS, flowSpeed, type StreetModel } from "./layout";
import { lightAt, newLight } from "./sky";
import type { HoverInfo } from "./Street3D";

type HoverFn = (h: HoverInfo | null) => void;
const noRay = () => {};

// ------------------------------------------------------------------ the model kit (served under the Vite base)
const KIT = `${import.meta.env.BASE_URL}models/`;
const KINDS = ["a", "c", "e", "g", "i", "m"] as const;
type Kind = (typeof KINDS)[number];
const MODELS = [...KINDS.map((k) => `${KIT}building-type-${k}.glb`), `${KIT}tree-large.glb`, `${KIT}tree-small.glb`];
const SLATE = `${KIT}Textures/colormap-slate.png`; // the kit's colour map with the green roofs turned slate grey
useGLTF.preload(MODELS, false, false);

const HS = 3.6; // model units to world units (world ~ metres / 2): a house is ~9 m wide and ~6 m to the ridge
/** Model size in model units: w = along the ridge, d = front to back, h = to the ridge, eave = wire height. */
const DIM: Record<Kind, { w: number; d: number; h: number; eave: number }> = {
  a: { w: 1.3, d: 1.03, h: 0.83, eave: 0.6 },
  c: { w: 1.29, d: 1.03, h: 1.03, eave: 0.75 },
  e: { w: 1.3, d: 1.03, h: 1.14, eave: 0.75 },
  g: { w: 1.45, d: 1.18, h: 0.77, eave: 0.5 },
  i: { w: 1.29, d: 1.03, h: 0.74, eave: 0.5 },
  m: { w: 1.43, d: 1.43, h: 0.74, eave: 0.45 },
};
const PV_KINDS: Kind[] = ["a", "i"]; // plain pitched roofs that take a panel field cleanly
const MIX: Kind[] = ["c", "e", "g", "m", "a", "i"];

// ------------------------------------------------------------------ the street plan (world units ~ metres / 2)
const ROW0 = 0; // first row of houses
const LOT = 6.4; // between rows
const OFFSET = 6.2; // house centre from the road centre
const ROAD_W = 3.0;
const TF_Z = ROW0 + 7.4; // the transformer kiosk, at the head of the street
/** The kiosk is drawn at about twice a house's footprint so its load colour reads from across the room. */
const KS: [number, number, number] = [2.3, 1.75, 2.3];
const TF_TOP = 2.62 * KS[1]; // where its wires leave the roof
const TF_TAP = 0.55 * KS[0]; // the outer bushings, either side of the centre
const SUB_X = -10; // substation on the left, feeding the kiosk
const POLE_X = ROAD_W / 2 + 0.3; // poles along the right road edge
const POLE_H = 3.7;

interface Lot {
  i: number;
  house: House | null; // null = neighbour outside the program
  kind: Kind;
  x: number;
  z: number;
  side: 1 | -1;
  face: 1 | -1; // the road-facing wall points this way along x
  row: number;
  w: number; // along the road (z)
  h: number;
  d: number; // across (x)
  eave: number;
}

function lotsOf(st: StreetModel, slots: number): Lot[] {
  const n = Math.max(slots, st.houses.length);
  return Array.from({ length: n }, (_, i) => {
    const side = (i % 2 === 0 ? -1 : 1) as 1 | -1;
    const row = Math.floor(i / 2);
    const house = st.houses[i]?.house ?? null;
    const kind = house?.hasPv ? PV_KINDS[row % 2] : MIX[(i * 5 + 1) % MIX.length];
    const dm = DIM[kind];
    return {
      i,
      house,
      kind,
      x: side * OFFSET,
      z: ROW0 - row * LOT,
      side,
      face: (-side) as 1 | -1,
      row,
      w: dm.w * HS,
      h: dm.h * HS,
      d: dm.d * HS,
      eave: dm.eave * HS,
    };
  });
}

// ------------------------------------------------------------------ shared geometry and materials
const box = new THREE.BoxGeometry(1, 1, 1);
const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 20);
const ball = new THREE.SphereGeometry(1, 16, 12);
const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

const clay = (color: string, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, ...o });

const mat = {
  panel: clay("#ffffff", { roughness: 0.32, metalness: 0.25 }), // tinted per panel by the sun
  battShell: clay("#d2d2d7"),
  battFill: clay(P.green, { roughness: 0.6 }),
  hpBody: clay("#e8e8ed"),
  grille: clay("#c7c7cc"),
  blade: clay("#3a3a3c"),
  carBody: clay("#48484a", { roughness: 0.45 }), // graphite: reads on the light driveway
  carGlass: clay("#c7d3e3", { roughness: 0.25 }),
  wheel: clay("#2c2c2e"),
  pole: clay("#c7c7cc"),
  wire: new THREE.MeshBasicMaterial({ color: "#a1a1a6" }),
  dot: new THREE.MeshBasicMaterial({ color: "#ffffff" }), // coloured per dot
  road: new THREE.MeshBasicMaterial({ color: "#e4e4e9" }),
  drive: new THREE.MeshBasicMaterial({ color: "#ebebef" }),
  tfBase: clay("#d8d8dd"),
  tfBody: clay(P.green, { roughness: 0.7 }),
  tfDoor: clay(P.green, { roughness: 0.75 }),
  tfLouvre: clay(P.green, { roughness: 0.8 }),
  tfRoof: clay("#f2f2f5"),
  tfTrim: clay("#8e8e93"),
  bushing: clay("#c7c7cc"),
  sub: clay("#ffffff"),
};

const PANEL_DARK = new THREE.Color("#233049");
const LOT_ON = "#c8ebd2"; // Apple green at about a quarter on the light ground: this home follows Gridzilla
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
      key={`${geo.uuid}:${parts.length}`}
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

/** Everything about the street that only depends on where the houses stand. */
function useStaticParts(lots: Lot[]) {
  return useMemo(() => {
    const houses = Object.fromEntries(KINDS.map((k) => [k, [] as Part[]])) as Record<Kind, Part[]>;
    const trees: [Part[], Part[]] = [[], []];
    const drives: Part[] = [],
      panels: (Part & { n: THREE.Vector3 })[] = [],
      shells: Part[] = [],
      hpBodies: Part[] = [],
      grilles: Part[] = [],
      poles: Part[] = [];
    for (const l of lots) {
      const { x, z, w, h, d, face, side } = l;
      // the model's front (+z) turns to face the road
      houses[l.kind].push({ m: mtx(x, 0, z, HS, HS, HS, 0, side < 0 ? Math.PI / 2 : -Math.PI / 2, 0), owner: l.i });
      // a tree in the back garden, alternating large and small, never on the wire side
      const big = (l.i * 7) % 3 !== 0;
      const ts = HS * (big ? 1.35 : 1.25) * (0.9 + ((l.i * 13) % 5) * 0.05);
      trees[big ? 0 : 1].push({ m: mtx(x - face * (d / 2 + 1.5), 0, z + (l.row % 2 ? 1.2 : -1.2), ts, ts, ts, 0, l.i * 1.7, 0), owner: -1 });
      // a driveway across the front yard
      const yard = OFFSET - d / 2 - ROAD_W / 2;
      const dz = z + w * 0.3;
      drives.push({ m: mtx(side * (ROAD_W / 2 + yard / 2), 0.035, dz, yard, 1, 1.25), owner: -1 }); // above the green lot
      const hs = l.house;
      if (hs?.hasPv) {
        // a panel field on the road-facing roof slope (ridge along z after the turn)
        const half = d / 2;
        const rise = h - l.eave;
        const slope = Math.atan2(rise, half);
        const along = Math.hypot(half, rise);
        const n = new THREE.Vector3(face * Math.sin(slope), Math.cos(slope), 0);
        panels.push({
          m: mtx(x + face * (half * 0.5) + n.x * 0.08, l.eave + rise * 0.5 + n.y * 0.08, z - w * 0.08, along * 0.62, 0.05, w * 0.42, 0, 0, -face * slope),
          owner: l.i,
          n,
        });
      }
      if (hs && hs.kwh > 0) shells.push({ m: mtx(x + face * (d / 2 + 0.09), 0.62, z - w * 0.32, 0.16, 1.2, 0.56), owner: l.i });
      if (hs?.hasHeat) {
        const bx = x + face * (d * 0.22);
        const bz = z - w / 2 - 0.42;
        hpBodies.push({ m: mtx(bx, 0.41, bz, 0.5, 0.78, 0.9), owner: l.i });
        grilles.push({ m: mtx(bx + face * 0.255, 0.43, bz, 0.6, 0.03, 0.6, 0, 0, Math.PI / 2), owner: l.i });
      }
    }
    const rows = Math.max(1, ...lots.map((l) => l.row + 1));
    for (let r = 0; r < rows; r++) poles.push({ m: mtx(POLE_X, POLE_H / 2, ROW0 - r * LOT, 0.12, POLE_H, 0.12), owner: -1 });
    poles.push({ m: mtx(SUB_X + 1.3, 1.35, TF_Z, 0.12, 2.7, 0.12), owner: -1 });
    return { houses, trees, drives, panels, shells, hpBodies, grilles, poles };
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
    const tfTap = new THREE.Vector3(TF_TAP, TF_TOP, TF_Z);
    add("feed", sag(new THREE.Vector3(SUB_X + 1.3, 2.7, TF_Z), new THREE.Vector3(-TF_TAP, TF_TOP, TF_Z), 0.35), 0.26);
    const rows = Math.max(1, ...lots.map((l) => l.row + 1));
    let prev = tfTap;
    for (let r = 0; r < rows; r++) {
      const top = new THREE.Vector3(POLE_X, POLE_H, ROW0 - r * LOT);
      add(`spine:${r}`, sag(prev, top, 0.3), 0.24);
      prev = top;
    }
    for (const l of lots) {
      const eave = new THREE.Vector3(l.x + l.face * (l.d / 2 + 0.05), l.eave, l.z + 0.4);
      add(`lot:${l.i}`, sag(new THREE.Vector3(POLE_X, POLE_H, ROW0 - l.row * LOT), eave, 0.35), 0.21);
    }
    const geo = mergeGeometries(wires.map((w) => new THREE.TubeGeometry(w.curve, 20, w.id === "feed" ? 0.05 : 0.035, 5, false)));
    return { wires, geo };
  }, [lots]);
}

const MAX_DOTS = 700;

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
      const n = Math.max(2, Math.round(w.len / 1.7));
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

/** Battery fills, heat-pump fans and charging cars, eased toward each new reading. */
function LiveParts({ lots, live, still }: { lots: Lot[]; live: MutableRefObject<Map<string, House & { shape: boolean }>>; still: boolean }) {
  const fill = useRef<THREE.InstancedMesh>(null);
  const blade = useRef<THREE.InstancedMesh>(null);
  const car = useRef<THREE.InstancedMesh>(null);
  const glass = useRef<THREE.InstancedMesh>(null);
  const wheel = useRef<THREE.InstancedMesh>(null);
  const prog = useMemo(() => lots.filter((l) => l.house), [lots]);
  const batt = useMemo(() => prog.filter((l) => l.house!.kwh > 0), [prog]);
  const hp = useMemo(() => prog.filter((l) => l.house!.hasHeat), [prog]);
  // eased state per lot: shown battery level, fan angle and speed, car size
  const st = useRef(new Map<number, { soc: number; ang: number; spin: number; car: number }>());
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const ease = (k: number) => (still ? 1 : 1 - Math.exp(-dt * k));
    const get = (i: number) => {
      let v = st.current.get(i);
      if (!v) st.current.set(i, (v = { soc: -1, ang: 0, spin: 0, car: -1 }));
      return v;
    };
    batt.forEach((l, k) => {
      const h = live.current.get(l.house!.key) ?? l.house!;
      const v = get(l.i);
      const target = h.online ? Math.max(0, Math.min(100, h.soc ?? 0)) / 100 : 0;
      v.soc = v.soc < 0 ? target : v.soc + (target - v.soc) * ease(2.5);
      const hgt = Math.max(HIDE, 1.06 * v.soc);
      fill.current?.setMatrixAt(k, mtx(l.x + l.face * (l.d / 2 + 0.1), 0.08 + hgt / 2, l.z - l.w * 0.32, 0.18, hgt, 0.42, 0, 0, 0, _m));
    });
    hp.forEach((l, k) => {
      const h = live.current.get(l.house!.key) ?? l.house!;
      const v = get(l.i);
      const kw = h.online ? h.hp_kw : 0;
      const target = kw > 0.05 ? 3 + Math.min(kw, 12) * 1.6 : 0; // radians per second
      v.spin += (target - v.spin) * ease(1.5);
      if (!still) v.ang += v.spin * dt;
      const bx = l.x + l.face * (l.d * 0.22 + 0.285);
      for (let j = 0; j < 2; j++) blade.current?.setMatrixAt(2 * k + j, mtx(bx, 0.43, l.z - l.w / 2 - 0.42, 0.02, 0.52, 0.08, v.ang + (j * Math.PI) / 2, 0, 0, _m));
    });
    prog.forEach((l, k) => {
      const h = live.current.get(l.house!.key) ?? l.house!;
      const v = get(l.i);
      const charging = h.online && h.ev_kw > 0.05 ? 1 : 0;
      v.car = v.car < 0 ? charging : v.car + (charging - v.car) * ease(4); // the first frame shows it as it is
      const c = Math.max(HIDE, v.car) * 1.2;
      // in the driveway, nose to the road
      const yard = OFFSET - l.d / 2 - ROAD_W / 2;
      const cx = l.side * (ROAD_W / 2 + yard / 2);
      const cz = l.z + l.w * 0.3;
      car.current?.setMatrixAt(k, mtx(cx, 0.36 * c, cz, 1.9 * c, 0.4 * c, 0.86 * c, 0, 0, 0, _m));
      glass.current?.setMatrixAt(k, mtx(cx + l.side * 0.18 * c, 0.7 * c, cz, 1.0 * c, 0.3 * c, 0.76 * c, 0, 0, 0, _m));
      for (let j = 0; j < 4; j++) {
        const wx = cx + (j < 2 ? -0.62 : 0.62) * c;
        const wz = cz + (j % 2 ? -0.42 : 0.42) * c;
        wheel.current?.setMatrixAt(4 * k + j, mtx(wx, 0.19 * c, wz, 0.38 * c, 0.12 * c, 0.38 * c, Math.PI / 2, 0, 0, _m));
      }
    });
    for (const r of [fill, blade, car, glass, wheel]) if (r.current) r.current.instanceMatrix.needsUpdate = true;
  });
  const im = (ref: RefObject<THREE.InstancedMesh>, geo: THREE.BufferGeometry, material: THREE.Material, n: number, shadow = true) =>
    n > 0 && <instancedMesh key={`${material.uuid}:${n}`} ref={ref} args={[geo, material, n]} castShadow={shadow} receiveShadow raycast={noRay} frustumCulled={false} />;
  return (
    <>
      {im(fill, box, mat.battFill, batt.length)}
      {im(blade, box, mat.blade, hp.length * 2)}
      {im(car, box, mat.carBody, prog.length)}
      {im(glass, box, mat.carGlass, prog.length)}
      {im(wheel, cyl, mat.wheel, prog.length * 4)}
    </>
  );
}

// ------------------------------------------------------------------ green lots: who follows Gridzilla, joining in waves
/** What a house was last seen doing, and from when (performance.now ms) the change shows. */
export interface Follow {
  want: boolean; // follows Gridzilla now
  was: boolean; // what it showed before this change
  mode: string;
  at: number; // -1 = known from the start, no pulse
}

const PULSE_MS = 900;
const LOT_Y = 0.02; // clear of the shadow ground at 0 (the camera stands far back, so a hair's gap z-fights)
const WAVE_MS = 450; // between cohorts on screen
const lotGeo = (() => {
  const s = new THREE.Shape();
  const a = 0.5,
    r = 0.12;
  s.moveTo(-a + r, -a);
  s.lineTo(a - r, -a);
  s.quadraticCurveTo(a, -a, a, -a + r);
  s.lineTo(a, a - r);
  s.quadraticCurveTo(a, a, a - r, a);
  s.lineTo(-a + r, a);
  s.quadraticCurveTo(-a, a, -a, a - r);
  s.lineTo(-a, -a + r);
  s.quadraticCurveTo(-a, -a, -a + r, -a);
  return new THREE.ShapeGeometry(s, 4).rotateX(-Math.PI / 2);
})();
const lotMat = new THREE.MeshBasicMaterial({ color: LOT_ON });

function FollowLots({ lots, follow, still }: { lots: Lot[]; follow: MutableRefObject<Map<string, Follow>>; still: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const prog = useMemo(() => lots.filter((l) => l.house), [lots]);
  const shown = useRef(new Map<string, number>());
  useFrame((_, dtRaw) => {
    const mesh = ref.current;
    if (!mesh) return;
    const dt = Math.min(dtRaw, 0.05);
    const t = performance.now();
    prog.forEach((l, k) => {
      const key = l.house!.key;
      const f = follow.current.get(key);
      const live = f ? (f.at < 0 || t >= f.at ? f.want : f.was) : false;
      let on = shown.current.get(key) ?? (live ? 1 : 0);
      on = still ? (live ? 1 : 0) : on + ((live ? 1 : 0) - on) * (1 - Math.exp(-dt * 5));
      shown.current.set(key, on);
      const p = !still && f && f.at >= 0 && t >= f.at && t < f.at + PULSE_MS ? Math.sin((Math.PI * (t - f.at)) / PULSE_MS) : 0;
      const sc = Math.max(HIDE, on * (1 + 0.12 * p));
      // the lot runs from the road edge to just behind the house
      const xi = l.side * (ROAD_W / 2 + 0.3);
      const xo = l.x + l.side * (l.d / 2 + 1.0);
      mesh.setMatrixAt(k, mtx((xi + xo) / 2, LOT_Y, l.z, Math.abs(xo - xi) * sc, 1, (l.w + 1.2) * sc, 0, 0, 0, _m));
    });
    mesh.count = prog.length;
    mesh.instanceMatrix.needsUpdate = true;
  });
  if (!prog.length) return null;
  return <instancedMesh key={prog.length} ref={ref} args={[lotGeo, lotMat, prog.length]} raycast={noRay} frustumCulled={false} />;
}

/** Counts rendered frames for the QA gate (G5 measures fps and the off-screen pause with it). */
function FrameCount() {
  useFrame(() => {
    const g = (window.__gz3d ??= { frames: 0 });
    g.frames++;
  });
  return null;
}

/** While the canvas is paused (off-screen, frameloop "demand") it still draws a few frames whenever something it shows
 *  changes: on mount, when the models arrive, on a resize (a resize clears the canvas) and on new readings. So the card
 *  is never blank when it scrolls into view or the page is captured whole. Two frames per poll, not a loop. */
function Kick({ on }: { on: unknown }) {
  const { invalidate, size } = useThree();
  useLayoutEffect(() => {
    let n = 0;
    let id = 0;
    const tick = () => {
      invalidate();
      if (++n < 2) id = requestAnimationFrame(tick); // a second frame lets the shadows settle
    };
    tick();
    return () => cancelAnimationFrame(id);
  }, [on, size.width, size.height, invalidate]);
  return null;
}

declare global {
  interface Window {
    __gz3d?: { frames: number };
  }
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

// ------------------------------------------------------------------ the kit: houses and trees, one instanced mesh per model
function firstMesh(o: THREE.Object3D): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  o.traverse((c) => {
    if (!found && (c as THREE.Mesh).isMesh) found = c as THREE.Mesh;
  });
  return found;
}

/** The kit's slate roofs and blue-grey walls lifted into Apple's light greys (#d2d2d7 roofs, near-white walls), so the
 *  green kiosk, the green lots, the cars and the dots are what the eye finds. Dark window and door tones stay. */
function lightRoofs(t: THREE.Texture): THREE.Texture {
  const img = t.image as CanvasImageSource & { width: number; height: number };
  if (typeof document === "undefined" || !img?.width) return t;
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) return t;
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  const px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i],
      gr = px[i + 1],
      b = px[i + 2];
    const lum = 0.299 * r + 0.587 * gr + 0.114 * b;
    const cool = b >= r && Math.max(r, gr, b) - Math.min(r, gr, b) < 70; // the kit's slate and blue-grey family
    if (!cool || lum < 72) continue;
    const v = 168 + lum * 0.33; // slate roof ~ #d2d2d7, walls ~ #e8e8ed to white
    px[i] = Math.min(255, v);
    px[i + 1] = Math.min(255, v);
    px[i + 2] = Math.min(255, v + 5);
  }
  g.putImageData(d, 0, 0);
  const out = new THREE.CanvasTexture(c);
  return out;
}

function Kit({ parts, onHover }: { parts: ReturnType<typeof useStaticParts>; onHover?: (owner: number, e: ThreeEvent<PointerEvent | MouseEvent>) => void }) {
  const gltfs = useGLTF(MODELS, false, false);
  const slate = useTexture(SLATE);
  const kit = useMemo(() => {
    const meshes = gltfs.map((g) => firstMesh(g.scene));
    const src = (meshes[0]?.material as THREE.MeshStandardMaterial | undefined)?.map ?? null;
    const light = lightRoofs(slate);
    light.flipY = false;
    light.colorSpace = THREE.SRGBColorSpace;
    light.magFilter = THREE.NearestFilter;
    light.minFilter = src?.minFilter ?? THREE.NearestMipmapNearestFilter;
    light.needsUpdate = true;
    const houseMat = new THREE.MeshStandardMaterial({ map: light, roughness: 0.88, metalness: 0 });
    const treeMat = new THREE.MeshStandardMaterial({ map: src, roughness: 0.95, metalness: 0 });
    const geo = (i: number) => meshes[i]?.geometry ?? box;
    return { house: Object.fromEntries(KINDS.map((k, i) => [k, geo(i)])) as Record<Kind, THREE.BufferGeometry>, tree: [geo(KINDS.length), geo(KINDS.length + 1)], houseMat, treeMat };
  }, [gltfs, slate]);
  useEffect(
    () => () => {
      kit.houseMat.map?.dispose();
      kit.houseMat.dispose();
      kit.treeMat.dispose();
    },
    [kit],
  );
  return (
    <>
      {KINDS.map((k) => (
        <Instanced key={k} geo={kit.house[k]} material={kit.houseMat} parts={parts.houses[k]} onHover={onHover} />
      ))}
      <Instanced geo={kit.tree[0]} material={kit.treeMat} parts={parts.trees[0]} />
      <Instanced geo={kit.tree[1]} material={kit.treeMat} parts={parts.trees[1]} />
    </>
  );
}

// ------------------------------------------------------------------ the transformer: a green substation kiosk
function B(p: { material: THREE.Material; s: [number, number, number]; at: [number, number, number]; shadow?: boolean }) {
  return <mesh geometry={box} material={p.material} scale={p.s} position={p.at} castShadow={p.shadow !== false} receiveShadow />;
}

const KW = 2.5; // kiosk body: width (x), height, depth (z)
const KH = 2.05;
const KD = 1.9;
const K0 = 0.16; // plinth height
const SLATS = [0.62, 0.86, 1.1, 1.34, 1.58];

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
    mat.tfDoor.color.copy(mat.tfBody.color).multiplyScalar(0.9);
    mat.tfLouvre.color.copy(mat.tfBody.color).multiplyScalar(0.7);
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
  const front = KD / 2 + 0.02;
  return (
    <group position={[0, 0, TF_Z]} scale={KS} {...ev}>
      <B material={mat.tfBase} s={[KW + 0.4, K0, KD + 0.4]} at={[0, K0 / 2, 0]} />
      <B material={mat.tfBody} s={[KW, KH, KD]} at={[0, K0 + KH / 2, 0]} />
      <B material={mat.tfRoof} s={[KW + 0.24, 0.14, KD + 0.24]} at={[0, K0 + KH + 0.07, 0]} />
      {/* a double door on the left of the front face, a small handle, louvres on the right */}
      {[-0.86, -0.32].map((dx) => (
        <B key={dx} material={mat.tfDoor} s={[0.5, 1.62, 0.04]} at={[dx, K0 + 0.06 + 0.81, front]} shadow={false} />
      ))}
      <B material={mat.tfTrim} s={[0.05, 0.2, 0.05]} at={[-0.6, K0 + 0.95, front + 0.03]} shadow={false} />
      {SLATS.map((y) => (
        <B key={y} material={mat.tfLouvre} s={[0.86, 0.08, 0.05]} at={[0.6, K0 + y, front + 0.01]} shadow={false} />
      ))}
      {[-1, 1].map((sd) =>
        SLATS.slice(0, 4).map((y) => <B key={`${sd}:${y}`} material={mat.tfLouvre} s={[0.05, 0.08, 1.1]} at={[sd * (KW / 2 + 0.02), K0 + y + 0.12, 0]} shadow={false} />),
      )}
      {[-0.55, 0, 0.55].map((dx) => (
        <mesh key={dx} geometry={cyl} material={mat.bushing} scale={[0.14, 0.32, 0.14]} position={[dx, K0 + KH + 0.14 + 0.16, 0]} castShadow />
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
      <mesh geometry={box} material={mat.tfBase} scale={[3.2, 0.16, 2.6]} position-y={0.08} receiveShadow />
      {[-1, 1].map((dx) => (
        <mesh key={dx} geometry={box} material={mat.sub} scale={[1.1, 2.0, 1.7]} position={[dx * 0.72 - 0.2, 1.16, 0]} castShadow receiveShadow />
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ sky: sun, light and shadows follow grid time
const PAPER = new THREE.Color("#ffffff");

function SkyRig({ hour, cloud, env, centerZ, shadowRef, paper }: { hour: number; cloud: number; env: MutableRefObject<Env>; centerZ: number; shadowRef: RefObject<THREE.ShadowMaterial>; paper: boolean }) {
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
      sun.current.position.copy(light.dir).multiplyScalar(60).add(target.position);
      sun.current.intensity = light.intensity * 0.85;
      sun.current.color.copy(light.color);
      sun.current.target = target;
    }
    if (hemi.current) {
      hemi.current.intensity = light.hemi * 0.9;
      hemi.current.color.copy(light.hemiSky);
    }
    // on a white card the sky is the card itself; elsewhere it keeps its tint (cooler at night, warmer at dusk)
    if (scene.background instanceof THREE.Color) scene.background.copy(light.bg).lerp(PAPER, paper ? 1 : 0);
    if (shadowRef.current) shadowRef.current.opacity = light.shadow;
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
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-near={1}
        shadow-camera-far={140}
      />
    </>
  );
}

// ------------------------------------------------------------------ camera: frame the street from further back, sway slowly
const PHI = 0.98; // from straight above: ~34 degrees above the horizon
const THETA = 0.4; // from the front right
/** "across": from the side, so the street runs left to right across the card. The angle is not fixed: for the card's
 *  actual shape the rig picks the most three-dimensional view (highest, most turned toward the kiosk) at which the
 *  street still spans FILL of the card's width. A wide, short card gets a lower, straighter side view; a squarer card
 *  gets more height and turn. Houses keep their real scale: the whole street is always in frame. */
const ACROSS = { phi: 1.1, theta: Math.PI / 2 - 0.4 };
const ACROSS_ELEV = [34, 31, 28, 25, 22, 19, 16].map((d) => Math.PI / 2 - (d * Math.PI) / 180); // as phi, high to low
const ACROSS_TURN = [0.4, 0.3, 0.2, 0.12, 0.05, 0]; // radians toward the kiosk end
const FILL = 0.88; // share of the card's width the street spans
const SWAY = 0.2; // radians either way
const SWAY_S = 56; // seconds for one slow sway

/** Pixels along each edge of the canvas that text covers: the street is framed in what is left. */
export interface Pad {
  l: number;
  r: number;
  t: number;
  b: number;
}
const NO_PAD: Pad = { l: 0, r: 0, t: 0, b: 0 };

function CameraRig({ pts, still, interactive, sway, pad, across }: { pts: THREE.Vector3[]; still: boolean; interactive: boolean; sway: boolean; pad: Pad; across: boolean }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, size, clock } = useThree();
  const lastTouch = useRef(-100);
  const sph = useMemo(() => new THREE.Spherical(), []);
  const off = useMemo(() => new THREE.Vector3(), []);
  const target = useMemo(() => new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3()), [pts]);

  // For each candidate view angle: the smallest distance at which the street fits the part of the canvas no text
  // covers (clip space, -1..1 each way), then a lens shift that centres it there. Recomputed whenever the canvas resizes.
  const frame = useMemo(() => {
    const w = Math.max(1, size.width),
      h = Math.max(1, size.height);
    const fx0 = -1 + (2 * Math.min(pad.l, w * 0.7)) / w,
      fx1 = 1 - (2 * Math.min(pad.r, w * 0.7)) / w,
      fy0 = -1 + (2 * Math.min(pad.b, h * 0.7)) / h,
      fy1 = 1 - (2 * Math.min(pad.t, h * 0.7)) / h;
    const cam = new THREE.PerspectiveCamera((camera as THREE.PerspectiveCamera).fov, w / h, 0.5, 2000);
    const v = new THREE.Vector3();
    // room for the sway and some air: houses are context, not giants. Across: the width is the goal, the height
    // only has to clear the words (the points already include the gardens and tree tops).
    const ex = across ? FILL : sway ? 0.86 : 0.92,
      ey = across ? 0.97 : ex;
    const extent = (r: number, phi: number, theta: number) => {
      cam.position.copy(target).add(v.setFromSphericalCoords(r, phi, theta));
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
    const fit = (phi: number, theta: number) => {
      let lo = 4,
        hi = 1200;
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        const e = extent(mid, phi, theta);
        if (!e.behind && e.x1 - e.x0 <= (fx1 - fx0) * ex && e.y1 - e.y0 <= (fy1 - fy0) * ey) hi = mid;
        else lo = mid;
      }
      const e = extent(hi, phi, theta);
      return { phi, theta, radius: hi, e, fill: (e.x1 - e.x0) / (fx1 - fx0) };
    };
    let best = fit(across ? ACROSS.phi : PHI, across ? ACROSS.theta : THETA);
    if (across) {
      // the most 3D view that reaches the fill; failing that, the one that comes closest
      let pick: typeof best | null = null;
      for (const phi of ACROSS_ELEV) {
        for (const turn of ACROSS_TURN) {
          const f = fit(phi, Math.PI / 2 - turn);
          if (f.fill >= FILL - 0.01) {
            pick = f;
            break;
          }
          if (f.fill > best.fill + 0.005) best = f;
        }
        if (pick) break;
      }
      if (pick) best = pick;
    }
    const e = best.e;
    return {
      radius: best.radius,
      phi: best.phi,
      theta: best.theta,
      offX: ((e.x0 + e.x1) / 2 - (fx0 + fx1) / 2) * (w / 2),
      offY: ((fy0 + fy1) / 2 - (e.y0 + e.y1) / 2) * (h / 2),
      w,
      h,
    };
  }, [camera, size.width, size.height, pts, target, sway, pad.l, pad.r, pad.t, pad.b, across]);
  const PHI_ = frame.phi,
    THETA_ = frame.theta;

  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.setViewOffset(frame.w, frame.h, frame.offX, frame.offY, frame.w, frame.h);
    cam.position.copy(target).add(off.setFromSphericalCoords(frame.radius, PHI_, THETA_));
    cam.lookAt(target);
    controls.current?.target.copy(target);
    controls.current?.update();
    cam.far = frame.radius * 4;
    cam.updateProjectionMatrix();
  }, [camera, frame, target, off, PHI_, THETA_]);

  // a slow sway around the front; after someone drags, wait 6 s and ease back into it
  useFrame(({ clock }, dt) => {
    if (clock.elapsedTime - lastTouch.current < 6) return;
    off.copy(camera.position).sub(target);
    sph.setFromVector3(off);
    const want = THETA_ + (still || !sway ? 0 : SWAY * Math.sin((clock.elapsedTime * 2 * Math.PI) / SWAY_S));
    const k = still ? 1 : Math.min(1, Math.min(dt, 0.05) * 1.2);
    sph.theta += (want - sph.theta) * k;
    sph.phi += (PHI_ - sph.phi) * k;
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
  /** false = draw nothing (off-screen or hidden tab); the scene keeps its state and resumes where it was. */
  run?: boolean;
  /** Slow camera sway around the front. Off on the stage: only data moves there. */
  sway?: boolean;
  /** Cohorts of the staggered signal over this street right now (n), null when none: houses then switch together. */
  waves?: number | null;
  /** Canvas edges covered by text, in px: the street is framed in the rest. */
  pad?: Pad;
  /** Sky closer to white, for a white card. */
  paper?: boolean;
  /** Camera from the side: the street runs left to right across a wide card. */
  across?: boolean;
}

export default function Living3D({ st, shapeKeys, otherKw, hour, cloud, onHover, onSelect, interactive, still, slots = 12, run = true, sway = true, waves = null, pad = NO_PAD, paper = false, across = false }: LivingProps) {
  const layoutKey = `${st.tf}|${st.houses.map((h) => `${h.house.key}:${h.house.hasPv ? 1 : 0}${h.house.kwh > 0 ? 1 : 0}${h.house.hasHeat ? 1 : 0}`).join(",")}|${slots}`;
  const lots = useMemo(() => lotsOf(st, slots), [layoutKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const parts = useStaticParts(lots);
  const { wires, geo } = useWires(lots);
  useEffect(() => () => geo.dispose(), [geo]);

  // latest readings live in refs, so useFrame reads them without re-rendering
  const live = useRef(new Map<string, House & { shape: boolean }>());
  const flow = useRef<Flow>({ kw: {} });
  const follow = useRef(new Map<string, Follow>());
  useEffect(() => {
    live.current = new Map(st.houses.map(({ house }) => [house.key, { ...house, shape: shapeKeys.has(house.key) }]));
    flow.current = { kw: flowsOf(st, lots, otherKw) };
    // who follows Gridzilla now; a switch shows after its cohort's turn when a staggered signal runs
    const t = performance.now();
    const next = new Map<string, Follow>();
    for (const h of live.current.values()) {
      const want = h.online && (h.underSignal || h.shape);
      const mode = h.online ? h.mode : "offline";
      const prev = follow.current.get(h.key);
      if (!prev) next.set(h.key, { want, was: want, mode, at: -1 });
      else if (prev.want !== want || (want && prev.mode !== mode)) {
        const shownNow = prev.at < 0 || t >= prev.at ? prev.want : prev.was;
        next.set(h.key, { want, was: shownNow, mode, at: t + (waves ? cohortOf(h, waves) * WAVE_MS : 0) });
      } else next.set(h.key, prev);
    }
    follow.current = next;
  }, [st, lots, otherKw, shapeKeys, waves]);
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
  const back = ROW0 - (rows - 1) * LOT - 3.2;
  const centerZ = (TF_Z + back) / 2;
  const pts = useMemo(() => {
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const far = OFFSET + 4.2; // back gardens and their trees
    const kx = (KW / 2 + 0.2) * KS[0],
      kz = (KD / 2 + 0.2) * KS[2];
    return [v(SUB_X - 1.8, 0, TF_Z + 1.6), v(SUB_X - 1.8, 2.4, TF_Z), v(-kx, 0, TF_Z + kz), v(kx, 0, TF_Z + kz), v(0, TF_TOP + 0.3, TF_Z), v(-far, 0, back), v(far, 0, back), v(-far, 4.2, back), v(far, 4.2, back), v(far, 0, TF_Z), v(-far, 0, TF_Z - 3)];
  }, [back]);
  const roadLen = TF_Z - 1.4 - back;

  return (
    <Canvas
      flat
      shadows
      frameloop={run ? "always" : "demand"}
      dpr={[1, 1.75]}
      camera={{ fov: 24, near: 0.5, far: 600, position: [10, 30, 40] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      style={{ pointerEvents: interactive ? "auto" : "none" }}
      onPointerMissed={() => onHover(null)}
      onPointerLeave={() => onHover(null)}
    >
      <SkyRig hour={hour} cloud={cloud} env={env} centerZ={centerZ} shadowRef={shadowMat} paper={paper} />
      {/* the ground is the background itself: only the shadows show on it, so it stays light at every hour */}
      <mesh geometry={plane} scale={[500, 1, 500]} receiveShadow raycast={noRay}>
        <shadowMaterial ref={shadowMat} opacity={0.12} color="#1d1d1f" />
      </mesh>
      <mesh geometry={plane} material={mat.road} scale={[ROAD_W, 1, roadLen]} position={[0, 0.006, (TF_Z - 1.4 + back) / 2]} raycast={noRay} />
      <Instanced geo={plane} material={mat.drive} parts={parts.drives} shadow={false} />
      <Substation onHover={onHover} interactive={interactive} />
      <Transformer st={st} onHover={onHover} onSelect={onSelect} interactive={interactive} />
      <Suspense fallback={null}>
        <Kit parts={parts} onHover={hov} />
        <Kick on={layoutKey} />
        <ContactShadows key={layoutKey} frames={1} position={[-2, 0.012, centerZ]} scale={[2 * (OFFSET + 6) + 8, roadLen + 12]} resolution={1024} blur={2.6} far={4} opacity={0.38} color="#1d1d1f" />
      </Suspense>
      <Panels parts={parts.panels} env={env} />
      <Instanced geo={box} material={mat.battShell} parts={parts.shells} />
      <Instanced geo={box} material={mat.hpBody} parts={parts.hpBodies} />
      <Instanced geo={cyl} material={mat.grille} parts={parts.grilles} />
      <Instanced geo={cyl} material={mat.pole} parts={parts.poles} />
      <LiveParts lots={lots} live={live} still={still} />
      <mesh geometry={geo} material={mat.wire} raycast={noRay} />
      <PowerDots wires={wires} flow={flow} still={still} />
      <FollowLots lots={lots} follow={follow} still={still} />
      <FrameCount />
      <Kick on={st} />
      <CameraRig pts={pts} still={still} interactive={interactive} sway={sway} pad={pad} across={across} />
    </Canvas>
  );
}
