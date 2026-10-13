/**
 * Model catalog. Every model id used in data/ resolves here via `getModelEntry`.
 *
 * Scale conventions (1 sim tile = 1 world unit):
 *  - rigged humanoids: `scale` makes the character ~1.6 tiles tall (KayKit rigs are ~2.1 units, scale 0.75).
 *  - tiles: `scale` makes one floor/wall piece fit a 1x1 tile footprint (KayKit/Kenney-cave pieces are 4x4, scale 0.25).
 *  - props/objects: scale picks a pleasing in-game size (trees ~3 tiles, crates ~1 tile).
 *  - item.*: size when carried/attached (blasters ~0.8 tile long); ground drops may scale up in the renderer.
 *  - Tinting: several monsters share one mesh (e.g. hooded rogue = jawwa); `accent` is the suggested tint.
 * Clip keys: ActorMode names (idle, walk, run, attack, cast, throw, hit, block, stunned, frozen, dying, dead)
 * plus extras (attack2, interact, pickup, cheer). Values are clip names inside the .glb.
 */
import type { ModelEntry } from '../types';

type Ph = ModelEntry['placeholder'];
const ph = (shape: Ph['shape'], color: number, height: number, radius: number): Ph => ({
  shape,
  color,
  height,
  radius,
});

export const DEFAULT_PLACEHOLDER: Ph = ph('box', 0xff00ff, 1, 0.4);

const M = (file: string) => `/assets/models/${file}.glb`;

// ---- clip maps -------------------------------------------------------------------------------------
const KAY_CLIPS: NonNullable<ModelEntry['clips']> = {
  idle: 'Idle',
  walk: 'Walking_A',
  run: 'Running_A',
  attack: '1H_Melee_Attack_Slice_Horizontal',
  attack2: '1H_Melee_Attack_Chop',
  cast: 'Spellcast_Shoot',
  throw: '1H_Ranged_Shoot',
  hit: 'Hit_A',
  block: 'Block',
  stunned: 'Hit_A',
  frozen: 'Idle',
  dying: 'Death_A',
  dead: 'Death_A',
  interact: 'Interact',
  pickup: 'PickUp',
  cheer: 'Cheer',
};
const KAY_BONES = { rightHand: 'handslot.r', leftHand: 'handslot.l', head: 'head' };
const ROBOT_CLIPS: NonNullable<ModelEntry['clips']> = {
  idle: 'Idle',
  walk: 'Walking',
  run: 'Running',
  attack: 'Punch',
  attack2: 'Punch',
  cast: 'Wave',
  throw: 'Punch',
  hit: 'No',
  block: 'Yes',
  stunned: 'No',
  frozen: 'Idle',
  dying: 'Death',
  dead: 'Death',
  interact: 'ThumbsUp',
  cheer: 'Dance',
};
const ROBOT_BONES = { rightHand: 'Hand.R', leftHand: 'Hand.L', head: 'Head' };
const QM_CLIPS: NonNullable<ModelEntry['clips']> = {
  idle: 'Idle',
  walk: 'Walk',
  run: 'Run',
  attack: 'Punch',
  attack2: 'Weapon',
  cast: 'Weapon',
  throw: 'Punch',
  hit: 'HitReact',
  block: 'HitReact',
  stunned: 'HitReact',
  frozen: 'Idle',
  dying: 'Death',
  dead: 'Death',
};
const QM_BONES = { rightHand: 'LowerArm.R', leftHand: 'LowerArm.L', head: 'Head' };

const kay = (
  id: string,
  file: string,
  color: number,
  accent?: number,
  scale = 0.75,
  extra: Partial<ModelEntry> = {},
): ModelEntry => ({
  id,
  url: M(file),
  scale,
  clips: { ...KAY_CLIPS },
  bones: { ...KAY_BONES },
  placeholder: ph('capsule', color, 1.6, 0.3),
  accent,
  ...extra,
});

const stat = (
  id: string,
  file: string | null,
  scale: number,
  placeholder: Ph,
  accent?: number,
): ModelEntry => ({ id, url: file ? M(file) : null, scale, placeholder, accent });

