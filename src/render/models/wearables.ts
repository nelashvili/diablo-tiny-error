/**
 * Worn gear on the universal humanoid rig: boots, gloves, belts and what a chest piece adds over the
 * recolored torso (harness straps, pauldrons, a tabard, a mantle and cape). Each armor line has its
 * own shape (data/items/_armorTable `look.shape`); tiers add rivets and trim (exceptional) then gold
 * and glow strips (elite), rare/set/unique pieces get a colored gem, and every drop varies a little.
 * Pieces are laid out per bone like the armor bodies (armor.ts) and bound to the hero's skeleton. The
 * same layouts placed on a standing mannequin are the inventory icon and the item on the ground, so
 * what you pick up is what the hero wears.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WornSlot, WornSpec } from '../types';
import { shade, unit } from './rig';
import { glowMaterial } from './toon';
import {
  SIDES,
  ball,
  bindPieces,
  part,
  pieceGeometry,
  pieceMatrix,
  plate,
  tube,
  vertexColorToon,
  type Lengths,
  type Piece,
} from './armor';

const METAL = 0x8a929c;
const DARK = 0x26221e;
const GOLD = 0xe0b040;

/** Shapes whose trim color glows (jet nozzles, rune strips, a mesh vest's lights...). */
const TRIM_GLOWS = new Set(['jet', 'bracer', 'mesh', 'cord', 'gauntlet', 'suit']);

/** The color the glowing pieces of `spec` share (one glow mesh per item). */
export function wornGlowColor(spec: WornSpec): number {
  return spec.glow || spec.accent || (TRIM_GLOWS.has(spec.shape) ? spec.trim : 0) || 0x4fc3ff;
}

interface Ctx {
  spec: WornSpec;
  L: Lengths;
  /** Main color (varied a little per item), trim, darker main, sole/leather. */
  P: number;
  T: number;
  D: number;
  /** Rivets and buckles: metal, gold on elite pieces. */
  M: number;
  /** Variation picks: 0..1. */
  v: number;
}

const glow = (p: Piece): Piece => ({ ...p, glow: true });
/** How far the ankle-to-ball foot bone points below level (radians, bind pose). */
const FOOT_TILT = 0.5;
/** A point `fwd` ahead of the ankle and `up` above it, in the foot bone's frame. */
const flat = (fwd: number, up: number): [number, number, number] => [
  0,
  fwd * Math.cos(FOOT_TILT) - up * Math.sin(FOOT_TILT),
  fwd * Math.sin(FOOT_TILT) + up * Math.cos(FOOT_TILT),
];
/** `n` options picked by the item's variation. */
const pick = (v: number, n: number, salt = 0): number => Math.floor(((v * 7.31 + salt * 0.37) % 1) * n);

function ctx(spec: WornSpec, L: Lengths): Ctx {
  const v = spec.vary;
  const P = shade(spec.primary, 0.93 + v * 0.14);
  return {
    spec,
    L,
    P,
    T: spec.trim,
    D: shade(spec.primary, 0.5),
    M: spec.tier >= 2 ? GOLD : METAL,
    v,
  };
}

/** +1 on the side of a limb facing away from the body (back of the hand, outside of the leg). */
const outer = (s: 'l' | 'r'): number => (s === 'l' ? -1 : 1);

// ------------------------------------------------------------------------------------------- boots

