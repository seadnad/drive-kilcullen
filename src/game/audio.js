// Sound: the engine (three recorded loops cross-faded by speed), the Garda siren, a horn, a star chime and an
// arrival fanfare (synthesised), and a friendly voice through the browser's speech synthesis.
const BASE = import.meta.env.BASE_URL;

export class Sound {
  constructor() {
    this.ctx = null; this.on = true; this.ready = false;
    this.engine = []; this.siren = null; this.sirenOn = false;
  }

  // browsers only allow sound after a tap or key press
  async start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.on ? 0.8 : 0; this.master.connect(ctx.destination);
    const load = async (f) => { try { const r = await fetch(`${BASE}audio/${f}`); return await ctx.decodeAudioData(await r.arrayBuffer()); } catch { return null; } };
    const [idle, low, mid, wail] = await Promise.all(['engine_idle.mp3', 'engine_low.mp3', 'engine_mid.mp3', 'siren_wail.mp3'].map(load));
    for (const buf of [idle, low, mid]) {
      if (!buf) continue;
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const g = ctx.createGain(); g.gain.value = 0; src.connect(g).connect(this.master); src.start();
      this.engine.push({ src, g });
    }
    if (wail) {
      const src = ctx.createBufferSource(); src.buffer = wail; src.loop = true;
      const g = ctx.createGain(); g.gain.value = 0; src.connect(g).connect(this.master); src.start();
      this.siren = g;
    }
    this.ready = true;
  }

  setOn(on) { this.on = on; if (this.master) this.master.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.05); if (!on && window.speechSynthesis) speechSynthesis.cancel(); }

  // v: speed m/s, vmax: top speed
  update(v, vmax, throttle) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, x = Math.min(1, v / vmax);
    const w = [Math.max(0, 1 - x * 2.5), Math.max(0, 1 - Math.abs(x - 0.45) * 2.6), Math.max(0, (x - 0.45) * 2)];
    this.engine.forEach((e, i) => {
      e.g.gain.setTargetAtTime(0.16 * w[i] * (0.75 + throttle * 0.25), t, 0.1);
      e.src.playbackRate.setTargetAtTime(0.85 + x * 0.35 + (i === 0 ? 0 : x * 0.15), t, 0.1);
    });
    if (this.siren) this.siren.gain.setTargetAtTime(this.sirenOn ? 0.22 : 0, t, 0.08);
  }

  tone(freqs, { type = 'sine', dur = 0.15, gap = 0.09, vol = 0.25 } = {}) {
    if (!this.ctx || !this.on) return;
    const t0 = this.ctx.currentTime;
    freqs.forEach((f, i) => {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type; o.frequency.value = f;
      const t = t0 + i * gap;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.05);
    });
  }
  star() { this.tone([988, 1319], { dur: 0.18, gap: 0.07, vol: 0.18 }); }
  tick() { this.tone([660], { dur: 0.06, vol: 0.12, type: 'triangle' }); }
  fanfare() { this.tone([523, 659, 784, 1047, 784, 1047], { dur: 0.3, gap: 0.13, vol: 0.2, type: 'triangle' }); }
  horn() {
    if (!this.ctx || !this.on) return;
    const t0 = this.ctx.currentTime;
    for (const [start, len] of [[0, 0.22], [0.3, 0.35]]) {
      const g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 1400;
      g.gain.setValueAtTime(0, t0 + start); g.gain.linearRampToValueAtTime(0.18, t0 + start + 0.02); g.gain.setValueAtTime(0.18, t0 + start + len); g.gain.linearRampToValueAtTime(0, t0 + start + len + 0.04);
      for (const fr of [415, 520]) { const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = fr; o.connect(f); o.start(t0 + start); o.stop(t0 + start + len + 0.06); }
      f.connect(g).connect(this.master);
    }
  }
}

// Speak a short line, in an Irish or British English voice where the device has one.
let voice = null;
function pickVoice() {
  if (!window.speechSynthesis) return null;
  const vs = speechSynthesis.getVoices();
  return vs.find((v) => /en-IE/i.test(v.lang)) || vs.find((v) => /en-GB/i.test(v.lang)) || vs.find((v) => /^en/i.test(v.lang)) || null;
}
if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => { voice = pickVoice(); };

export function say(text, sound) {
  if (!window.speechSynthesis || (sound && !sound.on)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    voice = voice || pickVoice();
    if (voice) u.voice = voice;
    u.rate = 0.95; u.pitch = 1.15;
    speechSynthesis.speak(u);
  } catch { /* no speech on this device */ }
}
