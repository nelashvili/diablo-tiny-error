/**
 * Pure input math shared by the touch joystick and the gamepad stick: deadzones, screen->sim
 * direction conversion and hold-to-repeat timing.
 */
import type { Vec2 } from '../../core/types';
import type { InputContext } from './types';

export interface StickResult {
  /** Unit direction in SCREEN space (+y down), or {0,0} inside the deadzone. */
  dir: Vec2;
  /** 0..1 magnitude after deadzone rescale. */
  magnitude: number;
}

/**
 * Radial deadzone with rescale: inputs with length < deadzone are zero, the remaining range is
 * remapped to 0..1 so there's no jump at the edge. Input lengths > 1 are clamped to 1.
 */
export function applyRadialDeadzone(x: number, y: number, deadzone: number): StickResult {
  const l = Math.hypot(x, y);
  if (!(l > deadzone) || l < 1e-9) return { dir: { x: 0, y: 0 }, magnitude: 0 };
  const clamped = Math.min(l, 1);
  const magnitude = deadzone >= 1 ? 1 : (clamped - deadzone) / (1 - deadzone);
  return { dir: { x: x / l, y: y / l }, magnitude };
}

/**
 * Virtual joystick: finger offset (px) from the base center, base radius (px) -> normalized
 * stick vector (length <= 1) and the clamped knob offset in px for drawing.
 */
export function joystickVector(
  dx: number,
  dy: number,
  radius: number,
): { x: number; y: number; knobX: number; knobY: number } {
  const l = Math.hypot(dx, dy);
  const k = l > radius ? radius / l : 1;
  const knobX = dx * k;
  const knobY = dy * k;
  return { x: knobX / radius, y: knobY / radius, knobX, knobY };
}

/**
 * When the finger drags farther than `follow * radius` from the base, the base slides after it
 * (floating joystick). Returns the new base center.
 */
export function followBase(base: Vec2, finger: Vec2, radius: number, follow = 1.4): Vec2 {
  const dx = finger.x - base.x;
  const dy = finger.y - base.y;
  const l = Math.hypot(dx, dy);
  const max = radius * follow;
  if (l <= max) return base;
  const k = (l - max) / l;
  return { x: base.x + dx * k, y: base.y + dy * k };
}

/**
 * Fallback screen->sim mapping for the default iso camera at (+1,+1,+1) looking at the origin:
 * screen right = sim (1,-1)/√2, screen down = sim (1,1)/√2.
 */
export function isoScreenDirToSim(sx: number, sy: number): Vec2 {
  const r = Math.SQRT1_2;
  return { x: (sx + sy) * r, y: (sy - sx) * r };
}

/**
 * Convert a screen-space direction (+y down) to a unit sim-plane direction using the renderer's
 * own projection (two `screenToWorld` probes around `origin`), so it works for any camera.
 * Falls back to the default iso mapping when picking is unavailable.
 */
export function screenDirToSim(
  ctx: Pick<InputContext, 'screenToWorld'>,
  origin: Vec2,
  sx: number,
  sy: number,
  probePx = 60,
): Vec2 {
  const l = Math.hypot(sx, sy);
  if (l < 1e-9) return { x: 0, y: 0 };
  const ux = sx / l;
  const uy = sy / l;
  const a = ctx.screenToWorld(origin.x, origin.y);
  const b = ctx.screenToWorld(origin.x + ux * probePx, origin.y + uy * probePx);
  if (a && b) {
    const d = { x: b.x - a.x, y: b.y - a.y };
    const dl = Math.hypot(d.x, d.y);
    if (dl > 1e-6) return { x: d.x / dl, y: d.y / dl };
  }
  const f = isoScreenDirToSim(ux, uy);
  const fl = Math.hypot(f.x, f.y);
  return { x: f.x / fl, y: f.y / fl };
}

/** Smallest absolute angle between two directions (radians, 0..π). Zero vectors count as π. */
export function angleBetween(a: Vec2, b: Vec2): number {
  const la = Math.hypot(a.x, a.y);
  const lb = Math.hypot(b.x, b.y);
  if (la < 1e-9 || lb < 1e-9) return la < 1e-9 && lb < 1e-9 ? 0 : Math.PI;
  const c = (a.x * b.x + a.y * b.y) / (la * lb);
  return Math.acos(Math.max(-1, Math.min(1, c)));
}

/**
 * Decides when a continuous direction (joystick/stick) must be re-sent as a `moveDir` command:
 * on start/stop, when it turns more than `minAngle`, or every `refreshSec` as a keep-alive.
 */
export class DirectionThrottle {
  private last: Vec2 = { x: 0, y: 0 };
  private sinceSent = 0;
  constructor(
    private readonly minAngle = (4 * Math.PI) / 180,
    private readonly refreshSec = 0.5,
  ) {}

  /** Returns the direction to send, `'stop'` when it just became zero, or null for nothing. */
  next(dir: Vec2, dt: number): Vec2 | 'stop' | null {
    this.sinceSent += dt;
    const wasZero = this.last.x === 0 && this.last.y === 0;
    const isZero = dir.x === 0 && dir.y === 0;
    if (isZero) {
      if (wasZero) return null;
      this.last = { x: 0, y: 0 };
      this.sinceSent = 0;
      return 'stop';
    }
    if (wasZero || angleBetween(dir, this.last) > this.minAngle || this.sinceSent >= this.refreshSec) {
      this.last = { x: dir.x, y: dir.y };
      this.sinceSent = 0;
      return this.last;
    }
    return null;
  }

  reset(): void {
    this.last = { x: 0, y: 0 };
    this.sinceSent = 0;
  }
}

/**
 * Hold-to-repeat timer (D2 hold-to-move / hold-to-attack). `start()` fires immediately (the
 * caller sends the first command itself); `tick(dt)` returns how many repeats are due — at most
 * one per call, so a long frame never bursts commands.
 */
export class RepeatTimer {
  private acc = 0;
  active = false;
  constructor(public intervalSec: number) {}

  start(): void {
    this.active = true;
    this.acc = 0;
  }

  stop(): void {
    this.active = false;
    this.acc = 0;
  }

  tick(dt: number): boolean {
    if (!this.active) return false;
    this.acc += dt;
    if (this.acc >= this.intervalSec) {
      this.acc = Math.min(this.acc - this.intervalSec, this.intervalSec);
      return true;
    }
    return false;
  }
}

/** Long-press detection helper: true when held >= `holdSec` without moving past `slopPx`. */
export function isLongPress(heldSec: number, movedPx: number, holdSec = 0.45, slopPx = 12): boolean {
  return heldSec >= holdSec && movedPx <= slopPx;
}
