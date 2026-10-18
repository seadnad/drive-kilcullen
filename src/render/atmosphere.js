// Sky, light and haze for a bright Kildare day, adapted from Dublin Drive's atmosphere:
//  * a sky dome with a gradient, drifting cloud layer, sun disc and a hazy horizon that matches the fog
//  * the sun (key light, soft shadows over the area ahead of the camera), a cool fill from the other side, and
//    sky / ground bounce from a hemisphere light
//  * image-based light from the same sky over a green countryside, so paint and glass reflect sky and fields
//  * fog by real distance that thins with height and brightens toward the sun
//  * shadows fade out at the edge of the shadowed area instead of stopping at a hard line
import * as THREE from 'three';
import { setReflectLevel } from './reflect.js';

// ---------------------------------------------------------------- shader chunk patches (apply to every material)
{
  const k = THREE.ShaderChunk.shadowmap_pars_fragment, at = k.indexOf('#if defined( SHADOWMAP_TYPE_PCF )');
  const ret = 'return mix( 1.0, shadow, shadowIntensity );', r = k.indexOf(ret, at);
  if (at >= 0 && r > at) {
    THREE.ShaderChunk.shadowmap_pars_fragment = k.slice(0, r)
      + 'vec2 shEdge = abs( shadowCoord.xy - 0.5 ) * 2.0;\n\t\t\treturn mix( 1.0, shadow, shadowIntensity * ( 1.0 - smoothstep( 0.82, 1.0, max( shEdge.x, shEdge.y ) ) ) );'
      + k.slice(r + ret.length);
  }
}
const FOG_HEIGHT = 60.0;
THREE.ShaderChunk.fog_pars_vertex = `
#ifdef USE_FOG
  varying float vFogDepth; varying vec3 vFogView; varying float vFogY;
#endif`;
THREE.ShaderChunk.fog_vertex = `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogView = mvPosition.xyz;
  vFogY = cameraPosition.y + ( vec4( mvPosition.xyz, 0.0 ) * viewMatrix ).y;
#endif`;
THREE.ShaderChunk.fog_pars_fragment = `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth; varying vec3 vFogView; varying float vFogY;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear; uniform float fogFar;
  #endif
#endif`;
THREE.ShaderChunk.fog_fragment = `
#ifdef USE_FOG
  float fogDist = length( vFogView );
  #ifdef FOG_EXP2
    float fogH = max( 0.0, 0.5 * ( vFogY + cameraPosition.y ) );
    float fogD = fogDensity * mix( 1.0, exp( - fogH / ${FOG_HEIGHT.toFixed(1)} ), 0.7 );
    float fogX = fogD * fogDist;
    float fogFactor = 1.0 - exp( - fogX * fogX );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, fogDist );
  #endif
  vec3 fogCol = fogColor;
  #if ( defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG ) ) && NUM_DIR_LIGHTS > 0
    float fogSun = max( dot( vFogView / max( fogDist, 1e-3 ), directionalLights[ 0 ].direction ), 0.0 );
    fogCol += directionalLights[ 0 ].color * ( 0.045 * pow( fogSun, 4.0 ) + 0.09 * pow( fogSun, 24.0 ) );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogCol, fogFactor );
#endif`;

// ---------------------------------------------------------------- tileable fbm noise (also used by the ground)
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function tileNoise(size, cells, rand) {
  const grid = []; for (let i = 0; i < cells * cells; i++) grid.push(rand());
  const g = (i, j) => grid[((j + cells) % cells) * cells + ((i + cells) % cells)];
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = (x / size) * cells, fy = (y / size) * cells, i = Math.floor(fx), j = Math.floor(fy);
    let tx = fx - i, ty = fy - j; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const a = g(i, j), b = g(i + 1, j), c = g(i, j + 1), d = g(i + 1, j + 1);
    out[y * size + x] = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  }
  return out;
}
export function fbm(size, octaves = 4, seed = 7) {
  const rand = rng(seed), acc = new Float32Array(size * size);
  let amp = 0.5, cells = 4, total = 0;
  for (let o = 0; o < octaves; o++) { const n = tileNoise(size, cells, rand); for (let i = 0; i < acc.length; i++) acc[i] += n[i] * amp; total += amp; amp *= 0.5; cells *= 2; }
  for (let i = 0; i < acc.length; i++) acc[i] /= total;
  return acc;
}
export const noiseTexture = (() => {
  const a = fbm(256, 5, 301), b = fbm(256, 3, 302);
  const data = new Uint8Array(256 * 256 * 4);
  for (let i = 0; i < a.length; i++) { data[i * 4] = a[i] * 255; data[i * 4 + 1] = b[i] * 255; data[i * 4 + 2] = 128; data[i * 4 + 3] = 255; }
  const t = new THREE.DataTexture(data, 256, 256);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
})();

