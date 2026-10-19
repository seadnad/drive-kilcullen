// Kilcullen Drive: a gentle driving game for small people. Drive the Garda car from home in Carrighill Lower, out
// along the L8007 and the R418 into Kilcullen, and on past Kilashee to the edge of Naas. Steer with the arrows,
// GO to drive; the car is forgiving (it stays out of the hedges and helps follow the road).
import * as THREE from 'three';
import { createAtmosphere } from './render/atmosphere.js';
import { createPipeline } from './render/pipeline.js';
import { createContactShadows } from './render/contact.js';
import { buildWorld, inTown } from './world/world.js';
import { buildEstate, home, groundY } from './world/estate.js';
import { buildLandmarks, shops } from './world/landmarks.js';
import { DESTINATIONS, SIGNS } from './world/places.js';
import world, { edges, nodes, nearest, poi, plan, sample, endNode } from './game/graph.js';
import { Car, CAR_PARAMS } from './game/car.js';
import { Traffic, makeHatch, dimLamps } from './game/traffic.js';
import { Guide } from './game/guide.js';
import { Sound } from './game/audio.js';
import { loadCar } from './game/models.js';
import { roadGrid, inEstate } from './world/common.js';
import { UI, MiniMap } from './ui/ui.js';

const MOBILE = matchMedia('(pointer: coarse)').matches;

// ---------------------------------------------------------------- renderer, scene, light
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !MOBILE, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 1.5 : 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
const atmo = createAtmosphere(scene, renderer, { lite: MOBILE });

const camera = new THREE.PerspectiveCamera(60, 1, 0.3, 2500);
const pipeline = createPipeline(renderer, scene, camera, MOBILE ? 'low' : 'high');
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  pipeline.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 1 ? 72 : 58;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ---------------------------------------------------------------- world
const { waterTex, buildings } = buildWorld(scene);
buildEstate(scene);
const { badges } = buildLandmarks(scene, buildings);
const traffic = new Traffic(scene, MOBILE ? 8 : 12);
const guide = new Guide(scene);
const contact = createContactShadows(scene, 32);
const ui = new UI();
const minimap = new MiniMap(ui.mapCanvas);
const sound = new Sound();

// where each destination is: a point to reach, and the spot on the road network the route planner aims for
const DEST = new Map();
for (const d of DESTINATIONS) {
  let p = poi[d.poi]; if (!p) continue;
  if (d.id === 'gaa') {
    // aim for the pitch rather than the club's map pin
    const pitch = world.areas.filter((a) => a.sport === 'gaelic_games').map((a) => [a.pts.reduce((s, q) => s + q[0], 0) / a.pts.length, a.pts.reduce((s, q) => s + q[1], 0) / a.pts.length]).sort((u, v) => Math.hypot(u[0] - p[0], u[1] - p[1]) - Math.hypot(v[0] - p[0], v[1] - p[1]))[0];
    if (pitch) p = pitch;
  }
  if (d.id === 'home' && home) p = home.roadPt;
  const n = nearest(p[0], p[1], (e) => e.cls !== 'service' || d.id === 'kilashee' || d.id === 'gaa' || d.id === 'kidz');
  const at = sample(n.e, 1, n.s);
  const goalPt = d.id === 'home' && home ? home.target : [at.x, at.z];
  DEST.set(d.id, { d, spot: { e: n.e, s: n.s }, x: goalPt[0], z: goalPt[1], radius: d.id === 'home' ? 6 : 13, badge: poi[d.poi] });
}

