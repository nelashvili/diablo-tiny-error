/**
 * Data table schemas — the D2 ".txt tables" analog. All game content is plain data
 * conforming to these types. Display names are NEVER literal strings here: they are
 * keys into data/names.ts (NameKey), so the parody names can be swapped in one place.
 *
 * CONTRACT FILE — frozen after Wave 0. Additive changes only, coordinated by the lead.
 */
import type {
  ActId,
  ClassId,
  DamageType,
  DefId,
  Difficulty,
  EquipSlot,
  ElementalType,
  Range,
} from '../core/types';
import type { ClassGrowth, Modifier, StatId } from '../core/stats/types';
import type { StatusEffectSpec } from '../core/combat/types';

/** Key into data/names.ts. */
export type NameKey = string;

// ---------------------------------------------------------------- classes

export interface ClassDef {
  id: ClassId;
  name: NameKey;
  /** D2 starting attributes. */
  start: { strength: number; dexterity: number; vitality: number; energy: number };
  baseLife: number;
  baseMana: number;
  baseStamina: number;
  growth: ClassGrowth;
  /** Exactly 3 trees, in display order. */
  trees: [SkillTreeDef, SkillTreeDef, SkillTreeDef];
  /** Starting gear base ids. */
  startingItems: DefId[];
  /** Name of the resource bar ("Forse" for the Adept, "Energy" otherwise). */
  resourceName: NameKey;
  modelId: string;
}

export interface SkillTreeDef {
  id: string; // e.g. 'yediKnight.saberForms'
  name: NameKey;
}

// ---------------------------------------------------------------- skills

/** Runtime archetype. The skill runtime (core/skills) has one handler per kind; behavior id picks custom code. */
export type SkillKind =
  | 'meleeAttack' // Bash, Frenzy, Twin Strike
  | 'missile' // Plasma Bolt, Charged Shot, javelin throws
  | 'multiMissile' // Spread Shot, Spark Bolts
  | 'nova' // Frost Nova, Storm Nova
  | 'area' // Blizzard, Starfall, Toxin Cloud (ground target)
  | 'beam' // Plasma Stream (Inferno), Lightning
  | 'chain' // Chain Lightning
  | 'wall' // Plasma Wall
  | 'trail' // Burning Trail (Blaze)
  | 'movement' // Forse Leap, Forse Blink, Leap Strike
  | 'whirl' // Saber Cyclone
  | 'buff' // Frost Armor, Rally, Battle Orders, Forse Shield
  | 'aura' // (post-launch Guardian)
  | 'warcry' // Fear Roar, Provoke, Shockwave
  | 'summon' // Battle Droyd, Holo-Decoy, Blastur Turret
  | 'utility' // Salvage, Scavenge Stim, Scan Pulse, Forse Pull
  | 'passive'; // masteries, Dodge, Precision, Cryo Mastery

/**
 * Per-level numeric parameter. Either explicit table (index 0 = skill level 1) or a D2-style
 * piecewise linear growth: value(L) = base + perLevel[bracket] summed over levels. Brackets are
 * levels 2-8, 9-16, 17-22, 23-28, 29+ (D2 rule).
 */
export type LevelScaled =
  number | { table: number[] } | { base: number; perLevel: [number, number, number, number, number] };

export interface SynergyDef {
  /** Skill whose HARD points give the bonus. */
  from: DefId;
  /** % bonus per hard point of `from`. */
  pctPerLevel: number;
  /** What it boosts: a damage type of this skill, or a named param. */
  target: DamageType | 'duration' | 'radius' | 'attackRating' | 'defense' | string;
}

