/**
 * Procedural SFX synthesis. Recipes render plain Float32Arrays (pure DSP, deterministic, testable in
 * node); `ProceduralSfx` wraps them in cached AudioBuffers on demand.
 */

const TAU = Math.PI * 2;

export interface SynthRecipe {
  /** Render mono samples at the given sample rate. */
  render(sr: number, rng: () => number): Float32Array;
  /** Random pitch variation (fraction) applied at playback; 0 for UI. */
  pitchVar?: number;
  /** Sound is designed to loop seamlessly. */
  loop?: boolean;
  /** Natural loudness trim 0..1. */
  gain?: number;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ---- DSP helpers -------------------------------------------------------------------------------

const buf = (sr: number, sec: number) => new Float32Array(Math.max(1, Math.floor(sr * sec)));
const add = (d: Float32Array, i: number, x: number) => {
  d[i] = (d[i] ?? 0) + x;
};
/** Exponential decay envelope. */
const decay = (t: number, tau: number) => Math.exp(-t / tau);
/** Attack/decay: linear attack `a`, then exponential decay `tau`. */
const ad = (t: number, a: number, tau: number) => (t < a ? t / a : Math.exp(-(t - a) / tau));
const noise = (rng: () => number) => rng() * 2 - 1;

/** One-pole low-pass applied with a time-varying cutoff function (Hz). */
function lowpass(d: Float32Array, sr: number, cutoff: (t: number) => number): void {
  let y = 0;
  for (let i = 0; i < d.length; i++) {
    const a = 1 - Math.exp((-TAU * cutoff(i / sr)) / sr);
    y += a * ((d[i] ?? 0) - y);
    d[i] = y;
  }
}
function highpass(d: Float32Array, sr: number, cutoff: number): void {
  const a = 1 - Math.exp((-TAU * cutoff) / sr);
  let y = 0;
  for (let i = 0; i < d.length; i++) {
    const x = d[i] ?? 0;
    y += a * (x - y);
    d[i] = x - y;
  }
}
function bandpass(d: Float32Array, sr: number, center: (t: number) => number, q = 4): void {
  let lp = 0;
  let bp = 0;
  for (let i = 0; i < d.length; i++) {
    const f = 2 * Math.sin((Math.PI * Math.min(center(i / sr), sr * 0.2)) / sr);
    lp += f * bp;
    const hp = (d[i] ?? 0) - lp - bp / q;
    bp += f * hp;
    d[i] = bp;
  }
}
function normalize(d: Float32Array, peak = 0.9): Float32Array {
  let m = 0;
  for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i] ?? 0));
  if (m > 0) {
    const k = peak / m;
    for (let i = 0; i < d.length; i++) d[i] = (d[i] ?? 0) * k;
  }
  return d;
}
/** Short fade in/out to prevent clicks (not for loops). */
function declick(d: Float32Array, sr: number, ms = 3): Float32Array {
  const n = Math.min(Math.floor((sr * ms) / 1000), d.length >> 1);
  for (let i = 0; i < n; i++) {
    const k = i / n;
    d[i] = (d[i] ?? 0) * k;
    const j = d.length - 1 - i;
    d[j] = (d[j] ?? 0) * k;
  }
  return d;
}
const softclip = (x: number) => Math.tanh(x);

function tone(
  d: Float32Array,
  sr: number,
  start: number,
  freq: number,
  dur: number,
  amp: number,
  tau: number,
  kind: 'sine' | 'tri' | 'square' = 'sine',
  vib = 0,
): void {
  const s0 = Math.floor(start * sr);
  const n = Math.floor(dur * sr);
  let ph = 0;
  for (let i = 0; i < n && s0 + i < d.length; i++) {
    const t = i / sr;
    ph += (TAU * freq * (1 + vib * Math.sin(TAU * 6 * t))) / sr;
    let v: number;
    if (kind === 'sine') v = Math.sin(ph);
    else if (kind === 'tri') v = (2 / Math.PI) * Math.asin(Math.sin(ph));
    else v = Math.sin(ph) > 0 ? 0.6 : -0.6;
    add(d, s0 + i, v * amp * ad(t, 0.004, tau));
  }
}

function impulses(
  d: Float32Array,
  sr: number,
  rng: () => number,
  density: number,
  from: number,
  to: number,
  amp: number,
  tau: number,
): void {
  // Random crackle pops (sparks / lightning).
  const s0 = Math.floor(from * sr);
  const s1 = Math.min(d.length, Math.floor(to * sr));
  for (let i = s0; i < s1; i++) {
    if (rng() < density / sr) {
      const a = amp * (0.3 + rng() * 0.7) * (rng() < 0.5 ? -1 : 1);
      const len = Math.floor(sr * tau * 6);
      for (let k = 0; k < len && i + k < d.length; k++) add(d, i + k, a * decay(k / sr, tau) * noise(rng));
    }
  }
}

