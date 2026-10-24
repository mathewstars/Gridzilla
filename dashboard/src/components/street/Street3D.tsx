// The selected feeder as a small 3D town, built procedurally (no model files). Program houses are lit and carry a
// battery, solar and appliance indicators; normal houses stand dark. Power particles run along the wires: blue
// flowing into a house = taking power, yellow flowing out = giving power back, faster = more kW.
import { Html, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { memo, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { COLORS, loadColor, nice, type House } from "../../model";
import { flowSpeed, type StreetModel } from "./layout";

export interface HoverInfo {
  kind: "house" | "normal" | "tf";
  house?: House;
  street?: StreetModel;
  x: number;
  y: number;
}

// ------------------------------------------------------------------ shared geometry and materials
const roofGeo = (() => {
  const shape = new THREE.Shape();
  shape.moveTo(-1.35, 0);
  shape.lineTo(1.35, 0);
  shape.lineTo(0, 1.05);
  shape.lineTo(-1.35, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 2.9, bevelEnabled: false });
  g.translate(0, 0, -1.45);
  return g;
})();
const box = new THREE.BoxGeometry(1, 1, 1);
const sphere = new THREE.SphereGeometry(1, 10, 8);
const ring = new THREE.RingGeometry(1.75, 2.05, 48);
const disc = new THREE.CircleGeometry(1, 24);

const mat = {
  ground: new THREE.MeshStandardMaterial({ color: "#070c13", roughness: 1 }),
  road: new THREE.MeshStandardMaterial({ color: "#0d1520", roughness: 0.95 }),
  lane: new THREE.MeshBasicMaterial({ color: "#1d2a3b" }),
  wallProg: new THREE.MeshStandardMaterial({ color: "#3a4a63", roughness: 0.75 }),
  wallNormal: new THREE.MeshStandardMaterial({ color: "#1b2433", roughness: 0.9 }),
  roofProg: new THREE.MeshStandardMaterial({ color: "#253246", roughness: 0.7 }),
  roofNormal: new THREE.MeshStandardMaterial({ color: "#141b27", roughness: 0.9 }),
  panel: new THREE.MeshStandardMaterial({ color: "#10264a", roughness: 0.25, metalness: 0.6, emissive: "#ffc93c", emissiveIntensity: 0 }),
  battShell: new THREE.MeshStandardMaterial({ color: "#0b1018", roughness: 0.5 }),
  windowWarm: new THREE.MeshBasicMaterial({ color: "#3b3322" }),
  tfBody: new THREE.MeshStandardMaterial({ color: "#2b3646", roughness: 0.55, metalness: 0.4 }),
  pole: new THREE.MeshStandardMaterial({ color: "#2a3444", roughness: 0.8 }),
  car: new THREE.MeshStandardMaterial({ color: "#c9d4e2", roughness: 0.35, metalness: 0.5 }),
  hp: new THREE.MeshStandardMaterial({ color: "#8d9bb0", roughness: 0.5, metalness: 0.3 }),
};

// ------------------------------------------------------------------ wires and particles
interface Wire {
  curve: THREE.QuadraticBezierCurve3;
  kw: number; // + = flowing from start to end (into the house), - = back towards the transformer
  color: THREE.Color;
  n: number;
  len: number;
}

function sagCurve(a: THREE.Vector3, b: THREE.Vector3, sag = 0.7) {
  const mid = a.clone().lerp(b, 0.5);
  mid.y -= sag;
  return new THREE.QuadraticBezierCurve3(a, mid, b);
}

const take = new THREE.Color(COLORS.take);
const give = new THREE.Color(COLORS.give);
const idle = new THREE.Color("#2b3a50");

function useWires(streets: StreetModel[], width: number) {
  return useMemo(() => {
    const wires: Wire[] = [];
    const add = (curve: THREE.QuadraticBezierCurve3, kw: number) => {
      const len = curve.getLength();
      const active = Math.abs(kw) > 0.15;
      wires.push({ curve, kw, len, color: active ? (kw > 0 ? take : give) : idle, n: active ? Math.max(2, Math.round(len / 1.4)) : 0 });
    };
    streets.forEach((st) => {
      const top = new THREE.Vector3(st.x, 2.15, 1.2);
      // feeder line down to the transformer: flow = the whole street's net load
      add(sagCurve(new THREE.Vector3(st.x, 3.4, 4.2), top, 0.25), st.load_kw ?? 0);
      st.houses.forEach(({ house, spot }) => {
        const end = new THREE.Vector3(spot.x - spot.side * 1.2, 1.95, spot.z);
        add(sagCurve(top, end, 0.55), house.online ? house.grid_kw : 0);
      });
    });
    // the 22 kV feeder overhead line across the front of the scene
    const feederKw = streets.reduce((a, s) => a + (s.load_kw ?? 0), 0);
    add(sagCurve(new THREE.Vector3(-width / 2 - 4, 3.4, 4.2), new THREE.Vector3(width / 2 + 4, 3.4, 4.2), 0.15), feederKw);
    return wires;
  }, [streets, width]);
}

function WireLines({ wires }: { wires: Wire[] }) {
  const lines = useMemo(
    () =>
      wires.map((w) => {
        const g = new THREE.BufferGeometry().setFromPoints(w.curve.getPoints(24));
        const m = new THREE.LineBasicMaterial({ color: w.n ? w.color : new THREE.Color("#24324a"), transparent: true, opacity: w.n ? 0.35 : 0.55 });
        return new THREE.Line(g, m);
      }),
    [wires],
  );
  useLayoutEffect(
    () => () =>
      lines.forEach((l) => {
        l.geometry.dispose();
        (l.material as THREE.Material).dispose();
      }),
    [lines],
  );
  return (
    <>
      {lines.map((l, i) => (
        <primitive key={i} object={l} />
      ))}
    </>
  );
}

const MAX_P = 700;
function Particles({ wires, still }: { wires: Wire[]; still: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const phase = useRef(new Float32Array(MAX_P).map(() => Math.random()));
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const p = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    let k = 0;
    const step = still ? 0 : Math.min(dt, 0.05);
    for (const w of wires) {
      const v = (flowSpeed(w.kw) * 2.2) / w.len;
      for (let j = 0; j < w.n && k < MAX_P; j++, k++) {
        let t = phase.current[k] + step * v * Math.sign(w.kw);
        t -= Math.floor(t);
        phase.current[k] = t;
        const u = (t + j / w.n) % 1;
        w.curve.getPoint(u, p);
        tmp.position.copy(p);
        const s = 0.085 + Math.min(0.07, Math.abs(w.kw) / 400);
        tmp.scale.setScalar(s);
        tmp.updateMatrix();
        m.setMatrixAt(k, tmp.matrix);
        m.setColorAt(k, w.color);
      }
    }
    m.count = k;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[sphere, undefined, MAX_P]} frustumCulled={false}>
      <meshBasicMaterial toneMapped={false} transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} />
    </instancedMesh>
  );
}

