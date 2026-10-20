/**
 * Simulation entity model. Plain data objects in a single store (no heavy ECS).
 * Systems in core/ mutate these; render/ and ui/ only READ them.
 *
 * CONTRACT FILE — frozen after Wave 0. Additive (optional) fields only, coordinated by the lead.
 */
import type { ClassId, DefId, Difficulty, EntityId, Team, Vec2 } from '../types';
import type { DerivedStats, Modifier } from '../stats/types';
import type { AttackSpec, CombatantView, StatusEffectSpec } from '../combat/types';
import type { Belt, Equipment, GridContainer, ItemInstance } from '../items/types';
import type { MonsterModifier } from '../../data/schema';

export type EntityKind =
  'player' | 'monster' | 'merc' | 'npc' | 'missile' | 'groundItem' | 'object' | 'remnant' | 'area';

/**
 * Actor animation/action mode. Renderer maps these to animation clips.
 * 'dying' plays the smoke/sparks dissolve, then the entity is removed (a 'remnant' may spawn).
 */
export type ActorMode =
  | 'idle'
  | 'walk'
  | 'run'
  | 'attack'
  | 'cast'
  | 'throw'
  | 'hit'
  | 'block'
  | 'stunned'
  | 'frozen'
  | 'dying'
  | 'dead';

export interface EntityBase {
  id: EntityId;
  kind: EntityKind;
  pos: Vec2;
  /** Facing angle in radians on the sim plane (atan2 convention). */
  facing: number;
  /** Collision radius in tiles. */
  radius: number;
  /** Set false to remove at end of tick. */
  alive: boolean;
}

export interface ActiveEffect {
  spec: StatusEffectSpec;
  remainingSec: number;
  sourceId?: EntityId;
  /** Knockback slide: direction (radians) and remaining tiles to travel. */
  dir?: number;
  distLeft?: number;
}

export interface Buff {
  /** Usually a skill id: 'frostArmor', 'battleOrders', 'rally'. */
  id: string;
  level: number;
  remainingSec: number; // Infinity for auras/passives-as-buffs
  mods: Modifier[];
  sourceId?: EntityId;
}

/** Current action in progress (attack swing, cast), driven by the skills runtime. */
export interface ActionState {
  skillId: DefId;
  targetId?: EntityId;
  targetPos?: Vec2;
  /** Seconds elapsed / total. Effect fires at `fireAt` fraction (D2 "action frame"). */
  elapsed: number;
  duration: number;
  fireAt: number;
  fired: boolean;
  /** For channeled/multi-hit skills (Saber Flurry, Saber Cyclone): repeat count remaining. */
  repeats?: number;
  /** Dual wielding: this swing (or hit of a multi-hit skill) is made with the off-hand weapon. */
  offHand?: boolean;
}

export interface ActorBase extends EntityBase {
  kind: 'player' | 'monster' | 'merc' | 'npc';
  defId: DefId;
  team: Team;
  level: number;
  life: number;
  mana: number;
  stamina: number;
  stats: DerivedStats;
  mode: ActorMode;
  /** Seconds in current mode (renderer uses it to sync animations). */
  modeTime: number;
  /** Movement: current path (tile-center waypoints) and destination. */
  path: Vec2[];
  moveTarget?: Vec2;
  running: boolean;
  /** Entity to attack/interact when in range. */
  targetId?: EntityId;
  action?: ActionState;
  effects: ActiveEffect[];
  buffs: Buff[];
  /** Skill cooldowns: skillId -> seconds remaining. */
  cooldowns: Record<DefId, number>;
  /** Set true when stats need recomputing (gear/buff change). */
  statsDirty: boolean;
  /** Renderer model id. */
  modelId: string;
  /** Who last damaged it (for xp/kill credit). */
  lastHitBy?: EntityId;
}

