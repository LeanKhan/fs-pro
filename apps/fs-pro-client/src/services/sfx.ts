/**
 * Game sound effects, synthesised with Web Audio: no files to load, nothing
 * to license. One switch (Settings → Sound), remembered per device. The
 * context starts on the first user gesture, as browsers require.
 *
 * Usage: `sfx.play('coin')`. Unknown or muted calls are no-ops, so gameplay
 * code can call it freely.
 */

export type Sfx =
  | 'tap'
  | 'open'
  | 'close'
  | 'coin'
  | 'collect'
  | 'build'
  | 'complete'
  | 'whistle'
  | 'goal'
  | 'concede'
  | 'win'
  | 'draw'
  | 'loss'
  | 'levelup'
  | 'error'
  | 'star';

const KEY = 'fspro_sfx';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let enabled = read();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

function audio(): AudioContext | null {
  if (!enabled || typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    // A gentle limiter so stacked effects never clip.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 6;
    master.connect(comp).connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** One enveloped oscillator note. */
function tone(
  c: AudioContext,
  freq: number,
  at: number,
  dur: number,
  opts: { type?: OscillatorType; gain?: number; to?: number; attack?: number; vibrato?: number } = {}
) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = opts.type ?? 'sine';
  o.frequency.setValueAtTime(freq, at);
  if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, at + dur);
  if (opts.vibrato) {
    const lfo = c.createOscillator();
    const lg = c.createGain();
    lfo.frequency.value = opts.vibrato;
    lg.gain.value = freq * 0.03;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(at);
    lfo.stop(at + dur + 0.05);
  }
  const peak = opts.gain ?? 0.3;
  const atk = opts.attack ?? 0.008;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(master!);
  o.start(at);
  o.stop(at + dur + 0.05);
}

/** A filtered noise burst (thuds, whooshes, crowds). */
function hiss(
  c: AudioContext,
  at: number,
  dur: number,
  opts: { freq?: number; q?: number; type?: BiquadFilterType; gain?: number; attack?: number; sweepTo?: number } = {}
) {
  const src = c.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = opts.type ?? 'bandpass';
  f.frequency.setValueAtTime(opts.freq ?? 1000, at);
  if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, at + dur);
  f.Q.value = opts.q ?? 1;
  const g = c.createGain();
  const peak = opts.gain ?? 0.3;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + (opts.attack ?? 0.01));
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(master!);
  src.start(at, Math.random());
  src.stop(at + dur + 0.05);
}

const N = (semi: number) => 440 * Math.pow(2, (semi - 9) / 12); // semitones from C4 ≈ 261.6

