// Reproducible curation of third-party models into public/assets/models.
// Usage: ASSET_SRC=/path/to/downloads node scripts/assets/build-models.mjs [--dry]
// ASSET_SRC layout (git clones, see assets/manifest.json "source" for URLs):
//   kenney/               shorepine/kenney (Kenney all-in-1, CC0)
//   KayKit-*              KayKit-Game-Assets/* (CC0)
//   descent-3d-assets/    511action/descent-3d-assets (Quaternius Ultimate Monsters mirror, CC0)
//   robot/                three.js examples RobotExpressive.glb (CC0, Tomas Laulhe / Quaternius)
// Writes public/assets/models/**.glb and prints a JSON report (bytes, rest-pose size, clips).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { processModel } from './glb-tool.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = process.env.ASSET_SRC;
if (!SRC) throw new Error('set ASSET_SRC');
const OUT = path.join(ROOT, 'public/assets/models');
const dry = process.argv.includes('--dry');

const K = (kit, f) => `kenney/3d/${kit}/${f}.glb`;
const KD = (f) => `KayKit-Dungeon-Remastered-1.0/addons/kaykit_dungeon_remastered/Assets/gltf/${f}.gltf.glb`;
const KS = (f) => `KayKit-Space-Base-Bits-1.0/addons/kaykit_space_base_bits/Assets/gltf/${f}.gltf`;
const KW = (f) =>
  `KayKit-Character-Pack-Adventures-1.0/addons/kaykit_character_pack_adventures/Assets/gltf/${f}.gltf`;

const QM_ANIMS = ['Idle', 'Walk', 'Run', 'Punch', 'HitReact', 'Death', 'Weapon'];

