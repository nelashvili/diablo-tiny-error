/**
 * TouchController: framework-free gesture state machine behind <TouchControls>.
 * Handles any number of simultaneous pointers (joystick thumb + attack thumb), turns them into
 * Commands, and exposes signals the Preact view renders (stick, aim indicator, labels, picker).
 *
 * Coordinates are CSS px relative to the controls root, which must cover the same rect as the
 * InputContext's picking target (the game canvas).
 */
import { signal } from '@preact/signals';
import type { Command } from '../../core/sim/commands';
import type { EntityId, Vec2 } from '../../core/types';
import type { WorldView } from '../../core/sim/world';
import type { GroundItemEntity } from '../../core/sim/entities';
import type { InputContext } from '../input/types';
import type { UiApi } from '../types';
import { DB } from '../../data/db';
import { t } from '../../data/names';
import {
  applyRadialDeadzone,
  DirectionThrottle,
  followBase,
  isLongPress,
  joystickVector,
  RepeatTimer,
  screenDirToSim,
} from '../input/math';
import { getLocalPlayer, resolveAutoAim, skillRangeFor } from '../input/autoTarget';
import { findStimColumn, type StimKind } from './skillState';
import { inJoystickZone } from './layout';

export type ButtonId = 'primary' | number;

export interface StickVisual {
  base: Vec2;
  knob: Vec2;
}

export interface AimVisual {
  center: Vec2;
  rx: number;
  ry: number;
  reticle: Vec2;
}

export interface LabelVisual {
  text: string;
  quality: string;
  x: number;
  y: number;
}

export interface TouchControllerOptions {
  findAutoTarget?: (range: number, dir: Vec2) => EntityId | null;
  haptics?: boolean;
  /** Clock in seconds (tests). */
  now?: () => number;
}

interface PointerLike {
  pointerId: number;
  clientX: number;
  clientY: number;
}

type Gesture =
  | { kind: 'stick'; base: Vec2; finger: Vec2 }
  | {
      kind: 'world';
      start: Vec2;
      pos: Vec2;
      t0: number;
      moved: number;
      /** Ground item waiting for tap (pickup) vs long-press (label). */
      itemId: EntityId | null;
      holdMove: boolean;
      /** Joystick mode: a quick tap on empty ground walks there on release. */
      tapMove: boolean;
      /** Entity to interact with on tap / hold (joystick zone: decided on release, not on down). */
      targetId: EntityId | null;
      /** Started in the joystick zone: dragging past the tap slop turns this into the stick. */
      stickOnDrag: boolean;
      done: boolean;
    }
  | {
      kind: 'button';
      id: ButtonId;
      center: Vec2;
      pos: Vec2;
      t0: number;
      moved: number;
      aiming: boolean;
      done: boolean;
    };

const AIM_THRESHOLD = 22;
const AIM_MAX_DRAG = 120;
const TAP_SLOP = 12;
const HOLD_REPEAT = 0.22;
const MOVE_REPEAT = 0.15;
const LABEL_SEC = 2.5;
/** Holding still on a monster in the joystick zone attacks it without waiting for release. */
const ZONE_HOLD_SEC = 0.25;

export class TouchController {
  readonly stick = signal<StickVisual | null>(null);
  readonly aim = signal<AimVisual | null>(null);
  readonly label = signal<LabelVisual | null>(null);
  readonly picker = signal<{ slot: number } | null>(null);
  readonly pressed = signal<ReadonlySet<string>>(new Set());
  readonly beltOpen = signal(false);

  private readonly gestures = new Map<number, Gesture>();
  private readonly throttle = new DirectionThrottle();
  private readonly primaryRepeat = new RepeatTimer(HOLD_REPEAT);
  private readonly moveRepeat = new RepeatTimer(MOVE_REPEAT);
  private primaryAimDir: Vec2 | null = null;
  private labelLeft = 0;
  private stickRadius = 64;
  private size = { w: 1, h: 1 };

  constructor(
    private readonly api: UiApi,
    private readonly ctx: InputContext,
    private readonly opts: TouchControllerOptions = {},
  ) {}

  private now(): number {
    return this.opts.now ? this.opts.now() : performance.now() / 1000;
  }

  setViewport(w: number, h: number, stickRadius: number): void {
    this.size = { w: Math.max(1, w), h: Math.max(1, h) };
    this.stickRadius = stickRadius;
  }

  get view(): WorldView | null {
    return this.api.store.view.value;
  }

  get movementMode(): 'joystick' | 'tapToMove' {
    const m = this.api.store.settings.value.movement;
    return m === 'tapToMove' ? 'tapToMove' : 'joystick';
  }