// ------------------------------------------------------------------ buildings
function Glow({ color, intensity = 1.6 }: { color: string; intensity?: number }) {
  return <meshStandardMaterial color={color} emissive={color} emissiveIntensity={intensity} toneMapped={false} />;
}

const ProgramHouse = memo(function ProgramHouse({
  house, x, z, side, onHover,
}: { house: House; x: number; z: number; side: 1 | -1; onHover: (h: HoverInfo | null) => void }) {
  const face = -side; // the wall facing the street points this way along x
  const lit = house.underSignal;
  const off = !house.online;
  const soc = house.soc ?? 0;
  const ringRef = useRef<THREE.Mesh>(null);
  const fanRef = useRef<THREE.Mesh>(null);
  useFrame((st, dt) => {
    if (ringRef.current) {
      const m = ringRef.current.material as THREE.MeshBasicMaterial;
      m.opacity = lit ? 0.45 + 0.35 * Math.sin(st.clock.elapsedTime * 2.4) : 0;
    }
    if (fanRef.current && house.hp_kw > 0.05) fanRef.current.rotation.x += dt * 9;
  });
  return (
    <group
      position={[x, 0, z]}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover({ kind: "house", house, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
      }}
      onPointerMove={(e) => onHover({ kind: "house", house, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })}
      onPointerOut={() => onHover(null)}
    >
      {/* signal ring on the ground */}
      <mesh ref={ringRef} geometry={ring} rotation-x={-Math.PI / 2} position-y={0.02}>
        <meshBasicMaterial color={COLORS.signal} transparent opacity={0} toneMapped={false} depthWrite={false} />
      </mesh>
      <mesh geometry={box} material={mat.wallProg} scale={[2.5, 1.75, 2.8]} position-y={0.875} />
      {/* street-facing windows: teal when the house follows a Gridzilla signal, warm otherwise */}
      {[-0.6, 0.6].map((dz) => (
        <mesh key={dz} geometry={box} scale={[0.04, 0.5, 0.62]} position={[face * 1.26, 1.05, dz]}>
          {off ? <meshBasicMaterial color="#141b26" /> : lit ? <Glow color={COLORS.signal} intensity={2.2} /> : <meshBasicMaterial color="#c9a45c" toneMapped={false} />}
        </mesh>
      ))}
      <mesh geometry={roofGeo} material={mat.roofProg} position-y={1.75} rotation-y={Math.PI / 2} />
      {/* solar on the street side of the roof */}
      {house.hasPv && (
        <mesh
          geometry={box}
          material={mat.panel}
          scale={[1.15, 0.05, 2.3]}
          position={[face * 0.68, 2.28, 0]}
          rotation-z={face * -0.66}
          material-emissiveIntensity={Math.min(1.2, house.pv_kw / 4)}
        />
      )}
      {/* battery on the wall: fill height = state of charge */}
      <group position={[face * 1.36, 0, 1.0]}>
        <mesh geometry={box} material={mat.battShell} scale={[0.22, 1.25, 0.5]} position-y={0.7} />
        {house.kwh > 0 && !off && (
          <mesh geometry={box} scale={[0.24, Math.max(0.04, (1.1 * soc) / 100), 0.36]} position-y={0.13 + (1.1 * soc) / 200}>
            <Glow color={soc < 25 ? COLORS.warn : COLORS.ok} intensity={1.3} />
          </mesh>
        )}
      </group>
      {/* heat pump unit with a spinning fan while it runs */}
      {house.hasHeat && (
        <group position={[face * 0.2, 0, -1.75]}>
          <mesh geometry={box} material={mat.hp} scale={[0.9, 0.62, 0.42]} position-y={0.31} />
          <mesh ref={fanRef} geometry={disc} scale={0.22} position={[0, 0.33, -0.22]} rotation-y={Math.PI}>
            {house.hp_kw > 0.05 ? <meshBasicMaterial color={COLORS.take} toneMapped={false} /> : <meshBasicMaterial color="#3a4658" />}
          </mesh>
        </group>
      )}
      {/* car in the driveway while it charges */}
      {house.ev_kw > 0.05 && (
        <group position={[face * 2.25, 0, -0.8]}>
          <mesh geometry={box} material={mat.car} scale={[0.8, 0.36, 1.6]} position-y={0.32} />
          <mesh geometry={box} material={mat.car} scale={[0.7, 0.3, 0.85]} position={[0, 0.62, 0.05]} />
          <mesh geometry={box} scale={[0.86, 0.04, 1.66]} position-y={0.08}>
            <Glow color={COLORS.take} intensity={2} />
          </mesh>
        </group>
      )}
      {house.real && (
        <mesh geometry={box} scale={[0.1, 2.6, 0.1]} position={[-face * 1.0, 3.1, -1.0]}>
          <Glow color={COLORS.signal} intensity={1.2} />
        </mesh>
      )}
    </group>
  );
});

