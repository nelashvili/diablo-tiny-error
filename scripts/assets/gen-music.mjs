// Procedural, seamless-loop music generator (original work, released CC0 by this project).
// Usage: node scripts/assets/gen-music.mjs   (needs ffmpeg for ogg/mp3 encoding)
// Deterministic: same output every run. Every note is written circularly so loops are click-free.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'public/assets/audio/music');
fs.mkdirSync(OUT, { recursive: true });
const SR = 32000;

function rng(seed) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

class Track {
  constructor(seconds) {
    this.n = Math.round(seconds * SR);
    this.l = new Float32Array(this.n);
    this.r = new Float32Array(this.n);
  }
  add(t0, dur, fn, pan = 0, gain = 1) {
    const start = Math.round(t0 * SR);
    const len = Math.round(dur * SR);
    const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
    const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
    for (let i = 0; i < len; i++) {
      const v = fn(i / SR, i / len);
      const k = (start + i) % this.n;
      this.l[k] += v * gl;
      this.r[k] += v * gr;
    }
  }
  /** Schroeder-ish circular reverb (wet mixed in). */
  reverb(mix, size = 1) {
    const delays = [1557, 1617, 1491, 1422, 1277, 1356].map((d) => Math.round(d * size));
    for (const ch of [this.l, this.r]) {
      const src = Float32Array.from(ch);
      const wet = new Float32Array(this.n);
      for (const d of delays) {
        // circular feedback comb, 3 passes ~ decay
        let g = 1;
        for (let p = 1; p <= 14; p++) {
          g *= 0.78;
          const off = d * p;
          for (let i = 0; i < this.n; i++) wet[(i + off) % this.n] += src[i] * g * 0.18;
        }
      }
      for (let i = 0; i < this.n; i++) ch[i] = src[i] * (1 - mix * 0.5) + wet[i] * mix;
    }
  }
  normalize(peak = 0.85) {
    let m = 0;
    for (let i = 0; i < this.n; i++) m = Math.max(m, Math.abs(this.l[i]), Math.abs(this.r[i]));
    const g = peak / m;
    for (let i = 0; i < this.n; i++) {
      this.l[i] *= g;
      this.r[i] *= g;
    }
  }
  wav() {
    const buf = Buffer.alloc(44 + this.n * 4);
    buf.write('RIFF', 0);
    buf.writeUInt32LE(36 + this.n * 4, 4);
    buf.write('WAVEfmt ', 8);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(2, 22);
    buf.writeUInt32LE(SR, 24);
    buf.writeUInt32LE(SR * 4, 28);
    buf.writeUInt16LE(4, 32);
    buf.writeUInt16LE(16, 34);
    buf.write('data', 36);
    buf.writeUInt32LE(this.n * 4, 40);
    for (let i = 0; i < this.n; i++) {
      buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, this.l[i])) * 32767), 44 + i * 4);
      buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, this.r[i])) * 32767), 46 + i * 4);
    }
    return buf;
  }
}

const env = (p, a, r) => (p < a ? p / a : p > 1 - r ? Math.max(0, (1 - p) / r) : 1);
const saw = (ph) => 2 * (ph - Math.floor(ph + 0.5));
const tri = (ph) => 2 * Math.abs(saw(ph)) - 1;
const sine = (ph) => Math.sin(2 * Math.PI * ph);

/** soft pad: two detuned triangles + sine, slow attack/release */
const pad =
  (f, a = 0.3, r = 0.4) =>
  (t, p) =>
    env(p, a, r) * 0.33 * (tri(f * t) + tri(f * 1.004 * t) + sine(f * 0.5 * t) * 0.8);
/** plucked / bell tone */
const pluck =
  (f, decay = 3) =>
  (t) =>
    Math.exp(-t * decay) * (sine(f * t) + 0.35 * sine(2 * f * t) + 0.15 * sine(3.01 * f * t));
const bell = (f) => (t) =>
  Math.exp(-t * 1.6) * (sine(f * t) * 0.6 + sine(f * 2.76 * t) * 0.25 + sine(f * 5.4 * t) * 0.1);
const bass =
  (f, decay = 2) =>
  (t) =>
    Math.exp(-t * decay) * (sine(f * t) * 0.9 + tri(f * 2 * t) * 0.25);
const brass = (f) => (t, p) => {
  const lp = 0.4 + 0.6 * Math.min(1, t * 6);
  return env(p, 0.08, 0.2) * 0.22 * (saw(f * t) * lp + saw(f * 1.006 * t) * lp);
};
function noiseHit(seed, dur, decay, hp = 0) {
  const r = rng(seed);
  let prev = 0;
  return (t) => {
    const x = r() * 2 - 1;
    const y = hp ? x - prev * hp : x;
    prev = x;
    return y * Math.exp(-t * decay);
  };
}

