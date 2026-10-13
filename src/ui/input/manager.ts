/**
 * Input manager: owns the mouse/keyboard and gamepad devices for one target element.
 * Touch is handled by the <TouchControls> Preact overlay (src/ui/touch), which needs DOM UI.
 *
 * Coordinates passed to `ctx.pick` / `ctx.screenToWorld` / `ctx.isOverUi` are CSS pixels
 * relative to `target`'s top-left corner.
 */
import type { EntityId, Vec2 } from '../../core/types';
import type { WorldView } from '../../core/sim/world';
import type { InputContext, InputDevice } from './types';
import type { KeyBindings } from './keybindings';
import { MouseKeyboardDevice } from './mouseKeyboard';
import { GamepadDevice } from './gamepad';
import { isHostile } from './autoTarget';

export interface InputManagerOptions {
  /** Enable devices (default: both true). */
  mouseKeyboard?: boolean;
  gamepad?: boolean;
  /** Read-only world access for hold-to-attack and gamepad auto-target. */
  getView?: () => WorldView | null;
  /** Override auto-target selection (nearest hostile within `range` tiles, preferring `dir`). */
  findAutoTarget?: (range: number, dir: Vec2) => EntityId | null;
  /** Alt held / released (D2 "show items on ground"). */
  onShowItemLabels?: (show: boolean) => void;
  /** Space: close every open panel (UiApi.closeAllPanels). */
  closeAllPanels?: () => void;
  bindings?: KeyBindings;
  initialRunning?: boolean;
  /** Test hook / alternative gamepad source. */
  getGamepads?: () => readonly (Gamepad | null)[];
}

export interface InputManager {
  readonly devices: readonly InputDevice[];
  readonly mouseKeyboard: MouseKeyboardDevice | null;
  readonly gamepad: GamepadDevice | null;
  /** Call every render frame with seconds elapsed. */
  update(dt: number): void;
  detach(): void;
}

export function createInputManager(
  target: HTMLElement,
  ctx: InputContext,
  opts: InputManagerOptions = {},
): InputManager {
  const getView = opts.getView;
  const hostile = (id: EntityId): boolean => {
    const e = getView?.()?.get(id);
    return !!e && isHostile(e);
  };
  const mk =
    opts.mouseKeyboard === false
      ? null
      : new MouseKeyboardDevice({
          bindings: opts.bindings,
          initialRunning: opts.initialRunning,
          isHostile: getView ? hostile : undefined,
          onShowItemLabels: opts.onShowItemLabels,
          closeAllPanels: opts.closeAllPanels,
        });
  const gp =
    opts.gamepad === false
      ? null
      : new GamepadDevice({
          getView,
          findAutoTarget: opts.findAutoTarget,
          getGamepads: opts.getGamepads,
          initialRunning: opts.initialRunning,
          getScreenCenter: () => ({ x: target.clientWidth / 2, y: target.clientHeight / 2 }),
        });
  const devices: InputDevice[] = [];
  if (mk) devices.push(mk);
  if (gp) devices.push(gp);
  for (const d of devices) d.attach(target, ctx);
  let attached = true;
  return {
    devices,
    mouseKeyboard: mk,
    gamepad: gp,
    update(dt: number) {
      if (!attached) return;
      for (const d of devices) d.update(dt);
    },
    detach() {
      if (!attached) return;
      attached = false;
      for (const d of devices) d.detach();
    },
  };
}

/**
 * Best-effort touch-device detection (iPadOS reports "MacIntel" but has maxTouchPoints > 0).
 * Use it to seed `UiStore.isTouch`; also flip isTouch on the first real touch event.
 */
export function detectTouch(
  win: Pick<Window, 'matchMedia' | 'navigator'> | undefined = globalThis.window,
): boolean {
  if (!win) return false;
  const nav = win.navigator as Navigator | undefined;
  if (nav && typeof nav.maxTouchPoints === 'number' && nav.maxTouchPoints > 0) return true;
  try {
    if (win.matchMedia?.('(pointer: coarse)').matches) return true;
  } catch {
    /* ignore */
  }
  return 'ontouchstart' in win;
}
