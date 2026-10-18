// Garda livery painted onto the i40's body atlas at load time.
// The Blender build exports the atlas layout (which world plane each region projects, and its pixel mapping)
// and guide lines (shoulder crease, belt, roof per 5 cm along the car) as glTF extras on the body, so shapes
// are drawn here in world metres and land exactly where the matching faces are.
//
//   standard      - as photographed on 2018 i40 Tourers: fluorescent yellow band edged in blue along the flanks,
//                   crest on the band, GARDA on the front doors and bonnet, www.garda.ie and the phone number,
//                   red / yellow upward chevrons across the tailgate with GARDA on a yellow bumper strip
//   roadsPolicing - full two-row blue / yellow Battenburg down both sides, Roads Policing / Póilínú Bóithre
//
// Two textures come out: the colour atlas (livery x baked AO, 2048) and a small "props" map for the shader
// (R = retroreflective mask for the yellow / red / blue vinyl, G = roughness).
import * as THREE from 'three';

const YELLOW = '#e4f000', BLUE = '#1a3e8c', RED = '#ee3a1c', WHITE = '#ffffff';
const SANS = '"Arial Black", "Helvetica Neue", Arial, sans-serif';
const PLATE_FONT = '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif';

// world point -> atlas pixel, per region
function mapper(atlas) {
  const comp = (p, k) => (k === 'x' ? p.x : k === 'y' ? p.y : p.z);
  return (name, p) => {
    const r = atlas[name];
    return [r.u0 + (comp(p, r.axes[0]) - r.a0) * r.du, r.v0 + (comp(p, r.axes[1]) - r.b0) * r.dv];
  };
}

// the reading frame of someone looking at each region: world unit vectors for their right and up
const FRAMES = {
  right: { right: { x: 0, y: 1, z: 0 }, up: { x: 0, y: 0, z: 1 } },
  left: { right: { x: 0, y: -1, z: 0 }, up: { x: 0, y: 0, z: 1 } },
  rear: { right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 } },
  front: { right: { x: -1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 } },
  top: { right: { x: -1, y: 0, z: 0 }, up: { x: 0, y: -1, z: 0 } }, // bonnet lettering reads from in front
};

function lookup(guides, key) {
  const ys = guides.y, vs = guides[key];
  return (y) => {
    if (y <= ys[0]) return vs[0];
    if (y >= ys[ys.length - 1]) return vs[vs.length - 1];
    const i = Math.min(ys.length - 2, Math.floor((y - ys[0]) / (ys[1] - ys[0])));
    const t = (y - ys[i]) / (ys[i + 1] - ys[i]);
    return vs[i] + (vs[i + 1] - vs[i]) * t;
  };
}

