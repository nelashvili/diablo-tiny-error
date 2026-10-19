/**
 * Weather particles: one instanced quad per drop/flake, animated entirely on the GPU. Each particle has
 * a fixed random seed; its position is seed * box + velocity * time, wrapped into a box that follows the
 * view center, so drops stay put in the world while the box always covers the screen. Rain draws as
 * streaks along its velocity; flakes, ash, embers and spores as soft dots. Rain also gets ground ripples.
 */
import * as THREE from 'three';
import type { WeatherKind } from '../../data/schema';
import type { QualityLevel } from '../types';
import type { WeatherState } from './weatherState';
import { hash01 } from '../map/chunking';

export interface WeatherLook {
  /** World units per second (x, y, z); y < 0 falls. */
  vel: [number, number, number];
  /** Streak length in seconds of travel (0 = round dot). */
  streak: number;
  /** Width / dot diameter (world units). */
  size: number;
  color: number;
  opacity: number;
  /** Side-to-side drift amplitude (world units). */
  sway: number;
  /** Fraction of the particle budget at full intensity. */
  density: number;
  /** Glowing (additive, bloom). */
  glow?: boolean;
  /** Box height (world units): how high above the ground particles live. */
  height?: number;
  ripples?: boolean;
}

export const WEATHER_LOOKS: Record<Exclude<WeatherKind, 'clear'>, WeatherLook> = {
  rain: {
    vel: [1.6, -20, 0.9],
    streak: 0.05,
    size: 0.05,
    color: 0xc8dcff,
    opacity: 0.6,
    sway: 0,
    density: 0.7,
    ripples: true,
  },
  storm: {
    vel: [4.5, -25, 2.2],
    streak: 0.055,
    size: 0.055,
    color: 0xd0e0ff,
    opacity: 0.6,
    sway: 0,
    density: 1,
    ripples: true,
  },
  snow: {
    vel: [0.5, -1.3, 0.25],
    streak: 0,
    size: 0.14,
    color: 0xffffff,
    opacity: 0.9,
    sway: 0.35,
    density: 0.6,
  },
  ash: {
    vel: [0.35, -0.6, 0.2],
    streak: 0,
    size: 0.12,
    color: 0x8c8884,
    opacity: 0.75,
    sway: 0.45,
    density: 0.35,
  },
  embers: {
    vel: [0.3, 0.8, 0.15],
    streak: 0,
    size: 0.1,
    color: 0xff9040,
    opacity: 0.9,
    sway: 0.5,
    density: 0.12,
    glow: true,
    height: 6,
  },
  spores: {
    vel: [0.12, 0.1, 0.08],
    streak: 0,
    size: 0.1,
    color: 0xd8f0a0,
    opacity: 0.55,
    sway: 0.7,
    density: 0.15,
    glow: true,
    height: 4,
  },
  sand: {
    vel: [8, -0.5, 3],
    streak: 0.06,
    size: 0.05,
    color: 0xd8b888,
    opacity: 0.45,
    sway: 0.15,
    density: 0.8,
    height: 3,
  },
};

/** Particle and ripple budgets per quality. */
export const WEATHER_BUDGET: Record<QualityLevel, { drops: number; ripples: number }> = {
  low: { drops: 500, ripples: 0 },
  medium: { drops: 1800, ripples: 120 },
  high: { drops: 3600, ripples: 260 },
};

/** Horizontal size of the particle box (world units): wider than the far zoom's view. */
const BOX = 48;
const MAX_DROPS = WEATHER_BUDGET.high.drops;
const MAX_RIPPLES = WEATHER_BUDGET.high.ripples;
/** Particle time wraps here to keep float precision (one invisible-ish reshuffle per period). */
const TIME_WRAP = 600;

