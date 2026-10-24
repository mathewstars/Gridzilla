// Where everything stands in the street scene. Shared by the 3D scene and the 2D fallback so both tell the same story.
// One street per transformer of the feeder, left to right in the same order as the transformer list beside the scene.
// The transformer kiosk stands at the head of its street, houses line both sides behind it (one house per meter, from
// `housesOf`), the feeder's overhead line runs from the substation on the left from kiosk to kiosk.
import type { State } from "../../api";
import { housesOf, loadPct, tfsOf, type House } from "../../model";

export interface Spot {
  x: number;
  z: number;
  side: 1 | -1; // which side of the road: -1 = left, +1 = right
}

export interface StreetModel {
  tf: string;
  x: number; // street centre
  load_kw: number | null;
  pct: number | null;
  rating: number;
  reverse: number;
  others: number; // houses on this transformer not in the program
  houses: { house: House; spot: Spot }[];
  normals: Spot[]; // a few neighbours stand in for `others`
  length: number; // road length behind the transformer
}

export const STREET_GAP = 12;
export const LOT = 5.2; // distance between houses along the road
export const HOUSE_OFFSET = 4.0; // house centre from road centre
export const TF_Z = 1.6; // transformer kiosk
export const FEEDER_Z = TF_Z; // the feeder's overhead line runs kiosk to kiosk along the front
export const FEEDER_Y = 2.95; // wire height: the kiosk roof

/** `slots` = how many house spots each street shows; neighbours outside the program fill the spots left over. */
export function buildStreets(s: State, feeder: string, slots: number): StreetModel[] {
  const tfs = tfsOf(s, feeder);
  return tfs.map((tf, i) => {
    const x = (i - (tfs.length - 1) / 2) * STREET_GAP;
    // the real house first so it always stands at the front, then a stable order
    const houses = housesOf(s, tf).sort((a, b) => Number(b.real) - Number(a.real) || a.key.localeCompare(b.key));
    const spots = (n: number, offset: number): Spot[] =>
      Array.from({ length: n }, (_, k) => {
        const j = k + offset;
        const side = (j % 2 === 0 ? -1 : 1) as 1 | -1;
        return { x: x + side * HOUSE_OFFSET, z: -2.4 - Math.floor(j / 2) * LOT, side };
      });
    const prog = spots(houses.length, 0);
    const normals = spots(Math.max(0, slots - houses.length), houses.length);
    const all = [...prog, ...normals];
    const agg = s.aggregates[tf];
    const node = s.tree[tf];
    return {
      tf,
      x,
      load_kw: agg?.total_kw ?? null,
      pct: loadPct(s, tf, agg?.total_kw),
      rating: node?.rating_kw ?? 0,
      reverse: node?.reverse_kw ?? node?.rating_kw ?? 0,
      others: node?.other_houses ?? 0,
      houses: houses.map((house, k) => ({ house, spot: prog[k] })),
      normals,
      length: Math.max(8, ...all.map((p) => -p.z)) + 3.2,
    };
  });
}

/** Particle speed from kW: visible at 0.3 kW, saturating so a 1 MW feeder line does not blur. World units per second. */
export const flowSpeed = (kw: number) => Math.min(6.5, 0.9 + Math.sqrt(Math.abs(kw)) * 0.55);

/** A wire counts as carrying power above this many kW (below it the house is balanced). */
export const FLOW_EPS = 0.15;
