// Reflection strength, separated from ambient light.
// scene.environmentIntensity sets the environment's *diffuse* contribution (kept low for directional depth).
// Materials opted in with addReflections() get their *specular* environment term rescaled so reflections reach
// the preset's `reflect` level: vehicles, window glass, water. Everything else keeps the plain (low) level.
export const reflectUniforms = { uReflect: { value: 1 } };

export function setReflectLevel(reflect, environmentIntensity) {
  reflectUniforms.uReflect.value = reflect / Math.max(0.01, environmentIntensity);
}

// strength: per-material factor (1 = the preset level). glassOnly: expression that limits it (building shader).
export function addReflections(material, strength = 1, glassExpr = null) {
  const prev = material.onBeforeCompile;
  const uStrength = { value: strength };
  material.onBeforeCompile = (sh, renderer) => {
    if (prev) prev.call(material, sh, renderer);
    sh.uniforms.uReflect = reflectUniforms.uReflect;
    sh.uniforms.uReflStrength = uStrength;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uReflect; uniform float uReflStrength;')
      .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
        #if defined( RE_IndirectSpecular )
          float reflK = uReflect * uReflStrength;
          ${glassExpr ? `reflK = mix(1.0, reflK, ${glassExpr});` : ''}
          radiance *= reflK;
          #ifdef USE_CLEARCOAT
            clearcoatRadiance *= reflK;
          #endif
        #endif`);
  };
  // three keys programs on onBeforeCompile's source text; the wrapper's text is identical for every material,
  // so key on the wrapped function instead (strength is a uniform, so equal base shaders can still share)
  const prevKey = prev ? prev.toString() : '';
  material.customProgramCacheKey = () => `${prevKey}|refl${glassExpr ? `G:${glassExpr}` : ''}`;
  material.needsUpdate = true;
  return material;
}
