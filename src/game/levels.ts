/**
 * Level lifecycle: generate (or restore) a level, populate objects/NPCs/monsters, move the player
 * between levels. Level state is kept per game like D2: leaving a level parks its entities and
 * coming back restores them.
 */
import { DB, req } from '@/data/db';
import type { LevelDef } from '@/data/schema';
import { hashString, Rng } from '@/core/rng';
import type { DefId, Vec2 } from '@/core/types';
import type { SimWorld } from '@/core/sim/world';
import type { Entity, NpcEntity, ObjectEntity, PlayerEntity } from '@/core/sim/entities';
import type { GeneratedLevel, Placement } from '@/core/world/types';
import { generateLevel } from '@/core/world/mapgen';
import { nearestWalkable } from '@/core/world/collision';
import { spawnLevelMonsters } from '@/core/monsters';
import { computeStats } from '@/core/stats/compute';
import { invalidateActorGrid } from '@/core/sim/systems';

interface ParkedLevel {
  gen: GeneratedLevel;
  entities: Entity[];
}

const OBJECT_KINDS: Partial<Record<Placement['kind'], string>> = {
  waypoint: 'waypoint',
  chest: 'chest',
  stash: 'stash',
  shrine: 'shrine',
};

export class LevelManager {
  private parked = new Map<DefId, ParkedLevel>();
  /** Waypoints activated this game (persisted in the character save). */
  readonly waypoints = new Set<DefId>();

  constructor(
    private world: SimWorld,
    private gameSeed: number,
  ) {}

  /** Forget all level state (new game / back to menu). */
  reset(seed: number): void {
    this.parked.clear();
    this.waypoints.clear();
    this.gameSeed = seed;
  }

  get current(): LevelDef | null {
    return this.world.levelId ? (DB.levels.get(this.world.levelId) ?? null) : null;
  }

  townOf(act: number): DefId {
    for (const l of DB.levels.values()) if (l.act === act && l.isTown) return l.id;
    return 'a1.town';
  }

  /**
   * Switch the world to `levelId`. The player (and its summons) come along; everything else in
   * the old level is parked. `arrive` picks the spawn: an exit leading back to `from`, a waypoint,
   * an explicit position, or the level's playerStart.
   */
  enter(levelId: DefId, arrive: { from?: DefId; at?: 'waypoint' | Vec2 } = {}): { firstVisit: boolean } {
    const w = this.world;
    const player = w.localPlayerId != null ? (w.get(w.localPlayerId) as PlayerEntity | undefined) : undefined;
    const keep = new Set<number>();
    if (player) {
      keep.add(player.id);
      for (const e of w.entities.values())
        if (e.kind === 'monster' && e.ownerId === player.id) keep.add(e.id);
      if (player.mercId != null) keep.add(player.mercId);
    }

    // Park the current level.
    if (w.levelId && w.level) {
      const ents: Entity[] = [];
      for (const e of w.entities.values()) if (!keep.has(e.id) && e.kind !== 'missile') ents.push(e);
      this.parked.set(w.levelId, { gen: w.level, entities: ents });
    }
    for (const id of [...w.entities.keys()]) if (!keep.has(id)) w.entities.delete(id);

    const def = req(DB.levels, levelId, 'level');
    let firstVisit = false;
    const parked = this.parked.get(levelId);
    if (parked) {
      w.level = parked.gen;
      w.levelId = levelId;
      for (const e of parked.entities) w.entities.set(e.id, e);
      this.parked.delete(levelId);
    } else {
      firstVisit = true;
      const seed = (this.gameSeed ^ hashString(levelId)) >>> 0;
      const gen = generateLevel(def, seed);
      w.level = gen;
      w.levelId = levelId;
      this.populate(def, gen, new Rng(seed ^ 0x5eed));
    }

    // Place the party.
    if (player) {
      const pos = this.arrivalPos(arrive);
      player.pos.x = pos.x;
      player.pos.y = pos.y;
      player.path = [];
      player.moveTarget = undefined;
      player.targetId = undefined;
      player.action = undefined;
      let i = 0;
      for (const id of keep) {
        if (id === player.id) continue;
        const e = w.get(id);
        if (!e) continue;
        const a = (i++ / Math.max(1, keep.size - 1)) * Math.PI * 2;
        const p = nearestWalkable(w.level!.map, { x: pos.x + Math.cos(a), y: pos.y + Math.sin(a) }) ?? pos;
        e.pos.x = p.x;
        e.pos.y = p.y;
        if ('path' in e) e.path = [];
      }
    }
    invalidateActorGrid(w);
    if (def.waypoint) this.waypoints.add(levelId);
    w.emit({ type: 'levelEntered', levelId, firstVisit });
    return { firstVisit };
  }