function boots(c: Ctx): Piece[] {
  const { L, P, T, D, M, spec } = c;
  const out: Piece[] = [];
  for (const s of SIDES) {
    const f = `foot_${s}`;
    const k = `calf_${s}`;
    const lk = L(k);
    const o = outer(s);
    // The foot bone runs down from the ankle to the ball: level the shoe and its sole with the ground.
    const foot = (w: number, h: number, col = P) => [
      plate(f, flat(0.11, -0.025), [w, 0.28, h], col, [FOOT_TILT, 0, 0]),
      plate(f, flat(0.11, -0.025 - h / 2), [w + 0.01, 0.295, 0.026], D, [FOOT_TILT, 0, 0]),
    ];
    const shaft = (from: number, to: number, r: number, col = P) => tube(k, lk, from, to, r, col);
    const cuffAt = 0.66 + (pick(c.v, 3) - 1) * 0.05;
    switch (spec.shape) {
      case 'trail':
        out.push(...foot(0.125, 0.1), shaft(0.55, 1.02, 0.08), shaft(0.53, 0.58, 0.086, T));
        for (const y of [0.64, 0.76, 0.88]) out.push(plate(k, [0, lk * y, 0.078], [0.06, 0.012, 0.012], T));
        out.push(plate(f, flat(0.1, -0.079), [0.137, 0.27, 0.012], T, [FOOT_TILT, 0, 0]));
        break;
      case 'heavy':
        out.push(
          ...foot(0.15, 0.12),
          plate(f, flat(0.19, -0.02), [0.156, 0.08, 0.125], T, [FOOT_TILT, 0, 0]),
          shaft(0.5, 1.02, 0.094),
          shaft(0.6, 0.64, 0.1, T),
          shaft(0.8, 0.84, 0.1, T),
        );
        break;
      case 'patrol':
        out.push(
          ...foot(0.13, 0.1),
          shaft(0.08, 1.02, 0.088),
          plate(k, [0, lk * 0.08, 0.075], [0.11, 0.12, 0.04], T),
          plate(k, [o * 0.086, lk * 0.55, 0], [0.012, lk * 0.88, 0.03], T),
        );
        break;
      case 'plated':
        out.push(
          ...foot(0.14, 0.11, D),
          plate(f, flat(0.05, 0.03), [0.13, 0.07, 0.03], P, [FOOT_TILT, 0, 0]),
          plate(f, flat(0.13, 0.025), [0.13, 0.08, 0.03], P, [FOOT_TILT, 0, 0]),
          shaft(0.1, 1.02, 0.088, D),
          plate(k, [0, lk * 0.52, 0.075], [0.13, lk * 0.86, 0.05], P),
          { ...ball(k, 0, 0.065, T), pos: [0, 0.01, 0.06] },
        );
        break;
      case 'yedi':
        out.push(...foot(0.125, 0.1), shaft(0.25, 1.02, 0.085), shaft(0.22, 0.34, 0.094, T));
        out.push(shaft(0.6, 0.64, 0.088, shade(P, 0.8)));
        break;
      case 'jet':
        out.push(
          ...foot(0.15, 0.12),
          shaft(0.42, 1.02, 0.095),
          plate(k, [0, lk * 0.7, 0.085], [0.11, lk * 0.5, 0.03], T),
        );
        for (const x of [0.035, -0.035])
          out.push(
            part(k, unit.cylinder(), [x, lk * 0.83, -0.11], [0.045, lk * 0.32, 0.045], METAL),
            glow(part(k, unit.cylinder(), [x, lk * 1.0, -0.11], [0.038, 0.02, 0.038], T)),
          );
        break;
      case 'sandal':
        out.push(plate(f, flat(0.1, -0.075), [0.125, 0.26, 0.022], D, [FOOT_TILT, 0, 0]));
        for (const x of [0.04, 0.1, 0.16])
          out.push(plate(f, flat(x, -0.03), [0.13, 0.022, 0.09], T, [FOOT_TILT, 0, 0]));
        out.push(shaft(0.82, 0.98, 0.078), shaft(0.6, 0.64, 0.076, T));
        break;
      default:
        // work: plain leather boots with a turned-down cuff and a tongue
        out.push(
          ...foot(0.13, 0.1),
          shaft(0.68, 1.02, 0.082),
          shaft(cuffAt, cuffAt + 0.05, 0.088, T),
          plate(k, [0, lk * 0.86, 0.08], [0.05, lk * 0.26, 0.016], T),
        );
    }
    if (spec.tier >= 1) out.push(plate(k, [o * 0.09, lk * 0.8, 0.02], [0.02, 0.045, 0.055], M));
    if (spec.tier >= 1 && pick(c.v, 2, 1)) out.push(shaft(0.9, 0.93, 0.091, M));
    if (spec.tier >= 2) out.push(glow(plate(k, [0, lk * 0.76, 0.093], [0.022, lk * 0.3, 0.012], GOLD)));
    if (spec.accent)
      out.push(glow(part(k, unit.gem(), [o * 0.095, lk * 0.7, 0.03], [0.032, 0.046, 0.032], spec.accent)));
  }
  return out;
}