// ---------------------------------------------------------------- the player's car, starting on our drive
const start = home ? home.start : { p: poi['Estate Entrance'], h: 0 };
const car = new Car(start.p[0], start.p[1], start.h);
car.groundY = groundY;
car.extraRoads = home ? home.driveways : [];
car.y = groundY(car.pos.x, car.pos.z);
// what the traffic sees of the player
const me = { vis: { x: car.pos.x, z: car.pos.z, h: car.heading }, v: 0 };
// the family cars parked on the gravel at home
const parked = home ? home.parked.map((p) => ({ vis: { x: p.x, z: p.z, h: p.h }, ...p })) : [];
car.dynamic = (x, z, r) => {
  let px = 0, pz = 0, hit = false;
  for (const c of [...traffic.cars, ...parked]) {
    const dx = x - c.vis.x, dz = z - c.vis.z, d = Math.hypot(dx, dz);
    if (d < r + 1.2 && d > 0.01) { const k = (r + 1.2 - d); px += (dx / d) * k; pz += (dz / d) * k; hit = true; }
  }
  return hit ? { x: px, z: pz } : null;
};
// which way the route goes from here (a point ~15 m along it), for the car's verge handling
const ENTRANCE = poi['Estate Entrance'];
car.prefer = () => {
  // no destination: in the estate, the way out of it
  if (!route || route.pts.length < 3) return !goal && ENTRANCE && inEstate(car.pos.x, car.pos.z, 30) ? { x: ENTRANCE[0] - car.pos.x, z: ENTRANCE[1] - car.pos.z } : null;
  let acc = 0;
  for (let k = 1; k < route.pts.length; k++) {
    acc += Math.hypot(route.pts[k][0] - route.pts[k - 1][0], route.pts[k][1] - route.pts[k - 1][1]);
    if (acc > 15) return { x: route.pts[k][0] - car.pos.x, z: route.pts[k][1] - car.pos.z };
  }
  return null;
};
let carMesh = await loadCar('garda').catch(() => null);
if (!carMesh) carMesh = makeHatch(0xffffff);
scene.add(carMesh);
for (const [i, p] of parked.entries()) {
  const m = (await loadCar(i ? 'coupe' : 'hatch').catch(() => null)) || makeHatch(p.colour);
  if (m.userData.setPaint) m.userData.setPaint({ color: p.colour, metal: 0.45, rough: 0.3 });
  dimLamps(m, 0);
  m.position.set(p.x, groundY(p.x, p.z), p.z); m.rotation.y = p.h; scene.add(m);
}
traffic.upgrade();
document.getElementById('loading').remove();

// ---------------------------------------------------------------- state
let goal = null;          // destination entry from DEST
let siren = false, camMode = 0, arriving = false, idle = 0;
const announced = new Map();

function pick(d) {
  ui.hidePicker();
  arriving = false;
  goal = d ? DEST.get(d.id) : null;
  ui.setGoal(d || null);
  route = null; routeT = 0;
}
ui.on('pick', pick);
ui.on('wake', () => { sound.start(); idle = 0; });
ui.on('horn', () => sound.horn());
ui.on('siren', () => { siren = !siren; sound.sirenOn = siren; ui.setTool('sirenBtn', siren); });
ui.on('camera', () => { camMode = (camMode + 1) % 3; });
ui.on('sound', () => { sound.setOn(!sound.on); ui.soundBtn.textContent = sound.on ? '🔊' : '🔇'; });
ui.on('reset', resetToRoad);
ui.showPicker(true);

// put the car back in the middle of the nearest road, pointing the way it was going
function resetToRoad() {
  const r = car.road(car.pos.x, car.pos.z); if (!r) return;
  let dx = r.dx, dz = r.dz;
  if (dx * Math.sin(car.heading) + dz * Math.cos(car.heading) < 0) { dx = -dx; dz = -dz; }
  const lane = r.lanes >= 2 && !r.oneway ? r.half / 2 : 0;
  car.teleport(r.x + dz * lane, r.z - dx * lane, Math.atan2(dx, dz));
}

// the places to call out as we pass: every signed place and the destinations
const CALLOUTS = [];
for (const [name, s] of Object.entries(SIGNS)) if (poi[name]) CALLOUTS.push({ name: s.text, x: poi[name][0], z: poi[name][1], key: name });
for (const d of DESTINATIONS) if (poi[d.poi] && !SIGNS[d.poi] && d.id !== 'home') CALLOUTS.push({ name: d.label, x: poi[d.poi][0], z: poi[d.poi][1], key: d.poi });

