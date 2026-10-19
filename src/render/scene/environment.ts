/**
 * Day/night clock: blends a level's EnvDef lighting and color grade by time of day. Purely visual;
 * driven by play time so it pauses with the game and carries across level changes.
 */
import * as THREE from 'three';
import type { EnvDef, EnvLightDef } from '../../data/schema';
import { gradeFor, type GradeParams } from '../vfx/post';
import { NO_FOG } from './fog';

/** Seconds for one full day. */
export const DAY_LENGTH = 720;
/** Day fraction at play time 0: a new game starts in the morning. */
export const START_PHASE = 0.12;

export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night';

/**
 * Keyframes over one day (0..1). Holds are two equal keys in a row; between keys the lighting blends.
 * Day ~6 min, dusk/night/dawn ~6 min together.
 */
export const DAY_KEYS: readonly { at: number; phase: DayPhase }[] = [
  { at: 0, phase: 'dawn' },
  { at: 0.08, phase: 'day' },
  { at: 0.56, phase: 'day' },
  { at: 0.66, phase: 'dusk' },
  { at: 0.76, phase: 'night' },
  { at: 0.94, phase: 'night' },
  { at: 1, phase: 'dawn' },
];

/** The key light is the sun from dawn until here, then the moon until the day wraps. */
export const MOON_RISE = 0.71;

/** How each time of day tints the level's base grade (multiplies tint/sat/contrast, adds lift/vignette). */
export const PHASE_GRADE: Record<DayPhase, GradeParams> = {
  day: { tint: [1, 1, 1], lift: [0, 0, 0], sat: 1, contrast: 1, vignette: 0 },
  dawn: { tint: [1.05, 0.97, 0.98], lift: [0.008, 0.003, 0.008], sat: 0.98, contrast: 1, vignette: 0.03 },
  dusk: { tint: [1.05, 0.97, 0.92], lift: [0.006, 0.002, 0.004], sat: 0.96, contrast: 1.02, vignette: 0.06 },
  night: { tint: [0.8, 0.9, 1.12], lift: [0, 0.004, 0.014], sat: 0.74, contrast: 1.04, vignette: 0.12 },
};

/** Day fraction 0..1 for a play-time clock. */
export function dayFraction(clock: number, dayLength = DAY_LENGTH): number {
  const f = clock / dayLength + START_PHASE;
  return f - Math.floor(f);
}

/** The two keyframes around `f` and the blend weight toward the second. */
export function dayBlend(f: number): { a: DayPhase; b: DayPhase; t: number } {
  for (let i = 1; i < DAY_KEYS.length; i++) {
    const k0 = DAY_KEYS[i - 1]!;
    const k1 = DAY_KEYS[i]!;
    if (f <= k1.at) {
      const span = k1.at - k0.at;
      const t = span > 0 ? (f - k0.at) / span : 0;
      return { a: k0.phase, b: k1.phase, t: t * t * (3 - 2 * t) };
    }
  }
  return { a: 'dawn', b: 'dawn', t: 0 };
}

/**
 * Key-light direction (unit, pointing toward the light). The sun sweeps ±0.6 rad of azimuth across the
 * day; the moon a gentler arc at night. `base` is the default light direction.
 */
export function keyLightDir(f: number, base: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  let az: number;
  if (f < MOON_RISE) az = -0.6 + 1.2 * (f / MOON_RISE);
  else az = -0.35 + 0.7 * ((f - MOON_RISE) / (1 - MOON_RISE));
  return out.copy(base).applyAxisAngle(THREE.Object3D.DEFAULT_UP, az);
}

/** 0..1 dip of the key light around the sun/moon swap, so shadows don't visibly jump. */
export function keyLightSwapDip(f: number): number {
  const d = Math.min(Math.abs(f - MOON_RISE), f, 1 - f);
  return d >= 0.02 ? 1 : 0.15 + 0.85 * (d / 0.02);
}

const ca = new THREE.Color();
const cb = new THREE.Color();
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const mixHex = (a: number, b: number, t: number): number => ca.setHex(a).lerp(cb.setHex(b), t).getHex();

export function lightFor(env: EnvDef, phase: DayPhase): EnvLightDef {
  return phase === 'day' || !env.cycle ? env.day : env.cycle[phase];
}

