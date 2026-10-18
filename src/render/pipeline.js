// Render pipeline (after Dublin Drive's):
//  high:   4x MSAA HDR scene -> gentle bloom -> tone map -> grade (contrast, saturation, vignette, a little grain)
//  medium: HDR scene -> tone map -> grade -> FXAA
//  low:    plain forward render with tone mapping (phones)
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVignette: { value: 0.26 }, uSat: { value: 0.93 },
    uContrast: { value: 1.06 }, uTint: { value: new THREE.Vector3(1.0, 1.0, 1.01) }, uGrain: { value: 0.02 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uVignette, uSat, uContrast, uGrain; uniform vec3 uTint;
    varying vec2 vUv;
    float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime) * 43758.5453); }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      c = (c - 0.5) * uContrast + 0.5;
      c *= uTint;
      vec2 d = vUv - 0.5;
      c *= 1.0 - uVignette * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
      c += (h(vUv * 1000.0) - 0.5) * uGrain;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

export function createPipeline(renderer, scene, camera, quality) {
  if (quality === 'low') return { render() { renderer.render(scene, camera); }, setSize() {} };
  const size = new THREE.Vector2(); renderer.getSize(size);
  const pr = renderer.getPixelRatio();
  const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: quality === 'high' ? 4 : 0 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  if (quality === 'high') composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.1, 0.45, 0.93));
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader); composer.addPass(grade);
  let fxaa = null;
  if (quality === 'medium') { fxaa = new ShaderPass(FXAAShader); composer.addPass(fxaa); }
  const updFxaa = () => { if (!fxaa) return; renderer.getSize(size); const p = renderer.getPixelRatio(); fxaa.material.uniforms.resolution.value.set(1 / (size.x * p), 1 / (size.y * p)); };
  updFxaa();
  return {
    render(dt) { grade.uniforms.uTime.value = (grade.uniforms.uTime.value + dt) % 100; composer.render(dt); },
    setSize(w, h) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); updFxaa(); },
  };
}
