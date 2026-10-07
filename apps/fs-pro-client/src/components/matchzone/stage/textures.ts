/**
 * Procedural textures for the stadium, drawn on canvases once at load: the
 * pitch (mowing stripes, regulation markings, goalmouth wear), grass micro
 * relief, the goal net, the ball's panels, LED ad boards and the shirt
 * number atlas. No image downloads - everything is authored here.
 */
import * as THREE from 'three';
import { PITCH_LENGTH, PITCH_WIDTH, hash01 } from '../playback';

/** The grass plane extends past the touchlines (apron). */
export const TURF_LENGTH = PITCH_LENGTH + 16;
export const TURF_WIDTH = PITCH_WIDTH + 14;

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function finish(c: HTMLCanvasElement, opts: { srgb?: boolean; repeat?: boolean; anisotropy?: number } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  if (opts.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = opts.anisotropy ?? 8;
  t.needsUpdate = true;
  return t;
}

/** Seeded noise, so the pitch looks the same every match. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The playing surface: alternating mowing bands with a cross-cut, painted
 * markings to regulation dimensions, and wear in the goalmouths and centre
 * circle where play concentrates.
 */
export function pitchTexture(): THREE.CanvasTexture {
  const PX = 18; // pixels per metre
  const W = Math.round(TURF_LENGTH * PX);
  const H = Math.round(TURF_WIDTH * PX);
  const [c, g] = canvas(W, H);
  const ox = ((TURF_LENGTH - PITCH_LENGTH) / 2) * PX;
  const oy = ((TURF_WIDTH - PITCH_WIDTH) / 2) * PX;
  const m = (v: number) => v * PX;

  // Base grass + apron.
  g.fillStyle = '#5ba83d';
  g.fillRect(0, 0, W, H);

  // Mowing: 18 bands along the length, alternating light/dark, plus a faint
  // cross-cut that gives the classic chequer.
  const bands = 18;
  const bw = m(PITCH_LENGTH) / bands;
  for (let i = 0; i < bands; i++) {
    g.fillStyle = i % 2 ? '#78c64e' : '#66b543';
    g.fillRect(ox + i * bw, oy, bw + 1, m(PITCH_WIDTH));
  }
  const crossBands = 12;
  const ch = m(PITCH_WIDTH) / crossBands;
  for (let i = 0; i < crossBands; i++) {
    g.fillStyle = i % 2 ? 'rgba(255,255,230,0.05)' : 'rgba(30,60,10,0.035)';
    g.fillRect(ox, oy + i * ch, m(PITCH_LENGTH), ch + 1);
  }

  // Blade-level speckle so the surface never reads as flat colour.
  const r = rng(7);
  for (let i = 0; i < 40000; i++) {
    const x = r() * W;
    const y = r() * H;
    g.fillStyle = r() < 0.5 ? 'rgba(40,90,20,0.12)' : 'rgba(190,235,130,0.12)';
    g.fillRect(x, y, 2, 2);
  }

  // Wear: goalmouths and the centre circle are scuffed lighter/browner.
  const wear = (x: number, y: number, rx: number, ry: number, a: number) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
    grad.addColorStop(0, `rgba(196,170,100,${a})`);
    grad.addColorStop(1, 'rgba(196,170,100,0)');
    g.save();
    g.translate(x, y);
    g.scale(1, ry / rx);
    g.translate(-x, -y);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, rx, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };
  wear(ox + m(3), oy + m(PITCH_WIDTH / 2), m(7), m(9), 0.32);
  wear(ox + m(PITCH_LENGTH - 3), oy + m(PITCH_WIDTH / 2), m(7), m(9), 0.32);
  wear(ox + m(PITCH_LENGTH / 2), oy + m(PITCH_WIDTH / 2), m(6), m(6), 0.16);

  // Markings.
  g.strokeStyle = '#fffbea';
  g.fillStyle = '#fffbea';
  g.lineWidth = m(0.16);
  const L = PITCH_LENGTH;
  const Wd = PITCH_WIDTH;
  const P = (x: number, y: number): [number, number] => [ox + m(x), oy + m(y)];
  const rect = (x: number, y: number, w: number, h: number) => g.strokeRect(...P(x, y), m(w), m(h));
  const circle = (x: number, y: number, rad: number, a0 = 0, a1 = Math.PI * 2) => {
    g.beginPath();
    g.arc(...P(x, y), m(rad), a0, a1);
    g.stroke();
  };
  const dot = (x: number, y: number, rad: number) => {
    g.beginPath();
    g.arc(...P(x, y), m(rad), 0, Math.PI * 2);
    g.fill();
  };

  rect(0, 0, L, Wd);
  g.beginPath();
  g.moveTo(...P(L / 2, 0));
  g.lineTo(...P(L / 2, Wd));
  g.stroke();
  circle(L / 2, Wd / 2, 9.15);
  dot(L / 2, Wd / 2, 0.22);
  for (const end of [0, 1]) {
    const x0 = end ? L - 16.5 : 0;
    rect(x0, Wd / 2 - 20.16, 16.5, 40.32);
    rect(end ? L - 5.5 : 0, Wd / 2 - 9.16, 5.5, 18.32);
    const spot = end ? L - 11 : 11;
    dot(spot, Wd / 2, 0.22);
    // Penalty arc: the part of the 9.15 m circle outside the box.
    const ang = Math.acos(5.5 / 9.15);
    if (end) circle(spot, Wd / 2, 9.15, Math.PI - ang, Math.PI + ang);
    else circle(spot, Wd / 2, 9.15, -ang, ang);
  }
  // Corner arcs.
  for (const [x, y, a0] of [[0, 0, 0], [L, 0, Math.PI / 2], [L, Wd, Math.PI], [0, Wd, -Math.PI / 2]] as const) {
    circle(x, y, 1, a0, a0 + Math.PI / 2);
  }
  // Technical areas (dashed) by the halfway line on the near side.
  g.setLineDash([m(0.6), m(0.4)]);
  g.lineWidth = m(0.08);
  rect(L / 2 - 14, Wd + 1, 10, 4);
  rect(L / 2 + 4, Wd + 1, 10, 4);
  g.setLineDash([]);

  return finish(c, { anisotropy: 16 });
}