// ---- Recipes ----------------------------------------------------------------------------------

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

function itemDrop(base: number, partials: number[], tau: number, sparkle = false): SynthRecipe {
  return {
    pitchVar: 0.03,
    gain: 0.7,
    render(sr) {
      const d = buf(sr, 0.9);
      // Metallic "clink" + chime partials.
      const f = midi(base);
      partials.forEach((p, i) => tone(d, sr, i * 0.07, f * p, 0.8, 0.5 / (1 + i * 0.4), tau));
      tone(d, sr, 0, f * 3.7, 0.08, 0.3, 0.02);
      if (sparkle)
        for (let i = 0; i < 6; i++)
          tone(d, sr, 0.15 + i * 0.07, f * (4 + i * 0.5), 0.3, 0.18, 0.09, 'sine', 0.01);
      return declick(normalize(d, 0.85), sr);
    },
  };
}

/**
 * The classic movie blaster "pew": the original was a struck guy-wire, whose stiffness makes high
 * frequencies outrun low ones, smearing the strike into a falling "pyew". A chain of first-order
 * all-pass filters has the same dispersion, so a click through it becomes that chirp. The energy is
 * then evened out over the sweep and the wire's echoes ("-ew") are added.
 */
interface ChirpOpts {
  /** Dispersion per stage (higher = longer, lower sweep). */
  a?: number;
  /** All-pass stages (more = longer sweep). */
  stages?: number;
  lp?: number;
  hp?: number;
}

function guyWireChirp(sr: number, rng: () => number, len: number, o: ChirpOpts = {}): Float32Array {
  const n = Math.floor(sr * len);
  const a = (o.a ?? 0.885) + rng() * 0.03; // dispersion per stage (sweep length)
  const stages = (o.stages ?? 170) + Math.floor(rng() * 50);
  let x = new Float32Array(n);
  // Strike: a 1 ms bright burst rather than a perfect impulse (less clicky, a bit of grit).
  const strike = Math.max(2, Math.floor(sr * 0.001));
  for (let i = 0; i < strike; i++) x[i] = (1 - i / strike) * (0.6 + 0.4 * noise(rng));
  let y = new Float32Array(n);
  for (let k = 0; k < stages; k++) {
    let x1 = 0;
    let y1 = 0;
    for (let i = 0; i < n; i++) {
      const v = -a * x[i]! + x1 + a * y1;
      y[i] = v;
      x1 = x[i]!;
      y1 = v;
    }
    [x, y] = [y, x];
  }
  // Even out the sweep (the chain front-loads energy into the first milliseconds), then fade.
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    x[i] = x[i]! * Math.min(6, Math.pow(1 + t / 0.004, 0.6)) * ad(t, 0.003, 0.065);
  }
  const out = new Float32Array(n);
  // Wire echoes: the strike reflected back along the wire, quieter and later.
  const taps: [number, number][] = [
    [0, 1],
    [0.038 + rng() * 0.01, 0.32],
    [0.085 + rng() * 0.015, 0.12],
  ];
  for (const [delay, g] of taps) {
    const off = Math.floor(delay * sr);
    for (let i = 0; i + off < n; i++) out[i + off] = out[i + off]! + x[i]! * g;
  }
  lowpass(out, sr, () => o.lp ?? 6500);
  highpass(out, sr, o.hp ?? 320);
  for (let i = 0; i < n; i++) out[i] = softclip(out[i]! * 1.6);
  return declick(normalize(out, 0.9), sr);
}

/**
 * A full blaster shot: the guy-wire "pyew" plus what a chirp alone lacks, a bright muzzle crack for
 * the attack and a falling low thump for weight. Rifles get a longer, lower sweep and a bigger thump.
 */
