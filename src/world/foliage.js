// Foliage and bark shared by the countryside and the estate: lumpy shapes with smooth shading and a leaf texture
// with a normal map, instead of faceted low-poly blobs.
import * as THREE from 'three';
import { leafTexture, normalMap, rng } from './textures.js';

let _crownMat = null, _barkMat = null;
export function crownMaterial() {
  if (!_crownMat) { const t = leafTextureCached(); _crownMat = new THREE.MeshStandardMaterial({ map: t, normalMap: t.userData.normal, normalScale: new THREE.Vector2(1.4, 1.4), roughness: 0.9 }); }
  return _crownMat;
}
export function barkMaterial() {
  if (!_barkMat) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d'), r = rng(83);
    g.fillStyle = '#5a4a3a'; g.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 260; i++) { g.fillStyle = r() < 0.5 ? '#3f3428' : '#6e5c48'; g.fillRect(r() * 64, r() * 256, 1 + r() * 3, 8 + r() * 30); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    _barkMat = new THREE.MeshStandardMaterial({ map: t, normalMap: normalMap(c, 3), roughness: 1 });
  }
  return _barkMat;
}
let _leaf = null;
function leafTextureCached() { if (!_leaf) { _leaf = leafTexture(); _leaf.repeat.set(3, 2); _leaf.userData.normal.repeat.set(3, 2); } return _leaf; }

// a sphere with its surface pushed in and out by smooth noise, every copy of a vertex moved the same way
export function lumpySphere(seed = 1, detail = 3, amount = 0.22) {
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, r = rng(seed);
  const waves = Array.from({ length: 6 }, () => [r() * 6.28, r() * 6.28, r() * 6.28, 1.5 + r() * 3]);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let n = 0; for (const [a, b, c, f] of waves) n += Math.sin(x * f + a) * Math.sin(y * f + b) * Math.sin(z * f + c);
    const k = 1 + (n / waves.length) * amount * 2.2;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  return g;
}
// a hedge section: a box with rounded, uneven sides
export function lumpyBox() {
  const g = new THREE.BoxGeometry(1, 1, 1, 3, 3, 4), p = g.attributes.position, r = rng(91), offs = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!offs.has(k)) offs.set(k, (r() - 0.5) * 0.12);
    const o = offs.get(k), x = p.getX(i), y = p.getY(i);
    // round the top edges and push the faces in and out a little
    const top = y > 0.4 ? 0.82 : 1;
    p.setXYZ(i, x * top + Math.sign(x) * o, y + (y > 0 ? o : 0), p.getZ(i));
  }
  g.computeVertexNormals();
  return g;
}