// ---------------------------------------------------------------- route to the destination
// Every so often: find the road we're on and which way we're facing along it, plan the way from there, and lay it
// out as a list of points for the chevrons, plus the next junction's turn for the big arrow.
let route = null, routeT = 0;
function planRoute() {
  if (!goal) return null;
  const n = nearest(car.pos.x, car.pos.z);
  if (!n || n.dist > 30) return null;
  const e = n.e, fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  const tan = sample(e, 1, n.s);
  let dir = tan.dx * fx + tan.dz * fz >= 0 ? 1 : -1;
  if (e.oneway) dir = 1;
  const sDir = (s) => (dir > 0 ? s : e.len - s);
  const pts = [[car.pos.x, car.pos.z, car.y]];
  const push = (ed, d, s0, s1) => { for (let s = s0; s < s1; s += 5) { const q = sample(ed, d, s); pts.push([q.x + q.dz * lane(ed), q.z - q.dx * lane(ed)]); } const q = sample(ed, d, s1); pts.push([q.x + q.dz * lane(ed), q.z - q.dx * lane(ed)]); };
  const T = goal.spot;
  let turn = null;
  // the goal is just ahead on this very road
  if (T.e === e && sDir(T.s) >= sDir(n.s) - 2) push(e, dir, sDir(n.s), sDir(T.s));
  else {
    const steps = plan(e, dir, T);
    if (!steps) return null;
    push(e, dir, sDir(n.s), e.len);
    // the first junction's turn, if it is a real junction (more than one way on)
    const node = endNode(e, dir);
    const first = steps[0];
    if (first && node.deg >= 3 && first.e !== e) {
      const a = sample(first.e, first.dir, 0), b = sample(first.e, first.dir, Math.min(first.e.len, 12));
      const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      turn = { x: node.x, z: node.z, dx: (b.x - a.x) / l, dz: (b.z - a.z) / l, dist: Math.hypot(node.x - car.pos.x, node.z - car.pos.z) };
      // which way is that from where we're heading?
      const cross = fx * turn.dz - fz * turn.dx;
      turn.side = Math.abs(cross) < 0.35 ? 0 : cross < 0 ? -1 : 1;
    }
    let total = 0;
    for (const st of steps) {
      const last = st.e === T.e && st === steps[steps.length - 1];
      const end = last ? (st.dir > 0 ? T.s : st.e.len - T.s) : st.e.len;
      push(st.e, st.dir, 0, end);
      total += end; if (total > 400) break;
    }
  }
  if (goal.d.id === 'home' && home) { pts.push(home.world(home.drive.s, home.plot.tMax + 1)); pts.push([goal.x, goal.z]); }
  return { pts, turn };
}
const lane = (e) => (e.oneway || e.lanes < 2 || e.w < 5.5 ? 0 : e.w / 4);

// ---------------------------------------------------------------- loop
const clock = new THREE.Timer(); clock.connect?.(document);
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
let first = true, mapT = 0, time = 0, wasOnBridge = false, camHeading = car.heading;
// at the start the camera looks at the house from the road; it swings in behind the car once it moves
let intro = !!home;
let viewOverride = null; // testing: a fixed camera [x, y, z, lookX, lookY, lookZ]

function frame() {
  requestAnimationFrame(frame);
  clock.update();
  const dt = Math.min(0.05, clock.getDelta());
  step(dt);
  pipeline.render(dt);
}

