/**
 * Input contract: devices (mouse/keyboard, gamepad, touch) translate raw input into Commands
 * and UI intents. Input needs the renderer for picking (screen -> entity / ground).
 *
 * CONTRACT FILE — frozen after Wave 0. Additive changes only, coordinated by the lead.
 */
import type { Command } from '../../core/sim/commands';
import type { EntityId, Vec2 } from '../../core/types';
import type { PanelId } from '../types';

export interface InputContext {
  dispatch(cmd: Command): void;
  pick(px: number, py: number): EntityId | null;
  screenToWorld(px: number, py: number): Vec2 | null;
  /** Local player's selected skills (to decide what left/right click does). */
  getSelectedSkills(): { left: string; right: string; hotkeys: (string | null)[] };
  togglePanel(id: PanelId): void;
  /** True if a UI panel is capturing the pointer at this position. */
  isOverUi(px: number, py: number): boolean;
}

export interface InputDevice {
  attach(target: HTMLElement, ctx: InputContext): void;
  /** Called each frame (gamepad polling, held-button repeat). */
  update(dt: number): void;
  detach(): void;
}
