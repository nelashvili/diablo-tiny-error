/**
 * Pure GameEvent -> effect mapping (no Three.js). The VFX system implements EffectSink.
 */
import type { DamageType, Vec2 } from '../../core/types';
import type { GameEvent } from '../../core/sim/events';
import type { WorldView } from '../../core/sim/world';

export interface SpawnOpts {
  radius?: number;
  dir?: number;
  durationSec?: number;
  height?: number;
}

export interface EffectSink {
  spawn(vfxId: string, pos: Vec2, opts?: SpawnOpts): void;
  /** Persistent loot beam tied to a ground-item entity id. */
  startLoot(entityId: number, vfxId: string, pos: Vec2): void;
  stopLoot(entityId: number): void;
  clearLoot(): void;
}

export const IMPACT_IDS: Record<DamageType, string> = {
  physical: 'vfx.impact.physical',
  plasma: 'vfx.impact.plasma',
  cryo: 'vfx.impact.cryo',
  storm: 'vfx.impact.storm',
  toxin: 'vfx.impact.toxin',
  magic: 'vfx.impact.magic',
};

export const LOOT_BEAM_IDS: Record<string, string> = {
  set: 'vfx.loot.set',
  unique: 'vfx.loot.unique',
  rare: 'vfx.loot.rare',
};

const HIT_HEIGHT = 0.9;

export function impactId(dtype: DamageType): string {
  return IMPACT_IDS[dtype] ?? IMPACT_IDS.physical;
}

/** Best guess at a missile's damage type from its payload (physical when unknown). */
export function missileDamageType(view: WorldView, missileId: number): DamageType {
  const m = view.get(missileId);
  if (!m || m.kind !== 'missile') return 'physical';
  const p = m.payload;
  if (p.convert) return p.convert.to;
  if (p.skillDamage) {
    for (const k of Object.keys(p.skillDamage) as DamageType[]) if (k !== 'physical') return k;
  }
  return 'physical';
}

export function mapEvents(events: readonly GameEvent[], view: WorldView, sink: EffectSink): void {
  for (let i = 0; i < events.length; i++) {
    const e = events[i] as GameEvent;
    switch (e.type) {
      case 'damage':
        sink.spawn(impactId(e.dtype), e.pos, { radius: e.crit ? 1.7 : 1, height: HIT_HEIGHT });
        break;
      case 'death':
        sink.spawn(e.droyd ? 'vfx.death.sparks' : 'vfx.death.smoke', e.pos, { height: 0.2 });
        break;
      case 'skillImpact':
        sink.spawn(e.vfx, e.pos, { radius: e.radius });
        break;
      case 'missileHit':
        sink.spawn(impactId(missileDamageType(view, e.missileId)), e.pos, {
          radius: e.targetId === undefined ? 0.9 : 0.6,
          height: HIT_HEIGHT,
        });
        break;
      case 'levelUp': {
        const ent = view.get(e.id);
        if (ent) sink.spawn('vfx.levelup', ent.pos);
        break;
      }
      case 'itemDropped': {
        const id = LOOT_BEAM_IDS[e.quality];
        if (!id) break;
        if (e.quality === 'rare') sink.spawn(id, e.pos, { durationSec: 1.4 });
        else sink.startLoot(e.id, id, e.pos);
        break;
      }
      case 'removed':
        sink.stopLoot(e.id);
        break;
      case 'levelEntered':
        sink.clearLoot();
        break;
      default:
        break;
    }
  }
}
