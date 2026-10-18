// Builds the scenery from world.json: ground, roads and markings, footpaths, the Liffey and streams, parks and
// pitches, every building (walls with windows, gable or flat roofs), hedgerows, trees and street lamps.
import * as THREE from 'three';
import world, { edges, nodes } from '../game/graph.js';
import { Soup, ribbon, disc, flatPoly, polyArea, centroid, obb, slice, RoadGrid, offsets } from './geom.js';
import { SIGNS } from './places.js';
import { pointInPoly } from './geom.js';
import { TOWN, inTown, roadGrid, runsWhere, inEstate, isEstateRoad } from './common.js';
import { home, estateBuildingIdx } from './estate.js';
import { noiseTexture } from '../render/atmosphere.js';
import { crownMaterial, barkMaterial, lumpySphere, lumpyBox } from './foliage.js';
import { grassTexture, asphaltTexture, pavementTexture, waterTexture, facadeTexture, roofTexture, hedgeTexture, rng } from './textures.js';

export { TOWN, inTown, roadGrid };

const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };

export function buildWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const bounds = new THREE.Box2();
  for (const n of nodes) bounds.expandByPoint(new THREE.Vector2(n.x, n.z));
  bounds.expandByScalar(700);

  // ---------------------------------------------------------------- ground
  const grass = grassTexture();
  // one big field, with a hole where our garden dips below the road (the estate fills it with the sunken lawn)
  grass.repeat.set(1 / 9, 1 / 9); grass.userData.normal.repeat.set(1 / 9, 1 / 9);
  const shape = new THREE.Shape([[bounds.min.x, bounds.min.y], [bounds.max.x, bounds.min.y], [bounds.max.x, bounds.max.y], [bounds.min.x, bounds.max.y]].map(([x, z]) => new THREE.Vector2(x, -z)));
  if (home) shape.holes.push(new THREE.Path(home.corners.map(([x, z]) => new THREE.Vector2(x, -z))));
  const ground = new THREE.Mesh(new THREE.ShapeGeometry(shape), grassMaterial(grass));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  group.add(ground);

  // ---------------------------------------------------------------- roads
  const road = new Soup(), path = new Soup(), marks = new Soup(), yellow = new Soup(), edge = new Soup();
  for (const e of edges) {
    const half = e.w / 2;
    ribbon(road, e.pts, half, 0.06, { vScale: 6, uScale: 6 });
    if (e.cls !== 'service' && e.cls !== 'residential') for (const run of runsWhere(e.pts, (p) => !inTown(p[0], p[1], -60))) ribbon(edge, run, half + 0.45, 0.045, { col: hex('#8c8a6c') });
    if (e.cls !== 'service' && !e.bridge && !isEstateRoad(e)) for (const run of runsWhere(e.pts, (p) => inTown(p[0], p[1]))) ribbon(path, run, half + 2.4, 0.03, { vScale: 3, uScale: 3 });
    // broken white centre line on two-lane roads (not the estate, not the narrow local L roads)
    const estate = isEstateRoad(e), local = /^L/.test(e.ref);
    if (e.lanes >= 2 && e.w >= 6 && !e.round && e.len > 14 && !estate && !local) {
      for (let s = 6; s + 3 < e.len - 6; s += 9) ribbon(marks, slice(e.pts, e.cum, s, s + 3), 0.08, 0.09);
    }
    // the local roads have broken white lines along each edge instead
    if (local) {
      for (const run of runsWhere(e.pts, (p) => !inTown(p[0], p[1]))) {
        const { L, R } = offsets(run, half - 0.4);
        for (const line of [L, R]) {
          const cum = [0]; for (let k = 1; k < line.length; k++) cum.push(cum[k - 1] + Math.hypot(line[k][0] - line[k - 1][0], line[k][1] - line[k - 1][1]));
          for (let s = 2; s + 2.5 < cum[cum.length - 1]; s += 5) ribbon(marks, slice(line, cum, s, s + 2.5), 0.07, 0.09);
        }
      }
    }
    // yellow edge lines on the regional roads out the country
    if (/^R/.test(e.ref) && e.len > 10) {
      for (const run of runsWhere(e.pts, (p) => !inTown(p[0], p[1]))) {
        const { L, R } = offsets(run, half - 0.35);
        ribbon(yellow, L, 0.07, 0.09); ribbon(yellow, R, 0.07, 0.09);
      }
    }
  }
  for (const n of nodes) {
    let r = 0; for (const e of edges) if (e.a === n.i || e.b === n.i) r = Math.max(r, e.w / 2);
    if (r) disc(road, n.x, n.z, r * 1.02, 0.061, 24, [1, 1, 1], 6);
    if (r && inTown(n.x, n.z)) disc(path, n.x, n.z, r + 2.4, 0.031, 24, [1, 1, 1], 3);
  }
  const asphalt = asphaltTexture();
  const roadMat = new THREE.MeshStandardMaterial({ map: asphalt, normalMap: asphalt.userData.normal, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.88, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  // worn, dusty edges on the country roads where the grass meets the tarmac
  group.add(new THREE.Mesh(edge.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1.5, polygonOffsetUnits: -1.5 })));
  const roadMesh = new THREE.Mesh(road.geometry(), roadMat); roadMesh.receiveShadow = true; group.add(roadMesh);
  const pathMat = new THREE.MeshStandardMaterial({ map: pavementTexture(), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const pathMesh = new THREE.Mesh(path.geometry(), pathMat); pathMesh.receiveShadow = true; group.add(pathMesh);
  const markMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  group.add(new THREE.Mesh(marks.geometry(), markMat));
  group.add(new THREE.Mesh(yellow.geometry(), new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })));

  // ---------------------------------------------------------------- water and green areas
  const water = new Soup(), banks = new Soup(), areas = new Soup();
  for (const w of world.water) {
    if (w.kind === 'area') { flatPoly(water, w.pts, 0.035, [1, 1, 1], 12); continue; }
    if (w.under) continue;
    const half = w.kind === 'river' ? 10 : 1.6;
    ribbon(banks, w.pts, half + (w.kind === 'river' ? 4 : 1.2), 0.02, { col: hex('#7a8f4a') });
    ribbon(water, w.pts, half, 0.035, { vScale: 12, uScale: 12 });
    // round off the ends of each piece so the river runs on without gaps
    for (const p of [w.pts[0], w.pts[w.pts.length - 1]]) { disc(water, p[0], p[1], half, 0.035, 16, [1, 1, 1], 12); disc(banks, p[0], p[1], half + (w.kind === 'river' ? 4 : 1.2), 0.02, 16, hex('#7a8f4a')); }
  }
  const waterTex = waterTexture();
  const waterMat = new THREE.MeshStandardMaterial({ map: waterTex, color: 0xffffff, roughness: 0.25, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  group.add(new THREE.Mesh(water.geometry(), waterMat));
  group.add(new THREE.Mesh(banks.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -0.5, polygonOffsetUnits: -0.5 })));

  for (const a of world.areas) {
    if (a.pts.length < 3) continue;
    const col = a.kind === 'parking' ? hex('#8d9094') : a.kind === 'pitch' ? (a.sport === 'tennis' || a.sport === 'basketball' ? hex('#b5543f') : hex('#7fcf55')) : a.kind === 'park' ? hex('#86bd5c') : a.kind === 'playground' ? hex('#d9b98a') : null;
    if (!col) continue;
    flatPoly(areas, a.pts, a.kind === 'parking' ? 0.025 : 0.015, col);
  }
  group.add(new THREE.Mesh(areas.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -0.5, polygonOffsetUnits: -0.5 })));

  // ---------------------------------------------------------------- buildings
  const { walls, roofs, info } = buildBuildings();
  const facade = facadeTexture();
  const wallMat = new THREE.MeshStandardMaterial({ map: facade, normalMap: facade.userData.normal, normalScale: new THREE.Vector2(0.5, 0.5), vertexColors: true, roughness: 0.9 });
  const wallMesh = new THREE.Mesh(walls.geometry(), wallMat); wallMesh.castShadow = true; wallMesh.receiveShadow = true; group.add(wallMesh);
  const roofMat = new THREE.MeshStandardMaterial({ map: roofTexture(), vertexColors: true, roughness: 0.85 });
  const roofMesh = new THREE.Mesh(roofs.geometry(), roofMat); roofMesh.castShadow = true; roofMesh.receiveShadow = true; group.add(roofMesh);

  // ---------------------------------------------------------------- hedges, trees and lamps
  addHedgesAndTrees(group, bounds);
  addAnimals(group, bounds);
  addLamps(group);

  return { group, waterTex, buildings: info, bounds };
}