export interface PlayerEntity extends ActorBase {
  kind: 'player';
  classId: ClassId;
  name: string;
  xp: number;
  creditz: number;
  statPointsUnspent: number;
  skillPointsUnspent: number;
  allocated: { strength: number; dexterity: number; vitality: number; energy: number };
  /** Hard points per skill id. */
  skills: Record<DefId, number>;
  /** Selected skills for left/right click and hotkeys. */
  leftSkill: DefId;
  rightSkill: DefId;
  hotkeys: (DefId | null)[]; // F1..F8
  equipment: Equipment;
  /** Weapon swap (D2 'W'). */
  swap?: Equipment;
  inventory: GridContainer;
  /** Personal stash page (opened from the stash chest in camp). */
  stash?: GridContainer;
  belt: Belt;
  mercId?: EntityId;
  /** Free respecs remaining per difficulty. */
  respecs: Record<Difficulty, number>;
}

export interface MonsterEntity extends ActorBase {
  kind: 'monster';
  rank: 'normal' | 'champion' | 'unique' | 'boss' | 'minion' | 'summon';
  mods: MonsterModifier[];
  /** Display name override for uniques/bosses (NameKey). */
  nameKey?: string;
  /** Pack leader (minions follow). */
  leaderId?: EntityId;
  /** Owner for player summons (Battle Droyd, Holo-Decoy). */
  ownerId?: EntityId;
  /** AI blackboard: free-form state owned by core/ai. */
  ai: Record<string, unknown>;
  /** Spawn point (leash). */
  home: Vec2;
  /** Revivable by Jawwas until this many seconds pass after death. */
  revivable?: boolean;
  /**
   * Skill damage multiplier (monster level x difficulty x rank), the same curve as its physical
   * damage, so Syth lightning and Dooky's nova keep pace on Veteran/Legend. Undefined = 1.
   */
  spellMul?: number;
}

export interface MercEntity extends ActorBase {
  kind: 'merc';
  ownerId: EntityId;
  equipment: Equipment;
  xp: number;
  ai: Record<string, unknown>;
}

export interface NpcEntity extends ActorBase {
  kind: 'npc';
  /** Vendor wares (restocked on each town visit; see core/player/vendor). */
  stock?: GridContainer;
}

export interface MissileEntity extends EntityBase {
  kind: 'missile';
  defId: DefId; // MissileDef id
  ownerId: EntityId;
  team: Team;
  skillId?: DefId;
  skillLevel: number;
  velocity: Vec2;
  traveled: number;
  range: number;
  /** Entities already hit (for pierce). */
  hitIds: EntityId[];
  homingTargetId?: EntityId;
  /** Boomerang missiles (MissileDef.returns): flying back to the owner. */
  returning?: boolean;
  /** Precomputed attack payload so impacts don't need the caster alive. */
  payload: AttackSpec;
  /** Snapshot of caster stats at launch. */
  casterSnapshot?: CombatantView;
}

/** Lingering area effects: Blizzard, Plasma Wall segments, Toxin Cloud, Burning Trail. */
export interface AreaEntity extends EntityBase {
  kind: 'area';
  defId: DefId; // skill id
  ownerId: EntityId;
  team: Team;
  skillLevel: number;
  remainingSec: number;
  tickEverySec: number;
  tickTimer: number;
  payload: AttackSpec;
  casterSnapshot?: CombatantView;
  vfx: string;
}

export interface GroundItemEntity extends EntityBase {
  kind: 'groundItem';
  item: ItemInstance;
  /** Creditz pile amount if item is currency. */
  creditz?: number;
  droppedAtTick: number;
}

export interface ObjectEntity extends EntityBase {
  kind: 'object';
  defId: DefId; // 'chest' | 'waypoint' | 'stash' | 'shrine.*' | 'exit' | 'recallPortal' | quest objects
  used: boolean;
  data?: Record<string, number | string | boolean>;
}

/** Glowing leftover after a monster dissolves (used by Salvage / Scavenge Stim / Jawwa revive). */
export interface RemnantEntity extends EntityBase {
  kind: 'remnant';
  monsterDefId: DefId;
  sourceMonsterId: EntityId;
  remainingSec: number;
  used: boolean;
  droyd: boolean;
}

export type Actor = PlayerEntity | MonsterEntity | MercEntity | NpcEntity;
export type Entity = Actor | MissileEntity | AreaEntity | GroundItemEntity | ObjectEntity | RemnantEntity;

export const isActor = (e: Entity): e is Actor =>
  e.kind === 'player' || e.kind === 'monster' || e.kind === 'merc' || e.kind === 'npc';
