// Automotive material setup for the Blender-built cars, applied by material name at load time.
// The Blender export carries simple Principled values; here each surface gets physically sensible settings:
// clear-coated paint, tinted dielectric glass, rubber, plastic trim, machined alloys, glossy light lenses and
// matt vinyl livery. Colours from the model are kept (livery especially) - only the response to light changes.
import * as THREE from 'three';
import { addReflections } from '../render/reflect.js';

const srgb = (hex) => new THREE.Color(hex); // hex values are sRGB; ColorManagement converts to linear

function physical(src, props) {
  const m = new THREE.MeshPhysicalMaterial({
    name: src.name, color: src.color.clone(), emissive: src.emissive ? src.emissive.clone() : new THREE.Color(0),
    emissiveIntensity: src.emissiveIntensity ?? 1, side: src.side,
  });
  Object.assign(m, props);
  return m;
}

// Returns [material, reflection strength]
function tune(src) {
  const n = src.name || '';
  // ---- body paint: diffuse base under a sharp clearcoat (the highlight lives in the coat, not the base)
  if (/^paint_/.test(n)) {
    const white = /white/.test(n);
    const m = physical(src, {
      // real white paint has an albedo around 0.75-0.8; 0.9 clipped to flat white in full sun
      metalness: white ? 0.0 : Math.min(src.metalness, 0.5),
      roughness: white ? 0.42 : 0.35,
      clearcoat: 1.0, clearcoatRoughness: 0.06,
      specularIntensity: 0.6,
    });
    if (white) m.color.copy(srgb(0xe6e6e1));
    return [m, 1.0];
  }
  // ---- glass: dark tint, dielectric (ior 1.5) so reflections follow Fresnel - faint head-on, strong at grazing
  if (/^glass/.test(n)) {
    return [physical(src, { color: srgb(0x182127), metalness: 0.0, roughness: 0.04, ior: 1.52, specularIntensity: 1.0, clearcoat: 0.0 }), 1.35];
  }
  // ---- lightbar lenses: glossy deep-blue polycarbonate; emissive colour is a saturated blue so the flash reads
  if (/^lightbar_\d/.test(n)) {
    return [physical(src, {
      color: srgb(0x1a3fb0), emissive: srgb(0x2a63ff), emissiveIntensity: 0.25,
      metalness: 0.0, roughness: 0.08, clearcoat: 1.0, clearcoatRoughness: 0.03, ior: 1.58,
    }), 1.0];
  }
  if (/^lightbar_panel/.test(n)) return [physical(src, { metalness: 0, roughness: 0.25, clearcoat: 0.6, clearcoatRoughness: 0.1 }), 0.8];
  // ---- lamps: chrome reflector behind a clear lens
  if (/^headlight/.test(n)) return [physical(src, { metalness: 0.9, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.02 }), 1.0];
  if (/^(taillight|indicator|reflector)/.test(n)) return [physical(src, { metalness: 0.0, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.03 }), 0.9];
  // reversing lamp: a clear lens, lit only when backing up (models.js)
  if (/^reverse/.test(n)) return [physical(src, { metalness: 0.0, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0 }), 0.9];
  // ---- hot hatch details: red grille line, painted brake calipers, the dark void behind honeycomb grilles
  if (/^accent_red/.test(n)) return [physical(src, { metalness: 0, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 }), 0.9];
  if (/^caliper/.test(n)) return [physical(src, { metalness: 0, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.1 }), 0.6];
  if (/^grille_void/.test(n)) { const m = src.clone(); m.metalness = 0; m.roughness = 0.9; return [m, 0.15]; }
  // ---- livery vinyl: matt enough that reflections never wash the markings out
  if (/^(garda_|chevron_|stripe_|n_red|battenburg)/.test(n)) {
    const m = src.clone();
    m.metalness = 0; m.roughness = 0.55;
    return [m, 0.45];
  }
  // ---- rubber and plastics
  if (/^tyre/.test(n)) { const m = src.clone(); m.color = srgb(0x2b2b2b); m.metalness = 0; m.roughness = 0.9; return [m, 0.3]; }
  if (/^trim/.test(n)) { const m = src.clone(); m.color = srgb(0x26282a); m.metalness = 0; m.roughness = 0.62; return [m, 0.5]; }
  if (/^gloss_black/.test(n)) return [physical(src, { color: srgb(0x121314), metalness: 0, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 }), 1.0];
  // ---- metals
  if (/^rim_barrel/.test(n)) { const m = src.clone(); m.color = srgb(0x2c2e31); m.metalness = 0.8; m.roughness = 0.45; return [m, 0.7]; }
  if (/^(rim|rim_)/.test(n)) { const m = src.clone(); m.metalness = 1.0; m.roughness = 0.28; m.color = srgb(0xc9ccd0).multiply(src.color.clone().multiplyScalar(1.4)); return [m, 1.0]; }
  if (/^chrome/.test(n)) { const m = src.clone(); m.metalness = 1.0; m.roughness = 0.14; return [m, 1.0]; }
  if (/^brake_disc/.test(n)) { const m = src.clone(); m.metalness = 0.9; m.roughness = 0.4; return [m, 0.6]; }
  // plates and anything else: plain, lightly reflective
  const m = src.clone();
  return [m, 0.6];
}

// One tuned material per source material (meshes that shared a material in the file keep sharing it).
export function carMaterialCache() {
  const cache = new Map();
  return (src) => {
    if (!cache.has(src)) {
      const [m, k] = tune(src);
      cache.set(src, addReflections(m, k));
    }
    return cache.get(src);
  };
}