export function paintLivery({ atlas, guides, ao, variant = 'standard', registration = '142-D-10189' }) {
  const N = atlas.size;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const px = mapper(atlas);
  const crease = lookup(guides, 'crease'), belt = lookup(guides, 'belt'), bottom = lookup(guides, 'bottom');
  const halfW = lookup(guides, 'halfWidth');

  // ---- helpers
  const add = (a, b, k) => ({ x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k });
  const path = (region, pts) => {
    g.beginPath();
    pts.forEach((p, i) => { const [u, v] = px(region, p); i ? g.lineTo(u, v) : g.moveTo(u, v); });
    g.closePath();
  };
  const fill = (region, pts, color) => { path(region, pts); g.fillStyle = color; g.fill(); };
  const line = (region, pts, color, widthM) => {
    g.beginPath();
    pts.forEach((p, i) => { const [u, v] = px(region, p); i ? g.lineTo(u, v) : g.moveTo(u, v); });
    g.strokeStyle = color; g.lineWidth = widthM * atlas.ppm; g.lineJoin = g.lineCap = 'round'; g.stroke();
  };
  // a local drawing frame (1 unit = 1 cm) at world point p, reading as seen in `region`
  const frame = (region, p, draw) => {
    const f = FRAMES[region], k = 0.01;
    const [u, v] = px(region, p), [ur, vr] = px(region, add(p, f.right, k)), [uu, vu] = px(region, add(p, f.up, k));
    g.save();
    g.setTransform(ur - u, vr - v, -(uu - u), -(vu - v), u, v);
    draw();
    g.restore();
  };
  const text = (region, p, s, heightCm, color, { font = SANS, weight = '900', spacing = 0.06, stretch = 1, align = 'center' } = {}) => {
    frame(region, p, () => {
      g.font = `${weight} ${heightCm * 1.36}px ${font}`;
      g.textAlign = align; g.textBaseline = 'alphabetic';
      if ('letterSpacing' in g) g.letterSpacing = `${heightCm * spacing}px`;
      g.scale(stretch, 1);
      g.fillStyle = color; g.fillText(s, 0, 0);
    });
  };
  const sides = [['right', 1], ['left', -1]];
  const Y = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
  const onSide = (s, y, z) => ({ x: s * halfW(y), y, z });

  // ---- base: white paint everywhere; the underside region dark
  g.fillStyle = WHITE; g.fillRect(0, 0, N, N);
  { const [u0, v0, w, h] = atlas.under; g.fillStyle = '#222'; g.fillRect(u0 - 8, v0 - 8, w + 16, h + 16); }

  // ---- panel shut lines (the shell is one piece; the gaps are painted, softly)
  const gap = (region, pts) => { line(region, pts, 'rgba(40,44,48,0.22)', 0.012); line(region, pts, 'rgba(20,22,24,0.75)', 0.004); };
  const [archFy, archZ, archR] = guides.arches[0], [archRy] = guides.arches[1];
  for (const [region, s] of sides) {
    const sill = (y) => bottom(y) + 0.1;
    gap(region, [0.975, 0.66, 0.5].map((z, i) => onSide(s, 0.975 - i * 0.005, i === 0 ? belt(0.975) - 0.01 : z)).concat([onSide(s, 0.96, sill(0.96))]));
    gap(region, [onSide(s, 0.03, belt(0.03) - 0.01), onSide(s, 0.03, sill(0.03))]);
    const rearDoor = [onSide(s, -1.0, belt(-1.0) - 0.01), onSide(s, -1.0, 0.66)];
    for (let a = 0.78; a >= -0.05; a -= 0.08) rearDoor.push(onSide(s, archRy + Math.cos(a) * (archR + 0.045), archZ + Math.sin(a) * (archR + 0.045)));
    gap(region, rearDoor);
    // front wing / bumper split and the tailgate edge wrapping round the rear quarter
    gap(region, [onSide(s, 2.02, crease(2.02) - 0.01), onSide(s, 1.93, archZ + archR + 0.03)]);
    gap(region, Y(-2.2, -2.31, 6).map((y) => onSide(s, y, 0.56 + (y + 2.2) * -0.2)));
    // front-door window sail and mirror base shadow
    fill(region, [onSide(s, 0.93, belt(0.93) - 0.005), onSide(s, 0.7, belt(0.7) - 0.005), onSide(s, 0.7, belt(0.7) - 0.03), onSide(s, 0.93, belt(0.93) - 0.03)], 'rgba(0,0,0,0.12)');
  }
  // bonnet and tailgate shut lines
  const hwTop = (y) => halfW(y) * 0.955 - 0.05;
  for (const s of [-1, 1]) gap('top', Y(0.98, 2.28, 12).map((y) => ({ x: s * hwTop(y), y, z: 1 })));
  gap('top', Y(-1, 1, 10).map((t) => ({ x: t * hwTop(2.28), y: 2.28 + 0.03 * (1 - t * t), z: 1 })));
  for (const s of [-1, 1]) gap('rear', [{ x: s * 0.8, y: -2.4, z: 1.02 }, { x: s * 0.8, y: -2.4, z: 0.58 }]);
  gap('rear', [{ x: -0.8, y: -2.4, z: 0.58 }, { x: 0.8, y: -2.4, z: 0.58 }]);
  gap('rear', [{ x: -0.9, y: -2.4, z: 0.45 }, { x: 0.9, y: -2.4, z: 0.45 }]);

  // ---- livery
  if (variant === 'roadsPolicing') paintBattenburg(); else paintStandard();

  function paintStandard() {
    for (const [region, s] of sides) {
      // the band: follows the shoulder crease; sweeps down to a point under the headlamp
      const ys = Y(-2.42, 2.36, 96);
      const top = (y) => crease(y) - 0.02;
      const depth = (y) => 0.135 * (y > 1.75 ? Math.max(0, 1 - ((y - 1.75) / 0.61) ** 1.4) : 1);
      const bot = (y) => top(y) - depth(y);
      fill(region, [...ys.map((y) => onSide(s, y, top(y))), ...ys.slice().reverse().map((y) => onSide(s, y, bot(y)))], YELLOW);
      line(region, ys.map((y) => onSide(s, y, top(y) + 0.011)), BLUE, 0.02);
      line(region, ys.filter((y) => y < 2.3).map((y) => onSide(s, y, bot(y) - 0.011)), BLUE, 0.02);
      // the thin blue swoosh: from the front wing, above the band, diving across it at the front door
      const sw = Y(2.25, 0.12, 30).map((y) => {
        const t = Math.min(1, Math.max(0, (1.25 - y) / 1.0));
        const dz = 0.03 - (0.03 + depth(y) + 0.011) * (t * t * (3 - 2 * t));
        return onSide(s, y, top(y) + dz);
      });
      line(region, sw, BLUE, 0.012);
      // crest on the band at the front door, GARDA below, web address on the rear door, phone number above
      crest(region, onSide(s, 0.66, top(0.66) - 0.068), 0.078);
      text(region, onSide(s, 0.42, crease(0.42) - 0.385), 'GARDA', 13.5, BLUE, { spacing: 0.1 });
      text(region, onSide(s, -0.52, crease(-0.52) - 0.32), 'www.garda.ie', 5.2, BLUE, { weight: '700', font: 'Arial, sans-serif', spacing: 0.02 });
      text(region, onSide(s, -1.5, crease(-1.5) + 0.028), '☎ 1 800 666 111', 4.2, BLUE, { weight: '700', font: 'Arial, sans-serif', spacing: 0.02 });
      if (s < 0) { // fuel flap on the left rear quarter
        const fy = -1.62, fz = top(-1.62) - 0.068;
        g.save(); path(region, [onSide(s, fy - 0.07, fz - 0.055), onSide(s, fy + 0.07, fz - 0.055), onSide(s, fy + 0.07, fz + 0.055), onSide(s, fy - 0.07, fz + 0.055)]);
        g.strokeStyle = 'rgba(20,22,24,0.7)'; g.lineWidth = 1.4; g.stroke(); g.restore();
        text(region, onSide(s, fy, fz - 0.035), 'DIESEL', 1.8, BLUE, { weight: '700', font: 'Arial, sans-serif' });
      }
    }
    // bonnet
    text('top', { x: 0, y: 1.97, z: 1 }, 'GARDA', 15, BLUE, { spacing: 0.1, stretch: 1.05 });
    paintRear();
  }

  function paintBattenburg() {
    for (const [region, s] of sides) {
      const lo = (y) => Math.max(bottom(y) + 0.12, 0.33), hi = (y) => crease(y) - 0.005;
      const mid = (y) => (lo(y) + hi(y)) / 2;
      const block = 0.6, y0 = -2.4, y1 = 2.3;
      for (let i = 0, y = y0; y < y1; i++, y += block) {
        const ya = y, yb = Math.min(y1, y + block), ys = Y(ya, yb, 6);
        for (const row of [0, 1]) {
          const a = row ? mid : lo, b = row ? hi : mid;
          fill(region, [...ys.map((yy) => onSide(s, yy, a(yy))), ...ys.slice().reverse().map((yy) => onSide(s, yy, b(yy)))], (i + row) % 2 ? BLUE : YELLOW);
        }
      }
      line(region, Y(y0, y1, 60).map((y) => onSide(s, y, hi(y) + 0.008)), BLUE, 0.016);
      crest(region, onSide(s, 0.72, crease(0.72) + 0.06), 0.05);
      // GARDA on a white panel across the front door (the Battenburg would swallow it otherwise)
      fill(region, Y(0.02, 0.9, 8).map((y) => onSide(s, y, mid(y) + 0.1)).concat(Y(0.9, 0.02, 8).map((y) => onSide(s, y, mid(y) - 0.1))), WHITE);
      text(region, onSide(s, 0.46, mid(0.46) - 0.055), 'GARDA', 12, BLUE, { spacing: 0.1 });
      text(region, onSide(s, -0.55, crease(-0.55) + 0.075), 'ROADS POLICING', 3.8, BLUE, { weight: '800', font: 'Arial, sans-serif', spacing: 0.04 });
      text(region, onSide(s, -0.55, crease(-0.55) + 0.022), 'PÓILÍNÚ BÓITHRE', 3.8, BLUE, { weight: '800', font: 'Arial, sans-serif', spacing: 0.04 });
    }
    // bonnet: GARDA and the unit name on a yellow panel
    fill('top', [{ x: -0.62, y: 1.45 }, { x: 0.62, y: 1.45 }, { x: 0.56, y: 2.22 }, { x: -0.56, y: 2.22 }].map((p) => ({ ...p, z: 1 })), YELLOW);
    text('top', { x: 0, y: 1.98, z: 1 }, 'GARDA', 15, BLUE, { spacing: 0.1 });
    text('top', { x: 0, y: 1.7, z: 1 }, 'ROADS POLICING', 5, BLUE, { weight: '800', font: 'Arial, sans-serif' });
    paintRear();
  }

  function paintRear() {
    // upward-pointing red / yellow chevrons across the tailgate and bumper, clipped to the rear face
    const x0 = -0.9, x1 = 0.9, z0 = 0.56, z1 = 0.9, w = 0.12, slope = 0.75;
    g.save();
    path('rear', [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }].map((p) => ({ ...p, y: -2.4 })));
    g.clip();
    for (let k = 0, cz = z0 - 0.1 - slope * x1; cz < z1 + 0.1; k++, cz += w) {
      const pts = [{ x: x0, z: cz - slope * -x0 }, { x: 0, z: cz }, { x: x1, z: cz - slope * x1 }, { x: x1, z: cz - slope * x1 + w }, { x: 0, z: cz + w }, { x: x0, z: cz - slope * -x0 + w }];
      fill('rear', pts.map((p) => ({ ...p, y: -2.4 })), k % 2 ? RED : YELLOW);
    }
    g.restore();
    fill('rear', [{ x: -0.9, z: 0.45 }, { x: 0.9, z: 0.45 }, { x: 0.9, z: 0.555 }, { x: -0.9, z: 0.555 }].map((p) => ({ ...p, y: -2.4 })), YELLOW);
    text('rear', { x: 0, y: -2.4, z: 0.468 }, 'GARDA', 7.2, BLUE, { spacing: 0.12, stretch: 1.25 });
    // the rear corners wrap: carry the band's colours round from the sides
    for (const s of [-1, 1]) fill('rear', [{ x: s * 0.9, z: 0.8 }, { x: s * 0.96, z: 0.8 }, { x: s * 0.96, z: 0.93 }, { x: s * 0.9, z: 0.93 }].map((p) => ({ ...p, y: -2.4 })), YELLOW);
  }

  function crest(region, p, r) {
    // An Garda Síochána badge: gold ring with rays round a blue disc and a pale centre
    frame(region, p, () => {
      const R = r * 100;
      g.fillStyle = '#c9a23a';
      g.beginPath();
      for (let i = 0; i < 32; i++) { const a = (i / 32) * Math.PI * 2, rr = i % 2 ? R : R * 0.86; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      g.closePath(); g.fill();
      g.fillStyle = '#123a7a'; g.beginPath(); g.arc(0, 0, R * 0.72, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#e8cf6a'; g.lineWidth = R * 0.08; g.beginPath(); g.arc(0, 0, R * 0.56, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#e8cf6a'; g.beginPath(); g.arc(0, 0, R * 0.2, 0, Math.PI * 2); g.fill();
    });
  }

  // ---- baked ambient occlusion multiplied into the body regions (before the plates, which it does not cover)
  if (ao) {
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = 0.8; // the bake is a little heavy at region seams
    g.drawImage(ao, 0, 0, N, N);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  // ---- plates and the lightbar sign (flat rects in the atlas)
  plate(atlas.plate_rear); plate(atlas.plate_front);
  {
    const [u0, v0, w, h] = atlas.lightbar;
    g.fillStyle = WHITE; g.fillRect(u0, v0, w, h);
    g.fillStyle = BLUE; g.font = `900 ${h * 0.72}px ${SANS}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('GARDA', u0 + w / 2, v0 + h * 0.55);
  }
  function plate([u0, v0, w, h]) {
    // Irish registration: reflective white, blue EU band with the star ring and IRL, county name above
    g.fillStyle = '#fbfbf6'; g.fillRect(u0, v0, w, h);
    g.strokeStyle = '#111'; g.lineWidth = 2; g.strokeRect(u0 + 2, v0 + 2, w - 4, h - 4);
    const bw = w * 0.085;
    g.fillStyle = '#1f3fa6'; g.fillRect(u0 + 3, v0 + 3, bw, h - 6);
    g.fillStyle = '#ffd200';
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.arc(u0 + 3 + bw / 2 + Math.cos(a) * bw * 0.28, v0 + h * 0.34 + Math.sin(a) * bw * 0.28, 1.6, 0, 7); g.fill(); }
    g.fillStyle = WHITE; g.font = `700 ${h * 0.24}px Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('IRL', u0 + 3 + bw / 2, v0 + h * 0.76);
    g.fillStyle = '#111';
    g.font = `700 ${h * 0.12}px Arial, sans-serif`;
    g.fillText('BAILE ÁTHA CLIATH', u0 + bw + (w - bw) / 2, v0 + h * 0.14);
    g.save();
    g.translate(u0 + bw + (w - bw) / 2, v0 + h * 0.6); g.scale(0.78, 1);
    g.font = `700 ${h * 0.64}px ${PLATE_FONT}`;
    if ('letterSpacing' in g) g.letterSpacing = `${h * 0.02}px`;
    g.fillText(registration, 0, 0);
    g.restore();
  }

  // ---- props map (512): retroreflective mask from the vinyl colours, and roughness
  const P = 512, pc = document.createElement('canvas');
  pc.width = pc.height = P;
  const pg = pc.getContext('2d', { willReadFrequently: true });
  pg.drawImage(c, 0, 0, P, P);
  const img = pg.getImageData(0, 0, P, P), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gg = d[i + 1], b = d[i + 2], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    const sat = mx > 0 ? (mx - mn) / mx : 0;
    const vinyl = sat > 0.45 ? 1 : 0;
    d[i] = vinyl * 255;                 // R: retroreflective vinyl
    d[i + 1] = Math.round((vinyl ? 0.26 : 0.35) * 255); // G: roughness (vinyl a touch glossier)
    d[i + 2] = 0; d[i + 3] = 255;
  }
  pg.putImageData(img, 0, 0);

  const colour = new THREE.CanvasTexture(c);
  colour.colorSpace = THREE.SRGBColorSpace;
  colour.flipY = false;
  colour.anisotropy = 8;
  const props = new THREE.CanvasTexture(pc);
  props.flipY = false;
  return { colour, props };
}
