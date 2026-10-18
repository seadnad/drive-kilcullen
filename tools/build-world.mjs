// Builds src/data/world.json from data/kilcullen-osm.txt (an OpenStreetMap pull, ODbL).
//
// The real trip is about 18 km, far too long for a small driver, so the map is squeezed:
//   * Kilcullen town keeps most of its real size (TOWN_SCALE) so Main Street still feels like Main Street;
//   * the countryside in between is squeezed hard (FAR_SCALE);
//   * Kilashee and home each get their own magnifying lens so the hotel grounds and the estate stay roomy.
// Roads are joined into a graph (nodes where roads meet, edges with their polylines) for the road-following car.
//
//   node tools/build-world.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = new URL('../data/kilcullen-osm.txt', import.meta.url);
const OUT = new URL('../src/data/world.json', import.meta.url);

const txt = readFileSync(SRC, 'utf8');
const sections = {};
let cur = null;
for (const line of txt.split('\n')) {
  if (line.startsWith('#')) { cur = line.slice(1).split(' ')[0]; sections[cur] = []; continue; }
  if (cur && line.trim()) sections[cur].push(line);
}
const tagsOf = (s) => Object.fromEntries(s.split(';').filter(Boolean).map((kv) => { const i = kv.indexOf('='); return [kv.slice(0, i), kv.slice(i + 1)]; }));
const pair = (s) => s.split(',').map(Number);
const deltas = (s) => { let x = 0, y = 0; return s.trim().split(' ').map((d) => { const [dx, dy] = pair(d); x += dx; y += dy; return [x, y]; }); };

const V = sections.V[0].trim().split(' ').map(pair);
const ways = sections.H.map((l) => { const [t, ids] = l.split('\t'); return { tags: tagsOf(t), ids: ids.trim().split(' ').map(Number) }; });
const buildings = sections.B.map((l) => { const [t, c] = l.split('\t'); return { tags: tagsOf(t), pts: deltas(c) }; });
const other = sections.W.filter((l) => !l.startsWith('R\t')).map((l) => { const [t, c] = l.split('\t'); return { tags: tagsOf(t), pts: deltas(c) }; });
const route = sections.ROUTE[0].trim().split(' ').map(pair);
const POI = Object.fromEntries(sections.POI.map((l) => { const [n, c] = l.split('\t'); return [n, pair(c)]; }));

// ---------------------------------------------------------------- the squeeze
const TOWN_C = [-120, -60];        // middle of Main Street, near the bridge
const TOWN_R = 820, BLEND = 450;   // full town scale inside TOWN_R, easing to FAR_SCALE over BLEND metres
const TOWN_SCALE = 0.8, FAR_SCALE = 0.13;
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const sAt = (d) => TOWN_SCALE + (FAR_SCALE - TOWN_SCALE) * smooth((d - TOWN_R) / BLEND);
// radial distance map f(d) = integral of s, tabulated
const STEP = 5, F = [0];
for (let d = STEP; d <= 20000; d += STEP) F.push(F[F.length - 1] + STEP * sAt(d - STEP / 2));
const fOf = (d) => { const i = Math.min(F.length - 2, Math.floor(d / STEP)); const t = d / STEP - i; return F[i] + (F[i + 1] - F[i]) * t; };
function global([x, y]) {
  const dx = x - TOWN_C[0], dy = y - TOWN_C[1], d = Math.hypot(dx, dy);
  if (d < 1e-6) return [x, y];
  const k = fOf(d) / d;
  return [TOWN_C[0] + dx * k, TOWN_C[1] + dy * k];
}
// Lenses magnify a spot after the squeeze: a radial fisheye in game space, k(r) = 1 + (M - 1) / (1 + (r/sigma)^2).
// r * k(r) keeps increasing for any M below 9, so nothing folds; far away it fades to (almost) nothing.
const LENSES = [
  { c: POI['Kilashee House Hotel'], M: 5.5, sigma: 60 },
  { c: POI.Home, M: 5.5, sigma: 50 },
  { c: POI['Kilcullen Road Roundabout'], M: 8, sigma: 28 },
];
for (const L of LENSES) L.gc = global(L.c);
function squeeze(p) {
  let [x, y] = global(p);
  for (const L of LENSES) {
    const ux = x - L.gc[0], uy = y - L.gc[1], r2 = (ux * ux + uy * uy) / (L.sigma * L.sigma);
    const k = 1 + (L.M - 1) / (1 + r2);
    x = L.gc[0] + ux * k; y = L.gc[1] + uy * k;
  }
  return [x, y];
}
// fold check: the squeeze must keep orientation everywhere along the route corridor
let minDet = Infinity;
for (const p of route) {
  for (const [ox, oy] of [[0, 0], [60, 0], [0, 60], [-60, 0], [0, -60]]) {
    const q = [p[0] + ox, p[1] + oy], e = 2;
    const a = squeeze(q), bx = squeeze([q[0] + e, q[1]]), by = squeeze([q[0], q[1] + e]);
    const det = ((bx[0] - a[0]) * (by[1] - a[1]) - (bx[1] - a[1]) * (by[0] - a[0])) / (e * e);
    minDet = Math.min(minDet, det);
  }
}
if (minDet <= 0) throw new Error(`squeeze folds the map (det ${minDet})`);

