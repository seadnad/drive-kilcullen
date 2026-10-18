// Small geometry helpers: a triangle soup builder, polyline ribbons, polygons, and a road-distance grid.
import * as THREE from 'three';

// Accumulates flat-shaded triangles with uv and colour, then makes one BufferGeometry.
export class Soup {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; }
  tri(a, b, c, ua = [0, 0], ub = [0, 0], uc = [0, 0], col = [1, 1, 1]) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (const [v, u] of [[a, ua], [b, ub], [c, uc]]) { this.p.push(v[0], v[1], v[2]); this.n.push(nx, ny, nz); this.uv.push(u[0], u[1]); this.c.push(col[0], col[1], col[2]); }
  }
  quad(a, b, c, d, ua, ub, uc, ud, col) { this.tri(a, b, c, ua, ub, uc, col); this.tri(a, c, d, ua, uc, ud, col); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    return g;
  }
}

// Left/right offsets of a polyline (xz pairs) with mitred joins, clamped at sharp corners.
export function offsets(pts, half) {
  const n = pts.length, L = [], R = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let d1x = p[0] - a[0], d1z = p[1] - a[1], d2x = b[0] - p[0], d2z = b[1] - p[1];
    const l1 = Math.hypot(d1x, d1z) || 1, l2 = Math.hypot(d2x, d2z) || 1;
    d1x /= l1; d1z /= l1; d2x /= l2; d2z /= l2;
    if (i === 0) { d1x = d2x; d1z = d2z; }
    if (i === n - 1) { d2x = d1x; d2z = d1z; }
    let tx = d1x + d2x, tz = d1z + d2z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    // left of travel (x east, z south): (dz, -dx)
    const nx = tz, nz = -tx;
    const cos = Math.max(0.35, nx * d1z - nz * d1x); // n . (segment normal)
    const m = half / cos;
    L.push([p[0] + nx * m, p[1] + nz * m]); R.push([p[0] - nx * m, p[1] - nz * m]);
  }
  return { L, R };
}

// A flat ribbon along a polyline at height y; v runs along the length (in units of `vScale` metres).
export function ribbon(soup, pts, half, y, { vScale = 4, uScale = 4, col = [1, 1, 1], v0 = 0 } = {}) {
  if (pts.length < 2) return v0;
  const { L, R } = offsets(pts, half);
  let v = v0;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const v1 = v + seg / vScale, u = (half * 2) / uScale;
    soup.quad([L[i - 1][0], y, L[i - 1][1]], [R[i - 1][0], y, R[i - 1][1]], [R[i][0], y, R[i][1]], [L[i][0], y, L[i][1]],
      [0, v], [u, v], [u, v1], [0, v1], col);
    v = v1;
  }
  return v;
}

// Sub-polyline between distances s0 and s1 along pts (with precomputed cumulative lengths).
export function slice(pts, cum, s0, s1) {
  const out = [];
  const at = (s) => {
    let k = 1; while (k < cum.length - 1 && cum[k] < s) k++;
    const t = (s - cum[k - 1]) / ((cum[k] - cum[k - 1]) || 1);
    return [pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * t, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * t];
  };
  out.push(at(s0));
  for (let k = 1; k < cum.length - 1; k++) if (cum[k] > s0 && cum[k] < s1) out.push(pts[k]);
  out.push(at(s1));
  return out;
}

export function disc(soup, x, z, r, y, segs = 20, col = [1, 1, 1], uvScale = 4) {
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
    const p0 = [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], p1 = [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r];
    soup.tri([x, y, z], p1, p0, [x / uvScale, z / uvScale], [p1[0] / uvScale, p1[2] / uvScale], [p0[0] / uvScale, p0[2] / uvScale], col);
  }
}