// ---------------------------------------------------------------------------------------------------------------
// Buildings: walls get 3 m storey bays from the facade texture (ground floor door/window, then sash windows);
// small near-rectangular footprints get a pitched slate roof, the rest a flat roof.
const MAIN_PALETTE = ['#f3e3b5', '#e9c86c', '#c9dde8', '#e6a59b', '#a8cfa7', '#ffffff', '#d8705f', '#7f9fc4', '#f0d0a0', '#b9a6d6'];
const ESTATE_PALETTE = ['#efe9dd', '#e5dccb', '#ddd0b6', '#f4efe6', '#d6c9b0', '#e8e0d0'];
const ROOF_COLS = ['#4a4f57', '#565b63', '#5d4a44', '#3f444b', '#6b5a50'];
const BRICK = '#b0644b';

function heightFor(b, mainStreet) {
  if (b.levels) return b.levels * 3 + 0.4;
  switch (b.kind) {
    case 'church': return 11;
    case 'shed': case 'garage': case 'garages': case 'roof': return 3;
    case 'school': return 5;
    case 'industrial': case 'warehouse': case 'retail': case 'commercial': return 7;
    case 'hotel': return 13;
    default: return mainStreet ? 8.6 : 6;
  }
}

// distance from a point to Main Street (the R448 through town), for the brighter painted shopfronts
const mainStreetPts = [];
for (const e of edges) if (e.ref === 'R448') for (const p of e.pts) if (inTown(p[0], p[1], -350)) mainStreetPts.push(p);
const nearMain = (x, z) => { for (const p of mainStreetPts) if (Math.hypot(p[0] - x, p[1] - z) < 45) return true; return false; };