function blasterShot(sr: number, rng: () => number, heavy: boolean, len = heavy ? 0.42 : 0.3): Float32Array {
  const d = heavy
    ? guyWireChirp(sr, rng, len, { a: 0.9, stages: 240, lp: 4800, hp: 150 })
    : guyWireChirp(sr, rng, len, { hp: 220 });
  const crack = buf(sr, 0.012);
  for (let i = 0; i < crack.length; i++) crack[i] = noise(rng) * (1 - i / crack.length) ** 2;
  highpass(crack, sr, 2500);
  const crackGain = heavy ? 0.55 : 0.7;
  for (let i = 0; i < crack.length; i++) add(d, i, crack[i]! * crackGain);
  const [f0, f1, tau, g] = heavy ? [50, 150, 0.07, 0.75] : [85, 190, 0.035, 0.45];
  let ph = 0;
  for (let i = 0; i < Math.min(d.length, Math.floor(sr * tau * 5)); i++) {
    const t = i / sr;
    ph += (TAU * (f0 + f1 * Math.exp(-t / 0.018))) / sr;
    add(d, i, Math.sin(ph) * ad(t, 0.001, tau) * g);
  }
  for (let i = 0; i < d.length; i++) d[i] = softclip(d[i]! * 1.2);
  return declick(normalize(d, 0.9), sr);
}

interface WhooshOpts {
  sec: number;
  /** Band center at rest and at the fastest point of the swing (Hz). */
  lo: number;
  hi: number;
  /** Vibro blades: a buzzing motor tone (Hz) riding the swing. */
  buzz?: number;
  /** Shock weapons: electric crackle through the swing. */
  crackle?: boolean;
  gain: number;
}

/** Several shots mixed at `offsets` (seconds) with per-shot gains: volleys and bursts. */
function shotVolley(
  sr: number,
  rng: () => number,
  offsets: number[],
  gains: number[],
  len: number,
): Float32Array {
  const d = buf(sr, (offsets.at(-1) ?? 0) + len);
  offsets.forEach((at, k) => {
    const s = blasterShot(sr, rng, false, len);
    const off = Math.floor(at * sr);
    for (let i = 0; i < s.length && off + i < d.length; i++) add(d, off + i, s[i]! * (gains[k] ?? 1));
  });
  for (let i = 0; i < d.length; i++) d[i] = softclip(d[i]!);
  return declick(normalize(d, 0.9), sr);
}

/** A weapon cutting the air: noise through a resonant band that rises as the swing peaks, then falls. */
function whoosh(o: WhooshOpts): SynthRecipe {
  const peak = 0.4;
  const shape = (u: number) =>
    u < peak
      ? Math.sin((Math.PI / 2) * (u / peak))
      : Math.cos((Math.PI / 2) * Math.min(1, (u - peak) / (1 - peak)));
  return {
    pitchVar: 0.1,
    gain: o.gain,
    render(sr, rng) {
      const d = buf(sr, o.sec);
      for (let i = 0; i < d.length; i++) d[i] = noise(rng) * shape(i / d.length) ** 1.5;
      bandpass(d, sr, (t) => o.lo + (o.hi - o.lo) * shape(t / o.sec), 2.2);
      normalize(d, 0.8);
      if (o.buzz) {
        let ph = 0;
        for (let i = 0; i < d.length; i++) {
          const s = shape(i / d.length);
          ph += (TAU * o.buzz * (1 + 0.15 * s)) / sr;
          add(d, i, softclip(Math.sin(ph) * 3) * 0.22 * s);
        }
      }
      if (o.crackle) {
        const c = buf(sr, o.sec);
        impulses(c, sr, rng, 220, o.sec * 0.15, o.sec * 0.8, 0.7, 0.0012);
        highpass(c, sr, 2000);
        for (let i = 0; i < d.length; i++) add(d, i, c[i]!);
      }
      return declick(normalize(d, 0.85), sr);
    },
  };
}

/**
 * Movie-style saber tone at phase `ph` (radians of the fundamental): the projector-motor hum plus
 * the buzzy "TV set" harmonics, with a slightly detuned second voice for the shimmering beat.
 */
function saberTone(ph: number, ph2: number): number {
  let buzz = 0;
  for (let k = 2; k <= 9; k++) buzz += Math.sin(ph * k) / k;
  return Math.sin(ph) * 0.55 + buzz * 0.42 + Math.sin(ph2) * 0.3 + Math.sin(ph * 0.5) * 0.18;
}

/** A saber sound with a pitch curve `p(u)` and loudness `amp(u)` over u = 0..1 (Doppler swings etc). */
function saberSweep(
  sr: number,
  rng: () => number,
  sec: number,
  base: number,
  p: (u: number) => number,
  amp: (u: number) => number,
  hiss = 0,
): Float32Array {
  const d = buf(sr, sec);
  let ph = 0;
  let ph2 = 0;
  for (let i = 0; i < d.length; i++) {
    const u = i / d.length;
    const f = base * p(u);
    ph += (TAU * f) / sr;
    ph2 += (TAU * f * 1.012) / sr;
    d[i] = (softclip(saberTone(ph, ph2) * 1.6) + noise(rng) * hiss) * amp(u);
  }
  lowpass(d, sr, () => 5200);
  return declick(normalize(d, 0.85), sr);
}