/** Tiling blade relief for the turf's bump map (close-up readability). */
export function grassDetailTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#808080';
  g.fillRect(0, 0, 256, 256);
  const r = rng(11);
  for (let i = 0; i < 4200; i++) {
    const x = r() * 256;
    const y = r() * 256;
    const v = 90 + Math.floor(r() * 120);
    g.strokeStyle = `rgb(${v},${v},${v})`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 2, y - 2 - r() * 3);
    g.stroke();
  }
  const t = finish(c, { srgb: false, repeat: true });
  t.repeat.set(TURF_LENGTH / 2.5, TURF_WIDTH / 2.5);
  return t;
}

/** Goal net mesh: a knotted square grid with alpha, tiled across the net. */
export function netTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(246,246,240,0.95)';
  g.lineWidth = 3;
  g.beginPath();
  for (let i = 0; i <= 128; i += 32) {
    g.moveTo(i, 0);
    g.lineTo(i, 128);
    g.moveTo(0, i);
    g.lineTo(128, i);
  }
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,1)';
  for (let x = 0; x <= 128; x += 32) for (let y = 0; y <= 128; y += 32) g.fillRect(x - 2.5, y - 2.5, 5, 5);
  return finish(c, { repeat: true });
}

/** Classic 32-panel ball: white panels, dark pentagons, seams. */
export function ballTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 256);
  g.fillStyle = '#f4f4ef';
  g.fillRect(0, 0, 512, 256);
  const pent = (cx: number, cy: number, rad: number) => {
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      g.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad * 0.9);
    }
    g.closePath();
    g.fillStyle = '#1b1d24';
    g.fill();
  };
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 6; col++) {
      pent(col * 86 + (row % 2 ? 43 : 0) + 20, 40 + row * 88, 22);
    }
  }
  g.strokeStyle = 'rgba(60,60,70,0.35)';
  g.lineWidth = 2;
  for (let i = 0; i < 12; i++) {
    g.beginPath();
    g.moveTo(i * 43, 0);
    g.lineTo(i * 43 + 30, 256);
    g.stroke();
  }
  return finish(c);
}

/**
 * Pitchside boards: a strip of painted panels (club marks and the game's
 * own signage) in the campus palette, scrolled by texture offset.
 */
export function adBoardTexture(homeCode: string, awayCode: string, accents: [string, string]): THREE.CanvasTexture {
  const panels = [
    { text: 'FS PRO', bg: '#fdf4df', fg: '#5e3b22' },
    { text: homeCode, bg: accents[0], fg: '#ffffff' },
    { text: 'Campus League', bg: '#f5b82e', fg: '#5e3b22' },
    { text: 'Matchzone', bg: '#3a8ee0', fg: '#ffffff' },
    { text: awayCode, bg: accents[1], fg: '#ffffff' },
    { text: 'Fan Zone', bg: '#5cc23a', fg: '#ffffff' },
  ];
  const PW = 512;
  const [c, g] = canvas(PW * panels.length, 64);
  panels.forEach((p, i) => {
    g.fillStyle = shade(p.bg, -0.25);
    g.fillRect(i * PW, 0, PW, 64);
    g.fillStyle = p.bg;
    g.beginPath();
    g.roundRect(i * PW + 6, 5, PW - 12, 54, 14);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(i * PW + 14, 9, PW - 28, 8);
    g.fillStyle = p.fg;
    g.font = '700 38px Fredoka, "Arial Rounded MT Bold", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(p.text, i * PW + PW / 2, 34);
  });
  const t = finish(c, { repeat: true });
  return t;
}

/** Shirt numbers 0-99 in a 10x10 atlas, white on transparent (tinted per
 * kit in the material). */
export function numberAtlasTexture(): THREE.CanvasTexture {
  const cell = 64;
  const [c, g] = canvas(cell * 10, cell * 10);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 ${cell * 0.66}px Fredoka, "Arial Rounded MT Bold", sans-serif`;
  for (let n = 0; n < 100; n++) {
    const x = (n % 10) * cell + cell / 2;
    const y = Math.floor(n / 10) * cell + cell / 2 + 2;
    g.lineWidth = 6;
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.strokeText(String(n), x, y);
    g.fillStyle = '#ffffff';
    g.fillText(String(n), x, y);
  }
  const t = finish(c);
  t.flipY = false;
  return t;
}

/** Lighten (amt > 0) or darken a #rrggbb colour. */
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  const r = ch((n >> 16) & 255);
  const gg = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (gg << 8) | b).toString(16).padStart(6, '0')}`;
}

/** A stable per-player skin tone. */
export function skinTone(id: string): THREE.Color {
  // Same tones as the campus walkers (cozy/scene/world.ts).
  const tones = ['#f6d3b3', '#e8b48f', '#c98e64', '#a06a43', '#6e4428', '#4a2e1c'];
  return new THREE.Color(tones[Math.floor(hash01(id + 'skin') * tones.length)]);
}

export function hairTone(id: string): THREE.Color {
  const tones = ['#2b1d14', '#5a3a22', '#9b6a3c', '#e2c06b', '#c2522d', '#1a1a1a', '#dcdcdc'];
  return new THREE.Color(tones[Math.floor(hash01(id + 'hair') * tones.length)]);
}
