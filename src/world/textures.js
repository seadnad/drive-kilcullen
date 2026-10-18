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

export function grassTexture() {
  const c = canvas(512, 512), g = c.getContext('2d'), r = rng(3);
  g.fillStyle = '#6fa64a'; g.fillRect(0, 0, 512, 512);
  speckle(g, 512, 512, 9000, ['#5f9a3e', '#7cb255', '#679f45', '#86ba5d', '#5a8f3a'], 3, r);
  // soft mottling
  for (let i = 0; i < 40; i++) {
    const x = r() * 512, y = r() * 512, rad = 30 + r() * 70, gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, r() > 0.5 ? 'rgba(140,190,90,0.25)' : 'rgba(70,120,40,0.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  return tex(c);
}

export function asphaltTexture() {
  const c = canvas(256, 256), g = c.getContext('2d'), r = rng(7);
  g.fillStyle = '#5b5e62'; g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 6000, ['#53565a', '#64676b', '#4c4f53', '#6c6f73'], 2, r);
  return tex(c);
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
  return tex(c);
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

export function hedgeTexture() {
  const c = canvas(128, 128), g = c.getContext('2d'), r = rng(19);
  g.fillStyle = '#3f7a2c'; g.fillRect(0, 0, 128, 128);
  speckle(g, 128, 128, 2500, ['#356b25', '#4d8c36', '#2e5e20', '#5a9a3f'], 4, r);
  return tex(c);
}

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
