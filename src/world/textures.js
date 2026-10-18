// Canvas-painted textures: grass, asphalt, house walls with windows, roof tiles, and text signs.
import * as THREE from 'three';

export const IS_MOBILE = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function speckle(g, w, h, n, colours, size, r) {
  for (let i = 0; i < n; i++) { g.fillStyle = colours[(r() * colours.length) | 0]; const s = size * (0.5 + r()); g.fillRect(r() * w, r() * h, s, s); }
}

// A normal map from a canvas's brightness (bright = raised), for bumpy, lit-looking surfaces.
export function normalMap(src, strength = 2) {
  const w = src.width, h = src.height, d = src.getContext('2d').getImageData(0, 0, w, h).data;
  const L = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) L[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255;
  const c = canvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h);
  const at = (x, y) => L[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    img.data[i] = (-dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

// Grass: a mown-field detail tile of short strokes in mixed greens and straw, with a matching normal map.
export function grassTexture() {
  const S = 512, c = canvas(S, S), g = c.getContext('2d'), r = rng(3);
  g.fillStyle = '#5f8a3a'; g.fillRect(0, 0, S, S);
  const cols = ['#557f33', '#6a9842', '#4b7330', '#77a14a', '#5d8a38', '#8a9a4c', '#456b2b'];
  for (let i = 0; i < 26000; i++) {
    const x = r() * S, y = r() * S, l = 3 + r() * 7, a = -Math.PI / 2 + (r() - 0.5) * 1.2;
    g.strokeStyle = cols[(r() * cols.length) | 0]; g.globalAlpha = 0.55 + r() * 0.45; g.lineWidth = 0.8 + r() * 1.2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  // wrap the strokes that cross the edges so the tile repeats cleanly
  g.globalAlpha = 1;
  const t = tex(c); t.userData = { normal: normalMap(c, 3) };
  return t;
}

export function asphaltTexture() {
  const S = 512, c = canvas(S, S), g = c.getContext('2d'), r = rng(7);
  g.fillStyle = '#56595c'; g.fillRect(0, 0, S, S);
  // aggregate: lots of little stones, lighter and darker
  for (let i = 0; i < 30000; i++) { const v = 70 + r() * 70 | 0; g.fillStyle = `rgb(${v},${v + 2},${v + 5})`; const sz = 0.8 + r() * 2.2; g.fillRect(r() * S, r() * S, sz, sz); }
  // patches and repairs
  for (let i = 0; i < 18; i++) { const x = r() * S, y = r() * S, rad = 20 + r() * 60, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(${r() < 0.5 ? '30,32,35' : '120,122,124'},0.18)`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  const t = tex(c); t.userData = { normal: normalMap(c, 2.2) };
  return t;
}

export function pavementTexture() {
  const c = canvas(256, 256), g = c.getContext('2d'), r = rng(11);
  g.fillStyle = '#b9b6ae'; g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 3000, ['#b1aea6', '#c2bfb7', '#aaa79f'], 2, r);
  g.strokeStyle = 'rgba(90,90,85,0.35)'; g.lineWidth = 2;
  for (let i = 0; i <= 256; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
  return tex(c);
}

export function waterTexture() {
  const c = canvas(256, 256), g = c.getContext('2d'), r = rng(5);
  g.fillStyle = '#3d7fa8'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 300; i++) { g.strokeStyle = `rgba(${r() > 0.5 ? '200,230,255' : '30,80,120'},${0.15 + r() * 0.2})`; g.lineWidth = 1 + r() * 2; const x = r() * 256, y = r() * 256; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 8, y - 3, x + 16 + r() * 10, y); g.stroke(); }
  return tex(c);
}

// One 3 m x 3 m storey bay of wall: plaster with a sash window. Walls are tinted by vertex colour.
// Row 0 (bottom half of the texture) is the ground floor with a door / shop window; row 1 the upper floors.
export function facadeTexture() {
  const c = canvas(256, 512), g = c.getContext('2d'), r = rng(13);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 512);
  speckle(g, 256, 512, 1500, ['#f2f2f2', '#e9e9e9', '#fafafa'], 2, r);
  // upper storey (top half): sash window
  const win = (x, y, w, h) => {
    g.fillStyle = '#f7f7f2'; g.fillRect(x - 6, y - 6, w + 12, h + 12);
    const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#9fc3dc'); gr.addColorStop(1, '#3d5a70');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.fillStyle = '#f7f7f2'; g.fillRect(x, y + h / 2 - 3, w, 6); g.fillRect(x + w / 2 - 2, y, 4, h);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - 6, y + h + 6, w + 12, 5);
  };
  win(78, 60, 100, 140);
  // ground storey (bottom half): door on the left, window on the right
  g.fillStyle = '#6b4a2f'; g.fillRect(30, 300, 70, 212);
  g.fillStyle = '#4b3220'; g.fillRect(38, 310, 54, 90); g.fillRect(38, 410, 54, 90);
  g.fillStyle = '#d9b44a'; g.beginPath(); g.arc(88, 420, 5, 0, 7); g.fill();
  win(130, 320, 100, 130);
  const t = tex(c); t.userData = { normal: normalMap(c, 1.5) }; return t;
}

export function roofTexture() {
  const c = canvas(256, 256), g = c.getContext('2d'), r = rng(17);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 16) {
    const off = (y / 16) % 2 ? 0 : 16;
    for (let x = -32; x < 256; x += 32) {
      const v = 200 + r() * 55 | 0;
      g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x + off, y, 31, 15);
    }
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y + 14, 256, 2);
  }
  return tex(c);
}

// Leaves: small overlapping leaf shapes in mixed greens with darker gaps, for hedges and tree crowns.
export function leafTexture(base = ['#3e6e2a', '#4f8434', '#5f953c', '#36602a', '#6aa045'], seed = 19) {
  const S = 256, c = canvas(S, S), g = c.getContext('2d'), r = rng(seed);
  g.fillStyle = '#23401a'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) {
    const x = r() * S, y = r() * S, w = 3 + r() * 5, h = 2 + r() * 3, a = r() * Math.PI;
    g.fillStyle = base[(r() * base.length) | 0]; g.globalAlpha = 0.85;
    g.beginPath(); g.ellipse(x, y, w, h, a, 0, Math.PI * 2); g.fill();
    // repeat across the edges
    if (x < 8 || x > S - 8 || y < 8 || y > S - 8) { g.beginPath(); g.ellipse((x + S / 2) % S, (y + S / 2) % S, w, h, a, 0, Math.PI * 2); g.fill(); }
  }
  g.globalAlpha = 1;
  const t = tex(c); t.userData = { normal: normalMap(c, 4) };
  return t;
}
export function hedgeTexture() { return leafTexture(['#3d6c29', '#4a7f32', '#2f5a22', '#58903a', '#44772e'], 19); }

// A shop or place sign: text on a coloured board. Returns { texture, aspect }.
export function signTexture(text, { bg = '#1d3d2c', fg = '#f5e9c8', font = 'Georgia, serif', border = '#c9a54a', sub = '' } = {}) {
  const h = 128;
  const m = canvas(10, 10).getContext('2d');
  m.font = `bold 72px ${font}`;
  const w = Math.max(256, Math.ceil(m.measureText(text).width + 80));
  const c = canvas(w, h), g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = border; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `bold ${sub ? 60 : 72}px ${font}`; g.fillText(text, w / 2, sub ? h / 2 - 14 : h / 2 + 4);
  if (sub) { g.font = `28px ${font}`; g.fillText(sub, w / 2, h / 2 + 36); }
  const t = tex(c, false);
  return { texture: t, aspect: w / h };
}

// Big round badge for a destination: an emoji over a label, drawn for a floating sprite.
export function badgeTexture(emoji, label, colour = '#ff6b35') {
  const c = canvas(512, 640), g = c.getContext('2d');
  g.fillStyle = colour; g.strokeStyle = '#ffffff'; g.lineWidth = 18;
  g.beginPath(); g.arc(256, 230, 200, 0, Math.PI * 2); g.fill(); g.stroke();
  // little pointer under the circle
  g.beginPath(); g.moveTo(196, 410); g.lineTo(256, 480); g.lineTo(316, 410); g.closePath(); g.fill();
  g.font = '230px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(emoji, 256, 245);
  g.font = 'bold 64px "Trebuchet MS", Arial, sans-serif';
  const w = g.measureText(label).width + 50;
  g.fillStyle = 'rgba(255,255,255,0.95)'; roundRect(g, 256 - w / 2, 520, w, 96, 30); g.fill();
  g.fillStyle = '#222'; g.fillText(label, 256, 570);
  return tex(c, false);
}

export function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// One 3.5 m bay of an Irish bungalow front: white dash render, a wide white-framed window with a sill, and a
// beige plinth along the bottom. The top strip is plain render (used for gables and chimneys).
export function bungalowTexture() {
  const c = canvas(512, 512), g = c.getContext('2d'), r = rng(23);
  g.fillStyle = '#f7f6f1'; g.fillRect(0, 0, 512, 512);
  speckle(g, 512, 512, 4000, ['#efeee8', '#fbfbf7', '#e9e8e1'], 2, r);
  // plinth: the bottom 0.45 m of 3 m
  const ph = Math.round(512 * 0.45 / 3);
  g.fillStyle = '#d9cdb4'; g.fillRect(0, 512 - ph, 512, ph);
  g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 512 - ph, 512, 4);
  // window: 2.3 m wide, 1.25 m tall, sill at 0.95 m
  const px = 512 / 3.5, wx = (512 - 2.3 * px) / 2, ww = 2.3 * px, wy = 512 - (0.95 + 1.25) * 512 / 3, wh = 1.25 * 512 / 3;
  g.fillStyle = '#ffffff'; g.fillRect(wx - 8, wy - 8, ww + 16, wh + 16);
  const gr = g.createLinearGradient(0, wy, 0, wy + wh); gr.addColorStop(0, '#8fb3cc'); gr.addColorStop(1, '#2e4555');
  g.fillStyle = gr; g.fillRect(wx, wy, ww, wh);
  g.fillStyle = '#ffffff';
  g.fillRect(wx + ww / 3 - 4, wy, 8, wh); g.fillRect(wx + (2 * ww) / 3 - 4, wy, 8, wh); g.fillRect(wx, wy + wh * 0.3, ww, 6);
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(wx + 6, wy + 6, ww / 3 - 16, wh * 0.25);
  g.fillStyle = '#d6d2c8'; g.fillRect(wx - 14, wy + wh + 8, ww + 28, 12);
  const t = tex(c); t.userData = { normal: normalMap(c, 1.2) }; return t;
}

// concrete roof tiles, grey
export function tileTexture() {
  const c = canvas(256, 256), g = c.getContext('2d'), r = rng(31);
  g.fillStyle = '#76746f'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 21) {
    for (let x = (y / 21) % 2 ? 0 : -16; x < 256; x += 32) {
      const v = 100 + r() * 30 | 0;
      g.fillStyle = `rgb(${v},${v - 2},${v - 6})`; g.fillRect(x + 1, y + 1, 30, 18);
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + 1, y + 16, 30, 4);
    }
  }
  speckle(g, 256, 256, 900, ['rgba(60,90,40,0.25)', 'rgba(40,40,40,0.2)'], 2, r);
  const t = tex(c); t.userData = { normal: normalMap(c, 3) }; return t;
}

// rough granite for the gate pillars and the name stone
export function stoneTexture(text = '') {
  const c = canvas(256, 256), g = c.getContext('2d'), r = rng(37);
  g.fillStyle = '#a7a196'; g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 5000, ['#8f897e', '#b9b3a8', '#9c958a', '#c4bfb4', '#7d776d'], 3, r);
  g.strokeStyle = 'rgba(60,55,50,0.35)'; g.lineWidth = 2;
  for (let i = 0; i < 14; i++) { g.beginPath(); const y = r() * 256; g.moveTo(0, y); g.lineTo(256, y + (r() - 0.5) * 30); g.stroke(); }
  if (text) {
    g.font = 'bold 30px Georgia, serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(50,46,42,0.75)';
    text.split('\n').forEach((t, i, a) => g.fillText(t, 128, 128 + (i - (a.length - 1) / 2) * 36));
  }
  return tex(c);
}

// Red brick, one 3 m storey bay per half like facadeTexture: the top half an upper floor with a white-framed window,
// the bottom half plain brick over a pale rendered plinth (a shopfront goes in front of it).
export function brickTexture() {
  const c = canvas(256, 512), g = c.getContext('2d'), r = rng(41);
  g.fillStyle = '#d9d2c6'; g.fillRect(0, 0, 256, 512); // mortar
  const bh = 512 / 2 / 3 / 13.3; // ~75 mm courses
  for (let y = 0, row = 0; y < 512; y += bh, row++) {
    const off = row % 2 ? 0 : 11;
    for (let x = -22; x < 256; x += 22) {
      const v = r(); g.fillStyle = `rgb(${150 + v * 45 | 0},${62 + v * 25 | 0},${48 + v * 18 | 0})`;
      g.fillRect(x + off + 1, y + 1, 20.5, bh - 1.6);
    }
  }
  // pale plinth at the foot of the ground storey
  g.fillStyle = '#d8d4cb'; g.fillRect(0, 512 - 50, 256, 50);
  speckle(g, 256, 50, 300, ['#cbc6bb', '#e2ded6'], 2, r);
  // upper window
  const x = 70, y = 70, w = 116, h = 120;
  g.fillStyle = '#f4f3ef'; g.fillRect(x - 7, y - 7, w + 14, h + 14);
  const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#9fc0d6'); gr.addColorStop(1, '#3c5566');
  g.fillStyle = gr; g.fillRect(x, y, w, h);
  g.fillStyle = '#f4f3ef'; g.fillRect(x + w / 2 - 3, y, 6, h); g.fillRect(x, y + h * 0.32, w, 5);
  g.fillStyle = '#cfc9bd'; g.fillRect(x - 12, y + h + 7, w + 24, 10);
  const t = tex(c); t.userData = { normal: normalMap(c, 2) }; return t;
}
