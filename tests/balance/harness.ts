/**
 * Headless balance harness: a scripted hero fights real monster defs with the real sim + AI.
 * Not part of the game or the unit suite (run via tests/balance/vitest.config.ts).
 */
import { DB } from '@/data/db';
import type { ItemBaseDef } from '@/data/schema';
import { getManaCost, getSkillBlockReason } from '@/core/skills/runtime';
import { SimWorld } from '@/core/sim/world';
import { FixedLoop } from '@/core/sim/loop';
import { createCoreSystems } from '@/core/sim/systems';
import { createAiSystem } from '@/core/ai';
import { createPlayer, recomputeStats } from '@/core/player';
import { createMonster } from '@/core/monsters';
import { createItem } from '@/core/items/create';
import { Rng } from '@/core/rng';
import { makeFlatLevel } from '@/core/sim/systems/testing';
import type { MonsterEntity, PlayerEntity } from '@/core/sim/entities';
import type { ClassId, EquipSlot } from '@/core/types';
import type { GameEvent } from '@/core/sim/events';

export const TICK = 25;

export interface Build {
  name: string;
  classId: ClassId;
  /** Per level-up stat split [str, dex, vit, energy] summing to 5. */
  stats: [number, number, number, number];
  weapon: string[];
  /** Skill point priority: each entry is tried in order every point (maxed entries skipped). */
  points: string[];
  /** Attack skill choice by preference (first allocated one wins, else 'attack'). */
  attack: string[];
  /** Buffs/warcries to keep up (cast when missing). */
  buffs?: string[];
  shield?: boolean;
  /** Ranged: step away from foes that get close (players kite, imperfectly). */
  kite?: boolean;
}

export interface Gear {
  quality: 'normal' | 'magic';
}

const SLOTS: EquipSlot[] = ['head', 'body', 'gloves', 'boots', 'belt'] as EquipSlot[];

function bestBase(
  pred: (b: ItemBaseDef) => boolean,
  lvl: number,
  p: PlayerEntity,
  score: (b: ItemBaseDef) => number = (b) => b.qlvl,
): ItemBaseDef | undefined {
  const s = p.stats;
  const ok = [...DB.items.values()].filter(
    (b) =>
      pred(b) &&
      b.qlvl <= lvl &&
      (b.req.strength ?? 0) <= s.strength &&
      (b.req.dexterity ?? 0) <= s.dexterity &&
      (b.req.level ?? 0) <= lvl,
  );
  ok.sort((a, b) => score(b) - score(a));
  return ok[0];
}

export function makeHero(world: SimWorld, b: Build, level: number, gear: Gear, seed: number): PlayerEntity {
  const p = createPlayer(world, b.classId, 'Bot', { level, startingItems: [], local: true });
  p.equipment = {};
  for (let l = 1; l < level; l++) {
    const keys = ['strength', 'dexterity', 'vitality', 'energy'] as const;
    keys.forEach((k, i) => (p.allocated[k] += b.stats[i]!));
  }
  p.statPointsUnspent = 0;
  // Skill points: one per level-up plus the Act I quest point (Den of Evil analog) from level 3.
  let pts = level - 1 + (level >= 3 ? 1 : 0);
  p.skillPointsUnspent = 0;
  p.skills = {};
  const can = (entry: string) => {
    const [id, capS] = entry.split(':') as [string, string | undefined];
    const s = DB.skills.get(id);
    if (!s) throw new Error(`no skill ${id}`);
    if (s.reqLevel > level) return false;
    if ((p.skills[id] ?? 0) >= Math.min(20, capS ? Number(capS) : 20)) return false;
    return (s.prereqs ?? []).every((q) => (p.skills[q] ?? 0) > 0);
  };
  while (pts > 0) {
    const entry = b.points.find(can);
    if (!entry) break;
    const id = entry.split(':')[0]!;
    p.skills[id] = (p.skills[id] ?? 0) + 1;
    pts--;
  }
  recomputeStats(p, world.difficulty);
  const rng = new Rng(seed);
  const q = gear.quality;
  const w = bestBase(
    (x) => !!x.weaponClass && b.weapon.includes(x.weaponClass),
    level,
    p,
    // Players wield the hardest hitter they can.
    (x) => (((x.damage?.min ?? 0) + (x.damage?.max ?? 0)) / 2) * (x.speed ?? 1),
  );
  if (w) p.equipment.mainHand = createItem(w.id, { ilvl: level, quality: q }, rng);
  for (const slot of SLOTS) {
    const a = bestBase(
      (x) => x.category === 'armor' && x.slots.includes(slot) && (!x.classOnly || x.classOnly === b.classId),
      level,
      p,
    );
    if (a)
      (p.equipment as Record<string, unknown>)[slot] = createItem(a.id, { ilvl: level, quality: q }, rng);
  }
  if (b.shield && !(w && w.twoHanded)) {
    const s = bestBase(
      (x) =>
        x.category === 'armor' &&
        x.slots.includes('offHand' as EquipSlot) &&
        (!x.classOnly || x.classOnly === b.classId),
      level,
      p,
    );
    if (s) p.equipment.offHand = createItem(s.id, { ilvl: level, quality: q }, rng);
  }
  recomputeStats(p, world.difficulty);
  p.life = p.stats.lifeMax;
  p.mana = p.stats.manaMax;
  return p;
}