const RECIPES: Record<Sfx, (c: AudioContext, t: number) => void> = {
  tap: (c, t) => tone(c, 620, t, 0.07, { type: 'triangle', gain: 0.18, to: 880 }),
  open: (c, t) => {
    hiss(c, t, 0.18, { freq: 900, sweepTo: 2400, q: 0.8, gain: 0.12, attack: 0.04 });
    tone(c, 520, t, 0.1, { type: 'triangle', gain: 0.12, to: 780 });
  },
  close: (c, t) => hiss(c, t, 0.14, { freq: 2200, sweepTo: 700, q: 0.8, gain: 0.1, attack: 0.02 }),
  coin: (c, t) => {
    tone(c, N(23), t, 0.08, { type: 'square', gain: 0.08 });
    tone(c, N(28), t + 0.07, 0.28, { type: 'square', gain: 0.08 });
  },
  collect: (c, t) => {
    for (let i = 0; i < 6; i++) {
      const at = t + i * 0.06 + Math.random() * 0.02;
      tone(c, N(23 + (i % 3) * 2), at, 0.08, { type: 'square', gain: 0.06 });
      tone(c, N(28 + (i % 2) * 3), at + 0.05, 0.2, { type: 'square', gain: 0.06 });
    }
    hiss(c, t, 0.5, { freq: 6000, q: 2, gain: 0.05, attack: 0.05 });
  },
  build: (c, t) => {
    for (let i = 0; i < 3; i++) {
      hiss(c, t + i * 0.16, 0.08, { type: 'lowpass', freq: 700, gain: 0.35, attack: 0.002 });
      tone(c, 180, t + i * 0.16, 0.08, { type: 'triangle', gain: 0.2, to: 90 });
    }
  },
  complete: (c, t) => {
    [0, 4, 7, 12].forEach((s, i) => tone(c, N(12 + s), t + i * 0.09, 0.3, { type: 'triangle', gain: 0.18 }));
    hiss(c, t + 0.3, 0.6, { freq: 7000, q: 3, gain: 0.04, attack: 0.1 });
  },
  whistle: (c, t) => {
    tone(c, 2900, t, 0.16, { gain: 0.14, vibrato: 38 });
    tone(c, 2900, t + 0.22, 0.16, { gain: 0.14, vibrato: 38 });
    tone(c, 2900, t + 0.44, 0.55, { gain: 0.15, vibrato: 38 });
  },
  goal: (c, t) => {
    hiss(c, t, 2.2, { freq: 1100, q: 0.5, gain: 0.32, attack: 0.25 });
    hiss(c, t + 0.1, 1.8, { freq: 420, q: 0.6, gain: 0.2, attack: 0.3 });
    tone(c, N(7), t + 0.05, 0.5, { type: 'sawtooth', gain: 0.06 });
    tone(c, N(12), t + 0.05, 0.5, { type: 'sawtooth', gain: 0.05 });
  },
  concede: (c, t) => {
    hiss(c, t, 1.2, { freq: 500, q: 0.7, gain: 0.14, attack: 0.15, sweepTo: 300 });
    tone(c, N(0), t, 0.5, { type: 'triangle', gain: 0.1, to: N(-5) });
  },
  win: (c, t) => {
    [0, 4, 7].forEach((s, i) => tone(c, N(12 + s), t + i * 0.12, 0.22, { type: 'square', gain: 0.07 }));
    [0, 4, 7, 12].forEach((s) => tone(c, N(12 + s), t + 0.4, 0.9, { type: 'triangle', gain: 0.1, attack: 0.02 }));
    hiss(c, t + 0.3, 1.6, { freq: 1000, q: 0.5, gain: 0.14, attack: 0.3 });
  },
  draw: (c, t) => {
    tone(c, N(7), t, 0.25, { type: 'triangle', gain: 0.14 });
    tone(c, N(9), t + 0.22, 0.45, { type: 'triangle', gain: 0.14 });
  },
  loss: (c, t) => {
    [7, 3, 0].forEach((s, i) => tone(c, N(7 + s), t + i * 0.22, 0.4, { type: 'triangle', gain: 0.14 }));
    tone(c, N(-5), t + 0.66, 0.8, { type: 'sine', gain: 0.12 });
  },
  levelup: (c, t) => {
    [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => tone(c, N(12 + s), t + i * 0.07, 0.25, { type: 'square', gain: 0.06 }));
    [12, 16, 19, 24].forEach((s) => tone(c, N(12 + s), t + 0.55, 1.1, { type: 'triangle', gain: 0.09, attack: 0.03 }));
    hiss(c, t + 0.4, 1.2, { freq: 8000, q: 4, gain: 0.05, attack: 0.1 });
  },
  error: (c, t) => {
    tone(c, 160, t, 0.12, { type: 'square', gain: 0.08 });
    tone(c, 130, t + 0.12, 0.18, { type: 'square', gain: 0.08 });
  },
  star: (c, t) => {
    tone(c, N(24), t, 0.12, { type: 'triangle', gain: 0.16 });
    tone(c, N(31), t + 0.06, 0.35, { type: 'triangle', gain: 0.14 });
    hiss(c, t, 0.3, { freq: 9000, q: 4, gain: 0.05 });
  },
};

/** Same sound again within this window is dropped (seeking a replay can
 * fire a run of events at once). */
const MIN_GAP_MS = 220;
const lastPlayed = new Map<Sfx, number>();

export const sfx = {
  play(name: Sfx, delayMs = 0) {
    const now = performance.now() + delayMs;
    if (now - (lastPlayed.get(name) ?? -1e9) < MIN_GAP_MS && name !== 'star') return;
    lastPlayed.set(name, now);
    const c = audio();
    if (!c || !master) return;
    try {
      RECIPES[name]?.(c, c.currentTime + 0.01 + delayMs / 1000);
    } catch {
      // Audio is a nicety; never break gameplay over it.
    }
  },
  get enabled() {
    return enabled;
  },
  set enabled(on: boolean) {
    enabled = on;
    try {
      localStorage.setItem(KEY, on ? 'on' : 'off');
    } catch {
      // Private mode: the choice lasts this session.
    }
    if (!on && ctx) void ctx.suspend();
    if (on) this.play('tap');
  },
};
