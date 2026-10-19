/**
 * Quest-aware NPC dialogue. Each quest has a giver who briefs the hero on the current step;
 * once the quest is done, its giver (or the NPC it is reported to) thanks the hero exactly once.
 */
import type { LevelDef, LoreDef, QuestDef } from '@/data/schema';
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

/** A story line plus its continuation pages (`key.2`, `key.3`, ...) when they exist. */
function withPages(key: string, has: (key: string) => boolean): string[] {
  const out = [key];
  for (let i = 2; has(`${key}.${i}`); i++) out.push(`${key}.${i}`);
  return out;
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
    if (by === npc && has(key)) return { lines: withPages(key, has), debrief: q.id };
  }
  // Then a briefing on the giver's first unfinished quest.
  for (const q of quests) {
    if (QUEST_GIVER[q.id] !== npc || state[q.id]?.completed) continue;
    const step = state[q.id]?.step ?? q.steps[0]?.id;
    const key = `story.${q.id}.${step}`;
    if (step && has(key)) return { lines: withPages(key, has) };
  }
  return null;
}

/** HUD guidance: the first unfinished quest's current step, and who to turn quests in to. */
export function storyHud(
  quests: readonly QuestDef[],
  state: QuestStateMap,
  npcs: readonly { id: EntityId; defId: DefId }[],
  where?: { level: DefId; levels: readonly LevelDef[]; hostilesLeft?: number },
): StoryHud {
  let objective: StoryHud['objective'] = null;
  let guideTo: DefId | null = null;
  for (const q of quests) {
    const p = state[q.id];
    if (p?.completed) continue;
    const step = q.steps.find((s) => s.id === (p?.step ?? q.steps[0]?.id));
    if (step) {
      objective = { questKey: q.name, stepKey: step.text };
      if (
        step.on.event === 'clearLevel' &&
        where?.level === step.on.level &&
        where.hostilesLeft !== undefined
      )
        objective.left = where.hostilesLeft;
      const target = where ? stepLevel(step.on, where.levels, q.act) : null;
      if (where && target) guideTo = nextHop(where.level, target, where.levels);
    }
    break;
  }
  // Everything done: a closing line instead of an empty tracker.
  if (!objective && quests.length && quests.every((q) => state[q.id]?.completed))
    objective = { questKey: 'quest.actComplete', stepKey: 'story.actDone.step' };
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
  return { objective, turnIn, guideTo };
}

/** Level an objective step happens in (null when it can be done anywhere). */
export function stepLevel(
  on: QuestDef['steps'][number]['on'],
  levels: readonly LevelDef[],
  act: number,
): DefId | null {
  switch (on.event) {
    case 'enterLevel':
    case 'clearLevel':
      return on.level;
    case 'killBoss':
      return levels.find((l) => l.bosses?.includes(on.boss))?.id ?? null;
    case 'talkTo':
      return levels.find((l) => l.isTown && l.act === act)?.id ?? null;
    default:
      return null;
  }
}

/** Next level to head for on the way from `from` to `to` (breadth-first over level links). */
export function nextHop(from: DefId, to: DefId, levels: readonly LevelDef[]): DefId | null {
  if (from === to) return null;
  const byId = new Map(levels.map((l) => [l.id, l]));
  const first = new Map<DefId, DefId>();
  const queue: DefId[] = [];
  for (const link of byId.get(from)?.links ?? []) {
    if (first.has(link.to)) continue;
    first.set(link.to, link.to);
    queue.push(link.to);
  }
  while (queue.length) {
    const id = queue.shift()!;
    if (id === to) return first.get(id) ?? null;
    for (const link of byId.get(id)?.links ?? []) {
      if (link.to === from || first.has(link.to)) continue;
      first.set(link.to, first.get(id)!);
      queue.push(link.to);
    }
  }
  return null;
}

/**
 * Whether a Holocron entry is open. A quest counts as started once it has progress or it is the
 * first unfinished quest (the one the hero has been briefed on).
 */
export function loreUnlocked(def: LoreDef, quests: readonly QuestDef[], state: QuestStateMap): boolean {
  if (!def.unlock) return true;
  const { quest, when } = def.unlock;
  const p = state[quest];
  if (when === 'done') return !!p?.completed;
  return !!p || quests.find((q) => !state[q.id]?.completed)?.id === quest;
}
