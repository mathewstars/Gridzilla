// The selected feeder as a small 3D town, built procedurally (no model files). Program houses are lit and carry a
// battery, solar and appliance indicators; normal houses stand dark. Power particles run along the wires: blue
// flowing into a house = taking power, yellow flowing out = giving power back, faster = more kW. Everything Gridzilla
// does is teal. Transformer kiosks glow green / amber / red by load and pulse red when over their limit.
import { Html, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { COLORS, loadColor, nice, type House } from "../../model";
import { FEEDER_Y, FEEDER_Z, FLOW_EPS, TF_Z, flowSpeed, type Spot, type StreetModel } from "./layout";

export interface HoverInfo {
  kind: "house" | "normal" | "tf" | "substation";
  house?: House;
  street?: StreetModel;
  x: number;
  y: number;
}

type HoverFn = (h: HoverInfo | null) => void;
const noRay = () => {};

// ------------------------------------------------------------------ shared textures, geometry, materials
function radial(stops: [number, number][]) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  stops.forEach(([o, a]) => gr.addColorStop(o, `rgba(255,255,255,${a})`));
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const sparkTex = radial([[0, 1], [0.18, 0.9], [0.42, 0.28], [1, 0]]);
const poolTex = radial([[0, 0.9], [0.35, 0.45], [0.7, 0.1], [1, 0]]);

const box = new THREE.BoxGeometry(1, 1, 1);
const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const ringGeo = new THREE.RingGeometry(0.86, 1, 64).rotateX(-Math.PI / 2);
const disc = new THREE.CircleGeometry(0.5, 20);
const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
/** Triangular prism, base 1 wide on y = 0, apex at y = 1, ridge along z, 1 long. Scale it to the roof. */
const roofGeo = (() => {
  const g = new THREE.CylinderGeometry(1, 1, 1, 3, 1).rotateX(-Math.PI / 2);
  g.scale(1 / Math.sqrt(3), 1 / 1.5, 1);
  g.translate(0, 0.5 / 1.5, 0);
  return g;
})();

const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
const glow = (color: string, o: THREE.MeshBasicMaterialParameters = {}) => new THREE.MeshBasicMaterial({ color, toneMapped: false, ...o });
const additive = (color: string, opacity: number, map = poolTex) =>
  new THREE.MeshBasicMaterial({ color, map, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });

const mat = {
  ground: std("#0b1018", { roughness: 1 }),
  lot: std("#121924", { roughness: 1 }),
  road: std("#060a10", { roughness: 0.9 }),
  lane: glow("#2b3b52"),
  shadow: new THREE.MeshBasicMaterial({ color: "#000000", map: poolTex, transparent: true, opacity: 0.7, depthWrite: false }),
  wallProg: std("#b9c3d1", { roughness: 0.8 }),
  wallNormal: std("#323a47", { roughness: 0.95 }),
  roofProg: std("#3a4352", { flatShading: true, roughness: 0.6 }),
  roofNormal: std("#1b2029", { flatShading: true }),
  plinth: std("#0d131c"),
  winWarm: glow("#ffe7bf"),
  winDim: glow("#4d4331"),
  winSignal: glow(COLORS.signal),
  winOff: glow("#111822"),
  panel: std("#18376b", { roughness: 0.25, metalness: 0.55 }),
  panelLive: std("#2a5bb0", { roughness: 0.2, metalness: 0.5, emissive: new THREE.Color("#173d82"), emissiveIntensity: 0.9 }),
  battShell: std("#0b1018", { roughness: 0.4, metalness: 0.3 }),
  battFill: glow("#eaf6ff"),
  battLow: glow("#7f8ea4"),
  tfBody: std("#8792a3", { roughness: 0.45, metalness: 0.45 }),
  tfRoof: std("#283242", { roughness: 0.6 }),
  fin: std("#323e50", { roughness: 0.6, metalness: 0.4 }),
  pole: std("#46536a", { roughness: 0.8 }),
  car: std("#d9e1ec", { roughness: 0.28, metalness: 0.6 }),
  carIdle: std("#59667a", { roughness: 0.4, metalness: 0.5 }),
  glass: std("#0a1220", { roughness: 0.1, metalness: 0.8 }),
  hp: std("#c3ccd9", { roughness: 0.5 }),
  fanOn: glow(COLORS.take),
  fanOff: glow("#3b475a"),
  takeGlow: glow(COLORS.take),
  signalGlow: glow(COLORS.signal),
  wireTake: glow(COLORS.take, { transparent: true, opacity: 0.4 }),
  wireGive: glow(COLORS.give, { transparent: true, opacity: 0.4 }),
  wireIdle: glow("#4a5568", { transparent: true, opacity: 0.6 }),
  halo: additive(COLORS.signal, 0.5),
  carPool: additive(COLORS.take, 0.6),
  subBody: std("#3a4659", { roughness: 0.5, metalness: 0.4 }),
  selRing: glow("#eef3f9"),
};

// ------------------------------------------------------------------ wires and particles
interface WireDef {
  id: string;
  curve: THREE.QuadraticBezierCurve3;
  len: number;
  geo: THREE.TubeGeometry;
}

function sagCurve(a: THREE.Vector3, b: THREE.Vector3, sag: number) {
  const mid = a.clone().lerp(b, 0.5);
  mid.y -= sag;
  return new THREE.QuadraticBezierCurve3(a, mid, b);
}

/** Where a house's service wire lands: the street-facing eave. */
const eave = (spot: Spot, normal = false) => new THREE.Vector3(spot.x - spot.side * (normal ? 1.3 : 1.5), normal ? 1.6 : 1.95, spot.z + 0.6);
const tfTop = (st: StreetModel) => new THREE.Vector3(st.x, 2.55, TF_Z);

function substationX(streets: StreetModel[]) {
  return (streets[0]?.x ?? 0) - 11;
}

/** Wire geometry depends only on where things stand, so it is rebuilt when the street layout changes, not on every poll. */
function useWireDefs(streets: StreetModel[], layoutKey: string) {
  const defs = useMemo(() => {
    const out: WireDef[] = [];
    const add = (id: string, curve: THREE.QuadraticBezierCurve3, r: number) =>
      out.push({ id, curve, len: curve.getLength(), geo: new THREE.TubeGeometry(curve, 24, r, 5, false) });
    let prev = new THREE.Vector3(substationX(streets) + 1.6, FEEDER_Y, FEEDER_Z);
    streets.forEach((st, i) => {
      const tap = new THREE.Vector3(st.x, FEEDER_Y, FEEDER_Z);
      add(`feed:${i}`, sagCurve(prev, tap, 0.35), 0.06);
      prev = tap;
      add(`drop:${st.tf}`, sagCurve(tap, tfTop(st).add(new THREE.Vector3(0, 0, 0.5)), 0.2), 0.05);
      st.houses.forEach(({ house, spot }) => add(`h:${house.key}`, sagCurve(tfTop(st), eave(spot), 0.6), 0.035));
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
    kw[`drop:${st.tf}`] = st.load_kw ?? 0;
    st.houses.forEach(({ house }) => (kw[`h:${house.key}`] = house.online ? house.grid_kw : 0));
  });
  return kw;
}

function Wires({ defs, kw }: { defs: WireDef[]; kw: Record<string, number> }) {
  return (
    <>
      {defs.map((d) => {
        const k = kw[d.id] ?? 0;
        const m = Math.abs(k) < FLOW_EPS ? mat.wireIdle : k > 0 ? mat.wireTake : mat.wireGive;
        return <mesh key={d.id} geometry={d.geo} material={m} raycast={noRay} />;
      })}
    </>
  );
}

const MAX_P = 900;
const takeC = new THREE.Color(COLORS.take);
const giveC = new THREE.Color(COLORS.give);

function Particles({ defs, kw, still }: { defs: WireDef[]; kw: Record<string, number>; still: boolean }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX_P * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(MAX_P * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    return g;
  }, []);
  const [halo, core] = useMemo(
    () =>
      [2.3, 0.85].map(
        (size) =>
          new THREE.PointsMaterial({
            size,
            map: sparkTex,
            vertexColors: true,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            toneMapped: false,
            sizeAttenuation: true,
          }),
      ),
    [],
  );
  useEffect(
    () => () => {
      geo.dispose();
      halo.dispose();
      core.dispose();
    },
    [geo, halo, core],
  );
  const phase = useRef<Record<string, number>>({});
  const p = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const col = geo.attributes.color as THREE.BufferAttribute;
    const step = still ? 0 : Math.min(dt, 0.05);
    let k = 0;
    for (let w = 0; w < defs.length; w++) {
      const d = defs[w];
      const f = kw[d.id] ?? 0;
      if (Math.abs(f) < FLOW_EPS) continue;
      const n = Math.max(2, Math.round(d.len / 1.7));
      let ph = (phase.current[d.id] ?? Math.random()) + (step * flowSpeed(f) * Math.sign(f)) / d.len;
      ph -= Math.floor(ph);
      phase.current[d.id] = ph;
      const c = f > 0 ? takeC : giveC;
      for (let j = 0; j < n && k < MAX_P; j++, k++) {
        const u = (ph + j / n) % 1;
        d.curve.getPoint(u, p);
        pos.setXYZ(k, p.x, p.y, p.z);
        col.setXYZ(k, c.r, c.g, c.b);
      }
    }
    geo.setDrawRange(0, k);
    pos.needsUpdate = true;
    col.needsUpdate = true;
  });
  return (
    <>
      <points geometry={geo} material={halo} raycast={noRay} frustumCulled={false} />
      <points geometry={geo} material={core} raycast={noRay} frustumCulled={false} />
    </>
  );
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

function HeatPump({ running, still }: { running: boolean; still: boolean }) {
  const fan = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (fan.current && running && !still) fan.current.rotation.z -= dt * 7;
  });
  return (
    <group>
      <mesh geometry={box} material={mat.hp} scale={[0.95, 0.7, 0.5]} position-y={0.35} />
      <mesh ref={fan} geometry={disc} material={running ? mat.fanOn : mat.fanOff} scale={0.5} position={[0, 0.36, 0.26]} />
      {/* two blades so the spin reads at a glance */}
      {running &&
        [0, Math.PI / 2].map((r) => (
          <mesh key={r} geometry={box} material={mat.hp} scale={[0.5, 0.06, 0.02]} position={[0, 0.36, 0.28]} rotation-z={r} />
        ))}
    </group>
  );
}