function step(dt) {
  time += dt;
  const pickerOpen = !ui.picker.hidden || !ui.party.hidden;

  // ---- drive
  if (!simming) ui.pollPad(dt);
  const pad = ui.pad || { steer: 0, go: 0, stop: 0 };
  const input = {
    throttle: !pickerOpen && !arriving ? Math.max(ui.input.go ? 1 : 0, pad.go) : 0,
    brake: arriving ? 1 : Math.max(ui.input.stop ? 1 : 0, pad.stop),
    steer: pickerOpen ? 0 : (ui.input.right ? 1 : 0) - (ui.input.left ? 1 : 0) || pad.steer,
  };
  car.update(dt, input);
  me.vis.x = car.pos.x; me.vis.z = car.pos.z; me.vis.h = car.heading; me.v = Math.max(0, car.speed);
  traffic.update(dt, me);

  // ---- car model
  carMesh.position.set(car.pos.x, car.y + car.bump * 0.05, car.pos.z);
  carMesh.rotation.set(0, car.heading, 0);
  // tilt on the slope of the drive
  const ahead = groundY(car.pos.x + Math.sin(car.heading) * 1.4, car.pos.z + Math.cos(car.heading) * 1.4) - groundY(car.pos.x - Math.sin(car.heading) * 1.4, car.pos.z - Math.cos(car.heading) * 1.4);
  carMesh.rotateX(-Math.atan2(ahead, 2.8));
  if (carMesh.userData.update) carMesh.userData.update(car.speed, dt, -car.steer * 0.5);
  if (carMesh.userData.setBrake) carMesh.userData.setBrake(input.brake > 0 && car.speed > 0.3);
  if (carMesh.userData.setReverse) carMesh.userData.setReverse(car.speed < -0.3);
  if (carMesh.userData.flash) {
    const ph = (time * 2.6) % 1;
    carMesh.userData.flash(siren && ph < 0.5 ? 1 : 0, siren && ph >= 0.5 ? 1 : 0);
  }
  // traffic slows right down when the siren is on
  for (const c of traffic.cars) c.vmax = siren ? Math.min(c.vmax, 6) : (c.kind === 'tractor' ? 7 : Math.max(c.vmax, 9));

  // ---- the way to go
  routeT -= dt;
  if (routeT <= 0) { route = planRoute(); routeT = 0.3; }
  guide.update(dt, route ? route.pts : null, route && route.turn && route.turn.dist < 60 ? route.turn : null);
  ui.setTurnHint(route && route.turn && route.turn.dist < 45 ? route.turn.side : 0);
  if (goal && !arriving && Math.hypot(goal.x - car.pos.x, goal.z - car.pos.z) < goal.radius) arrive();
  idle = Math.abs(car.speed) < 0.2 && !pickerOpen ? idle + dt : 0;
  ui.setGoWiggle(idle > 3 && !pickerOpen);
  ui.setSpeed(Math.abs(car.speed) * 3.6);

  // ---- callouts as we pass places
  for (const c of CALLOUTS) {
    const d = Math.hypot(c.x - car.pos.x, c.z - car.pos.z);
    if (d < 28 && Math.abs(car.speed) > 1 && time - (announced.get(c.key) || -999) > 90) {
      announced.set(c.key, time);
      ui.toast(`👀 ${c.name}`);
      break;
    }
  }
  const r = roadGrid.nearest(car.pos.x, car.pos.z, 20);
  const onBridge = !!(r && r.e.bridge && r.e.name === 'Kilcullen Bridge' && r.dist < r.half);
  if (onBridge && !wasOnBridge && time - (announced.get('bridge') || -999) > 60) { announced.set('bridge', time); ui.toast('🌊 Over the River Liffey!'); }
  wasOnBridge = onBridge;

  // ---- badges bob; the destination's badge is big and shows through the fog
  for (const b of badges) {
    const isGoal = goal && b.userData.id === goal.d.id;
    b.position.y = b.userData.base + Math.sin(time * 2 + b.userData.base) * 0.6;
    const s = isGoal ? 1.5 : 1;
    b.scale.set(8 * s, 10 * s, 1);
    b.material.fog = !isGoal;
    const d = Math.min(Math.hypot(b.position.x - car.pos.x, b.position.z - car.pos.z), b.position.distanceTo(camera.position));
    b.material.opacity = d < 22 ? Math.max(0, (d - 10) / 12) : 1;
    b.visible = b.material.opacity > 0.02;
  }
  waterTex.offset.y -= dt * 0.03;

  // ---- camera: behind and above; it follows the car's heading smoothly and doesn't swing round when reversing
  if (car.speed > -0.5) { let dh = car.heading - camHeading; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); camHeading += dh * Math.min(1, dt * 3.5); }
  const fx = Math.sin(camHeading), fz = Math.cos(camHeading);
  const portrait = camera.aspect < 1;
  const [back, up, look] = camMode === 0 ? [portrait ? 9 : 7, portrait ? 3.9 : 3, 5] : camMode === 1 ? [22, 14, 10] : [3, 50, 0.1];
  const want = new THREE.Vector3(car.pos.x - fx * back, car.y + up, car.pos.z - fz * back);
  // never under the ground (the dip) or too low
  want.y = Math.max(want.y, groundY(want.x, want.z) + 2);
  const at = new THREE.Vector3(car.pos.x + fx * look, car.y + (camMode === 2 ? 0 : 1.3), car.pos.z + fz * look);
  if (intro) {
    if (Math.abs(car.speed) > 1) intro = false;
    else {
      // up over the end of the drive, like the drone photo: the car on the gravel, the house behind it
      const I = home.intro;
      const back = portrait ? 9 : 0;
      want.set(I.p[0] + home.fx * back, I.y + back * 0.6, I.p[1] + home.fz * back); at.set(I.at[0], -home.DIP + 1.2, I.at[1]);
    }
  }
  const k = first ? 1 : 1 - Math.exp(-dt * 5);
  camPos.lerp(want, k); camLook.lerp(at, first ? 1 : 1 - Math.exp(-dt * 8)); first = false;
  camera.position.copy(camPos); camera.lookAt(camLook);
  if (viewOverride) { camera.position.set(...viewOverride.slice(0, 3)); camera.lookAt(...viewOverride.slice(3)); }

  // sun, shadows and sky follow the car; soft shadows under every car
  atmo.update(time, carMesh.position, { x: fx, z: fz });
  const shadows = [{ x: car.pos.x, y: car.y, z: car.pos.z, h: car.heading, w: 2.5, l: 5.3 }];
  for (const p of parked) shadows.push({ x: p.x, y: groundY(p.x, p.z), z: p.z, h: p.h, w: 2.3, l: 4.6 });
  for (const c of traffic.cars) shadows.push({ x: c.vis.x, y: 0, z: c.vis.z, h: c.vis.h, w: c.kind === 'tractor' ? 2.6 : 2.4, l: c.kind === 'van' ? 6 : c.kind === 'tractor' ? 4.6 : 4.8 });
  contact.update(shadows);

  // ---- mini map and goal distance at a calmer pace
  mapT -= dt;
  if (mapT <= 0 && !simming) {
    mapT = 0.1;
    const pins = [];
    for (const [id, g] of DEST) if (!goal || goal.d.id === id) pins.push({ x: g.x, z: g.z, emoji: g.d.emoji });
    minimap.draw({ vis: { x: car.pos.x, z: car.pos.z, h: car.heading } }, route ? route.pts : null, pins);
    if (goal) {
      let len = 0; const p = route ? route.pts : [];
      for (let j = 1; j < p.length; j++) len += Math.hypot(p[j][0] - p[j - 1][0], p[j][1] - p[j - 1][1]);
      ui.setGoal(goal.d, route ? len : null);
    }
  }
  sound.update(Math.abs(car.speed), CAR_PARAMS.maxSpeed, input.throttle);
}

