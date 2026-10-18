// A little friendly traffic: cars, a van and a tractor that drive the roads near the player, keep their distance
// and never crash. Built from simple shapes so they load instantly.
import * as THREE from 'three';
import { RailCar } from './driver.js';
import { edges, nearest } from './graph.js';
import { rng } from '../world/textures.js';

const r = rng(77);
const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.5, ...o });
const GLASS = std({ color: 0x1d2a35, roughness: 0.15, metalness: 0.4 });
const TYRE = std({ color: 0x1b1b1b, roughness: 0.9 });
const LIGHT = std({ color: 0xfff6dd, emissive: 0xfff2cc, emissiveIntensity: 0.4 });
const TAIL = std({ color: 0xaa1111, emissive: 0xff2200, emissiveIntensity: 0.5 });
const COLOURS = [0xd7263d, 0x1b998b, 0xf46036, 0x2e294e, 0xc5d86d, 0xffffff, 0x3a86ff, 0x8d99ae, 0xffbe0b, 0x111111];

function part(geo, mat, x, y, z) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; }

function wheelSet(g, xs, zs, rad, wid) {
  const geo = new THREE.CylinderGeometry(rad, rad, wid, 12).rotateZ(Math.PI / 2);
  for (const x of xs) for (const z of zs) g.add(part(geo, TYRE, x, rad, z));
}

export function makeHatch(colour) {
  const g = new THREE.Group();
  const paint = std({ color: colour, metalness: 0.3, roughness: 0.35 });
  g.add(part(new THREE.BoxGeometry(1.75, 0.75, 4), paint, 0, 0.7, 0));
  g.add(part(new THREE.BoxGeometry(1.6, 0.6, 2.2), paint, 0, 1.35, -0.3));
  g.add(part(new THREE.BoxGeometry(1.62, 0.5, 2.0), GLASS, 0, 1.38, -0.3));
  g.add(part(new THREE.BoxGeometry(0.4, 0.15, 0.05), LIGHT, -0.55, 0.85, 2.01), part(new THREE.BoxGeometry(0.4, 0.15, 0.05), LIGHT, 0.55, 0.85, 2.01));
  g.add(part(new THREE.BoxGeometry(0.35, 0.15, 0.05), TAIL, -0.6, 0.9, -2.01), part(new THREE.BoxGeometry(0.35, 0.15, 0.05), TAIL, 0.6, 0.9, -2.01));
  wheelSet(g, [-0.82, 0.82], [-1.3, 1.3], 0.34, 0.25);
  return g;
}

export function makeVan(colour) {
  const g = new THREE.Group();
  const paint = std({ color: colour, roughness: 0.4 });
  g.add(part(new THREE.BoxGeometry(1.95, 1.9, 4.8), paint, 0, 1.35, -0.2));
  g.add(part(new THREE.BoxGeometry(1.9, 0.9, 0.9), paint, 0, 0.8, 2.6));
  g.add(part(new THREE.BoxGeometry(1.92, 0.6, 0.6), GLASS, 0, 1.75, 2.05));
  wheelSet(g, [-0.9, 0.9], [-1.6, 1.8], 0.36, 0.28);
  return g;
}

export function makeTractor() {
  const g = new THREE.Group();
  const green = std({ color: 0x2f8f3a, roughness: 0.5 }), yellow = std({ color: 0xf2c230 });
  g.add(part(new THREE.BoxGeometry(1.1, 1.0, 2.6), green, 0, 1.3, 0.6));
  g.add(part(new THREE.BoxGeometry(1.5, 1.6, 1.4), green, 0, 2.1, -0.8));
  g.add(part(new THREE.BoxGeometry(1.45, 1.1, 1.35), GLASS, 0, 2.4, -0.8));
  g.add(part(new THREE.BoxGeometry(1.6, 0.12, 1.5), green, 0, 2.95, -0.8));
  g.add(part(new THREE.CylinderGeometry(0.08, 0.08, 1, 8), std({ color: 0x333333 }), 0.35, 2.5, 1.4));
  const big = new THREE.CylinderGeometry(0.85, 0.85, 0.5, 14).rotateZ(Math.PI / 2), small = new THREE.CylinderGeometry(0.48, 0.48, 0.35, 12).rotateZ(Math.PI / 2);
  for (const x of [-0.95, 0.95]) { g.add(part(big, TYRE, x, 0.85, -0.9)); g.add(part(small, TYRE, x * 0.85, 0.48, 1.5)); }
  for (const x of [-0.95, 0.95]) { g.add(part(new THREE.CylinderGeometry(0.4, 0.4, 0.52, 10).rotateZ(Math.PI / 2), yellow, x, 0.85, -0.9)); }
  return g;
}