  private arrivalPos(arrive: { from?: DefId; at?: 'waypoint' | Vec2 }): Vec2 {
    const lvl = this.world.level!;
    const find = (pred: (p: Placement) => boolean) => lvl.placements.find(pred)?.pos;
    let pos: Vec2 | undefined;
    if (arrive.at === 'waypoint') pos = find((p) => p.kind === 'waypoint');
    else if (arrive.at) pos = arrive.at;
    else if (arrive.from) pos = find((p) => p.kind === 'exit' && p.ref === arrive.from);
    pos ??= find((p) => p.kind === 'playerStart') ?? { x: lvl.map.width / 2, y: lvl.map.height / 2 };
    // Step off the exit/waypoint itself so we don't immediately re-trigger it.
    const off = nearestWalkable(lvl.map, { x: pos.x + 1.2, y: pos.y + 1.2 });
    return off ?? pos;
  }

  private populate(def: LevelDef, gen: GeneratedLevel, rng: Rng): void {
    const w = this.world;
    for (const p of gen.placements) {
      const objKind = OBJECT_KINDS[p.kind];
      if (objKind) this.addObject(objKind, p.pos, p.data);
      else if (p.kind === 'exit' && p.ref)
        this.addObject('exit', p.pos, { ...(p.data ?? {}), target: p.ref });
      else if (p.kind === 'questObject' && p.ref) this.addObject(p.ref.replace(/^obj\./, ''), p.pos, p.data);
      else if (p.kind === 'npc' && p.ref) this.addNpc(p.ref, p.pos, p.facing ?? Math.PI / 2);
    }
    if (!def.isTown) spawnLevelMonsters(w, def, gen, rng);
  }

  addObject(defId: string, pos: Vec2, data?: ObjectEntity['data']): ObjectEntity {
    const w = this.world;
    const o: ObjectEntity = {
      id: w.allocId(),
      kind: 'object',
      pos: { x: pos.x, y: pos.y },
      facing: 0,
      radius: defId === 'exit' ? 0.9 : 0.6,
      alive: true,
      defId,
      used: false,
      ...(data ? { data } : {}),
    };
    return w.add(o);
  }

  private addNpc(npcId: DefId, pos: Vec2, facing: number): void {
    const def = DB.npcs.get(npcId);
    if (!def) return;
    // Master Yoduh only appears in town once rescued (handled by quests later); keep one copy.
    const w = this.world;
    for (const e of w.entities.values()) if (e.kind === 'npc' && e.defId === npcId) return;
    const stats = computeStats({
      level: 1,
      base: { lifeMax: 100, strength: 10, dexterity: 10, vitality: 10, energy: 10 },
      allocated: { strength: 0, dexterity: 0, vitality: 0, energy: 0 },
      modifiers: [],
      difficulty: w.difficulty,
    });
    const npc: NpcEntity = {
      id: w.allocId(),
      kind: 'npc',
      pos: { x: pos.x, y: pos.y },
      facing,
      radius: 0.4,
      alive: true,
      defId: npcId,
      team: 'neutral',
      level: 1,
      life: stats.lifeMax,
      mana: 0,
      stamina: 0,
      stats,
      mode: 'idle',
      modeTime: 0,
      path: [],
      running: false,
      effects: [],
      buffs: [],
      cooldowns: {},
      statsDirty: false,
      modelId: def.modelId,
    };
    w.add(npc);
  }
}
