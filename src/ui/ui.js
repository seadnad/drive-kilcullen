// The on-screen bits: where-we're-going chip, tool buttons, the big GO / STOP and steering buttons,
// the destination picker, the arrival party, toasts and the round mini map. Keyboard works alongside touch.
import { DESTINATIONS } from '../world/places.js';
import { edges } from '../game/graph.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

export class UI {
  constructor() {
    this.input = { go: false, stop: false, left: false, right: false };
    this.handlers = {};
    const body = document.body;

    // ---- top bar
    const hud = h('div', 'hud');
    this.goalEl = h('div', 'goal'); this.goalEl.hidden = true;
    const tools = h('div', 'tools');
    this.whereBtn = h('button', 'tool where', '🗺️ <span>Where to?</span>');
    this.sirenBtn = h('button', 'tool', '🚨'); this.sirenBtn.title = 'Siren (X)';
    this.hornBtn = h('button', 'tool', '📯'); this.hornBtn.title = 'Horn (H)';
    this.camBtn = h('button', 'tool', '🎥'); this.camBtn.title = 'Camera (C)';
    this.resetBtn = h('button', 'tool', '🔄'); this.resetBtn.title = 'Back on the road (R)';
    this.soundBtn = h('button', 'tool', '🔊'); this.soundBtn.title = 'Sound (V)';
    tools.append(this.whereBtn, this.sirenBtn, this.hornBtn, this.camBtn, this.resetBtn, this.soundBtn);
    hud.append(h('div', 'spacer'), this.goalEl, tools);
    body.append(hud);

    // ---- driving pads
    const left = h('div', 'pad left');
    this.leftBtn = h('button', 'big turn', '⬅'); this.rightBtn = h('button', 'big turn', '➡');
    left.append(this.leftBtn, this.rightBtn);
    const right = h('div', 'pad right');
    this.stopBtn = h('button', 'big stop', 'STOP<small>back</small>'); this.goBtn = h('button', 'big go', 'GO');
    right.append(this.stopBtn, this.goBtn);
    body.append(left, right);
    this.keysEl = h('div', 'keys', '<kbd>↑</kbd> go &nbsp; <kbd>↓</kbd> stop / back &nbsp; <kbd>←</kbd><kbd>→</kbd> steer &nbsp; <kbd>H</kbd> horn &nbsp; <kbd>X</kbd> siren &nbsp; <kbd>R</kbd> back on the road &nbsp; <kbd>M</kbd> where to');
    if (matchMedia('(pointer: fine)').matches) body.append(this.keysEl);

    this.speedEl = h('div', 'speed', '0 <small>km/h</small>'); body.append(this.speedEl);
    this.mapWrap = h('div', 'minimap'); this.mapCanvas = h('canvas'); this.mapCanvas.width = this.mapCanvas.height = 340; this.mapWrap.append(this.mapCanvas); body.append(this.mapWrap);
    this.toastEl = h('div', 'toast'); body.append(this.toastEl);
    this.confetti = h('canvas'); this.confetti.id = 'confetti'; body.append(this.confetti);

    // ---- destination picker
    this.picker = h('div', 'overlay'); this.picker.hidden = true;
    const sheet = h('div', 'sheet');
    this.pickerTitle = h('div', 'title', '<p class="logo">Kilcullen <span>Drive</span></p><p>Where will we go?</p>');
    const cards = h('div', 'cards');
    for (const d of DESTINATIONS) {
      const c = h('button', 'card', `<span class="em">${d.emoji}</span>${d.label}`);
      c.style.background = d.colour;
      c.onclick = () => this.emit('pick', d);
      cards.append(c);
    }
    const roam = h('button', 'card roam', '<span class="em">🚓</span>Just drive');
    roam.onclick = () => this.emit('pick', null);
    cards.append(roam);
    sheet.append(this.pickerTitle, cards); this.picker.append(sheet); body.append(this.picker);

    // ---- arrival party
    this.party = h('div', 'overlay'); this.party.hidden = true; this.party.style.background = 'rgba(255,200,60,0.35)';
    this.partyMsg = h('div', 'yay'); this.party.append(this.partyMsg); body.append(this.party);

    // ---- wiring: touch
    const hold = (el, key) => {
      const on = (e) => { e.preventDefault(); this.input[key] = true; el.classList.add('held'); this.emit('wake'); };
      const off = () => { this.input[key] = false; el.classList.remove('held'); };
      el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointerleave', off); el.addEventListener('pointercancel', off);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    hold(this.goBtn, 'go'); hold(this.stopBtn, 'stop'); hold(this.leftBtn, 'left'); hold(this.rightBtn, 'right');
    const tap = (el, ev) => el.addEventListener('pointerdown', (e) => { e.preventDefault(); this.emit('wake'); this.emit(ev); });
    tap(this.hornBtn, 'horn'); tap(this.sirenBtn, 'siren'); tap(this.camBtn, 'camera'); tap(this.soundBtn, 'sound'); tap(this.resetBtn, 'reset');
    this.whereBtn.addEventListener('click', () => { this.emit('wake'); this.showPicker(); });

    // ---- wiring: keys
    const keymap = { arrowup: 'go', w: 'go', arrowdown: 'stop', s: 'stop', ' ': 'stop', arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right' };
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      this.emit('wake');
      if (!this.picker.hidden) {
        if (k === 'escape') this.hidePicker();
        return;
      }
      if (keymap[k]) { this.input[keymap[k]] = true; e.preventDefault(); }
      if (e.repeat) return;
      if (k === 'r' || k === 'backspace') this.emit('reset');
      if (k === 'h') this.emit('horn');
      if (k === 'x') this.emit('siren');
      if (k === 'c') this.emit('camera');
      if (k === 'v') this.emit('sound');
      if (k === 'm' || k === 'enter') this.showPicker();
    });
    window.addEventListener('keyup', (e) => { const k = keymap[e.key.toLowerCase()]; if (k) this.input[k] = false; });
    window.addEventListener('blur', () => { this.input.go = this.input.stop = this.input.left = this.input.right = false; });
  }

  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); }
  emit(ev, arg) { for (const fn of this.handlers[ev] || []) fn(arg); }
  flash(el) { el.classList.add('held'); setTimeout(() => el.classList.remove('held'), 150); }

  showPicker(first = false) {
    this.picker.hidden = false;
    this.pickerTitle.innerHTML = first ? '<p class="logo">Kilcullen <span>Drive</span></p><p>Where will we go?</p>' : '<p>Where will we go now?</p>';
    const c = this.picker.querySelector('.card'); if (c) c.focus({ preventScroll: true });
    this.emit('picker');
  }
  hidePicker() { this.picker.hidden = true; }

  setGoal(d, dist) {
    if (!d) { this.goalEl.hidden = true; return; }
    this.goalEl.hidden = false;
    const k = dist == null ? '' : dist > 950 ? `${(dist / 1000).toFixed(1)} km to go` : `${Math.max(10, Math.round(dist / 10) * 10)} m to go`;
    const html = `<span class="em" style="background:${d.colour}">${d.emoji}</span><span class="txt">${d.label}<small>${k}</small></span>`;
    if (html !== this._goal) { this.goalEl.innerHTML = html; this._goal = html; }
  }
  setSpeed(kmh) { const v = Math.round(kmh); if (v !== this._spd) { this.speedEl.innerHTML = `${v} <small>km/h</small>`; this._spd = v; } }
  // glow the steering button for the way to turn at the next junction
  setTurnHint(side) {
    this.leftBtn.classList.toggle('hint', side < 0); this.rightBtn.classList.toggle('hint', side > 0);
  }
  setGoWiggle(on) { this.goBtn.classList.toggle('wiggle', on); }
  setTool(btn, on) { this[btn].classList.toggle('on', on); }

  toast(text, ms = 2200) {
    this.toastEl.textContent = text; this.toastEl.classList.add('show');
    clearTimeout(this._t); this._t = setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  celebrate(d, ms = 4200) {
    this.partyMsg.innerHTML = `<span class="em">${d.emoji}</span><h2>Hooray!</h2><h2>${d.label}!</h2>`;
    this.party.hidden = false;
    this.runConfetti(ms);
    return new Promise((res) => setTimeout(() => { this.party.hidden = true; res(); }, ms));
  }

  runConfetti(ms) {
    const c = this.confetti, g = c.getContext('2d');
    c.width = innerWidth; c.height = innerHeight;
    const cols = ['#e5484d', '#ffd23f', '#30a46c', '#3e63dd', '#8e4ec6', '#f76b15'];
    const bits = Array.from({ length: 160 }, () => ({ x: Math.random() * c.width, y: -Math.random() * c.height * 0.6, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 4, r: Math.random() * 6, c: cols[(Math.random() * cols.length) | 0], s: 6 + Math.random() * 8 }));
    const t0 = performance.now();
    const step = (t) => {
      g.clearRect(0, 0, c.width, c.height);
      if (t - t0 > ms) return;
      for (const b of bits) {
        b.x += b.vx; b.y += b.vy; b.r += 0.1;
        g.save(); g.translate(b.x, b.y); g.rotate(b.r); g.fillStyle = b.c; g.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2); g.restore();
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Mini map: the road network painted once onto a big offscreen canvas, then a heading-up window of it each frame.
export class MiniMap {
  constructor(canvas) {
    this.c = canvas; this.g = canvas.getContext('2d');
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const e of edges) for (const p of e.pts) { minX = Math.min(minX, p[0]); minZ = Math.min(minZ, p[1]); maxX = Math.max(maxX, p[0]); maxZ = Math.max(maxZ, p[1]); }
    this.k = 0.6; // pixels per metre
    this.ox = minX - 60; this.oz = minZ - 60;
    const W = Math.ceil((maxX - minX + 120) * this.k), H = Math.ceil((maxZ - minZ + 120) * this.k);
    const off = document.createElement('canvas'); off.width = W; off.height = H;
    const g = off.getContext('2d');
    g.lineCap = g.lineJoin = 'round';
    for (const pass of [0, 1]) {
      for (const e of edges) {
        g.strokeStyle = pass ? (e.cls === 'secondary' ? '#ffe28a' : '#ffffff') : 'rgba(0,0,0,0.25)';
        g.lineWidth = (e.cls === 'secondary' ? 9 : e.cls === 'service' ? 4 : 6) + (pass ? 0 : 3);
        g.beginPath();
        e.pts.forEach((p, i) => { const x = (p[0] - this.ox) * this.k, y = (p[1] - this.oz) * this.k; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
        g.stroke();
      }
    }
    this.off = off;
  }
  // pins: [{x, z, emoji}], path: [[x,z]...]
  draw(car, path, pins) {
    const { g, c, k } = this; const S = c.width;
    g.save();
    g.fillStyle = '#8cc56a'; g.fillRect(0, 0, S, S);
    g.translate(S / 2, S / 2 + S * 0.12);
    g.rotate(Math.PI + car.vis.h);
    g.translate(-(car.vis.x - this.ox) * k, -(car.vis.z - this.oz) * k);
    g.drawImage(this.off, 0, 0);
    if (path && path.length > 1) {
      g.strokeStyle = '#2f6bff'; g.lineWidth = 7; g.lineCap = g.lineJoin = 'round';
      g.beginPath(); path.forEach((p, i) => { const x = (p[0] - this.ox) * k, y = (p[1] - this.oz) * k; if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke();
    }
    g.restore();
    // pins drawn upright
    for (const p of pins) {
      const dx = (p.x - car.vis.x) * k, dz = (p.z - car.vis.z) * k;
      const a = -(Math.PI + car.vis.h);
      let x = dx * Math.cos(-a) - dz * Math.sin(-a), y = dx * Math.sin(-a) + dz * Math.cos(-a);
      x = S / 2 + x; y = S / 2 + S * 0.12 + y;
      const r = S / 2 - 22, cx = x - S / 2, cy = y - S / 2, l = Math.hypot(cx, cy);
      if (l > r) { x = S / 2 + (cx / l) * r; y = S / 2 + (cy / l) * r; }
      g.font = '40px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(p.emoji, x, y);
    }
    // the car: a blue arrow
    g.save(); g.translate(S / 2, S / 2 + S * 0.12);
    g.fillStyle = '#2f6bff'; g.strokeStyle = '#fff'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(0, -22); g.lineTo(16, 16); g.lineTo(0, 7); g.lineTo(-16, 16); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }
}