export class Traffic {
  constructor(scene, count = 12) {
    this.cars = [];
    this.scene = scene;
    const pool = edges.filter((e) => e.cls !== 'service' && e.len > 30);
    this.pool = pool;
    for (let i = 0; i < count; i++) {
      const kind = i === 0 ? 'tractor' : i % 5 === 4 ? 'van' : 'hatch';
      const mesh = kind === 'tractor' ? makeTractor() : kind === 'van' ? makeVan([0xffffff, 0xd7263d, 0x2e294e][i % 3]) : makeHatch(COLOURS[i % COLOURS.length]);
      scene.add(mesh);
      const e = pool[(r() * pool.length) | 0];
      const car = new RailCar(e, r() < 0.5 && !e.oneway ? -1 : 1, r() * e.len * 0.8);
      car.random = r;
      car.choose();
      car.vmax = kind === 'tractor' ? 7 : 9 + r() * 3;
      car.kind = kind;
      car.mesh = mesh;
      this.cars.push(car);
    }
  }

  // put a car back on a road some way from the player (but not right in front of them)
  respawn(car, player) {
    for (let tries = 0; tries < 30; tries++) {
      const e = this.pool[(r() * this.pool.length) | 0];
      const p = e.pts[(e.pts.length / 2) | 0];
      const d = Math.hypot(p[0] - player.vis.x, p[1] - player.vis.z);
      if (d < 120 || d > 450) continue;
      // not straight ahead of the camera, where it would pop into view
      const fx = Math.sin(player.vis.h), fz = Math.cos(player.vis.h);
      if (((p[0] - player.vis.x) * fx + (p[1] - player.vis.z) * fz) / d > 0.6 && d < 300) continue;
      const n = nearest(p[0], p[1], (q) => q === e);
      car.e = e; car.dir = e.oneway ? 1 : r() < 0.5 ? 1 : -1; car.s = car.dir > 0 ? n.s : e.len - n.s; car.v = 0;
      car.choose();
      const q = car.railPoint(0); car.vis.x = q.x; car.vis.z = q.z; car.vis.h = Math.atan2(q.dx, q.dz);
      return;
    }
  }

  update(dt, player) {
    const all = [player, ...this.cars];
    const pfx = Math.sin(player.vis.h), pfz = Math.cos(player.vis.h);
    for (const car of this.cars) {
      if (Math.hypot(car.vis.x - player.vis.x, car.vis.z - player.vis.z) > 650) this.respawn(car, player);
      // the Garda car is close behind: pull in to the side and let it by
      const dx = car.vis.x - player.vis.x, dz = car.vis.z - player.vis.z;
      const ahead = dx * pfx + dz * pfz, side = Math.abs(dx * pfz - dz * pfx);
      const same = Math.sin(car.vis.h) * pfx + Math.cos(car.vis.h) * pfz;
      if (ahead > 0 && ahead < 24 && side < 2.5 && same > 0.5 && player.v > 1) car.yieldT = 2.5;
      car.yieldT = Math.max(0, (car.yieldT || 0) - dt);
      const wantPull = car.yieldT > 0 ? 3.2 : 0;
      car.pull = (car.pull || 0) + (wantPull - (car.pull || 0)) * Math.min(1, dt * 3);
      const vmax = car.yieldT > 0 ? 2.5 : car.vmax;
      car.update(dt, { throttle: 1, brake: 0, vmax, limit: unstick(car, followLimit(car, all), dt) });
      car.mesh.position.set(car.vis.x, 0, car.vis.z);
      car.mesh.rotation.y = car.vis.h;
    }
  }
}

// Two cars waiting for each other at a junction would wait forever: after a few seconds held up, the waiting
// car may go anyway (cars pass through each other harmlessly in this game) until it has moved on.
export function unstick(car, limit, dt) {
  car.held = (car.held || 0);
  if (car.ghost > 0) { car.ghost -= dt; return Infinity; }
  if (limit < 0.5 && car.v < 0.5) car.held += dt; else car.held = 0;
  if (car.held > 4) { car.held = 0; car.ghost = 2.5; return Infinity; }
  return limit;
}

// Keep a safe gap to whatever is ahead in the same lane.
export function followLimit(car, all) {
  const fx = Math.sin(car.vis.h), fz = Math.cos(car.vis.h);
  let limit = Infinity;
  for (const o of all) {
    if (o === car) continue;
    const dx = o.vis.x - car.vis.x, dz = o.vis.z - car.vis.z;
    const ahead = dx * fx + dz * fz;
    if (ahead <= 0 || ahead > 26) continue;
    const side = Math.abs(dx * fz - dz * fx);
    if (side > 2.2) continue;
    // only cars going roughly our way (oncoming ones are in the other lane anyway)
    const same = Math.sin(o.vis.h) * fx + Math.cos(o.vis.h) * fz;
    if (same < -0.2) continue;
    const gap = ahead - 7;
    limit = Math.min(limit, Math.max(0, (same > 0.3 ? o.v : 0) + gap * 0.9));
  }
  return limit;
}
