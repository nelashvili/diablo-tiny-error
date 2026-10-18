/**
 * Quest-aware NPC dialogue. Each quest has a giver who briefs the hero on the current step;
 * once the quest is done, its giver (or the NPC it is reported to) thanks the hero exactly once.
 */
import type { QuestDef } from '@/data/schema';
import type { DefId, EntityId } from '@/core/types';
import type { StoryHud } from '@/ui/types';
import type { QuestStateMap } from '@/core/quests/engine';
import { hasName } from '@/data/names';

/** Who hands out each quest. */
export const QUEST_GIVER: Record<DefId, DefId> = {
  a1q1: 'medicAkarra',
  a1q2: 'captainKasha',
  a1q3: 'medicAkarra',
  a1q4: 'masterYoduh',
  a1q5: 'captainKasha',
};

function reportsTo(q: QuestDef): DefId | undefined {
  const last = q.steps[q.steps.length - 1];
  return last?.on.event === 'talkTo' ? last.on.npc : undefined;
}

export interface StoryTalk {
  lines: string[];
  /** Quest whose thanks this was (mark it debriefed). */
  debrief?: DefId;
}

/** What `npc` says about the story right now, or null for its usual banter. */
export function storyTalk(
  npc: DefId,
  quests: readonly QuestDef[],
  state: QuestStateMap,
  has: (key: string) => boolean = hasName,
): StoryTalk | null {
  // A finished quest gets its thanks first.
  for (const q of quests) {
    const p = state[q.id];
    if (!p?.completed || p.debriefed) continue;
    const by = reportsTo(q) ?? QUEST_GIVER[q.id];
    const key = `story.${q.id}.done`;
    if (by === npc && has(key)) return { lines: [key], debrief: q.id };
  }
  // Then a briefing on the giver's first unfinished quest.
  for (const q of quests) {
    if (QUEST_GIVER[q.id] !== npc || state[q.id]?.completed) continue;
    const step = state[q.id]?.step ?? q.steps[0]?.id;
    const key = `story.${q.id}.${step}`;
    if (step && has(key)) return { lines: [key] };
  }
  return null;
}

/** HUD guidance: the first unfinished quest's current step, and who to turn quests in to. */
export function storyHud(
  quests: readonly QuestDef[],
  state: QuestStateMap,
  npcs: readonly { id: EntityId; defId: DefId }[],
): StoryHud {
  let objective: StoryHud['objective'] = null;
  for (const q of quests) {
    const p = state[q.id];
    if (p?.completed) continue;
    const step = q.steps.find((s) => s.id === (p?.step ?? q.steps[0]?.id));
    if (step) objective = { questKey: q.name, stepKey: step.text };
    break;
  }
  const turnIn = npcs
    .filter(
      (n) =>
        !!storyTalk(n.defId, quests, state)?.debrief ||
        quests.some((q) => {
          const p = state[q.id];
          const step = p && !p.completed ? q.steps.find((s) => s.id === p.step) : undefined;
          return step?.on.event === 'talkTo' && step.on.npc === n.defId;
        }),
    )
    .map((n) => n.id);
  return { objective, turnIn };
}