  private send(cmd: Command): void {
    this.ctx.dispatch(cmd);
  }

  buzz(ms: number): void {
    if (this.opts.haptics === false) return;
    try {
      (navigator as Navigator & { vibrate?: (p: number) => boolean }).vibrate?.(ms);
    } catch {
      /* unsupported (iOS) */
    }
  }

  private setPressed(key: string, on: boolean): void {
    const s = new Set(this.pressed.value);
    if (on) s.add(key);
    else s.delete(key);
    this.pressed.value = s;
  }

  // ---------------------------------------------------------------- world layer

  worldDown(e: PointerLike, p: Vec2): boolean {
    if (this.ctx.isOverUi(p.x, p.y)) return false;
    this.beltOpen.value = false;
    const hasStick = [...this.gestures.values()].some((g) => g.kind === 'stick');
    const id = this.ctx.pick(p.x, p.y);
    const ent = id != null ? this.view?.get(id) : undefined;
    const zone = this.movementMode === 'joystick' && !hasStick && inJoystickZone(p, this.size.w, this.size.h);
    if (zone && id == null) {
      this.startStick(e.pointerId, p, p);
      return true;
    }
    const g: Gesture = {
      kind: 'world',
      start: p,
      pos: p,
      t0: this.now(),
      moved: 0,
      itemId: null,
      holdMove: false,
      tapMove: false,
      targetId: null,
      stickOnDrag: zone,
      done: false,
    };
    if (id != null && ent?.kind === 'groundItem') {
      g.itemId = id; // decide on release (tap = pick up) or long-press (= show label)
    } else if (id != null && zone) {
      g.targetId = id; // tap / hold = interact, drag = joystick
    } else if (id != null) {
      this.send({ type: 'interact', targetId: id });
      this.buzz(8);
      g.done = true;
    } else if (this.movementMode === 'tapToMove') {
      const pos = this.ctx.screenToWorld(p.x, p.y);
      if (pos) this.send({ type: 'moveTo', pos });
      g.holdMove = true;
      this.moveRepeat.start();
    } else {
      g.tapMove = true;
    }
    this.gestures.set(e.pointerId, g);
    return true;
  }

  pointerMove(e: PointerLike, p: Vec2): void {
    const g = this.gestures.get(e.pointerId);
    if (!g) return;
    if (g.kind === 'stick') {
      g.base = followBase(g.base, p, this.stickRadius);
      g.finger = p;
      const v = joystickVector(p.x - g.base.x, p.y - g.base.y, this.stickRadius);
      this.stick.value = { base: g.base, knob: { x: g.base.x + v.knobX, y: g.base.y + v.knobY } };
      this.updateStick(0);
    } else if (g.kind === 'world') {
      g.pos = p;
      g.moved = Math.max(g.moved, Math.hypot(p.x - g.start.x, p.y - g.start.y));
      if (g.stickOnDrag && !g.done && g.moved > TAP_SLOP && !this.stickActive) {
        this.startStick(e.pointerId, g.start, p);
        this.pointerMove(e, p);
      }
    } else {
      g.pos = p;
      const d = Math.hypot(p.x - g.center.x, p.y - g.center.y);
      g.moved = Math.max(g.moved, d);
      if (g.done) return;
      if (!g.aiming && d > AIM_THRESHOLD) g.aiming = true;
      if (g.aiming) this.updateAim(g);
    }
  }

  pointerUp(e: PointerLike, cancelled = false): void {
    const g = this.gestures.get(e.pointerId);
    if (!g) return;
    this.gestures.delete(e.pointerId);
    if (g.kind === 'stick') {
      this.stick.value = null;
      this.updateStick(0);
    } else if (g.kind === 'world') {
      if (g.holdMove) this.moveRepeat.stop();
      const tapId = g.itemId ?? g.targetId;
      if (!cancelled && !g.done && tapId != null && g.moved <= TAP_SLOP) {
        this.send({ type: 'interact', targetId: tapId });
        this.buzz(8);
      } else if (!cancelled && g.tapMove && g.moved <= TAP_SLOP) {
        const pos = this.ctx.screenToWorld(g.pos.x, g.pos.y);
        if (pos) this.send({ type: 'moveTo', pos });
      }
    } else {
      this.buttonRelease(g, cancelled);
    }
  }

  // ---------------------------------------------------------------- joystick

  private startStick(pointerId: number, base: Vec2, finger: Vec2): void {
    this.gestures.set(pointerId, { kind: 'stick', base, finger });
    this.stick.value = { base, knob: base };
    this.buzz(5);
  }