// ---------------------------------------------------------------- sky
const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const skyFrag = /* glsl */ `
uniform vec3 top; uniform vec3 horizon; uniform vec3 cloudA; uniform vec3 cloudB;
uniform float cover; uniform float time;
uniform vec3 uFog; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uSunDisc;
uniform sampler2D uClouds;
varying vec3 vDir;
float fbm2(vec2 p, float t){ return texture2D(uClouds, p * 0.23 + vec2(t * 0.0021, t * 0.0007)).r * 0.65 + texture2D(uClouds, p * 0.61 - vec2(t * 0.0011, t * 0.0019)).g * 0.35; }
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(horizon, top, pow(h, 0.55));
  vec2 uv = d.xz / max(d.y + 0.08, 0.02);
  float c = fbm2(uv, time);
  c = smoothstep(0.55 - cover * 0.45, 0.95, c);
  vec3 cc = mix(cloudA, cloudB, smoothstep(0.3, 0.9, texture2D(uClouds, uv * 0.5 + 0.3).g));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunCol * (uSunDisc * smoothstep(0.9993, 0.9997, sd) + 0.25 * uSunDisc * pow(sd, 200.0));
  col = mix(col, cc * (1.0 + 0.35 * pow(sd, 8.0)), c * smoothstep(0.0, 0.12, d.y));
  vec3 haze = uFog + uSunCol * (0.045 * pow(sd, 4.0) + 0.09 * pow(sd, 24.0));
  col = mix(col, haze, smoothstep(0.14, 0.0, d.y));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// A bright, broken-cloud Irish day; the afternoon sun is in the south-west (x east, y up, z south).
const DAY = {
  top: 0x4a82c4, horizon: 0xcfdbe4, cloudA: 0xf8f7f2, cloudB: 0xa3aeb8, cover: 0.38,
  fog: 0xc3cfd6, fogDensity: 0.0021, sunDisc: 0.5, hemiSky: 0xbcd2e8, hemiGround: 0x6d7a4c, hemi: 0.7,
  sun: 0xfff0d8, sunI: 3.1, sunDir: [-0.55, 0.6, 0.58], fill: 0xa3bad2, fillI: 0.42,
  exposure: 0.95, env: 0.32, reflect: 1.0,
};

export function createAtmosphere(scene, renderer, { lite = false } = {}) {
  const p = DAY;
  const uniforms = {
    top: { value: new THREE.Color(p.top) }, horizon: { value: new THREE.Color(p.horizon) },
    cloudA: { value: new THREE.Color(p.cloudA) }, cloudB: { value: new THREE.Color(p.cloudB) },
    cover: { value: p.cover }, time: { value: 0 }, uClouds: { value: noiseTexture },
    uFog: { value: new THREE.Color(p.fog) }, uSunDir: { value: new THREE.Vector3(...p.sunDir).normalize() },
    uSunCol: { value: new THREE.Color(p.sun).multiplyScalar(p.sunI) }, uSunDisc: { value: p.sunDisc },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), new THREE.ShaderMaterial({ vertexShader: skyVert, fragmentShader: skyFrag, uniforms, side: THREE.BackSide, depthWrite: false, fog: false }));
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(p.hemiSky, p.hemiGround, p.hemi);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(p.sun, p.sunI);
  sun.castShadow = true;
  const S = lite ? 1536 : 2048, EXT = lite ? 45 : 60, texel = (2 * EXT) / S;
  sun.shadow.mapSize.set(S, S);
  Object.assign(sun.shadow.camera, { left: -EXT, right: EXT, top: EXT, bottom: -EXT, near: 40, far: 420 });
  sun.shadow.bias = -0.00025; sun.shadow.normalBias = texel * 1.4; sun.shadow.radius = 2.2;
  scene.add(sun, sun.target);
  const sunDir = new THREE.Vector3(...p.sunDir).normalize();
  const fill = new THREE.DirectionalLight(p.fill, p.fillI);
  scene.add(fill, fill.target);
  const fillDir = new THREE.Vector3(-sunDir.x, 0.35, -sunDir.z).normalize();

  scene.fog = new THREE.FogExp2(p.fog, p.fogDensity * (lite ? 1.25 : 1));
  renderer.toneMappingExposure = p.exposure;
  renderer.setClearColor(p.fog);

  // image-based light: the sky over green fields with a ring of dark hedgerow and trees at the horizon
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = sky.clone(); envSky.material = sky.material; envScene.add(envSky);
  const envGround = new THREE.Mesh(new THREE.CircleGeometry(95, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3f5a2c }));
  envGround.position.y = -1.2; envScene.add(envGround);
  const r = rng(9);
  for (let a = 0; a < Math.PI * 2; a += 0.18 + r() * 0.1) {
    const h = 3 + r() * 9, g = new THREE.SphereGeometry(4 + r() * 5, 8, 6).scale(1, h / 6, 1);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(0.27, 0.35, 0.12 + r() * 0.08) }));
    m.position.set(Math.cos(a) * 60, h / 2 - 1, Math.sin(a) * 60); envScene.add(m);
  }
  const envRT = pmrem.fromScene(envScene, 0.02, 0.1, 200);
  scene.environment = envRT.texture;
  scene.environmentIntensity = p.env;
  setReflectLevel(p.reflect, p.env);

  const centre = new THREE.Vector3(), lu = new THREE.Vector3(), lv = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  return {
    sun, fill, hemi, sky, sunDir,
    // focus: the car; view: the camera's horizontal direction (the shadowed square sits ahead of the car)
    update(time, focus, view) {
      uniforms.time.value = time;
      sky.position.copy(focus);
      const ahead = EXT * 0.55;
      centre.set(focus.x + view.x * ahead, 0, focus.z + view.z * ahead);
      // snap to whole shadow texels in the light's image plane so shadow edges don't shimmer as the car moves
      lu.crossVectors(UP, sunDir).normalize(); lv.crossVectors(sunDir, lu);
      const su = Math.round(centre.dot(lu) / texel) * texel, sv = Math.round(centre.dot(lv) / texel) * texel, sd = centre.dot(sunDir);
      centre.copy(lu).multiplyScalar(su).addScaledVector(lv, sv).addScaledVector(sunDir, sd);
      sun.position.copy(centre).addScaledVector(sunDir, 250);
      sun.target.position.copy(centre);
      fill.position.set(focus.x + fillDir.x * 100, fillDir.y * 100, focus.z + fillDir.z * 100);
      fill.target.position.set(focus.x, 0, focus.z);
    },
  };
}
