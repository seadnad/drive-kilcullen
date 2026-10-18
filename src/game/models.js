// Loads the Blender-built hero cars (public/models/*.glb). Each exposes the same interface as
// makePlayerCar(): a Group facing +z with userData.update(speed, dt, steer) and userData.setLights(level).
// The Garda i40 ('garda', and 'garda_rp' for the Roads Policing livery) is one Draco-compressed model whose
// livery is painted onto its body atlas at load time (see gardacar.js / livery.js).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { carMaterialCache } from './carmaterials.js';
import { gardaTextures, gardaMaterials } from './gardacar.js';
const LITE = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches; // phones: fewer shadow casters

const loader = new GLTFLoader();
loader.setDRACOLoader(new DRACOLoader().setDecoderPath(`${import.meta.env.BASE_URL}draco/`));
const cache = new Map();

function load(file) {
  if (!cache.has(file)) cache.set(file, loader.loadAsync(`${import.meta.env.BASE_URL}models/${file}.glb`));
  return cache.get(file);
}

const GARDA_VARIANTS = { garda: 'standard', garda_rp: 'roadsPolicing' };
const WHEEL_R = { hatch: 0.34, taxi: 0.34, coupe: 0.35, gt: 0.324 }; // tyre radius, for the wheel spin

// The Dublin taxi roof sign: yellow with the blue chequer top and bottom, TAXI on the front and back and TACSAÍ
// beneath (the bilingual sign), lit after dark. Sits on the roof's highest point near the middle of the car.
function taxiSign(group) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  for (let i = 0; i < 32; i++) { g.fillStyle = i % 2 ? '#1b3f94' : '#f6c615'; g.fillRect(i * 8, 0, 8, 8); g.fillStyle = i % 2 ? '#f6c615' : '#1b3f94'; g.fillRect(i * 8, 56, 8, 8); }
  g.fillStyle = '#f6c615'; g.fillRect(0, 8, 256, 48);
  g.fillStyle = '#1b3f94'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 30px Arial'; g.fillText('TAXI', 128, 27);
  g.font = 'bold 13px Arial'; g.fillText('TACSAÍ', 128, 48);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const face = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.4 });
  const side = new THREE.MeshStandardMaterial({ color: 0xf6c615, emissive: 0xf6c615, emissiveIntensity: 0.1, roughness: 0.4 });
  // roof height: the highest body vertex within 0.35 m of the centreline over the middle third of the car
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group), v = new THREE.Vector3();
  const zMid = (box.min.z + box.max.z) / 2, half = (box.max.z - box.min.z) / 6;
  let top = -Infinity, zTop = zMid;
  group.traverse((o) => {
    if (!o.isMesh || o.material.transparent) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      if (Math.abs(v.x) < 0.35 && Math.abs(v.z - zMid) < half && v.y > top) { top = v.y; zTop = v.z; }
    }
  });
  if (!isFinite(top)) top = box.max.y;
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.2, 0.2).translate(0, 0.1, 0), [side, side, side, side, face, face]);
  sign.position.set(0, top - 0.01, zTop - 0.05);
  sign.castShadow = true;
  group.add(sign);
  return (level) => { face.emissiveIntensity = 0.25 + level * 1.6; side.emissiveIntensity = 0.1 + level * 0.8; };
}

