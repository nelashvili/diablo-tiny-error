import { describe, expect, it } from 'vitest';
import type { QuestDef } from '../../data/schema';
import { DB } from '../../data/db';
import { applyQuestSignal, progressOf, stepIndex, type QuestStateMap } from './engine';

const den: QuestDef = {
  id: 'tq',
  act: 1,
  name: 'quest.tq',
  steps: [
    { id: 'enter', text: 'x', on: { event: 'enterLevel', level: 'den' } },
    { id: 'kill', text: 'x', on: { event: 'killMonster', monster: 'rat', count: 3 } },
    { id: 'report', text: 'x', on: { event: 'talkTo', npc: 'medic' } },
  ],
  reward: { skillPoints: 1 },
};

describe('quest engine', () => {
  it('advances step by step and completes', () => {
    const s: QuestStateMap = {};
    expect(applyQuestSignal(s, [den], { kind: 'enterLevel', level: 'den' }, [1])).toEqual([
      { questId: 'tq', step: 'enter', completed: false },
    ]);
    for (let i = 0; i < 2; i++)
      expect(applyQuestSignal(s, [den], { kind: 'killMonster', monster: 'rat' }, [1])).toEqual([]);
    expect(applyQuestSignal(s, [den], { kind: 'killMonster', monster: 'rat' }, [1])[0]?.step).toBe('kill');
    const done = applyQuestSignal(s, [den], { kind: 'talkTo', npc: 'medic' }, [1]);
    expect(done[0]).toEqual({ questId: 'tq', step: 'report', completed: true });
    expect(stepIndex(den, progressOf(s, den))).toBe(3);
  });

  it('a later step skips the earlier ones (out of order play still counts)', () => {
    const s: QuestStateMap = {};
    const r = applyQuestSignal(s, [den], { kind: 'talkTo', npc: 'medic' }, [1]);
    expect(r[0]?.completed).toBe(true);
  });

  it('ignores quests of locked acts and unrelated signals', () => {
    const s: QuestStateMap = {};
    expect(applyQuestSignal(s, [den], { kind: 'enterLevel', level: 'den' }, [2])).toEqual([]);
    expect(applyQuestSignal(s, [den], { kind: 'enterLevel', level: 'elsewhere' }, [1])).toEqual([]);
  });

  it('Act I quests reference real levels, bosses and npcs', () => {
    for (const q of DB.quests.values()) {
      for (const st of q.steps) {
        const on = st.on;
        if (on.event === 'enterLevel' || on.event === 'clearLevel')
          expect(DB.levels.has(on.level), on.level).toBe(true);
        if (on.event === 'killBoss') expect(DB.bosses.has(on.boss), on.boss).toBe(true);
        if (on.event === 'talkTo') expect(DB.npcs.has(on.npc), on.npc).toBe(true);
      }
      const bossSteps = q.steps.filter((s) => s.on.event === 'killBoss');
      for (const b of bossSteps) {
        const boss = (b.on as { boss: string }).boss;
        expect(
          [...DB.levels.values()].some((l) => l.bosses?.includes(boss)),
          `${boss} placed`,
        ).toBe(true);
      }
    }
  });
});
