import { describe, expect, it } from 'vitest';
import { DB } from '@/data/db';
import { hasName } from '@/data/names';
import { QUEST_GIVER, storyHud, storyTalk } from './story';

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
    });
    const atReport = { a1q1: { step: 'report', completed: false, rewardClaimed: false } };
    expect(storyHud(quests, atReport, npcs).turnIn).toEqual([1]);
  });
});
