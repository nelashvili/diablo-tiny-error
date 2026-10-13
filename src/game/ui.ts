/**
 * Builds the UiStore / UiApi bridge between the Preact overlay and the simulation.
 */
import { signal } from '@preact/signals';
import type { Command } from '@/core/sim/commands';
import type { GameEvent } from '@/core/sim/events';
import type { WorldView } from '@/core/sim/world';
import type { Settings } from '@/core/save/types';
import type { Vec2 } from '@/core/types';
import type { PanelId, UiApi, UiStore } from '@/ui/types';

export interface UiBridge {
  api: UiApi;
  /** Push drained frame events to UI listeners and bump the frame signal. */
  publish(events: readonly GameEvent[]): void;
}

export function createUiBridge(opts: {
  dispatch: (cmd: Command) => void;
  settings: Settings;
  isTouch: boolean;
  worldToScreen: (p: Vec2, h?: number) => { x: number; y: number } | null;
  onSettingsChanged?: (s: Settings) => void;
}): UiBridge {
  const listeners = new Set<(e: readonly GameEvent[]) => void>();
  const store: UiStore = {
    frame: signal(0),
    view: signal<WorldView | null>(null),
    openPanels: signal<PanelId[]>([]),
    settings: signal<Settings>(opts.settings),
    hoveredEntity: signal(null),
    interactNpc: signal(null),
    isTouch: signal(opts.isTouch),
    worldToScreen: opts.worldToScreen,
  };

  const api: UiApi = {
    store,
    dispatch: opts.dispatch,
    onEvents(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    togglePanel(id) {
      const open = store.openPanels.value;
      store.openPanels.value = open.includes(id) ? open.filter((p) => p !== id) : [...open, id];
    },
    closeAllPanels() {
      store.openPanels.value = [];
    },
    updateSettings(patch) {
      store.settings.value = { ...store.settings.value, ...patch };
      opts.onSettingsChanged?.(store.settings.value);
    },
  };

  return {
    api,
    publish(events) {
      if (events.length) listeners.forEach((l) => l(events));
      store.frame.value++;
    },
  };
}

/** Open a panel if not already open. */
export function openPanel(api: UiApi, id: PanelId): void {
  if (!api.store.openPanels.value.includes(id)) api.togglePanel(id);
}