function NormalHouse({ x, z, side, pv, onHover, street }: { x: number; z: number; side: 1 | -1; pv: boolean; street: StreetModel; onHover: (h: HoverInfo | null) => void }) {
  const face = -side;
  return (
    <group
      position={[x, 0, z]}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover({ kind: "normal", street, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
      }}
      onPointerOut={() => onHover(null)}
    >
      <mesh geometry={box} material={mat.wallNormal} scale={[2.3, 1.55, 2.6]} position-y={0.775} />
      <mesh geometry={box} material={mat.windowWarm} scale={[0.04, 0.45, 0.55]} position={[face * 1.16, 0.95, 0.4]} />
      <mesh geometry={roofGeo} material={mat.roofNormal} position-y={1.55} rotation-y={Math.PI / 2} scale={[0.92, 0.9, 0.92]} />
      {pv && <mesh geometry={box} material={mat.panel} scale={[1, 0.05, 1.9]} position={[face * 0.62, 2.03, 0]} rotation-z={face * -0.66} />}
    </group>
  );
}

function Transformer({ st, onHover, onSelect, selected }: { st: StreetModel; onHover: (h: HoverInfo | null) => void; onSelect: (tf: string) => void; selected: boolean }) {
  const color = loadColor(st.pct);
  const over = Math.abs(st.pct ?? 0) >= 100;
  const pulse = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    if (!pulse.current) return;
    const t = (s.clock.elapsedTime * 0.9) % 1;
    pulse.current.scale.setScalar(over ? 1 + t * 2.2 : 0.001);
    (pulse.current.material as THREE.MeshBasicMaterial).opacity = over ? 0.7 * (1 - t) : 0;
  });
  return (
    <group
      position={[st.x, 0, 1.2]}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
        onHover({ kind: "tf", street: st, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
      }}
      onPointerOut={() => {
        document.body.style.cursor = "";
        onHover(null);
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(st.tf);
      }}
    >
      <mesh ref={pulse} geometry={ring} rotation-x={-Math.PI / 2} position-y={0.03} scale={0.001}>
        <meshBasicMaterial color={COLORS.crit} transparent opacity={0} toneMapped={false} depthWrite={false} />
      </mesh>
      <mesh geometry={ring} rotation-x={-Math.PI / 2} position-y={0.025} scale={0.85}>
        <meshBasicMaterial color={selected ? "#eef3f9" : "#1d2a3b"} transparent opacity={selected ? 0.5 : 0.8} toneMapped={false} />
      </mesh>
      <mesh geometry={box} material={mat.tfBody} scale={[1.7, 1.9, 1.2]} position-y={0.95} />
      {/* load band, coloured by how close the transformer is to its limit */}
      <mesh geometry={box} scale={[1.74, 0.34, 1.24]} position-y={1.35}>
        <Glow color={color} intensity={over ? 3 : 1.8} />
      </mesh>
      {[-0.5, 0, 0.5].map((dx) => (
        <mesh key={dx} geometry={box} material={mat.pole} scale={[0.12, 0.35, 0.12]} position={[dx, 2.05, 0]} />
      ))}
      <Html position={[0, 3.1, 0]} center distanceFactor={18} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
        <div className="whitespace-nowrap rounded-xl bg-black/55 px-3 py-1.5 text-center backdrop-blur-sm" style={{ boxShadow: `inset 0 0 0 1px ${color}55` }}>
          <div className="text-[13px] font-semibold text-fg">{nice(st.tf)}</div>
          <div className="num text-[17px] font-semibold" style={{ color }}>
            {st.pct == null ? "-" : `${Math.abs(st.pct)} %`}
            <span className="ml-1.5 text-[11px] font-medium text-dim">{st.pct != null && st.pct < 0 ? "backflow" : "load"}</span>
          </div>
        </div>
      </Html>
    </group>
  );
}

