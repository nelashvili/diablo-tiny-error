/**
 * Quest engine (pure): advances QuestDef steps from game signals and reports what changed.
 * State is the save format's per-difficulty quest map: `step` is the id of the next pending step
 * ('' once completed). A signal matching any pending step completes it and every step before it,
 * so doing things out of order (killing a boss before "entering" its level) still counts.
 */
import type { QuestDef, QuestStepDef } from '../../data/schema';
import type { ActId, DefId } from '../types';

export type QuestSignal =
  | { kind: 'enterLevel'; level: DefId }
  | { kind: 'killMonster'; monster: DefId }
  | { kind: 'killBoss'; boss: DefId }
  | { kind: 'clearLevel'; level: DefId }
  | { kind: 'pickupItem'; item: DefId }
  | { kind: 'talkTo'; npc: DefId }
  | { kind: 'useObject'; object: DefId };

export interface QuestProgress {
  step: string;
  completed: boolean;
  rewardClaimed: boolean;
  /** Kill counts for `killMonster` steps with a count. */
  kills?: number;
}

export type QuestStateMap = Record<DefId, QuestProgress>;

export interface QuestChange {
  questId: DefId;
  /** The step that was just completed. */
  step: string;
  completed: boolean;
}

function matches(on: QuestStepDef['on'], s: QuestSignal): boolean {
  switch (on.event) {
    case 'enterLevel':
      return s.kind === 'enterLevel' && s.level === on.level;
    case 'killMonster':
      return s.kind === 'killMonster' && s.monster === on.monster;
    case 'killBoss':
      return s.kind === 'killBoss' && s.boss === on.boss;
    case 'clearLevel':
      return s.kind === 'clearLevel' && s.level === on.level;
    case 'pickupItem':
      return s.kind === 'pickupItem' && s.item === on.item;
    case 'talkTo':
      return s.kind === 'talkTo' && s.npc === on.npc;
    case 'useObject':
      return s.kind === 'useObject' && s.object === on.object;
  }
}

export function progressOf(state: QuestStateMap, q: QuestDef): QuestProgress {
  return state[q.id] ?? { step: q.steps[0]?.id ?? '', completed: false, rewardClaimed: false };
}

/** Index of the next pending step (steps.length when completed). */
export function stepIndex(q: QuestDef, p: QuestProgress): number {
  if (p.completed) return q.steps.length;
  const i = q.steps.findIndex((s) => s.id === p.step);
  return i < 0 ? 0 : i;
}

/**
 * Apply a signal to every quest of the unlocked acts. Mutates `state` and returns the changes
 * (one per quest that advanced).
 */
export function applyQuestSignal(
  state: QuestStateMap,
  quests: Iterable<QuestDef>,
  signal: QuestSignal,
  acts: readonly ActId[],
): QuestChange[] {
  const out: QuestChange[] = [];
  for (const q of quests) {
    if (!acts.includes(q.act)) continue;
    const p = progressOf(state, q);
    if (p.completed) continue;
    const from = stepIndex(q, p);
    let hit = -1;
    for (let i = from; i < q.steps.length; i++) {
      const on = q.steps[i]!.on;
      if (!matches(on, signal)) continue;
      if (on.event === 'killMonster' && (on.count ?? 1) > 1) {
        const kills = (p.kills ?? 0) + 1;
        if (kills < on.count!) {
          state[q.id] = { ...p, kills };
          break;
        }
      }
      hit = i;
      break;
    }
    if (hit < 0) continue;
    const next = q.steps[hit + 1];
    const completed = !next;
    state[q.id] = { step: next?.id ?? '', completed, rewardClaimed: p.rewardClaimed };
    out.push({ questId: q.id, step: q.steps[hit]!.id, completed });
  }
  return out;
}