function ProgramHouse({ house, spot, onHover, still }: { house: House; spot: Spot; onHover: HoverFn; still: boolean }) {
  const face = -spot.side; // the street-facing wall points this way along x
  const lit = house.underSignal;
  const off = !house.online;
  const soc = Math.max(0, Math.min(100, house.soc ?? 0));
  const win = off ? mat.winOff : lit ? mat.winSignal : mat.winWarm;
  const slope = Math.atan2(1.2, 1.6);
  const fanRunning = house.hp_kw > 0.05;
  const charging = house.ev_kw > 0.05;
  return (
    <group position={[spot.x, 0, spot.z]} {...hoverProps((x, y) => ({ kind: "house", house, x, y }), onHover)}>
      <mesh geometry={plane} material={mat.shadow} scale={[5.2, 1, 5.4]} position-y={0.012} raycast={noRay} />
      {lit && <mesh geometry={plane} material={mat.halo} scale={9} position-y={0.02} raycast={noRay} />}
      <mesh geometry={box} material={mat.plinth} scale={[3.0, 0.16, 3.2]} position-y={0.08} />
      <mesh geometry={box} material={mat.wallProg} scale={[2.8, 1.9, 3.0]} position-y={0.95} />
      <mesh geometry={roofGeo} material={mat.roofProg} scale={[3.2, 1.2, 3.35]} position-y={1.9} />
      {/* street-facing windows: teal when the house follows a Gridzilla signal, warm light otherwise */}
      {[-0.72, 0.72].map((dz) => (
        <mesh key={dz} geometry={box} material={win} scale={[0.05, 0.62, 0.74]} position={[face * 1.41, 1.15, dz]} />
      ))}
      {/* window on the end wall that faces the camera */}
      <mesh geometry={box} material={win} scale={[0.7, 0.6, 0.05]} position={[-face * 0.6, 1.3, 1.51]} />
      {/* solar on the street side of the roof */}
      {house.hasPv && (
        <mesh
          geometry={box}
          material={house.pv_kw > 0.05 ? mat.panelLive : mat.panel}
          scale={[1.35, 0.06, 2.7]}
          position={[face * (0.8 + 0.05 * Math.sin(slope)), 1.9 + 0.6 + 0.05 * Math.cos(slope), 0]}
          rotation-z={-face * slope}
        />
      )}
      {/* home battery on the end wall: the lit part is how full it is */}
      {house.kwh > 0 && (
        <group position={[face * 0.72, 0, 1.6]}>
          <mesh geometry={box} material={mat.battShell} scale={[0.62, 1.4, 0.2]} position-y={0.85} />
          {!off && (
            <mesh
              geometry={box}
              material={soc < 20 ? mat.battLow : mat.battFill}
              scale={[0.46, Math.max(0.05, (1.22 * soc) / 100), 0.06]}
              position={[0, 0.24 + (1.22 * soc) / 200, 0.1]}
            />
          )}
        </group>
      )}
      {/* heat pump beside the house, fan spins and glows blue while it runs */}
      {house.hasHeat && (
        <group position={[-face * 0.65, 0, 1.95]}>
          <HeatPump running={fanRunning && !off} still={still} />
        </group>
      )}
      {/* car in the front yard, lit from below while it charges */}
      {(house.hasEv || charging) && (
        <group position={[face * 2.25, 0, -0.4]}>
          {charging && <mesh geometry={plane} material={mat.carPool} scale={[2.6, 1, 3.4]} position-y={0.02} raycast={noRay} />}
          <mesh geometry={box} material={charging ? mat.car : mat.carIdle} scale={[0.95, 0.4, 1.9]} position-y={0.34} />
          <mesh geometry={box} material={mat.glass} scale={[0.82, 0.3, 1.0]} position={[0, 0.66, -0.05]} />
          {charging && <mesh geometry={box} material={mat.takeGlow} scale={[0.06, 0.06, 0.6]} position={[-face * 0.5, 0.4, 0.2]} />}
        </group>
      )}
      {house.real && (
        <>
          <mesh geometry={cyl} material={mat.signalGlow} scale={[0.09, 2.2, 0.09]} position={[0, 4.2, 0]} />
          <Html position={[0, 5.6, 0]} center zIndexRange={[12, 10]} style={{ pointerEvents: "none" }}>
            <div className="whitespace-nowrap rounded-full bg-[#06121a]/85 px-2.5 py-1 text-[0.7rem] font-semibold text-signal shadow-[inset_0_0_0_1px_rgb(51_225_201/0.45)]">
              Real home
            </div>
          </Html>
        </>
      )}
    </group>
  );
}

