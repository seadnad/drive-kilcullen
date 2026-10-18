// Hand-built landmarks on top of the generic town: shop signs on Main Street, the Liffey bridge parapets,
// St Brigid's tower, Kilashee's turret and gables, the GAA pitch with goalposts and clubhouse, Kidz Akademy's
// playground, the Kilcullen and Naas welcome signs, the spearhead sculpture, home, and floating destination badges.
import * as THREE from 'three';
import world, { edges, nearest, sample } from '../game/graph.js';
import { SIGNS, DESTINATIONS } from './places.js';
import { buildingFor, inTown, addWalls, gableRoof } from './world.js';
import { Soup } from './geom.js';
import { brickTexture, facadeTexture, roofTexture } from './textures.js';
import { centroid, obb, offsets, polyArea } from './geom.js';
import { signTexture, badgeTexture } from './textures.js';

const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.8, ...o });
const STONE = std({ color: 0xb8b0a0, roughness: 0.95 });
const WHITE = std({ color: 0xf6f6f2, roughness: 0.5 });
const DARK = std({ color: 0x2a2d31, roughness: 0.6, metalness: 0.3 });
const SLATE = std({ color: 0x3f454d, roughness: 0.7 });

function box(w, h, d, mat, x, y, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true;
  return m;
}

// A flat sign board facing direction (nx, nz), its bottom edge at height y.
function board(text, opts, x, y, z, nx, nz, maxW = 8, maxH = 1.6) {
  const { texture, aspect } = signTexture(text, opts);
  let w = Math.min(maxW, maxH * aspect), h = w / aspect;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 0.12 }));
  m.position.set(x + nx * 0.12, y + h / 2, z + nz * 0.12);
  m.rotation.y = Math.atan2(nx, nz);
  return m;
}

// A sign on a pair of posts by the road (for places without a building to hang it on).
function postSign(text, opts, x, z, nx, nz, height = 1.4, maxW = 5) {
  const g = new THREE.Group();
  const b = board(text, opts, 0, height, 0, 0, 1, maxW, 1.6);
  b.position.z = 0;
  const halfW = b.geometry.parameters.width / 2;
  g.add(b, box(0.12, height + 0.3, 0.12, DARK, -halfW + 0.2, (height + 0.3) / 2, -0.05), box(0.12, height + 0.3, 0.12, DARK, halfW - 0.2, (height + 0.3) / 2, -0.05));
  const back = new THREE.Mesh(new THREE.PlaneGeometry(b.geometry.parameters.width, b.geometry.parameters.height), DARK);
  back.position.copy(b.position); back.position.z = -0.02; back.rotation.y = Math.PI; g.add(back);
  g.position.set(x, 0, z); g.rotation.y = Math.atan2(nx, nz);
  return g;
}

