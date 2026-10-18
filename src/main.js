// Kilcullen Drive: a gentle driving game for small people. Drive the Garda car from home at Carrighill, through
// Kilcullen and on past Kilashee to the edge of Naas. The car keeps itself on the road; hold GO to drive,
// pick a place to visit, and choose left or right at junctions if you like.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildWorld, inTown } from './world/world.js';
import { buildLandmarks } from './world/landmarks.js';
import { DESTINATIONS, SIGNS } from './world/places.js';
import world, { edges, nearest, poi, plan } from './game/graph.js';
import { RailCar } from './game/driver.js';
import { Traffic, followLimit, unstick, makeHatch } from './game/traffic.js';
import { Guide } from './game/guide.js';
import { Sound, say } from './game/audio.js';
import { loadCar } from './game/models.js';
import { UI, MiniMap, pathPoints } from './ui/ui.js';

const MOBILE = matchMedia('(pointer: coarse)').matches;
const VMAX = 19, VTOWN = 13; // m/s: about 70 km/h out the country, 45 km/h in town

// ---------------------------------------------------------------- renderer, scene, light
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !MOBILE, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 1.5 : 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
const SKY = new THREE.Color('#a9d4f5');
scene.fog = new THREE.Fog(SKY, 160, 950);
{
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#5ea8e6'); gr.addColorStop(0.55, '#a9d4f5'); gr.addColorStop(1, '#dcefff');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; scene.background = t;
}
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;
scene.add(new THREE.HemisphereLight(0xd6ecff, 0x5b7d3a, 1.25));
const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(MOBILE ? 1024 : 2048, MOBILE ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);
const SUN_DIR = new THREE.Vector3(-0.45, 0.8, 0.4).normalize();

const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 2500);
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 1 ? 72 : 58;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// fluffy clouds
{
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  for (let i = 0; i < 7; i++) { const x = 30 + Math.random() * 68, y = 50 + Math.random() * 30, r = 22 + Math.random() * 18; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  for (let i = 0; i < 40; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false, depthWrite: false, transparent: true, opacity: 0.9 }));
    const a = Math.random() * Math.PI * 2, d = 500 + Math.random() * 900;
    s.position.set(Math.cos(a) * d, 220 + Math.random() * 120, Math.sin(a) * d); s.scale.set(260, 130, 1);
    scene.add(s);
  }
}

// ---------------------------------------------------------------- world
const { waterTex, buildings } = buildWorld(scene);
const { badges, group: marks } = buildLandmarks(scene, buildings);
const traffic = new Traffic(scene, MOBILE ? 9 : 14);
const guide = new Guide(scene);
const ui = new UI();
const minimap = new MiniMap(ui.mapCanvas);
const sound = new Sound();

// target spot on the road for each destination
const DEST = new Map();
for (const d of DESTINATIONS) {
  let p = poi[d.poi]; if (!p) continue;
  if (d.id === 'gaa') {
    // aim for the pitch rather than the club's map pin
    const pitch = world.areas.filter((a) => a.sport === 'gaelic_games').map((a) => [a.pts.reduce((s, q) => s + q[0], 0) / a.pts.length, a.pts.reduce((s, q) => s + q[1], 0) / a.pts.length]).sort((u, v) => Math.hypot(u[0] - p[0], u[1] - p[1]) - Math.hypot(v[0] - p[0], v[1] - p[1]))[0];
    if (pitch) p = pitch;
  }
  const n = nearest(p[0], p[1], (e) => e.cls !== 'service' || d.id === 'kilashee' || d.id === 'gaa' || d.id === 'kidz');
  DEST.set(d.id, { d, spot: { e: n.e, s: n.s }, x: p[0], z: p[1] });
}

// ---------------------------------------------------------------- the player's car, starting at home
const home = DEST.get('home');
const startDir = (() => {
  // face the way out toward town
  const town = DEST.get('brew').spot;
  const a = plan(home.spot.e, 1, town), b = home.spot.e.oneway ? null : plan(home.spot.e, -1, town);
  const len = (st) => (st ? st.reduce((s, x) => s + x.e.len, 0) : Infinity);
  return len(a) + (home.spot.e.len - home.spot.s) <= len(b) + home.spot.s ? 1 : -1;
})();
const player = new RailCar(home.spot.e, startDir, startDir > 0 ? home.spot.s : home.spot.e.len - home.spot.s);
let carMesh = await loadCar('garda').catch(() => null);
if (!carMesh) carMesh = makeHatch(0xffffff);
scene.add(carMesh);
document.getElementById('loading').remove();

// ---------------------------------------------------------------- state
let goal = null;          // destination entry from DEST
let siren = false, camMode = 0, arriving = false, idle = 0;
const announced = new Map();
ui.setStars(0);
guide.stars.onCollect = (n) => { ui.setStars(n, true); sound.star(); };