export interface SkillDef {
  id: DefId; // e.g. 'litesaberStrike'
  classId: ClassId;
  tree: string; // SkillTreeDef.id
  name: NameKey;
  /** D2 analog for designers, e.g. "Bash". Not shown to players. */
  d2Analog: string;
  description: NameKey;
  kind: SkillKind;
  /** Optional custom behavior key registered in core/skills/behaviors. */
  behavior?: string;
  /** Required character level: 1, 6, 12, 18, 24 or 30. */
  reqLevel: 1 | 6 | 12 | 18 | 24 | 30;
  prereqs: DefId[];
  /** Grid position in the tree UI (col 0-2, row 0-5 = tier). */
  ui: { col: number; row: number; icon: string };
  maxHardPoints: 20;
  manaCost: LevelScaled;
  cooldownSec?: LevelScaled;
  /** Element used by most damage params. */
  element?: DamageType;
  /** Typed damage, e.g. { plasma: { min, max } } per level. */
  damage?: Partial<Record<DamageType, { min: LevelScaled; max: LevelScaled }>>;
  /** Weapon-based attacks: % damage and AR bonus. */
  weaponDamagePct?: LevelScaled;
  attackRatingPct?: LevelScaled;
  /** Generic named numbers: radius, duration, missiles, pierce, slowPct, defensePct, etc. */
  params?: Record<string, LevelScaled>;
  effects?: StatusEffectSpec[];
  /** Passive/buff/aura stat modifiers per level (value is LevelScaled). */
  mods?: { stat: StatId; op: 'flat' | 'percent'; value: LevelScaled; param?: string }[];
  synergies?: SynergyDef[];
  /** Missile/projectile def id if any. */
  missile?: DefId;
  /** Summon monster def id if any. */
  summon?: DefId;
  /** Usable with which weapon classes (empty/undefined = any). */
  weaponReq?: WeaponClass[];
  /** Can be put on left (primary) button. */
  leftClickable: boolean;
  /** Visual effect key for the renderer's VFX toolkit (render/vfx). */
  vfx: string;
  sfx?: string;
  /** Cast/attack animation to play. */
  anim: 'attack1' | 'attack2' | 'cast' | 'throw' | 'kick' | 'special';
}

export interface MissileDef {
  id: DefId;
  speed: number; // tiles per second
  range: number; // tiles
  radius: number; // collision radius in tiles
  pierce?: boolean;
  /** Explodes on impact with this radius. */
  explodeRadius?: number;
  homing?: boolean;
  vfx: string;
}

// ---------------------------------------------------------------- items

export type WeaponClass =
  | 'litesaber'
  | 'doubleLitesaber'
  | 'vibroAxe'
  | 'shockBaton'
  | 'vibroPike'
  | 'throwingDisc'
  | 'javelin'
  | 'blasturPistol'
  | 'blasturRifle'
  | 'forseStaff'
  | 'kyburFocus';

export type ArmorClass = 'helm' | 'chest' | 'gloves' | 'belt' | 'boots' | 'shield' | 'ring' | 'amulet';

export type ItemCategory =
  'weapon' | 'armor' | 'jewelry' | 'consumable' | 'gem' | 'glyph' | 'quest' | 'currency';

export type ItemTier = 'normal' | 'exceptional' | 'elite';

export interface ItemBaseDef {
  id: DefId;
  name: NameKey;
  category: ItemCategory;
  weaponClass?: WeaponClass;
  armorClass?: ArmorClass;
  tier?: ItemTier;
  /** Upgrade chain: normal -> exceptional -> elite base ids. */
  upgradesTo?: DefId;
  slots: EquipSlot[];
  twoHanded?: boolean;
  /** Inventory size in grid cells (D2 style). */
  size: { w: number; h: number };
  /** Base item level / quality level (D2 qlvl). */
  qlvl: number;
  req: { level?: number; strength?: number; dexterity?: number };
  damage?: { min: number; max: number };
  /** Base attacks per second for weapons. */
  speed?: number;
  /** Melee reach in tiles. */
  range?: number;
  defense?: Range;
  block?: number;
  durability?: number;
  maxSockets: number;
  /** Class-specific item (gets class skill affixes). */
  classOnly?: ClassId;
  /** Sell value base, in Creditz. */
  cost: number;
  /** Consumables: what it does. */
  use?: {
    kind: 'heal' | 'mana' | 'rejuv' | 'recall' | 'identify' | 'stamina' | 'antidote' | 'thaw';
    amount?: number;
    durationSec?: number;
  };
  stackable?: number;
  /** Visual model for drops & equipped attachment. */
  modelId: string;
  icon: string;
}

