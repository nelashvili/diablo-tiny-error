/**
 * Gamepad device (D2R controller style), polled in update():
 * - Left stick -> `moveDir` (radial deadzone, converted from screen to sim via the camera).
 * - A = primary attack (left skill) with soft auto-target (or interact if nothing hostile near),
 *   RT = right skill, X / Y / B / RB / LB / LT = skill slots 0-5 (same slots as the touch wheel
 *   and F1-F6). Held skill buttons repeat.
 * - D-pad = belt 1-4, Start = menu, Select/Back = map, L3 = run/walk, R3 = weapon swap.
 */
import type { EntityId, Vec2 } from '../../core/types';
import type { WorldView } from '../../core/sim/world';
import type { InputContext, InputDevice } from './types';
import { applyRadialDeadzone, DirectionThrottle, RepeatTimer, screenDirToSim } from './math';
import { findInteractTarget, getLocalPlayer, resolveAutoAim } from './autoTarget';

/** W3C "standard" gamepad button indices. */
export const PAD = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  SELECT: 8,
  START: 9,
  L3: 10,
  R3: 11,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
} as const;

export type PadSkillBinding = { button: number; skill: 'left' | 'right' | { slot: number } };

export const DEFAULT_PAD_SKILLS: readonly PadSkillBinding[] = [
  { button: PAD.A, skill: 'left' },
  { button: PAD.RT, skill: 'right' },
  { button: PAD.X, skill: { slot: 0 } },
  { button: PAD.Y, skill: { slot: 1 } },
  { button: PAD.B, skill: { slot: 2 } },
  { button: PAD.RB, skill: { slot: 3 } },
  { button: PAD.LB, skill: { slot: 4 } },
  { button: PAD.LT, skill: { slot: 5 } },
];

const DPAD_BELT: readonly [number, number][] = [
  [PAD.UP, 0],
  [PAD.RIGHT, 1],
  [PAD.DOWN, 2],
  [PAD.LEFT, 3],
];

type PadLike = Pick<Gamepad, 'axes' | 'buttons' | 'connected'> & { mapping?: string };

export interface GamepadOptions {
  deadzone?: number;
  repeatSec?: number;
  getView?: () => WorldView | null;
  /** Custom auto-target finder: nearest hostile within `range` tiles, preferring `dir`. */
  findAutoTarget?: (range: number, dir: Vec2) => EntityId | null;
  getGamepads?: () => readonly (PadLike | null)[];
  /** Screen point the camera centers on (player), for screen->sim stick conversion. */
  getScreenCenter?: () => Vec2;
  initialRunning?: boolean;
}

export class GamepadDevice implements InputDevice {
  private ctx: InputContext | null = null;
  private prev: boolean[] = [];
  private readonly throttle = new DirectionThrottle();
  private readonly timers = new Map<number, RepeatTimer>();
  private stickDir: Vec2 = { x: 0, y: 0 };
  private running: boolean;

  constructor(private readonly opts: GamepadOptions = {}) {
    this.running = opts.initialRunning ?? true;
  }

  attach(_target: HTMLElement, ctx: InputContext): void {
    this.ctx = ctx;
  }

  detach(): void {
    if (this.ctx && (this.stickDir.x !== 0 || this.stickDir.y !== 0)) this.ctx.dispatch({ type: 'stop' });
    this.ctx = null;
    this.prev = [];
    this.timers.clear();
    this.throttle.reset();
  }

  private pad(): PadLike | null {
    const list = this.opts.getGamepads
      ? this.opts.getGamepads()
      : typeof navigator !== 'undefined' && navigator.getGamepads
        ? navigator.getGamepads()
        : [];
    let first: PadLike | null = null;
    for (const p of list) {
      if (!p || !p.connected) continue;
      if (p.mapping === 'standard') return p;
      first ??= p;
    }
    return first;
  }

  update(dt: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const pad = this.pad();
    if (!pad) {
      if (this.prev.length) this.releaseAll(ctx);
      return;
    }
    const down = (i: number): boolean => {
      const b = pad.buttons[i];
      return !!b && (b.pressed || b.value > 0.5);
    };
    const pressed = (i: number): boolean => down(i) && !this.prev[i];

    // Movement
    const st = applyRadialDeadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0, this.opts.deadzone ?? 0.2);
    const center = this.opts.getScreenCenter?.() ?? defaultCenter();
    this.stickDir = st.magnitude > 0 ? screenDirToSim(ctx, center, st.dir.x, st.dir.y) : { x: 0, y: 0 };
    const send = this.throttle.next(this.stickDir, dt);
    if (send === 'stop') ctx.dispatch({ type: 'stop' });
    else if (send) ctx.dispatch({ type: 'moveDir', dir: send });

    // Skills (press fires, hold repeats)
    for (const b of DEFAULT_PAD_SKILLS) {
      let timer = this.timers.get(b.button);
      if (!timer) {
        timer = new RepeatTimer(this.opts.repeatSec ?? 0.2);
        this.timers.set(b.button, timer);
      }
      if (pressed(b.button)) {
        this.fireSkill(ctx, b, true);
        timer.start();
      } else if (!down(b.button)) timer.stop();
      else if (timer.tick(dt)) this.fireSkill(ctx, b, false);
    }

    for (const [btn, idx] of DPAD_BELT) if (pressed(btn)) ctx.dispatch({ type: 'useBeltSlot', index: idx });
    if (pressed(PAD.START)) ctx.togglePanel('menu');
    if (pressed(PAD.SELECT)) ctx.togglePanel('map');
    if (pressed(PAD.L3)) {
      this.running = !this.running;
      ctx.dispatch({ type: 'setRunning', running: this.running });
    }
    if (pressed(PAD.R3)) ctx.dispatch({ type: 'swapWeapons' });

    this.prev = pad.buttons.map((_, i) => down(i));
  }

  private releaseAll(ctx: InputContext): void {
    this.prev = [];
    for (const t of this.timers.values()) t.stop();
    if (this.throttle.next({ x: 0, y: 0 }, 0) === 'stop') ctx.dispatch({ type: 'stop' });
  }

  private skillFor(ctx: InputContext, b: PadSkillBinding): string | null {
    const sel = ctx.getSelectedSkills();
    if (b.skill === 'left') return sel.left || null;
    if (b.skill === 'right') return sel.right || null;
    return sel.hotkeys[b.skill.slot] ?? null;
  }

  private fireSkill(ctx: InputContext, b: PadSkillBinding, initial: boolean): void {
    const skillId = this.skillFor(ctx, b);
    if (!skillId) return;
    const view = this.opts.getView?.() ?? null;
    const aim = resolveAutoAim(view, skillId, this.stickDir, this.opts.findAutoTarget);
    // Primary button with nothing hostile around: talk / pick up / use the nearest thing instead.
    if (b.skill === 'left' && aim.targetId == null) {
      if (!initial) return;
      const p = getLocalPlayer(view);
      if (view && p) {
        const id = findInteractTarget(view, { from: p.pos, facing: this.stickDir, range: 2.5 });
        if (id != null) {
          ctx.dispatch({ type: 'interact', targetId: id });
          return;
        }
      }
    }
    if (aim.targetId == null && aim.targetPos == null) return;
    ctx.dispatch({ type: 'useSkill', skillId, ...aim });
  }
}

function defaultCenter(): Vec2 {
  if (typeof window === 'undefined') return { x: 0, y: 0 };
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}