export function attackSkill(p: PlayerEntity, b: Build): string {
  return b.attack.find((id) => (p.skills[id] ?? 0) > 0) ?? 'attack';
}

export interface FightResult {
  won: boolean;
  died: boolean;
  seconds: number;
  /** Damage taken as a share of max life (can exceed 1 with potions). */
  dmgTaken: number;
  potions: number;
  manaPots: number;
  minLifePct: number;
  /** Damage dealt by the hero per second of fighting. */
  dps: number;
  kills: number;
}

export interface Arena {
  world: SimWorld;
  loop: FixedLoop;
  p: PlayerEntity;
  events: GameEvent[];
}

export function arena(seed: number): SimWorld {
  const world = new SimWorld(seed);
  world.level = makeFlatLevel(60, 60);
  return world;
}

export function startLoop(world: SimWorld): FixedLoop {
  const core = createCoreSystems();
  return new FixedLoop(world, [core[0]!, createAiSystem(), ...core.slice(1)]);
}

export interface SpawnSpec {
  defId: string;
  level: number;
  rank: MonsterEntity['rank'];
  count: number;
  mods?: string[];
  bossId?: string;
  dist?: number;
}

export function spawnGroup(world: SimWorld, center: { x: number; y: number }, specs: SpawnSpec[], rng: Rng) {
  const out: MonsterEntity[] = [];
  let leader: number | undefined;
  for (const s of specs)
    for (let i = 0; i < s.count; i++) {
      const a = rng.float(0, Math.PI * 2);
      const d = s.dist ?? 7;
      const pos = {
        x: center.x + Math.cos(a) * rng.float(d - 1, d + 1.5),
        y: center.y + Math.sin(a) * rng.float(d - 1, d + 1.5),
      };
      const m = createMonster(world, s.defId, pos, s.level, s.rank, {
        rng,
        ...(s.mods ? { mods: s.mods as never } : {}),
        ...(s.bossId ? { bossId: s.bossId } : {}),
        ...(leader !== undefined && s.rank !== 'boss' ? { leaderId: leader } : {}),
      });
      if (leader === undefined) leader = m.id;
      out.push(m);
    }
  return out;
}

const HEALS = ['baktaStim', 'baktaStimLight', 'baktaStimMedium'];
const MANAS = ['energyCell', 'energyCellLight', 'energyCellMedium'];
function potFor(list: string[], level: number) {
  return [...list].reverse().find((id) => (DB.items.get(id)?.qlvl ?? 99) <= level) ?? list[0]!;
}

/** Healing potion budget per fight from the HEALS env var (mana potions stay unlimited). */
export const HEALS_BUDGET = process.env.HEALS ? Number(process.env.HEALS) : Infinity;

/**
 * Fight until every listed monster is dead, the hero dies or time runs out. The hero bot stands
 * and uses its attack skill on the nearest foe, keeps buffs up and drinks at 40 % life / when dry.
 */