function town() {
  // D dorian, 72 bpm, 16 bars of 4 beats -> 53.3 s
  const bpm = 72;
  const beat = 60 / bpm;
  const bars = 16;
  const T = new Track(bars * 4 * beat);
  const prog = [
    [50, 57, 62, 65], // Dm
    [46, 57, 62, 65], // Bb/D-ish
    [48, 55, 60, 64], // C
    [43, 55, 62, 65], // Gm/F
  ];
  const r = rng(11);
  const scale = [62, 64, 65, 67, 69, 71, 72, 74];
  for (let b = 0; b < bars; b++) {
    const ch = prog[b % 4];
    const t0 = b * 4 * beat;
    ch.forEach((n, i) => T.add(t0, 4 * beat * 1.05, pad(mtof(n + (i ? 12 : 0))), (i - 1.5) * 0.4, 0.5));
    T.add(t0, 2.4 * beat, bass(mtof(ch[0] - 12)), 0, 0.9);
    T.add(t0 + 2 * beat, 2.4 * beat, bass(mtof(ch[0] - 12)), 0, 0.6);
    for (let s = 0; s < 8; s++) {
      if (r() < 0.82) {
        const note = s % 2 === 0 ? ch[(1 + ((s / 2) % 3)) | 0] + 12 : scale[(r() * scale.length) | 0];
        T.add(t0 + s * 0.5 * beat, 1.6, pluck(mtof(note), 3.2), r() - 0.5, 0.32);
      }
    }
  }
  T.reverb(0.45, 1.2);
  T.normalize();
  return T;
}

function wild() {
  // A aeolian drone with sparse bells, 56 bpm feel, 12 bars of 4 -> ~51 s
  const beat = 60 / 56;
  const bars = 12;
  const T = new Track(bars * 4 * beat);
  const r = rng(7);
  const pent = [57, 60, 62, 64, 67, 69, 72, 74, 76];
  const roots = [45, 45, 41, 43];
  for (let b = 0; b < bars; b++) {
    const t0 = b * 4 * beat;
    const root = roots[b % 4];
    T.add(t0, 4 * beat * 1.15, pad(mtof(root), 1.2, 1.4), -0.3, 0.7);
    T.add(t0, 4 * beat * 1.15, pad(mtof(root + 7), 1.4, 1.4), 0.3, 0.45);
    T.add(t0, 4 * beat * 1.15, pad(mtof(root + 15), 1.6, 1.6), 0, 0.28);
    if (b % 2 === 0) T.add(t0, 4 * beat, bass(mtof(root - 12), 0.6), 0, 0.5);
    for (let k = 0; k < 3; k++) {
      if (r() < 0.65)
        T.add(t0 + r() * 3.6 * beat, 3, bell(mtof(pent[(r() * pent.length) | 0])), r() * 1.6 - 0.8, 0.35);
    }
  }
  T.reverb(0.7, 1.6);
  T.normalize();
  return T;
}

function boss() {
  // E phrygian, 104 bpm, 16 bars -> ~37 s
  const bpm = 104;
  const beat = 60 / bpm;
  const bars = 16;
  const T = new Track(bars * 4 * beat);
  const r = rng(23);
  const prog = [40, 40, 41, 40, 43, 41, 40, 39];
  const riff = [0, 0, 7, 0, 3, 1, 5, 1];
  for (let b = 0; b < bars; b++) {
    const t0 = b * 4 * beat;
    const root = prog[b % prog.length];
    for (let s = 0; s < 8; s++) {
      const n = root + (s % 2 ? 0 : riff[(s + b) % riff.length] % 8);
      T.add(t0 + s * 0.5 * beat, 0.5 * beat * 0.9, bass(mtof(n), 5.5), 0, 0.85);
    }
    // war drums
    T.add(t0, 0.7, (t) => Math.exp(-t * 9) * sine((70 - 40 * t) * t * 1) * 1.2, 0, 1);
    T.add(t0 + 2 * beat, 0.7, (t) => Math.exp(-t * 9) * sine((70 - 40 * t) * t) * 1.1, 0, 0.9);
    T.add(t0 + beat, 0.2, noiseHit(b * 3 + 1, 0.2, 22, 0.6), 0.2, 0.28);
    T.add(t0 + 3 * beat, 0.2, noiseHit(b * 3 + 2, 0.2, 22, 0.6), -0.2, 0.28);
    for (let s = 0; s < 8; s++)
      T.add(t0 + s * 0.5 * beat, 0.08, noiseHit(b * 17 + s, 0.08, 60, 0.9), 0, 0.12);
    if (b % 4 >= 2) {
      const lead = [root + 12, root + 13, root + 19, root + 12][b % 4];
      T.add(t0, 4 * beat, brass(mtof(lead + 12)), 0.1, 0.8);
      T.add(t0, 4 * beat, brass(mtof(lead + 15 + (r() < 0.5 ? 0 : -1))), -0.1, 0.5);
    }
    T.add(t0, 4 * beat * 1.05, pad(mtof(root + 24), 0.1, 0.3), 0, 0.35);
  }
  T.reverb(0.3, 0.8);
  T.normalize();
  return T;
}

const tracks = { town_theme: town, wilderness_theme: wild, boss_theme: boss };
for (const [name, fn] of Object.entries(tracks)) {
  const T = fn();
  const wavPath = path.join(os.tmpdir(), `${name}.wav`);
  fs.writeFileSync(wavPath, T.wav());
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-i',
    wavPath,
    '-c:a',
    'libvorbis',
    '-q:a',
    '2',
    path.join(OUT, `${name}.ogg`),
  ]);
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-i',
    wavPath,
    '-c:a',
    'libmp3lame',
    '-b:a',
    '96k',
    path.join(OUT, `${name}.mp3`),
  ]);
  fs.unlinkSync(wavPath);
  console.log(name, (T.n / SR).toFixed(2), 's');
}