function Street({ st }: { st: StreetModel }) {
  const len = Math.max(...st.houses.map((h) => -h.spot.z), ...st.normals.map((n) => -n.z), 6) + 4;
  return (
    <group>
      <mesh geometry={box} material={mat.road} scale={[3.2, 0.02, len]} position={[st.x, 0.005, -len / 2 + 1.5]} />
      {Array.from({ length: Math.floor(len / 2.4) }, (_, i) => (
        <mesh key={i} geometry={box} material={mat.lane} scale={[0.08, 0.025, 0.9]} position={[st.x, 0.01, 0.5 - i * 2.4]} />
      ))}
      <Html position={[st.x, 0.1, -len + 2.2]} center distanceFactor={22} zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
        <div className="whitespace-nowrap text-[12px] font-medium text-dim">+ {st.others} more houses on this transformer</div>
      </Html>
    </group>
  );
}

// ------------------------------------------------------------------ camera: gentle sway until someone grabs it
function CameraRig({ depth, width }: { depth: number; width: number }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, size, clock } = useThree();
  const lastTouch = useRef(-10);
  const sph = useMemo(() => new THREE.Spherical(), []);
  const off = useMemo(() => new THREE.Vector3(), []);
  const target = useMemo(() => new THREE.Vector3(0, 0, -depth / 2 + 1), [depth]);
  const radius = useMemo(() => {
    const aspect = size.width / Math.max(1, size.height);
    const span = Math.max(width + 8, depth * 1.1);
    return Math.max(18, span * 0.95) * Math.max(1, 1.55 / aspect);
  }, [size.width, size.height, width, depth]);
  useLayoutEffect(() => {
    camera.position.set(target.x + radius * 0.25, radius * 0.62, target.z + radius * 0.78);
    camera.lookAt(target);
    controls.current?.target.copy(target);
    controls.current?.update();
  }, [camera, radius, target]);
  useFrame((s, dt) => {
    const c = controls.current;
    if (!c) return;
    const t = s.clock.elapsedTime;
    if (t - lastTouch.current < 6) return;
    off.copy(camera.position).sub(c.target);
    sph.setFromVector3(off);
    const want = 0.32 + Math.sin(t * 0.09) * 0.38;
    sph.theta += (want - sph.theta) * Math.min(1, dt * 0.6);
    sph.phi += (0.98 - sph.phi) * Math.min(1, dt * 0.4);
    sph.radius += (radius - sph.radius) * Math.min(1, dt * 0.8);
    off.setFromSpherical(sph);
    camera.position.copy(c.target).add(off);
    camera.lookAt(c.target);
  });
  return (
    <OrbitControls
      ref={controls}
      enablePan={false}
      enableZoom={false}
      enableDamping
      dampingFactor={0.08}
      minPolarAngle={0.35}
      maxPolarAngle={1.25}
      onStart={() => (lastTouch.current = 1e9)}
      onEnd={() => (lastTouch.current = clock.elapsedTime)}
    />
  );
}

