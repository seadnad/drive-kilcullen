// The player's car: arcade handling in the style of Dublin Drive, made forgiving for a small driver.
//  * gentle top speed and acceleration, strong brakes, slow reverse
//  * steering that eases in and out, softer at speed
//  * road assist: with the wheel left alone the car lines itself up with the road and drifts back into the left
//    lane, so holding GO is enough to follow a road round its bends; steer and the assist lets go
//  * soft edges: the car can run onto the verge but never into hedges, walls or houses; it is guided back
//    onto the road and loses a little speed instead of crashing
// Heading h: forward is (sin h, cos h) in world x/z.
import { roadGrid } from '../world/world.js';

const P = {
  maxSpeed: 25,     // m/s, about 90 km/h
  accel: 9,
  brake: 16,
  reverseMax: 4.5,
  drag: 0.0028,
  rolling: 0.6,
  maxSteer: 0.62,
  steerRate: 5.5,
  steerReturn: 12,
  steerFade: 0.05,
  wheelbase: 2.6,
  grip: 18,
  assistYaw: 2.2,   // how strongly the road assist turns the nose along the road (1/s)
  holdStraight: 6,  // with the wheel centred and no road to follow, how quickly any leftover turn dies away (1/s)
};

export class Car {
  constructor(x, z, heading) {
    this.pos = { x, z };
    this.heading = heading;
    this.vel = { x: 0, z: 0 };
    this.speed = 0;     // signed forward speed
    this.steer = 0;
    this.yawRate = 0;
    this.y = 0;         // ground height under the car (the dip driveway at home)
    this.bump = 0;
    this.groundY = null; // (x, z) => height, set by the world
    this.extraRoads = []; // driveways: { a:[x,z], b:[x,z], half }
    this.dynamic = null;  // (x, z, r) => push { x, z } from traffic
    this.offRoad = false;
    this.prefer = null;   // () => { x, z } the way the route wants to go, or null
  }

  hold() { this.vel.x = this.vel.z = 0; this.speed = 0; this.yawRate = 0; }

  teleport(x, z, h) { this.pos.x = x; this.pos.z = z; this.heading = h; this.hold(); this.steer = 0; }

  // nearest road centreline point: from the network, or a driveway
  road(x, z) {
    let best = roadGrid.nearest(x, z, 40);
    for (const d of this.extraRoads) {
      const vx = d.b[0] - d.a[0], vz = d.b[1] - d.a[1], L = vx * vx + vz * vz;
      let t = ((x - d.a[0]) * vx + (z - d.a[1]) * vz) / L; t = Math.max(0, Math.min(1, t));
      const px = d.a[0] + vx * t, pz = d.a[1] + vz * t, dist = Math.hypot(x - px, z - pz);
      // the same score as the road grid (how far past the drivable edge), so the drive and the road join up seamlessly
      if (!best || dist - d.half - 0.8 < best.dist - best.half - best.margin) { const l = Math.sqrt(L); best = { x: px, z: pz, dx: vx / l, dz: vz / l, dist, half: d.half, margin: 0.8, lanes: 1, drive: true }; }
    }
    return best;
  }

  update(dt, input, assist = true) {
    const steps = 2, h = dt / steps;
    for (let i = 0; i < steps; i++) this.step(h, input, assist);
  }