function NormalHouse({ spot, pv, street, onHover }: { spot: Spot; pv: boolean; street: StreetModel; onHover: HoverFn }) {
  const face = -spot.side;
  const slope = Math.atan2(1.0, 1.45);
  return (
    <group position={[spot.x, 0, spot.z]} {...hoverProps((x, y) => ({ kind: "normal", street, x, y }), onHover)}>
      <mesh geometry={plane} material={mat.shadow} scale={[4.6, 1, 4.8]} position-y={0.012} raycast={noRay} />
      <mesh geometry={box} material={mat.wallNormal} scale={[2.5, 1.6, 2.7]} position-y={0.8} />
      <mesh geometry={box} material={mat.winDim} scale={[0.05, 0.5, 0.6]} position={[face * 1.26, 0.95, 0.45]} />
      <mesh geometry={roofGeo} material={mat.roofNormal} scale={[2.9, 1.0, 3.0]} position-y={1.6} />
      {pv && (
        <mesh
          geometry={box}
          material={mat.panel}
          scale={[1.15, 0.05, 2.2]}
          position={[face * 0.74, 1.6 + 0.52, 0]}
          rotation-z={-face * slope}
        />
      )}
    </group>
  );
}

function Transformer({
  st, selected, compact, still, onHover, onSelect,
}: { st: StreetModel; selected: boolean; compact: boolean; still: boolean; onHover: HoverFn; onSelect: (tf: string) => void }) {
  const color = loadColor(st.pct);
  const over = Math.abs(st.pct ?? 0) >= 100;
  const band = useMemo(() => glow(color), []); // eslint-disable-line react-hooks/exhaustive-deps
  const pool = useMemo(() => additive(color, 0.4), []); // eslint-disable-line react-hooks/exhaustive-deps
  const pulseMat = useMemo(() => glow(COLORS.crit, { transparent: true, opacity: 0, depthWrite: false }), []);
  useEffect(
    () => () => {
      band.dispose();
      pool.dispose();
      pulseMat.dispose();
    },
    [band, pool, pulseMat],
  );
  useLayoutEffect(() => {
    band.color.set(color);
    pool.color.set(color);
    pool.opacity = over ? 0.6 : 0.38;
  }, [color, over, band, pool]);
  const pulse = useRef<THREE.Mesh>(null);
  const base = useMemo(() => new THREE.Color(), []);
  useFrame(({ clock }) => {
    const m = pulse.current;
    if (!m) return;
    if (!over) {
      m.visible = false;
      return;
    }
    m.visible = true;
    const t = still ? 0.35 : (clock.elapsedTime * 0.75) % 1;
    m.scale.setScalar(1.6 + t * 4.2);
    pulseMat.opacity = 0.85 * (1 - t);
    if (!still) band.color.copy(base.set(color)).multiplyScalar(0.75 + 0.45 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 5)));
  });
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
      <mesh geometry={plane} material={pool} scale={9} position-y={0.03} raycast={noRay} />
      <mesh ref={pulse} geometry={ringGeo} material={pulseMat} position-y={0.04} visible={false} raycast={noRay} />
      {selected && <mesh geometry={ringGeo} material={mat.selRing} scale={2.3} position-y={0.036} raycast={noRay} />}
      <mesh geometry={box} material={mat.plinth} scale={[2.8, 0.2, 2.2]} position-y={0.1} />
      <mesh geometry={box} material={mat.tfBody} scale={[2.3, 2.0, 1.7]} position-y={1.2} />
      <mesh geometry={box} material={mat.tfRoof} scale={[2.6, 0.2, 2.0]} position-y={2.3} />
      {/* load band: green / amber / red by how close the transformer is to its limit */}
      <mesh geometry={box} material={band} scale={[2.34, 0.34, 1.74]} position-y={1.62} />
      {[-0.7, -0.35, 0, 0.35, 0.7].map((dx) => (
        <mesh key={dx} geometry={box} material={mat.fin} scale={[0.12, 0.9, 0.08]} position={[dx, 0.85, 0.88]} />
      ))}
      {[-0.6, 0, 0.6].map((dx) => (
        <mesh key={dx} geometry={cyl} material={mat.pole} scale={[0.14, 0.4, 0.14]} position={[dx, 2.6, 0]} />
      ))}
      <Html position={[0, 2.5, 0]} zIndexRange={[14, 10]}>
        <div className="flex flex-col items-center" style={{ transform: "translate(-50%, -100%)" }}>
        <button
          type="button"
          onClick={() => onSelect(st.tf)}
          onPointerEnter={() => onHover(null)}
          className={`group block whitespace-nowrap rounded-2xl bg-[#08101a]/85 text-left backdrop-blur-md transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-px active:scale-[0.98] ${
            compact ? "px-2.5 py-1.5" : "px-3.5 py-2.5"
          }`}
          style={{
            boxShadow: `inset 0 0 0 ${selected ? 2 : 1}px ${selected ? "#eef3f9cc" : `${color}66`}, 0 14px 30px -12px rgb(0 0 0 / 0.9), 0 0 28px -8px ${color}55`,
          }}
          aria-label={`${nice(st.tf)} transformer, ${st.pct == null ? "no data" : `${Math.abs(st.pct)} percent of its limit`}. Show its curve.`}
        >
          <div className={`font-semibold text-fg ${compact ? "text-[0.72rem]" : "text-[0.86rem]"}`}>{nice(st.tf)}</div>
          <div className="flex items-baseline gap-1.5">
            <span className={`num font-semibold leading-none ${compact ? "text-[1.15rem]" : "text-[1.7rem]"}`} style={{ color }}>
              {st.pct == null ? "-" : `${Math.abs(st.pct)} %`}
            </span>
            <span className={`text-dim ${compact ? "text-[0.62rem]" : "text-[0.72rem]"}`}>of limit</span>
          </div>
          {!compact && (
            <div className="mt-1 text-[0.68rem] font-medium" style={{ color: over ? color : COLORS.muted }}>
              {st.load_kw == null
                ? "Waiting for data"
                : over
                  ? st.load_kw < 0
                    ? "Too much solar coming back"
                    : "Overloaded"
                  : Math.abs(st.pct ?? 0) >= 85
                    ? "Close to the limit"
                    : st.load_kw < 0
                      ? "Solar flowing back"
                      : "Within the limit"}
            </div>
          )}
        </button>
        <div aria-hidden className={compact ? "h-3 w-px" : "h-6 w-px"} style={{ background: `linear-gradient(${color}aa, ${color}00)` }} />
        </div>
      </Html>
    </group>
  );
}