// ------------------------------------------------------------------------------------------ gloves

function gloves(c: Ctx): Piece[] {
  const { L, P, T, D, M, spec } = c;
  const out: Piece[] = [];
  for (const s of SIDES) {
    const h = `hand_${s}`;
    const a = `lowerarm_${s}`;
    const lh = L(h);
    const la = L(a);
    const o = outer(s);
    // Hand frame: y toward the fingers, x through the back of the hand (`o`), z across the knuckles.
    const palm = (t: number, len: number, w: number, col = P, y = lh * 0.45) =>
      plate(h, [0, y, 0], [t, len, w], col);
    const cuff = (from: number, to: number, r: number, col = P) => tube(a, la, from, to, r, col);
    switch (spec.shape) {
      case 'padded':
        out.push(
          palm(0.066, lh * 1.15, 0.106),
          plate(h, [o * 0.035, lh * 0.75, 0], [0.016, 0.04, 0.102], T),
          cuff(0.72, 1.0, 0.058, T),
        );
        break;
      case 'heavy':
        out.push(
          palm(0.072, lh * 1.2, 0.112),
          plate(h, [o * 0.039, lh * 0.4, 0], [0.015, lh * 0.62, 0.092], T),
          cuff(0.6, 1.0, 0.06),
          cuff(0.58, 0.63, 0.064, T),
        );
        break;
      case 'grip':
        // fingerless: the fingers stay bare
        out.push(
          palm(0.064, lh * 0.62, 0.104, P, lh * 0.2),
          plate(h, [o * 0.034, lh * 0.5, 0], [0.016, 0.026, 0.106], T),
          cuff(0.8, 1.0, 0.05),
          cuff(0.88, 0.95, 0.054, T),
        );
        break;
      case 'plated':
        out.push(
          palm(0.068, lh * 1.15, 0.106, D),
          plate(h, [o * 0.037, lh * 0.28, 0], [0.015, lh * 0.36, 0.096], P),
          plate(h, [o * 0.037, lh * 0.72, 0], [0.015, lh * 0.36, 0.096], P),
          part(a, unit.taper(), [0, la * 0.76, 0], [0.135, la * 0.48, 0.135], P, [Math.PI, 0, 0]),
          cuff(0.52, 0.56, 0.062, T),
        );
        break;
      case 'wraps':
        out.push(palm(0.058, lh * 0.9, 0.098));
        for (let i = 0; i < 4; i++)
          out.push(cuff(0.42 + i * 0.13, 0.52 + i * 0.13, 0.049, i % 2 ? shade(P, 0.85) : P));
        out.push(cuff(0.95, 1.0, 0.052, T));
        break;
      case 'gauntlet':
        out.push(
          palm(0.068, lh * 1.15, 0.106, D),
          plate(h, [o * 0.037, lh * 0.4, 0], [0.015, lh * 0.6, 0.096], P),
          cuff(0.35, 1.0, 0.06),
          plate(a, [o * 0.066, la * 0.6, 0], [0.036, la * 0.38, 0.052], T),
          part(a, unit.cylinder(), [o * 0.066, la * 0.36, 0.012], [0.016, la * 0.14, 0.016], METAL),
          glow(part(a, unit.cylinder(), [o * 0.066, la * 0.28, 0.012], [0.02, 0.012, 0.02], T)),
        );
        break;
      case 'bracer':
        out.push(
          palm(0.056, lh * 0.7, 0.096, P, lh * 0.3),
          cuff(0.45, 0.96, 0.056),
          glow(plate(a, [o * 0.057, la * 0.7, 0], [0.008, la * 0.32, 0.02], T)),
          glow(plate(a, [0, la * 0.7, 0.057], [0.02, la * 0.32, 0.008], T)),
          glow(part(a, unit.gem(), [o * 0.06, la * 0.92, 0], [0.026, 0.036, 0.026], T)),
        );
        break;
      default:
        // work: canvas gloves with a strap over the back
        out.push(
          palm(0.062, lh * 1.15, 0.1),
          plate(h, [o * 0.033, lh * 0.2, 0], [0.012, 0.03, 0.102], T),
          cuff(0.8, 1.0, 0.05),
        );
    }
    if (spec.tier >= 1)
      for (const z of [-0.03, 0, 0.03])
        out.push({ ...ball(h, lh * 0.82, 0.011, M), pos: [o * 0.04, lh * 0.82, z] });
    if (spec.tier >= 2) out.push(glow(cuff(0.97, 1.0, 0.066, GOLD)));
    if (spec.accent)
      out.push(glow(part(h, unit.gem(), [o * 0.042, lh * 0.35, 0], [0.026, 0.034, 0.026], spec.accent)));
  }
  return out;
}