export function fight(
  world: SimWorld,
  loop: FixedLoop,
  p: PlayerEntity,
  b: Build,
  foes: MonsterEntity[],
  opts: { maxSec?: number; skill?: string; potions?: boolean; heals?: number } = {},
): FightResult {
  const maxTicks = (opts.maxSec ?? 120) * TICK;
  const skill = opts.skill ?? attackSkill(p, b);
  const heal = potFor(HEALS, p.level);
  const mana = potFor(MANAS, p.level);
  let dmgTaken = 0;
  let dealt = 0;
  let potions = 0;
  let manaPots = 0;
  let minLife = 1;
  let nextPot = 0;
  let nextMana = 0;
  const foeIds = new Set(foes.map((f) => f.id));
  const off = world.bus.onAny((e: GameEvent) => {
    if (e.type === 'damage') {
      if (e.targetId === p.id) dmgTaken += e.amount;
      else if (foeIds.has(e.targetId)) dealt += e.amount;
    }
  });
  const rng = new Rng(world.tick + 17);
  const lastCast = new Map<string, number>();
  let kiteUntil = 0;
  let nextKite = 0;
  // A defeated hero stays `alive` (mode 'dying', then a respawn), so death is life hitting 0.
  const down = () => !p.alive || p.life <= 0 || p.mode === 'dying' || p.mode === 'dead';
  let t = 0;
  for (; t < maxTicks; t++) {
    const alive = foes.filter((f) => f.alive);
    if (!alive.length || down()) break;
    minLife = Math.min(minLife, p.life / p.stats.lifeMax);
    if (
      opts.potions !== false &&
      potions < (opts.heals ?? Infinity) &&
      p.life < p.stats.lifeMax * 0.4 &&
      t >= nextPot
    ) {
      // D2 potions heal over a few seconds; use the item's real effect via a fresh stim.
      const it = createItem(heal, { ilvl: 1 }, rng);
      p.belt.slots[0] = it;
      world.commands.push({ type: 'useBeltSlot', index: 0 });
      potions++;
      nextPot = t + TICK * 1.5;
    }
    const cost = skill === 'attack' ? 0 : getManaCost(p, skill);
    if (opts.potions !== false && p.mana < Math.max(cost, 1) * 1.2 && t >= nextMana) {
      p.belt.slots[1] = createItem(mana, { ilvl: 1 }, rng);
      world.commands.push({ type: 'useBeltSlot', index: 1 });
      manaPots++;
      nextMana = t + TICK * 1.5;
    }
    if (t % 5 === 0) {
      let tgt = alive[0]!;
      let bd = Infinity;
      for (const f of alive) {
        const d = Math.hypot(f.pos.x - p.pos.x, f.pos.y - p.pos.y);
        if (d < bd) {
          bd = d;
          tgt = f;
        }
      }
      if (t < kiteUntil) {
        loop.step();
        world.drainFrameEvents();
        continue;
      }
      if (b.kite && bd < 2.5 && t >= nextKite) {
        const dx = p.pos.x - tgt.pos.x;
        const dy = p.pos.y - tgt.pos.y;
        const l = Math.hypot(dx, dy) || 1;
        const c = (v: number) => Math.max(3, Math.min(57, v));
        world.commands.push({
          type: 'moveTo',
          pos: { x: c(p.pos.x + (dx / l) * 4), y: c(p.pos.y + (dy / l) * 4) },
        });
        kiteUntil = t + 18;
        nextKite = t + 18 + TICK * 1.5;
        loop.step();
        world.drainFrameEvents();
        continue;
      }
      const buff = (b.buffs ?? []).find((id) => {
        if ((p.skills[id] ?? 0) <= 0 || getSkillBlockReason(world, p, id) === 'mana') return false;
        const kind = DB.skills.get(id)?.kind;
        const since = t - (lastCast.get(id) ?? -1e9);
        // Buffs are kept up; warcries, summons and the rest are re-used every few seconds.
        if (kind === 'buff' || kind === 'aura') return !p.buffs.some((x) => x.id === id) && since > TICK;
        return since > TICK * 6;
      });
      if (buff) lastCast.set(buff, t);
      // Out of mana for the skill: players fall back to a plain attack instead of standing idle.
      const attack = skill !== 'attack' && getSkillBlockReason(world, p, skill) === 'mana' ? 'attack' : skill;
      const use = buff ?? attack;
      world.commands.push({ type: 'useSkill', skillId: use, targetId: tgt.id, targetPos: { ...tgt.pos } });
    }
    loop.step();
    world.drainFrameEvents();
  }
  off();
  const sec = t / TICK;
  return {
    won: foes.every((f) => !f.alive),
    died: down(),
    seconds: sec,
    dmgTaken: dmgTaken / p.stats.lifeMax,
    potions,
    manaPots,
    minLifePct: down() ? 0 : minLife,
    dps: sec > 0 ? dealt / sec : 0,
    kills: foes.filter((f) => !f.alive).length,
  };
}