function Street({ st, compact }: { st: StreetModel; compact: boolean }) {
  const len = st.length;
  const dashes = Math.floor(len / 2.6);
  return (
    <group>
      <mesh geometry={box} material={mat.lot} scale={[13.5, 0.02, len + 1]} position={[st.x, 0.002, -len / 2 + 0.6]} raycast={noRay} />
      <mesh geometry={box} material={mat.road} scale={[3.2, 0.03, len]} position={[st.x, 0.01, -len / 2]} raycast={noRay} />
      {Array.from({ length: dashes }, (_, i) => (
        <mesh key={i} geometry={box} material={mat.lane} scale={[0.1, 0.035, 1.0]} position={[st.x, 0.02, -1.2 - i * 2.6]} raycast={noRay} />
      ))}
      {!compact && st.others > 0 && (
        <Html position={[st.x, 0.2, -len - 0.8]} center zIndexRange={[11, 10]} style={{ pointerEvents: "none" }}>
          <div className="whitespace-nowrap text-[0.74rem] font-medium text-dim">+ {st.others} homes not in the program</div>
        </Html>
      )}
    </group>
  );
}

function Substation({ x, onHover }: { x: number; onHover: HoverFn }) {
  return (
    <group position={[x, 0, FEEDER_Z]} {...hoverProps((px, py) => ({ kind: "substation", x: px, y: py }), onHover)}>
      <mesh geometry={plane} material={mat.shadow} scale={[7, 1, 6]} position-y={0.012} raycast={noRay} />
      <mesh geometry={box} material={mat.plinth} scale={[4.6, 0.2, 3.6]} position-y={0.1} />
      {[-1, 1].map((dx) => (
        <group key={dx} position={[dx * 1.1, 0, 0]}>
          <mesh geometry={box} material={mat.subBody} scale={[1.6, 2.2, 1.9]} position-y={1.3} />
          <mesh geometry={box} material={mat.signalGlow} scale={[1.64, 0.12, 1.94]} position-y={1.9} />
          {[-0.4, 0, 0.4].map((dz) => (
            <mesh key={dz} geometry={cyl} material={mat.pole} scale={[0.14, 0.9, 0.14]} position={[0, 2.85, dz]} />
          ))}
        </group>
      ))}
      <mesh geometry={box} material={mat.pole} scale={[0.16, FEEDER_Y, 0.16]} position={[1.6, FEEDER_Y / 2, 0]} />
    </group>
  );
}