// game coordinates: x east, z south (three.js, y up)
const G = (p) => { const [x, y] = squeeze(p); return [Math.round(x * 10) / 10, Math.round(-y * 10) / 10]; };

// ---------------------------------------------------------------- which roads
const dist2seg = (p, a, b) => {
  const vx = b[0] - a[0], vy = b[1] - a[1], L = vx * vx + vy * vy;
  let t = L ? ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - vx * t, p[1] - a[1] - vy * t);
};
const routeDist = (p) => { let m = Infinity; for (let i = 1; i < route.length; i++) m = Math.min(m, dist2seg(p, route[i - 1], route[i])); return m; };
const near = (p, c, r) => Math.hypot(p[0] - c[0], p[1] - c[1]) < r;
const TOWN_KEEP = 1100;
const inTown = (p) => near(p, TOWN_C, TOWN_KEEP);
const inHome = (p) => near(p, POI.Home, 420);
const inKilashee = (p) => near(p, POI['Kilashee House Hotel'], 420);
const inNaas = (p) => near(p, POI['Kilcullen Road Roundabout'], 90);

const onRoute = new Map(); // vertex index -> bool
const vOnRoute = (i) => { if (!onRoute.has(i)) onRoute.set(i, routeDist(V[i]) < 14); return onRoute.get(i); };

// keep a vertex if it's in town, at home, in the hotel grounds, at the roundabout or on the route itself
function keepVertex(i, way) {
  const p = V[i];
  if (inTown(p)) return true;
  if (vOnRoute(i)) return true;
  if (inHome(p) && way.tags.highway === 'residential') return true;
  if (inKilashee(p) && way.tags.highway === 'service') return true;
  if (inNaas(p)) return true;
  return false;
}
// split ways into runs of kept vertices
const runs = [];
for (const w of ways) {
  let run = [];
  for (const i of w.ids) {
    if (keepVertex(i, w)) run.push(i);
    else { if (run.length > 1) runs.push({ tags: w.tags, ids: run }); run = []; }
  }
  if (run.length > 1) runs.push({ tags: w.tags, ids: run });
}
// outside town, a kept run must be the route itself (not a side road that brushes it), or a destination's lanes
const runLen = (r) => { let s = 0; for (let k = 1; k < r.ids.length; k++) s += Math.hypot(V[r.ids[k]][0] - V[r.ids[k - 1]][0], V[r.ids[k]][1] - V[r.ids[k - 1]][1]); return s; };
const kept = runs.filter((r) => {
  const pts = r.ids.map((i) => V[i]);
  if (pts.some(inTown) || pts.some(inHome) || pts.some(inKilashee) || pts.some(inNaas)) return true;
  return r.ids.filter(vOnRoute).length >= r.ids.length * 0.8 && runLen(r) > 0;
});

