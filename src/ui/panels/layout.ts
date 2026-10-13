/** Pure panel layout rules (D2: character/stash/etc. left, inventory/skills right). */
import type { PanelId } from '../types';

export const RIGHT_PANELS: readonly PanelId[] = ['inventory', 'skills'];
export const CENTER_PANELS: readonly PanelId[] = ['options', 'menu', 'dialogue'];
/** Panels the HUD (not us) renders. */
export const FOREIGN_PANELS: readonly PanelId[] = ['map'];
/** Panels that pair with the inventory for item transfer. */
export const TRADE_PANELS: readonly PanelId[] = ['stash', 'vendor', 'cube'];
export const MAIN_TABS: readonly PanelId[] = ['inventory', 'character', 'skills', 'quests'];

export interface Arrangement {
  left?: PanelId;
  right?: PanelId;
  center?: PanelId;
}

/** The most recently opened panel of each side wins (openPanels is in open order). */
export function arrangePanels(open: readonly PanelId[]): Arrangement {
  const out: Arrangement = {};
  for (const id of open) {
    if (FOREIGN_PANELS.includes(id)) continue;
    if (CENTER_PANELS.includes(id)) out.center = id;
    else if (RIGHT_PANELS.includes(id)) out.right = id;
    else out.left = id;
  }
  return out;
}

/** Phone landscape / narrow screens use full-screen sheets with tabs. */
export function isCompact(w: number, h: number): boolean {
  return h < 560 || w < 880;
}

export function compactTabs(open: readonly PanelId[]): PanelId[] {
  const extra = open.filter((id) => !FOREIGN_PANELS.includes(id) && !MAIN_TABS.includes(id));
  return [...MAIN_TABS, ...extra.filter((id, i) => extra.indexOf(id) === i)];
}

/** Active sheet tab: the user's pick if still open, else the most recently opened panel. */
export function activeTab(open: readonly PanelId[], picked: PanelId | null): PanelId | null {
  const mine = open.filter((id) => !FOREIGN_PANELS.includes(id));
  if (picked && mine.includes(picked)) return picked;
  // A shop/stash/workshop shows the bag next to it, so prefer it over the inventory tab.
  const last = mine[mine.length - 1] ?? null;
  const trade = mine.filter((id) => TRADE_PANELS.includes(id));
  if (last === 'inventory' && trade.length) return trade[trade.length - 1]!;
  return last;
}

/** Top-most closable panel for Esc. */
export function topPanel(open: readonly PanelId[]): PanelId | null {
  const mine = open.filter((id) => !FOREIGN_PANELS.includes(id));
  return mine[mine.length - 1] ?? null;
}