/** @type {{dest: string, src: string, anims?: string[], remove?: string[], removeMatch?: RegExp}[]} */
const T = [
  // ---- rigged monsters (humanoids are built by build-chars.mjs) ----
  {
    dest: 'monsters/robot',
    src: 'robot/RobotExpressive.glb',
    anims: ['Idle', 'Walking', 'Running', 'Punch', 'Death', 'Jump', 'Wave', 'Yes', 'No', 'ThumbsUp', 'Dance'],
  },
  { dest: 'monsters/orc', src: 'descent-3d-assets/models/Orc.gltf', anims: QM_ANIMS },
  // ---- weapons / items ----
  ...'a b c d e f g h i j k l m n o p q r'
    .split(' ')
    .map((c) => ({ dest: `items/blaster-${c}`, src: K('blaster', `blaster-${c}`) })),
  { dest: 'items/grenade', src: K('blaster', 'grenade-a') },
  { dest: 'items/clip', src: K('blaster', 'clip-small') },
  { dest: 'items/coin', src: KD('coin') },
  { dest: 'items/coinStack', src: KD('coin_stack_small') },
  { dest: 'items/potion', src: KD('bottle_A_green') },
  { dest: 'items/potionRed', src: KD('bottle_C_brown') },
  { dest: 'items/shieldRound', src: KW('shield_round') },
  { dest: 'items/shieldSquare', src: KW('shield_square') },
  { dest: 'items/book', src: KW('spellbook_closed') },
  { dest: 'items/crystal', src: K('space', 'rock_crystals') },
  { dest: 'items/key', src: KD('key') },
  { dest: 'items/pistol', src: K('weapon', 'pistol') },
  { dest: 'items/rifle', src: K('weapon', 'machinegun') },
  { dest: 'items/shotgun', src: K('weapon', 'shotgun') },
  { dest: 'items/sniper', src: K('weapon', 'sniper') },
  // ---- objects ----
  { dest: 'objects/waypoint', src: KS('landingpad_small') },
  {
    dest: 'objects/chest',
    src: 'KayKit-Dungeon-Remastered-1.0/addons/kaykit_dungeon_remastered/Assets/gltf/chest.glb',
  },
  {
    dest: 'objects/chestGold',
    src: 'KayKit-Dungeon-Remastered-1.0/addons/kaykit_dungeon_remastered/Assets/gltf/chest_gold.glb',
  },
  { dest: 'objects/stash', src: K('space-station', 'container-tall') },
  { dest: 'objects/portal', src: K('nature', 'statue_ring') },
  { dest: 'objects/shrine', src: K('graveyard', 'altar-stone') },
  // ---- props ----
  { dest: 'props/treePine', src: K('nature', 'tree_pineTallA') },
  { dest: 'props/treePineRound', src: K('nature', 'tree_pineRoundC') },
  { dest: 'props/treeOak', src: K('nature', 'tree_oak') },
  { dest: 'props/treeFat', src: K('nature', 'tree_fat') },
  { dest: 'props/treeDead', src: K('nature', 'tree_thin_fall') },
  { dest: 'props/stump', src: K('nature', 'stump_old') },
  { dest: 'props/log', src: K('nature', 'log') },
  { dest: 'props/rockLarge', src: K('nature', 'rock_largeA') },
  { dest: 'props/rockSmall', src: K('nature', 'rock_smallA') },
  { dest: 'props/rockTall', src: K('nature', 'rock_tallA') },
  { dest: 'props/stoneTall', src: K('nature', 'stone_tallB') },
  { dest: 'props/bush', src: K('nature', 'plant_bush') },
  { dest: 'props/bushLarge', src: K('nature', 'plant_bushLarge') },
  { dest: 'props/grass', src: K('nature', 'grass_large') },
  { dest: 'props/flowers', src: K('nature', 'flower_redA') },
  { dest: 'props/mushrooms', src: K('nature', 'mushroom_redGroup') },
  { dest: 'props/campfire', src: K('nature', 'campfire_logs') },
  { dest: 'props/tent', src: K('nature', 'tent_smallOpen') },
  { dest: 'props/tentLarge', src: K('nature', 'tent_detailedClosed') },
  { dest: 'props/fence', src: K('nature', 'fence_simple') },
  { dest: 'props/sign', src: K('nature', 'sign') },
  { dest: 'props/ruinColumn', src: K('nature', 'statue_columnDamaged') },
  { dest: 'props/obelisk', src: K('nature', 'statue_obelisk') },
  { dest: 'props/statueHead', src: K('nature', 'statue_head') },
  { dest: 'props/crystal', src: K('space', 'rock_crystals') },
  { dest: 'props/crystalLarge', src: K('space', 'rock_crystalsLargeA') },
  { dest: 'props/bones', src: K('space', 'bones') },
  { dest: 'props/rubble', src: KD('rubble_large') },
  { dest: 'props/rubbleHalf', src: KD('rubble_half') },
  { dest: 'props/barrel', src: KD('barrel_large') },
  { dest: 'props/barrelSmall', src: KD('barrel_small') },
  { dest: 'props/crate', src: KD('box_large') },
  { dest: 'props/cratesStacked', src: KD('crates_stacked') },
  { dest: 'props/pillar', src: KD('pillar_decorated') },
  { dest: 'props/column', src: KD('column') },
  { dest: 'props/banner', src: KD('banner_patternA_red') },
  { dest: 'props/torch', src: KD('torch_lit') },
  { dest: 'props/torchWall', src: KD('torch_mounted') },
  { dest: 'props/brazier', src: K('graveyard', 'fire-basket') },
  { dest: 'props/coffin', src: K('graveyard', 'coffin') },
  { dest: 'props/cargo', src: KS('cargo_A_stacked') },
  { dest: 'props/containers', src: KS('containers_A') },
  { dest: 'props/cargoDepot', src: KS('cargodepot_A') },
  { dest: 'props/baseModule', src: KS('basemodule_A') },
  { dest: 'props/garage', src: KS('basemodule_garage') },
  { dest: 'props/solarPanel', src: KS('solarpanel') },
  { dest: 'props/windTurbine', src: KS('windturbine_low') },
  { dest: 'props/spaceTruck', src: KS('spacetruck') },
  { dest: 'props/lander', src: KS('lander_A') },
  { dest: 'props/drill', src: KS('drill_structure') },
  { dest: 'props/satelliteDish', src: K('space', 'satelliteDish') },
  { dest: 'props/rover', src: K('space', 'rover') },
  { dest: 'props/generator', src: K('space', 'machine_generator') },
  { dest: 'props/barrelsTech', src: K('space', 'barrels') },
  { dest: 'props/turret', src: K('space', 'turret_single') },
  { dest: 'props/wreck', src: K('space', 'craft_cargoA') },
  { dest: 'props/speeder', src: K('space', 'craft_speederA') },
  // ---- tiles ----
  { dest: 'tiles/grassTile', src: K('nature', 'ground_grass') },
  { dest: 'tiles/pathTile', src: K('nature', 'ground_pathTile') },
  { dest: 'tiles/riverTile', src: K('nature', 'ground_riverTile') },
  { dest: 'tiles/cliffBlock', src: K('nature', 'cliff_block_rock') },
  { dest: 'tiles/caveFloor', src: K('modular-cave', 'template-floor') },
  { dest: 'tiles/caveWall', src: K('modular-cave', 'template-wall') },
  { dest: 'tiles/dirtFloor', src: KD('floor_dirt_large') },
  { dest: 'tiles/dirtWeeds', src: KD('floor_dirt_small_weeds') },
  { dest: 'tiles/templeFloor', src: KD('floor_tile_large') },
  { dest: 'tiles/templeFloorRocks', src: KD('floor_tile_large_rocks') },
  { dest: 'tiles/templeFloorWeeds', src: KD('floor_tile_small_weeds_A') },
  { dest: 'tiles/templeWall', src: KD('wall') },
  { dest: 'tiles/stationFloor', src: K('space-station', 'floor') },
  { dest: 'tiles/stationWall', src: K('space-station', 'wall') },
  { dest: 'tiles/roadStraight', src: K('space', 'terrain_roadStraight') },
  { dest: 'tiles/terrain', src: K('space', 'terrain') },
];

const report = {};
for (const t of T) {
  const src = path.join(SRC, t.src);
  const dest = path.join(OUT, `${t.dest}.glb`);
  let remove = t.remove;
  if (t.removeMatch) {
    // collect node names from the source json
    const { readModel } = await import('./glb-tool.mjs');
    const names = readModel(src)
      .json.nodes.map((n) => n.name)
      .filter((n) => t.removeMatch.test(n));
    remove = names;
  }
  if (dry) {
    report[t.dest] = fs.existsSync(src) ? 'ok' : 'MISSING';
    continue;
  }
  const r = processModel(src, dest, { keepAnimations: t.anims ?? null, removeNodes: remove });
  report[t.dest] = {
    kb: Math.round(r.bytes / 1024),
    size: r.size.map((v) => +v.toFixed(2)),
    min: r.min.map((v) => +v.toFixed(2)),
    skinned: r.skinned,
    anims: r.animations.length,
  };
}
if (!dry) {
  fs.writeFileSync(
    path.join(ROOT, 'scripts/assets/models-sources.json'),
    JSON.stringify(Object.fromEntries(T.map((t) => [`models/${t.dest}.glb`, t.src])), null, 1) + '\n',
  );
}
console.log(JSON.stringify(report, null, 1));