// A traditional Irish shopfront on a wall: two fluted pilasters with capitals carrying a deep fascia with the
// name, a big display window (or several) on a stall riser, and a glazed door. f: { x, z, nx, nz, len } on the wall.
function shopfront(f, s) {
  const sp = s.shop, g = new THREE.Group();
  const frame = std({ color: sp.frame, roughness: 0.45 }), glassMat = new THREE.MeshPhysicalMaterial({ color: 0x9fb4c0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.32 });
  const inside = std({ color: 0xf0dcb8, emissive: 0xffc98a, emissiveIntensity: 0.28, roughness: 0.9 });
  const W = Math.min(sp.width || 6, Math.max(3.4, f.len * 0.96)), H = 3.4;
  const add = (w, h, d, mat, x, y, z) => { const m = box(w, h, d, mat, x, y, z); g.add(m); return m; };
  // pilasters, capitals and plinth blocks
  for (const x of [-W / 2, W / 2]) {
    add(0.42, H - 0.2, 0.22, frame, x, (H - 0.2) / 2, 0.11);
    add(0.56, 0.32, 0.32, frame, x, H - 0.2, 0.16);
    add(0.5, 0.35, 0.28, frame, x, 0.18, 0.14);
    for (const k of [-0.1, 0, 0.1]) add(0.03, H - 1.1, 0.02, std({ color: new THREE.Color(sp.frame).multiplyScalar(0.8) }), x + k, (H - 0.2) / 2, 0.23); // flutes
  }
  // fascia: the sign itself, with a cornice above
  const { texture, aspect } = signTexture(s.text, s);
  const fh = 0.85, fw = W - 0.5;
  add(W + 0.3, fh + 0.1, 0.3, frame, 0, H + fh / 2 - 0.15, 0.15);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(fw, fh * aspect * 1.1), Math.min(fh, fw / aspect / 1.1)), std({ map: texture, roughness: 0.5 }));
  // fill the fascia with the sign's own background, then the lettering on top
  const bgPanel = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh * 0.92), std({ color: s.bg, roughness: 0.5 }));
  bgPanel.position.set(0, H + fh / 2 - 0.15, 0.305); g.add(bgPanel);
  sign.position.set(0, H + fh / 2 - 0.15, 0.31); g.add(sign);
  add(W + 0.6, 0.16, 0.42, frame, 0, H + fh + 0.02, 0.2);
  // windows and the door
  const n = sp.windows || 1, doorW = 1.1, gap = 0.18, inner = W - 0.42;
  const winW = (inner - doorW - gap * (n + 1)) / n;
  let x = -inner / 2 + gap;
  const slots = [];
  for (let i = 0; i < n; i++) { slots.push(['w', x + winW / 2]); x += winW + gap; if (i === 0) { slots.push(['d', x + doorW / 2]); x += doorW + gap; } }
  for (const [k, cx] of slots) {
    if (k === 'w') {
      add(winW, 0.62, 0.2, frame, cx, 0.31, 0.1); // stall riser
      const gm = new THREE.Mesh(new THREE.PlaneGeometry(winW - 0.24, H - 1.05), glassMat); gm.position.set(cx, 0.62 + (H - 1.05) / 2 + 0.06, 0.06); gm.renderOrder = 2; g.add(gm);
      // the lit room behind, a shelf, and (at Little Brew) a bunch of yellow balloons in the window
      const room = new THREE.Mesh(new THREE.PlaneGeometry(winW - 0.24, H - 1.05), inside); room.position.set(cx, 0.62 + (H - 1.05) / 2 + 0.06, 0.012); g.add(room);
      add(winW - 0.4, 0.05, 0.05, std({ color: 0xffffff }), cx, 1.55, 0.03);
      for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), std({ color: 0xfff1c9, emissive: 0xffd27a, emissiveIntensity: 1.2 })); l.position.set(cx + (i - 1) * winW * 0.3, H - 0.55, 0.035); g.add(l); }
      if (sp.flowers) for (let i = 0; i < 9; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), std({ color: i % 4 === 3 ? 0x222222 : 0xffd400, roughness: 0.3 })); b.position.set(cx - winW * 0.32 + (i % 3) * 0.26 + (i > 5 ? 0.1 : 0), 0.85 + Math.floor(i / 3) * 0.24, 0.02); b.scale.z = 0.25; g.add(b); }
      add(winW, 0.12, 0.16, frame, cx, 0.68, 0.12); add(winW, 0.14, 0.16, frame, cx, H - 0.28, 0.12);
      for (const e of [-1, 1]) add(0.12, H - 0.9, 0.16, frame, cx + e * (winW / 2 - 0.06), (H - 0.9) / 2 + 0.6, 0.12);
    } else {
      const dg = new THREE.Mesh(new THREE.PlaneGeometry(doorW - 0.3, H - 1.0), glassMat); dg.position.set(cx, (H - 1.0) / 2 + 0.1, 0.04); dg.renderOrder = 2; g.add(dg);
      for (const e of [-1, 1]) add(0.15, H - 0.3, 0.16, frame, cx + e * (doorW / 2 - 0.07), (H - 0.3) / 2, 0.1);
      add(doorW, 0.15, 0.16, frame, cx, H - 0.25, 0.1); add(doorW - 0.2, 0.12, 0.08, frame, cx, 0.2, 0.06);
      // a warm glow inside
      const lit = new THREE.Mesh(new THREE.PlaneGeometry(doorW - 0.4, H - 1.2), std({ color: 0xffe2a8, emissive: 0xffc77a, emissiveIntensity: 0.35 })); lit.position.set(cx, (H - 1.0) / 2 + 0.1, 0.01); g.add(lit);
    }
  }
  // window boxes of petunias under the first-floor windows
  if (sp.flowers) {
    const pink = ['#c2185b', '#7b1fa2', '#e91e63', '#9c27b0', '#ffffff'].map((c) => std({ color: c, roughness: 0.8 }));
    const leaf = std({ color: 0x2f6b2a, roughness: 0.9 });
    for (const bx of [-W * 0.3, W * 0.3]) {
      add(1.5, 0.25, 0.3, std({ color: 0x8a3b1e }), bx, H + fh + 0.85, 0.2);
      for (let i = 0; i < 14; i++) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13 + (i % 3) * 0.03, 0), i % 4 === 0 ? leaf : pink[i % pink.length]);
        b.position.set(bx - 0.65 + (i / 13) * 1.3, H + fh + 1.03 + ((i * 7) % 5) * 0.03 - (i % 5 === 0 ? 0.25 : 0), 0.25 + ((i * 3) % 4) * 0.05); g.add(b);
      }
    }
  }
  g.position.set(f.x + f.nx * 0.02, 0, f.z + f.nz * 0.02); g.rotation.y = Math.atan2(f.nx, f.nz);
  return g;
}