// ------------------------------------------------------------------------------------------- belts

function belts(c: Ctx): Piece[] {
  const { L, P, T, D, M, spec } = c;
  // Pelvis frame: y up the spine, z forward, x to the hero's left.
  const band = (h: number, col = P, y = 0.05, grow = 0) =>
    part('pelvis', unit.cylinder(), [0, y, 0], [0.355 + grow, h, 0.265 + grow], col);
  const around = (n: number, from: number, to: number, f: (x: number, z: number, a: number) => Piece) => {
    const out: Piece[] = [];
    for (let i = 0; i < n; i++) {
      const a = from + ((to - from) * i) / Math.max(1, n - 1);
      out.push(f(Math.sin(a) * 0.178, Math.cos(a) * 0.134, a));
    }
    return out;
  };
  const out: Piece[] = [];
  const buckleSide = pick(c.v, 2) ? 1 : -1;
  switch (spec.shape) {
    case 'sash':
      out.push(
        band(0.08),
        plate('pelvis', [buckleSide * 0.165, 0.04, 0.06], [0.05, 0.07, 0.06], T),
        plate('pelvis', [buckleSide * 0.17, -0.06, 0.07], [0.032, 0.13, 0.016], P, [0, 0, buckleSide * 0.12]),
      );
      break;
    case 'tool':
      out.push(band(0.06), plate('pelvis', [0, 0.05, 0.136], [0.06, 0.05, 0.016], M));
      out.push(
        ...around(2 + pick(c.v, 2), 0.7, 1.6, (x, z, a) =>
          plate('pelvis', [x, 0.02, z], [0.07, 0.085, 0.05], T, [0, a, 0]),
        ),
      );
      out.push(part('pelvis', unit.cylinder(), [-0.18, -0.04, 0.02], [0.022, 0.16, 0.022], METAL));
      break;
    case 'utility':
      out.push(band(0.065), plate('pelvis', [0, 0.05, 0.137], [0.075, 0.058, 0.02], T));
      out.push(
        ...around(6, -1.7, 1.7, (x, z, a) =>
          Math.abs(a) < 0.3
            ? plate('pelvis', [0, 0.05, 0.137], [0.075, 0.058, 0.02], T)
            : part('pelvis', unit.cylinder(), [x, 0.03, z], [0.05, 0.08, 0.05], T),
        ),
      );
      break;
    case 'combat': {
      const c3 = L('spine_03');
      out.push(band(0.06), plate('pelvis', [0, 0.05, 0.136], [0.065, 0.05, 0.02], M));
      out.push(
        ...around(5, -0.9, 0.9, (x, z, a) =>
          plate('pelvis', [x, 0.05, z + 0.004], [0.034, 0.05, 0.03], T, [0, a, 0]),
        ),
      );
      // Bandolier across the chest, front and back.
      out.push(
        plate('spine_03', [0, c3 * 0.3, 0.118], [0.06, 0.56, 0.02], P, [0, 0, 0.75]),
        plate('spine_03', [0, c3 * 0.3, -0.112], [0.06, 0.56, 0.02], P, [0, 0, -0.75]),
      );
      for (let i = -2; i <= 2; i++)
        out.push(
          plate('spine_03', [i * 0.045, c3 * 0.3 - i * 0.042, 0.13], [0.026, 0.04, 0.014], T, [0, 0, 0.75]),
        );
      break;
    }
    case 'plated':
      out.push(
        band(0.07, M),
        plate('pelvis', [0, -0.06, 0.138], [0.16, 0.13, 0.03], P, [-0.15, 0, 0]),
        plate('pelvis', [0.15, -0.05, 0.07], [0.03, 0.12, 0.12], T, [0, 0, 0.15]),
        plate('pelvis', [-0.15, -0.05, 0.07], [0.03, 0.12, 0.12], T, [0, 0, -0.15]),
        plate('pelvis', [0, 0.05, 0.142], [0.07, 0.06, 0.02], T),
      );
      break;
    case 'yediSash':
      out.push(
        band(0.11, P, 0.04),
        band(0.03, D, 0.1, 0.008),
        plate('pelvis', [0.12, 0.06, 0.13], [0.05, 0.05, 0.035], D),
        plate('pelvis', [-0.12, 0.06, 0.13], [0.05, 0.05, 0.035], D),
        part('pelvis', unit.cylinder(), [0.18, 0.0, 0.03], [0.02, 0.07, 0.02], METAL),
      );
      break;
    case 'holster': {
      const lt = L('thigh_r');
      out.push(
        part('pelvis', unit.cylinder(), [0, 0.04, 0], [0.36, 0.055, 0.27], P, [0, 0, 0.1]),
        plate('pelvis', [0, 0.05, 0.136], [0.065, 0.05, 0.02], T),
        plate('thigh_r', [0.085, lt * 0.28, 0], [0.04, 0.17, 0.075], P),
        plate('thigh_r', [0.09, lt * 0.13, -0.01], [0.03, 0.06, 0.035], DARK),
        tube('thigh_r', lt, 0.4, 0.44, 0.104, P),
      );
      out.push(
        ...around(4, -1.4, -0.5, (x, z, a) =>
          part('pelvis', unit.cylinder(), [x, 0.05, z], [0.018, 0.05, 0.018], T, [0, a, 0]),
        ),
      );
      break;
    }
    case 'cord':
      out.push(
        band(0.022, P, 0.07),
        band(0.022, P, 0.035, 0.004),
        plate('pelvis', [0.04, -0.05, 0.135], [0.016, 0.12, 0.012], P, [0, 0, 0.1]),
        plate('pelvis', [-0.03, -0.06, 0.135], [0.016, 0.14, 0.012], P, [0, 0, -0.08]),
        glow(part('pelvis', unit.gem(), [0, -0.0, 0.145], [0.04, 0.06, 0.04], T)),
      );
      break;
    default:
      out.push(band(0.06));
  }
  if (spec.tier >= 1)
    out.push(...around(4, 1.9, 4.4, (x, z) => ({ ...ball('pelvis', 0.05, 0.012, M), pos: [x, 0.05, z] })));
  if (spec.tier >= 2) out.push(glow(plate('pelvis', [0, 0.05, 0.15], [0.03, 0.03, 0.01], GOLD)));
  if (spec.accent)
    out.push(glow(part('pelvis', unit.gem(), [0, 0.05, 0.155], [0.03, 0.04, 0.03], spec.accent)));
  return out;
}