// ---- heroes, npcs & monsters -----------------------------------------------------------------------
const ACTORS: ModelEntry[] = [
  kay('hero.yediKnight', 'heroes/knight', 0xd9c8a0, 0x4fc3ff),
  kay('hero.bountyHuntur', 'heroes/rogue', 0x6b7d5c, 0xff8a3d),
  kay('hero.forseAdept', 'heroes/mage', 0x7b5ea7, 0xb36bff),
  kay('npc.default', 'monsters/barbarian', 0xb89c6a, undefined, 0.72),

  // Act I monsters (mesh re-use + suggested tint in `accent`)
  {
    id: 'mon.scrapDroyd',
    url: M('monsters/robot'),
    scale: 0.32,
    clips: { ...ROBOT_CLIPS },
    bones: { ...ROBOT_BONES },
    placeholder: ph('box', 0x8a8f94, 1.3, 0.4),
    accent: 0xff6a1a, // eye glow; tint body rusty
  },
  {
    id: 'mon.probeDroyd',
    url: M('monsters/robot'),
    scale: 0.2,
    clips: { ...ROBOT_CLIPS },
    bones: { ...ROBOT_BONES },
    placeholder: ph('sphere', 0x2c2f36, 0.9, 0.3),
    accent: 0xff2222,
  },
  kay('mon.jawwa', 'monsters/rogueHooded', 0x7a5a36, 0xffd23f, 0.6),
  kay('mon.tuskinRaider', 'monsters/barbarian', 0xc2a878, undefined, 0.78),
  kay('mon.normtrooper', 'monsters/skeletonMinion', 0xe8e8ee, 0x9fd0ff, 0.75),
  {
    id: 'mon.mossBeast',
    url: M('monsters/orc'),
    scale: 0.5,
    clips: { ...QM_CLIPS },
    bones: { ...QM_BONES },
    placeholder: ph('capsule', 0x4f7a3a, 1.5, 0.5),
    accent: 0x9be36a, // tint toward moss green
  },
  kay('mon.nightsistah', 'heroes/mage', 0x3a2a55, 0xc040ff, 0.75),
  kay('mon.shadowWraith', 'monsters/skeletonMage', 0x2a2a3a, 0x8866ff, 0.75),
  // Count Dooky: robed, hooded Syth lord (PLAN §2: no demon imagery) — larger, dark crimson, red litesaber
  kay('mon.countDooky', 'monsters/rogueHooded', 0x2a1a24, 0xff2a2a, 0.95),
  // generic fallbacks
  {
    id: 'mon.default',
    url: M('monsters/orc'),
    scale: 0.5,
    clips: { ...QM_CLIPS },
    bones: { ...QM_BONES },
    placeholder: ph('capsule', 0x8a4a4a, 1.5, 0.45),
  },
];

// ---- objects ----------------------------------------------------------------------------------------
const OBJECTS: ModelEntry[] = [
  stat('obj.waypoint', 'objects/waypoint', 0.9, ph('cylinder', 0x4fc3ff, 0.25, 0.9), 0x4fc3ff),
  stat('obj.chest', 'objects/chest', 0.6, ph('box', 0x8a5a2b, 0.8, 0.5), 0xffd23f),
  stat('obj.stash', 'objects/stash', 1.4, ph('box', 0x6d7b88, 1.3, 0.45), 0x4fc3ff),
  stat('obj.portal', 'objects/portal', 2.2, ph('cylinder', 0x66aaff, 1.8, 0.8), 0x66aaff),
  stat('obj.shrine', 'objects/shrine', 1.2, ph('cone', 0xb36bff, 1.0, 0.5), 0xb36bff),
  stat('obj.exit', null, 1, ph('cylinder', 0x66ffcc, 0.06, 0.8), 0x66ffcc),
  stat('obj.default', null, 1, ph('box', 0xb0a080, 0.8, 0.4)),
];