// Returns a ready-to-use car group, or null if the model can't be loaded.
export async function loadCar(name) {
  const variant = GARDA_VARIANTS[name];
  const file = variant ? 'garda' : name === 'taxi' ? 'hatch' : name;
  let gltf;
  try { gltf = await load(file); } catch (e) { console.warn(`model ${file} failed to load`, e); return null; }
  const src = gltf.scene.clone(true);
  // exported models face -z (Blender +Y); turn them round to face +z like everything else
  const inner = new THREE.Group();
  inner.rotation.y = Math.PI;
  inner.add(src);
  const group = new THREE.Group();
  group.add(inner);

  let material, garda = null;
  if (variant) {
    let extras = null;
    src.traverse((o) => { if (!extras && o.userData && o.userData.atlas) extras = o.userData; });
    const tex = await gardaTextures(JSON.parse(extras.atlas), JSON.parse(extras.guides), variant);
    garda = gardaMaterials(tex);
    material = garda.get;
  } else {
    material = carMaterialCache(); // one tuned material per source material, per car (lights are per car)
  }

  const wheels = [], glow = [], calipers = [], paints = [];
  let reverseLamp = null;
  src.traverse((o) => {
    // Only the wheel node itself spins and steers. A multi-material wheel loads as a group named wheel_front_l
    // with child meshes (wheel_front_l_1, ...); rotating the children as well applied steer and spin twice,
    // and the second steer about an already-spun axis tipped the wheel over.
    if (/^wheel_(front|rear)_[lr]$/.test(o.name)) wheels.push({ o, front: /front/.test(o.name) });
    // front brake calipers steer with their wheel but don't spin (pivot at the wheel centre)
    if (/^caliper_front_[lr]$/.test(o.name)) calipers.push(o);
    if (!o.isMesh) return;
    // On Low, only the body shell and wheels need to cast into the sun map. Tiny grille,
    // badge and lamp shadows add draw calls without a visible silhouette at this map size.
    o.userData.coreShadow = /^(body_paint|paint_|paint_white|tyre)/.test(o.material.name || '');
    o.castShadow = true; o.receiveShadow = true;
    o.material = material(o.material);
    const n = o.material.name || '';
    if (!garda && /headlight|drl|taillight|indicator|lightbar_\d/.test(n) && !glow.some((g) => g.m === o.material)) glow.push({ m: o.material, base: o.material.emissiveIntensity, kind: n });
    if (!garda && /^paint_/.test(n) && !paints.includes(o.material)) paints.push(o.material);
    if (!garda && /^reverse/.test(n)) reverseLamp = o.material;
  });
  // Merge every non-wheel mesh into one mesh per material (a draw call each, twice with shadows).
  // Geometry is baked into the car root's space; wheels keep their own nodes.
  src.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(src.matrixWorld).invert();
  const buckets = new Map(), coreShadows = new Set(), victims = [];
  src.traverse((o) => {
    if (!o.isMesh) return;
    for (let p = o; p && p !== src; p = p.parent) if (/^wheel_|^caliper_front_/.test(p.name)) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (!buckets.has(o.material)) buckets.set(o.material, []);
    buckets.get(o.material).push(g);
    if (o.userData.coreShadow) coreShadows.add(o.material);
    victims.push(o);
  });
  for (const o of victims) o.parent.remove(o);
  for (const [mat, geos] of buckets) {
    const merged = new THREE.Mesh(mergeGeometries(geos), mat);
    // see-through parts neither cast nor receive shadows (a shadowed clear lens reads as a dark smudge)
    merged.castShadow = !mat.transparent && (!LITE || coreShadows.has(mat));
    merged.receiveShadow = !mat.transparent;
    merged.renderOrder = mat.transparent ? 2 : 0;
    src.add(merged);
  }
  const signLights = name === 'taxi' ? taxiSign(group) : null;
  let spin = 0, lights = 0, braking = false;
  const q = new THREE.Quaternion(), qs = new THREE.Quaternion(), X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
  const r = WHEEL_R[name] ?? (variant ? 0.325 : 0.33);
  const hasTail = glow.some((g) => /taillight/.test(g.kind));
  // lamps: brighter after dark; the tail lamps light up further under braking (lightbars are driven by the siren)
  const lamps = () => {
    for (const g of glow) {
      if (/lightbar/.test(g.kind)) continue;
      g.m.emissiveIntensity = g.base * (1 + lights * 3) * (braking && /taillight/.test(g.kind) ? 4 : 1);
    }
  };
  group.userData = {
    model: name,
    update(speed, dt, steer) {
      spin += (speed * dt) / r;
      for (const w of wheels) {
        q.identity();
        // the model is turned 180°, so steering and spin directions flip in its local frame
        if (w.front) q.multiply(qs.setFromAxisAngle(Y, steer));
        q.multiply(qs.setFromAxisAngle(X, -spin));
        w.o.quaternion.copy(q);
      }
      for (const c of calipers) c.quaternion.setFromAxisAngle(Y, steer);
    },
    setLights(level) {
      if (garda) { garda.controls.setLights(level); return; }
      lights = level; lamps();
      if (signLights) signLights(level);
    },
    // body colour, for the cars that offer a choice: { color, metal } (see carlist.js)
    setPaint(p) {
      for (const m of paints) { m.color.set(p.color); m.metalness = p.metal || 0; m.roughness = p.rough ?? 0.35; }
    },
    lightbar: garda ? garda.controls.lightbar : glow.filter((g) => /lightbar/.test(g.kind)).map((g) => g.m),
    ...(garda ? { flash: garda.controls.flash, setBrake: garda.controls.setBrake, setReverse: garda.controls.setReverse } : {
      // only on a change of state, so there are no per-frame material writes
      setBrake(on) { if (on !== braking && hasTail) { braking = on; lamps(); } },
      setReverse(on) { if (reverseLamp) reverseLamp.emissiveIntensity = on ? 3 : 0; },
    }),
  };
  return group;
}