const DROP_VERT = /* glsl */ `
uniform float uTime;
uniform vec3 uCenter;
uniform vec3 uBox;
uniform vec3 uVel;
uniform float uStreak;
uniform float uSize;
uniform float uSway;
uniform float uDensity;
attribute vec4 aSeed;
varying vec2 vUv;
varying float vFade;
void main() {
  if (aSeed.w > uDensity) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec3 vel = uVel * (0.8 + 0.4 * fract(aSeed.w * 7.31));
  vec3 p = aSeed.xyz * uBox + vel * uTime;
  float ph = aSeed.w * 61.0;
  p.x += sin(uTime * 1.3 + ph) * uSway;
  p.z += cos(uTime * 1.1 + ph * 1.7) * uSway;
  vec3 lo = vec3(uCenter.x - uBox.x * 0.5, 0.0, uCenter.z - uBox.z * 0.5);
  p = mod(p - lo, uBox) + lo;
  // Quad in view space (ortho: view units are world units) from the tail to the head of the streak.
  vec4 head = viewMatrix * vec4(p, 1.0);
  vec4 tail = viewMatrix * vec4(p - vel * uStreak, 1.0);
  vec2 d = head.xy - tail.xy;
  // sqrt(dot) rather than length(): on ANGLE/Metal length(vec2(0)) is NaN, which drops round dots.
  float len2 = dot(d, d);
  float len = sqrt(len2);
  vec2 dir = vec2(0.0, 1.0);
  if (len2 > 1e-8) dir = d / len;
  vec2 nrm = vec2(-dir.y, dir.x);
  float hw = uSize * 0.5;
  float a = position.y + 0.5;
  vec2 xy = tail.xy + dir * (a * (len + 2.0 * hw) - hw) + nrm * position.x * 2.0 * hw;
  gl_Position = projectionMatrix * vec4(xy, mix(tail.z, head.z, a), 1.0);
  vUv = vec2(position.x * 2.0, a);
  // Fade at the box edges (hides the wrap) and near the top.
  vec2 q = abs(p.xz - uCenter.xz) / (uBox.xz * 0.5);
  vFade = (1.0 - smoothstep(0.75, 1.0, max(q.x, q.y))) * (1.0 - smoothstep(0.8, 1.0, p.y / uBox.y));
}
`;

const DROP_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uRound;
varying vec2 vUv;
varying float vFade;
void main() {
  float a;
  if (uRound > 0.5) {
    vec2 c = vec2(vUv.x, vUv.y * 2.0 - 1.0);
    a = 1.0 - smoothstep(0.4, 1.0, length(c));
  } else {
    a = (1.0 - vUv.x * vUv.x) * mix(0.15, 1.0, vUv.y);
  }
  a *= uOpacity * vFade;
  if (a < 0.04) discard;
  gl_FragColor = vec4(uColor, a);
}
`;

const RIPPLE_VERT = /* glsl */ `
uniform float uTime;
uniform vec3 uCenter;
uniform float uBox;
uniform float uDensity;
attribute vec4 aSeed;
varying vec2 vUv;
varying float vPhase;
void main() {
  if (aSeed.w > uDensity) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float cyc = uTime * 1.4 + aSeed.w * 13.0;
  float n = floor(cyc);
  vPhase = cyc - n;
  // A new spot every cycle.
  vec2 spot = fract(aSeed.xy + n * vec2(0.6180339, 0.4142136)) * uBox;
  vec2 lo = uCenter.xz - uBox * 0.5;
  vec2 xz = mod(spot - lo, uBox) + lo;
  float r = 0.32 * (0.6 + 0.4 * aSeed.z);
  vec3 p = vec3(xz.x + position.x * r * 2.0, 0.03, xz.y + position.y * r * 2.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  vUv = position.xy * 2.0;
}
`;

const RIPPLE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
varying float vPhase;
void main() {
  float d = length(vUv);
  float ring = 1.0 - smoothstep(0.0, 0.12, abs(d - vPhase));
  float a = ring * (1.0 - vPhase) * uOpacity * step(d, 1.0);
  if (a < 0.04) discard;
  gl_FragColor = vec4(uColor, a);
}
`;

function seeds(n: number, salt: number): Float32Array {
  // Deterministic scatter: identical every run, no Math.random.
  const a = new Float32Array(n * 4);
  for (let i = 0; i < n * 4; i++) a[i] = hash01(i, salt) * 0.999;
  return a;
}

function quad(count: number, salt: number): THREE.InstancedBufferGeometry {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0]), 3),
  );
  g.setIndex([0, 1, 2, 2, 1, 3]);
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds(count, salt), 4));
  g.instanceCount = count;
  return g;
}

