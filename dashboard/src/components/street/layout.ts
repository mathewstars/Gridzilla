// Where everything stands in the street scene. Shared by the 3D scene and the 2D fallback so both tell the same story.
import type { State } from "../../api";
import { housesOf, loadPct, tfsOf, type House } from "../../model";

export interface Spot {
  x: number;
  z: number;
  side: 1 | -1;
}

export interface StreetModel {
  tf: string;
  x: number; // street centre
  load_kw: number | null;
  pct: number | null;
  rating: number;
  others: number; // houses on this transformer not in the program
  houses: { house: House; spot: Spot }[];
  normals: Spot[]; // a few normal houses stand in for `others`
}

export const STREET_GAP = 15;
const LOT = 4.4;

export function buildStreets(s: State, feeder: string, normalsPerStreet: number): StreetModel[] {
  const tfs = tfsOf(s, feeder);
  return tfs.map((tf, i) => {
    const x = (i - (tfs.length - 1) / 2) * STREET_GAP;
    const houses = housesOf(s, tf).sort((a, b) => Number(b.real) - Number(a.real));
    const spots = (n: number, offset: number): Spot[] =>
      Array.from({ length: n }, (_, k) => {
        const j = k + offset;
        const side = (j % 2 === 0 ? -1 : 1) as 1 | -1;
        return { x: x + side * 3.6, z: -2.2 - Math.floor(j / 2) * LOT, side };
      });
    const prog = spots(houses.length, 0);
    const agg = s.aggregates[tf];
    return {
      tf,
      x,
      load_kw: agg?.total_kw ?? null,
      pct: loadPct(s, tf, agg?.total_kw),
      rating: s.tree[tf].rating_kw ?? 0,
      others: s.tree[tf].other_houses ?? 0,
      houses: houses.map((house, k) => ({ house, spot: prog[k] })),
      normals: spots(normalsPerStreet, houses.length + (houses.length % 2)),
    };
  });
}

/** Flow speed for particles from kW: visible at 0.3 kW, saturating so a 600 kW feeder line does not blur. */
export const flowSpeed = (kw: number) => Math.min(2.4, 0.25 + Math.sqrt(Math.abs(kw)) * 0.32);
