/**
 * Pure helpers that derive what a touch button shows from the world view and the content DB:
 * skill cooldown / mana availability, display label, and belt stim lookup.
 */
import type { DamageType } from '../../core/types';
import type { PlayerEntity } from '../../core/sim/entities';
import type { Belt, ItemInstance } from '../../core/items/types';
import type { ItemBaseDef, SkillDef } from '../../data/schema';
import { evalLevel } from '../../data/levelScaled';
import { getSkillLevel } from '../../core/skills/runtime';

export interface SkillButtonState {
  /** 0 = ready, 1 = just used. */
  cooldownFrac: number;
  noMana: boolean;
  /** Short glyph text (2 letters) used until real icons exist. */
  glyph: string;
  element?: DamageType;
}

export function skillGlyph(name: string): string {
  const words = name.split(/[\s-]+/).filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  const w = words[0] ?? '?';
  return (w[0]!.toUpperCase() + (w[1] ?? '')).slice(0, 2);
}

export function skillButtonState(
  player: Readonly<PlayerEntity> | null,
  skillId: string,
  def: SkillDef | undefined,
  displayName: string,
): SkillButtonState {
  const glyph = skillGlyph(displayName);
  if (!player || !def) return { cooldownFrac: 0, noMana: false, glyph, element: def?.element };
  let lvl = 1;
  try {
    lvl = getSkillLevel(player as PlayerEntity, skillId);
  } catch {
    /* keep 1 */
  }
  const cost = evalLevel(def.manaCost, lvl);
  const total = def.cooldownSec !== undefined ? evalLevel(def.cooldownSec, lvl) : 0;
  const left = player.cooldowns[skillId] ?? 0;
  const cooldownFrac = total > 0 && left > 0 ? Math.min(1, left / total) : left > 0 ? 1 : 0;
  return { cooldownFrac, noMana: player.mana < cost, glyph, element: def.element };
}

export type StimKind = 'life' | 'mana';

function matches(base: ItemBaseDef | undefined, kind: StimKind, allowRejuv: boolean): boolean {
  const k = base?.use?.kind;
  if (kind === 'life') return k === 'heal' || (allowRejuv && k === 'rejuv');
  return k === 'mana' || (allowRejuv && k === 'rejuv');
}

/**
 * Belt column (0-3, the `useBeltSlot` index used by keys 1-4) holding the first matching stim.
 * Prefers the pure kind, falls back to rejuvenation stims. Slots are row-major, bottom row first.
 */
export function findStimColumn(
  belt: Belt | undefined,
  kind: StimKind,
  baseOf: (item: ItemInstance) => ItemBaseDef | undefined,
): number | null {
  if (!belt) return null;
  for (const allowRejuv of [false, true]) {
    for (let i = 0; i < belt.slots.length; i++) {
      const it = belt.slots[i];
      if (it && matches(baseOf(it), kind, allowRejuv)) return i % belt.cols;
    }
  }
  return null;
}

export function countStims(
  belt: Belt | undefined,
  kind: StimKind,
  baseOf: (item: ItemInstance) => ItemBaseDef | undefined,
): number {
  if (!belt) return 0;
  let n = 0;
  for (const it of belt.slots) if (it && matches(baseOf(it), kind, true)) n += it.quantity ?? 1;
  return n;
}
