// The selected feeder as a white clay architecture model, built procedurally (no model files). Houses are white blocks
// with pitched roofs; dark panels on the roof mean solar, a dark base plate means the house follows Gridzilla right
// now, the dark bar on the end wall is how full its battery is. Small dark dots run along the wires: into a house =
// taking power, out of it = giving power back, faster = more kW. That flow is the only thing that moves. A transformer
// turns red when it is over its limit in either direction; the selected one wears a dark roof.
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { COLORS, type House } from "../../model";
import { FEEDER_Y, FEEDER_Z, FLOW_EPS, HOUSE_OFFSET, TF_Z, flowSpeed, type Spot, type StreetModel } from "./layout";

export interface HoverInfo {
  kind: "house" | "normal" | "tf" | "substation";
  house?: House;
  street?: StreetModel;
  x: number;
  y: number;
}

type HoverFn = (h: HoverInfo | null) => void;
const noRay = () => {};

// ------------------------------------------------------------------ shared geometry and materials (Apple white + one red)
const box = new THREE.BoxGeometry(1, 1, 1);
const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
const dotGeo = new THREE.SphereGeometry(1, 12, 8);
/** Triangular prism, base 1 wide on y = 0, apex at y = 1, ridge along z, 1 long. Scale it to the roof. */
const roofGeo = (() => {
  const g = new THREE.CylinderGeometry(1, 1, 1, 3, 1).rotateX(-Math.PI / 2);
  g.scale(1 / Math.sqrt(3), 1 / 1.5, 1);
  g.translate(0, 0.5 / 1.5, 0);
  return g;
})();

const clay = (color: string, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, ...o });
const flat = (color: string) => new THREE.MeshBasicMaterial({ color });

const mat = {
  road: flat("#ededf2"),
  wall: clay("#ffffff"),
  roof: clay("#ffffff", { flatShading: true }),
  plate: clay(COLORS.signal), // following Gridzilla
  panel: clay("#3a3a3c", { roughness: 0.5 }),
  battShell: clay("#c7c7cc"),
  battFill: clay(COLORS.signal),
  tf: clay("#e8e8ed"),
  tfOver: clay(COLORS.crit, { roughness: 0.8 }),
  tfRoof: clay("#ffffff"),
  tfRoofSel: clay(COLORS.signal),
  pole: clay("#d2d2d7"),
  wire: flat("#a1a1a6"),
  dot: flat(COLORS.signal),
};

// ------------------------------------------------------------------ wires and the moving power dots
interface WireDef {
  id: string;
  curve: THREE.QuadraticBezierCurve3;
  len: number;
  geo: THREE.TubeGeometry;
  dot: number; // dot radius on this wire
}

function sagCurve(a: THREE.Vector3, b: THREE.Vector3, sag: number) {
  const mid = a.clone().lerp(b, 0.5);
  mid.y -= sag;
  return new THREE.QuadraticBezierCurve3(a, mid, b);
}

/** Where a house's service wire lands: the street-facing eave. */
const eave = (spot: Spot) => new THREE.Vector3(spot.x - spot.side * 1.45, 1.95, spot.z + 0.6);
const tfTop = (st: StreetModel) => new THREE.Vector3(st.x, FEEDER_Y, FEEDER_Z);

export function substationX(streets: StreetModel[]) {
  return (streets[0]?.x ?? 0) - 8.4;
}

