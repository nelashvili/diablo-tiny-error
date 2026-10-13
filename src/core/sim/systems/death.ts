/**
 * Death: dissolve timers, XP, loot, remnants and the player's "Defeated" flow.
 *  - Monsters: mode 'dying' (0.8s) then removed; a RemnantEntity (8s) spawns unless flags.noRemnant.
 *  - Player: mode 'dying', Creditz/XP penalty (PLAN §2), `playerDefeated` event, then respawn via
 *    `deathHooks.respawn` (the world module moves the hero to town) or in place by default.
 */
import { DB } from '../../../data/db';
import { rollDrops } from '../../loot';
import { createItem } from '../../items/create';
import type { ItemInstance } from '../../items/types';
import { applyDeathPenalty, gainXp, monsterXp } from '../../player/progression';
import { spawnGroundItem } from '../../player/inventory';
import { xpPenaltyFactor } from '../../stats/xp';
import { isActor, type Actor, type MonsterEntity, type PlayerEntity, type RemnantEntity } from '../entities';
import type { SimSystem, SimWorld } from '../world';
import { clearMovement } from './intent';
import { getLocalPlayer, monsterDefOf, rootOwner, setMode } from './util';
import { healActor } from './damage';

export const DYING_SEC = 0.8;
export const PLAYER_DYING_SEC = 1.5;
export const REMNANT_SEC = 8;

export const deathHooks: {
  /** Called when a defeated player's dying animation ends. Must call revivePlayer (maybe after moving to town). */
  respawn?: (world: SimWorld, player: PlayerEntity) => void;
} = {};

/** Bring a defeated player back (full life/mana, clear negative states). */
export function revivePlayer(world: SimWorld, p: PlayerEntity, pos?: { x: number; y: number }): void {
  const at = pos ?? world.level?.placements.find((q) => q.kind === 'playerStart')?.pos;
  if (at) {
    p.pos.x = at.x;
    p.pos.y = at.y;
  }
  p.effects = [];
  p.life = p.stats.lifeMax;
  p.mana = p.stats.manaMax;
  p.stamina = p.stats.staminaMax;
  p.action = undefined;
  clearMovement(p);
  p.targetId = undefined;
  setMode(p, 'idle');
  world.emit({ type: 'statsChanged', id: p.id });
}

const SPAWN_SPREAD = 0.7;

function dropLoot(world: SimWorld, m: MonsterEntity, killer: Actor | undefined): void {
  const def = monsterDefOf(m);
  if (!def) return;
  const tc =
    m.rank === 'champion'
      ? (def.treasure.champion ?? def.treasure.normal)
      : m.rank === 'unique' || m.rank === 'boss'
        ? (def.treasure.unique ?? def.treasure.normal)
        : def.treasure.normal;
  const res = rollDrops(
    {
      treasureClass: tc,
      monsterLevel: m.level,
      magicFind: killer?.stats.raw.magicFind ?? 0,
      goldFind: killer?.stats.raw.goldFind ?? 0,
      players: 1,
      rank: m.rank === 'champion' || m.rank === 'unique' || m.rank === 'boss' ? m.rank : 'normal',
    },
    world.lootRng,
  );
  const scatter = (): { x: number; y: number } => ({
    x: m.pos.x + (world.lootRng.next() * 2 - 1) * SPAWN_SPREAD,
    y: m.pos.y + (world.lootRng.next() * 2 - 1) * SPAWN_SPREAD,
  });
  for (const it of res.items) spawnGroundItem(world, it, scatter());
  if (res.creditz > 0) {
    const pile: ItemInstance = createCreditzItem(world, res.creditz);
    spawnGroundItem(world, pile, scatter(), res.creditz);
  }
}

function createCreditzItem(world: SimWorld, amount: number): ItemInstance {
  if (DB.items.has('creditz')) return createItem('creditz', { quantity: amount }, world.lootRng);
  return {
    uid: `creditz-${world.tick}-${world.lootRng.nextU32().toString(36)}`,
    base: 'creditz',
    quality: 'normal',
    ilvl: 1,
    affixes: [],
    mods: [],
    sockets: 0,
    socketed: [],
    identified: true,
    quantity: amount,
  };
}

function onMonsterDeath(world: SimWorld, m: Actor): void {
  const killerRaw = m.lastHitBy !== undefined ? world.get(m.lastHitBy) : undefined;
  const killerActor = killerRaw && isActor(killerRaw) ? killerRaw : undefined;
  const root = killerActor ? rootOwner(world, killerActor) : undefined;
  const byPlayers = root?.team === 'players';
  const def = monsterDefOf(m);
  const droyd = def?.flags.droyd === true;
  world.emit({
    type: 'death',
    id: m.id,
    killerId: m.lastHitBy,
    pos: { x: m.pos.x, y: m.pos.y },
    droyd,
    defId: m.defId,
  });
  if (m.kind !== 'monster') return;

  // Player-side summons never give XP or loot.
  if (m.team === 'players' || !byPlayers) return;
  const player = root && root.kind === 'player' ? root : getLocalPlayer(world);
  if (player) {
    const xp = Math.round(monsterXp(def, m.level, m.rank) * xpPenaltyFactor(player.level, m.level));
    gainXp(world, player, xp);
    const lpk = player.stats.raw.lifePerKill ?? 0;
    if (lpk > 0) healActor(world, player, lpk);
    const mpk = player.stats.raw.manaPerKill ?? 0;
    if (mpk > 0) player.mana = Math.min(player.stats.manaMax, player.mana + mpk);
  }
  dropLoot(world, m, root);
}

function onPlayerDeath(world: SimWorld, p: PlayerEntity): void {
  world.emit({
    type: 'death',
    id: p.id,
    killerId: p.lastHitBy,
    pos: { x: p.pos.x, y: p.pos.y },
    droyd: false,
    defId: p.defId,
  });
  world.emit({ type: 'playerDefeated', id: p.id });
  applyDeathPenalty(world, p);
}

function spawnRemnant(world: SimWorld, m: Actor): void {
  const def = monsterDefOf(m);
  if (m.kind !== 'monster' || def?.flags.noRemnant || m.team === 'players') return;
  const r: RemnantEntity = {
    id: world.allocId(),
    kind: 'remnant',
    pos: { x: m.pos.x, y: m.pos.y },
    facing: m.facing,
    radius: 0.3,
    alive: true,
    monsterDefId: m.defId,
    sourceMonsterId: m.id,
    remainingSec: REMNANT_SEC,
    used: false,
    droyd: def?.flags.droyd === true,
  };
  world.add(r);
}

export function createDeathSystem(): SimSystem {
  return {
    name: 'death',
    update(world, dt) {
      for (const e of world.entities.values()) {
        if (e.kind === 'remnant') {
          e.remainingSec -= dt;
          if (e.remainingSec <= 0 || e.used) e.alive = false;
          continue;
        }
        if (!isActor(e) || !e.alive || e.kind === 'npc') continue;
        const a: Actor = e;
        if (a.mode === 'dying') {
          if (a.kind === 'player') {
            if (a.modeTime >= PLAYER_DYING_SEC) {
              if (deathHooks.respawn) deathHooks.respawn(world, a);
              else revivePlayer(world, a);
            }
          } else if (a.modeTime >= DYING_SEC) {
            a.alive = false;
            spawnRemnant(world, a);
          }
          continue;
        }
        if (a.life > 0) continue;
        a.life = 0;
        a.action = undefined;
        clearMovement(a);
        a.effects = [];
        setMode(a, 'dying');
        if (a.kind === 'player') onPlayerDeath(world, a);
        else onMonsterDeath(world, a);
      }
    },
  };
}
