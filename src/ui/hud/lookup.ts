/**
 * Display lookups with graceful fallbacks: data tables may be empty early in development
 * (skills/monsters/items arrive in later waves), so every lookup degrades to a readable name.
 */
import { DB } from '../../data/db';
import { hasName, t } from '../../data/names';
import { evalLevel } from '../../data/levelScaled';
import type { SkillDef, SkillKind } from '../../data/schema';
import type { DamageType } from '../../core/types';
import type { Entity, PlayerEntity } from '../../core/sim/entities';
import type { ItemInstance } from '../../core/items/types';
import { describeItem } from '../../core/items/describe';
import { prettifyId } from './format';

/** Glyph families the HUD can draw for skills. */
export type SkillGlyph =
  | 'saber'
  | 'flame'
  | 'snow'
  | 'bolt'
  | 'toxin'
  | 'star'
  | 'shield'
  | 'droyd'
  | 'leap'
  | 'roar'
  | 'gem'
  | 'eye'
  | 'blaster'
  | 'spear';

export interface SkillInfo {
  id: string;
  name: string;
  element: DamageType;
  glyph: SkillGlyph;
  def?: SkillDef;
}

const ELEMENT_HINTS: [RegExp, DamageType][] = [
  [/plasma|fire|burn|heat|inferno|starfall|incendiary|meteor/i, 'plasma'],
  [/cryo|ice|frost|frozen|glacial|blizzard|freez|shiver|chill/i, 'cryo'],
  [/storm|lightning|spark|static|arc|chain|thunder|charged|nova/i, 'storm'],
  [/toxin|poison|venom/i, 'toxin'],
  [/forse|blink|pull|shield|decoy/i, 'magic'],
];

function guessElement(id: string): DamageType {
  for (const [re, el] of ELEMENT_HINTS) if (re.test(id)) return el;
  return 'physical';
}

function glyphFor(kind: SkillKind | undefined, element: DamageType, id: string): SkillGlyph {
  // Shouts (Rally, Battle Orders...) are buffs, but read as roars.
  if (kind === 'warcry' || /roar|shout|rally|orders|provoke|command|banner/i.test(id)) return 'roar';
  if (kind === 'buff' || /armor|shield|iron|resil/i.test(id)) return 'shield';
  if (kind === 'summon' || /droyd|turret|decoy/i.test(id)) return 'droyd';
  if (kind === 'movement' || /leap|blink|step/i.test(id)) return 'leap';
  if (kind === 'passive' || /mastery|precision|dodge|avoid|evade|endurance/i.test(id)) return 'gem';
  if (kind === 'utility' || /scan|salvage|scavenge/i.test(id)) return 'eye';
  if (/jab|thrust|javelin|spear|fend|impale|throw/i.test(id)) return 'spear';
  if (/shot|round|fire$|blastur|strafe/i.test(id)) return 'blaster';
  switch (element) {
    case 'plasma':
      return 'flame';
    case 'cryo':
      return 'snow';
    case 'storm':
      return 'bolt';
    case 'toxin':
      return 'toxin';
    case 'magic':
      return 'star';
    default:
      return 'saber';
  }
}

function nameOf(key: string | undefined, fallbackId: string): string {
  if (key && hasName(key)) return t(key);
  const guess = `skill.${fallbackId}`;
  if (hasName(guess)) return t(guess);
  if (fallbackId === 'attack') return t('hud.skill.attack');
  return prettifyId(fallbackId);
}

export function skillInfo(id: string): SkillInfo {
  const def = DB.skills.get(id);
  const element = def?.element ?? guessElement(id);
  return { id, name: nameOf(def?.name, id), element, glyph: glyphFor(def?.kind, element, id), def };
}

/** Mana cost at the player's hard level (min 1). Unknown skills cost 0. */
export function skillManaCost(id: string, level: number): number {
  const def = DB.skills.get(id);
  return def ? evalLevel(def.manaCost, Math.max(1, level)) : 0;
}

