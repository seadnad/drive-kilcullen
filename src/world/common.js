// Shared lookups for the world: where town is, where the Carrighill estate is, and the road distance grid.
import world, { edges } from '../game/graph.js';
import { RoadGrid } from './geom.js';

export const TOWN = { x: -120, z: 60, r: 760 }; // game coordinates of the middle of town
export const inTown = (x, z, pad = 0) => Math.hypot(x - TOWN.x, z - TOWN.z) < TOWN.r + pad;

// the Carrighill Lower estate: between the house and the far end of the estate road
const H = world.poi['Our House'], E = world.poi.Home;
export const ESTATE = { x: (H[0] + E[0]) / 2 + 25, z: (H[1] + E[1]) / 2, r: 175 };
export const inEstate = (x, z, pad = 0) => Math.hypot(x - ESTATE.x, z - ESTATE.z) < ESTATE.r + pad;
export const isEstateRoad = (e) => e.cls === 'residential' && e.pts.some((p) => inEstate(p[0], p[1]));

// How far past the kerb the car may wander: onto the footpath in town and in the estate, a little onto the verge
// out the country (the hedges stand just beyond), hardly at all on the bridge.
function marginFor(e) {
  if (e.bridge) return 0.15;
  if (isEstateRoad(e)) return 0.6; // the avenue trees stand in the verge
  const mid = e.pts[(e.pts.length / 2) | 0];
  if (inTown(mid[0], mid[1])) return 2.4;
  if (e.cls === 'service') return 1.2;
  return 0.9;
}
export const roadGrid = new RoadGrid(edges, 40, marginFor);

// the stretches of a polyline whose points pass a test (each at least two points long)
export function runsWhere(pts, test) {
  const out = []; let cur = [];
  for (const p of pts) { if (test(p)) cur.push(p); else { if (cur.length > 1) out.push(cur); cur = []; } }
  if (cur.length > 1) out.push(cur);
  return out;
}
