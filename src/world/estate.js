// Carrighill Lower: the estate at home, built to look like the real thing. White dash-rendered bungalows with
// grey hipped roofs and a gabled porch on white pillars, gravel drives behind beech hedges, a tree-lined avenue
// with grass verges, footpaths and grey lamp posts, the granite gate pillars and name stone at the entrance off
// the L8007, and our own house, whose drive dips down from the road.
import * as THREE from 'three';
import world, { edges } from '../game/graph.js';
import { roadGrid, isEstateRoad, inEstate } from './common.js';
import { Soup, ribbon, offsets, centroid } from './geom.js';
import { crownMaterial, barkMaterial, lumpySphere, lumpyBox } from './foliage.js';
import { rng, bungalowTexture, tileTexture, stoneTexture, pavementTexture, hedgeTexture } from './textures.js';

const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export const estateEdges = edges.filter(isEstateRoad);

// cross-section of an estate road, in metres from its centreline
const X = { treeAt: 1.6, lampAt: 2.0, pathIn: 2.4, pathOut: 3.9, hedgeAt: 5.2 }; // added to the road's half width

// nearest point on the estate roads: { x, z, dx, dz, dist, e }
function nearestEstate(x, z) {
  let best = null;
  for (const e of estateEdges) for (let k = 1; k < e.pts.length; k++) {
    const a = e.pts[k - 1], b = e.pts[k], vx = b[0] - a[0], vz = b[1] - a[1], L = vx * vx + vz * vz; if (!L) continue;
    let t = ((x - a[0]) * vx + (z - a[1]) * vz) / L; t = Math.max(0, Math.min(1, t));
    const px = a[0] + vx * t, pz = a[1] + vz * t, d = Math.hypot(x - px, z - pz);
    if (!best || d < best.dist) { const l = Math.sqrt(L); best = { x: px, z: pz, dx: vx / l, dz: vz / l, dist: d, e }; }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------------------------
// Where every bungalow goes: on its OpenStreetMap plot, facing the nearest estate road, set back behind the hedge.
const W = 14, D = 8; // a bungalow, at the estate's 80% scale
export const estateBuildingIdx = new Set(); // every OSM building the estate replaces with a bungalow (or leaves out)
function planHouses() {
  const out = [];
  world.buildings.forEach((b, i) => {
    if (!/^(house|yes|residential|detached|bungalow)$/.test(b.kind) || b.pts.length < 3) return;
    const [cx, cz] = centroid(b.pts);
    if (!inEstate(cx, cz, 20)) return;
    const n = nearestEstate(cx, cz);
    if (!n || n.dist > 42) return;
    // a house nearer the main road than the estate road isn't in the estate
    const main = roadGrid.nearest(cx, cz, 60);
    if (main && !isEstateRoad(main.e) && main.dist < n.dist - 4) return;
    estateBuildingIdx.add(i);
    let fx = n.x - cx, fz = n.z - cz; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    const ours = !!b.ours;
    // front of the house this far from the road centre
    const half = n.e.w / 2, setback = half + X.hedgeAt + (ours ? 13 : 7.5) + D / 2;
    const x = n.x - fx * Math.max(setback, n.dist), z = n.z - fz * Math.max(setback, n.dist);
    if (out.some((h) => Math.hypot(h.x - x, h.z - z) < 17 && !(ours && !h.ours))) return;
    // our house wins any clash with a neighbour
    if (ours) for (let j = out.length - 1; j >= 0; j--) if (Math.hypot(out[j].x - x, out[j].z - z) < 19) out.splice(j, 1);
    out.push({ i, x, z, fx, fz, ours, road: n, side: (i * 7) % 2 ? 1 : -1 });
  });
  return out;
}
export const houses = planHouses();
export const ours = houses.find((h) => h.ours) || null;

// ---------------------------------------------------------------------------------------------------------------
// Our plot dips down from the road: a bowl DIP metres deep with the drive running down the front slope.
const DIP = 2.1;
export const home = (() => {
  if (!ours) return null;
  const { x, z, fx, fz } = ours, ux = -fz, uz = fx; // u along the front (to the right seen from the road), f toward the road
  const tHedge = Math.hypot(ours.road.x - x, ours.road.z - z) - (ours.road.e.w / 2 + X.hedgeAt);
  const plot = { sMin: -W / 2 - 7, sMax: W / 2 + 9, tMin: -D / 2 - 8, tMax: tHedge - 0.8 };
  const apron = { sMin: -W / 2 - 1, sMax: W / 2 + 1, tMin: D / 2, tMax: D / 2 + 6.5 };
  const drive = { s: W / 2 - 2.5, half: 1.9 }; // the drive comes in toward the right-hand end
  const local = (px, pz) => ({ s: (px - x) * ux + (pz - z) * uz, t: (px - x) * fx + (pz - z) * fz });
  const world2 = (s, t) => [x + ux * s + fx * t, z + uz * s + fz * t];
  const groundY = (px, pz) => {
    const { s, t } = local(px, pz);
    if (s <= plot.sMin || s >= plot.sMax || t <= plot.tMin || t >= plot.tMax) return 0;
    const k = Math.min((s - plot.sMin) / 3, (plot.sMax - s) / 3, (t - plot.tMin) / 3, (plot.tMax - t) / (plot.tMax - apron.tMax));
    return -DIP * smooth(k);
  };
  const inDrive = (s, t) => (Math.abs(s - drive.s) < drive.half && t > apron.tMin) || (s > apron.sMin && s < apron.sMax && t > apron.tMin && t < apron.tMax);
  const roadPt = [ours.road.x - fx * (ours.road.e.w / 2 - 0.5), ours.road.z - fz * (ours.road.e.w / 2 - 0.5)];
  const driveTop = world2(drive.s, plot.tMax + X.hedgeAt);
  return {
    x, z, fx, fz, ux, uz, plot, apron, drive, local, world: world2, groundY, inDrive, DIP,
    corners: [world2(plot.sMin, plot.tMin), world2(plot.sMax, plot.tMin), world2(plot.sMax, plot.tMax), world2(plot.sMin, plot.tMax)],
    // where the car starts (on the gravel in front of the house, facing out) and the drivable bits for the car
    start: { p: world2(drive.s - 2.5, D / 2 + 3.5), h: Math.atan2(fx, fz) },
    target: world2(0, D / 2 + 3.5),
    driveways: [
      { a: [driveTop[0] + fx * 2, driveTop[1] + fz * 2], b: world2(drive.s, D / 2 + 3), half: drive.half },
      { a: world2(apron.sMin + 2, D / 2 + 3.2), b: world2(apron.sMax - 2, D / 2 + 3.2), half: 3 },
    ],
    roadPt,
  };
})();
export const groundY = home ? home.groundY : () => 0;

// ---------------------------------------------------------------------------------------------------------------
export function buildEstate(scene) {
  const g = new THREE.Group(); scene.add(g);
  const r = rng(61);
  const walls = new Soup(), roofs = new Soup(), trim = new Soup(), glass = new Soup(), gravel = new Soup(), path = new Soup();

  // ---- footpaths both sides of the estate roads, beyond a grass verge
  for (const e of estateEdges) {
    const half = e.w / 2, mid = half + (X.pathIn + X.pathOut) / 2, w = (X.pathOut - X.pathIn) / 2;
    const { L, R } = offsets(e.pts, mid);
    ribbon(path, L, w, 0.035, { vScale: 3, uScale: 3 }); ribbon(path, R, w, 0.035, { vScale: 3, uScale: 3 });
  }

  // ---- the houses
  const hedgeSpots = [], shrubSpots = [], treeSpots = [];
  for (const h of houses) {
    const base = h.ours ? -DIP : 0;
    bungalow(walls, roofs, trim, glass, h, base, h.ours, r);
    const { x, z, fx, fz } = h, ux = -fz, uz = fx;
    const P = (s, t) => [x + ux * s + fx * t, z + uz * s + fz * t];
    const tRoad = Math.hypot(h.road.x - x, h.road.z - z), tHedge = tRoad - (h.road.e.w / 2 + X.hedgeAt);
    const ds = h.ours ? home.drive.s : h.side * (W / 2 - 2.5);
    // beech hedge along the front, with a gap for the drive
    for (let s = -W / 2 - 6; s <= W / 2 + 6; s += 1.6) if (Math.abs(s - ds) > 2.6) hedgeSpots.push([...P(s, tHedge), Math.atan2(ux, uz)]);
    // gravel drive and the apron in front of the house (ours is drawn into its dip)
    if (!h.ours) {
      const a = P(ds, tRoad - h.road.e.w / 2 + 0.2), b = P(ds, D / 2 + 5);
      ribbon(gravel, [a, b], 1.8, 0.045, { vScale: 3, uScale: 3 });
      ribbon(gravel, [P(-W / 2, D / 2 + 3), P(W / 2, D / 2 + 3)], 2.6, 0.04, { vScale: 3, uScale: 3 });
    } else {
      // the drive across the verge and footpath, up to the hedge line
      ribbon(gravel, [P(ds, tRoad - h.road.e.w / 2 + 0.2), P(ds, tHedge + 0.5)], 1.9, 0.045, { vScale: 3, uScale: 3 });
    }
    // shrubs along the front of the house, a birch or two in the garden
    for (let s = -W / 2 + 1; s < W / 2 - 1; s += 2.2) if (r() < 0.7) shrubSpots.push([...P(s, D / 2 + 0.9), base, 0.5 + r() * 0.5]);
    if (r() < 0.8) treeSpots.push({ p: P(-W / 2 - 3.5, tHedge - 3), y: 0, birch: true });
    if (r() < 0.5) treeSpots.push({ p: P(W / 2 + 4, -D / 2 - 4), y: base * 0.3, birch: r() < 0.5 });
  }

  // ---- our dip: a sunken lawn with the drive and the gravel apron, and a hole in the ground over it
  if (home) g.add(dipMesh());

  // ---- avenue trees in the verges, and lamps
  const lampSpots = [];
  for (const e of estateEdges) {
    for (const side of [-1, 1]) {
      const { L, R } = offsets(e.pts, e.w / 2 + X.treeAt);
      const line = side < 0 ? L : R;
      walkLine(line, 11, 6, (x, z) => {
        // keep clear of drives and junctions
        if (houses.some((h) => Math.hypot(h.x - x, h.z - z) < 30 && Math.abs((x - h.x) * -h.fz + (z - h.z) * h.fx - (h.ours ? home.drive.s : 0)) < 3.5)) return;
        if (roadGrid.dist(x, z, 12) < 1.2) return;
        treeSpots.push({ p: [x, z], y: 0, avenue: true });
      });
    }
    const { L } = offsets(e.pts, e.w / 2 + X.lampAt);
    walkLine(L, 28, 9, (x, z) => { if (roadGrid.dist(x, z, 12) > 1.4) lampSpots.push([x, z]); });
  }

  // ---- materials and meshes
  const add = (soup, mat, shadow = true) => { const m = new THREE.Mesh(soup.geometry(), mat); m.castShadow = shadow; m.receiveShadow = true; g.add(m); return m; };
  { const t = bungalowTexture(); add(walls, new THREE.MeshStandardMaterial({ map: t, normalMap: t.userData.normal, normalScale: new THREE.Vector2(0.6, 0.6), vertexColors: true, roughness: 0.92 })); }
  { const t = tileTexture(); add(roofs, new THREE.MeshStandardMaterial({ map: t, normalMap: t.userData.normal, vertexColors: true, roughness: 0.8 })); }
  add(trim, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
  add(glass, new THREE.MeshStandardMaterial({ color: 0x3f5f78, roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.6, side: THREE.DoubleSide }), false);
  const gravelMat = new THREE.MeshStandardMaterial({ map: gravelTexture(), roughness: 1, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  add(gravel, gravelMat, false);
  add(path, new THREE.MeshStandardMaterial({ map: pavementTexture(), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), false);

  instancedHedge(g, hedgeSpots);
  instancedShrubs(g, shrubSpots);
  instancedTrees(g, treeSpots, r);
  instancedLamps(g, lampSpots);
  entrance(g, r);
  return g;
}

function walkLine(line, step, start, fn) {
  const cum = [0]; for (let k = 1; k < line.length; k++) cum.push(cum[k - 1] + Math.hypot(line[k][0] - line[k - 1][0], line[k][1] - line[k - 1][1]));
  for (let d = start; d < cum[cum.length - 1] - 3; d += step) {
    let k = 1; while (k < cum.length - 1 && cum[k] < d) k++;
    const t = (d - cum[k - 1]) / ((cum[k] - cum[k - 1]) || 1);
    fn(line[k - 1][0] + (line[k][0] - line[k - 1][0]) * t, line[k - 1][1] + (line[k][1] - line[k - 1][1]) * t);
  }
}

// a triangle that faces up/out: flips the winding if its normal points the wrong way
function face(soup, a, b, c, ua, ub, uc, col, out) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) soup.tri(a, c, b, ua, uc, ub, col);
  else soup.tri(a, b, c, ua, ub, uc, col);
}

// A box from local corners (s0..s1, t0..t1, y0..y1) on a house frame P(s, t, y), coloured, into a plain soup.
function boxOn(soup, P, s0, s1, t0, t1, y0, y1, col) {
  const c = [(s0 + s1) / 2, (t0 + t1) / 2];
  const corners = [[s0, t0], [s1, t0], [s1, t1], [s0, t1]];
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4];
    const A0 = P(a[0], a[1], y0), B0 = P(b[0], b[1], y0), B1 = P(b[0], b[1], y1), A1 = P(a[0], a[1], y1);
    const m = P((a[0] + b[0]) / 2 - c[0] + c[0], (a[1] + b[1]) / 2, y0), C = P(c[0], c[1], y0);
    const out = [m[0] - C[0], 0, m[2] - C[2]];
    face(soup, A0, B0, B1, [0, 0], [0, 0], [0, 0], col, out); face(soup, A0, B1, A1, [0, 0], [0, 0], [0, 0], col, out);
  }
  const T = corners.map((q) => P(q[0], q[1], y1));
  face(soup, T[0], T[1], T[2], [0, 0], [0, 0], [0, 0], col, [0, 1, 0]); face(soup, T[0], T[2], T[3], [0, 0], [0, 0], [0, 0], col, [0, 1, 0]);
}

// ---------------------------------------------------------------------------------------------------------------
// A bungalow: dash-rendered walls with wide windows, a hipped tiled roof, a chimney, a gabled porch on two white
// pillars; ours also has the glazed sunroom at its right-hand end.
function bungalow(walls, roofs, trim, glass, h, base, isOurs, r) {
  const { x, z, fx, fz } = h, ux = -fz, uz = fx;
  const P = (s, t, y) => [x + ux * s + fx * t, base + y, z + uz * s + fz * t];
  const HT = 2.9, white = [1, 1, 1], trimWhite = hex('#fbfbf8'), roofCol = hex(isOurs ? '#8a8781' : ['#8a8781', '#7f7c76', '#918e88'][(r() * 3) | 0]);
  // walls: front, right end, back, left end (each faces out)
  const sides = [
    [[-W / 2, D / 2], [W / 2, D / 2], [0, 1]], [[W / 2, D / 2], [W / 2, -D / 2], [1, 0]],
    [[W / 2, -D / 2], [-W / 2, -D / 2], [0, -1]], [[-W / 2, -D / 2], [-W / 2, D / 2], [-1, 0]],
  ];
  for (const [a, b, o] of sides) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), u = len / 3.5, v = HT / 3;
    const out = [ux * o[0] + fx * o[1], 0, uz * o[0] + fz * o[1]];
    face(walls, P(a[0], a[1], 0), P(b[0], b[1], 0), P(b[0], b[1], HT), [0, 0], [u, 0], [u, v], white, out);
    face(walls, P(a[0], a[1], 0), P(b[0], b[1], HT), P(a[0], a[1], HT), [0, 0], [u, v], [0, v], white, out);
  }
  // hipped roof with a deep overhang
  const o = 0.5, rh = 2.3, hl = W / 2 + o, hd = D / 2 + o, ridge = W / 2 - D / 2;
  const A = P(-hl, hd, HT - 0.15), B = P(hl, hd, HT - 0.15), C = P(hl, -hd, HT - 0.15), Dd = P(-hl, -hd, HT - 0.15);
  const R0 = P(-ridge, 0, HT + rh), R1 = P(ridge, 0, HT + rh);
  const sl = Math.hypot(hd, rh) / 3, sw = (hl * 2) / 3;
  face(roofs, A, B, R1, [0, 0], [sw, 0], [sw * 0.8, sl], roofCol, [fx, 1, fz]); face(roofs, A, R1, R0, [0, 0], [sw * 0.8, sl], [sw * 0.2, sl], roofCol, [fx, 1, fz]);
  face(roofs, C, Dd, R0, [0, 0], [sw, 0], [sw * 0.8, sl], roofCol, [-fx, 1, -fz]); face(roofs, C, R0, R1, [0, 0], [sw * 0.8, sl], [sw * 0.2, sl], roofCol, [-fx, 1, -fz]);
  face(roofs, B, C, R1, [0, 0], [sl * 1.5, 0], [sl * 0.75, sl], roofCol, [ux, 1, uz]);
  face(roofs, Dd, A, R0, [0, 0], [sl * 1.5, 0], [sl * 0.75, sl], roofCol, [-ux, 1, -uz]);
  // soffit: the underside of the overhang, white
  const soffit = [[A, B, P(W / 2, D / 2, HT - 0.15), P(-W / 2, D / 2, HT - 0.15)], [C, Dd, P(-W / 2, -D / 2, HT - 0.15), P(W / 2, -D / 2, HT - 0.15)]];
  for (const [a, b, c, d] of soffit) { face(trim, a, b, c, [0, 0], [0, 0], [0, 0], trimWhite, [0, -1, 0]); face(trim, a, c, d, [0, 0], [0, 0], [0, 0], trimWhite, [0, -1, 0]); }
  // chimney through the back slope
  const PT = (s, t, y) => P(s, t, y);
  boxOn(trim, PT, W * 0.22 - 0.45, W * 0.22 + 0.45, -1.6, -0.8, HT + 0.8, HT + rh + 0.9, hex('#efede6'));
  boxOn(trim, PT, W * 0.22 - 0.55, W * 0.22 + 0.55, -1.7, -0.7, HT + rh + 0.9, HT + rh + 1.05, hex('#6d6a64'));
  // porch: two square white pillars and a little gable, a glazed front door behind
  const ps = isOurs ? -1.2 : (h.side > 0 ? -2.2 : 2.2), pw = 1.55, pd = 2.0;
  for (const s of [ps - pw, ps + pw]) boxOn(trim, PT, s - 0.18, s + 0.18, D / 2 + pd - 0.36, D / 2 + pd, 0, 2.55, trimWhite);
  boxOn(trim, PT, ps - pw - 0.25, ps + pw + 0.25, D / 2, D / 2 + pd + 0.15, 2.55, 2.75, trimWhite);
  {
    const gA = P(ps - pw - 0.35, D / 2 + pd + 0.25, 2.75), gB = P(ps + pw + 0.35, D / 2 + pd + 0.25, 2.75), gT = P(ps, D / 2 + pd + 0.25, 3.95);
    const gA2 = P(ps - pw - 0.35, D / 2 - 0.2, 2.75), gB2 = P(ps + pw + 0.35, D / 2 - 0.2, 2.75), gT2 = P(ps, D / 2 - 0.2, 3.95);
    face(trim, gA, gB, gT, [0, 0], [0, 0], [0, 0], hex('#e8dcc2'), [fx, 0, fz]); // pediment (beige, like ours)
    face(roofs, gA, gA2, gT2, [0, 0], [1, 0], [1, 0.6], roofCol, [-ux, 1, -uz]); face(roofs, gA, gT2, gT, [0, 0], [1, 0.6], [0, 0.6], roofCol, [-ux, 1, -uz]);
    face(roofs, gB, gT, gT2, [0, 0], [0, 0.6], [1, 0.6], roofCol, [ux, 1, uz]); face(roofs, gB, gT2, gB2, [0, 0], [1, 0.6], [1, 0], roofCol, [ux, 1, uz]);
    // white barge boards
    boxOn(trim, PT, ps - 0.1, ps + 0.1, D / 2 + pd + 0.2, D / 2 + pd + 0.32, 2.75, 3.95, trimWhite);
  }
  const door = [P(ps - 0.95, D / 2 + 0.03, 0.05), P(ps + 0.95, D / 2 + 0.03, 0.05), P(ps + 0.95, D / 2 + 0.03, 2.2), P(ps - 0.95, D / 2 + 0.03, 2.2)];
  boxOn(trim, PT, ps - 1.05, ps + 1.05, D / 2 - 0.02, D / 2 + 0.05, 0, 2.3, trimWhite);
  face(glass, door[0], door[1], door[2], [0, 0], [0, 0], [0, 0], white, [fx, 0, fz]); face(glass, door[0], door[2], door[3], [0, 0], [0, 0], [0, 0], white, [fx, 0, fz]);
  // a front step
  boxOn(trim, PT, ps - pw, ps + pw, D / 2, D / 2 + pd, 0, 0.15, hex('#cfc9bd'));
  // ours: the sunroom at the right-hand end, white frames and glass under a low roof
  if (isOurs) {
    const s0 = W / 2, s1 = W / 2 + 3.6, t0 = -D / 2 + 1.2, t1 = D / 2 + 0.6;
    boxOn(trim, PT, s0, s1, t0, t1, 0, 0.6, hex('#f2f0ea'));
    for (const [a, b, o2] of [[[s0, t1], [s1, t1], [0, 1]], [[s1, t1], [s1, t0], [1, 0]], [[s1, t0], [s0, t0], [0, -1]]]) {
      const out = [ux * o2[0] + fx * o2[1], 0, uz * o2[0] + fz * o2[1]];
      const q = [P(a[0], a[1], 0.6), P(b[0], b[1], 0.6), P(b[0], b[1], 2.5), P(a[0], a[1], 2.5)];
      face(glass, q[0], q[1], q[2], [0, 0], [0, 0], [0, 0], white, out); face(glass, q[0], q[2], q[3], [0, 0], [0, 0], [0, 0], white, out);
    }
    for (const [s, t] of [[s0 + 0.05, t1], [s1, t1], [s1, t0], [s1, (t0 + t1) / 2], [(s0 + s1) / 2, t1]]) boxOn(trim, PT, s - 0.07, s + 0.07, t - 0.07, t + 0.07, 0.6, 2.5, trimWhite);
    boxOn(trim, PT, s0, s1 + 0.2, t0 - 0.2, t1 + 0.2, 2.5, 2.7, trimWhite);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The sunken garden: a grid over the plot with heights from groundY, lawn green with the gravel drive and apron.
function dipMesh() {
  const { plot, inDrive, world: w2 } = home;
  const step = 1;
  const ns = Math.ceil((plot.sMax - plot.sMin) / step), nt = Math.ceil((plot.tMax - plot.tMin) / step);
  const pos = [], col = [], idx = [];
  const lawn = new THREE.Color('#6fae4c'), lawn2 = new THREE.Color('#79b955'), grav = new THREE.Color('#cbbb98');
  const r = rng(71);
  for (let j = 0; j <= nt; j++) for (let i = 0; i <= ns; i++) {
    const s = plot.sMin + (i / ns) * (plot.sMax - plot.sMin), t = plot.tMin + (j / nt) * (plot.tMax - plot.tMin);
    const [px, pz] = w2(s, t);
    pos.push(px, home.groundY(px, pz) + 0.01, pz);
    const c = inDrive(s, t) ? grav.clone().multiplyScalar(0.92 + r() * 0.12) : ((i + j) % 2 ? lawn : lawn2);
    col.push(c.r, c.g, c.b);
  }
  for (let j = 0; j < nt; j++) for (let i = 0; i < ns; i++) {
    const a = j * (ns + 1) + i, b = a + 1, c = a + ns + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  // make sure it faces up
  const n = geo.attributes.normal; let up = 0; for (let k = 0; k < n.count; k++) up += n.getY(k);
  if (up < 0) { const ix = geo.index.array; for (let k = 0; k < ix.length; k += 3) { const t = ix[k + 1]; ix[k + 1] = ix[k + 2]; ix[k + 2] = t; } geo.computeVertexNormals(); }
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  m.receiveShadow = true;
  return m;
}

function gravelTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), r = rng(73);
  g.fillStyle = '#cdbd9b'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2500; i++) { const v = 150 + r() * 80 | 0; g.fillStyle = `rgb(${v},${v - 10},${v - 30})`; g.fillRect(r() * 128, r() * 128, 1 + r() * 2, 1 + r() * 2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

// ---------------------------------------------------------------------------------------------------------------
function instancedHedge(g, spots) {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const ht = hedgeTexture();
  const im = new THREE.InstancedMesh(lumpyBox(), new THREE.MeshStandardMaterial({ map: ht, normalMap: ht.userData.normal, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.95 }), spots.length);
  const cols = ['#e6f2c0', '#f2f7cc', '#dce9b4', '#f6eec2', '#e9f0bd'].map((h) => new THREE.Color(h)); // beech: fresh green with a hint of copper, over the leaf texture
  spots.forEach(([x, z, a], i) => { im.setMatrixAt(i, m.compose(p.set(x, 0.65, z), q.setFromAxisAngle(Y, a), s.set(1.0, 1.3, 1.75))); im.setColorAt(i, cols[i % cols.length]); });
  im.castShadow = true; im.receiveShadow = true; g.add(im);
}

function instancedShrubs(g, spots) {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const im = new THREE.InstancedMesh(lumpySphere(3, 2), crownMaterial(), spots.length);
  const cols = ['#b9cf9f', '#a6bf8c', '#cbdcae', '#b0c794'].map((h) => new THREE.Color(h));
  spots.forEach(([x, z, y, rad], i) => { im.setMatrixAt(i, m.compose(p.set(x, y + rad * 0.7, z), q, s.set(rad, rad * 0.8, rad))); im.setColorAt(i, cols[i % cols.length]); });
  im.castShadow = true; g.add(im);
}

function instancedTrees(g, spots, r) {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.18, 1, 7).translate(0, 0.5, 0), barkMaterial(), spots.length);
  const birch = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.15, 1, 6).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0xece8e0, roughness: 0.9 }), spots.length);
  const crown = new THREE.InstancedMesh(lumpySphere(7), crownMaterial(), spots.length * 2);
  const greens = ['#a8c890', '#b8d49e', '#98b983', '#c4dca8', '#a2c189'].map((h) => new THREE.Color(h));
  let nt = 0, nb = 0;
  spots.forEach((t, i) => {
    const [x, z] = t.p, y = t.y || 0;
    // avenue trees: young lime / hornbeam, tall oval crowns; birches: slim, airy
    const hgt = t.avenue ? 6.5 + r() * 1.5 : t.birch ? 7 + r() * 2 : 5 + r() * 3;
    const rad = t.avenue ? 1.9 + r() * 0.4 : t.birch ? 1.6 : 2.4 + r();
    m.compose(p.set(x, y, z), q.identity(), s.set(1, hgt * 0.6, 1));
    if (t.birch) birch.setMatrixAt(nb++, m); else trunk.setMatrixAt(nt++, m);
    for (let j = 0; j < 2; j++) {
      m.compose(p.set(x + (j ? (r() - 0.5) * rad * 0.5 : 0), y + hgt * (j ? 0.78 : 0.62), z + (j ? (r() - 0.5) * rad * 0.5 : 0)), q.setFromAxisAngle(Y, r() * 6), s.set(rad * (j ? 0.75 : 1), rad * (t.avenue ? 1.5 : 1.15) * (j ? 0.8 : 1), rad * (j ? 0.75 : 1)));
      crown.setMatrixAt(i * 2 + j, m); crown.setColorAt(i * 2 + j, greens[(r() * greens.length) | 0]);
    }
  });
  trunk.count = nt; birch.count = nb;
  for (const im of [trunk, birch, crown]) { im.castShadow = true; im.receiveShadow = true; g.add(im); }
}