// which building each named place sits in (the one containing it, else the nearest within 30 m)
export function buildingFor(name) {
  const p = world.poi[name]; if (!p) return -1;
  let best = -1, bd = 30;
  world.buildings.forEach((b, i) => {
    if (b.pts.length < 3) return;
    if (pointInPoly(p[0], p[1], b.pts)) { best = i; bd = -1; return; }
    if (bd < 0) return;
    const [cx, cz] = centroid(b.pts), d = Math.hypot(cx - p[0], cz - p[1]);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}
const paint = new Map();
for (const [name, s] of Object.entries(SIGNS)) if (s.wall || s.h || s.roof) { const i = buildingFor(name); if (i >= 0) paint.set(i, s); }

function buildBuildings() {
  const walls = new Soup(), roofs = new Soup(), info = [];
  const r = rng(29);
  for (const [bi, b] of world.buildings.entries()) {
    if (estateBuildingIdx.has(bi)) continue; // the estate builds its own bungalows
    let pts = b.pts;
    if (pts.length < 3) continue;
    const area = Math.abs(polyArea(pts));
    if (area < 6) continue;
    if (polyArea(pts) > 0) pts = [...pts].reverse(); // clockwise in (x, z) math terms, so wall quads face outward
    const [cx, cz] = centroid(pts);
    // squeezing the map brings buildings closer to roads that kept their width: shrink any that now sit on a
    // road (or the footpath in town) toward their middle, and leave out the few that still don't fit
    const need = inTown(cx, cz) ? 2.6 : 0.8;
    const clear = (q) => { let m = Infinity; for (let i = 0; i < q.length; i++) { const a = q[i], c = q[(i + 1) % q.length]; m = Math.min(m, roadGrid.dist(a[0], a[1], 20), roadGrid.dist((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, 20)); } return m; };
    if (clear(pts) < need) {
      let ok = false;
      for (const f of [0.9, 0.8, 0.7, 0.6]) {
        const q = pts.map(([x, z]) => [cx + (x - cx) * f, cz + (z - cz) * f]);
        if (clear(q) >= need) { pts = q; ok = true; break; }
      }
      if (!ok) continue;
    }
    const main = nearMain(cx, cz) && b.kind !== 'school';
    const sp = paint.get(bi) || {};
    // anything left in the estate is a garage or shed: single storey
    const h = sp.h || (inEstate(cx, cz) ? 3 : heightFor(b, main));
    const pal = main ? MAIN_PALETTE : ESTATE_PALETTE;
    let wallCol = hex(b.kind === 'industrial' || b.kind === 'retail' ? '#c9c4bb' : r() < (main ? 0.08 : 0.15) ? BRICK : pal[(r() * pal.length) | 0]);
    if (sp.wall) wallCol = hex(sp.wall);
    const roofCol = hex(sp.roof || ROOF_COLS[(r() * ROOF_COLS.length) | 0]);
    const o = obb(pts);
    const rectish = o && Math.abs(polyArea(pts)) / o.area > 0.86 && o.short < 16 && area < 450 && b.kind !== 'industrial' && b.kind !== 'retail' && b.kind !== 'school';
    info[bi] = { pts, h, cx, cz, name: b.name, amenity: b.amenity, kind: b.kind, wallCol, main };
    addWalls(walls, pts, h, wallCol);
    if (rectish) gableRoof(walls, roofs, o, h, roofCol, wallCol);
    else flatPoly(roofs, pts, h, roofCol.map((v) => v * 0.85), 3);
  }
  extraHouses(walls, roofs, r);
  return { walls, roofs, info };
}

// A house as a rectangle centred at (x, z), its front facing (fx, fz).
function house(walls, roofs, x, z, fx, fz, wide, deep, h, wallCol, roofCol) {
  const ux = -fz, uz = fx; // along the front
  const P = (a, b) => [x + ux * a + fx * b, z + uz * a + fz * b];
  // clockwise in (x, z) math terms, so the walls face out
  let pts = [P(-wide / 2, deep / 2), P(wide / 2, deep / 2), P(wide / 2, -deep / 2), P(-wide / 2, -deep / 2)];
  if (polyArea(pts) > 0) pts.reverse();
  addWalls(walls, pts, h, wallCol);
  const o = wide >= deep ? { c: [x, z], ux, uz, long: wide, short: deep } : { c: [x, z], ux: fx, uz: fz, long: deep, short: wide };
  gableRoof(walls, roofs, o, h, roofCol, wallCol);
}

// The edge of Naas (houses along the last stretch and round the roundabout) and the odd farmhouse or bungalow
// along the country roads, none of which the OpenStreetMap pull brought in.
function extraHouses(walls, roofs, r) {
  const naas = world.poi['Kilcullen Road Roundabout'], placed = [];
  const free = (x, z, d) => placed.every((p) => Math.hypot(p[0] - x, p[1] - z) > d);
  for (const e of edges) {
    const nearNaas = e.pts.some((p) => Math.hypot(p[0] - naas[0], p[1] - naas[1]) < 320);
    const rural = !nearNaas && e.cls !== 'service' && e.cls !== 'residential';
    if (!nearNaas && !rural) continue;
    const gap = nearNaas ? 15 : 150;
    for (let s = 10; s < e.len - 10; s += gap) {
      if (rural && r() < 0.45) continue;
      let k = 1; while (k < e.cum.length - 1 && e.cum[k] < s) k++;
      const a = e.pts[k - 1], b = e.pts[k], t = (s - e.cum[k - 1]) / ((e.cum[k] - e.cum[k - 1]) || 1);
      const px = a[0] + (b[0] - a[0]) * t, pz = a[1] + (b[1] - a[1]) * t;
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, dx = (b[0] - a[0]) / l, dz = (b[1] - a[1]) / l;
      for (const side of nearNaas ? [-1, 1] : [r() < 0.5 ? -1 : 1]) {
        const back = e.w / 2 + (nearNaas ? 10 : 24);
        const nx = dz * side, nz = -dx * side; // off to one side of the road
        const x = px + nx * back, z = pz + nz * back;
        if (Math.hypot(x - naas[0], z - naas[1]) < 40 || (rural && (inTown(x, z, 80) || inEstate(x, z, 40)))) continue;
        if (roadGrid.dist(x, z, 40) < (nearNaas ? 7 : 12) || !free(x, z, nearNaas ? 12 : 30)) continue;
        placed.push([x, z]);
        const wallCol = hex(nearNaas ? ESTATE_PALETTE[(r() * ESTATE_PALETTE.length) | 0] : r() < 0.7 ? '#f6f4ee' : '#efe2c4');
        const roofCol = hex(ROOF_COLS[(r() * ROOF_COLS.length) | 0]);
        if (nearNaas) house(walls, roofs, x, z, -nx, -nz, 9, 8, 6, wallCol, roofCol);
        else house(walls, roofs, x, z, -nx, -nz, 15, 8, 3.2, wallCol, roofCol); // a bungalow
      }
    }
  }
}

// Walls: one quad per storey per footprint edge. Texture v: 0..0.5 ground storey, 0.5..1 an upper storey.
export function addWalls(soup, pts, h, col, ground = true) {
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 0.2) continue;
    const u = len / 3;
    for (let y = 0; y < h - 0.01; y += 3) {
      const top = Math.min(h, y + 3), first = y === 0 && ground;
      const v0 = first ? 0 : 0.5, v1 = first ? ((top - y) / 3) * 0.5 : 0.5 + ((top - y) / 3) * 0.5;
      // clockwise footprint (x, z math terms): quad a, b, b-top, a-top then faces outward
      soup.quad([a[0], y, a[1]], [b[0], y, b[1]], [b[0], top, b[1]], [a[0], top, a[1]], [0, v0], [u, v0], [u, v1], [0, v1], col);
    }
  }
}

export function gableRoof(walls, roofs, o, h, roofCol, wallCol, over = 0.35) {
  const { c, ux, uz, long, short } = o;
  const vx = -uz, vz = ux; // across the ridge
  const rh = Math.min(3.2, short * 0.38);
  const hl = long / 2 + over, hs = short / 2 + over;
  const P = (s, t, y) => [c[0] + ux * s + vx * t, y, c[1] + uz * s + vz * t];
  const e0 = h - over * (rh / (short / 2)); // eave a little lower where it overhangs
  const A = P(-hl, -hs, e0), B = P(hl, -hs, e0), C = P(hl, hs, e0), D = P(-hl, hs, e0);
  const R0 = P(-hl, 0, h + rh), R1 = P(hl, 0, h + rh);
  const slope = Math.hypot(hs, rh) / 3, uL = (hl * 2) / 3;
  // two roof planes: winding chosen so both face upward and out
  roofs.quad(B, A, R0, R1, [uL, 0], [0, 0], [0, slope], [uL, slope], roofCol);
  roofs.quad(D, C, R1, R0, [0, 0], [uL, 0], [uL, slope], [0, slope], roofCol);
  // gable ends in wall colour, from a plain patch of the facade texture
  const g0 = P(-long / 2, -short / 2, h), g1 = P(-long / 2, short / 2, h), g2 = P(-long / 2, 0, h + rh);
  const g3 = P(long / 2, -short / 2, h), g4 = P(long / 2, short / 2, h), g5 = P(long / 2, 0, h + rh);
  const plain = [0.02, 0.985];
  walls.tri(g1, g0, g2, plain, plain, plain, wallCol);
  walls.tri(g3, g4, g5, plain, plain, plain, wallCol);
  // fix facing: make sure the gable triangles face away from the centre
  for (const k of [walls.n.length - 18, walls.n.length - 9]) {
    const nx = walls.n[k], nz = walls.n[k + 2];
    const px = walls.p[k] - c[0], pz = walls.p[k + 2] - c[1];
    if (nx * px + nz * pz < 0) {
      // flip this triangle: swap its 2nd and 3rd vertices and negate the normal
      for (const arr of [walls.p, walls.n, walls.c]) for (let j = 0; j < 3; j++) { const t = arr[k + 3 + j]; arr[k + 3 + j] = arr[k + 6 + j]; arr[k + 6 + j] = t; }
      for (let j = 0; j < 9; j++) walls.n[k + j] = -walls.n[k + j];
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
function addHedgesAndTrees(group, bounds) {
  const r = rng(41);
  let treeM = [];
  const hedgeM = [], bumps = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  for (const e of edges) {
    if (e.cls === 'service' || e.cls === 'residential') continue;
    for (const side of [-1, 1]) {
      const { L, R } = offsets(e.pts, e.w / 2 + 2.2);
      const line = side < 0 ? L : R;
      const cum = [0]; for (let k = 1; k < line.length; k++) cum.push(cum[k - 1] + Math.hypot(line[k][0] - line[k - 1][0], line[k][1] - line[k - 1][1]));
      const total = cum[cum.length - 1];
      for (let d = 8; d < total - 8; d += 3.4) {
        let k = 1; while (k < cum.length - 1 && cum[k] < d) k++;
        const t = (d - cum[k - 1]) / ((cum[k] - cum[k - 1]) || 1);
        const x = line[k - 1][0] + (line[k][0] - line[k - 1][0]) * t, z = line[k - 1][1] + (line[k][1] - line[k - 1][1]) * t;
        if (inTown(x, z, -40) || roadGrid.dist(x, z, 20) < 1.2 || (home && home.groundY(x, z) < -0.01)) continue;
        const ang = Math.atan2(line[k][0] - line[k - 1][0], line[k][1] - line[k - 1][1]);
        // tall, untidy country hedges with leafy tops bulging out of them
        const hh = 2.3 + r() * 1.1;
        q.setFromAxisAngle(Y, ang); s.set(1.9, hh, 3.8); p.set(x, hh / 2, z);
        hedgeM.push(m.compose(p, q, s).clone());
        if (r() < 0.6) bumps.push([x + (r() - 0.5) * 1.2, hh - 0.2 + r() * 0.4, z + (r() - 0.5) * 1.2, 1.0 + r() * 0.8]);
        if (r() < 0.22) treeM.push({ x: x + side * 2.2 * Math.cos(ang), z: z - side * 2.2 * Math.sin(ang), big: r() < 0.7 });
      }
    }
  }
  // field trees and copses away from the roads
  for (let i = 0; i < 2600; i++) {
    const x = bounds.min.x + r() * (bounds.max.x - bounds.min.x), z = bounds.min.y + r() * (bounds.max.y - bounds.min.y);
    const d = roadGrid.dist(x, z, 60);
    if (d < 9) continue;
    if (inTown(x, z, -150) && d < 25) continue;
    if (inEstate(x, z, 30)) continue;
    if (r() < (d > 50 ? 0.55 : 0.3)) treeM.push({ x, z, big: r() < 0.5 });
  }
  const ht = hedgeTexture();
  const leafMat = new THREE.MeshStandardMaterial({ map: ht, normalMap: ht.userData.normal, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.95 });
  const hedge = new THREE.InstancedMesh(lumpyBox(), leafMat, hedgeM.length);
  hedgeM.forEach((mm, i) => hedge.setMatrixAt(i, mm));
  const hcols = ['#c8d6b4', '#d6e2c2', '#b9c9a4', '#e2ebcf', '#c2d1ab'].map((h) => new THREE.Color(h)); // tints over the leaf texture
  hedgeM.forEach((mm, i) => hedge.setColorAt(i, hcols[(r() * hcols.length) | 0]));
  hedge.castShadow = true; hedge.receiveShadow = true; group.add(hedge);
  const bump = new THREE.InstancedMesh(lumpySphere(5), leafMat, bumps.length);
  bumps.forEach(([x, y, z, rad], i) => { bump.setMatrixAt(i, m.compose(p.set(x, y, z), q.setFromAxisAngle(Y, r() * 6), s.set(rad * 1.2, rad * 0.8, rad * 1.2))); bump.setColorAt(i, hcols[(r() * hcols.length) | 0]); });
  bump.castShadow = true; group.add(bump);

  // size each tree, and drop any whose crown would hang over a road (it would hide the car)
  for (const t of treeM) { t.hgt = t.big ? 5 + r() * 4 : 3 + r() * 2; t.rad = t.big ? 3 + r() * 1.8 : 1.8 + r(); }
  treeM = treeM.filter((t) => roadGrid.dist(t.x, t.z, 20) > t.rad + 2);
  const trunkG = new THREE.CylinderGeometry(0.22, 0.35, 1, 6).translate(0, 0.5, 0);
  const crownG = lumpySphere(11);
  const trunks = new THREE.InstancedMesh(trunkG, barkMaterial(), treeM.length);
  const crowns = new THREE.InstancedMesh(crownG, crownMaterial(), treeM.length * 2);
  const greens = ['#8fb07a', '#a3c08a', '#7e9f6c', '#b1c995', '#93ad7a'].map((h) => new THREE.Color(h)); // tints over the leaf texture
  treeM.forEach((t, i) => {
    const hgt = t.hgt, rad = t.rad;
    m.compose(p.set(t.x, 0, t.z), q.identity(), s.set(1, hgt * 0.55, 1)); trunks.setMatrixAt(i, m);
    for (let j = 0; j < 2; j++) {
      const off = j ? rad * 0.45 : 0;
      m.compose(p.set(t.x + off * (r() - 0.5), hgt * 0.55 + rad * (j ? 0.9 : 0.6), t.z + off * (r() - 0.5)), q.setFromAxisAngle(Y, r() * 6), s.set(rad * (j ? 0.75 : 1), rad * (j ? 0.7 : 0.85), rad * (j ? 0.75 : 1)));
      crowns.setMatrixAt(i * 2 + j, m); crowns.setColorAt(i * 2 + j, greens[(r() * greens.length) | 0]);
    }
  });
  for (const im of [trunks, crowns]) { im.castShadow = true; im.receiveShadow = true; group.add(im); }
}

function addLamps(group) {
  const spots = [];
  for (const e of edges) {
    if (e.cls === 'service') continue;
    for (const run of runsWhere(e.pts, (p) => inTown(p[0], p[1], -100))) {
    const { L } = offsets(run, e.w / 2 + 1.4);
    const cum = [0]; for (let k = 1; k < L.length; k++) cum.push(cum[k - 1] + Math.hypot(L[k][0] - L[k - 1][0], L[k][1] - L[k - 1][1]));
    for (let d = 10; d < cum[cum.length - 1] - 5; d += 32) {
      let k = 1; while (k < cum.length - 1 && cum[k] < d) k++;
      const t = (d - cum[k - 1]) / ((cum[k] - cum[k - 1]) || 1);
      spots.push([L[k - 1][0] + (L[k][0] - L[k - 1][0]) * t, L[k - 1][1] + (L[k][1] - L[k - 1][1]) * t]);
    }
    }
  }
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.1, 6, 6).translate(0, 3, 0), new THREE.MeshStandardMaterial({ color: 0x2f3437, roughness: 0.6, metalness: 0.4 }), spots.length);
  const head = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 0.18, 0.7).translate(0, 6, 0), new THREE.MeshStandardMaterial({ color: 0x2f3437, emissive: 0xfff3c4, emissiveIntensity: 0.15 }), spots.length);
  const m = new THREE.Matrix4();
  spots.forEach(([x, z], i) => { m.makeTranslation(x, 0, z); pole.setMatrixAt(i, m); head.setMatrixAt(i, m); });
  pole.castShadow = true; group.add(pole, head);
}

