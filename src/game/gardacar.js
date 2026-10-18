// Materials and live controls for the Blender-built Garda i40 (public/models/garda.glb).
// The body shell carries the livery atlas (painted by livery.js); everything else is plain PBR by material name.
// All controls only write existing uniforms / material fields, so calling them every frame allocates nothing.
import * as THREE from 'three';
import { addReflections } from '../render/reflect.js';
import { paintLivery } from './livery.js';

const texCache = new Map();
let aoImage = null;

function loadAO() {
  if (!aoImage) {
    aoImage = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null); // no AO is fine: the livery still paints
      img.src = `${import.meta.env.BASE_URL}models/garda_ao.png`;
    });
  }
  return aoImage;
}

export async function gardaTextures(atlas, guides, variant) {
  if (!texCache.has(variant)) {
    const ao = await loadAO();
    texCache.set(variant, paintLivery({ atlas, guides, ao, variant }));
  }
  return texCache.get(variant);
}

const phys = (o) => new THREE.MeshPhysicalMaterial(o);
const std = (o) => new THREE.MeshStandardMaterial(o);

// Returns (sourceMaterial) => tuned material, plus the handles the car's controls need.
export function gardaMaterials({ colour, props }) {
  const retro = { value: 0 };
  // ---- the painted shell: gloss white under a clear coat; the props map drives roughness per texel and a faint
  // retroreflective glow on the yellow / red / blue vinyl when lights shine on it at night
  const body = phys({
    color: 0xf4f5f2, map: colour, roughness: 0.35, metalness: 0, clearcoat: 1.0, clearcoatRoughness: 0.1, specularIntensity: 0.6,
  });
  body.onBeforeCompile = (sh) => {
    sh.uniforms.uProps = { value: props };
    sh.uniforms.uRetro = retro;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uProps; uniform float uRetro;')
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        vec4 gProps = texture2D(uProps, vMapUv);
        roughnessFactor = gProps.g;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * gProps.r * uRetro;`);
  };
  body.customProgramCacheKey = () => 'garda-body';
  addReflections(body, 1.0);

  const tail = phys({ color: 0x7a0b0b, emissive: 0xff1a10, emissiveIntensity: 0.5, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03 });
  const reverse = phys({ color: 0xd9dcdf, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03 });
  const headLamp = std({ color: 0xf2f4f6, emissive: 0xfff6e6, emissiveIntensity: 0.4, roughness: 0.2 });
  const flashL = std({ color: 0x0a2a9a, emissive: 0x1f5bff, emissiveIntensity: 0.3, roughness: 0.2 });
  const flashR = flashL.clone();
  const table = {
    body_paint: body,
    paint_white: addReflections(phys({ color: 0xf4f5f2, roughness: 0.35, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1, specularIntensity: 0.6 }), 1.0),
    trim: std({ color: 0x1b1c1e, roughness: 0.7, metalness: 0 }),
    gloss_black: addReflections(phys({ color: 0x0f1011, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 }), 1.0),
    chrome: addReflections(std({ color: 0xdfe3e7, metalness: 1, roughness: 0.12 }), 1.0),
    alu: addReflections(std({ color: 0xb9bdc2, metalness: 1, roughness: 0.3 }), 0.8),
    // tinted glass: dark, smooth, lightly metallic. Reflection is held back a little: the environment is a coarse
    // ring of block buildings, and at full strength its skyline reads as tears in the glass
    glass: addReflections(phys({ color: 0x0c1014, roughness: 0.05, metalness: 0.2, ior: 1.52, specularIntensity: 1 }), 0.95),
    tail_red: addReflections(tail, 0.9),
    tail_reverse: addReflections(reverse, 0.9),
    // Light silver reflector keeps the lamp readable without a large dark patch on the white bonnet.
    head_reflector: addReflections(std({ color: 0xaeb8c0, metalness: 0.55, roughness: 0.28 }), 0.65),
    head_lamp: headLamp,
    head_lens: addReflections(phys({ color: 0xeef3f6, roughness: 0.03, transparent: true, opacity: 0.18, depthWrite: false, clearcoat: 1, clearcoatRoughness: 0.02 }), 0.45),
    indicator: phys({ color: 0xc96a12, emissive: 0xff8a1c, emissiveIntensity: 0.2, roughness: 0.15, clearcoat: 1 }),
    plate: std({ map: colour, roughness: 0.4 }),
    tyre: std({ color: 0x242424, roughness: 0.9 }),
    rim: addReflections(std({ color: 0xc3c8cd, metalness: 1, roughness: 0.28 }), 1.0),
    rim_barrel: std({ color: 0x2c2e31, metalness: 0.8, roughness: 0.45 }),
    brake_disc: std({ color: 0x6b6e72, metalness: 0.9, roughness: 0.4 }),
    lightbar_base: std({ color: 0x141518, roughness: 0.5 }),
    lightbar_housing: addReflections(phys({ color: 0xeef3f8, roughness: 0.04, transparent: true, opacity: 0.22, depthWrite: false, clearcoat: 1, clearcoatRoughness: 0.02 }), 1.0),
    lightbar_L: flashL,
    lightbar_R: flashR,
    lightbar_panel: std({ map: colour, roughness: 0.35, emissive: 0xffffff, emissiveMap: colour, emissiveIntensity: 0.05 }),
  };
  const fallback = std({ color: 0x888888 });
  const get = (src) => table[src.name] || fallback;

  let lights = 0;
  const controls = {
    // 0 day .. 1 night: headlamps, tail lamps, and the vinyl's retroreflective return
    setLights(level) {
      lights = level;
      headLamp.emissiveIntensity = 0.4 + level * 4.5;
      tail.emissiveIntensity = 0.5 + level * 1.2;
      retro.value = level * 0.22;
    },
    setBrake(on) { tail.emissiveIntensity = on ? 4 + lights * 2 : 0.5 + lights * 1.2; },
    setReverse(on) { reverse.emissiveIntensity = on ? 3 : 0; },
    // light bar, grille and rear-screen flashers: left / right banks (0 = off, 1 = full flash)
    flash(l, r) {
      flashL.emissiveIntensity = 0.3 + l * 7;
      flashR.emissiveIntensity = 0.3 + r * 7;
    },
    lightbar: [flashL, flashR],
  };
  return { get, controls };
}