function FeederPoles({ from, to }: { from: number; to: number }) {
  const n = Math.max(2, Math.round((to - from) / 6));
  return (
    <>
      {Array.from({ length: n + 1 }, (_, i) => {
        const x = from + ((to - from) * i) / n;
        return (
          <group key={i} position={[x, 0, FEEDER_Z]}>
            <mesh geometry={box} material={mat.pole} scale={[0.16, FEEDER_Y + 0.2, 0.16]} position-y={(FEEDER_Y + 0.2) / 2} raycast={noRay} />
            <mesh geometry={box} material={mat.pole} scale={[0.12, 0.12, 1.2]} position-y={FEEDER_Y + 0.1} raycast={noRay} />
          </group>
        );
      })}
    </>
  );
}

// ------------------------------------------------------------------ camera: frame the whole feeder, sway gently until someone grabs it
const PHI = 0.9; // angle from straight above: the camera sits ~38 degrees above the horizon
const THETA = 0.16; // a little from the right
const SWAY = 0.13;

function CameraRig({ pts, still, compact }: { pts: THREE.Vector3[]; still: boolean; compact: boolean }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, size, scene, clock } = useThree();
  const lastTouch = useRef(-100);
  const sph = useMemo(() => new THREE.Spherical(), []);
  const off = useMemo(() => new THREE.Vector3(), []);
  const target = useMemo(() => new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3()), [pts]);

  // Frame the content: the smallest distance at which the scene's projected extent fits the free area of the panel
  // (room left for the title on top and the legend at the bottom) at every point of the sway, then a lens shift
  // (view offset) that centres it in that area. A shift keeps raycasting and the orbit pivot correct.
  const frame = useMemo(() => {
    const w = Math.max(1, size.width),
      h = Math.max(1, size.height);
    const cam = new THREE.PerspectiveCamera((camera as THREE.PerspectiveCamera).fov, w / h, 0.5, 2000);
    const v = new THREE.Vector3();
    const top = compact ? 0.6 : 0.7;
    const bottom = compact ? -0.66 : -0.72;
    const side = 0.95;
    const extent = (r: number, theta: number) => {
      cam.position.copy(target).add(v.setFromSphericalCoords(r, PHI, theta));
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
    const thetas = still ? [THETA] : [THETA - SWAY, THETA, THETA + SWAY];
    // 1. size: distance where the extent fits at every sway angle
    let r = 4;
    for (const theta of thetas) {
      let lo = 4,
        hi = 800;
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        const e = extent(mid, theta);
        if (!e.behind && e.x1 - e.x0 <= 2 * side && e.y1 - e.y0 <= top - bottom) hi = mid;
        else lo = mid;
      }
      r = Math.max(r, hi);
    }
    // 2. shift: centre the content across the sway, then back off until every sway angle stays inside
    const mid = (a: number, b: number) => (a + b) / 2;
    let sx = 0,
      sy = 0;
    for (let k = 0; k < 40; k++) {
      const es = thetas.map((t) => extent(r, t));
      const x0 = Math.min(...es.map((e) => e.x0)),
        x1 = Math.max(...es.map((e) => e.x1)),
        y0 = Math.min(...es.map((e) => e.y0)),
        y1 = Math.max(...es.map((e) => e.y1));
      sx = -mid(x0, x1);
      sy = mid(top, bottom) - mid(y0, y1);
      if (x1 - x0 <= 2 * side && y1 - y0 <= top - bottom) break;
      r *= 1.03;
    }
    return { radius: r, offX: (-sx * w) / 2, offY: (sy * h) / 2, w, h };
  }, [camera, size.width, size.height, pts, target, still, compact]);
  const radius = frame.radius;

  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.setViewOffset(frame.w, frame.h, frame.offX, frame.offY, frame.w, frame.h);
    cam.position.copy(target).add(off.setFromSphericalCoords(radius, PHI, THETA));
    cam.lookAt(target);
    controls.current?.target.copy(target);
    controls.current?.update();
    scene.fog = new THREE.Fog("#070b12", radius * 0.9, radius * 2.6);
    cam.far = radius * 4;
    cam.updateProjectionMatrix();
  }, [camera, frame, radius, target, off, scene]);

  useFrame(({ clock }, dt) => {
    const c = controls.current;
    if (!c || still) return;
    const t = clock.elapsedTime;
    if (t - lastTouch.current < 5) return; // someone is looking around: leave the camera where they put it
    off.copy(camera.position).sub(c.target);
    sph.setFromVector3(off);
    const k = Math.min(1, dt * 0.7);
    sph.theta += (THETA + Math.sin(t * 0.07) * SWAY - sph.theta) * k;
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
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.6}
      minPolarAngle={0.35}
      maxPolarAngle={1.3}
      onStart={() => (lastTouch.current = 1e9)}
      onEnd={() => (lastTouch.current = clock.elapsedTime)}
    />
  );
}

