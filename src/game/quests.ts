/**
 * Quest tracking for the game shell: turns world events into quest signals (core/quests),
 * pays rewards, announces progress and feeds the quest log panel.
 */
import { DB } from '@/data/db';
import type { QuestDef, QuestReward } from '@/data/schema';
import type { ActId, DefId } from '@/core/types';
import type { PlayerEntity } from '@/core/sim/entities';
import type { SimWorld } from '@/core/sim/world';
import {
  applyQuestSignal,
  progressOf,
  stepIndex,
  type QuestSignal,
  type QuestStateMap,
} from '@/core/quests/engine';
import type { QuestLogView } from '@/ui/panels/services';

const ACTS: ActId[] = [1, 2, 3, 4];

export class QuestTracker {
  state: QuestStateMap = {};
  /** Acts whose quests are active. */
  acts: ActId[] = [1];

  constructor(
    private world: SimWorld,
    private player: () => PlayerEntity | undefined,
  ) {
    const w = world;
    w.bus.on('levelEntered', (e) => this.signal({ kind: 'enterLevel', level: e.levelId }));
    w.bus.on('dialogue', (e) => {
      const npc = w.get(e.npcId);
      if (npc?.kind === 'npc') this.signal({ kind: 'talkTo', npc: npc.defId });
    });
    w.bus.on('objectUsed', (e) => this.signal({ kind: 'useObject', object: e.defId }));
    w.bus.on('itemPickedUp', (e) => this.signal({ kind: 'pickupItem', item: e.baseId }));
    w.bus.on('death', (e) => {
      const m = w.get(e.id);
      if (!m || m.kind !== 'monster' || m.team !== 'monsters') return;
      this.signal({ kind: 'killMonster', monster: e.defId });
      const bossId = m.ai.bossId;
      if (typeof bossId === 'string') this.signal({ kind: 'killBoss', boss: bossId });
      if (w.levelId && this.levelCleared(e.id)) this.signal({ kind: 'clearLevel', level: w.levelId });
    });
  }

  /** No hostile monster left alive in the current level (the dying one excluded). */
  private levelCleared(dyingId: number): boolean {
    for (const e of this.world.entities.values())
      if (e.kind === 'monster' && e.id !== dyingId && e.team === 'monsters' && e.alive && e.life > 0)
        return false;
    return true;
  }

  load(state: QuestStateMap | undefined, acts: ActId[]): void {
    this.state = structuredClone(state ?? {});
    this.acts = acts.length ? [...acts] : [1];
  }

  signal(sig: QuestSignal): void {
    const changes = applyQuestSignal(this.state, DB.quests.values(), sig, this.acts);
    for (const c of changes) {
      this.world.emit({ type: 'questUpdated', questId: c.questId, step: c.step, completed: c.completed });
      if (c.completed) this.complete(c.questId);
    }
  }

  private complete(id: DefId): void {
    const q = DB.quests.get(id);
    const prog = this.state[id];
    if (!q || !prog || prog.rewardClaimed) return;
    prog.rewardClaimed = true;
    const p = this.player();
    if (p) this.pay(p, q.reward);
    for (const line of rewardLines(q.reward))
      this.world.emit({ type: 'toast', textKey: line.key, params: line.params });
    const actQuests = [...DB.quests.values()].filter((x) => x.act === q.act);
    if (actQuests.every((x) => this.state[x.id]?.completed))
      this.world.emit({ type: 'toast', textKey: 'quest.actComplete' });
  }

  private pay(p: PlayerEntity, r: QuestReward): void {
    if (r.skillPoints) p.skillPointsUnspent += r.skillPoints;
    if (r.statPoints) p.statPointsUnspent += r.statPoints;
    if (r.creditz) {
      p.creditz += r.creditz;
      this.world.emit({ type: 'creditzChanged', playerId: p.id, creditz: p.creditz });
    }
    p.statsDirty = true;
  }

  /** Quests of the active acts, in act order. */
  activeQuests(): QuestDef[] {
    return [...DB.quests.values()].filter((q) => this.acts.includes(q.act));
  }

  /** Quest log: every quest of an active act shows with its next step (no hidden "???"). */
  view(currentAct: ActId): QuestLogView {
    const byAct = new Map<ActId, QuestDef[]>();
    for (const q of DB.quests.values()) byAct.set(q.act, [...(byAct.get(q.act) ?? []), q]);
    return {
      currentAct,
      acts: ACTS.map((act) => ({
        act,
        unlocked: this.acts.includes(act) && byAct.has(act),
        quests: (byAct.get(act) ?? []).map((q) => {
          const p = progressOf(this.state, q);
          const step = q.steps[stepIndex(q, p)];
          return {
            id: q.id,
            nameKey: q.name,
            state: p.completed ? ('done' as const) : ('active' as const),
            ...(step ? { stepKey: step.text } : {}),
          };
        }),
      })),
    };
  }
}

function rewardLines(r: QuestReward): { key: string; params: Record<string, number> }[] {
  const out: { key: string; params: Record<string, number> }[] = [];
  if (r.skillPoints) out.push({ key: 'quest.reward.skillPoints', params: { n: r.skillPoints } });
  if (r.statPoints) out.push({ key: 'quest.reward.statPoints', params: { n: r.statPoints } });
  if (r.creditz) out.push({ key: 'quest.reward.creditz', params: { n: r.creditz } });
  return out;
}
