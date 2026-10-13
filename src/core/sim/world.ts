/**
 * The simulation world: entity store + current level + clock + event bus + command queue.
 * Owned by the lead (integration). Systems receive a SimWorld and mutate it.
 *
 * CONTRACT FILE — frozen after Wave 0. Additive changes only, coordinated by the lead.
 */
import type { DefId, Difficulty, EntityId } from '../types';
import { Rng } from '../rng';
import { EventBus, type GameEvent } from './events';
import type { Command } from './commands';
import type { Entity } from './entities';
import type { GeneratedLevel } from '../world/types';

/** A system runs once per fixed tick, in registration order. */
export interface SimSystem {
  name: string;
  update(world: SimWorld, dt: number): void;
}

/** Read-only view that render/ and ui/ use. Never mutate through it. */
export interface WorldView {
  readonly tick: number;
  readonly time: number;
  readonly difficulty: Difficulty;
  readonly level: GeneratedLevel | null;
  readonly localPlayerId: EntityId | null;
  readonly paused: boolean;
  get(id: EntityId): Readonly<Entity> | undefined;
  all(): Iterable<Readonly<Entity>>;
  /** Events emitted during the most recent tick(s) not yet drained by the frame. */
  readonly frameEvents: readonly GameEvent[];
}

export class SimWorld implements WorldView {
  tick = 0;
  time = 0;
  paused = false;
  difficulty: Difficulty = 'normal';
  level: GeneratedLevel | null = null;
  levelId: DefId | null = null;
  localPlayerId: EntityId | null = null;

  readonly entities = new Map<EntityId, Entity>();
  readonly bus = new EventBus();
  readonly commands: Command[] = [];
  /** Separate streams so loot rolls don't change map gen etc. */
  rng: Rng;
  lootRng: Rng;
  combatRng: Rng;

  frameEvents: GameEvent[] = [];
  private nextId = 1;

  constructor(seed: number) {
    this.rng = new Rng(seed);
    this.lootRng = this.rng.fork('loot');
    this.combatRng = this.rng.fork('combat');
    this.bus.onAny((e) => this.frameEvents.push(e));
  }

  allocId(): EntityId {
    return this.nextId++;
  }

  add<E extends Entity>(e: E): E {
    this.entities.set(e.id, e);
    this.bus.emit({ type: 'spawned', id: e.id });
    return e;
  }

  get(id: EntityId): Entity | undefined {
    return this.entities.get(id);
  }

  all(): IterableIterator<Entity> {
    return this.entities.values();
  }

  /** Remove entities flagged alive=false. Called by the loop at tick end. */
  sweep(): void {
    for (const [id, e] of this.entities) {
      if (!e.alive) {
        this.entities.delete(id);
        this.bus.emit({ type: 'removed', id });
      }
    }
  }

  emit(e: GameEvent): void {
    this.bus.emit(e);
  }

  drainFrameEvents(): GameEvent[] {
    const ev = this.frameEvents;
    this.frameEvents = [];
    return ev;
  }
}