/** Wire geometry depends only on where things stand, so it is rebuilt when the street layout changes, not on every poll. */
function useWireDefs(streets: StreetModel[], layoutKey: string) {
  const defs = useMemo(() => {
    const out: WireDef[] = [];
    const add = (id: string, curve: THREE.QuadraticBezierCurve3, r: number, dot: number) =>
      out.push({ id, curve, len: curve.getLength(), geo: new THREE.TubeGeometry(curve, 24, r, 6, false), dot });
    let prev = new THREE.Vector3(substationX(streets) + 1.6, FEEDER_Y, FEEDER_Z);
    streets.forEach((st, i) => {
      const tap = tfTop(st);
      add(`feed:${i}`, sagCurve(prev, tap, 0.3), 0.035, 0.17);
      prev = tap;
      st.houses.forEach(({ house, spot }) => add(`h:${house.key}`, sagCurve(tfTop(st), eave(spot), 0.6), 0.025, 0.15));
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey]);
  useEffect(() => () => defs.forEach((d) => d.geo.dispose()), [defs]);
  return defs;
}

/** kW on every wire right now. + = flowing away from the substation (into the house), - = back towards it. */
function flowsOf(streets: StreetModel[]) {
  const kw: Record<string, number> = {};
  streets.forEach((st, i) => {
    kw[`feed:${i}`] = streets.slice(i).reduce((a, s) => a + (s.load_kw ?? 0), 0);
    st.houses.forEach(({ house }) => (kw[`h:${house.key}`] = house.online ? house.grid_kw : 0));
  });
  return kw;
}

function Wires({ defs }: { defs: WireDef[] }) {
  return (
    <>
      {defs.map((d) => (
        <mesh key={d.id} geometry={d.geo} material={mat.wire} raycast={noRay} />
      ))}
    </>
  );
}

const MAX_DOTS = 700;

/** Every dot is one instance of one mesh, moved in place each frame: no React state per frame. */
function PowerDots({ defs, kw, still }: { defs: WireDef[]; kw: Record<string, number>; still: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const phase = useRef<Record<string, number>>({});
  const p = useMemo(() => new THREE.Vector3(), []);
  const m = useMemo(() => new THREE.Matrix4(), []);
  useFrame((_, dt) => {
    const mesh = ref.current;
    if (!mesh) return;
    const step = still ? 0 : Math.min(dt, 0.05);
    let k = 0;
    for (const d of defs) {
      const f = kw[d.id] ?? 0;
      if (Math.abs(f) < FLOW_EPS) continue;
      const n = Math.max(2, Math.round(d.len / 1.5));
      let ph = (phase.current[d.id] ?? Math.random()) + (step * flowSpeed(f) * Math.sign(f)) / d.len;
      ph -= Math.floor(ph);
      phase.current[d.id] = ph;
      for (let j = 0; j < n && k < MAX_DOTS; j++, k++) {
        d.curve.getPoint((ph + j / n) % 1, p);
        m.makeScale(d.dot, d.dot, d.dot).setPosition(p);
        mesh.setMatrixAt(k, m);
      }
    }
    mesh.count = k;
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[dotGeo, mat.dot, MAX_DOTS]} raycast={noRay} frustumCulled={false} />;
}

// ------------------------------------------------------------------ buildings
function hoverProps(make: (x: number, y: number) => HoverInfo, onHover: HoverFn) {
  const at = (e: ThreeEvent<PointerEvent | MouseEvent>) => make(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
  return {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      onHover(at(e));
    },
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      onHover(at(e));
    },
    onPointerOut: () => onHover(null),
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      onHover(at(e)); // a tap on a phone shows the same tooltip
    },
  };
}

/** A clay block that casts a shadow. */
function Block({ material = mat.wall, ...props }: JSX.IntrinsicElements["mesh"] & { material?: THREE.Material }) {
  return <mesh geometry={box} material={material} castShadow receiveShadow {...props} />;
}

function ProgramHouse({ house, spot, onHover }: { house: House; spot: Spot; onHover: HoverFn }) {
  const face = -spot.side; // the street-facing wall points this way along x
  const soc = Math.max(0, Math.min(100, house.soc ?? 0));
  const slope = Math.atan2(1.2, 1.6);
  return (
    <group position={[spot.x, 0, spot.z]} {...hoverProps((x, y) => ({ kind: "house", house, x, y }), onHover)}>
      {/* the one Gridzilla marker: a dark base plate while the house follows a signal */}
      {house.underSignal && <Block material={mat.plate} scale={[3.5, 0.12, 3.7]} position-y={0.06} />}
      <Block scale={[2.8, 1.9, 3.0]} position-y={0.95} />
      <mesh geometry={roofGeo} material={mat.roof} scale={[3.2, 1.2, 3.35]} position-y={1.9} castShadow receiveShadow />
      {/* solar on the street side of the roof */}
      {house.hasPv && (
        <Block
          material={mat.panel}
          scale={[1.3, 0.05, 2.7]}
          position={[face * (0.8 + 0.05 * Math.sin(slope)), 1.9 + 0.6 + 0.05 * Math.cos(slope), 0]}
          rotation-z={-face * slope}
        />
      )}
      {/* home battery on the end wall facing the camera: the dark part is how full it is */}
      {house.kwh > 0 && (
        <group position={[face * 0.6, 0, 1.56]}>
          <Block material={mat.battShell} scale={[0.6, 1.5, 0.12]} position-y={0.95} />
          {house.online && soc > 0 && (
            <Block material={mat.battFill} scale={[0.6, (1.5 * soc) / 100, 0.14]} position-y={0.2 + (1.5 * soc) / 200} />
          )}
        </group>
      )}
    </group>
  );
}

function NormalHouse({ spot, street, onHover }: { spot: Spot; street: StreetModel; onHover: HoverFn }) {
  return (
    <group position={[spot.x, 0, spot.z]} {...hoverProps((x, y) => ({ kind: "normal", street, x, y }), onHover)}>
      <Block scale={[2.5, 1.6, 2.7]} position-y={0.8} />
      <mesh geometry={roofGeo} material={mat.roof} scale={[2.9, 1.0, 3.0]} position-y={1.6} castShadow receiveShadow />
    </group>
  );
}

function Transformer({ st, selected, onHover, onSelect }: { st: StreetModel; selected: boolean; onHover: HoverFn; onSelect: (tf: string) => void }) {
  const over = Math.abs(st.pct ?? 0) >= 100;
  const hp = hoverProps((x, y) => ({ kind: "tf", street: st, x, y }), onHover);
  return (
    <group
      position={[st.x, 0, TF_Z]}
      {...hp}
      onPointerOver={(e) => {
        hp.onPointerOver(e);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        hp.onPointerOut();
        document.body.style.cursor = "";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(st.tf);
      }}
    >
      <Block material={mat.tf} scale={[3.2, 0.2, 2.6]} position-y={0.1} />
      <Block material={over ? mat.tfOver : mat.tf} scale={[2.7, 2.5, 2.1]} position-y={1.45} />
      <Block material={selected ? mat.tfRoofSel : mat.tfRoof} scale={[3.0, 0.24, 2.4]} position-y={2.82} />
    </group>
  );
}

function Street({ st }: { st: StreetModel }) {
  const len = st.length - 2.2; // ends just past the last row of houses
  return <mesh geometry={plane} material={mat.road} scale={[3.2, 1, len]} position={[st.x, 0.005, -len / 2]} raycast={noRay} />;
}

function Substation({ x, onHover }: { x: number; onHover: HoverFn }) {
  return (
    <group position={[x, 0, FEEDER_Z]} {...hoverProps((px, py) => ({ kind: "substation", x: px, y: py }), onHover)}>
      <Block material={mat.tf} scale={[4.8, 0.2, 3.8]} position-y={0.1} />
      {[-1, 1].map((dx) => (
        <Block key={dx} scale={[1.8, 3.0, 2.4]} position={[dx * 1.15, 1.7, 0]} />
      ))}
      <Block material={mat.pole} scale={[0.16, FEEDER_Y, 0.16]} position={[1.6, FEEDER_Y / 2, 0]} />
    </group>
  );
}

const POLE_H = FEEDER_Y - 0.3; // where the sagging wire hangs at mid-span

/** One slim pole halfway between each pair of neighbours on the feeder line. */
function FeederPoles({ xs }: { xs: number[] }) {
  return (
    <>
      {xs.slice(1).map((b, i) => {
        const x = (xs[i] + b) / 2;
        return (
          <group key={i} position={[x, 0, FEEDER_Z]}>
            <mesh geometry={cyl} material={mat.pole} scale={[0.16, POLE_H, 0.16]} position-y={POLE_H / 2} castShadow raycast={noRay} />
          </group>
        );
      })}
    </>
  );
}

// ------------------------------------------------------------------ camera: frame the street, stay still until someone drags it
const PHI = 0.98; // angle from straight above: the camera sits ~34 degrees above the horizon
const THETA = 0.4; // from the front right: the row of streets foreshortens, so the houses read bigger

function CameraRig({ pts, still }: { pts: THREE.Vector3[]; still: boolean }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, size, clock } = useThree();
  const lastTouch = useRef(-100);
  const sph = useMemo(() => new THREE.Spherical(), []);
  const off = useMemo(() => new THREE.Vector3(), []);
  const target = useMemo(() => new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3()), [pts]);

  // Frame the content: the smallest distance at which the scene's projected extent fits the canvas, then a lens shift
  // (view offset) that centres it. A shift keeps raycasting and the orbit pivot correct.
  const frame = useMemo(() => {
    const w = Math.max(1, size.width),
      h = Math.max(1, size.height);
    const cam = new THREE.PerspectiveCamera((camera as THREE.PerspectiveCamera).fov, w / h, 0.5, 2000);
    const v = new THREE.Vector3();
    const edge = 0.96;
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
  const radius = frame.radius;

  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.setViewOffset(frame.w, frame.h, frame.offX, frame.offY, frame.w, frame.h);
    cam.position.copy(target).add(off.setFromSphericalCoords(radius, PHI, THETA));
    cam.lookAt(target);
    controls.current?.target.copy(target);
    controls.current?.update();
    cam.far = radius * 4;
    cam.updateProjectionMatrix();
  }, [camera, frame, radius, target, off]);

  // After someone has looked around, ease back to the resting view (Apple ease-out feel, no overshoot).
  useFrame(({ clock }, dt) => {
    const c = controls.current;
    if (!c || clock.elapsedTime - lastTouch.current < 6) return;
    off.copy(camera.position).sub(c.target);
    sph.setFromVector3(off);
    if (Math.abs(sph.theta - THETA) < 1e-4 && Math.abs(sph.phi - PHI) < 1e-4 && Math.abs(sph.radius - radius) < 1e-3) return;
    const k = still ? 1 : Math.min(1, dt * 3);
    sph.theta += (THETA - sph.theta) * k;
    sph.phi += (PHI - sph.phi) * k;
    sph.radius += (radius - sph.radius) * k;
    off.setFromSpherical(sph);
    camera.position.copy(c.target).add(off);
    camera.lookAt(c.target);
  });
  return (
    <OrbitControls
      ref={controls}
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
export default function Street3D({
  streets, selected, onSelect, onHover, compact = false, still = false,
}: { streets: StreetModel[]; selected: string; onSelect: (tf: string) => void; onHover: HoverFn; compact?: boolean; still?: boolean }) {
  const layoutKey = streets.map((st) => `${st.tf}:${st.x}:${st.houses.map((h) => h.house.key).join(",")}:${st.normals.length}`).join("|");
  const defs = useWireDefs(streets, layoutKey);
  const kw = useMemo(() => flowsOf(streets), [streets]);
  const subX = substationX(streets);
  const lastX = streets[streets.length - 1]?.x ?? 0;
  const deepest = Math.max(8, ...streets.map((st) => st.length));
  // The points the camera must keep in frame: the substation, every kiosk, the corners of every street. Houses must read
  // as houses, so nothing else is framed.
  const frameKey = `${subX}|${lastX}|${streets.map((st) => `${st.x}:${st.length}`).join()}`;
  const pts = useMemo(() => {
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const out = [v(subX - 2.4, 0, FEEDER_Z + 1.9), v(subX - 2.4, 3.4, FEEDER_Z - 1.2)];
    streets.forEach((st) => {
      out.push(v(st.x, 0, TF_Z + 1.3), v(st.x, 3, TF_Z));
      for (const dx of [-HOUSE_OFFSET - 1.6, HOUSE_OFFSET + 1.6]) out.push(v(st.x + dx, 0, -st.length + 1.5), v(st.x + dx, 3.1, -st.length + 1.5), v(st.x + dx, 0, -0.8));
    });
    return out;
  }, [frameKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const midX = (subX + lastX) / 2;
  const spanX = lastX - subX + 12;
  const spanZ = deepest + FEEDER_Z + 6;
  return (
    <Canvas
      flat
      shadows
      dpr={compact ? [1, 1.5] : [1, 1.75]}
      camera={{ fov: 24, near: 0.5, far: 400, position: [10, 30, 40] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onPointerMissed={() => onHover(null)}
    >
      <color attach="background" args={[COLORS.card]} />
      <hemisphereLight args={["#ffffff", "#f5f5f7", 1.75]} />
      <directionalLight
        position={[midX - 10, 40, 16]}
        intensity={1.25}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-spanX / 1.6}
        shadow-camera-right={spanX / 1.6}
        shadow-camera-top={spanZ / 1.4}
        shadow-camera-bottom={-spanZ / 1.4}
        shadow-camera-near={1}
        shadow-camera-far={120}
      >
        <object3D attach="target" position={[midX, 0, -deepest / 2 + 2]} />
      </directionalLight>
      {/* the ground is the card itself: only the shadows show on it */}
      <mesh geometry={plane} scale={[400, 1, 400]} receiveShadow raycast={noRay}>
        <shadowMaterial opacity={0.07} color={COLORS.signal} />
      </mesh>
      <ContactShadows
        key={layoutKey}
        frames={1}
        position={[midX, 0.012, FEEDER_Z + 3 - spanZ / 2]}
        scale={[spanX, spanZ]}
        resolution={1024}
        blur={2.2}
        far={2.5}
        opacity={0.45}
        color={COLORS.signal}
      />
      <Substation x={subX} onHover={onHover} />
      <FeederPoles xs={[subX + 1.6, ...streets.map((st) => st.x)]} />
      {streets.map((st) => (
        <group key={st.tf}>
          <Street st={st} />
          <Transformer st={st} selected={selected === st.tf} onHover={onHover} onSelect={onSelect} />
          {st.houses.map(({ house, spot }) => (
            <ProgramHouse key={house.key} house={house} spot={spot} onHover={onHover} />
          ))}
          {st.normals.map((n, i) => (
            <NormalHouse key={i} spot={n} street={st} onHover={onHover} />
          ))}
        </group>
      ))}
      <Wires defs={defs} />
      <PowerDots defs={defs} kw={kw} still={still} />
      <CameraRig pts={pts} still={still} />
    </Canvas>
  );
}