// the facade of building `info` that faces the road nearest to point (px, pz): where to hang a sign
function facadeFor(info, px, pz) {
  const near = nearest(px, pz);
  const rp = sample(near.e, 1, near.s);
  const pts = info.pts;
  let best = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 2.5) continue;
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    // outward normal: away from the centroid
    let nx = (b[1] - a[1]) / len, nz = -(b[0] - a[0]) / len;
    if (nx * (mx - info.cx) + nz * (mz - info.cz) < 0) { nx = -nx; nz = -nz; }
    const facing = nx * (rp.x - mx) + nz * (rp.z - mz);
    if (facing <= 0) continue;
    const d = Math.hypot(rp.x - mx, rp.z - mz);
    // project the place onto this wall, keeping clear of the corners
    const t = Math.max(0.15, Math.min(0.85, ((px - a[0]) * (b[0] - a[0]) + (pz - a[1]) * (b[1] - a[1])) / (len * len)));
    const score = d + Math.abs(t - 0.5) * 2;
    if (!best || score < best.score) best = { score, x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, nx, nz, len: len * Math.min(t, 1 - t) * 2 };
  }
  return best;
}

export const shops = {}; // where each shopfront went: { x, z, nx, nz }
export function buildLandmarks(scene, buildings) {
  const g = new THREE.Group(); scene.add(g);
  const P = world.poi;

  // ---------------------------------------------------------------- shop and place signs
  for (const [name, s] of Object.entries(SIGNS)) {
    if (s.noSign || !P[name]) continue;
    if (name === 'Kidz Akademy') { const bi = buildingFor(name); if (bi < 0 || !buildings[bi]) continue; }
    const [px, pz] = P[name];
    const bi = buildingFor(name), info = bi >= 0 ? buildings[bi] : null;
    const f = info && facadeFor(info, px, pz);
    if (f && s.shop) {
      g.add(shopfront(f, s)); shops[name] = f;
    } else if (f) {
      g.add(board(s.text, s, f.x, Math.min(3.1, info.h - 1.8), f.z, f.nx, f.nz, Math.max(2.4, Math.min(9, f.len * 0.95)), s.sub ? 1.5 : 1.15));
    } else {
      const n = nearest(px, pz), rp = sample(n.e, 1, n.s);
      let nx = rp.x - px, nz = rp.z - pz; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      const back = Math.max(0, n.dist - n.e.w / 2 - 2.5);
      g.add(postSign(s.text, s, rp.x - nx * (n.e.w / 2 + 2.5) , rp.z - nz * (n.e.w / 2 + 2.5), nx, nz, 1.2, 4.5));
      void back;
    }
  }

  // ---------------------------------------------------------------- Kilcullen bridge: stone parapets and piers
  for (const e of edges) {
    if (!e.bridge) continue;
    for (const side of [-1, 1]) {
      const { L, R } = offsets(e.pts, e.w / 2 + 0.35);
      const line = side < 0 ? L : R;
      for (let k = 1; k < line.length; k++) {
        const a = line[k - 1], b = line[k], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 0.2) continue;
        g.add(box(0.5, 1.15, len + 0.5, STONE, (a[0] + b[0]) / 2, 0.58, (a[1] + b[1]) / 2, Math.atan2(b[0] - a[0], b[1] - a[1])));
      }
      for (const p of [line[0], line[line.length - 1]]) g.add(box(0.9, 1.5, 0.9, STONE, p[0], 0.75, p[1]));
    }
  }

  // ---------------------------------------------------------------- St Brigid's: tower and spire by the road
  {
    const bi = buildingFor("St Brigid's Church"), info = buildings[bi];
    if (info) {
      const f = facadeFor(info, info.cx, info.cz) || { x: info.cx, z: info.cz, nx: 0, nz: 1 };
      const tx = f.x - f.nx * 2.6, tz = f.z - f.nz * 2.6, ry = Math.atan2(f.nx, f.nz);
      g.add(box(5, 20, 5, STONE, tx, 10, tz, ry));
      const spire = new THREE.Mesh(new THREE.ConeGeometry(3.3, 13, 4), SLATE);
      spire.position.set(tx, 26.5, tz); spire.rotation.y = ry + Math.PI / 4; spire.castShadow = true; g.add(spire);
      g.add(box(0.25, 2.2, 0.25, std({ color: 0xc9a54a, metalness: 0.6 }), tx, 34, tz));
      g.add(box(1.2, 0.25, 0.25, std({ color: 0xc9a54a, metalness: 0.6 }), tx, 34.4, tz, ry));
      // pointed windows on the tower face and a round clock
      const clock = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), WHITE);
      clock.position.set(tx + f.nx * 2.52, 15.5, tz + f.nz * 2.52); clock.rotation.y = ry; g.add(clock);
      g.add(board("St Brigid's", { bg: '#3d3a35', fg: '#efe7d2', border: '#a99a76' }, tx + f.nx * 2.52, 4.2, tz + f.nz * 2.52, f.nx, f.nz, 4, 0.9));
    }
  }

  // ---------------------------------------------------------------- Kilcullen Town Hall: pediment and steps
  {
    const bi = buildingFor('Kilcullen Town Hall'), info = buildings[bi];
    if (info) {
      const f = facadeFor(info, ...P['Kilcullen Town Hall']);
      if (f) {
        const ry = Math.atan2(f.nx, f.nz);
        const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 3.6, 2.2, 3, 1).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), std({ color: 0xf2ead2 }));
        // simple triangular pediment: a flattened prism above the roofline
        const tri = new THREE.Shape([new THREE.Vector2(-4.5, 0), new THREE.Vector2(4.5, 0), new THREE.Vector2(0, 2.3)]);
        const pm = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: 0.5, bevelEnabled: false }), std({ color: 0xf2ead2 }));
        pm.position.set(f.x - f.nx * 0.3, info.h, f.z - f.nz * 0.3); pm.rotation.y = ry; pm.castShadow = true; g.add(pm);
        void ped;
        for (const s of [-1, 1]) g.add(box(0.6, info.h, 0.6, WHITE, f.x + s * 3.5 * f.nz + f.nx * 0.3, info.h / 2, f.z - s * 3.5 * f.nx + f.nz * 0.3, ry));
      }
    }
  }

  // ---------------------------------------------------------------- Kidz Akademy: playground out front
  {
    const [kx, kz] = P['Kidz Akademy'];
    const bi = buildingFor('Kidz Akademy'), info = buildings[bi];
    const f = info && facadeFor(info, kx, kz);
    const n = nearest(kx, kz), rp = sample(n.e, 1, n.s);
    // put the play area on the side of the building away from the road
    let ox = kx, oz = kz, nx = 0, nz = 1;
    if (f) { nx = f.nx; nz = f.nz; ox = info.cx - nx * 18; oz = info.cz - nz * 18; } else { const l = Math.hypot(rp.x - kx, rp.z - kz) || 1; nx = (rp.x - kx) / l; nz = (rp.z - kz) / l; ox = kx - nx * 10; oz = kz - nz * 10; }
    const play = playground(['#ff5d5d', '#ffd23f', '#3fa7ff', '#5ad15a']);
    play.position.set(ox, 0, oz); play.rotation.y = Math.atan2(nx, nz); g.add(play);
    if (!info) {
      // no footprint survived the squeeze: build it as it is, a two-storey red brick building right on the footpath
      const fx = rp.x - kx, fz = rp.z - kz, fl = Math.hypot(fx, fz) || 1; // front faces the road
      const ux = fx / fl, uz = fz / fl, ax = -uz, az = ux;
      const W = 15, D = 9, H = SIGNS['Kidz Akademy'].h;
      const cx = rp.x - ux * (n.e.w / 2 + 3 + D / 2), cz = rp.z - uz * (n.e.w / 2 + 3 + D / 2);
      const P = (a, b) => [cx + ax * a + ux * b, cz + az * a + uz * b];
      let pts = [P(-W / 2, D / 2), P(W / 2, D / 2), P(W / 2, -D / 2), P(-W / 2, -D / 2)];
      let area = 0; for (let i = 0; i < 4; i++) { const a = pts[i], b = pts[(i + 1) % 4]; area += a[0] * b[1] - b[0] * a[1]; }
      if (area > 0) pts.reverse();
      const walls = new Soup(), roofs = new Soup();
      addWalls(walls, pts, H, [1, 1, 1]);
      gableRoof(walls, roofs, { c: [cx, cz], ux: ax, uz: az, long: W, short: D }, H, [0.42, 0.44, 0.47], [1, 1, 1]);
      const bt = brickTexture();
      const wm = new THREE.Mesh(walls.geometry(), new THREE.MeshStandardMaterial({ map: bt, normalMap: bt.userData.normal, vertexColors: true, roughness: 0.92 }));
      const rm = new THREE.Mesh(roofs.geometry(), new THREE.MeshStandardMaterial({ map: roofTexture(), vertexColors: true, roughness: 0.8 }));
      for (const m of [wm, rm]) { m.castShadow = m.receiveShadow = true; g.add(m); }
      shops['Kidz Akademy'] = { x: cx + ux * (D / 2), z: cz + uz * (D / 2), nx: ux, nz: uz, len: W };
      g.add(shopfront(shops['Kidz Akademy'], SIGNS['Kidz Akademy']));
      // the grey stone house next door, as in the photo
      {
        const sx = cx + ax * (W / 2 + 4.8) - ux * 0.5, sz = cz + az * (W / 2 + 4.8) - uz * 0.5, sw = 9, sd = D - 1;
        const Q = (a, b) => [sx + ax * a + ux * b, sz + az * a + uz * b];
        let q = [Q(-sw / 2, sd / 2), Q(sw / 2, sd / 2), Q(sw / 2, -sd / 2), Q(-sw / 2, -sd / 2)];
        let ar = 0; for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4]; ar += a[0] * b[1] - b[0] * a[1]; }
        if (ar > 0) q.reverse();
        const sw2 = new Soup(), sr = new Soup(), col = [0.66, 0.64, 0.6];
        addWalls(sw2, q, 5.8, col);
        gableRoof(sw2, sr, { c: [sx, sz], ux: ax, uz: az, long: sw, short: sd }, 5.8, [0.4, 0.42, 0.45], col);
        const ft = facadeTexture();
        const m1 = new THREE.Mesh(sw2.geometry(), new THREE.MeshStandardMaterial({ map: ft, normalMap: ft.userData.normal, vertexColors: true, roughness: 0.95 }));
        const m2 = new THREE.Mesh(sr.geometry(), new THREE.MeshStandardMaterial({ map: roofTexture(), vertexColors: true, roughness: 0.8 }));
        for (const m of [m1, m2]) { m.castShadow = m.receiveShadow = true; g.add(m); }
      }
      play.position.set(cx - ux * 16, 0, cz - uz * 16);
    }
  }

  // ---------------------------------------------------------------- the playground in the town park
  {
    const [x, z] = P['Kilcullen Playground'];
    const play = playground(['#e5484d', '#3e63dd', '#ffd23f', '#30a46c']);
    play.position.set(x, 0, z); g.add(play);
  }

  // ---------------------------------------------------------------- Kilcullen GAA: pitch, posts, clubhouse
  {
    const [gx, gz] = P['Kilcullen GAA'];
    let pitch = null, bestA = 0;
    for (const a of world.areas) {
      if (a.sport !== 'gaelic_games') continue;
      const [cx, cz] = centroid(a.pts), A = Math.abs(polyArea(a.pts));
      if (Math.hypot(cx - gx, cz - gz) < 160 && A > bestA) { bestA = A; pitch = a; }
    }
    if (pitch) {
      const o = obb(pitch.pts);
      const ry = Math.atan2(o.ux, o.uz);
      const lines = new THREE.Group();
      const lm = std({ color: 0xffffff });
      // touchlines and the 13 m / 20 m / 45 m lines
      const L = o.long / 2 - 1, S = o.short / 2 - 1;
      for (const s of [-1, 1]) lines.add(box(0.15, 0.02, L * 2, lm, s * S, 0.04, 0));
      for (const d of [L, L - 13 * 0.8, L - 20 * 0.8, L - 45 * 0.8]) for (const s of [-1, 1]) lines.add(box(S * 2, 0.02, 0.15, lm, 0, 0.04, s * d));
      for (const s of [-1, 1]) {
        // H goalposts: uprights 6.5 m apart, crossbar at 2.5 m, posts 7 m tall, a net under the bar
        const gp = new THREE.Group();
        gp.add(box(0.14, 7.5, 0.14, WHITE, -3.25 * 0.8, 3.75, 0), box(0.14, 7.5, 0.14, WHITE, 3.25 * 0.8, 3.75, 0), box(6.5 * 0.8, 0.14, 0.14, WHITE, 0, 2.5, 0));
        const net = new THREE.Mesh(new THREE.PlaneGeometry(6.5 * 0.8, 2.5), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
        net.position.set(0, 1.25, s * 1.2); gp.add(net);
        gp.position.set(0, 0, s * L); lines.add(gp);
      }
      lines.position.set(o.c[0], 0, o.c[1]); lines.rotation.y = ry; g.add(lines);
      // clubhouse in the club's black and white, beside the pitch
      const club = new THREE.Group();
      club.add(box(16, 4, 8, std({ color: 0xffffff }), 0, 2, 0), box(16.4, 0.6, 8.4, std({ color: 0x1a1a1a }), 0, 4.3, 0), box(16, 0.8, 0.1, std({ color: 0x1a1a1a }), 0, 0.4, 4.02));
      const sb = board('Kilcullen GAA', { bg: '#111111', fg: '#ffffff', border: '#ffffff', sub: 'CLG Cill Chuillinn' }, 0, 2.3, 4.05, 0, 1, 9, 1.6);
      club.add(sb);
      // a little stand of black and white seats
      for (let r = 0; r < 3; r++) club.add(box(14, 0.4, 1, std({ color: r % 2 ? 0x1a1a1a : 0xffffff }), 0, 0.3 + r * 0.45, 6.5 + r * 0.9));
      // the clubhouse faces the pitch, set off one touchline
      const side = S + 12;
      club.position.set(o.c[0] - o.uz * side, 0, o.c[1] + o.ux * side);
      club.rotation.y = ry + Math.PI / 2 + Math.PI;
      g.add(club);
      // flags
      for (let i = 0; i < 4; i++) {
        const fx = o.c[0] - o.uz * (S + 4) + o.ux * (i - 1.5) * 10, fz = o.c[1] + o.ux * (S + 4) + o.uz * (i - 1.5) * 10;
        g.add(box(0.08, 6, 0.08, WHITE, fx, 3, fz));
        g.add(box(0.02, 0.9, 1.4, std({ color: i % 2 ? 0x111111 : 0xffffff, side: THREE.DoubleSide }), fx, 5.4, fz + 0.7));
      }
    }
  }

  // ---------------------------------------------------------------- Kilashee House: turret, belvedere, gables
  {
    const bi = buildingFor('Kilashee House Hotel'), info = buildings[bi];
    if (info) {
      const sandstone = std({ color: 0xd9cfbd, roughness: 0.95 });
      // turret at the end of the house furthest along its long axis
      const o = obb(info.pts);
      const tx = o.c[0] + o.ux * (o.long / 2 - 4), tz = o.c[1] + o.uz * (o.long / 2 - 4), ry = Math.atan2(o.ux, o.uz);
      g.add(box(6.5, 21, 6.5, sandstone, tx, 10.5, tz, ry));
      // open belvedere: four slim columns and a cornice, then the ogee spire
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) g.add(box(0.5, 3, 0.5, sandstone, tx + (a * o.ux + b * -o.uz) * 2.7, 22.5, tz + (a * o.uz + b * o.ux) * 2.7));
      g.add(box(7, 0.6, 7, sandstone, tx, 24.3, tz, ry));
      const ogee = new THREE.Mesh(new THREE.LatheGeometry([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4.2].map((y, i, a) => new THREE.Vector2(i === a.length - 1 ? 0.02 : 3.4 * Math.pow(1 - i / (a.length - 1), 0.7) * (1 + 0.25 * Math.sin((i / (a.length - 1)) * Math.PI)), y)), 4), std({ color: 0x5b6b70, metalness: 0.3 }));
      ogee.position.set(tx, 24.6, tz); ogee.rotation.y = ry + Math.PI / 4; ogee.castShadow = true; g.add(ogee);
      // curvy Jacobean gables along the front, and a steep slate roof band
      const front = facadeFor(info, info.cx + o.uz * 50, info.cz - o.ux * 50) || facadeFor(info, info.cx, info.cz);
      if (front) {
        const fry = Math.atan2(front.nx, front.nz);
        const ax = -front.nz, az = front.nx; // along the facade
        for (const k of [-2, -1, 0, 1, 2]) {
          const gx = front.x + ax * k * 9, gz = front.z + az * k * 9;
          g.add(dutchGable(sandstone, gx - front.nx * 0.2, info.h, gz - front.nz * 0.2, fry));
        }
        // the porch: coupled piers under a little gable
        const px = front.x + front.nx * 2.5, pz = front.z + front.nz * 2.5;
        for (const s of [-1, 1]) g.add(box(0.7, 4, 0.7, sandstone, px + ax * s * 2, 2, pz + az * s * 2, fry));
        g.add(box(5, 0.6, 3, sandstone, px - front.nx * 0.5, 4.2, pz - front.nz * 0.5, fry));
        g.add(dutchGable(sandstone, px - front.nx * 0.5, 4.5, pz - front.nz * 0.5, fry, 0.55));
      }
      // the hotel's name on a stone gate pier where the drive meets the road
      const n = nearest(info.cx, info.cz, (e) => e.cls !== 'service');
      const rp = sample(n.e, 1, n.s);
      let nx = info.cx - rp.x, nz = info.cz - rp.z; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      const gx = rp.x + nx * (n.e.w / 2 + 3), gz = rp.z + nz * (n.e.w / 2 + 3);
      g.add(box(1.4, 2.4, 1.4, sandstone, gx, 1.2, gz));
      g.add(postSign('Killashee Hotel', { bg: '#2c2a4a', fg: '#efe3c2', border: '#c9a54a' }, gx - nz * 4, gz + nx * 4, -nx, -nz, 1.3, 5));
    }
  }

  // ---------------------------------------------------------------- welcome signs, sculpture, monument
  {
    // where the R448 crosses the town boundary on each side
    const crossings = [];
    for (const e of edges) {
      if (e.ref !== 'R448' && e.ref !== 'R418') continue;
      for (let k = 1; k < e.pts.length; k++) {
        const a = e.pts[k - 1], b = e.pts[k];
        const ia = inTown(a[0], a[1], -120), ib = inTown(b[0], b[1], -120);
        if (ia !== ib) crossings.push({ e, p: ia ? a : b, out: ia ? b : a });
      }
    }
    for (const c of crossings.slice(0, 4)) {
      const dx = c.out[0] - c.p[0], dz = c.out[1] - c.p[1], l = Math.hypot(dx, dz) || 1;
      // sign faces drivers coming in, on their left
      const nx = dx / l, nz = dz / l, lx = nz, lz = -nx;
      g.add(postSign('Cill Chuillinn', { bg: '#ffffff', fg: '#111111', border: '#111111', sub: 'KILCULLEN', font: 'Arial, sans-serif' }, c.out[0] - lx * (c.e.w / 2 + 2.5), c.out[1] - lz * (c.e.w / 2 + 2.5), nx, nz, 1.2, 4));
    }
    // the spearhead sculpture (after the Iron Age spearhead found at Dún Ailinne) at the south-west way in
    const sw = crossings.find((c) => c.e.ref === 'R448' && c.out[1] > 200) || crossings[0];
    if (sw) {
      const dx = sw.out[0] - sw.p[0], dz = sw.out[1] - sw.p[1], l = Math.hypot(dx, dz) || 1;
      const sx = sw.p[0] - (dz / l) * 12, sz = sw.p[1] + (dx / l) * 12;
      g.add(box(3, 1.2, 3, STONE, sx, 0.6, sz));
      const spear = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.6, 0.5], [1.1, 3], [0.9, 6], [0.4, 8.5], [0, 10]].map(([r, y]) => new THREE.Vector2(r, y)), 4), std({ color: 0x8a6a3a, metalness: 0.7, roughness: 0.35 }));
      spear.position.set(sx, 1.2, sz); spear.scale.set(1, 1, 0.35); spear.castShadow = true; g.add(spear);
    }
    // 1798 memorial on the far side of the bridge
    const br = edges.find((e) => e.bridge && e.name === 'Kilcullen Bridge');
    if (br) {
      const end = br.pts[0];
      const mx = end[0] + 6, mz = end[1] + 9;
      g.add(box(2.2, 0.6, 2.2, STONE, mx, 0.3, mz), box(1.2, 2.6, 1.2, STONE, mx, 1.9, mz));
      g.add(box(0.12, 4.5, 0.12, std({ color: 0x5c4630 }), mx, 4.3, mz), box(0.06, 0.8, 0.3, std({ color: 0x777777, metalness: 0.8 }), mx, 6.8, mz));
    }
    // Naas welcome at the roundabout
    const [rx, rz] = P['Kilcullen Road Roundabout'];
    // the town sign on the left on the way in, 70 m before the roundabout (walking back along the route)
    {
      const rt = world.route; let acc = 0, i = rt.length - 1;
      while (i > 1 && acc < 70) { acc += Math.hypot(rt[i][0] - rt[i - 1][0], rt[i][1] - rt[i - 1][1]); i--; }
      const a = rt[i], b = rt[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, dx = (b[0] - a[0]) / l, dz = (b[1] - a[1]) / l;
      g.add(postSign('Nás na Ríogh', { bg: '#ffffff', fg: '#111111', border: '#111111', sub: 'NAAS', font: 'Arial, sans-serif' }, a[0] + dz * 7, a[1] - dx * 7, -dx, -dz, 1.2, 4.5));
    }
    void rx; void rz;
    // flowers on the roundabout island
    const ring = edges.filter((e) => e.round).flatMap((e) => e.pts);
    if (ring.length) {
      const cx = ring.reduce((a, p) => a + p[0], 0) / ring.length, cz = ring.reduce((a, p) => a + p[1], 0) / ring.length;
      const rad = Math.min(...ring.map((p) => Math.hypot(p[0] - cx, p[1] - cz))) - 4.2;
      if (rad > 2) {
        const isl = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad + 0.3, 0.4, 32), std({ color: 0x5e9e3e }));
        isl.position.set(cx, 0.2, cz); isl.receiveShadow = true; g.add(isl);
        const kerb = new THREE.Mesh(new THREE.TorusGeometry(rad + 0.15, 0.18, 6, 40).rotateX(Math.PI / 2), std({ color: 0xdddddd }));
        kerb.position.set(cx, 0.2, cz); g.add(kerb);
        for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; g.add(box(0.7, 0.6, 0.7, std({ color: ['#e5484d', '#ffd23f', '#f76b15', '#8e4ec6'][i % 4] }), cx + Math.cos(a) * rad * 0.6, 0.6, cz + Math.sin(a) * rad * 0.6)); }
      }
    }
  }

  // ---------------------------------------------------------------- floating destination badges
  const badges = [];
  for (const d of DESTINATIONS) {
    const p = P[d.poi]; if (!p) continue;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: badgeTexture(d.emoji, d.label, d.colour), depthWrite: false }));
    const bi = buildingFor(d.poi), info = bi >= 0 ? buildings[bi] : null;
    const base = d.id === 'home' ? 12 : (info ? info.h : 4) + 9;
    sp.position.set(p[0], base, p[1]); sp.scale.set(8, 10, 1); sp.renderOrder = 5;
    sp.userData = { base, id: d.id };
    g.add(sp); badges.push(sp);
  }
  return { group: g, badges };
}

