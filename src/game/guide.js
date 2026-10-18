// Help finding the way: glowing chevrons on the road along the planned route, and a big green arrow over the next
// junction pointing the way to turn.
import * as THREE from 'three';

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
  return g.rotateX(-Math.PI / 2).rotateY(Math.PI); // flat, pointing along +z
}

export class Guide {
  constructor(scene) {
    this.N = 24;
    this.chev = new THREE.InstancedMesh(chevronGeometry(), new THREE.MeshBasicMaterial({ color: 0x41e0ff, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }), this.N);
    this.chev.frustumCulled = false; this.chev.renderOrder = 3; this.chev.count = 0;
    scene.add(this.chev);
    this.arrow = new THREE.Mesh(arrowGeometry(), new THREE.MeshStandardMaterial({ color: 0x3ddc84, emissive: 0x1a8f4a, emissiveIntensity: 0.6, roughness: 0.4 }));
    this.arrow.visible = false; this.arrow.castShadow = true;
    scene.add(this.arrow);
    this.t = 0;
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.p = new THREE.Vector3(); this.s = new THREE.Vector3(1, 1, 1);
    this.Y = new THREE.Vector3(0, 1, 0);
  }

  // path: [[x, z, y?], ...] starting at the car; turn: { x, z, dx, dz } over the next junction, or null
  update(dt, path, turn) {
    this.t += dt;
    const step = 7, phase = (this.t * 6) % step;
    let shown = 0;
    if (path && path.length > 1) {
      let k = 1, acc = 0, want = 7 + phase;
      while (shown < this.N && k < path.length) {
        const a = path[k - 1], b = path[k], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (acc + l < want) { acc += l; k++; continue; }
        const t = (want - acc) / (l || 1);
        this.p.set(a[0] + (b[0] - a[0]) * t, (a[2] || 0) + 0.14, a[1] + (b[1] - a[1]) * t);
        this.q.setFromAxisAngle(this.Y, Math.atan2(b[0] - a[0], b[1] - a[1]));
        this.s.setScalar(shown < 2 ? 0.45 + 0.45 * Math.min(1, (shown + 1 - phase / step) / 2) : 0.9);
        this.chev.setMatrixAt(shown++, this.m.compose(this.p, this.q, this.s));
        want += step;
      }
    }
    this.chev.count = shown;
    this.chev.instanceMatrix.needsUpdate = true;
    this.arrow.visible = !!turn;
    if (turn) {
      this.arrow.position.set(turn.x + turn.dx * 6, 4.2 + Math.sin(this.t * 5) * 0.35, turn.z + turn.dz * 6);
      this.arrow.rotation.set(0, Math.atan2(turn.dx, turn.dz), 0);
      this.arrow.rotateX(-0.55);
    }
  }
}