// Sheep and cows in the fields along the country roads.
function addAnimals(group, bounds) {
  const r = rng(53), sheep = [], cows = [];
  for (let herd = 0; herd < 60; herd++) {
    const x0 = bounds.min.x + r() * (bounds.max.x - bounds.min.x), z0 = bounds.min.y + r() * (bounds.max.y - bounds.min.y);
    const d = roadGrid.dist(x0, z0, 140);
    if (d < 25 || d > 130 || inTown(x0, z0, 150) || inEstate(x0, z0, 60)) continue;
    const list = r() < 0.55 ? sheep : cows;
    const n = 4 + ((r() * 6) | 0);
    for (let i = 0; i < n; i++) { const x = x0 + (r() - 0.5) * 30, z = z0 + (r() - 0.5) * 30; if (roadGrid.dist(x, z, 30) > 12) list.push([x, z, r() * 6.28]); }
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  const make = (parts, spots) => {
    for (const [geo, mat] of parts) {
      const im = new THREE.InstancedMesh(geo, mat, spots.length);
      spots.forEach(([x, z, a], i) => im.setMatrixAt(i, m.compose(p.set(x, 0, z), q.setFromAxisAngle(Y, a), one)));
      im.castShadow = true; group.add(im);
    }
  };
  const wool = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 1, flatShading: true }), black = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
  make([
    [new THREE.IcosahedronGeometry(0.6, 1).scale(1, 0.75, 1.35).translate(0, 0.85, 0), wool],
    [new THREE.BoxGeometry(0.32, 0.36, 0.42).translate(0, 0.95, 0.85), black],
    [new THREE.BoxGeometry(0.5, 0.5, 0.9).translate(0, 0.25, 0), black],
  ], sheep);
  const hide = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), patch = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.9 }), pink = new THREE.MeshStandardMaterial({ color: 0xe8a3a0 });
  make([
    [new THREE.BoxGeometry(1.0, 0.9, 2.1).translate(0, 1.2, 0), hide],
    [new THREE.BoxGeometry(1.02, 0.6, 0.9).translate(0, 1.3, -0.4), patch],
    [new THREE.BoxGeometry(0.55, 0.55, 0.7).translate(0, 1.45, 1.3), patch],
    [new THREE.BoxGeometry(0.4, 0.25, 0.2).translate(0, 1.3, 1.68), pink],
    [new THREE.BoxGeometry(0.85, 0.8, 1.7).translate(0, 0.4, 0), patch],
  ], cows);
}

