/**
 * Weather schedule: which weather a level has at a play-time clock, and how strong. Deterministic
 * (hash of the environment id and time slot), so it pauses with the game and every visit agrees.
 */
import * as THREE from 'three';
import type { EnvDef, EnvLightDef, WeatherKind } from '../../data/schema';
import type { GradeParams } from '../vfx/post';
import { hash01 } from '../map/chunking';

/** Seconds per weather slot; each slot rolls a new weather from the env's weights. */
export const WEATHER_SLOT = 150;
/** Seconds to build up or clear away at a slot boundary. */
export const WEATHER_RAMP = 25;

export interface WeatherState {
  kind: WeatherKind;
  /** 0..1 strength (ramps at changes). */
  intensity: number;
  /** 0..1 lightning flash (storms only). */
  flash: number;
}

export function envSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return h;
}

/** The weather rolled for slot `slot`. */
export function slotWeather(env: EnvDef, slot: number): WeatherKind {
  const table = env.weather;
  if (!table?.length) return 'clear';
  let total = 0;
  for (const w of table) total += Math.max(0, w.weight);
  if (total <= 0) return 'clear';
  let r = hash01(envSeed(env.id), slot) * total;
  for (const w of table) {
    r -= Math.max(0, w.weight);
    if (r < 0) return w.kind;
  }
  return table[table.length - 1]!.kind;
}

const smooth = (x: number): number => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/** Lightning: a few short double-flashes a minute, fast rise and a soft decay. */
export function lightningAt(seed: number, clock: number): number {
  let f = 0;
  const b = Math.floor(clock);
  for (let k = b - 1; k <= b; k++) {
    if (hash01(seed ^ 0x51ed, k) >= 0.06) continue;
    const t = clock - (k + hash01(seed ^ 0x2b7, k) * 0.6);
    if (t < 0) continue;
    const one = (u: number): number => (u < 0 ? 0 : u < 0.06 ? u / 0.06 : Math.exp(-(u - 0.06) * 6));
    f = Math.max(f, one(t), 0.6 * one(t - 0.22));
  }
  return Math.min(1, f);
}

/** Weather at `clock`; `pinned` forces a kind at full strength (debug ?weather=). */
export function weatherAt(
  env: EnvDef | null,
  clock: number,
  pinned: WeatherKind | null = null,
  out: WeatherState = { kind: 'clear', intensity: 0, flash: 0 },
): WeatherState {
  out.flash = 0;
  // No weather table (indoors): always clear, even when pinned.
  if (!env?.weather?.length) {
    out.kind = 'clear';
    out.intensity = 0;
    return out;
  }
  const seed = envSeed(env.id);
  if (pinned) {
    out.kind = pinned;
    out.intensity = pinned === 'clear' ? 0 : 1;
  } else {
    const slot = Math.floor(clock / WEATHER_SLOT);
    const t = clock - slot * WEATHER_SLOT;
    const kind = slotWeather(env, slot);
    const rampIn = slotWeather(env, slot - 1) === kind ? 1 : smooth(t / WEATHER_RAMP);
    const rampOut = slotWeather(env, slot + 1) === kind ? 1 : smooth((WEATHER_SLOT - t) / WEATHER_RAMP);
    out.kind = kind;
    out.intensity = kind === 'clear' ? 0 : Math.min(rampIn, rampOut);
  }
  if (out.kind === 'storm') out.flash = lightningAt(seed, clock) * out.intensity;
  return out;
}

/** How wet the ground gets under each weather (0 = dry). */
export const WETTING: Partial<Record<WeatherKind, number>> = { rain: 0.8, storm: 1 };

/** Ease ground wetness toward the weather: soaks in ~20 s, dries over ~60 s. */
export function stepWetness(wet: number, w: WeatherState, dt: number): number {
  const target = (WETTING[w.kind] ?? 0) * w.intensity;
  const tau = target > wet ? 20 : 60;
  return wet + (target - wet) * Math.min(1, dt / tau);
}

const KINDS: readonly WeatherKind[] = ['clear', 'rain', 'storm', 'snow', 'ash', 'embers', 'spores', 'sand'];

/** Parse a debug `?weather=` value. */
export function parseWeatherParam(v: string | null): WeatherKind | null {
  return v && (KINDS as readonly string[]).includes(v) ? (v as WeatherKind) : null;
}

/** How each weather changes the scene at full strength. */
interface WeatherMood {
  sun: number; // key light multiplier
  hemi: number; // ambient multiplier
  fogNear: number; // fog radius multipliers
  fogFar: number;
  fogColor: number; // fog drifts toward this (darkened at night)
  fogMix: number;
  sat: number; // grade saturation multiplier
}

export const WEATHER_MOODS: Partial<Record<WeatherKind, WeatherMood>> = {
  rain: { sun: 0.55, hemi: 0.9, fogNear: 0.75, fogFar: 0.8, fogColor: 0x8a96a6, fogMix: 0.3, sat: 0.88 },
  storm: { sun: 0.3, hemi: 0.8, fogNear: 0.65, fogFar: 0.7, fogColor: 0x5a6474, fogMix: 0.4, sat: 0.8 },
  snow: { sun: 0.8, hemi: 1.0, fogNear: 0.7, fogFar: 0.8, fogColor: 0xd8e0e8, fogMix: 0.4, sat: 0.9 },
  ash: { sun: 0.75, hemi: 0.95, fogNear: 0.85, fogFar: 0.9, fogColor: 0x6a6460, fogMix: 0.3, sat: 0.92 },
  sand: { sun: 0.7, hemi: 1.0, fogNear: 0.5, fogFar: 0.55, fogColor: 0xc8a070, fogMix: 0.6, sat: 0.95 },
};

/** Fog used when weather needs fog but the environment has none. */
const CLEAR_FOG = { near: 30, far: 60 };
const _a = new THREE.Color();
const _b = new THREE.Color();

/** Apply weather to an evaluated frame (light + grade), in place. */
export function applyWeather(light: EnvLightDef, grade: GradeParams, w: WeatherState): void {
  const m = WEATHER_MOODS[w.kind];
  const i = w.intensity;
  if (m && i > 0) {
    const lerp = (k: number): number => 1 + (k - 1) * i;
    // Weather colors darken with the light (grey rain fog shouldn't glow at night).
    const dim = Math.min(1, light.sunI / 2);
    light.sunI *= lerp(m.sun);
    light.hemi *= lerp(m.hemi);
    const fog = (light.fog ??= { color: light.bg, near: CLEAR_FOG.near, far: CLEAR_FOG.far });
    fog.near *= lerp(m.fogNear);
    fog.far *= lerp(m.fogFar);
    _b.setHex(m.fogColor).multiplyScalar(dim);
    fog.color = _a
      .setHex(fog.color)
      .lerp(_b, m.fogMix * i)
      .getHex();
    grade.sat *= lerp(m.sat);
  }
  if (w.flash > 0) {
    light.hemi += 1.4 * w.flash;
    light.sky = _a
      .setHex(light.sky)
      .lerp(_b.setHex(0xe8f0ff), w.flash * 0.7)
      .getHex();
    light.bg = _a
      .setHex(light.bg)
      .lerp(_b.setHex(0x404858), w.flash * 0.5)
      .getHex();
  }
}