function pick(d) {
  ui.hidePicker();
  arriving = false;
  if (!d) {
    goal = null; player.setTarget(null); ui.setGoal(null);
    say("Let's go for a drive! Hold the green button.", sound);
    return;
  }
  goal = DEST.get(d.id);
  player.setTarget(goal.spot);
  ui.setGoal(d);
  say(`Let's drive to ${d.say}! Hold the green button to go.`, sound);
  for (const b of badges) b.material.opacity = 1;
}
ui.on('pick', pick);
ui.on('wake', () => { sound.start(); idle = 0; });
ui.on('left', () => { if (player.steer(-1)) sound.tick(); });
ui.on('right', () => { if (player.steer(1)) sound.tick(); });
ui.on('horn', () => sound.horn());
ui.on('siren', () => { siren = !siren; sound.sirenOn = siren; ui.setTool('sirenBtn', siren); });
ui.on('camera', () => { camMode = (camMode + 1) % 3; });
ui.on('sound', () => { sound.setOn(!sound.on); ui.soundBtn.textContent = sound.on ? '🔊' : '🔇'; });
ui.showPicker(true);

// the places to call out as we pass: every signed place and the destinations
const CALLOUTS = [];
for (const [name, s] of Object.entries(SIGNS)) if (poi[name] && name !== 'Home') CALLOUTS.push({ name: s.text, x: poi[name][0], z: poi[name][1], key: name });
for (const d of DESTINATIONS) if (poi[d.poi] && !SIGNS[d.poi]) CALLOUTS.push({ name: d.label, x: poi[d.poi][0], z: poi[d.poi][1], key: d.poi });

// ---------------------------------------------------------------- loop
const clock = new THREE.Timer(); clock.connect?.(document);
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
let first = true, mapT = 0, time = 0, wasOnBridge = false;

function frame() {
  requestAnimationFrame(frame);
  clock.update();
  step(Math.min(0.05, clock.getDelta()));
  renderer.render(scene, camera);
}