/** Pixels a particle touches are marked crisp in the paint mask (scene alpha 0), or the screen paint
 * filter would smear thin drops away. */
function blend(m: THREE.ShaderMaterial, glow: boolean): void {
  m.transparent = true;
  m.depthWrite = false;
  // Streak quads and ground ripples are built in the shader with either winding.
  m.side = THREE.DoubleSide;
  m.blending = THREE.CustomBlending;
  m.blendSrc = THREE.SrcAlphaFactor;
  m.blendDst = glow ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = THREE.ZeroFactor;
  m.blendDstAlpha = THREE.ZeroFactor;
}

export class WeatherFx {
  readonly group = new THREE.Group();
  private readonly drops: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly ripples: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private budget = WEATHER_BUDGET.medium;
  private kind: WeatherKind = 'clear';

  constructor() {
    this.group.name = 'weather';
    const dropMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCenter: { value: new THREE.Vector3() },
        uBox: { value: new THREE.Vector3(BOX, 12, BOX) },
        uVel: { value: new THREE.Vector3() },
        uStreak: { value: 0 },
        uSize: { value: 0.05 },
        uSway: { value: 0 },
        uDensity: { value: 0 },
        uColor: { value: new THREE.Color() },
        uOpacity: { value: 1 },
        uRound: { value: 0 },
      },
      vertexShader: DROP_VERT,
      fragmentShader: DROP_FRAG,
    });
    blend(dropMat, false);
    dropMat.toneMapped = false;
    this.drops = new THREE.Mesh(quad(MAX_DROPS, 1), dropMat);
    this.drops.frustumCulled = false;
    this.drops.renderOrder = 12;

    const ripMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCenter: { value: new THREE.Vector3() },
        uBox: { value: 26 },
        uDensity: { value: 0 },
        uColor: { value: new THREE.Color(0xdde8ff) },
        uOpacity: { value: 0.35 },
      },
      vertexShader: RIPPLE_VERT,
      fragmentShader: RIPPLE_FRAG,
    });
    blend(ripMat, false);
    this.ripples = new THREE.Mesh(quad(MAX_RIPPLES, 7), ripMat);
    this.ripples.frustumCulled = false;
    this.ripples.renderOrder = 12;
    this.group.add(this.drops, this.ripples);
    this.group.visible = false;
  }

  setQuality(q: QualityLevel): void {
    this.budget = WEATHER_BUDGET[q];
    this.drops.geometry.instanceCount = this.budget.drops;
    this.ripples.geometry.instanceCount = this.budget.ripples;
  }

  /** Show `w` around the view center (cx, cz) at particle time `time` (seconds). */
  update(w: WeatherState, cx: number, cz: number, time: number): void {
    if (w.kind === 'clear' || w.intensity <= 0.001) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    const look = WEATHER_LOOKS[w.kind];
    const t = time % TIME_WRAP;
    const du = this.drops.material.uniforms;
    if (w.kind !== this.kind) {
      this.kind = w.kind;
      (du['uVel']!.value as THREE.Vector3).set(...look.vel);
      (du['uBox']!.value as THREE.Vector3).set(BOX, look.height ?? 12, BOX);
      du['uStreak']!.value = look.streak;
      du['uSize']!.value = look.size;
      du['uSway']!.value = look.sway;
      du['uRound']!.value = look.streak > 0 ? 0 : 1;
      (du['uColor']!.value as THREE.Color).setHex(look.color);
      du['uOpacity']!.value = look.opacity;
      this.drops.material.blendDst = look.glow ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor;
      this.drops.material.needsUpdate = true;
    }
    du['uTime']!.value = t;
    (du['uCenter']!.value as THREE.Vector3).set(cx, 0, cz);
    du['uDensity']!.value = look.density * w.intensity;
    const ru = this.ripples.material.uniforms;
    this.ripples.visible = !!look.ripples && this.budget.ripples > 0;
    ru['uTime']!.value = t;
    (ru['uCenter']!.value as THREE.Vector3).set(cx, 0, cz);
    ru['uDensity']!.value = w.intensity;
  }

  dispose(): void {
    this.drops.geometry.dispose();
    this.drops.material.dispose();
    this.ripples.geometry.dispose();
    this.ripples.material.dispose();
    this.group.removeFromParent();
  }
}