// ---- props ------------------------------------------------------------------------------------------
const PROPS: ModelEntry[] = [
  stat('prop.tree.pine', 'props/treePine', 2.2, ph('cone', 0x2f6b3a, 3.3, 0.5)),
  stat('prop.tree.pineRound', 'props/treePineRound', 2.4, ph('cone', 0x3a7a42, 3.0, 0.6)),
  stat('prop.tree.oak', 'props/treeOak', 2.6, ph('sphere', 0x4a8a3a, 3.1, 0.8)),
  stat('prop.tree.fat', 'props/treeFat', 2.6, ph('sphere', 0x55904a, 3.0, 0.9)),
  stat('prop.tree.dead', 'props/treeDead', 2.2, ph('cylinder', 0x6a5a48, 3.2, 0.25)),
  stat('prop.stump', 'props/stump', 2.2, ph('cylinder', 0x7a5a38, 0.6, 0.4)),
  stat('prop.log', 'props/log', 2, ph('cylinder', 0x7a5a38, 0.4, 0.2)),
  stat('prop.rock.large', 'props/rockLarge', 1.8, ph('sphere', 0x8a8a8a, 0.9, 0.9)),
  stat('prop.rock.small', 'props/rockSmall', 1.6, ph('sphere', 0x9a9a9a, 0.4, 0.4)),
  stat('prop.rock.tall', 'props/rockTall', 1.8, ph('cone', 0x7d7d85, 1.8, 0.7)),
  stat('prop.stone.tall', 'props/stoneTall', 1.8, ph('cone', 0x8d8d95, 1.6, 0.6)),
  stat('prop.bush', 'props/bush', 2, ph('sphere', 0x3f8a3f, 0.6, 0.5)),
  stat('prop.bush.large', 'props/bushLarge', 2.4, ph('sphere', 0x3f8a3f, 0.8, 0.7)),
  stat('prop.grass', 'props/grass', 2, ph('cone', 0x5aa04a, 0.5, 0.4)),
  stat('prop.flowers', 'props/flowers', 2.2, ph('sphere', 0xd05a7a, 0.4, 0.2)),
  stat('prop.mushrooms', 'props/mushrooms', 2.2, ph('sphere', 0xc0443a, 0.4, 0.3)),
  stat('prop.campfire', 'props/campfire', 2.2, ph('cylinder', 0xff8a2a, 0.5, 0.4), 0xff8a2a),
  stat('prop.tent', 'props/tent', 2.2, ph('cone', 0xb89c6a, 1.4, 1.0)),
  stat('prop.tent.large', 'props/tentLarge', 2.4, ph('cone', 0xa88c5a, 1.6, 1.3)),
  stat('prop.fence', 'props/fence', 1.5, ph('box', 0x8a6a40, 0.6, 0.5)),
  stat('prop.sign', 'props/sign', 2.2, ph('box', 0x8a6a40, 0.9, 0.2)),
  stat('prop.ruin.column', 'props/ruinColumn', 2.4, ph('cylinder', 0xa8a090, 1.7, 0.4)),
  stat('prop.obelisk', 'props/obelisk', 2.4, ph('cone', 0x7a7a88, 2.1, 0.4)),
  stat('prop.statue.head', 'props/statueHead', 1.6, ph('sphere', 0x9a9a8a, 1.6, 0.8)),
  stat('prop.crystal', 'props/crystal', 1.4, ph('cone', 0x66ddff, 0.5, 0.5), 0x66ddff),
  stat('prop.crystal.large', 'props/crystalLarge', 1.8, ph('cone', 0x66ddff, 1.0, 0.8), 0x66ddff),
  stat('prop.bones', 'props/bones', 1.4, ph('box', 0xe8e0c8, 0.3, 0.6)),
  stat('prop.rubble', 'props/rubble', 0.2, ph('box', 0x8a8070, 0.7, 1.2)),
  stat('prop.rubble.half', 'props/rubbleHalf', 0.2, ph('box', 0x8a8070, 0.7, 0.8)),
  stat('prop.barrel', 'props/barrel', 0.4, ph('cylinder', 0x7a5a38, 0.8, 0.35)),
  stat('prop.barrel.small', 'props/barrelSmall', 0.5, ph('cylinder', 0x7a5a38, 0.5, 0.25)),
  stat('prop.crate', 'props/crate', 0.5, ph('box', 0x9a7a4a, 0.75, 0.4)),
  stat('prop.crates', 'props/cratesStacked', 0.5, ph('box', 0x9a7a4a, 1.1, 0.55)),
  stat('prop.pillar', 'props/pillar', 0.45, ph('cylinder', 0xa8a090, 1.8, 0.45)),
  stat('prop.column', 'props/column', 0.8, ph('cylinder', 0xa8a090, 1.1, 0.3)),
  stat('prop.banner', 'props/banner', 0.5, ph('box', 0xaa2a2a, 1.6, 0.3)),
  stat('prop.torch', 'props/torch', 0.9, ph('cylinder', 0xff9a3a, 1.0, 0.1), 0xff9a3a),
  stat('prop.torch.wall', 'props/torchWall', 0.9, ph('cylinder', 0xff9a3a, 0.9, 0.1), 0xff9a3a),
  stat('prop.brazier', 'props/brazier', 2.4, ph('cylinder', 0xff8a2a, 0.5, 0.3), 0xff8a2a),
  stat('prop.coffin', 'props/coffin', 1.8, ph('box', 0x5a4a3a, 0.5, 0.5)),
  stat('prop.cargo', 'props/cargo', 1.2, ph('box', 0x7a8a9a, 1.2, 0.6)),
  stat('prop.containers', 'props/containers', 2.4, ph('box', 0x7a8a9a, 0.5, 0.6)),
  stat('prop.cargoDepot', 'props/cargoDepot', 1, ph('box', 0x8a949e, 1.5, 1.2)),
  stat('prop.baseModule', 'props/baseModule', 1, ph('box', 0x9aa4ae, 1.6, 1.3)),
  stat('prop.garage', 'props/garage', 1, ph('box', 0x9aa4ae, 1.4, 1.3)),
  stat('prop.solarPanel', 'props/solarPanel', 1.8, ph('box', 0x3a5a8a, 0.7, 0.6)),
  stat('prop.windTurbine', 'props/windTurbine', 1.6, ph('cylinder', 0xd0d4d8, 2.3, 0.3)),
  stat('prop.spaceTruck', 'props/spaceTruck', 3, ph('box', 0xc0804a, 1.5, 0.9)),
  stat('prop.lander', 'props/lander', 1.2, ph('cone', 0xa8b0b8, 1.4, 0.8)),
  stat('prop.drill', 'props/drill', 1, ph('cylinder', 0x8a8f94, 2, 0.8)),
  stat('prop.satelliteDish', 'props/satelliteDish', 2.4, ph('cone', 0xc0c4c8, 1.5, 0.8)),
  stat('prop.rover', 'props/rover', 3, ph('box', 0xa0a4a8, 1.1, 0.5)),
  stat('prop.generator', 'props/generator', 2, ph('box', 0x6a7078, 0.8, 0.6)),
  stat('prop.barrelsTech', 'props/barrelsTech', 2.4, ph('cylinder', 0x6a7078, 0.9, 0.6)),
  stat('prop.turret', 'props/turret', 1.8, ph('cylinder', 0x7a8088, 1.6, 0.5)),
  stat('prop.wreck', 'props/wreck', 1.5, ph('box', 0x6a6a72, 1.2, 1.8)),
  stat('prop.speeder', 'props/speeder', 1.5, ph('box', 0x8a8a94, 1.2, 1.6)),
  stat('prop.default', null, 1, ph('box', 0x9a9a9a, 0.8, 0.4)),
];

