/**
 * Pure layout math for the touch skill wheel. All positions are offsets in CSS px from the
 * PRIMARY button center (+x right, +y down). The wheel itself is anchored to the bottom-right
 * safe-area corner by CSS.
 */
import type { Vec2 } from '../../core/types';

export interface WheelLayout {
  primarySize: number;
  skillSize: number;
  stimSize: number;
  beltSize: number;
  /** Distance of the primary center from the right / bottom safe edges. */
  margin: { right: number; bottom: number };
  /** 6 skill slot centers (inner ring 0-2, outer ring 3-5). */
  slots: Vec2[];
  stims: { life: Vec2; mana: Vec2 };
  belt: Vec2;
  /** Joystick base radius (px). */
  stickRadius: number;
}

export const SLOT_COUNT = 6;
const MIN_TOUCH = 56;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const polar = (deg: number, r: number): Vec2 => {
  const a = (deg * Math.PI) / 180;
  // angles measured counter-clockwise from +x with screen y down: 90° = straight up
  return { x: Math.round(Math.cos(a) * r), y: Math.round(-Math.sin(a) * r) };
};

export function computeWheelLayout(width: number, height: number): WheelLayout {
  const minDim = Math.max(1, Math.min(width, height));
  const portrait = height > width;
  const primarySize = Math.round(clamp(minDim * 0.22, 84, 128));
  const skillSize = Math.round(clamp(minDim * 0.15, MIN_TOUCH, 80));
  const stimSize = skillSize;
  const beltSize = MIN_TOUCH;
  const gap = Math.round(clamp(minDim * 0.018, 6, 12));
  const r1 = primarySize / 2 + skillSize / 2 + gap + 4;
  const r2 = r1 + skillSize + gap;
  const inner = [95, 137.5, 180].map((d) => polar(d, r1));
  const outer = [100, 140, 180].map((d) => polar(d, r2));
  const slots = [...inner, ...outer];
  const step = stimSize + gap;
  let stims: { life: Vec2; mana: Vec2 };
  let belt: Vec2;
  if (portrait) {
    // Column above the wheel along the right edge.
    const top = -(r2 + skillSize / 2 + gap + stimSize / 2);
    stims = { life: { x: 0, y: Math.round(top) }, mana: { x: 0, y: Math.round(top - step) } };
    belt = { x: Math.round(-(stimSize / 2 + gap + beltSize / 2)), y: Math.round(top) };
  } else {
    // Row along the bottom edge, left of the outer ring.
    const start = r2 + skillSize / 2 + gap + stimSize / 2;
    stims = { life: { x: -Math.round(start), y: 0 }, mana: { x: -Math.round(start + step), y: 0 } };
    belt = { x: -Math.round(start + step + stimSize / 2 + gap + beltSize / 2), y: 0 };
  }
  const margin = {
    right: Math.round(primarySize / 2 + clamp(minDim * 0.03, 12, 28)),
    bottom: Math.round(primarySize / 2 + clamp(minDim * 0.03, 12, 28)),
  };
  return {
    primarySize,
    skillSize,
    stimSize,
    beltSize,
    margin,
    slots,
    stims,
    belt,
    stickRadius: Math.round(clamp(minDim * 0.11, 48, 80)),
  };
}

/** Fraction of the screen width (from the left) where a touch spawns the floating joystick. */
export const JOYSTICK_ZONE = 0.4;