function dutchGable(mat, x, y, z, ry, s = 1) {
  const sh = new THREE.Shape();
  sh.moveTo(-3 * s, 0); sh.lineTo(-3 * s, 1 * s);
  sh.quadraticCurveTo(-1.2 * s, 1.2 * s, -1.6 * s, 2.6 * s); sh.quadraticCurveTo(-0.8 * s, 3 * s, -0.7 * s, 3.8 * s);
  sh.lineTo(0, 4.4 * s); sh.lineTo(0.7 * s, 3.8 * s); sh.quadraticCurveTo(0.8 * s, 3 * s, 1.6 * s, 2.6 * s);
  sh.quadraticCurveTo(1.2 * s, 1.2 * s, 3 * s, 1 * s); sh.lineTo(3 * s, 0); sh.lineTo(-3 * s, 0);
  const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.6, bevelEnabled: false }), mat);
  m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true;
  return m;
}

function playground(cols) {
  const g = new THREE.Group();
  const c = cols.map((h) => std({ color: h, roughness: 0.5 }));
  // soft ground, a climbing tower with a slide, a swing set
  const mat = new THREE.Mesh(new THREE.CircleGeometry(9, 28), std({ color: 0x7a5a48 }));
  mat.rotation.x = -Math.PI / 2; mat.position.y = 0.04; g.add(mat);
  g.add(box(3, 0.3, 3, c[0], 0, 2, 0));
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) g.add(box(0.2, 3.6, 0.2, c[2], a * 1.4, 1.8, b * 1.4));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.6, 4), c[1]); roof.position.y = 4.4; roof.rotation.y = Math.PI / 4; roof.castShadow = true; g.add(roof);
  const slide = box(1, 0.15, 4.6, c[3], 0, 1.05, 3.4); slide.rotation.x = -0.45; g.add(slide);
  g.add(box(0.15, 2.6, 0.15, c[1], -4.5, 1.3, -3), box(0.15, 2.6, 0.15, c[1], -4.5, 1.3, 1), box(0.15, 0.15, 4.2, c[1], -4.5, 2.6, -1));
  for (const z of [-2, 0]) { g.add(box(0.6, 0.08, 0.3, c[0], -4.5, 0.6, z)); }
  // a see-saw
  g.add(box(4, 0.12, 0.35, c[2], 4.5, 0.55, -2), box(0.4, 0.5, 0.4, c[0], 4.5, 0.25, -2));
  return g;
}