async function arrive() {
  arriving = true;
  const d = goal.d;
  sound.fanfare();
  await ui.celebrate(d);
  goal = null; ui.setGoal(null); route = null;
  arriving = false;
  ui.showPicker();
}

// ---------------------------------------------------------------- testing hooks
// kd.sim(seconds, input) runs the game faster than real time; kd.drive(seconds) drives with the autopilot below
let simming = false;
const sim = (sec, inp = { go: true }) => {
  simming = true; Object.assign(ui.input, inp);
  for (let t = 0; t < sec; t += 1 / 30) step(1 / 30);
  Object.assign(ui.input, { go: false, stop: false, left: false, right: false }); simming = false;
  return { x: car.pos.x, z: car.pos.z, v: car.speed, y: car.y };
};
// a test driver that steers along the planned route, like a careful parent would
const drive = (sec) => {
  simming = true; let t = 0;
  for (; t < sec && !arriving; t += 1 / 30) {
    let steer = 0;
    if (route && route.pts.length > 2) {
      let k = 1, acc = 0; const want = 6 + Math.abs(car.speed) * 0.6;
      while (k < route.pts.length - 1 && acc < want) { acc += Math.hypot(route.pts[k][0] - route.pts[k - 1][0], route.pts[k][1] - route.pts[k - 1][1]); k++; }
      const tx = route.pts[k][0] - car.pos.x, tz = route.pts[k][1] - car.pos.z;
      let dh = Math.atan2(tx, tz) - car.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      steer = Math.abs(dh) < 0.08 ? 0 : Math.max(-1, Math.min(1, -dh * 2.5));
    }
    Object.assign(ui.input, { go: true, stop: false, left: steer < 0, right: steer > 0 });
    step(1 / 30);
  }
  Object.assign(ui.input, { go: false, stop: false, left: false, right: false }); simming = false;
  return { t: Math.round(t), arrived: arriving, x: car.pos.x, z: car.pos.z };
};
const place = (x, z, h) => { car.teleport(x, z, h); car.y = groundY(x, z); camHeading = h; first = true; intro = false; ui.hidePicker(); };
const teleport = (id, back = 30) => {
  const g = DEST.get(id), e = g.spot.e, s = Math.max(0, g.spot.s - back), q = sample(e, 1, s);
  car.teleport(q.x + q.dz * lane(e), q.z - q.dx * lane(e), Math.atan2(q.dx, q.dz)); car.y = groundY(car.pos.x, car.pos.z);
  camHeading = car.heading; first = true; intro = false; ui.hidePicker();
};
window.kd = { view: (v) => { viewOverride = v; }, shops, get arriving() { return arriving; }, sim, drive, teleport, place, poi, cam: (m) => { camMode = m; first = true; }, car, traffic, pick: (id) => pick(DESTINATIONS.find((d) => d.id === id) || null), ui, scene, camera, DEST, home };
console.log(`Kilcullen Drive ready: ${edges.length} roads, ${nodes.length} junctions${inTown(car.pos.x, car.pos.z) ? '' : ', starting at home'}`);
frame();