// ------------------------------------------------------------------------------------- chest extras

function chests(c: Ctx): Piece[] {
  const { L, P, T, D, M, spec } = c;
  const c3 = L('spine_03');
  const front = (y: number, w: number, h: number, d: number, col: number, z = 0.11, rot?: Piece['rot']) =>
    plate('spine_03', [0, c3 * y, z], [w, h, d], col, rot);
  const pauldron = (s: 'l' | 'r', r: number, col: number) =>
    part(`upperarm_${s}`, unit.sphere(), [0, 0.03, 0], [r * 2, r * 1.5, r * 2], col);
  const out: Piece[] = [];
  switch (spec.shape) {
    case 'suit':
      out.push(
        front(0.35, 0.05, 0.42, 0.02, T, 0.115, [0, 0, 0.45]),
        front(0.35, 0.05, 0.42, 0.02, T, 0.115, [0, 0, -0.45]),
        front(0.3, 0.13, 0.085, 0.04, D, 0.13),
        glow(front(0.31, 0.025, 0.025, 0.012, T, 0.152)),
      );
      break;
    case 'vest':
      out.push(
        plate('spine_03', [0.075, c3 * 0.3, 0.1], [0.135, 0.27, 0.05], P),
        plate('spine_03', [-0.075, c3 * 0.3, 0.1], [0.135, 0.27, 0.05], P),
        plate('spine_03', [0, c3 * 0.3, -0.1], [0.3, 0.28, 0.05], P),
        front(0.3, 0.012, 0.26, 0.055, T, 0.102),
      );
      break;
    case 'trooper':
      out.push(
        front(0.42, 0.3, 0.19, 0.07, P, 0.09),
        front(0.4, 0.3, 0.02, 0.075, T, 0.09),
        plate('spine_01', [0, L('spine_01') * 0.6, 0.09], [0.22, 0.1, 0.05], P),
        plate('spine_03', [0, c3 * 0.35, -0.09], [0.28, 0.22, 0.06], P),
        pauldron('l', 0.075, P),
        pauldron('r', 0.075, P),
      );
      break;
    case 'flak':
      out.push(
        tube('neck_01', L('neck_01'), -0.1, 0.55, 0.09, P),
        front(0.25, 0.07, 0.08, 0.05, T, 0.12),
        plate('spine_03', [0.085, c3 * 0.22, 0.12], [0.07, 0.08, 0.05], T),
        plate('spine_03', [-0.085, c3 * 0.22, 0.12], [0.07, 0.08, 0.05], T),
        pauldron('l', 0.068, P),
        pauldron('r', 0.068, P),
      );
      break;
    case 'mesh':
      out.push(
        front(0.32, 0.3, 0.25, 0.045, P, 0.105),
        glow(front(0.4, 0.22, 0.014, 0.012, T, 0.13)),
        glow(front(0.24, 0.22, 0.014, 0.012, T, 0.13)),
        plate('spine_03', [0.16, c3 * 0.3, 0], [0.02, 0.22, 0.2], D),
        plate('spine_03', [-0.16, c3 * 0.3, 0], [0.02, 0.22, 0.2], D),
      );
      break;
    case 'plate':
      out.push(
        front(0.38, 0.38, 0.27, 0.1, P, 0.075),
        front(0.52, 0.36, 0.025, 0.105, T, 0.075),
        tube('neck_01', L('neck_01'), -0.1, 0.45, 0.085, T),
        plate('spine_03', [0, c3 * 0.35, -0.08], [0.34, 0.26, 0.08], P),
        pauldron('l', 0.1, P),
        pauldron('r', 0.1, P),
        part('upperarm_l', unit.sphere(), [0, 0.0, 0], [0.21, 0.04, 0.21], T),
        part('upperarm_r', unit.sphere(), [0, 0.0, 0], [0.21, 0.04, 0.21], T),
      );
      break;
    case 'robe':
      // Yedi tabard: a cream panel front and back down to the knees over a crossed collar.
      out.push(
        front(0.15, 0.15, c3 * 1.2, 0.02, T, 0.118),
        plate('spine_03', [0, c3 * 0.15, -0.115], [0.15, c3 * 1.2, 0.02], T),
        plate('pelvis', [0, -0.17, 0.13], [0.16, 0.34, 0.02], T, [-0.06, 0, 0]),
        plate('pelvis', [0, -0.17, -0.12], [0.16, 0.34, 0.02], T, [0.06, 0, 0]),
        front(0.62, 0.05, 0.22, 0.03, P, 0.11, [0, 0, 0.6]),
        front(0.62, 0.05, 0.22, 0.03, P, 0.11, [0, 0, -0.6]),
      );
      break;
    case 'mantle':
      // Forse mantle: a short shoulder cape over a long one down the back, held by a crystal clasp.
      out.push(
        part('spine_03', unit.taper(), [0, c3 * 0.78, -0.01], [0.48, 0.15, 0.3], P),
        plate('spine_03', [0, c3 * 0.05, -0.135], [0.34, c3 * 1.35, 0.02], T, [0.06, 0, 0]),
        plate('pelvis', [0, -0.2, -0.17], [0.36, 0.42, 0.02], T, [0.12, 0, 0]),
        glow(part('spine_03', unit.gem(), [0, c3 * 0.78, 0.13], [0.04, 0.055, 0.04], spec.glow || T)),
      );
      break;
    case 'harness':
      // Bounty hunter: chest plate, one big pauldron on the left and a strap across.
      out.push(
        front(0.4, 0.28, 0.18, 0.07, P, 0.095),
        front(0.3, 0.06, 0.5, 0.02, T, 0.13, [0, 0, -0.7]),
        plate('spine_03', [0, c3 * 0.3, -0.115], [0.06, 0.5, 0.02], T, [0, 0, 0.7]),
        pauldron('l', 0.1, P),
        part('upperarm_l', unit.sphere(), [0, 0.0, 0], [0.21, 0.04, 0.21], T),
      );
      break;
    default:
      break;
  }
  if (spec.tier >= 1)
    out.push(
      { ...ball('spine_03', c3 * 0.5, 0.012, M), pos: [0.11, c3 * 0.5, 0.14] },
      { ...ball('spine_03', c3 * 0.5, 0.012, M), pos: [-0.11, c3 * 0.5, 0.14] },
    );
  if (spec.tier >= 2)
    out.push(
      glow(front(0.25, 0.1, 0.016, 0.012, GOLD, 0.145, [0, 0, 0.5])),
      glow(front(0.25, 0.1, 0.016, 0.012, GOLD, 0.145, [0, 0, -0.5])),
    );
  if (spec.accent)
    out.push(glow(part('spine_03', unit.gem(), [0, c3 * 0.45, 0.15], [0.04, 0.055, 0.04], spec.accent)));
  return out;
}