  step(dt, input, assist) {
    const p = P;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    let vLong = this.vel.x * fx + this.vel.z * fz;
    let vLat = this.vel.x * Math.cos(this.heading) - this.vel.z * Math.sin(this.heading);
    const r = this.road(this.pos.x, this.pos.z);
    const onRoad = r && r.dist < r.half + 0.3;
    this.offRoad = !onRoad;

    // ---- speed
    let a = 0;
    const { throttle, brake } = input;
    if (throttle > 0) {
      if (vLong < -0.3) a += p.brake * throttle;
      else a += p.accel * throttle * Math.max(0, 1 - Math.pow(Math.max(0, vLong) / p.maxSpeed, 2.2));
    }
    if (brake > 0) {
      if (vLong > 0.3) a -= p.brake * brake;
      else if (vLong > -p.reverseMax) a -= 3 * brake;
    }
    a -= Math.sign(vLong) * p.rolling * (onRoad ? 1 : 3);
    a -= p.drag * vLong * Math.abs(vLong);
    if (!onRoad && Math.abs(vLong) > 7) a -= Math.sign(vLong) * 4; // grass is slow
    const nv = vLong + a * dt;
    vLong = throttle === 0 && brake === 0 && Math.sign(nv) !== Math.sign(vLong) ? 0 : nv;
    vLat -= vLat * (1 - Math.exp(-p.grip * dt));

    // ---- steering
    const spd = Math.abs(vLong);
    this.steer += (input.steer - this.steer) * Math.min(1, dt * (input.steer === 0 ? p.steerReturn : p.steerRate));
    const angle = this.steer * (p.maxSteer / (1 + spd * p.steerFade));
    let yaw = -(Math.sign(vLong) * Math.min(spd, 5 + spd * 0.55) * Math.tan(angle)) / p.wheelbase * (spd < 1 ? spd : 1);

    let steady = false;
    // ---- road assist: line up with the road and settle into the left lane while the wheel is centred
    if (assist && r && spd > 1.5 && vLong > 0 && Math.abs(input.steer) < 0.05 && r.dist < r.half + 4) {
      // which way along the road are we going?
      let dx = r.dx, dz = r.dz;
      if (dx * fx + dz * fz < 0) { dx = -dx; dz = -dz; }
      const align = Math.abs(dx * fx + dz * fz);
      if (align > 0.55) { // not at a right-angle junction: leave turns to the driver
        // aim at the left lane a little way ahead along the road (further at speed, so it follows bends and
        // doesn't weave): the road's centre there, shifted into the lane
        const look = 7 + spd * 0.45;
        let want = null;
        const ra = this.road(this.pos.x + dx * look, this.pos.z + dz * look);
        if (ra && ra.dist < ra.half + 8) {
          let ax = ra.dx, az = ra.dz;
          if (ax * dx + az * dz < 0) { ax = -ax; az = -az; }
          const lane = ra.lanes >= 2 && !ra.oneway ? ra.half / 2 : 0;
          const px = ra.x + az * lane, pz = ra.z - ax * lane; // left of travel is (az, -ax)
          want = Math.atan2(px - this.pos.x, pz - this.pos.z);
        } else {
          const lane = r.lanes >= 2 && !r.oneway ? r.half / 2 : 0;
          const lx = dz, lz = -dx;
          const err = lane - ((this.pos.x - r.x) * lx + (this.pos.z - r.z) * lz);
          want = Math.atan2(dx * look + lx * err, dz * look + lz * err);
        }
        let dh = want - this.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        yaw += dh * p.assistYaw * Math.min(1, spd / 6);
      } else steady = true;
    } else if (Math.abs(input.steer) < 0.05) steady = true;
    // wheel centred and nothing to line up with (a junction, the verge, the drive): keep going straight
    if (steady) yaw *= Math.exp(-p.holdStraight * 0.5); // most of any leftover turn goes at once
    this.yawRate += (yaw - this.yawRate) * Math.min(1, dt * 9);
    this.heading += this.yawRate * dt;
    const nfx = Math.sin(this.heading), nfz = Math.cos(this.heading);
    this.vel.x = nfx * vLong + Math.cos(this.heading) * vLat;
    this.vel.z = nfz * vLong - Math.sin(this.heading) * vLat;
    this.speed = vLong;

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    // ---- soft edges: never further from the road than its verge allows
    const r2 = this.road(this.pos.x, this.pos.z);
    if (r2) {
      const limit = r2.half + r2.margin;
      if (r2.dist > limit) {
        const nx = (this.pos.x - r2.x) / r2.dist, nz = (this.pos.z - r2.z) / r2.dist;
        this.pos.x = r2.x + nx * limit; this.pos.z = r2.z + nz * limit;
        const vn = this.vel.x * nx + this.vel.z * nz;
        if (vn > 0) { this.vel.x -= nx * vn; this.vel.z -= nz * vn; this.vel.x *= 0.97; this.vel.z *= 0.97; this.bump = Math.min(1, this.bump + vn * 0.05); }
        // turn the nose back along the road rather than into the hedge, quicker the more head-on it is
        const headOn = Math.max(0, nfx * nx + nfz * nz);
        let tx = r2.dx, tz = r2.dz;
        if (tx * nfx + tz * nfz < 0) { tx = -tx; tz = -tz; }
        // past the end of a road (the way along it leads further out) or nose-on to the edge: swing right round;
        // otherwise run along the road, aiming a little back toward the middle
        const pastEnd = tx * nx + tz * nz > 0.3;
        if (pastEnd) { tx = -nx; tz = -nz; } // a dead end: turn round
        else {
          if (headOn > 0.6) {
            // straight across a road into the far verge (out of a drive, over a T-junction): turn along the road,
            // the way the route goes, or left if there is no route; never back the way we came
            const sx = r2.dx, sz = r2.dz, along = sx * nfx + sz * nfz;
            const pref = this.prefer ? this.prefer() : null;
            let sgn = Math.abs(along) > 0.25 ? Math.sign(along) : pref ? Math.sign(sx * pref.x + sz * pref.z) || 1 : Math.sign(sx * nfz - sz * nfx) || 1;
            tx = sx * sgn; tz = sz * sgn;
          }
          tx -= nx * 0.35; tz -= nz * 0.35;
        }
        let dh = Math.atan2(tx, tz) - this.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        if (Math.abs(this.speed) > 0.2 || input.throttle > 0) this.heading += dh * Math.min(1, dt * (2 + headOn * 6));
      }
    }
    // ---- traffic: a gentle shove apart, no crash
    if (this.dynamic) {
      const push = this.dynamic(this.pos.x, this.pos.z, 2.1);
      if (push) {
        this.pos.x += push.x; this.pos.z += push.z;
        const l = Math.hypot(push.x, push.z) || 1, nx = push.x / l, nz = push.z / l;
        const vn = this.vel.x * nx + this.vel.z * nz;
        if (vn < 0) { this.vel.x -= nx * vn * 1.2; this.vel.z -= nz * vn * 1.2; this.bump = Math.min(1, this.bump - vn * 0.08); }
      }
    }
    this.speed = this.vel.x * Math.sin(this.heading) + this.vel.z * Math.cos(this.heading);
    this.bump *= Math.exp(-dt * 5);
    const gy = this.groundY ? this.groundY(this.pos.x, this.pos.z) : 0;
    this.y += (gy - this.y) * Math.min(1, dt * 12);
  }
}

export { P as CAR_PARAMS };