export default function Street3D({
  streets, selected, onSelect, onHover, compact,
}: { streets: StreetModel[]; selected: string; onSelect: (tf: string) => void; onHover: (h: HoverInfo | null) => void; compact?: boolean }) {
  const width = streets.length > 1 ? Math.abs(streets[streets.length - 1].x - streets[0].x) + 9 : 9;
  const depth = Math.max(10, ...streets.flatMap((s) => [...s.houses.map((h) => -h.spot.z), ...s.normals.map((n) => -n.z)])) + 3;
  const wires = useWires(streets, width);
  const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  return (
    <Canvas
      dpr={compact ? [1, 1.5] : [1, 2]}
      camera={{ fov: 34, near: 0.5, far: 300, position: [6, 18, 24] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onPointerMissed={() => onHover(null)}
    >
      <color attach="background" args={["#060a10"]} />
      <fog attach="fog" args={["#060a10", 40, 95]} />
      <hemisphereLight args={["#5c7aa8", "#05080d", 0.55]} />
      <directionalLight position={[-12, 22, 10]} intensity={1.1} color="#bcd2ff" />
      <pointLight position={[0, 8, 6]} intensity={30} distance={40} color="#33e1c9" />
      <mesh geometry={box} material={mat.ground} scale={[width + 60, 0.01, depth + 60]} position={[0, -0.01, -depth / 2]} />
      {/* feeder poles along the front */}
      {Array.from({ length: Math.ceil((width + 8) / 6) + 1 }, (_, i) => (
        <mesh key={i} geometry={box} material={mat.pole} scale={[0.14, 3.4, 0.14]} position={[-width / 2 - 4 + i * 6, 1.7, 4.2]} />
      ))}
      {streets.map((st) => (
        <group key={st.tf}>
          <Street st={st} />
          <Transformer st={st} onHover={onHover} onSelect={onSelect} selected={selected === st.tf} />
          {st.houses.map(({ house, spot }) => (
            <ProgramHouse key={house.key} house={house} x={spot.x} z={spot.z} side={spot.side} onHover={onHover} />
          ))}
          {st.normals.map((n, i) => (
            <NormalHouse key={i} x={n.x} z={n.z} side={n.side} pv={i % 2 === 0} street={st} onHover={onHover} />
          ))}
        </group>
      ))}
      <WireLines wires={wires} />
      <Particles wires={wires} still={reduce} />
      <CameraRig depth={depth} width={width} />
    </Canvas>
  );
}
