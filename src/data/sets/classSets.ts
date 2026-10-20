/**
 * Class sets: three per hero (early, mid, late game), each tailored to one class's skill trees and
 * built mostly on that class's own armor lines. Every piece wears the set's colors, and the full set
 * lights an aura around the hero (render/models/dress). Flavor text: `flavor.setitem.<id>`; each
 * set's story is a Holocron entry opened when a first piece is found (data/lore/sets.ts).
 */
import type { StatId } from '../../core/stats/types';
import type { ClassId } from '../../core/types';
import type { GearLook, SetDef } from '../schema';

type M = SetDef['bonuses'][number][number];
const f = (stat: StatId, min: number, max: number = min, param?: string): M => ({
  stat,
  op: 'flat',
  min,
  max,
  ...(param ? { param } : {}),
});
const p = (stat: StatId, min: number, max: number = min): M => ({ stat, op: 'percent', min, max });
const tree = (id: string, v: number): M => f('treeSkills', v, v, id);
const cls = (id: ClassId, v: number): M => f('classSkills', v, v, id);
const allRes = (v: number): M[] => [f('resPlasma', v), f('resCryo', v), f('resStorm', v), f('resToxin', v)];

/** A set piece: its id is `<set><Part>`, its name key `setitem.<id>`. */
const piece = (
  set: string,
  part: string,
  base: string,
  reqLevel: number,
  mods: M[],
): SetDef['items'][number] => ({
  id: `${set}${part}`,
  name: `setitem.${set}${part}`,
  base,
  reqLevel,
  mods,
});

const set = (
  id: string,
  forClass: ClassId,
  look: GearLook,
  items: (set: string) => SetDef['items'],
  bonuses: SetDef['bonuses'],
): SetDef => ({ id, name: `set.${id}`, forClass, look, items: items(id), bonuses });