/** Blend two lights into `out`. */
export function mixLight(a: EnvLightDef, b: EnvLightDef, t: number, out: EnvLightDef): EnvLightDef {
  out.sky = mixHex(a.sky, b.sky, t);
  out.ground = mixHex(a.ground, b.ground, t);
  out.hemi = lerp(a.hemi, b.hemi, t);
  out.sun = mixHex(a.sun, b.sun, t);
  out.sunI = lerp(a.sunI, b.sunI, t);
  out.bg = mixHex(a.bg, b.bg, t);
  out.playerLight = mixHex(a.playerLight, b.playerLight, t);
  out.playerLightI = lerp(a.playerLightI, b.playerLightI, t);
  out.mapLights = lerp(a.mapLights ?? 1, b.mapLights ?? 1, t);
  out.mist = lerp(a.mist ?? 0, b.mist ?? 0, t);
  // Clear air blends as fog of the other side's color pushed out past the screen.
  const fa = a.fog ?? b.fog;
  const fb = b.fog ?? a.fog;
  if (!fa || !fb) {
    out.fog = undefined;
    return out;
  }
  const fog = (out.fog ??= { color: 0, near: 0, far: 0 });
  fog.color = mixHex(fa.color, fb.color, t);
  fog.near = lerp(a.fog?.near ?? NO_FOG.near, b.fog?.near ?? NO_FOG.near, t);
  fog.far = lerp(a.fog?.far ?? NO_FOG.far, b.fog?.far ?? NO_FOG.far, t);
  return out;
}

/** Base grade tinted by the blended time-of-day modifier, into `out`. */
export function gradeAt(
  base: GradeParams,
  a: DayPhase,
  b: DayPhase,
  t: number,
  out: GradeParams,
): GradeParams {
  const pa = PHASE_GRADE[a];
  const pb = PHASE_GRADE[b];
  for (let i = 0; i < 3; i++) {
    out.tint[i] = base.tint[i]! * lerp(pa.tint[i]!, pb.tint[i]!, t);
    out.lift[i] = base.lift[i]! + lerp(pa.lift[i]!, pb.lift[i]!, t);
  }
  out.sat = base.sat * lerp(pa.sat, pb.sat, t);
  out.contrast = base.contrast * lerp(pa.contrast, pb.contrast, t);
  out.vignette = base.vignette + lerp(pa.vignette, pb.vignette, t);
  return out;
}

export interface EnvFrame {
  light: EnvLightDef;
  grade: GradeParams;
  /** Day fraction 0..1 (fixed at midday for levels without a cycle). */
  f: number;
}

/** Evaluates an EnvDef at a clock. One per renderer; outputs are reused objects. */
export class EnvironmentClock {
  private env: EnvDef | null = null;
  private base: GradeParams = gradeFor(null);
  readonly frame: EnvFrame = {
    light: {
      sky: 0,
      ground: 0,
      hemi: 1,
      sun: 0,
      sunI: 1,
      bg: 0,
      playerLight: 0,
      playerLightI: 1,
      mapLights: 1,
    },
    grade: structuredClone(gradeFor(null)),
    f: 0.3,
  };
  /** Fixed day fraction (debug `?time=`), or null to follow the clock. */
  pinned: number | null = null;
  dayLength = DAY_LENGTH;

  setEnv(env: EnvDef | null, gradeKey: string | null): void {
    this.env = env;
    this.base = gradeFor(env?.grade ?? gradeKey);
  }

  get def(): EnvDef | null {
    return this.env;
  }

  get cycles(): boolean {
    return !!this.env?.cycle;
  }

  /** Evaluate at `clock` seconds. Returns null when no EnvDef is set (the caller keeps its fallback). */
  eval(clock: number): EnvFrame | null {
    const env = this.env;
    if (!env) return null;
    const out = this.frame;
    if (!env.cycle) {
      out.f = 0.3;
      mixLight(env.day, env.day, 0, out.light);
      gradeAt(this.base, 'day', 'day', 0, out.grade);
      return out;
    }
    const f = this.pinned ?? dayFraction(clock, this.dayLength);
    const { a, b, t } = dayBlend(f);
    out.f = f;
    mixLight(lightFor(env, a), lightFor(env, b), t, out.light);
    out.light.sunI *= keyLightSwapDip(f);
    gradeAt(this.base, a, b, t, out.grade);
    return out;
  }
}

/** Parse a debug `?time=` value: a phase name or a day fraction. */
export function parseTimeParam(v: string | null): number | null {
  if (v === null || v === '') return null;
  const named: Record<string, number> = {
    dawn: 0.02,
    morning: 0.15,
    day: 0.3,
    noon: 0.3,
    dusk: 0.66,
    night: 0.85,
  };
  if (v in named) return named[v]!;
  const n = Number(v);
  return Number.isFinite(n) ? n - Math.floor(n) : null;
}