function instancedLamps(g, spots) {
  const grey = new THREE.MeshStandardMaterial({ color: 0x9a9d9f, roughness: 0.5, metalness: 0.5 });
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.13, 6.5, 8).translate(0, 3.25, 0), grey, spots.length);
  const head = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.32, 0.35, 10).translate(0, 6.6, 0), grey, spots.length);
  const m = new THREE.Matrix4();
  spots.forEach(([x, z], i) => { m.makeTranslation(x, 0, z); pole.setMatrixAt(i, m); head.setMatrixAt(i, m); });
  pole.castShadow = true; g.add(pole, head);
}

// ---------------------------------------------------------------------------------------------------------------
// The entrance off the L8007: a granite post-and-lintel gateway either side of the road, the name stone, a
// weeping willow, and the avenue running in.
function entrance(g, r) {
  const E = world.poi['Estate Entrance']; if (!E) return;
  // the estate road that starts here, and which way it runs in
  let best = null;
  for (const e of estateEdges) for (const [k, dir] of [[0, 1], [e.pts.length - 1, -1]]) {
    const d = Math.hypot(e.pts[k][0] - E[0], e.pts[k][1] - E[1]);
    if (!best || d < best.d) best = { d, e, k, dir };
  }
  if (!best) return;
  const pts = best.dir > 0 ? best.e.pts : [...best.e.pts].reverse();
  // a point 9 m in, and the direction there
  let acc = 0, i = 1;
  while (i < pts.length - 1 && acc + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) < 9) { acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); i++; }
  const a = pts[i - 1], b = pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, dx = (b[0] - a[0]) / l, dz = (b[1] - a[1]) / l;
  const t = Math.min(1, (9 - acc) / l), cx = a[0] + (b[0] - a[0]) * t, cz = a[1] + (b[1] - a[1]) * t;
  const lx = dz, lz = -dx; // left, driving in
  const gt = stoneTexture(); const granite = new THREE.MeshStandardMaterial({ map: gt, roughness: 1, flatShading: true });
  const half = best.e.w / 2;
  for (const side of [-1, 1]) {
    const ox = cx + lx * side * (half + 3.2), oz = cz + lz * side * (half + 3.2);
    const gate = new THREE.Group();
    const post = (u) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.3, 0.8, 2, 3, 2), granite); m.position.set(u, 1.15, 0); jitter(m.geometry, 0.06, r); m.castShadow = true; return m; };
    gate.add(post(-1.1), post(1.1));
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.55, 0.9, 4, 1, 2), granite); lintel.position.set(0, 2.55, 0); jitter(lintel.geometry, 0.05, r); lintel.castShadow = true;
    gate.add(lintel);
    gate.position.set(ox, 0, oz); gate.rotation.y = Math.atan2(dx, dz) + Math.PI / 2; // lintel runs along the road
    g.add(gate);
  }
  // the name stone on the right going in
  const sx = cx - lx * (half + 4.6) + dx * 5, sz = cz - lz * (half + 4.6) + dz * 5;
  const stone = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2).scale(1.4, 0.75, 0.7), new THREE.MeshStandardMaterial({ map: stoneTexture('Carrighill\nLower'), roughness: 1 }));
  jitter(stone.geometry, 0.08, r);
  stone.position.set(sx, 0.55, sz); stone.rotation.y = Math.atan2(-lx, -lz) + Math.PI; stone.castShadow = true; g.add(stone);
  // weeping willow on the left, just inside
  const wx = cx + lx * (half + 7) + dx * 3, wz = cz + lz * (half + 7) + dz * 3;
  const willow = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 5, 7).translate(0, 2.5, 0), new THREE.MeshStandardMaterial({ color: 0x6b5a48 })); willow.add(trunk);
  const leaf = crownMaterial().clone(); leaf.color.set(0xd9ecaa); // willow: pale, yellowy green
  const drapeGeo = lumpySphere(13, 2, 0.3);
  for (let k = 0; k < 22; k++) {
    const ang = (k / 22) * Math.PI * 2 + r() * 0.2, rad = 2.4 + r() * 1.3;
    // long hanging curtains of leaves
    const len = 4 + r() * 1.6;
    const drape = new THREE.Mesh(drapeGeo, leaf);
    drape.scale.set(0.8, len / 2, 0.8);
    drape.position.set(Math.cos(ang) * rad, 6.3 - len / 2, Math.sin(ang) * rad); drape.castShadow = true; willow.add(drape);
  }
  const top = new THREE.Mesh(lumpySphere(17), leaf); top.scale.set(3.4, 1.8, 3.4); top.position.y = 6.4; willow.add(top);
  willow.position.set(wx, 0, wz); g.add(willow);
}

// roughen a shape: every copy of a vertex moves the same way, so faces stay joined
function jitter(geo, amt, r) {
  const p = geo.attributes.position, offs = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!offs.has(k)) offs.set(k, [(r() - 0.5) * amt * 2, (r() - 0.5) * amt * 2, (r() - 0.5) * amt * 2]);
    const o = offs.get(k);
    p.setXYZ(i, p.getX(i) + o[0], p.getY(i) + o[1], p.getZ(i) + o[2]);
  }
  geo.computeVertexNormals();
}
