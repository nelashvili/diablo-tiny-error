/**
 * Game events emitted by the simulation. Consumers: renderer (VFX/anim), audio, UI (toasts,
 * damage numbers), quest engine, save system. Emitted synchronously during the tick, and also
 * collected per tick so the renderer can consume them in its frame.
 *
 * CONTRACT FILE — frozen after Wave 0. Additive changes only, coordinated by the lead.
 */
import type { DamageType, DefId, EntityId, Vec2 } from '../types';
import type { AttackOutcome } from '../combat/types';

export type GameEvent =
  | { type: 'spawned'; id: EntityId }
  | { type: 'removed'; id: EntityId }
  | {
      type: 'damage';
      targetId: EntityId;
      sourceId?: EntityId;
      amount: number;
      dtype: DamageType;
      crit: boolean;
      pos: Vec2;
    }
  | { type: 'attackResult'; attackerId: EntityId; targetId: EntityId; outcome: AttackOutcome }
  | { type: 'heal'; targetId: EntityId; amount: number }
  | { type: 'death'; id: EntityId; killerId?: EntityId; pos: Vec2; droyd: boolean; defId: DefId }
  | { type: 'playerDefeated'; id: EntityId }
  | { type: 'skillCast'; casterId: EntityId; skillId: DefId; targetPos?: Vec2; targetId?: EntityId }
  | { type: 'skillImpact'; skillId: DefId; pos: Vec2; radius?: number; vfx: string }
  | { type: 'missileHit'; missileId: EntityId; pos: Vec2; targetId?: EntityId }
  | { type: 'levelUp'; id: EntityId; level: number }
  | { type: 'xpGained'; id: EntityId; amount: number }
  | { type: 'itemDropped'; id: EntityId; quality: string; pos: Vec2 }
  | { type: 'itemPickedUp'; playerId: EntityId; baseId: DefId; creditz?: number }
  | { type: 'creditzChanged'; playerId: EntityId; creditz: number }
  | { type: 'inventoryChanged'; playerId: EntityId }
  | { type: 'statsChanged'; id: EntityId }
  | { type: 'levelEntered'; levelId: DefId; firstVisit: boolean }
  | { type: 'waypointActivated'; levelId: DefId }
  | { type: 'questUpdated'; questId: DefId; step: string; completed: boolean }
  | { type: 'dialogue'; npcId: EntityId; lineKey: string }
  | { type: 'bossIntro'; id: EntityId; lineKey?: string }
  | { type: 'shrineUsed'; id: EntityId; shrine: DefId }
  | { type: 'objectUsed'; id: EntityId; defId: DefId }
  | { type: 'toast'; textKey: string; params?: Record<string, string | number> }
  | { type: 'saveRequested'; reason: 'levelChange' | 'interval' | 'manual' | 'quit' };

export type GameEventType = GameEvent['type'];
type Handler<T extends GameEventType> = (e: Extract<GameEvent, { type: T }>) => void;

/** Tiny typed event bus. */
export class EventBus {
  private handlers = new Map<GameEventType, Set<(e: GameEvent) => void>>();
  private anyHandlers = new Set<(e: GameEvent) => void>();

  on<T extends GameEventType>(type: T, h: Handler<T>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(h as (e: GameEvent) => void);
    return () => set.delete(h as (e: GameEvent) => void);
  }

  onAny(h: (e: GameEvent) => void): () => void {
    this.anyHandlers.add(h);
    return () => this.anyHandlers.delete(h);
  }

  emit(e: GameEvent): void {
    this.handlers.get(e.type)?.forEach((h) => h(e));
    this.anyHandlers.forEach((h) => h(e));
  }

  clear(): void {
    this.handlers.clear();
    this.anyHandlers.clear();
  }
}