/** Nominal cooldown at level, if the def declares one. */
export function skillCooldown(id: string, level: number): number {
  const def = DB.skills.get(id);
  return def?.cooldownSec !== undefined ? evalLevel(def.cooldownSec, Math.max(1, level)) : 0;
}

export function canLeftClick(id: string): boolean {
  const def = DB.skills.get(id);
  return def ? def.leftClickable : true;
}

/** Skills the picker offers: learned skills plus whatever is currently selected/bound. */
export function pickableSkills(p: PlayerEntity, hand: 'left' | 'right' | 'hotkey'): string[] {
  const ids = new Set<string>();
  ids.add(p.leftSkill);
  ids.add(p.rightSkill);
  for (const [id, pts] of Object.entries(p.skills)) if (pts > 0) ids.add(id);
  for (const h of p.hotkeys) if (h) ids.add(h);
  const list = [...ids].filter((id) => {
    const def = DB.skills.get(id);
    if (def?.kind === 'passive') return false;
    return hand === 'left' ? canLeftClick(id) : true;
  });
  // Sort by tree then tier so the list matches the skill tree layout.
  return list.sort((a, b) => {
    const da = DB.skills.get(a);
    const db = DB.skills.get(b);
    const ka = da ? `${da.tree}:${da.ui.row}:${da.ui.col}` : `~${a}`;
    const kb = db ? `${db.tree}:${db.ui.row}:${db.ui.col}` : `~${b}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

/** Resource name for the player's class ("Forse" or "Energy"). */
export function resourceName(p: PlayerEntity | undefined): string {
  const def = p ? DB.classes.get(p.classId) : undefined;
  return t(def?.resourceName ?? 'resource.energy');
}

/** Display name for any actor/object entity. */
export function entityName(e: Readonly<Entity>): string {
  switch (e.kind) {
    case 'player':
      return e.name;
    case 'monster': {
      if (e.nameKey) return t(e.nameKey);
      const def = DB.monsters.get(e.defId);
      return def ? t(def.name) : prettifyId(e.defId);
    }
    case 'npc': {
      const def = DB.npcs.get(e.defId);
      return def ? t(def.name) : prettifyId(e.defId);
    }
    case 'merc': {
      const def = DB.mercs.get(e.defId);
      return def ? t(def.name) : prettifyId(e.defId);
    }
    case 'groundItem':
      return itemName(e.item);
    case 'object':
      return prettifyId(e.defId);
    default:
      return '';
  }
}

export function itemBaseName(baseId: string): string {
  const def = DB.items.get(baseId);
  return def ? t(def.name) : prettifyId(baseId);
}

export function itemName(item: ItemInstance): string {
  try {
    const d = describeItem(item);
    if (d.name && d.name !== item.base) return d.name;
  } catch {
    // describe may throw on partial data; fall through to base name.
  }
  return itemBaseName(item.base);
}

export type ConsumableKind = 'heal' | 'mana' | 'rejuv' | 'stamina' | 'recall' | 'antidote' | 'thaw' | 'other';

/** What a belt item does — from the item table, or guessed from the base id. */
export function consumableKind(baseId: string): ConsumableKind {
  const use = DB.items.get(baseId)?.use?.kind;
  if (use && use !== 'identify') return use;
  if (/rejuv/i.test(baseId)) return 'rejuv';
  if (/bakta|heal|life|stim/i.test(baseId)) return 'heal';
  if (/energy|cell|mana|forse/i.test(baseId)) return 'mana';
  if (/stamina/i.test(baseId)) return 'stamina';
  if (/recall|beacon/i.test(baseId)) return 'recall';
  if (/antidote/i.test(baseId)) return 'antidote';
  if (/thaw/i.test(baseId)) return 'thaw';
  return 'other';
}

export function levelName(levelId: string | null | undefined): string {
  if (!levelId) return t('hud.map.unknownArea');
  const def = DB.levels.get(levelId);
  return def ? t(def.name) : prettifyId(levelId);
}

export function isTownLevel(levelId: string | null | undefined): boolean {
  return !!levelId && !!DB.levels.get(levelId)?.isTown;
}
