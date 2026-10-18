// Things that help a small driver: glowing chevrons on the road showing the way to go, a big arrow over each
// junction pointing the way the car will turn, and gold stars to collect along the roads.
import * as THREE from 'three';
import { sample, edges, endNode } from './graph.js';
import { laneOffset } from './driver.js';
import { inTown } from '../world/world.js';

const tmp = {};

function chevronGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 1.1); s.lineTo(1.3, -0.2); s.lineTo(0.85, -0.65); s.lineTo(0, 0.2); s.lineTo(-0.85, -0.65); s.lineTo(-1.3, -0.2); s.closePath();
  // lie flat on the road, pointing along +z
  return new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2).rotateY(Math.PI);
}

function arrowGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 2.4); s.lineTo(1.9, 0.4); s.lineTo(0.75, 0.4); s.lineTo(0.75, -1.8); s.lineTo(-0.75, -1.8); s.lineTo(-0.75, 0.4); s.lineTo(-1.9, 0.4); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.45, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 2 });
  g.translate(0, 0, -0.22);
  // stand it up facing the camera, pointing along +z when flattened: we lay it tilted for a 3D look
  return g.rotateX(-Math.PI / 2).rotateY(Math.PI);
}

function starGeometry() {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.42 : 1;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 0.25, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2 }).translate(0, 0, -0.12);
}

export class Guide {
  constructor(scene) {
    // chevrons along the planned way
    this.N = 26;
    this.chev = new THREE.InstancedMesh(chevronGeometry(), new THREE.MeshBasicMaterial({ color: 0x41e0ff, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }), this.N);
    this.chev.frustumCulled = false; this.chev.renderOrder = 3;
    scene.add(this.chev);
    // the junction arrow, plus faint arrows for the other ways
    const matMain = new THREE.MeshStandardMaterial({ color: 0x3ddc84, emissive: 0x1a8f4a, emissiveIntensity: 0.6, roughness: 0.4 });
    const matAlt = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, roughness: 0.4 });
    const ag = arrowGeometry();
    this.arrow = new THREE.Mesh(ag, matMain); this.arrow.visible = false; this.arrow.castShadow = true;
    this.alts = [0, 1, 2, 3].map(() => { const m = new THREE.Mesh(ag, matAlt); m.visible = false; m.scale.setScalar(0.6); scene.add(m); return m; });
    scene.add(this.arrow);
    this.t = 0;
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.p = new THREE.Vector3(); this.s = new THREE.Vector3(1, 1, 1);
    this.Y = new THREE.Vector3(0, 1, 0);
    this.stars = new Stars(scene);
  }

  update(dt, car, showPath) {
    this.t += dt;
    // ---- chevrons: every 7 m along the way the car will go, scrolling forward
    const step = 7, phase = (this.t * 6) % step;
    let shown = 0;
    if (showPath) {
      let e = car.e, dir = car.dir, s = car.s + 8 + phase, k = 0;
      const steps = [car.next, ...(car.steps ? car.steps.slice(1) : [])];
      while (shown < this.N && e) {
        if (s > e.len) { s -= e.len; const n = steps[k++]; if (!n || n.uturn) break; e = n.e; dir = n.dir; continue; }
        sample(e, dir, s, tmp);
        const off = laneOffset(e);
        this.p.set(tmp.x + tmp.dz * off, 0.13, tmp.z - tmp.dx * off);
        this.q.setFromAxisAngle(this.Y, Math.atan2(tmp.dx, tmp.dz));
        const fade = Math.min(1, (shown + 1 - phase / step) / 2);
        this.s.setScalar(0.9 * fade + 0.05);
        this.chev.setMatrixAt(shown++, this.m.compose(this.p, this.q, this.s));
        s += step;
      }
    }
    this.chev.count = shown;
    this.chev.instanceMatrix.needsUpdate = true;

    // ---- junction arrow when the next junction has a choice and is close
    const rem = car.remaining();
    const choice = car.opts.length >= 2 || (car.next && car.next.uturn);
    const node = endNode(car.e, car.dir);
    this.arrow.visible = false; for (const a of this.alts) a.visible = false;
    if (choice && rem < 55 && car.next) {
      const bob = Math.sin(this.t * 5) * 0.35;
      const showAt = (mesh, o, y) => {
        // arrow hovers over the junction, pointing along the way out
        const dir = o.uturn ? { dx: -Math.sin(car.vis.h), dz: -Math.cos(car.vis.h) } : leave(o);
        mesh.position.set(node.x + dir.dx * 6, y, node.z + dir.dz * 6);
        mesh.rotation.set(0, Math.atan2(dir.dx, dir.dz), 0);
        mesh.rotateX(-0.55);
        mesh.visible = true;
      };
      showAt(this.arrow, car.next, 4.2 + bob);
      let i = 0;
      for (const o of car.opts) if (o !== car.next && i < this.alts.length) showAt(this.alts[i++], o, 3.6);
    }
    this.stars.update(dt, car);
  }
}

function leave(o) {
  const a = sample(o.e, o.dir, 0, {}), b = sample(o.e, o.dir, Math.min(o.e.len, 12), {});
  const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
  return { dx: dx / l, dz: dz / l };
}

// Gold stars along the roads; drive through them to collect. They come back after a while.
class Stars {
  constructor(scene) {
    const spots = [];
    for (const e of edges) {
      if (e.cls === 'service') continue;
      const mid = e.pts[(e.pts.length / 2) | 0];
      const gap = inTown(mid[0], mid[1]) ? 45 : 32;
      for (let s = 15; s < e.len - 10; s += gap) {
        for (const dir of e.oneway ? [1] : [1, -1]) {
          if ((s / gap + (dir > 0 ? 0 : 0.5)) % 2 >= 1) continue; // alternate lanes
          sample(e, dir, s, tmp);
          const off = laneOffset(e);
          spots.push({ x: tmp.x + tmp.dz * off, z: tmp.z - tmp.dx * off, gone: 0 });
        }
      }
    }
    this.spots = spots;
    this.mesh = new THREE.InstancedMesh(starGeometry(), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffa000, emissiveIntensity: 0.55, metalness: 0.3, roughness: 0.3 }), spots.length);
    this.mesh.castShadow = true;
    scene.add(this.mesh);
    this.count = 0; this.t = 0; this.onCollect = null;
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.p = new THREE.Vector3(); this.s = new THREE.Vector3(); this.Y = new THREE.Vector3(0, 1, 0);
  }
  update(dt, car) {
    this.t += dt;
    this.q.setFromAxisAngle(this.Y, this.t * 2.2);
    for (let i = 0; i < this.spots.length; i++) {
      const sp = this.spots[i];
      if (sp.gone > 0) {
        sp.gone -= dt;
        const k = Math.max(0, (sp.gone - 89.6) / 0.4); // brief pop: shrink away upward in 0.4 s
        this.s.setScalar(k > 0 ? 0.85 * k : 0.0001); this.p.set(sp.x, 1.3 + (1 - k) * 2.5, sp.z);
      } else {
        const d = Math.hypot(sp.x - car.vis.x, sp.z - car.vis.z);
        if (d < 2.6) { sp.gone = 90; this.count++; if (this.onCollect) this.onCollect(this.count); }
        this.s.setScalar(0.85); this.p.set(sp.x, 1.3 + Math.sin(this.t * 3 + i) * 0.2, sp.z);
      }
      this.mesh.setMatrixAt(i, this.m.compose(this.p, this.q, this.s));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
