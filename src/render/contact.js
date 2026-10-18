// Soft contact shadows under the cars (after Dublin Drive's): a blurred body-sized blob with darker pools at the
// tyres, so cars sit on the road even in shade or beyond the sun's shadow map.
import * as THREE from 'three';

function carTexture() {
  const W = 128, H = 256, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.filter = 'blur(16px)'; g.fillStyle = 'rgba(255,255,255,0.55)';
  g.beginPath(); g.roundRect(28, 30, W - 56, H - 60, 30); g.fill();
  g.filter = 'blur(7px)'; g.fillStyle = 'rgba(255,255,255,0.5)';
  g.beginPath(); g.roundRect(36, 46, W - 72, H - 92, 20); g.fill();
  g.filter = 'blur(4px)'; g.fillStyle = 'rgba(255,255,255,1)';
  for (const v of [0.5 - 1.457 / 5.3, 0.5 + 1.3125 / 5.3]) for (const u of [0.5 - 0.318, 0.5 + 0.318]) { g.beginPath(); g.ellipse(u * W, v * H, 8, 20, 0, 0, Math.PI * 2); g.fill(); }
  return new THREE.CanvasTexture(c);
}

export function createContactShadows(scene, max) {
  const mat = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: carTexture(), transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 });
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat, max);
  mesh.frustumCulled = false; mesh.renderOrder = 1; mesh.count = 0;
  scene.add(mesh);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  return {
    // list of { x, y, z, h, w, l }
    update(list) {
      mesh.count = Math.min(max, list.length);
      for (let i = 0; i < mesh.count; i++) { const c = list[i]; mesh.setMatrixAt(i, m.compose(p.set(c.x, c.y + 0.03, c.z), q.setFromAxisAngle(up, c.h), s.set(c.w, 1, c.l))); }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