  private updateStick(dt: number): void {
    let dir: Vec2 = { x: 0, y: 0 };
    for (const g of this.gestures.values()) {
      if (g.kind !== 'stick') continue;
      const v = joystickVector(g.finger.x - g.base.x, g.finger.y - g.base.y, this.stickRadius);
      const dz = applyRadialDeadzone(v.x, v.y, 0.18);
      if (dz.magnitude > 0) dir = screenDirToSim(this.ctx, this.playerScreen(), dz.dir.x, dz.dir.y);
    }
    const out = this.throttle.next(dir, dt);
    if (out === 'stop') this.send({ type: 'stop' });
    else if (out) this.send({ type: 'moveDir', dir: out });
  }

  /** Current joystick-driven sim direction (zero when idle). */
  get stickActive(): boolean {
    return [...this.gestures.values()].some((g) => g.kind === 'stick');
  }

  private playerScreen(): Vec2 {
    const p = getLocalPlayer(this.view);
    const s = p ? this.api.store.worldToScreen(p.pos) : null;
    return s ?? { x: this.size.w / 2, y: this.size.h / 2 };
  }

  // ---------------------------------------------------------------- buttons

  skillOf(id: ButtonId): string | null {
    const sel = this.ctx.getSelectedSkills();
    if (id === 'primary') return sel.left || null;
    return sel.hotkeys[id] ?? null;
  }

  buttonDown(e: PointerLike, id: ButtonId, center: Vec2, p: Vec2): void {
    this.beltOpen.value = false;
    const g: Gesture = {
      kind: 'button',
      id,
      center,
      pos: p,
      t0: this.now(),
      moved: 0,
      aiming: false,
      done: false,
    };
    this.gestures.set(e.pointerId, g);
    this.setPressed(String(id), true);
    this.buzz(8);
    if (id === 'primary') {
      this.primaryAimDir = null;
      this.fire('primary');
      this.primaryRepeat.start();
    }
  }

  private buttonRelease(g: Extract<Gesture, { kind: 'button' }>, cancelled: boolean): void {
    this.setPressed(String(g.id), false);
    if (g.id === 'primary') {
      if (![...this.gestures.values()].some((o) => o.kind === 'button' && o.id === 'primary'))
        this.primaryRepeat.stop();
      this.primaryAimDir = null;
      return;
    }
    this.aim.value = null;
    if (cancelled || g.done) return;
    const skill = this.skillOf(g.id);
    if (g.aiming) {
      const back = Math.hypot(g.pos.x - g.center.x, g.pos.y - g.center.y) <= AIM_THRESHOLD;
      if (back || !skill) return; // dragged back onto the button = cancel
      const target = this.aimTarget(g, skill);
      if (target) this.send({ type: 'useSkill', skillId: skill, targetPos: target });
      return;
    }
    if (!skill) {
      this.picker.value = { slot: g.id };
      return;
    }
    this.fire(g.id);
  }

  /** Use the button's skill with soft auto-aim. */
  fire(id: ButtonId): void {
    const skillId = this.skillOf(id);
    if (!skillId) return;
    const prefer = id === 'primary' ? (this.primaryAimDir ?? this.currentStickDir()) : this.currentStickDir();
    const aim = resolveAutoAim(this.view, skillId, prefer ?? undefined, this.opts.findAutoTarget);
    if (aim.targetId == null && aim.targetPos == null) return;
    this.send({ type: 'useSkill', skillId, ...aim });
  }

  private currentStickDir(): Vec2 | null {
    for (const g of this.gestures.values()) {
      if (g.kind !== 'stick') continue;
      const v = joystickVector(g.finger.x - g.base.x, g.finger.y - g.base.y, this.stickRadius);
      const dz = applyRadialDeadzone(v.x, v.y, 0.18);
      if (dz.magnitude > 0) return screenDirToSim(this.ctx, this.playerScreen(), dz.dir.x, dz.dir.y);
    }
    return null;
  }

  private aimTarget(g: Extract<Gesture, { kind: 'button' }>, skill: string): Vec2 | null {
    const p = getLocalPlayer(this.view);
    if (!p) return null;
    const dx = g.pos.x - g.center.x;
    const dy = g.pos.y - g.center.y;
    const d = Math.hypot(dx, dy);
    const dir = screenDirToSim(this.ctx, this.playerScreen(), dx, dy);
    const range = Math.max(skillRangeFor(this.view, skill), 2);
    const frac = Math.min(1, Math.max(0.2, (d - AIM_THRESHOLD) / (AIM_MAX_DRAG - AIM_THRESHOLD)));
    return { x: p.pos.x + dir.x * range * frac, y: p.pos.y + dir.y * range * frac };
  }