// ------------------------------------------------------------------ the scene
function SignalPulse({ still }: { still: boolean }) {
  useFrame(({ clock }) => {
    mat.halo.opacity = still ? 0.5 : 0.38 + 0.2 * Math.sin(clock.elapsedTime * 2.2);
  });
  return null;
}

export default function Street3D({
  streets, selected, onSelect, onHover, compact = false, still = false,
}: { streets: StreetModel[]; selected: string; onSelect: (tf: string) => void; onHover: HoverFn; compact?: boolean; still?: boolean }) {
  const layoutKey = streets.map((st) => `${st.tf}:${st.x}:${st.houses.map((h) => h.house.key).join(",")}`).join("|");
  const defs = useWireDefs(streets, layoutKey);
  const kw = useMemo(() => flowsOf(streets), [streets]);
  const subX = substationX(streets);
  const lastX = streets[streets.length - 1]?.x ?? 0;
  // The points the camera must keep in frame: substation, both ends of the feeder line, every kiosk with its label,
  // and the far corners of every street.
  const frameKey = `${subX}|${lastX}|${streets.map((st) => `${st.x}:${st.length}`).join()}`;
  const pts = useMemo(() => {
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const out = [v(subX - 2.5, 0, FEEDER_Z + 2), v(subX - 2.5, 3.5, FEEDER_Z - 2), v(lastX + 6, 0, FEEDER_Z + 0.5), v(lastX + 6, FEEDER_Y, FEEDER_Z)];
    streets.forEach((st) => {
      out.push(v(st.x, 0, TF_Z + 1.2), v(st.x, 7, TF_Z));
      for (const dx of [-7, 7]) out.push(v(st.x + dx, 0, -st.length), v(st.x + dx, 3, -st.length + 1.5), v(st.x + dx, 0, -1));
    });
    return out;
  }, [frameKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Canvas
      dpr={compact ? [1, 1.5] : [1, 1.75]}
      camera={{ fov: 32, near: 0.5, far: 400, position: [10, 30, 40] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onPointerMissed={() => onHover(null)}
    >
      <color attach="background" args={["#070b12"]} />
      <hemisphereLight args={["#d5def0", "#0a0d12", 0.9]} />
      <directionalLight position={[-14, 26, 18]} intensity={1.9} color="#f4f7ff" />
      <directionalLight position={[16, 10, -20]} intensity={0.55} color="#33e1c9" />
      <mesh geometry={box} material={mat.ground} scale={[400, 0.01, 400]} position={[0, -0.01, 0]} raycast={noRay} />
      <Substation x={subX} onHover={onHover} />
      <FeederPoles from={subX + 1.6} to={lastX + 6} />
      {streets.map((st) => (
        <group key={st.tf}>
          <Street st={st} compact={compact} />
          <Transformer st={st} selected={selected === st.tf} compact={compact} still={still} onHover={onHover} onSelect={onSelect} />
          {st.houses.map(({ house, spot }) => (
            <ProgramHouse key={house.key} house={house} spot={spot} onHover={onHover} still={still} />
          ))}
          {st.normals.map((n, i) => (
            <NormalHouse key={i} spot={n} pv={i % 3 === 1} street={st} onHover={onHover} />
          ))}
        </group>
      ))}
      <Wires defs={defs} kw={kw} />
      <Particles defs={defs} kw={kw} still={still} />
      <SignalPulse still={still} />
      <CameraRig pts={pts} still={still} compact={compact} />
    </Canvas>
  );
}