// the same lawn as the fields, for the sunken garden at home (uv = world x, -z like the ground plane)
export function lawnMaterial() { const g = grassTexture(); g.repeat.set(1 / 9, 1 / 9); g.userData.normal.repeat.set(1 / 9, 1 / 9); return grassMaterial(g); }

// The ground: grass detail with a normal map, varied over large areas by a noise texture (meadow patches, mown
// lighter bands, darker damp hollows) so the fields don't look like one repeated tile.
function grassMaterial(grass) {
  const m = new THREE.MeshStandardMaterial({ map: grass, normalMap: grass.userData.normal, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.95 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uMacro = { value: noiseTexture };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vWorldXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldXZ = (modelMatrix * vec4(position, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vWorldXZ; uniform sampler2D uMacro;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float mA = texture2D(uMacro, vWorldXZ / 420.0).r, mB = texture2D(uMacro, vWorldXZ / 97.0 + 0.37).g;
        float m = mA * 0.65 + mB * 0.35;
        vec3 dry = vec3(1.12, 1.06, 0.78), lush = vec3(0.82, 0.95, 0.78);
        diffuseColor.rgb *= mix(lush, dry, smoothstep(0.35, 0.7, m)) * (0.88 + 0.24 * mB);`);
  };
  return m;
}