// ---- tiles ------------------------------------------------------------------------------------------
type Kind = 'floor' | 'wall' | 'water' | 'road' | 'grass' | 'rock';
const TILE_COLORS: Record<string, Record<Kind, number>> = {
  forest: {
    floor: 0x5a7a3a,
    wall: 0x6a6a5a,
    water: 0x3a6a9a,
    road: 0x9a8a6a,
    grass: 0x4f8a3a,
    rock: 0x7a7a72,
  },
  cave: { floor: 0x4a4540, wall: 0x35322e, water: 0x2f4f6a, road: 0x5a5248, grass: 0x3a4a30, rock: 0x5a5650 },
  temple: {
    floor: 0x8a8272,
    wall: 0x6a6458,
    water: 0x3a5a7a,
    road: 0x9a9280,
    grass: 0x6a7a4a,
    rock: 0x7a7468,
  },
  town: { floor: 0xb8a078, wall: 0xa08a68, water: 0x3a6a8a, road: 0xc8b088, grass: 0x8a9a5a, rock: 0x9a8a70 },
};
// [file, scale] per tileset/kind
const TILE_FILES: Record<string, Record<Kind, [string, number]>> = {
  forest: {
    floor: ['tiles/grassTile', 1],
    wall: ['tiles/cliffBlock', 1],
    water: ['tiles/riverTile', 1],
    road: ['tiles/pathTile', 1],
    grass: ['tiles/grassTile', 1],
    rock: ['props/rockLarge', 1.4],
  },
  cave: {
    floor: ['tiles/caveFloor', 0.25],
    wall: ['tiles/caveWall', 0.25],
    water: ['tiles/riverTile', 1],
    road: ['tiles/dirtFloor', 0.25],
    grass: ['tiles/dirtWeeds', 0.5],
    rock: ['props/rockTall', 1.4],
  },
  temple: {
    floor: ['tiles/templeFloor', 0.25],
    wall: ['tiles/templeWall', 0.25],
    water: ['tiles/riverTile', 1],
    road: ['tiles/templeFloorRocks', 0.25],
    grass: ['tiles/templeFloorWeeds', 0.5],
    rock: ['props/rubble', 0.2],
  },
  town: {
    floor: ['tiles/stationFloor', 1],
    wall: ['tiles/stationWall', 1],
    water: ['tiles/riverTile', 1],
    road: ['tiles/roadStraight', 1],
    grass: ['tiles/grassTile', 1],
    rock: ['props/rockLarge', 1.4],
  },
};
const KIND_HEIGHT: Record<Kind, number> = {
  floor: 0.1,
  wall: 1.2,
  water: 0.05,
  road: 0.1,
  grass: 0.1,
  rock: 0.8,
};

