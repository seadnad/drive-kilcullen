// The road-following car. It always stays on the road, keeps to the left, and at each junction takes the way
// chosen for it: the way to the destination if there is one, otherwise straight on, unless the driver presses
// left or right to pick another road. Dead ends turn round by themselves. Used for the player and the traffic.
import { sample, options, endNode, plan, edges } from './graph.js';

const tmp = {}, tmp2 = {};

// how far to the left of the centre line a car drives on this road
export const laneOffset = (e) => (e.oneway || e.lanes < 2 || e.w < 5.5 ? 0 : e.w / 4);

export class RailCar {
  constructor(e, dir, s) {
    this.e = e; this.dir = dir; this.s = s; // s: metres travelled along e in direction dir
    this.v = 0;
    this.target = null;   // { e, s (from a) } destination spot, or null to roam
    this.steps = null;    // planned edges after this one
    this.opts = [];       // ways on from the next junction (left to right)
    this.next = null;     // the chosen way on
    this.manual = false;  // the driver picked this turn themselves
    this.random = null;   // traffic: () => 0..1 for choosing turns
    const p = this.railPoint(0);
    this.vis = { x: p.x, z: p.z, h: Math.atan2(p.dx, p.dz) };
    this.choose();
  }

  get node() { return endNode(this.e, this.dir); }
  remaining() { return this.e.len - this.s; }

  setTarget(t) { this.target = t; this.manual = false; this.choose(); }

  // pick the way on at the end of the current edge
  choose() {
    this.opts = options(this.e, this.dir);
    this.steps = this.target ? plan(this.e, this.dir, this.target) : null;
    if (!this.opts.length) { this.next = { e: this.e, dir: -this.dir, uturn: true }; return; }
    if (this.steps && this.steps.length) {
      const st = this.steps[0];
      const o = this.opts.find((q) => q.e === st.e && q.dir === st.dir);
      if (o) { this.next = o; return; }
      // the target is back along this road: turn round at the junction ahead
      if (st.e === this.e && st.dir === -this.dir) { this.next = { e: this.e, dir: -this.dir, uturn: true }; return; }
      // the plan says turn round here (it happens on the target edge behind us): carry on and replan later
    }
    if (this.random) {
      // traffic: prefer main roads, avoid estates, mostly straight
      const w = this.opts.map((o) => (o.e.cls === 'residential' || o.e.cls === 'service' ? 0.15 : 1) * (Math.abs(o.angle) < 0.6 ? 2 : 1));
      let r = this.random() * w.reduce((a, b) => a + b, 0);
      for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) { this.next = this.opts[i]; return; } }
      this.next = this.opts[this.opts.length - 1]; return;
    }
    // no destination: the straightest way on, preferring main roads
    let best = this.opts[0], bs = Infinity;
    for (const o of this.opts) { const sc = Math.abs(o.angle) + (o.e.cls === 'residential' || o.e.cls === 'service' ? 0.5 : 0); if (sc < bs) { bs = sc; best = o; } }
    this.next = best;
  }

  // the driver asks for the next way to the left (-1) or right (+1)
  steer(side) {
    if (this.opts.length < 2) return false;
    let i = this.opts.indexOf(this.next);
    if (i < 0) i = 0;
    const j = Math.max(0, Math.min(this.opts.length - 1, i + side));
    if (j === i) return false;
    this.next = this.opts[j]; this.manual = true;
    return true;
  }

  // where the car should be on the road at lookahead distance `ahead`, following the chosen way on
  railPoint(ahead, out = tmp) {
    let s = this.s + ahead;
    if (s <= this.e.len || !this.next) {
      sample(this.e, this.dir, Math.min(s, this.e.len), out);
      const off = laneOffset(this.e) + (this.pull || 0);
      out.x += out.dz * off; out.z -= out.dx * off;
      return out;
    }
    const n = this.next;
    sample(n.e, n.dir, Math.min(s - this.e.len, n.e.len), out);
    const off = laneOffset(n.e) + (this.pull || 0);
    out.x += out.dz * off; out.z -= out.dx * off;
    return out;
  }

  // angle of the coming turn (0 straight, PI for a u-turn)
  turnSharpness() {
    if (!this.next) return 0;
    if (this.next.uturn) return Math.PI;
    return Math.abs(this.next.angle || 0);
  }

  // ctl: { throttle 0..1, brake 0..1, vmax, limit (max speed from traffic ahead) }
  update(dt, ctl) {
    const vmax = Math.min(ctl.vmax, ctl.limit ?? Infinity);
    // slow for corners and turning round: the sharper the turn, the slower, starting early enough to be gentle
    const sharp = this.turnSharpness();
    const rem = this.remaining();
    let cap = vmax;
    if (sharp > 0.35) {
      const vTurn = sharp > 2.5 ? 3 : Math.max(4.5, 13 - sharp * 6);
      cap = Math.min(cap, Math.sqrt(vTurn * vTurn + 2 * 3.2 * Math.max(0, rem - 2)));
    }
    // and for bends along the road itself
    const a = this.railPoint(6, tmp), ax = a.dx, az = a.dz, b = this.railPoint(22, tmp2);
    const bend = Math.acos(Math.max(-1, Math.min(1, ax * b.dx + az * b.dz)));
    if (bend > 0.3) cap = Math.min(cap, Math.max(6, 16 - bend * 9));

    const target = ctl.throttle > 0 ? Math.min(cap, vmax) : 0;
    if (ctl.brake > 0) this.v = Math.max(0, this.v - 14 * ctl.brake * dt);
    else if (this.v < target) this.v = Math.min(target, this.v + 4.5 * ctl.throttle * dt * (this.v < 4 ? 1.4 : 1));
    else this.v = Math.max(target, this.v - (target === 0 ? 3 : 7) * dt);

    this.s += this.v * dt;
    let guard = 0;
    while (this.s >= this.e.len && guard++ < 4) {
      const over = this.s - this.e.len;
      const n = this.next;
      this.e = n.e; this.dir = n.dir; this.s = over;
      this.manual = false;
      this.choose();
    }

    // the drawn car eases toward the rail point, which rounds off corners and lane changes
    const p = this.railPoint(0, tmp);
    const k = 1 - Math.exp(-dt * 7);
    this.vis.x += (p.x - this.vis.x) * k;
    this.vis.z += (p.z - this.vis.z) * k;
    const q = this.railPoint(Math.max(3, this.v * 0.45), tmp2);
    const hx = q.x - this.vis.x, hz = q.z - this.vis.z;
    if (hx * hx + hz * hz > 0.5) {
      const want = Math.atan2(hx, hz);
      let d = want - this.vis.h; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.vis.h += d * (1 - Math.exp(-dt * (this.v > 1 ? 6 : 2)));
    }
    this.steerVis = Math.max(-0.5, Math.min(0.5, (this.vis.h - (this.prevH ?? this.vis.h)) / Math.max(dt, 1e-3) * 0.35));
    this.prevH = this.vis.h;
  }

  // distance along the road from a.s (from end a) on the target edge: are we there?
  atTarget(radius = 10) {
    if (!this.target || this.target.e !== this.e) return false;
    const sa = this.dir > 0 ? this.s : this.e.len - this.s;
    return Math.abs(sa - this.target.s) < radius;
  }
}

export { edges };
