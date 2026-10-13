/**
 * Mouse + keyboard device, Diablo II classic scheme:
 * - Left click entity -> interact; ground -> moveTo. Holding left keeps moving toward the cursor
 *   (every `repeatSec`), holding on a monster keeps attacking it with the left skill.
 * - Shift + left -> left skill in place (standStill).
 * - Right click -> right skill at the cursor entity/position; hold repeats.
 * - F1-F8 select the right skill from hotkeys, 1-4 belt, Tab map, I/C/S/Q/Esc panels,
 *   R run/walk, W weapon swap, T recall, Alt (hold) item labels, Space closes panels.
 */
import type { Command } from '../../core/sim/commands';
import type { EntityId, Vec2 } from '../../core/types';
import type { InputContext, InputDevice } from './types';
import { DEFAULT_KEYBINDINGS, resolveKey, shouldPreventDefault, type KeyBindings } from './keybindings';
import { RepeatTimer } from './math';

export interface MouseKeyboardOptions {
  bindings?: KeyBindings;
  /** Hold-to-move / hold-to-attack repeat interval. D2 re-paths roughly every 4 frames. */
  repeatSec?: number;
  initialRunning?: boolean;
  /** Is this entity an attackable monster? (for hold-to-attack). Default: never. */
  isHostile?: (id: EntityId) => boolean;
  onShowItemLabels?: (show: boolean) => void;
  closeAllPanels?: () => void;
  /** Where to listen for keys. Default: window. */
  keyTarget?: Window | HTMLElement;
}

type UseSkillCmd = Extract<Command, { type: 'useSkill' }>;

type Hold =
  | { kind: 'none' }
  | { kind: 'move' }
  | { kind: 'attack'; targetId: EntityId }
  | { kind: 'standStill' }
  | { kind: 'right' };

export class MouseKeyboardDevice implements InputDevice {
  private ctx: InputContext | null = null;
  private target: HTMLElement | null = null;
  private keyTarget: Window | HTMLElement | null = null;
  private cursor: Vec2 = { x: 0, y: 0 };
  private leftHold: Hold = { kind: 'none' };
  private rightHeld = false;
  private shift = false;
  private alt = false;
  private running: boolean;
  private readonly leftTimer: RepeatTimer;
  private readonly rightTimer: RepeatTimer;
  private readonly bindings: KeyBindings;

  constructor(private readonly opts: MouseKeyboardOptions = {}) {
    this.bindings = opts.bindings ?? DEFAULT_KEYBINDINGS;
    this.running = opts.initialRunning ?? true;
    this.leftTimer = new RepeatTimer(opts.repeatSec ?? 0.1);
    this.rightTimer = new RepeatTimer(opts.repeatSec ?? 0.1);
  }

  attach(target: HTMLElement, ctx: InputContext): void {
    this.target = target;
    this.ctx = ctx;
    this.keyTarget = this.opts.keyTarget ?? window;
    target.addEventListener('pointerdown', this.onPointerDown);
    target.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('blur', this.onBlur);
    this.keyTarget.addEventListener('keydown', this.onKeyDown as EventListener);
    this.keyTarget.addEventListener('keyup', this.onKeyUp as EventListener);
  }

  detach(): void {
    const t = this.target;
    if (t) {
      t.removeEventListener('pointerdown', this.onPointerDown);
      t.removeEventListener('contextmenu', this.onContextMenu);
    }
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('blur', this.onBlur);
    this.keyTarget?.removeEventListener('keydown', this.onKeyDown as EventListener);
    this.keyTarget?.removeEventListener('keyup', this.onKeyUp as EventListener);
    this.onBlur();
    this.target = null;
    this.ctx = null;
    this.keyTarget = null;
  }

  update(dt: number): void {
    if (!this.ctx) return;
    if (this.leftTimer.tick(dt)) this.repeatLeft();
    if (this.rightTimer.tick(dt)) this.castRight();
  }

  // ------------------------------------------------------------------ pointer

  private localPos(e: { clientX: number; clientY: number }): Vec2 {
    const r = this.target?.getBoundingClientRect();
    return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : { x: e.clientX, y: e.clientY };
  }

  private send(cmd: Command): void {
    this.ctx?.dispatch(cmd);
  }