export function polyArea(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
export function centroid(pts) { let x = 0, z = 0; for (const p of pts) { x += p[0]; z += p[1]; } return [x / pts.length, z / pts.length]; }
export function pointInPoly(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

// Flat polygon (xz) at height y, facing up.
export function flatPoly(soup, pts, y, col = [1, 1, 1], uvScale = 4) {
  const v2 = pts.map((p) => new THREE.Vector2(p[0], p[1]));
  if (THREE.ShapeUtils.isClockWise(v2)) v2.reverse();
  const tris = THREE.ShapeUtils.triangulateShape(v2, []);
  for (const [a, b, c] of tris) {
    const A = v2[a], B = v2[b], C = v2[c];
    // ShapeUtils winding in (x, z) is counter-clockwise; with y up and z south that faces down, so swap
    soup.tri([A.x, y, A.y], [C.x, y, C.y], [B.x, y, B.y], [A.x / uvScale, A.y / uvScale], [C.x / uvScale, C.y / uvScale], [B.x / uvScale, B.y / uvScale], col);
  }
}

// Minimum-area oriented rectangle of a polygon: { c: [x,z], ux, uz (long axis unit), long, short }
export function obb(pts) {
  let best = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    let ux = b[0] - a[0], uz = b[1] - a[1]; const l = Math.hypot(ux, uz); if (l < 0.5) continue; ux /= l; uz /= l;
    let mn1 = Infinity, mx1 = -Infinity, mn2 = Infinity, mx2 = -Infinity;
    for (const p of pts) { const s = p[0] * ux + p[1] * uz, t = -p[0] * uz + p[1] * ux; mn1 = Math.min(mn1, s); mx1 = Math.max(mx1, s); mn2 = Math.min(mn2, t); mx2 = Math.max(mx2, t); }
    const area = (mx1 - mn1) * (mx2 - mn2);
    if (!best || area < best.area) best = { area, ux, uz, mn1, mx1, mn2, mx2 };
  }
  if (!best) return null;
  let { ux, uz, mn1, mx1, mn2, mx2 } = best;
  const s = (mn1 + mx1) / 2, t = (mn2 + mx2) / 2;
  const c = [s * ux - t * uz, s * uz + t * ux];
  let long = mx1 - mn1, short = mx2 - mn2;
  if (short > long) { [long, short] = [short, long]; [ux, uz] = [-uz, ux]; }
  return { c, ux, uz, long, short, area: best.area };
}

// Uniform grid of road segments for "how far is the nearest road" queries.
export class RoadGrid {
  constructor(edges, cell = 40, marginFor = () => 1) {
    this.cell = cell; this.map = new Map();
    for (const e of edges) {
      const margin = marginFor(e);
      for (let k = 1; k < e.pts.length; k++) {
        const a = e.pts[k - 1], b = e.pts[k];
        const seg = { a, b, w: e.w, e, margin };
        const x0 = Math.floor((Math.min(a[0], b[0]) - 10) / cell), x1 = Math.floor((Math.max(a[0], b[0]) + 10) / cell);
        const z0 = Math.floor((Math.min(a[1], b[1]) - 10) / cell), z1 = Math.floor((Math.max(a[1], b[1]) + 10) / cell);
        for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const k2 = x + ',' + z; if (!this.map.has(k2)) this.map.set(k2, []); this.map.get(k2).push(seg); }
      }
    }
  }
  // distance from (x, z) to the nearest road edge (kerb), searching up to `range` metres
  dist(x, z, range = 60) {
    const c = this.cell, r = Math.ceil(range / c);
    const cx = Math.floor(x / c), cz = Math.floor(z / c);
    let best = Infinity;
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      const list = this.map.get((cx + i) + ',' + (cz + j)); if (!list) continue;
      for (const s of list) {
        const vx = s.b[0] - s.a[0], vz = s.b[1] - s.a[1], L = vx * vx + vz * vz;
        let t = L ? ((x - s.a[0]) * vx + (z - s.a[1]) * vz) / L : 0; t = Math.max(0, Math.min(1, t));
        const d = Math.hypot(x - s.a[0] - vx * t, z - s.a[1] - vz * t) - s.w / 2;
        if (d < best) best = d;
      }
    }
    return best;
  }
  // nearest point on any road centreline: { x, z, dx, dz (unit, along the road), dist, half, margin, lanes, oneway, e }
  // Of overlapping roads (junctions) the one whose kerb is nearest wins.
  nearest(x, z, range = 40) {
    const c = this.cell, r = Math.ceil(range / c);
    const cx = Math.floor(x / c), cz = Math.floor(z / c);
    let best = null, bestScore = Infinity;
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      const list = this.map.get((cx + i) + ',' + (cz + j)); if (!list) continue;
      for (const s of list) {
        const vx = s.b[0] - s.a[0], vz = s.b[1] - s.a[1], L = vx * vx + vz * vz;
        if (!L) continue;
        let t = ((x - s.a[0]) * vx + (z - s.a[1]) * vz) / L; t = Math.max(0, Math.min(1, t));
        const px = s.a[0] + vx * t, pz = s.a[1] + vz * t, d = Math.hypot(x - px, z - pz);
        const score = d - s.w / 2 - s.margin;
        if (score < bestScore) {
          bestScore = score; const l = Math.sqrt(L);
          best = { x: px, z: pz, dx: vx / l, dz: vz / l, dist: d, half: s.w / 2, margin: s.margin, lanes: s.e.lanes, oneway: s.e.oneway, e: s.e };
        }
      }
    }
    return best;
  }
}