const LAYOUTS: Record<WornSlot, (c: Ctx) => Piece[]> = { boots, gloves, belt: belts, chest: chests };

/** The pieces of a worn item, in bone segment frames. */
export function wornLayout(spec: WornSpec, L: Lengths): Piece[] {
  return LAYOUTS[spec.slot](ctx(spec, L));
}

/** Pieces grown around their bone (armored bodies wear gear over their plates). */
export function inflate(pieces: Piece[], k: number): Piece[] {
  if (k === 1) return pieces;
  return pieces.map((p) => ({
    ...p,
    pos: [p.pos[0] * k, p.pos[1], p.pos[2] * k],
    size: [p.size[0] * k, p.size[1], p.size[2] * k],
  }));
}

/** Bind a worn item to a model's skeleton (rest pose). `bulk` > 1 fits it over armor plates. */
export function buildWorn(
  model: THREE.Object3D,
  spec: WornSpec,
  material: THREE.Material,
  bulk = 1,
): THREE.SkinnedMesh[] {
  return bindPieces(
    model,
    (L) => inflate(wornLayout(spec, L), bulk),
    material,
    `Worn_${spec.slot}`,
    wornGlowColor(spec),
  );
}

// ------------------------------------------------------------------------------- display mannequin

/** Bind-pose-like frames of a standing ~1.8 m figure, arms hanging (model faces +Z). */
const DISPLAY_LEN: Record<string, number> = {
  pelvis: 0.1,
  spine_01: 0.12,
  spine_02: 0.12,
  spine_03: 0.2,
  neck_01: 0.08,
  upperarm: 0.28,
  lowerarm: 0.25,
  hand: 0.1,
  thigh: 0.42,
  calf: 0.42,
  foot: 0.15,
};

