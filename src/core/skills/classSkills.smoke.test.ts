/**
 * Smoke test: every class skill can be started with a suitable weapon and does its job
 * (damaging skills touch a dummy, buffs land, summons appear) without throwing.
 */
import { describe, expect, it } from 'vitest';
import { DB } from '../../data/db';
import type { SkillDef } from '../../data/schema';
import { createItem } from '../items/create';
import { createPlayer } from '../player/create';
import { recomputeStats } from '../player/stats';
import { Rng } from '../rng';
import type { GameEvent } from '../sim/events';
import { makeTestSim, spawnTestMonster } from '../sim/systems/testing';
import type { ClassId } from '../types';
import { startSkill } from './runtime';

const DEFAULT_WEAPON: Record<ClassId, string> = {
  yediKnight: 'litesaber',
  bountyHuntur: 'blasturPistol',
  forseAdept: 'forseStaff',
} as Record<ClassId, string>;

function baseFor(weaponClass: string): string {
  const b = [...DB.items.values()].find((i) => i.weaponClass === weaponClass);
  if (!b) throw new Error(`no base for ${weaponClass}`);
  return b.id;
}

const DAMAGING = new Set<SkillDef['kind']>([
  'meleeAttack',
  'missile',
  'multiMissile',
  'nova',
  'area',
  'beam',
  'chain',
  'wall',
  'whirl',
]);

function run(skill: SkillDef) {
  const { world, run } = makeTestSim(7);
  const p = createPlayer(world, skill.classId!, 'S', { startingItems: [], local: true });
  p.pos = { x: 10, y: 20 };
  p.level = 30;
  const wc = skill.weaponReq?.[0] ?? DEFAULT_WEAPON[skill.classId!];
  p.equipment.mainHand = createItem(baseFor(wc), { ilvl: 30 }, new Rng(1));
  p.skills[skill.id] = 5;
  recomputeStats(p, world.difficulty);
  p.mana = 9999;
  const dummies = [
    spawnTestMonster(world, { pos: { x: 12, y: 20 }, life: 5000 }),
    spawnTestMonster(world, { pos: { x: 11.5, y: 21.2 }, life: 5000 }),
    spawnTestMonster(world, { pos: { x: 14, y: 20.5 }, life: 5000 }),
  ];
  const events: GameEvent[] = [];
  world.bus.onAny((e) => events.push(e));
  const started = startSkill(world, p, skill.id, { id: dummies[0]!.id, pos: { x: 12, y: 20 } });
  run(180);
  return { world, p, dummies, events, started };
}

describe('every class skill works', () => {
  const skills = [...DB.skills.values()].filter((s) => s.classId && s.kind !== 'passive');
  for (const s of skills) {
    it(`${s.classId}/${s.id} (${s.kind})`, () => {
      const r = run(s);
      expect(r.started, 'started').toBe(true);
      const ids = new Set(r.dummies.map((d) => d.id));
      const touched = r.events.some(
        (e) =>
          (e.type === 'attackResult' && ids.has(e.targetId)) || (e.type === 'damage' && ids.has(e.targetId)),
      );
      const dealsDamage = s.damage !== undefined || s.weaponDamagePct !== undefined;
      // Trails only burn where the hero walks; here we just check the trail starts.
      if (s.kind === 'trail') expect(r.p.buffs.some((b) => b.id.endsWith(s.id))).toBe(true);
      else if (DAMAGING.has(s.kind) || (dealsDamage && s.kind !== 'buff'))
        expect(touched, 'hits a dummy').toBe(true);
      if (s.kind === 'buff') expect(r.p.buffs.some((b) => b.id === s.id)).toBe(true);
      if (s.kind === 'summon') {
        const mine = [...r.world.entities.values()].filter(
          (e) => e.kind === 'monster' && e.ownerId === r.p.id,
        );
        expect(mine.length, 'summoned').toBeGreaterThan(0);
      }
    });
  }
});
