import { describe, expect, it } from 'vitest';
import { DB } from '@/data/db';
import { hasName } from '@/data/names';
import { QUEST_GIVER, nextHop, stepLevel, storyHud, storyTalk } from './story';

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
    expect(storyTalk('medicAkarra', quests, {})?.lines).toEqual(['story.a1q1.enter']);
    const state = { a1q1: { step: 'clear', completed: false, rewardClaimed: false } };
    expect(storyTalk('medicAkarra', quests, state)?.lines).toEqual(['story.a1q1.clear']);
  });

  it('thanks once on completion, then moves on to the next quest', () => {
    const state = {
      a1q1: { step: '', completed: true, rewardClaimed: true },
    } as Record<string, { step: string; completed: boolean; rewardClaimed: boolean; debriefed?: boolean }>;
    const thanks = storyTalk('medicAkarra', quests, state);
    expect(thanks).toEqual({ lines: ['story.a1q1.done'], debrief: 'a1q1' });
    state.a1q1!.debriefed = true;
    expect(storyTalk('medicAkarra', quests, state)?.lines).toEqual(['story.a1q3.enter']);
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
});