// a few lanes (the GAA club's, car parks) join roads the pull left out: hook their loose ends onto the nearest
// road within 55 m so the car can drive in
{
  const count = new Map();
  for (const r of kept) r.ids.forEach((i) => count.set(i, (count.get(i) || 0) + 1));
  for (const r of kept) {
    if (r.tags.highway !== 'service') continue;
    for (const end of [0, 1]) {
      const id = end ? r.ids[r.ids.length - 1] : r.ids[0];
      if (count.get(id) > 1) continue;
      let best = -1, bd = 55;
      for (const o of kept) {
        if (o === r || o.tags.highway === 'service') continue;
        for (const j of o.ids) { const d = Math.hypot(V[j][0] - V[id][0], V[j][1] - V[id][1]); if (d < bd) { bd = d; best = j; } }
      }
      if (best >= 0) { if (end) r.ids.push(best); else r.ids.unshift(best); count.set(best, (count.get(best) || 0) + 1); }
    }
  }
}

// ---------------------------------------------------------------- graph
const uses = new Map();
for (const r of kept) r.ids.forEach((i, k) => { uses.set(i, (uses.get(i) || 0) + (k === 0 || k === r.ids.length - 1 ? 1 : 2)); });
const isNode = (i) => uses.get(i) !== 2; // junctions (3+) and dead ends (1)
const nodeIdx = new Map(), nodes = [];
const nodeOf = (i) => { if (!nodeIdx.has(i)) { nodeIdx.set(i, nodes.length); nodes.push(G(V[i])); } return nodeIdx.get(i); };
const WIDTH = { primary: 8, secondary: 7.4, tertiary: 6.6, unclassified: 6, residential: 6, living_street: 5.5, service: 4.6, secondary_link: 5 };
let edges = [];
for (const r of kept) {
  let start = 0;
  for (let k = 1; k < r.ids.length; k++) {
    if (isNode(r.ids[k]) || k === r.ids.length - 1) {
      const ids = r.ids.slice(start, k + 1);
      edges.push({ ids, tags: r.tags });
      start = k;
    }
  }
}
// join edges that meet at a vertex used by exactly two edge ends with the same road class (merges way splits)
const endCount = new Map();
for (const e of edges) for (const i of [e.ids[0], e.ids[e.ids.length - 1]]) endCount.set(i, (endCount.get(i) || 0) + 1);
let merged = true;
while (merged) {
  merged = false;
  for (const [v, n] of endCount) {
    if (n !== 2) continue;
    const es = edges.filter((e) => e.ids[0] === v || e.ids[e.ids.length - 1] === v);
    if (es.length !== 2 || es[0] === es[1]) continue;
    const [a, b] = es;
    if ((a.tags.oneway === 'yes') !== (b.tags.oneway === 'yes')) continue;
    if (a.tags.junction !== b.tags.junction) continue;
    if (!!a.tags.bridge !== !!b.tags.bridge) continue;
    let A = a.ids[a.ids.length - 1] === v ? a.ids : [...a.ids].reverse();
    let B = b.ids[0] === v ? b.ids : [...b.ids].reverse();
    if (a.tags.oneway === 'yes' && (a.ids[a.ids.length - 1] !== v || b.ids[0] !== v)) continue;
    const tags = { ...a.tags, name: a.tags.name || b.tags.name, ref: a.tags.ref || b.tags.ref };
    if ((WIDTH[b.tags.highway] || 6) > (WIDTH[a.tags.highway] || 6)) tags.highway = b.tags.highway;
    edges = edges.filter((e) => e !== a && e !== b);
    edges.push({ ids: [...A, ...B.slice(1)], tags });
    endCount.delete(v);
    merged = true;
    break;
  }
}
// drop little dead-end stubs (parking aisles, driveways) under 25 m, a few passes
const realLen = (e) => runLen(e);
for (let pass = 0; pass < 4; pass++) {
  const deg = new Map();
  for (const e of edges) for (const i of [e.ids[0], e.ids[e.ids.length - 1]]) deg.set(i, (deg.get(i) || 0) + 1);
  const before = edges.length;
  edges = edges.filter((e) => {
    const a = deg.get(e.ids[0]), b = deg.get(e.ids[e.ids.length - 1]);
    return !((a === 1 || b === 1) && realLen(e) < 25 && e.tags.highway === 'service');
  });
  if (edges.length === before) break;
}
// keep the biggest connected piece only
{
  const adj = new Map();
  const add = (a, b) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push(b); };
  for (const e of edges) { const a = e.ids[0], b = e.ids[e.ids.length - 1]; add(a, b); add(b, a); }
  const comp = new Map(); let best = null, bestN = 0;
  for (const s of adj.keys()) {
    if (comp.has(s)) continue;
    const stack = [s], seen = [s]; comp.set(s, s);
    while (stack.length) for (const n of adj.get(stack.pop())) if (!comp.has(n)) { comp.set(n, s); seen.push(n); stack.push(n); }
    if (seen.length > bestN) { bestN = seen.length; best = s; }
  }
  edges = edges.filter((e) => comp.get(e.ids[0]) === best);
}