/** A D2 MagicPrefix/MagicSuffix row. */
export interface AffixDef {
  id: DefId;
  kind: 'prefix' | 'suffix';
  /** e.g. "Blazing" / "of the Wookie" — NameKey. */
  name: NameKey;
  /** Affix level (alvl). Item level must be >= alvl. */
  level: number;
  maxLevel?: number;
  /** Mutually exclusive group (only one affix per group per item). */
  group: string;
  rare: boolean; // allowed on rares
  frequency: number;
  /** Item types it can spawn on. */
  itemTypes: (WeaponClass | ArmorClass | 'weapon' | 'armor' | 'jewelry' | 'any')[];
  classOnly?: ClassId;
  mods: { stat: StatId; op: 'flat' | 'percent'; min: number; max: number; param?: string }[];
}

export interface UniqueDef {
  id: DefId;
  name: NameKey;
  base: DefId;
  level: number; // ilvl required
  reqLevel: number;
  rarity: number;
  mods: { stat: StatId; op: 'flat' | 'percent'; min: number; max: number; param?: string }[];
}

export interface SetDef {
  id: DefId;
  name: NameKey;
  items: { id: DefId; name: NameKey; base: DefId; mods: UniqueDef['mods']; reqLevel: number }[];
  /** Partial set bonuses keyed by number of items worn. */
  bonuses: Record<number, UniqueDef['mods']>;
}

export interface GemDef {
  id: DefId; // e.g. 'kybur.red.flawless'
  name: NameKey;
  /** Mods when socketed into weapon / armor(helm+chest) / shield. */
  weapon: Modifier[];
  armor: Modifier[];
  shield: Modifier[];
}

// ---------------------------------------------------------------- loot

/** D2 TreasureClass row. Entries are item base ids, other TC ids, or 'nodrop'/'creditz'. */
export interface TreasureClassDef {
  id: DefId;
  picks: number;
  noDrop: number; // weight
  entries: { ref: DefId | 'creditz'; weight: number }[];
  /** Quality ratios like D2 (unique/set/rare/magic modifiers). */
  quality?: { unique: number; set: number; rare: number; magic: number };
}

// ---------------------------------------------------------------- monsters

export type AiKind =
  | 'melee'
  | 'ranged'
  | 'caster'
  | 'reviver' // Jawwa: revives fallen droyds (D2 Fallen Shaman)
  | 'swarm'
  | 'charger'
  | 'summoner'
  | 'boss'
  | 'minion'
  | 'npc';

export type MonsterModifier =
  | 'extraStrong'
  | 'extraFast'
  | 'cursed'
  | 'magicResistant'
  | 'plasmaEnchanted'
  | 'stormEnchanted'
  | 'cryoEnchanted'
  | 'multishot'
  | 'stoneSkin'
  | 'teleport'
  | 'manaBurn'
  | 'auraEnchanted'
  | 'spectralHit';