  private readonly onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
    const ctx = this.ctx;
    if (!ctx || (e.pointerType && e.pointerType === 'touch')) return;
    this.cursor = this.localPos(e);
    if (ctx.isOverUi(this.cursor.x, this.cursor.y)) return;
    e.preventDefault();
    this.shift = e.shiftKey;
    if (e.button === 0) this.leftDown();
    else if (e.button === 2) {
      this.rightHeld = true;
      this.castRight();
      this.rightTimer.start();
    }
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (!this.ctx || (e.pointerType && e.pointerType === 'touch')) return;
    this.cursor = this.localPos(e);
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (e.pointerType && e.pointerType === 'touch') return;
    if (e.button === 0) {
      this.leftHold = { kind: 'none' };
      this.leftTimer.stop();
    } else if (e.button === 2) {
      this.rightHeld = false;
      this.rightTimer.stop();
    }
  };

  private readonly onBlur = (): void => {
    this.leftHold = { kind: 'none' };
    this.leftTimer.stop();
    this.rightHeld = false;
    this.rightTimer.stop();
    this.shift = false;
    if (this.alt) {
      this.alt = false;
      this.opts.onShowItemLabels?.(false);
    }
  };

  private target_(): { id: EntityId | null; pos: Vec2 | null } {
    const ctx = this.ctx!;
    return {
      id: ctx.pick(this.cursor.x, this.cursor.y),
      pos: ctx.screenToWorld(this.cursor.x, this.cursor.y),
    };
  }

  private leftDown(): void {
    const ctx = this.ctx!;
    const { id, pos } = this.target_();
    const left = ctx.getSelectedSkills().left;
    if (this.shift) {
      this.useSkill(left, id, pos, true);
      this.leftHold = { kind: 'standStill' };
    } else if (id != null) {
      this.send({ type: 'interact', targetId: id });
      this.leftHold = this.opts.isHostile?.(id) ? { kind: 'attack', targetId: id } : { kind: 'none' };
    } else if (pos) {
      this.send({ type: 'moveTo', pos });
      this.leftHold = { kind: 'move' };
    }
    if (this.leftHold.kind !== 'none') this.leftTimer.start();
  }

  private repeatLeft(): void {
    const ctx = this.ctx!;
    const h = this.leftHold;
    if (h.kind === 'move') {
      const pos = ctx.screenToWorld(this.cursor.x, this.cursor.y);
      if (pos) this.send({ type: 'moveTo', pos });
    } else if (h.kind === 'attack') {
      if (this.opts.isHostile && !this.opts.isHostile(h.targetId)) {
        // Target died: D2 keeps the button "live" and walks toward the cursor.
        this.leftHold = { kind: 'move' };
        return;
      }
      this.send({ type: 'useSkill', skillId: ctx.getSelectedSkills().left, targetId: h.targetId });
    } else if (h.kind === 'standStill') {
      const { id, pos } = this.target_();
      this.useSkill(ctx.getSelectedSkills().left, id, pos, true);
    }
  }

  private castRight(): void {
    const ctx = this.ctx;
    if (!ctx || !this.rightHeld) return;
    const { id, pos } = this.target_();
    this.useSkill(ctx.getSelectedSkills().right, id, pos, this.shift);
  }

  private useSkill(skillId: string, id: EntityId | null, pos: Vec2 | null, standStill: boolean): void {
    if (!skillId) return;
    const cmd: UseSkillCmd = { type: 'useSkill', skillId };
    if (id != null) cmd.targetId = id;
    else if (pos) cmd.targetPos = pos;
    else return;
    if (standStill) cmd.standStill = true;
    this.send(cmd);
  }

  // ------------------------------------------------------------------ keyboard

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const ctx = this.ctx;
    if (!ctx || isTypingTarget(e.target)) return;
    const action = resolveKey(e.code, this.bindings);
    if (!action) return;
    if (shouldPreventDefault(action)) e.preventDefault();
    if (e.repeat && action.kind !== 'standStill') return;
    switch (action.kind) {
      case 'hotkey': {
        const skill = ctx.getSelectedSkills().hotkeys[action.slot];
        if (skill) this.send({ type: 'selectSkill', hand: 'right', skillId: skill });
        break;
      }
      case 'belt':
        this.send({ type: 'useBeltSlot', index: action.index });
        break;
      case 'panel':
        ctx.togglePanel(action.id);
        break;
      case 'toggleRun':
        this.running = !this.running;
        this.send({ type: 'setRunning', running: this.running });
        break;
      case 'swapWeapons':
        this.send({ type: 'swapWeapons' });
        break;
      case 'recall':
        this.send({ type: 'castRecall' });
        break;
      case 'showItems':
        if (!this.alt) {
          this.alt = true;
          this.opts.onShowItemLabels?.(true);
        }
        break;
      case 'closePanels':
        this.opts.closeAllPanels?.();
        break;
      case 'standStill':
        this.shift = true;
        break;
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    const action = resolveKey(e.code, this.bindings);
    if (!action) return;
    if (action.kind === 'showItems' && this.alt) {
      e.preventDefault();
      this.alt = false;
      this.opts.onShowItemLabels?.(false);
    } else if (action.kind === 'standStill') {
      this.shift = false;
    }
  };

  /** Current run/walk state as toggled by R (integration may seed it from the player). */
  get isRunning(): boolean {
    return this.running;
  }
  set isRunning(v: boolean) {
    this.running = v;
  }
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!t || typeof (t as HTMLElement).tagName !== 'string') return false;
  const el = t as HTMLElement;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}
