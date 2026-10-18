// The road graph: nodes where roads meet, edges with their polylines. Everything the car, the traffic and the
// route planner need: sampling a point along an edge, the ways out of a node, nearest-road lookups, shortest paths.
import world from '../data/world.json';

export const nodes = world.nodes.map(([x, z], i) => ({ i, x, z, out: [] }));
export const edges = world.edges.map((e, i) => {
  const pts = e.pts;
  const cum = [0];
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  return { ...e, i, cum, len: cum[cum.length - 1] };
});
for (const e of edges) {
  // dir +1 travels a -> b, -1 travels b -> a; one-way roads only go a -> b
  // only roundabouts are kept one-way: other one-way bits were cut off by the map pull and would trap the planner
  if (e.oneway && !e.round) e.oneway = 0;
  nodes[e.a].out.push({ e, dir: 1 });
  if (!e.oneway) nodes[e.b].out.push({ e, dir: -1 });
}
// every node also remembers its dead-end-ness for u-turns
for (const n of nodes) n.deg = edges.filter((e) => e.a === n.i || e.b === n.i).length;

// point and unit direction at distance s along edge e travelling in dir
export function sample(e, dir, s, out = {}) {
  const L = e.len;
  let d = Math.max(0, Math.min(L, dir > 0 ? s : L - s));
  const cum = e.cum, pts = e.pts;
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; }
  const seg = cum[hi] - cum[lo] || 1, t = (d - cum[lo]) / seg;
  const a = pts[lo], b = pts[hi];
  out.x = a[0] + (b[0] - a[0]) * t;
  out.z = a[1] + (b[1] - a[1]) * t;
  let dx = (b[0] - a[0]) / seg, dz = (b[1] - a[1]) / seg;
  if (dir < 0) { dx = -dx; dz = -dz; }
  out.dx = dx; out.dz = dz;
  return out;
}

export const endNode = (e, dir) => nodes[dir > 0 ? e.b : e.a];
export const startNode = (e, dir) => nodes[dir > 0 ? e.a : e.b];

// heading of the first few metres leaving a node along (e, dir)
export function leaveDir(e, dir) {
  const p = sample(e, dir, 0), q = sample(e, dir, Math.min(e.len, 10));
  const dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz) || 1;
  return { dx: dx / l, dz: dz / l };
}
export function arriveDir(e, dir) {
  const p = sample(e, dir, Math.max(0, e.len - 10)), q = sample(e, dir, e.len);
  const dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz) || 1;
  return { dx: dx / l, dz: dz / l };
}

// the ways on from the end of (e, dir), sorted left to right, each with its turn angle (+ = left)
export function options(e, dir) {
  const n = endNode(e, dir);
  const inD = arriveDir(e, dir);
  const res = [];
  for (const o of n.out) {
    if (o.e === e && o.dir === -dir) continue; // straight back the way we came
    const d = leaveDir(o.e, o.dir);
    // angle from the incoming direction to the outgoing one; with x east and z south, a left turn is negative cross
    const cross = inD.dx * d.dz - inD.dz * d.dx, dot = inD.dx * d.dx + inD.dz * d.dz;
    res.push({ e: o.e, dir: o.dir, angle: -Math.atan2(cross, dot) });
  }
  res.sort((a, b) => b.angle - a.angle);
  return res;
}

// nearest point on the network to (x, z): { e, s (from a), dist }
export function nearest(x, z, filter) {
  let best = null;
  for (const e of edges) {
    if (filter && !filter(e)) continue;
    const p = e.pts;
    for (let k = 1; k < p.length; k++) {
      const ax = p[k - 1][0], az = p[k - 1][1], vx = p[k][0] - ax, vz = p[k][1] - az, L = vx * vx + vz * vz;
      let t = L ? ((x - ax) * vx + (z - az) * vz) / L : 0; t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(x - ax - vx * t, z - az - vz * t);
      if (!best || d < best.dist) best = { e, s: e.cum[k - 1] + Math.sqrt(L) * t, dist: d };
    }
  }
  return best;
}

// Shortest path from the end of (e, dir) to a target spot { e, s }. Returns the list of {e, dir} steps to take
// after the current edge (empty if the target is on the current edge ahead), or null if unreachable.
export function plan(e, dir, target) {
  const start = endNode(e, dir).i;
  const dist = new Float64Array(nodes.length).fill(Infinity), prev = new Array(nodes.length).fill(null);
  dist[start] = 0;
  const open = new Set([start]);
  while (open.size) {
    let u = -1, du = Infinity;
    for (const v of open) if (dist[v] < du) { du = dist[v]; u = v; }
    open.delete(u);
    for (const o of nodes[u].out) {
      const v = endNode(o.e, o.dir).i;
      // a little extra cost for small residential roads keeps the planner on main roads
      const nd = du + o.e.len * (o.e.cls === 'residential' || o.e.cls === 'service' ? 1.3 : 1);
      if (nd < dist[v]) { dist[v] = nd; prev[v] = { u, o }; open.add(v); }
    }
  }
  const T = target.e;
  // reach the target edge from either end: entering at a goes forward (+1), entering at b goes back (-1)
  const ca = dist[T.a] + target.s, cb = T.oneway ? Infinity : dist[T.b] + (T.len - target.s);
  if (!isFinite(ca) && !isFinite(cb)) return null;
  const via = ca <= cb ? T.a : T.b, lastDir = ca <= cb ? 1 : -1;
  const steps = [];
  for (let v = via; v !== start;) { const p = prev[v]; if (!p) break; steps.unshift({ e: p.o.e, dir: p.o.dir }); v = p.u; }
  steps.push({ e: T, dir: lastDir });
  return steps;
}

export const poi = world.poi;
export const route = world.route;
export default world;
