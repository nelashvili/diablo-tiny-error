/**
 * Shared helpers for sim systems and the skill runtime (targeting rules, combatant views,
 * mode changes). Pure functions over entities; no state.
 */
import { DB } from '../../../data/db';
import type { MonsterDef } from '../../../data/schema';
import type { CombatantView } from '../../combat/types';
import type { Team } from '../../types';
import { isActor, type Actor, type ActorMode, type PlayerEntity } from '../entities';
import type { SimWorld } from '../world';

export function isTargetable(a: Actor): boolean {
  return a.alive && a.life > 0 && a.mode !== 'dying' && a.mode !== 'dead';
}

/** Hostile = both sides are real teams and they differ ('neutral' never fights). */
export function isHostile(a: { team: Team }, b: { team: Team }): boolean {
  return a.team !== 'neutral' && b.team !== 'neutral' && a.team !== b.team;
}

export function setMode(a: Actor, mode: ActorMode): void {
  if (a.mode !== mode) {
    a.mode = mode;
    a.modeTime = 0;
  }
}

export function monsterDefOf(a: Actor): MonsterDef | undefined {
  return a.kind === 'player' ? undefined : DB.monsters.get(a.defId);
}

export function getLocalPlayer(world: SimWorld): PlayerEntity | undefined {
  if (world.localPlayerId === null) return undefined;
  const e = world.get(world.localPlayerId);
  return e && e.kind === 'player' ? e : undefined;
}

export function isShieldItemBase(baseId: string | undefined): boolean {
  if (!baseId) return false;
  return DB.items.get(baseId)?.armorClass === 'shield';
}

type ImmuneMap = Partial<Record<'physical' | 'plasma' | 'cryo' | 'storm' | 'toxin' | 'magic', boolean>>;

/** Build the minimal view combat math needs. */
export function toCombatant(a: Actor): CombatantView {
  const def = monsterDefOf(a);
  const flags: NonNullable<CombatantView['flags']> = {};
  if (def) {
    if (def.flags.droyd) flags.droyd = true;
    if (def.flags.boss) flags.boss = true;
    const immune: ImmuneMap = {};
    let any = false;
    for (const [k, v] of Object.entries(def.res)) {
      if ((v ?? 0) >= 100) {
        immune[k as keyof ImmuneMap] = true;
        any = true;
      }
    }
    if (any) flags.immune = immune;
  }
  const off = a.kind === 'player' || a.kind === 'merc' ? a.equipment.offHand : undefined;
  return {
    id: a.id,
    level: a.level,
    stats: a.stats,
    moving: a.mode === 'walk' || a.mode === 'run',
    isPlayerSide: a.team === 'players',
    flags,
    hasShield: isShieldItemBase(off?.base),
  };
}

/** Follow summon/merc ownership up to the root actor. */
export function rootOwner(world: SimWorld, a: Actor): Actor {
  let cur: Actor = a;
  for (let i = 0; i < 4; i++) {
    const ownerId = cur.kind === 'monster' || cur.kind === 'merc' ? cur.ownerId : undefined;
    if (ownerId === undefined) break;
    const o = world.get(ownerId);
    if (!o || !isActor(o)) break;
    cur = o;
  }
  return cur;
}

/** Items that go to the belt (stims / cells). */
export function isBeltItemBase(baseId: string): boolean {
  const b = DB.items.get(baseId);
  if (!b || b.category !== 'consumable' || !b.use) return false;
  return b.use.kind === 'heal' || b.use.kind === 'mana' || b.use.kind === 'rejuv';
}