const outEdges = edges.map((e) => {
  const pts = e.ids.map((i) => G(V[i]));
  // drop consecutive near-duplicates the squeeze creates in the countryside
  const clean = [pts[0]];
  for (let k = 1; k < pts.length - 1; k++) { const l = clean[clean.length - 1]; if (Math.hypot(pts[k][0] - l[0], pts[k][1] - l[1]) > 1.5) clean.push(pts[k]); }
  clean.push(pts[pts.length - 1]);
  const t = e.tags;
  return {
    a: nodeOf(e.ids[0]), b: nodeOf(e.ids[e.ids.length - 1]), pts: clean,
    w: WIDTH[t.highway] || 6, cls: t.highway, name: t.name || '', ref: t.ref || '',
    oneway: t.oneway === 'yes' ? 1 : 0, round: t.junction === 'roundabout' ? 1 : 0, bridge: t.bridge === 'yes' ? 1 : 0,
    lanes: Number(t.lanes) || (t.highway === 'service' ? 1 : 2),
  };
});

// ---------------------------------------------------------------- buildings, water, areas
const BUILD_R = 1150;
const outBuildings = buildings.filter((b) => {
  const c = b.pts[0];
  return near(c, TOWN_C, BUILD_R) || near(c, POI['Kilashee House Hotel'], 400) || near(c, POI.Home, 400);
}).map((b) => {
  const t = b.tags;
  const pts = b.pts.slice(0, -1).map(G); // closed rings repeat the first point
  return { pts, kind: t.building, name: t.name || '', amenity: t.amenity || t.shop || t.tourism || '', levels: Number(t['building:levels']) || 0 };
});
const outWater = [], outAreas = [];
for (const o of other) {
  const t = o.tags;
  if (t.waterway) {
    if (!o.pts.some((p) => near(p, TOWN_C, 1600))) continue;
    outWater.push({ kind: t.waterway, name: t.name || '', w: t.waterway === 'river' ? 20 : 3, pts: o.pts.map(G), under: t.layer === '-1' ? 1 : 0 });
  } else if (t.natural === 'water') {
    outWater.push({ kind: 'area', pts: o.pts.slice(0, -1).map(G) });
  } else if (t.leisure || t.amenity) {
    outAreas.push({ kind: t.leisure || t.amenity, sport: t.sport || '', name: t.name || '', pts: o.pts.slice(0, -1).map(G) });
  }
}
const outPOI = Object.fromEntries(Object.entries(POI).map(([n, p]) => [n, G(p)]));
const outRoute = route.map(G);

writeFileSync(OUT, JSON.stringify({
  note: 'Generated by tools/build-world.mjs from OpenStreetMap data (c) OpenStreetMap contributors, ODbL. Game units are metres; x east, z south.',
  nodes, edges: outEdges, buildings: outBuildings, water: outWater, areas: outAreas, poi: outPOI, route: outRoute,
}));
const total = outEdges.reduce((s, e) => s + e.pts.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - e.pts[i][0], p[1] - e.pts[i][1]), 0), 0);
let rlen = 0; for (let i = 1; i < outRoute.length; i++) rlen += Math.hypot(outRoute[i][0] - outRoute[i - 1][0], outRoute[i][1] - outRoute[i - 1][1]);
console.log(`nodes ${nodes.length}, edges ${outEdges.length} (${(total / 1000).toFixed(1)} km of road), buildings ${outBuildings.length}, water ${outWater.length}, areas ${outAreas.length}`);
console.log(`route home -> Naas: ${(rlen / 1000).toFixed(2)} km in game (real 18.2 km); fold check min det ${minDet.toFixed(3)}`);
for (const n of ['Home', 'Little Brew Cafe', 'Kidz Akademy', 'Kilcullen GAA', 'Kilashee House Hotel', 'Kilcullen Road Roundabout']) console.log(n.padEnd(28), outPOI[n]);