export interface MonsterDef {
  id: DefId;
  name: NameKey;
  family: string; // 'normtrooper' | 'battleDroyd' | 'jawwa' ...
  modelId: string;
  ai: AiKind;
  /** Behavior script key for bosses/special AI. */
  behavior?: string;
  /** Monster level per difficulty is set by the area; these are per-level scalars like D2 MonStats. */
  life: Range; // at level 1, scaled by level tables
  defense: number;
  attackRating: number;
  damage: Range;
  /** Speed in tiles/sec. */
  walkSpeed: number;
  runSpeed?: number;
  attackRange: number; // tiles
  aggroRange: number;
  res: Partial<Record<ElementalType | 'physical' | 'magic', number>>;
  /** Per-difficulty resist overrides (D2 MonStats N/H). */
  resByDifficulty?: Partial<
    Record<Difficulty, Partial<Record<ElementalType | 'physical' | 'magic', number>>>
  >;
  xp: number; // base xp at level 1
  treasure: { normal: DefId; champion?: DefId; unique?: DefId; quest?: DefId };
  skills?: { skill: DefId; level: number; chance: number }[];
  missile?: DefId;
  flags: { droyd?: boolean; boss?: boolean; noRemnant?: boolean; canBeChampion?: boolean };
  /** Pack size range when spawned normally. */
  pack: Range;
  /** Optional minions spawned with it. */
  minions?: DefId[];
  scale?: number; // render scale
}

/** Named "superunique" bosses (D2 SuperUniques / act bosses). */
export interface BossDef {
  id: DefId;
  monster: DefId;
  name: NameKey;
  mods: MonsterModifier[];
  minions?: { monster: DefId; count: Range };
  /** Fixed level per difficulty. */
  level: Record<Difficulty, number>;
  treasure: Record<Difficulty, DefId>;
  /** Intro line shown on aggro. */
  intro?: NameKey;
}

// ---------------------------------------------------------------- world

export type LevelGenKind = 'outdoor' | 'maze' | 'preset' | 'town';

export interface LevelDef {
  id: DefId; // e.g. 'a1.mossfields'
  act: ActId;
  name: NameKey;
  gen: LevelGenKind;
  /** Generator tuning (size, room counts, tileset id, preset ids...). */
  genParams: Record<string, number | string | boolean | string[]>;
  tileset: string;
  /** Monster level per difficulty (D2 Levels.txt MonLvl). */
  monsterLevel: Record<Difficulty, number>;
  monsters: DefId[];
  density: number; // packs per 100 walkable tiles
  champions: Range;
  uniques: Range;
  waypoint: boolean;
  /** Exits to other levels. */
  links: { to: DefId; kind: 'edge' | 'stairsDown' | 'stairsUp' | 'portal' | 'door' }[];
  music?: string;
  ambientLight?: string; // color grade key
  /** Optional fixed bosses / superuniques placed here. */
  bosses?: DefId[];
  isTown?: boolean;
}

export interface NpcDef {
  id: DefId;
  name: NameKey;
  modelId: string;
  roles: ('vendor' | 'smith' | 'healer' | 'respec' | 'mercs' | 'quest' | 'gamble' | 'stash' | 'waypoint')[];
  vendorTable?: DefId;
  dialogue: NameKey[];
}

export interface QuestDef {
  id: DefId; // e.g. 'a1q1'
  act: ActId;
  name: NameKey;
  /** Ordered steps; the quest engine advances on matching game events. */
  steps: QuestStepDef[];
  reward: QuestReward;
}

export interface QuestStepDef {
  id: string;
  text: NameKey;
  /** Completes when this event happens. */
  on:
    | { event: 'enterLevel'; level: DefId }
    | { event: 'killMonster'; monster: DefId; count?: number }
    | { event: 'killBoss'; boss: DefId }
    | { event: 'clearLevel'; level: DefId }
    | { event: 'pickupItem'; item: DefId }
    | { event: 'talkTo'; npc: DefId }
    | { event: 'useObject'; object: DefId };
}

export interface QuestReward {
  skillPoints?: number;
  statPoints?: number;
  lifeMax?: number;
  resistAll?: number;
  item?: DefId;
  creditz?: number;
  imbue?: boolean;
  socket?: boolean;
  respec?: boolean;
  unlocksAct?: ActId;
}

/** Act hirelings (D2 Hireling.txt). */
export interface MercDef {
  id: DefId;
  act: ActId;
  name: NameKey;
  monster: DefId;
  skills: { skill: DefId; levelPerLevels: number }[];
  costBase: number;
}