const TILES: ModelEntry[] = [];
for (const [ts, kinds] of Object.entries(TILE_FILES)) {
  for (const [kind, [file, scale]] of Object.entries(kinds) as [Kind, [string, number]][]) {
    TILES.push(
      stat(
        `tile.endoor.${ts}.${kind}`,
        file,
        scale,
        ph('box', TILE_COLORS[ts]?.[kind] ?? 0x777777, KIND_HEIGHT[kind], 0.5),
        kind === 'water' ? 0x66aaff : undefined,
      ),
    );
  }
}
TILES.push(stat('tile.default', null, 1, ph('box', 0x777777, 0.1, 0.5)));

// ---- items (attached / ground models) ---------------------------------------------------------------
const ITEMS: ModelEntry[] = [
  stat('item.default', null, 1, ph('box', 0xc8b060, 0.3, 0.2)),
  stat('item.blastur', 'items/blaster-a', 1, ph('box', 0x5a5f66, 0.25, 0.4), 0xff5a3a),
  stat('item.blastur.pistol', 'items/blaster-b', 1, ph('box', 0x5a5f66, 0.2, 0.25), 0xff5a3a),
  stat('item.blastur.compact', 'items/blaster-c', 1, ph('box', 0x5a5f66, 0.2, 0.25), 0xff5a3a),
  stat('item.blastur.carbine', 'items/blaster-d', 1, ph('box', 0x5a5f66, 0.25, 0.45), 0xff5a3a),
  stat('item.blastur.rifle', 'items/blaster-e', 1, ph('box', 0x5a5f66, 0.25, 0.7), 0xff5a3a),
  stat('item.blastur.heavy', 'items/blaster-f', 1, ph('box', 0x4a4f56, 0.3, 0.65), 0xff5a3a),
  stat('item.blastur.smg', 'items/blaster-i', 1, ph('box', 0x5a5f66, 0.22, 0.3), 0xff5a3a),
  stat('item.blastur.sniper', 'items/sniper', 0.8, ph('box', 0x4a4f56, 0.25, 0.8), 0xff5a3a),
  stat('item.blastur.a', 'items/blaster-a', 1, ph('box', 0x5a5f66, 0.25, 0.4), 0xff5a3a),
  stat('item.blastur.g', 'items/blaster-g', 1, ph('box', 0x5a5f66, 0.25, 0.4), 0xff5a3a),
  stat('item.blastur.h', 'items/blaster-h', 1, ph('box', 0x5a5f66, 0.25, 0.35), 0xff5a3a),
  stat('item.blastur.j', 'items/blaster-j', 1, ph('box', 0x5a5f66, 0.25, 0.35), 0xff5a3a),
  stat('item.blastur.k', 'items/blaster-k', 1, ph('box', 0x5a5f66, 0.25, 0.3), 0xff5a3a),
  stat('item.blastur.l', 'items/blaster-l', 1, ph('box', 0x5a5f66, 0.25, 0.35), 0xff5a3a),
  stat('item.blastur.m', 'items/blaster-m', 1, ph('box', 0x5a5f66, 0.25, 0.35), 0xff5a3a),
  stat('item.blastur.n', 'items/blaster-n', 1, ph('box', 0x5a5f66, 0.25, 0.35), 0xff5a3a),
  stat('item.blastur.o', 'items/blaster-o', 1, ph('box', 0x5a5f66, 0.25, 0.35), 0xff5a3a),
  stat('item.blastur.p', 'items/blaster-p', 1, ph('box', 0x5a5f66, 0.25, 0.5), 0xff5a3a),
  stat('item.blastur.q', 'items/blaster-q', 1, ph('box', 0x5a5f66, 0.25, 0.4), 0xff5a3a),
  stat('item.blastur.r', 'items/blaster-r', 1, ph('box', 0x5a5f66, 0.25, 0.4), 0xff5a3a),
  stat('item.shotgun', 'items/shotgun', 1.4, ph('box', 0x5a5f66, 0.2, 0.6), 0xff5a3a),
  stat('item.grenade', 'items/grenade', 1.5, ph('sphere', 0x4a6a3a, 0.25, 0.12)),
  stat('item.clip', 'items/clip', 2, ph('box', 0x6a6f76, 0.2, 0.1)),
  // litesaber hilts: blade is procedural; no CC0 hilt found, so a plain cylinder placeholder
  stat('item.litesaberHilt', null, 1, ph('cylinder', 0xb0b4b8, 0.35, 0.04), 0x4fc3ff),
  stat('item.shield', 'items/shieldRound', 0.5, ph('cylinder', 0x8a8f94, 0.7, 0.35)),
  stat('item.shield.square', 'items/shieldSquare', 0.5, ph('box', 0x8a8f94, 0.7, 0.35)),
  stat('item.stim', 'items/potionRed', 0.5, ph('cylinder', 0xd04040, 0.45, 0.12), 0xd04040),
  stat('item.potion', 'items/potion', 0.7, ph('cylinder', 0x40c070, 0.45, 0.12), 0x40c070),
  stat('item.credits', 'items/coin', 1.6, ph('cylinder', 0xffd23f, 0.08, 0.2), 0xffd23f),
  stat('item.credits.pile', 'items/coinStack', 0.8, ph('cylinder', 0xffd23f, 0.3, 0.3), 0xffd23f),
  stat('item.gem', 'items/crystal', 0.5, ph('cone', 0x66ddff, 0.3, 0.15), 0x66ddff),
  stat('item.book', 'items/book', 0.8, ph('box', 0x6a4a8a, 0.15, 0.2)),
  stat('item.key', 'items/key', 0.5, ph('box', 0xffd23f, 0.08, 0.2)),
  stat('item.armor', null, 1, ph('box', 0x7a8088, 0.4, 0.3)),
  stat('item.helmet', null, 1, ph('sphere', 0x7a8088, 0.3, 0.15)),
  stat('item.ring', null, 1, ph('cylinder', 0xffd23f, 0.05, 0.08)),
];