export const RECIPES: Record<string, SynthRecipe> = {
  /** Saber swing "vwoom": the hum Doppler-bends up as the blade passes, then falls away. */
  saberVwoom: {
    pitchVar: 0.07,
    gain: 0.6,
    render(sr, rng) {
      const peak = 1.45 + rng() * 0.25;
      return saberSweep(
        sr,
        rng,
        0.5,
        92,
        (u) => 0.9 + (peak - 0.9) * Math.sin(Math.PI * Math.min(1, u * 1.1)) - 0.2 * u,
        (u) => Math.pow(Math.sin(Math.PI * u), 1.4) * (0.6 + 0.4 * Math.sin(Math.PI * u)),
        0.06,
      );
    },
  },
  /** Saber hitting something: a high buzz burst with crackling sparks ("kssshh"). */
  saberHit: {
    pitchVar: 0.08,
    gain: 0.6,
    render(sr, rng) {
      const d = saberSweep(
        sr,
        rng,
        0.32,
        170,
        (u) => 1.15 - 0.45 * u,
        (u) => ad(u * 0.32, 0.004, 0.09),
        0.35,
      );
      // Sparse spark crackles over the burst.
      for (let k = 0; k < 26; k++) {
        const at = Math.floor(rng() * rng() * d.length * 0.8);
        const len = Math.floor(sr * (0.001 + rng() * 0.003));
        const g = 0.6 * (1 - at / d.length);
        for (let i = 0; i < len && at + i < d.length; i++) add(d, at + i, noise(rng) * g * (1 - i / len));
      }
      return declick(normalize(d, 0.85), sr);
    },
  },
  /** Ignition "snap-hiss": a crack, then the hum spins up from low to full pitch. */
  saberIgnite: {
    pitchVar: 0.03,
    gain: 0.55,
    render(sr, rng) {
      const d = saberSweep(
        sr,
        rng,
        0.7,
        92,
        (u) => 0.35 + 0.65 * Math.min(1, u / 0.35) + 0.12 * Math.sin(Math.PI * Math.min(1, u / 0.35)),
        (u) => Math.min(1, u / 0.06) * (u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4),
        0.1,
      );
      const snap = Math.floor(sr * 0.03);
      for (let i = 0; i < snap; i++) add(d, i, noise(rng) * 0.9 * decay(i / sr, 0.008));
      return declick(normalize(d, 0.85), sr);
    },
  },
  /** Classic movie-style blaster shot (see blasterShot). */
  blasturClassic: {
    pitchVar: 0.07,
    gain: 0.6,
    render(sr, rng) {
      return blasterShot(sr, rng, false);
    },
  },
  /** Blaster rifle: longer, lower "pyeww" with a heavier thump. */
  blasturHeavy: {
    pitchVar: 0.06,
    gain: 0.65,
    render(sr, rng) {
      return blasterShot(sr, rng, true);
    },
  },
  /** Spread shot: several bolts leaving at once, a fat smeared "PYEW". */
  blasturSpread: {
    pitchVar: 0.05,
    gain: 0.65,
    render(sr, rng) {
      return shotVolley(sr, rng, [0, 0.011, 0.024], [1, 0.8, 0.65], 0.32);
    },
  },
  /** Rapid fire: a quick "pew-pew-pew-pew" burst. */
  blasturBurst: {
    pitchVar: 0.05,
    gain: 0.6,
    render(sr, rng) {
      return shotVolley(sr, rng, [0, 0.07, 0.14, 0.21], [1, 0.85, 0.9, 0.75], 0.2);
    },
  },
  /** Seeker lock-on: two rising targeting beeps over the shot. */
  seekerPing: {
    pitchVar: 0.02,
    gain: 0.4,
    render(sr) {
      const d = buf(sr, 0.22);
      let ph = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const beep = t < 0.07 ? t : t - 0.09;
        const on = (t < 0.07 || (t >= 0.09 && t < 0.2)) && beep < 0.07;
        ph += (TAU * (1500 + 4000 * beep + (t >= 0.09 ? 300 : 0))) / sr;
        d[i] = on ? Math.sin(ph) * ad(beep, 0.004, 0.035) : 0;
      }
      return declick(normalize(d, 0.7), sr);
    },
  },
  /** Melee swings by weapon weight and kind (see whoosh). */
  swingLight: whoosh({ sec: 0.22, lo: 900, hi: 3200, gain: 0.45 }),
  swingMedium: whoosh({ sec: 0.3, lo: 500, hi: 1900, gain: 0.5 }),
  swingHeavy: whoosh({ sec: 0.42, lo: 280, hi: 1100, gain: 0.55 }),
  swingVibro: whoosh({ sec: 0.32, lo: 450, hi: 1700, buzz: 118, gain: 0.5 }),
  swingShock: whoosh({ sec: 0.3, lo: 500, hi: 1900, crackle: true, gain: 0.5 }),
  saberHum: {
    loop: true,
    gain: 0.35,
    render(sr) {
      // 1 second, integer-Hz components → seamless loop. Pitch is shifted via playbackRate.
      const d = buf(sr, 1);
      // The movie hum: motor fundamental (92 Hz) + buzzy harmonics + a 93 Hz voice beating at 1 Hz.
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        d[i] = softclip(saberTone(TAU * 92 * t, TAU * 93 * t) * 1.5) * (0.9 + 0.1 * Math.sin(TAU * 6 * t));
      }
      return normalize(d, 0.8);
    },
  },
  saberSwing: {
    pitchVar: 0.08,
    gain: 0.6,
    render(sr, rng) {
      const d = buf(sr, 0.5);
      let ph = 0;
      let mph = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const u = t / 0.5;
        const bell = Math.sin(Math.PI * Math.min(1, u)) ** 2;
        // Doppler-ish: pitch rises then falls sharply.
        const f = 140 + 520 * Math.sin(Math.PI * Math.min(1, u * 0.85)) - 120 * u;
        mph += (TAU * f * 1.5) / sr;
        ph += (TAU * f) / sr + ((2.2 * bell * Math.sin(mph) * (TAU * f)) / sr) * 0.3;
        d[i] = (Math.sin(ph) * 0.6 + noise(rng) * 0.25 * bell) * bell;
      }
      lowpass(d, sr, (t) => 900 + 3500 * Math.sin(Math.PI * Math.min(1, t / 0.5)));
      return declick(normalize(d, 0.85), sr);
    },
  },
  saberClash: {
    pitchVar: 0.05,
    gain: 0.75,
    render(sr, rng) {
      const d = buf(sr, 0.6);
      for (let i = 0; i < d.length; i++) add(d, i, noise(rng) * decay(i / sr, 0.035) * 0.9);
      highpass(d, sr, 1500);
      [1760, 2790, 4120, 5230].forEach((f, k) =>
        tone(d, sr, 0, f, 0.55, 0.35 / (k + 1), 0.16 / (1 + k * 0.4)),
      );
      tone(d, sr, 0, 220, 0.2, 0.4, 0.05, 'square');
      return declick(normalize(d, 0.9), sr);
    },
  },
  blastur: {
    pitchVar: 0.08,
    gain: 0.55,
    render(sr, rng) {
      const d = buf(sr, 0.28);
      let ph = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const f = 180 + 1900 * Math.exp(-t / 0.045);
        ph += (TAU * f) / sr;
        d[i] = softclip(Math.sin(ph) * 2.2) * ad(t, 0.002, 0.07) * 0.6 + noise(rng) * decay(t, 0.012) * 0.5;
      }
      return declick(normalize(d, 0.85), sr);
    },
  },
  lightning: {
    pitchVar: 0.06,
    gain: 0.6,
    render(sr, rng) {
      const d = buf(sr, 0.7);
      impulses(d, sr, rng, 260, 0, 0.55, 1, 0.0015);
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        add(d, i, softclip(Math.sin(TAU * 120 * t) * 3) * 0.18 * ad(t, 0.01, 0.2) * (0.6 + 0.4 * noise(rng)));
        add(d, i, noise(rng) * 0.25 * ad(t, 0.005, 0.1));
      }
      highpass(d, sr, 300);
      return declick(normalize(d, 0.85), sr);
    },
  },
  plasma: {
    pitchVar: 0.07,
    gain: 0.6,
    render(sr, rng) {
      const d = buf(sr, 0.65);
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        d[i] = noise(rng) * Math.sin(Math.PI * Math.min(1, t / 0.65)) ** 1.5;
      }
      bandpass(d, sr, (t) => 300 + 1400 * Math.sin(Math.PI * Math.min(1, t / 0.65)), 1.5);
      for (let i = 0; i < d.length; i++)
        add(d, i, Math.sin(TAU * 70 * (i / sr)) * 0.4 * ad(i / sr, 0.05, 0.25));
      return declick(normalize(d, 0.85), sr);
    },
  },
  cryo: {
    pitchVar: 0.05,
    gain: 0.6,
    render(sr, rng) {
      const d = buf(sr, 0.9);
      impulses(d, sr, rng, 900, 0, 0.18, 0.9, 0.0008);
      highpass(d, sr, 3000);
      [2093, 3136, 4186, 5274].forEach((f, k) => tone(d, sr, 0.02 + k * 0.045, f, 0.8, 0.4, 0.22));
      return declick(normalize(d, 0.85), sr);
    },
  },
  toxin: {
    pitchVar: 0.12,
    gain: 0.6,
    render(sr, rng) {
      const d = buf(sr, 0.6);
      for (let b = 0; b < 7; b++) {
        const start = rng() * 0.4;
        const f0 = 250 + rng() * 350;
        const dur = 0.07 + rng() * 0.06;
        const n = Math.floor(dur * sr);
        let ph = 0;
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          ph += (TAU * f0 * (1 + 2.2 * (t / dur))) / sr;
          add(d, Math.floor(start * sr) + i, Math.sin(ph) * Math.sin((Math.PI * i) / n) * 0.5);
        }
      }
      return declick(normalize(d, 0.8), sr);
    },
  },
  forse: {
    pitchVar: 0.08,
    gain: 0.5,
    render(sr) {
      const d = buf(sr, 0.6);
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const e = ad(t, 0.12, 0.2);
        const f = 330 * (1 + 0.8 * t);
        d[i] =
          (Math.sin(TAU * f * t + 3 * Math.sin(TAU * 5 * t)) * 0.5 +
            Math.sin(TAU * f * 1.5 * t) * 0.3 +
            Math.sin(TAU * f * 2.01 * t) * 0.2) *
          e;
      }
      return declick(normalize(d, 0.8), sr);
    },
  },
  /** Weapon on a body: a low thump plus a mid "slap" for definition. */
  hit: {
    pitchVar: 0.1,
    gain: 0.7,
    render(sr, rng) {
      const d = buf(sr, 0.22);
      let ph = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        ph += (TAU * (45 + 110 * Math.exp(-t / 0.03))) / sr;
        d[i] = Math.sin(ph) * decay(t, 0.06) + noise(rng) * decay(t, 0.008) * 0.6;
      }
      lowpass(d, sr, () => 2500);
      const slap = buf(sr, 0.06);
      for (let i = 0; i < slap.length; i++) slap[i] = noise(rng) * decay(i / sr, 0.012);
      bandpass(slap, sr, () => 1300, 1.5);
      normalize(slap, 0.5);
      for (let i = 0; i < slap.length; i++) add(d, i, slap[i]!);
      return declick(normalize(d, 0.85), sr);
    },
  },
  /** Weapon on a droyd: a struck metal shell (inharmonic ring) with a knock under it. */
  hitMetal: {
    pitchVar: 0.1,
    gain: 0.55,
    render(sr, rng) {
      const d = buf(sr, 0.35);
      const f = 380 + rng() * 140;
      [1, 2.32, 4.25, 6.63, 9.38].forEach((p, k) =>
        tone(d, sr, 0, f * p, 0.35, 0.45 / (1 + k * 0.6), 0.08 / (1 + k * 0.4)),
      );
      const click = Math.floor(sr * 0.004);
      for (let i = 0; i < click; i++) add(d, i, noise(rng) * (1 - i / click) * 0.9);
      let ph = 0;
      for (let i = 0; i < Math.floor(sr * 0.15); i++) {
        const t = i / sr;
        ph += (TAU * (85 + 70 * Math.exp(-t / 0.02))) / sr;
        add(d, i, Math.sin(ph) * decay(t, 0.04) * 0.5);
      }
      lowpass(d, sr, () => 7000);
      return declick(normalize(d, 0.85), sr);
    },
  },
  /** Extra layer under a critical hit: a crunchy, heavier impact. */
  hitCrit: {
    pitchVar: 0.08,
    gain: 0.6,
    render(sr, rng) {
      const d = buf(sr, 0.3);
      let ph = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        ph += (TAU * (40 + 260 * Math.exp(-t / 0.015))) / sr;
        d[i] = softclip(Math.sin(ph) * 2.5) * decay(t, 0.08);
      }
      const crunch = buf(sr, 0.09);
      for (let i = 0; i < crunch.length; i++) crunch[i] = noise(rng) * decay(i / sr, 0.025);
      bandpass(crunch, sr, (t) => 3200 - 18000 * t, 1.2);
      normalize(crunch, 0.6);
      for (let i = 0; i < crunch.length; i++) add(d, i, crunch[i]!);
      return declick(normalize(d, 0.85), sr);
    },
  },
  droydDeath: {
    pitchVar: 0.08,
    gain: 0.8,
    render(sr, rng) {
      const d = buf(sr, 0.9);
      impulses(d, sr, rng, 220, 0, 0.5, 0.8, 0.002);
      highpass(d, sr, 800);
      [420, 633, 1170, 1730].forEach((f, k) => tone(d, sr, 0.04, f, 0.5, 0.35 / (k + 1), 0.09));
      let ph = 0;
      for (let i = 0; i < Math.floor(0.6 * sr); i++) {
        const t = i / sr;
        ph += (TAU * (900 * Math.exp(-t / 0.25) + 60)) / sr;
        add(d, i, Math.sin(ph) * 0.25 * ad(t, 0.005, 0.2));
      }
      return declick(normalize(d, 0.85), sr);
    },
  },
  smoke: {
    pitchVar: 0.1,
    gain: 0.6,
    render(sr, rng) {
      const d = buf(sr, 0.55);
      for (let i = 0; i < d.length; i++) d[i] = noise(rng) * ad(i / sr, 0.03, 0.14);
      lowpass(d, sr, (t) => 2200 * Math.exp(-t / 0.2) + 250);
      return declick(normalize(d, 0.8), sr);
    },
  },
  levelUp: {
    gain: 0.7,
    render(sr) {
      const d = buf(sr, 1.4);
      [72, 76, 79, 84, 88].forEach((n, i) => {
        tone(d, sr, i * 0.1, midi(n), 0.9, 0.5, 0.28, 'tri');
        tone(d, sr, i * 0.1, midi(n) * 2.003, 0.6, 0.15, 0.18);
      });
      return declick(normalize(d, 0.85), sr);
    },
  },
  creditz: {
    pitchVar: 0.02,
    gain: 0.6,
    render(sr) {
      const d = buf(sr, 0.4);
      tone(d, sr, 0, 1568, 0.2, 0.5, 0.05, 'sine');
      tone(d, sr, 0.07, 2093, 0.3, 0.55, 0.09, 'sine');
      tone(d, sr, 0.07, 4186, 0.2, 0.12, 0.04);
      return declick(normalize(d, 0.8), sr);
    },
  },
  'itemDrop.normal': itemDrop(79, [1, 2.4], 0.07),
  'itemDrop.magic': itemDrop(81, [1, 2, 3.01], 0.12),
  'itemDrop.rare': itemDrop(83, [1, 1.5, 2, 3], 0.18),
  'itemDrop.set': itemDrop(74, [1, 1.25, 1.5, 2], 0.25, true),
  'itemDrop.unique': itemDrop(76, [1, 1.5, 2, 3, 4.01], 0.4, true),
  itemPickup: {
    pitchVar: 0.04,
    gain: 0.5,
    render(sr) {
      const d = buf(sr, 0.18);
      tone(d, sr, 0, 900, 0.12, 0.5, 0.04, 'tri');
      tone(d, sr, 0.05, 1350, 0.12, 0.4, 0.04, 'tri');
      return declick(normalize(d, 0.75), sr);
    },
  },
  uiClick: {
    gain: 0.4,
    render(sr) {
      const d = buf(sr, 0.07);
      tone(d, sr, 0, 1200, 0.06, 0.6, 0.012, 'tri');
      return declick(normalize(d, 0.6), sr, 1);
    },
  },
  uiOpen: {
    gain: 0.4,
    render(sr) {
      const d = buf(sr, 0.2);
      tone(d, sr, 0, 600, 0.1, 0.5, 0.03, 'tri');
      tone(d, sr, 0.06, 900, 0.14, 0.5, 0.05, 'tri');
      return declick(normalize(d, 0.6), sr);
    },
  },
  uiClose: {
    gain: 0.4,
    render(sr) {
      const d = buf(sr, 0.2);
      tone(d, sr, 0, 900, 0.1, 0.5, 0.03, 'tri');
      tone(d, sr, 0.06, 600, 0.14, 0.5, 0.05, 'tri');
      return declick(normalize(d, 0.6), sr);
    },
  },
  footstep: {
    pitchVar: 0.18,
    gain: 0.25,
    render(sr, rng) {
      const d = buf(sr, 0.12);
      for (let i = 0; i < d.length; i++) d[i] = noise(rng) * ad(i / sr, 0.004, 0.025);
      lowpass(d, sr, () => 700);
      return declick(normalize(d, 0.6), sr);
    },
  },
  heal: {
    gain: 0.5,
    render(sr) {
      const d = buf(sr, 0.7);
      [60, 64, 67].forEach((n, i) => tone(d, sr, i * 0.06, midi(n + 12), 0.5, 0.4, 0.2, 'sine', 0.004));
      return declick(normalize(d, 0.7), sr);
    },
  },
  bossIntro: {
    gain: 0.85,
    render(sr, rng) {
      const d = buf(sr, 2.2);
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const swell = Math.min(1, t / 1.0) * decay(Math.max(0, t - 1.0), 0.5);
        const v =
          Math.sin(TAU * 55 * t) * 0.6 +
          (((55 * 2 * t) % 1) * 2 - 1) * 0.3 * Math.sin(TAU * 0.5 * t) +
          softclip(Math.sin(TAU * 110 * t + 2 * Math.sin(TAU * 3 * t))) * 0.35;
        d[i] = v * swell + noise(rng) * 0.05 * swell;
      }
      // Impact hit at 1.0s.
      for (let i = Math.floor(sr); i < d.length; i++) {
        const t = i / sr - 1;
        add(d, i, Math.sin(TAU * (40 + 60 * Math.exp(-t / 0.05)) * t) * decay(t, 0.25) * 0.9);
      }
      lowpass(d, sr, () => 1800);
      return declick(normalize(d, 0.9), sr, 10);
    },
  },
  dialogue: {
    pitchVar: 0.2,
    gain: 0.35,
    render(sr, rng) {
      const d = buf(sr, 0.2);
      const f = 300 + rng() * 300;
      tone(d, sr, 0, f, 0.05, 0.5, 0.03, 'square');
      tone(d, sr, 0.07, f * (1 + rng() * 0.5), 0.06, 0.5, 0.03, 'square');
      lowpass(d, sr, () => 2400);
      return declick(normalize(d, 0.6), sr);
    },
  },
  shrine: {
    gain: 0.6,
    render(sr) {
      const d = buf(sr, 1.2);
      [57, 64, 69, 76].forEach((n, i) => tone(d, sr, i * 0.08, midi(n), 1.0, 0.4, 0.4, 'sine', 0.006));
      for (let i = 0; i < 5; i++) tone(d, sr, 0.2 + i * 0.1, midi(88 + i), 0.4, 0.12, 0.12);
      return declick(normalize(d, 0.8), sr);
    },
  },
  waypoint: {
    gain: 0.7,
    render(sr, rng) {
      const d = buf(sr, 1.2);
      for (let i = 0; i < d.length; i++) d[i] = noise(rng) * ad(i / sr, 0.4, 0.3);
      bandpass(d, sr, (t) => 200 + 2500 * Math.min(1, t / 0.5), 2);
      [48, 55, 60, 67].forEach((n, i) => tone(d, sr, 0.35 + i * 0.05, midi(n), 0.8, 0.35, 0.3, 'tri'));
      return declick(normalize(d, 0.85), sr);
    },
  },
};