export default [
  // ---------------------------------------------------------------------------------- Yedi Knight
  // Early: the white-and-gold of the Temple guards who watched the Kybur Heart.
  set(
    'templeGuard',
    'yediKnight',
    { primary: 0xe4dcc0, trim: 0xc8a040, glow: 0xffd060 },
    (s) => [
      piece(s, 'Hood', 'yediHood', 6, [p('defense', 30, 50), f('lifeMax', 10, 15), f('fhr', 10)]),
      piece(s, 'Robe', 'yediRobe', 8, [p('defense', 40, 60), f('vitality', 4, 6), f('resStorm', 15)]),
      piece(s, 'Wraps', 'yediWraps', 6, [f('attackRating', 25, 40), f('ias', 10), p('defense', 20, 30)]),
      piece(s, 'Boots', 'yediBoots', 7, [f('frw', 15), p('defense', 20, 30), f('dexterity', 3, 5)]),
    ],
    {
      2: [f('blockChance', 8), f('lifeRegen', 2)],
      3: [tree('yediKnight.masteries', 1), f('lifeMax', 20)],
      4: [cls('yediKnight', 1), ...allRes(10), f('lightRadius', 2)],
    },
  ),
  // Mid: the sand-worn gear of Old Ben Kenobee, hiding out on a desert moon.
  set(
    'kenobeesExile',
    'yediKnight',
    { primary: 0x9a7a52, trim: 0x5a3a20, glow: 0x7fd0ff },
    (s) => [
      piece(s, 'Cowl', 'yediCowl', 20, [p('defense', 40, 60), f('energy', 8, 12), f('manaRegenPct', 15)]),
      piece(s, 'Robe', 'yediMasterRobe', 22, [
        p('defense', 50, 80),
        f('lifeMax', 30, 40),
        f('resPlasma', 25),
      ]),
      piece(s, 'Sash', 'yediSash', 20, [f('lifeRegen', 3, 5), f('strength', 6, 10), f('goldFind', 25)]),
      piece(s, 'Boots', 'yediMasterBoots', 21, [f('frw', 20), f('resCryo', 20, 30), p('defense', 30, 50)]),
      piece(s, 'Saber', 'knightSaber', 24, [
        p('enhancedDamage', 80, 110),
        f('cryoMin', 6),
        f('cryoMax', 14),
        f('ias', 15),
      ]),
    ],
    {
      2: [f('fhr', 15), f('attackRating', 75)],
      3: [tree('yediKnight.saberForms', 1), f('lifeSteal', 4)],
      4: [p('enhancedDamage', 40), f('dodgeChance', 8)],
      5: [cls('yediKnight', 2), ...allRes(20), f('magicFind', 30)],
    },
  ),
  // Late: the swamp-green robes and gnarled grips of Grandmaster Yoduh. Small, they are. Strong, also.
  set(
    'yoduhsPatience',
    'yediKnight',
    { primary: 0x5a7a3a, trim: 0xc8b890, glow: 0x7aff6a },
    (s) => [
      piece(s, 'Hood', 'yediGrandmasterHood', 42, [
        p('defense', 60, 90),
        cls('yediKnight', 1),
        f('lifeMax', 40, 60),
      ]),
      piece(s, 'Robe', 'yediGrandmasterRobe', 44, [
        p('defense', 80, 120),
        f('vitality', 15, 20),
        f('damageReducedPct', 8),
      ]),
      piece(s, 'Wraps', 'yediGrandmasterWraps', 42, [
        f('ias', 20),
        f('crushingBlow', 10),
        f('strength', 10, 15),
      ]),
      piece(s, 'Sash', 'yediGrandmasterSash', 43, [
        f('lifeRegen', 6, 8),
        f('manaRegenPct', 30),
        f('fhr', 20),
      ]),
      piece(s, 'Blade', 'paragonBlade', 46, [
        p('enhancedDamage', 140, 180),
        f('toxinMin', 30),
        f('toxinMax', 60),
        f('deadlyStrike', 15),
      ]),
    ],
    {
      2: [f('lifeMax', 60), f('resToxin', 30)],
      3: [tree('yediKnight.commands', 2), f('fcr', 20)],
      4: [p('enhancedDamage', 60), f('lifeSteal', 6)],
      5: [f('allSkills', 2), ...allRes(30), f('cannotBeFrozen', 1)],
    },
  ),
  // -------------------------------------------------------------------------------- Bounty Huntur
  // Early: desert tracking gear, stitched from what the Tuskins left behind.
  set(
    'tuskinTracker',
    'bountyHuntur',
    { primary: 0xb89a6a, trim: 0x6a4a2a, glow: 0xff9a3a },
    (s) => [
      piece(s, 'Bucket', 'hunterBucket', 8, [
        p('defense', 30, 50),
        f('attackRating', 30, 50),
        f('lightRadius', 2),
      ]),
      piece(s, 'Vest', 'paddedVest', 6, [p('defense', 40, 60), f('dexterity', 4, 6), f('resPlasma', 15)]),
      piece(s, 'Belt', 'gunslingerBelt', 7, [f('lifeMax', 15, 20), f('ias', 10), p('defense', 20, 30)]),
      piece(s, 'Boots', 'trailBoots', 6, [f('frw', 20), f('resToxin', 15, 20), p('defense', 20, 30)]),
    ],
    {
      2: [f('attackRating', 50), f('goldFind', 30)],
      3: [tree('bountyHuntur.blasturs', 1), f('dexterity', 10)],
      4: [cls('bountyHuntur', 1), ...allRes(10), f('pierce', 15)],
    },
  ),
  // Mid: polished beskur plate of a Mandalorr clan, one blue stripe for every bounty.
  set(
    'mandalorrClan',
    'bountyHuntur',
    { primary: 0x8a96a6, trim: 0x2a3a6a, glow: 0x4fc3ff },
    (s) => [
      piece(s, 'Bucket', 'hunterWarbucket', 22, [p('defense', 40, 70), f('lifeMax', 25, 35), f('fhr', 15)]),
      piece(s, 'Harness', 'hunterWarharness', 23, [
        p('defense', 60, 90),
        f('damageReduced', 5, 8),
        f('resStorm', 25),
      ]),
      piece(s, 'Fists', 'hunterWarfists', 21, [f('ias', 15), f('deadlyStrike', 10), f('dexterity', 6, 10)]),
      piece(s, 'Striders', 'jetStriders', 22, [f('frw', 25), f('resPlasma', 25), p('defense', 30, 50)]),
    ],
    {
      2: [f('attackRating', 100), f('lifeMax', 30)],
      3: [tree('bountyHuntur.instincts', 1), f('evadeChance', 8)],
      4: [cls('bountyHuntur', 2), ...allRes(20), f('magicFind', 30)],
    },
  ),
  // Late: the battered green armor and famous jetpack boots of the galaxy's most famous huntur.
  set(
    'fettsonsLegacy',
    'bountyHuntur',
    { primary: 0x5e6e3a, trim: 0x9a2a1a, glow: 0xff6a2a },
    (s) => [
      piece(s, 'Bucket', 'hunterBeskurBucket', 44, [
        p('defense', 60, 90),
        cls('bountyHuntur', 1),
        f('attackRating', 100, 150),
      ]),
      piece(s, 'Harness', 'hunterBeskurHarness', 45, [
        p('defense', 80, 120),
        f('vitality', 15, 20),
        f('damageReducedPct', 8),
      ]),
      piece(s, 'Fists', 'hunterDeathfists', 42, [
        f('ias', 20),
        f('plasmaMin', 15),
        f('plasmaMax', 35),
        f('lifeSteal', 4),
      ]),
      piece(s, 'Rig', 'gunslingerWarrig', 43, [f('lifeMax', 50, 70), f('strength', 10, 15), f('fhr', 20)]),
      piece(s, 'Jetboots', 'jetSkyboots', 44, [f('frw', 30), f('resCryo', 30), f('dexterity', 10, 15)]),
      piece(s, 'Blastur', 'huntingSharpshooter', 47, [
        p('enhancedDamage', 140, 180),
        f('pierce', 25),
        f('criticalStrike', 15),
      ]),
    ],
    {
      2: [f('lifeMax', 60), f('attackRating', 150)],
      3: [tree('bountyHuntur.blasturs', 2), f('dexterity', 15)],
      4: [p('enhancedDamage', 50), f('resPlasma', 30)],
      5: [tree('bountyHuntur.spearArc', 2), f('evadeChance', 10)],
      6: [f('allSkills', 2), ...allRes(30), f('magicFind', 50)],
    },
  ),
  // ---------------------------------------------------------------------------------- Forse Adept
  // Early: a farm kid's hand-me-downs, with a crystal sewn into the belt "for luck".
  set(
    'moistureFarmer',
    'forseAdept',
    { primary: 0xe0d4b0, trim: 0x8a6a48, glow: 0xffc860 },
    (s) => [
      piece(s, 'Circlet', 'adeptCirclet', 5, [f('manaMax', 15, 20), p('defense', 30, 50), f('energy', 3, 5)]),
      piece(s, 'Robe', 'adeptRobe', 7, [p('defense', 40, 60), f('lifeMax', 10, 15), f('resCryo', 15)]),
      piece(s, 'Cord', 'focusCord', 6, [f('manaRegenPct', 20), f('lifeMax', 10), p('defense', 20, 30)]),
      piece(s, 'Sandals', 'pilgrimSandals', 5, [f('frw', 15), f('resStorm', 15), f('fcr', 5)]),
    ],
    {
      2: [f('fcr', 10), f('manaMax', 20)],
      3: [tree('forseAdept.plasma', 1), f('energy', 10)],
      4: [cls('forseAdept', 1), ...allRes(10), f('magicFind', 20)],
    },
  ),
  // Mid: the grey robes of the Temple archivists, who remember every spell and every overdue scroll.
  set(
    'greyArchivist',
    'forseAdept',
    { primary: 0x7a7e88, trim: 0xd0d4dc, glow: 0x9ad8ff },
    (s) => [
      piece(s, 'Diadem', 'adeptDiadem', 20, [f('manaMax', 30, 40), f('fcr', 10), p('defense', 40, 60)]),
      piece(s, 'Mantle', 'adeptMantle', 22, [p('defense', 50, 80), f('lifeMax', 25, 35), f('resCryo', 25)]),
      piece(s, 'Bracers', 'runeWardbracers', 20, [f('fcr', 10), f('energy', 8, 12), f('manaRegenPct', 20)]),
      piece(s, 'Girdle', 'focusGirdle', 21, [f('lifeMax', 25), f('manaMax', 25), f('fhr', 15)]),
      piece(s, 'Globe', 'kyburGlobe', 24, [
        f('cryoSkillDamage', 20, 30),
        f('fcr', 15),
        tree('forseAdept.cryo', 1),
      ]),
    ],
    {
      2: [f('manaMax', 40), f('resStorm', 20)],
      3: [tree('forseAdept.cryo', 1), f('fcr', 10)],
      4: [f('cryoSkillDamage', 20), f('lifeMax', 40)],
      5: [cls('forseAdept', 2), ...allRes(20), f('magicFind', 30)],
    },
  ),
  // Late: storm-dark weaves of the Nightsisters of Dathomur, humming with stolen lightning.
  set(
    'dathomurNightweave',
    'forseAdept',
    { primary: 0x3a1420, trim: 0x9a2a3a, glow: 0xff3a6a },
    (s) => [
      piece(s, 'Starcrown', 'adeptStarcrown', 42, [cls('forseAdept', 1), f('manaMax', 50, 70), f('fcr', 10)]),
      piece(s, 'Starmantle', 'adeptStarmantle', 44, [
        p('defense', 80, 120),
        f('vitality', 15, 20),
        f('damageReducedPct', 6),
      ]),
      piece(s, 'Starbracers', 'runeStarbracers', 42, [
        f('fcr', 15),
        f('stormSkillDamage', 15, 25),
        f('energy', 10, 15),
      ]),
      piece(s, 'Starcord', 'focusStarcord', 43, [f('lifeMax', 50, 70), f('manaRegenPct', 40), f('fhr', 20)]),
      piece(s, 'Starwalkers', 'pilgrimStarwalkers', 42, [
        f('frw', 30),
        f('resStorm', 30),
        f('dodgeChance', 8),
      ]),
    ],
    {
      2: [f('manaMax', 60), f('fcr', 10)],
      3: [tree('forseAdept.storm', 2), f('enemyStormRes', -10)],
      4: [f('stormSkillDamage', 30), f('lifeMax', 60)],
      5: [f('allSkills', 2), ...allRes(30), f('magicFind', 50)],
    },
  ),
] satisfies SetDef[];