const displayFrames = new Map<string, THREE.Matrix4>();
function displayFrame(bone: string): THREE.Matrix4 | null {
  const hit = displayFrames.get(bone);
  if (hit) return hit;
  const m = /^(\w+?)_(l|r)$/.exec(bone);
  const name = m ? m[1]! : bone;
  const sx = m ? (m[2] === 'l' ? 1 : -1) : 0;
  const up = new THREE.Vector3(0, 1, 0);
  const down = new THREE.Vector3(0, -1, 0);
  const fwd = new THREE.Vector3(0, 0, 1);
  const side = new THREE.Vector3(1, 0, 0);
  const at: Record<string, [THREE.Vector3, THREE.Vector3, THREE.Vector3]> = {
    pelvis: [new THREE.Vector3(0, 0, 0), up, fwd],
    spine_01: [new THREE.Vector3(0, 0.1, 0), up, fwd],
    spine_03: [new THREE.Vector3(0, 0.34, 0), up, fwd],
    neck_01: [new THREE.Vector3(0, 0.58, 0), up, fwd],
    upperarm: [new THREE.Vector3(0.2 * sx, 0.52, 0), new THREE.Vector3(0.22 * sx, -1, 0).normalize(), fwd],
    // Gloves are shown side by side, backs of the hands facing the viewer.
    lowerarm: [new THREE.Vector3(0.12 * sx, 0.25, 0), down, side],
    hand: [new THREE.Vector3(0.12 * sx, 0.0, 0), down, side],
    thigh: [new THREE.Vector3(0.1 * sx, -0.05, 0), down, fwd],
    calf: [new THREE.Vector3(0.1 * sx, -0.47, 0), down, fwd],
    foot: [new THREE.Vector3(0.1 * sx, -0.89, 0), new THREE.Vector3(0, -0.3, 1).normalize(), up],
  };
  const f = at[name];
  if (!f) return null;
  const [o, y, zHint] = f;
  const z = zHint.clone().addScaledVector(y, -zHint.dot(y)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  const out = new THREE.Matrix4().makeBasis(x, y, z).setPosition(o);
  displayFrames.set(bone, out);
  return out;
}

const displayLen: Lengths = (bone) => DISPLAY_LEN[bone.replace(/_(l|r)$/, '')] ?? 0.12;

/** The torso a chest piece is shown on (the body it recolors when worn). */
function displayTorso(spec: WornSpec): Piece[] {
  const P = spec.primary;
  return [
    plate('spine_03', [0, -0.08, 0], [0.32, 0.46, 0.2], P),
    tube('upperarm_l', 0.28, 0, 0.55, 0.06, P),
    tube('upperarm_r', 0.28, 0, 0.55, 0.06, P),
  ];
}

const _pm = new THREE.Matrix4();
/**
 * A worn item on its own (inventory icon, item on the ground): its pieces on the display mannequin,
 * merged into one vertex-colored mesh plus one glowing mesh.
 */
export function buildWornDisplay(spec: WornSpec): THREE.Group {
  const g = new THREE.Group();
  const pieces = [...(spec.slot === 'chest' ? displayTorso(spec) : []), ...wornLayout(spec, displayLen)];
  const solid: THREE.BufferGeometry[] = [];
  const glowing: THREE.BufferGeometry[] = [];
  for (const p of pieces) {
    const frame = displayFrame(p.bone);
    if (!frame) continue;
    pieceMatrix(p, _pm).premultiply(frame);
    (p.glow ? glowing : solid).push(pieceGeometry(p, _pm));
  }
  const add = (geos: THREE.BufferGeometry[], mat: THREE.Material) => {
    if (!geos.length) return;
    const merged = mergeGeometries(geos);
    for (const geo of geos) geo.dispose();
    if (merged) g.add(new THREE.Mesh(merged, mat));
  };
  add(solid, vertexColorToon());
  add(glowing, glowMaterial(wornGlowColor(spec)));
  // Center it (the frames put boots at the feet, gloves at the hips).
  const box = new THREE.Box3().setFromObject(g);
  const c = box.getCenter(new THREE.Vector3());
  for (const child of g.children) child.position.sub(c);
  return g;
}