/** Ids that are procedurally available. */
export const PROCEDURAL_IDS: readonly string[] = Object.keys(RECIPES);

/** Distinct renders kept per one-shot recipe (different noise seeds), picked at random per play. */
export const PROCEDURAL_TAKES = 3;

/** Render a recipe to samples (deterministic per id and take). */
export function renderSamples(id: string, sr: number, take = 0): Float32Array | null {
  const r = RECIPES[id];
  if (!r) return null;
  return r.render(sr, mulberry32(hashStr(id) + take * 7919));
}

/** Resolve unknown variant ids like `itemDrop.superior` to a base procedural id, if any. */
export function resolveProcedural(id: string): string | null {
  if (RECIPES[id]) return id;
  return null;
}

/** On-demand AudioBuffer cache around the recipes. */
export class ProceduralSfx {
  private cache = new Map<string, AudioBuffer>();

  constructor(
    private ctx: BaseAudioContext,
    private sampleRate = 32000,
  ) {}

  has(id: string): boolean {
    return RECIPES[id] !== undefined;
  }

  recipe(id: string): SynthRecipe | undefined {
    return RECIPES[id];
  }

  get(id: string, take = 0): AudioBuffer | null {
    const t = RECIPES[id]?.loop ? 0 : take;
    const key = `${id}#${t}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const samples = renderSamples(id, this.sampleRate, t);
    if (!samples) return null;
    const ab = this.ctx.createBuffer(1, samples.length, this.sampleRate);
    ab.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
    this.cache.set(key, ab);
    return ab;
  }
}
