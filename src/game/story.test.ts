import { describe, expect, it } from 'vitest';
import { DB } from '@/data/db';
import { hasName } from '@/data/names';
import { QUEST_GIVER, loreUnlocked, nextHop, stepLevel, storyHud, storyTalk } from './story';
import type { QuestStateMap } from '@/core/quests/engine';

const quests = [...DB.quests.values()].filter((q) => q.act === 1);

describe('story dialogue', () => {
  it('every Act I quest has a giver who exists, a line per step before the report, and thanks', () => {
    for (const q of quests) {
      const giver = QUEST_GIVER[q.id];
      expect(giver && DB.npcs.has(giver), q.id).toBe(true);
      for (const s of q.steps) {
        if (s.on.event === 'talkTo') continue; // reporting back is covered by the thanks
        expect(hasName(`story.${q.id}.${s.id}`), `${q.id}.${s.id}`).toBe(true);
      }
      expect(hasName(`story.${q.id}.done`), q.id).toBe(true);
    }
  });

  it('a giver briefs the current step of their first unfinished quest', () => {
    expect(storyTalk('medicAkarra', quests, {})?.lines).toEqual(['story.a1q1.enter', 'story.a1q1.enter.2']);
    const state = { a1q1: { step: 'clear', completed: false, rewardClaimed: false } };
    expect(storyTalk('medicAkarra', quests, state)?.lines).toEqual(['story.a1q1.clear']);
  });

  it('thanks once on completion, then moves on to the next quest', () => {
    const state = {
      a1q1: { step: '', completed: true, rewardClaimed: true },
    } as Record<string, { step: string; completed: boolean; rewardClaimed: boolean; debriefed?: boolean }>;
    const thanks = storyTalk('medicAkarra', quests, state);
    expect(thanks).toEqual({ lines: ['story.a1q1.done', 'story.a1q1.done.2'], debrief: 'a1q1' });
    state.a1q1!.debriefed = true;
    expect(storyTalk('medicAkarra', quests, state)?.lines).toEqual([
      'story.a1q3.enter',
      'story.a1q3.enter.2',
    ]);
  });

  it('the rescued master thanks the hero; NPCs with no quest use their banter', () => {
    const state = { a1q3: { step: '', completed: true, rewardClaimed: true } };
    expect(storyTalk('masterYoduh', quests, state)?.debrief).toBe('a1q3');
    expect(storyTalk('gheedo', quests, {})).toBeNull();
  });

  it('the HUD tracks the first unfinished quest and marks who to report to', () => {
    const npcs = [
      { id: 1, defId: 'medicAkarra' },
      { id: 2, defId: 'captainKasha' },
    ];
    expect(storyHud(quests, {}, npcs)).toEqual({
      objective: { questKey: 'quest.a1q1', stepKey: 'quest.a1q1.enter' },
      turnIn: [],
      guideTo: null,
    });
    const atReport = { a1q1: { step: 'report', completed: false, rewardClaimed: false } };
    expect(storyHud(quests, atReport, npcs).turnIn).toEqual([1]);
  });

  it('routes toward the objective level one exit at a time', () => {
    const levels = [...DB.levels.values()];
    expect(nextHop('a1.town', 'a1.tuskinDen', levels)).toBe('a1.mossfields');
    expect(nextHop('a1.mossfields', 'a1.tuskinDen', levels)).toBe('a1.tuskinDen');
    expect(nextHop('a1.tuskinDen', 'a1.town', levels)).toBe('a1.mossfields');
    expect(nextHop('a1.town', 'a1.undercroft2', levels)).toBe('a1.mossfields');
    expect(nextHop('a1.town', 'a1.town', levels)).toBeNull();
    expect(stepLevel({ event: 'killBoss', boss: 'countDooky' }, levels, 1)).toBe('a1.undercroft2');
    expect(stepLevel({ event: 'talkTo', npc: 'medicAkarra' }, levels, 1)).toBe('a1.town');
  });

  it('every Act I objective level can be reached from camp', () => {
    const levels = [...DB.levels.values()];
    for (const q of quests)
      for (const s of q.steps) {
        const target = stepLevel(s.on, levels, q.act);
        if (target && target !== 'a1.town')
          expect(nextHop('a1.town', target, levels), `${q.id}.${s.id}`).not.toBeNull();
      }
  });

  it('counts the hostiles left while clearing the objective level', () => {
    const levels = [...DB.levels.values()];
    const state = { a1q1: { step: 'clear', completed: false, rewardClaimed: false } };
    expect(
      storyHud(quests, state, [], { level: 'a1.tuskinDen', levels, hostilesLeft: 3 }).objective?.left,
    ).toBe(3);
    expect(
      storyHud(quests, state, [], { level: 'a1.mossfields', levels, hostilesLeft: 3 }).objective?.left,
    ).toBeUndefined();
  });

  it('shows a closing objective once every quest of the act is done', () => {
    const done = { step: '', completed: true, rewardClaimed: true, debriefed: true };
    const state = Object.fromEntries(quests.map((q) => [q.id, done]));
    expect(storyHud(quests, state, []).objective).toEqual({
      questKey: 'quest.actComplete',
      stepKey: 'story.actDone.step',
    });
  });
});

describe('Holocron unlocks', () => {
  const quests = [...DB.quests.values()].filter((q) => q.act === 1);
  const lore = [...DB.lore.values()];
  const open = (state: QuestStateMap) => lore.filter((l) => loreUnlocked(l, quests, state)).map((l) => l.id);

  it('starts with the backstory and the first quest entry', () => {
    const ids = open({});
    expect(ids).toContain('kyburHeart');
    expect(ids).toContain('tuskins');
    expect(ids).not.toContain('jawwas');
    expect(ids).not.toContain('blackBox');
  });

  it('opens entries as quests start and finish', () => {
    const done = { step: 'done', completed: true, rewardClaimed: true };
    const ids = open({ a1q1: done, a1q2: done });
    expect(ids).toContain('jawwas');
    expect(ids).toContain('blackBox');
    expect(ids).toContain('yoduh');
    expect(ids).not.toContain('theError');
  });

  it('opens a set story once a piece of that set is found', () => {
    expect(open({})).not.toContain('set.templeGuard');
    const ids = lore.filter((l) => loreUnlocked(l, quests, {}, new Set(['templeGuard']))).map((l) => l.id);
    expect(ids).toContain('set.templeGuard');
    expect(ids).not.toContain('set.fettsonsLegacy');
  });

  it('every entry and NPC topic has text', () => {
    for (const l of lore) {
      expect(hasName(l.title), l.title).toBe(true);
      expect(hasName(l.text), l.text).toBe(true);
    }
    for (const n of DB.npcs.values())
      for (const tp of n.topics ?? []) {
        expect(hasName(tp.label), tp.label).toBe(true);
        for (const k of tp.lines) expect(hasName(k), k).toBe(true);
      }
  });
});