export const MODEL_CATALOG: ModelEntry[] = [...ACTORS, ...OBJECTS, ...PROPS, ...TILES, ...ITEMS];

const BY_ID = new Map(MODEL_CATALOG.map((e) => [e.id, e]));

/** Keyword -> item category for `item.<baseId>` ids that have no explicit entry. */
const ITEM_KEYWORDS: [RegExp, string][] = [
  [/hilt|saber|litesaber|lightsaber/i, 'item.litesaberHilt'],
  [/blastur|blaster|rifle|pistol|carbine|repeater/i, 'item.blastur'],
  [/stim|bakta|potion|elixir|tonic/i, 'item.stim'],
  [/shield|buckler|bulwark/i, 'item.shield'],
  [/helm|hood|cowl|mask|cap|crown/i, 'item.helmet'],
  [/ring|amulet|talisman|pendant|belt/i, 'item.ring'],
  [/armor|armour|robe|vest|plate|tunic|cloak|boots|gloves|gauntlet/i, 'item.armor'],
  [/credit|coin/i, 'item.credits'],
  [/gem|crystal|shard|kyber/i, 'item.gem'],
  [/book|tome|scroll|holocron/i, 'item.book'],
  [/grenade|thermal|bomb/i, 'item.grenade'],
  [/key/i, 'item.key'],
];

/**
 * Resolve a model id. Order: exact -> parent prefixes (`a.b.c` -> `a.b` -> `a`) -> item keyword
 * heuristics -> `<family>.default` -> a synthesized magenta placeholder. Never returns undefined.
 */
export function getModelEntry(id: string): ModelEntry {
  const hit = BY_ID.get(id);
  if (hit) return hit;
  const parts = id.split('.');
  const family = parts[0];
  for (let n = parts.length - 1; n >= 1; n--) {
    const e = BY_ID.get(parts.slice(0, n).join('.'));
    if (e) return { ...e, id };
  }
  if (family === 'item') {
    const base = parts.slice(1).join('.');
    for (const [re, target] of ITEM_KEYWORDS) {
      if (re.test(base)) return { ...(BY_ID.get(target) as ModelEntry), id };
    }
  }
  if (family === 'tile' && parts.length === 4) {
    const alt = BY_ID.get(`tile.${parts[1]}.${parts[2]}.floor`);
    if (alt) return { ...alt, id };
  }
  const def = BY_ID.get(`${family}.default`);
  if (def) return { ...def, id };
  return { id, url: null, scale: 1, placeholder: { ...DEFAULT_PLACEHOLDER } };
}
