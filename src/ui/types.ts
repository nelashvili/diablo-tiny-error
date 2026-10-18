/**
 * UI bridge contract. The Preact overlay reads game state through a UiStore (signals) and
 * sends Commands through `dispatch`. It never touches SimWorld directly.
 *
 * CONTRACT FILE — frozen after Wave 0. Additive changes only, coordinated by the lead.
 */
import type { Signal } from '@preact/signals';
import type { Command } from '../core/sim/commands';
import type { GameEvent } from '../core/sim/events';
import type { WorldView } from '../core/sim/world';
import type { Settings } from '../core/save/types';
import type { EntityId, Vec2 } from '../core/types';

export type PanelId =
  | 'inventory'
  | 'character'
  | 'skills'
  | 'quests'
  | 'map'
  | 'stash'
  | 'vendor'
  | 'waypoint'
  | 'merc'
  | 'cube'
  | 'options'
  | 'dialogue'
  | 'menu';

export interface StoryHud {
  /** Name key of the tracked quest and text key of its current step. */
  objective: { questKey: string; stepKey: string } | null;
  /** NPCs waiting to thank or reward the hero ("?" over their heads). */
  turnIn: EntityId[];
}

export interface UiStore {
  /** Bumped every frame the sim ticked; components derive from `view` when it changes. */
  frame: Signal<number>;
  view: Signal<WorldView | null>;
  openPanels: Signal<PanelId[]>;
  settings: Signal<Settings>;
  hoveredEntity: Signal<EntityId | null>;
  /** Which NPC/vendor the open panel refers to. */
  interactNpc: Signal<EntityId | null>;
  isTouch: Signal<boolean>;
  /** Story guidance: the current objective and NPCs with something to say (absent in mocks). */
  story?: Signal<StoryHud>;
  /** Screen projection supplied by the renderer for overlays. */
  worldToScreen: (p: Vec2, heightTiles?: number) => { x: number; y: number } | null;
}

export interface UiApi {
  store: UiStore;
  dispatch(cmd: Command): void;
  /** Frame events for transient UI (damage numbers, toasts). */
  onEvents(cb: (events: readonly GameEvent[]) => void): () => void;
  togglePanel(id: PanelId): void;
  closeAllPanels(): void;
  updateSettings(patch: Partial<Settings>): void;
}