function step(dt) {
  time += dt;

  // ---- drive
  const pickerOpen = !ui.picker.hidden || !ui.party.hidden;
  const throttle = !pickerOpen && ui.input.go && !arriving ? 1 : 0;
  const brake = ui.input.stop || arriving ? 1 : 0;
  const limit = unstick(player, followLimit(player, [player, ...traffic.cars]), dt);
  player.update(dt, { throttle, brake, vmax: inTown(player.vis.x, player.vis.z, -80) ? VTOWN : VMAX, limit });
  traffic.update(dt, player);

  // ---- car model
  carMesh.position.set(player.vis.x, 0, player.vis.z);
  carMesh.rotation.y = player.vis.h;
  if (carMesh.userData.update) carMesh.userData.update(player.v, dt, player.steerVis || 0);
  if (carMesh.userData.setBrake) carMesh.userData.setBrake(brake > 0 && player.v > 0.3);
  if (carMesh.userData.flash) {
    const ph = (time * 2.6) % 1;
    carMesh.userData.flash(siren && ph < 0.5 ? 1 : 0, siren && ph >= 0.5 ? 1 : 0);
  }
  // traffic pulls in a little and slows when the siren is on
  for (const c of traffic.cars) c.vmax = siren ? Math.min(c.vmax, 6) : (c.kind === 'tractor' ? 7 : Math.max(c.vmax, 9));

  // ---- guidance and arrival
  guide.update(dt, player, !!goal);
  const opts = player.opts.length;
  const i = player.opts.indexOf(player.next);
  ui.setTurnHint(opts > 1 && i > 0, opts > 1 && i < opts - 1, opts > 1 && player.remaining() < 50);
  if (goal && !arriving && player.atTarget(12)) arrive();
  idle = player.v < 0.2 && !pickerOpen ? idle + dt : 0;
  ui.setGoWiggle(idle > 2.5 && !pickerOpen);
  ui.setSpeed(player.v * 3.6);

  // ---- callouts as we pass places
  for (const c of CALLOUTS) {
    const d = Math.hypot(c.x - player.vis.x, c.z - player.vis.z);
    if (d < 28 && player.v > 1 && time - (announced.get(c.key) || -999) > 90) {
      announced.set(c.key, time);
      ui.toast(`👀 ${c.name}`);
      break;
    }
  }
  const onBridge = !!player.e.bridge && player.e.name === 'Kilcullen Bridge';
  if (onBridge && !wasOnBridge && time - (announced.get('bridge') || -999) > 60) { announced.set('bridge', time); ui.toast('🌊 Over the River Liffey!'); if (!goal || goal.d.id !== 'brew') say('Over the River Liffey!', sound); }
  wasOnBridge = onBridge;

  // ---- badges bob; the destination's badge is big and shows through the fog
  for (const b of badges) {
    const isGoal = goal && b.userData.id === goal.d.id;
    b.position.y = b.userData.base + Math.sin(time * 2 + b.userData.base) * 0.6;
    const s = isGoal ? 1.5 : 1;
    b.scale.set(8 * s, 10 * s, 1);
    b.material.fog = !isGoal;
    // hide when right on top of it so it doesn't fill the screen
    const d = Math.min(Math.hypot(b.position.x - player.vis.x, b.position.z - player.vis.z), b.position.distanceTo(camera.position));
    b.material.opacity = d < 22 ? Math.max(0, (d - 10) / 12) : 1;
    b.visible = b.material.opacity > 0.02;
  }
  if (marks.userData.heart) marks.userData.heart.rotation.y += dt * 1.2;
  waterTex.offset.y -= dt * 0.03;

  // ---- camera: behind and above, a bit further back on a phone held upright
  const fx = Math.sin(player.vis.h), fz = Math.cos(player.vis.h);
  const portrait = camera.aspect < 1;
  const [back, up, ahead] = camMode === 0 ? [portrait ? 13 : 10.5, portrait ? 6 : 4.6, 6] : camMode === 1 ? [26, 17, 10] : [3, 55, 0.1];
  const want = new THREE.Vector3(player.vis.x - fx * back, up, player.vis.z - fz * back);
  const look = new THREE.Vector3(player.vis.x + fx * ahead, camMode === 2 ? 0 : 1.4, player.vis.z + fz * ahead);
  const k = first ? 1 : 1 - Math.exp(-dt * 4);
  camPos.lerp(want, k); camLook.lerp(look, k); first = false;
  camera.position.copy(camPos); camera.lookAt(camLook);

  // sun shadow box follows the car
  sun.target.position.set(player.vis.x, 0, player.vis.z);
  sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 200);

  // ---- mini map, goal distance and sound at a calmer pace
  mapT -= dt;
  if (mapT <= 0 && !simming) {
    mapT = 0.1;
    const path = goal ? pathPoints(player) : null;
    const pins = [];
    for (const [id, g] of DEST) if (!goal || goal.d.id === id) pins.push({ x: g.x, z: g.z, emoji: g.d.emoji });
    minimap.draw(player, path, pins);
    if (goal) {
      let len = 0; for (let j = 1; j < (path ? path.length : 0); j++) len += Math.hypot(path[j][0] - path[j - 1][0], path[j][1] - path[j - 1][1]);
      ui.setGoal(goal.d, len);
    }
  }
  sound.update(player.v, VMAX, throttle);
}

async function arrive() {
  arriving = true;
  const d = goal.d;
  sound.fanfare();
  say(`Hooray! We're at ${d.say}!`, sound);
  for (let j = 0; j < 5; j++) setTimeout(() => { guide.stars.count++; ui.setStars(guide.stars.count, true); sound.star(); }, 400 + j * 250);
  await ui.celebrate(d);
  goal = null; player.setTarget(null); ui.setGoal(null);
  arriving = false;
  ui.showPicker();
}

// handy for testing from the console
// kd.sim(seconds, {go}) runs the game faster than real time (for testing on slow machines)
let simming = false;
const sim = (sec, inp = { go: true }) => { simming = true; Object.assign(ui.input, inp); for (let t = 0; t < sec; t += 1 / 30) step(1 / 30); Object.assign(ui.input, { go: false, stop: false }); simming = false; return { x: player.vis.x, z: player.vis.z, v: player.v, e: player.e.i, name: player.e.name, ref: player.e.ref }; };
const teleport = (id, back = 40, dir = 1) => {
  const g = DEST.get(id); player.e = g.spot.e; player.dir = g.spot.e.oneway ? 1 : dir;
  const sa = g.spot.s; player.s = player.dir > 0 ? Math.max(0, sa - back) : Math.max(0, g.spot.e.len - sa - back);
  player.v = 0; player.choose(); const q = player.railPoint(0);
  Object.assign(player.vis, { x: q.x, z: q.z, h: Math.atan2(q.dx, q.dz) }); first = true; ui.hidePicker();
};
window.kd = { get arriving() { return arriving; }, sim, teleport, cam: (m) => { camMode = m; first = true; }, player, traffic, pick: (id) => pick(DESTINATIONS.find((d) => d.id === id) || null), ui, scene, camera, DEST };
console.log(`Kilcullen Drive ready: ${edges.length} roads, ${inTown(player.vis.x, player.vis.z) ? 'starting in town' : 'starting at home'}`);
frame();