  private updateAim(g: Extract<Gesture, { kind: 'button' }>): void {
    if (g.id === 'primary') {
      const dx = g.pos.x - g.center.x;
      const dy = g.pos.y - g.center.y;
      this.primaryAimDir = screenDirToSim(this.ctx, this.playerScreen(), dx, dy);
      return;
    }
    const skill = this.skillOf(g.id);
    const p = getLocalPlayer(this.view);
    if (!skill || !p) return;
    const target = this.aimTarget(g, skill);
    const center = this.playerScreen();
    const range = Math.max(skillRangeFor(this.view, skill), 2);
    const axis = (sx: number, sy: number): number => {
      const dir = screenDirToSim(this.ctx, center, sx, sy);
      const s = this.api.store.worldToScreen({ x: p.pos.x + dir.x * range, y: p.pos.y + dir.y * range });
      return s ? Math.hypot(s.x - center.x, s.y - center.y) : range * 32;
    };
    const reticle = target ? (this.api.store.worldToScreen(target) ?? center) : center;
    this.aim.value = { center, rx: axis(1, 0), ry: axis(0, 1), reticle };
  }

  // ---------------------------------------------------------------- picker / stims / belt

  assign(slot: number, skillId: string | null): void {
    this.send({ type: 'bindHotkey', slot, skillId });
    this.picker.value = null;
    this.buzz(10);
  }

  closePicker(): void {
    this.picker.value = null;
  }

  useStim(kind: StimKind): void {
    const p = getLocalPlayer(this.view);
    const col = findStimColumn(p?.belt, kind, (it) => DB.items.get(it.base));
    this.buzz(8);
    if (col != null) this.send({ type: 'useBeltSlot', index: col });
  }

  useBelt(col: number): void {
    this.send({ type: 'useBeltSlot', index: col });
    this.buzz(8);
  }

  toggleBelt(): void {
    this.beltOpen.value = !this.beltOpen.value;
    this.buzz(5);
  }

  // ---------------------------------------------------------------- frame

  tick(dt: number): void {
    this.updateStick(dt);
    if (this.primaryRepeat.tick(dt)) this.fire('primary');
    if (this.moveRepeat.tick(dt)) {
      for (const g of this.gestures.values()) {
        if (g.kind === 'world' && g.holdMove) {
          const pos = this.ctx.screenToWorld(g.pos.x, g.pos.y);
          if (pos) this.send({ type: 'moveTo', pos });
        }
      }
    }
    const now = this.now();
    for (const g of this.gestures.values()) {
      if (g.kind === 'stick' || g.done) continue;
      if (g.kind === 'world' && g.itemId != null && isLongPress(now - g.t0, g.moved, 0.45, TAP_SLOP)) {
        g.done = true;
        this.showItemLabel(g.itemId);
      } else if (
        g.kind === 'world' &&
        g.targetId != null &&
        isLongPress(now - g.t0, g.moved, ZONE_HOLD_SEC, TAP_SLOP)
      ) {
        g.done = true;
        this.send({ type: 'interact', targetId: g.targetId });
        this.buzz(8);
      } else if (g.kind === 'button' && g.id !== 'primary' && !g.aiming) {
        if (isLongPress(now - g.t0, g.moved, 0.5, TAP_SLOP)) {
          g.done = true;
          this.picker.value = { slot: g.id };
          this.buzz(15);
        }
      }
    }
    if (this.label.value) {
      this.labelLeft -= dt;
      if (this.labelLeft <= 0) this.label.value = null;
    }
  }

  showItemLabel(id: EntityId): void {
    const e = this.view?.get(id) as Readonly<GroundItemEntity> | undefined;
    if (!e || e.kind !== 'groundItem') return;
    const s = this.api.store.worldToScreen(e.pos, 0.6);
    if (!s) return;
    const base = DB.items.get(e.item.base);
    const text =
      e.creditz != null
        ? t('input.creditzPile', { n: e.creditz })
        : base
          ? t(base.name)
          : t('input.unknownItem');
    this.label.value = { text, quality: e.creditz != null ? 'unique' : e.item.quality, x: s.x, y: s.y };
    this.labelLeft = LABEL_SEC;
    this.buzz(12);
  }

  /** Release everything (e.g. app backgrounded): stops movement and repeats. */
  reset(): void {
    for (const [id] of [...this.gestures]) this.pointerUp({ pointerId: id, clientX: 0, clientY: 0 }, true);
    this.primaryRepeat.stop();
    this.moveRepeat.stop();
    this.stick.value = null;
    this.aim.value = null;
    this.pressed.value = new Set();
  }
}
