/**
 * Dev harness for ui/panels + ui/menus. Mock UiApi, player, items and 30 mock skills per class.
 * URL params:
 *   ?open=inventory,character   panels to open (default inventory,character)
 *   &class=forseAdept           player class
 *   &menu=title|select|create|options   show the main menu instead
 *   &guide=1&hints=1            build guide / stat hints
 *   &tip=item|compare|skill     open a pinned tooltip for screenshots
 */
import { render } from 'preact';
import { signal } from '@preact/signals';
import { Panels, type PanelDataSource, type PanelServices } from '../src/ui/panels';
import { MainMenu } from '../src/ui/menus';
import { registerNames, t } from '../src/data/names';
import { DB } from '../src/data/db';
import '../src/ui/theme.css';
import type { PanelId, UiApi, UiStore } from '../src/ui/types';
import type { Command } from '../src/core/sim/commands';
import type { PlayerEntity, Entity } from '../src/core/sim/entities';
import type { WorldView } from '../src/core/sim/world';
import type { Settings } from '../src/core/save/types';
import type { DerivedStats } from '../src/core/stats/types';
import type { GridContainer, ItemInstance } from '../src/core/items/types';
import type { ClassId, DamageType, EquipSlot, ItemQuality } from '../src/core/types';
import type { ItemBaseDef, SkillDef, SkillKind } from '../src/data/schema';
import type { ItemDescription, ItemLine } from '../src/core/items/describe';

const q = new URLSearchParams(location.search);
const classId = (q.get('class') as ClassId) || 'yediKnight';

// ------------------------------------------------------------------ mock item bases

type BaseSpec = [
  id: string,
  name: string,
  cat: ItemBaseDef['category'],
  w: number,
  h: number,
  extra?: Partial<ItemBaseDef>,
];
const BASES: BaseSpec[] = [
  [
    'trainingLitesaber',
    'Training Litesaber',
    'weapon',
    1,
    3,
    {
      weaponClass: 'litesaber',
      slots: ['mainHand', 'offHand'],
      damage: { min: 2, max: 7 },
      req: { strength: 10 },
    },
  ],
  [
    'duelistLitesaber',
    'Duelist Litesaber',
    'weapon',
    1,
    3,
    {
      weaponClass: 'litesaber',
      slots: ['mainHand', 'offHand'],
      damage: { min: 8, max: 19 },
      req: { strength: 35, level: 18 },
    },
  ],
  [
    'doubleSaber',
    'Double Litesaber',
    'weapon',
    2,
    4,
    { weaponClass: 'doubleLitesaber', slots: ['mainHand'], twoHanded: true, damage: { min: 12, max: 30 } },
  ],
  [
    'scoutBlastur',
    'Scout Blastur',
    'weapon',
    2,
    2,
    { weaponClass: 'blasturPistol', slots: ['mainHand'], damage: { min: 3, max: 8 } },
  ],
  [
    'longRifle',
    'Long Rifle',
    'weapon',
    2,
    4,
    { weaponClass: 'blasturRifle', slots: ['mainHand'], twoHanded: true, damage: { min: 6, max: 22 } },
  ],
  [
    'apprenticeStaff',
    'Apprentice Staff',
    'weapon',
    1,
    4,
    { weaponClass: 'forseStaff', slots: ['mainHand'], damage: { min: 2, max: 6 } },
  ],
  [
    'shockBaton',
    'Shock Baton',
    'weapon',
    1,
    3,
    { weaponClass: 'shockBaton', slots: ['mainHand', 'offHand'], damage: { min: 4, max: 9 } },
  ],
  ['javelinTrainer', 'Trainer Javelin', 'weapon', 1, 3, { weaponClass: 'javelin', slots: ['mainHand'] }],
  ['kyburFocus', 'Kybur Focus', 'weapon', 1, 2, { weaponClass: 'kyburFocus', slots: ['offHand'] }],
  [
    'buckler',
    'Energy Buckler',
    'armor',
    2,
    2,
    { armorClass: 'shield', slots: ['offHand'], defense: { min: 4, max: 6 }, block: 25 },
  ],
  [
    'towerShield',
    'Tower Shield',
    'armor',
    2,
    3,
    { armorClass: 'shield', slots: ['offHand'], defense: { min: 22, max: 25 }, block: 40 },
  ],
  [
    'pilotHelm',
    'Pilot Helmet',
    'armor',
    2,
    2,
    { armorClass: 'helm', slots: ['head'], defense: { min: 3, max: 5 } },
  ],
  [
    'troopHelm',
    'Trooper Helmet',
    'armor',
    2,
    2,
    { armorClass: 'helm', slots: ['head'], defense: { min: 8, max: 12 } },
  ],
  [
    'flightSuit',
    'Flight Suit',
    'armor',
    2,
    3,
    { armorClass: 'chest', slots: ['chest'], defense: { min: 8, max: 11 } },
  ],
  [
    'plateVest',
    'Plate Vest',
    'armor',
    2,
    3,
    { armorClass: 'chest', slots: ['chest'], defense: { min: 25, max: 32 } },
  ],
  [
    'gripGloves',
    'Grip Gloves',
    'armor',
    2,
    2,
    { armorClass: 'gloves', slots: ['gloves'], defense: { min: 2, max: 3 } },
  ],
  [
    'utilityBelt',
    'Utility Belt',
    'armor',
    2,
    1,
    { armorClass: 'belt', slots: ['belt'], defense: { min: 2, max: 2 } },
  ],
  [
    'jumpBoots',
    'Jump Boots',
    'armor',
    2,
    2,
    { armorClass: 'boots', slots: ['boots'], defense: { min: 2, max: 3 } },
  ],
  ['ring', 'Ring', 'jewelry', 1, 1, { armorClass: 'ring', slots: ['ring1', 'ring2'] }],
  ['amulet', 'Amulet', 'jewelry', 1, 1, { armorClass: 'amulet', slots: ['amulet'] }],
  ['baktaStim', 'Bakta Stim', 'consumable', 1, 1, { use: { kind: 'heal', amount: 40 } }],
  ['energyCell', 'Energy Cell', 'consumable', 1, 1, { use: { kind: 'mana', amount: 30 } }],
  ['recallBeacon', 'Recall Beacon', 'consumable', 1, 1, { use: { kind: 'recall' } }],
  ['kyburRed', 'Chipped Red Kybur', 'gem', 1, 1, {}],
  ['glyphZod', 'Data-Glyph Zod', 'glyph', 1, 1, {}],
  ['holocrumb', 'Holocrumb', 'quest', 2, 2, {}],
];
const baseMap = new Map<string, ItemBaseDef>();
const names: Record<string, string> = {};
for (const [id, name, category, w, h, extra] of BASES) {
  names[`item.${id}`] = name;
  baseMap.set(id, {
    id,
    name: `item.${id}`,
    category,
    slots: [],
    size: { w, h },
    qlvl: 1,
    req: {},
    maxSockets: 3,
    cost: 40,
    modelId: `item.${id}`,
    icon: id,
    ...extra,
  });
}

let uidN = 1;
function it(
  base: string,
  quality: ItemQuality = 'normal',
  extra: Partial<ItemInstance> & { label?: string; lines?: [string, string][] } = {},
): ItemInstance {
  const { label, lines, ...rest } = extra;
  const item: ItemInstance = {
    uid: `u${uidN++}`,
    base,
    quality,
    ilvl: 12,
    affixes: [],
    mods: [],
    sockets: 0,
    socketed: [],
    identified: true,
    ...rest,
  };
  mockDesc.set(item.uid, { label, lines });
  return item;
}
const mockDesc = new Map<string, { label?: string | undefined; lines?: [string, string][] | undefined }>();

function describeMock(item: ItemInstance): ItemDescription {
  const base = baseMap.get(item.base);
  const extra = mockDesc.get(item.uid) ?? {};
  const baseName = base ? t(base.name) : item.base;
  const lines: ItemLine[] = [];
  if (base?.damage) lines.push({ text: `Damage: ${base.damage.min}-${base.damage.max}`, style: 'base' });
  if (base?.defense) lines.push({ text: `Defense: ${item.defense ?? base.defense.max}`, style: 'base' });
  if (base?.block) lines.push({ text: `Block chance: ${base.block}%`, style: 'base' });
  if (item.durability)
    lines.push({ text: `Durability: ${item.durability.cur} of ${item.durability.max}`, style: 'base' });
  if (base?.use?.amount) lines.push({ text: `Heals ${base.use.amount} life`, style: 'base' });
  if (base?.req.strength) lines.push({ text: `Required Strength: ${base.req.strength}`, style: 'req' });
  if (base?.req.level)
    lines.push({ text: `Required Level: ${base.req.level}`, style: base.req.level > 24 ? 'reqFail' : 'req' });
  for (const [style, text] of extra.lines ?? []) lines.push({ text, style });
  if (item.sockets)
    lines.push({ text: `Sockets (${item.socketed.length}/${item.sockets})`, style: 'socket' });
  const rare = item.quality === 'rare' || item.quality === 'unique' || item.quality === 'set';
  return {
    name: extra.label ?? baseName,
    ...(rare && extra.label ? { baseName } : {}),
    quality: item.quality,
    lines,
  };
}

// ------------------------------------------------------------------ mock skills (30 per class)

type SkSpec = [
  id: string,
  name: string,
  row: number,
  col: number,
  prereqs: string[],
  kind: SkillKind,
  el?: DamageType,
];
const TREES: Record<ClassId, [string, string, SkSpec[]][]> = {
  yediKnight: [
    [
      'yediKnight.saberForms',
      'Saber Forms',
      [
        ['litesaberStrike', 'Litesaber Strike', 0, 1, [], 'meleeAttack'],
        ['forseLeap', 'Forse Leap', 1, 0, [], 'movement'],
        ['twinStrike', 'Twin Strike', 1, 2, ['litesaberStrike'], 'meleeAttack'],
        ['stunStrike', 'Stun Strike', 2, 1, ['litesaberStrike'], 'meleeAttack'],
        ['twinThrow', 'Twin Throw', 2, 2, ['twinStrike'], 'missile'],
        ['leapStrike', 'Leap Strike', 3, 0, ['forseLeap', 'stunStrike'], 'movement'],
        ['focusStrike', 'Focus Strike', 3, 1, ['stunStrike'], 'meleeAttack'],
        ['saberFlurry', 'Saber Flurry', 4, 2, ['twinThrow'], 'meleeAttack'],
        ['saberCyclone', 'Saber Cyclone', 5, 1, ['leapStrike', 'focusStrike'], 'whirl'],
        ['overcharge', 'Overcharge', 5, 2, ['saberFlurry'], 'meleeAttack', 'magic'],
      ],
    ],
    [
      'yediKnight.masteries',
      'Masteries',
      [
        ['saberMastery', 'Saber Mastery', 0, 0, [], 'passive'],
        ['doubleSaberMastery', 'Double-Saber Mastery', 0, 1, [], 'passive'],
        ['vibroAxeMastery', 'Vibro-Axe Mastery', 0, 2, [], 'passive'],
        ['throwingMastery', 'Throwing Mastery', 1, 0, [], 'passive'],
        ['pikeMastery', 'Pike Mastery', 1, 2, [], 'passive'],
        ['endurance', 'Endurance', 2, 1, [], 'passive'],
        ['ironWill', 'Iron Will', 3, 1, [], 'passive'],
        ['swiftStep', 'Swift Step', 4, 1, ['endurance'], 'passive'],
        ['forseResilience', 'Forse Resilience', 5, 1, ['ironWill'], 'passive'],
        ['focusMastery', 'Focus Mastery', 5, 2, [], 'passive'],
      ],
    ],
    [
      'yediKnight.commands',
      'Commands',
      [
        ['fearRoar', 'Fear Roar', 0, 0, [], 'warcry'],
        ['scavengeStim', 'Scavenge Stim', 0, 2, [], 'utility'],
        ['provoke', 'Provoke', 1, 0, ['fearRoar'], 'warcry'],
        ['rally', 'Rally', 1, 1, ['fearRoar'], 'buff'],
        ['salvage', 'Salvage', 2, 2, ['scavengeStim'], 'utility'],
        ['forseRoar', 'Forse Roar', 3, 0, ['provoke'], 'warcry'],
        ['battleOrders', 'Battle Orders', 4, 1, ['rally'], 'buff'],
        ['commandBanner', 'Command Banner', 4, 2, ['rally'], 'buff'],
        ['shockwave', 'Shockwave', 5, 0, ['forseRoar'], 'warcry'],
        ['battleCommand', 'Battle Command', 5, 1, ['battleOrders'], 'buff'],
      ],
    ],
  ],
  bountyHuntur: [
    [
      'bountyHuntur.blasturs',
      'Blasturs',
      [
        ['chargedShot', 'Charged Shot', 0, 0, [], 'missile', 'magic'],
        ['plasmaShot', 'Plasma Shot', 0, 2, [], 'missile', 'plasma'],
        ['spreadShot', 'Spread Shot', 1, 0, ['chargedShot'], 'multiMissile'],
        ['cryoShot', 'Cryo Shot', 1, 1, ['chargedShot'], 'missile', 'cryo'],
        ['burstRound', 'Burst Round', 2, 2, ['plasmaShot', 'spreadShot'], 'missile', 'plasma'],
        ['seekerRound', 'Seeker Round', 3, 0, ['spreadShot'], 'missile'],
        ['freezeRound', 'Freeze Round', 3, 1, ['cryoShot'], 'missile', 'cryo'],
        ['rapidFire', 'Rapid Fire', 4, 0, ['seekerRound'], 'multiMissile'],
        ['incendiaryRound', 'Incendiary Round', 4, 2, ['burstRound'], 'missile', 'plasma'],
        ['cryoBurst', 'Cryo Burst', 5, 1, ['freezeRound'], 'missile', 'cryo'],
      ],
    ],
    [
      'bountyHuntur.instincts',
      'Instincts',
      [
        ['scanPulse', 'Scan Pulse', 0, 0, [], 'utility'],
        ['precision', 'Precision', 0, 2, [], 'passive'],
        ['dodge', 'Dodge', 1, 1, [], 'passive'],
        ['deflectorField', 'Deflector Field', 2, 0, ['scanPulse'], 'buff'],
        ['avoid', 'Avoid', 2, 1, ['dodge'], 'passive'],
        ['armorPiercing', 'Armor Piercing', 3, 2, ['precision'], 'passive'],
        ['holoDecoy', 'Holo-Decoy', 4, 0, ['deflectorField'], 'summon'],
        ['evade', 'Evade', 4, 1, ['avoid'], 'passive'],
        ['battleDroyd', 'Battle Droyd', 5, 0, ['holoDecoy', 'evade'], 'summon'],
        ['overpenetrate', 'Overpenetrate', 5, 2, ['armorPiercing'], 'passive'],
      ],
    ],
    [
      'bountyHuntur.spearArc',
      'Spear & Arc',
      [
        ['vibroJab', 'Vibro-Jab', 0, 1, [], 'meleeAttack'],
        ['powerThrust', 'Power Thrust', 1, 0, ['vibroJab'], 'meleeAttack', 'storm'],
        ['toxinDart', 'Toxin Dart', 1, 2, [], 'missile', 'toxin'],
        ['impale', 'Impale', 2, 0, ['powerThrust'], 'meleeAttack'],
        ['arcJavelin', 'Arc Javelin', 2, 1, ['powerThrust'], 'missile', 'storm'],
        ['chargedThrust', 'Charged Thrust', 3, 1, ['arcJavelin'], 'meleeAttack', 'storm'],
        ['toxinCloud', 'Toxin Cloud', 3, 2, ['toxinDart'], 'area', 'toxin'],
        ['fend', 'Fend', 4, 0, ['impale'], 'meleeAttack'],
        ['thunderThrust', 'Thunder Thrust', 5, 1, ['chargedThrust'], 'meleeAttack', 'storm'],
        ['arcFury', 'Arc Fury', 5, 2, ['toxinCloud', 'arcJavelin'], 'chain', 'storm'],
      ],
    ],
  ],
  forseAdept: [
    [
      'forseAdept.plasma',
      'Plasma',
      [
        ['plasmaBolt', 'Plasma Bolt', 0, 0, [], 'missile', 'plasma'],
        ['innerHeat', 'Inner Heat', 0, 2, [], 'passive', 'plasma'],
        ['plasmaStream', 'Plasma Stream', 1, 1, ['plasmaBolt'], 'beam', 'plasma'],
        ['plasmaOrb', 'Plasma Orb', 2, 0, ['plasmaBolt'], 'missile', 'plasma'],
        ['burningTrail', 'Burning Trail', 2, 1, ['plasmaStream'], 'trail', 'plasma'],
        ['plasmaWall', 'Plasma Wall', 3, 1, ['burningTrail'], 'wall', 'plasma'],
        ['empower', 'Empower', 3, 2, ['innerHeat'], 'buff', 'plasma'],
        ['starfall', 'Starfall', 4, 0, ['plasmaOrb', 'plasmaWall'], 'area', 'plasma'],
        ['blasturTurret', 'Blastur Turret', 5, 1, ['plasmaWall'], 'summon', 'plasma'],
        ['plasmaMastery', 'Plasma Mastery', 5, 2, [], 'passive', 'plasma'],
      ],
    ],
    [
      'forseAdept.storm',
      'Storm',
      [
        ['sparkBolts', 'Spark Bolts', 0, 1, [], 'multiMissile', 'storm'],
        ['staticField', 'Static Field', 1, 0, [], 'nova', 'storm'],
        ['forsePull', 'Forse Pull', 1, 2, [], 'utility', 'magic'],
        ['stormNova', 'Storm Nova', 2, 0, ['staticField'], 'nova', 'storm'],
        ['lightning', 'Lightning', 2, 1, ['sparkBolts'], 'beam', 'storm'],
        ['chainLightning', 'Chain Lightning', 3, 1, ['lightning'], 'chain', 'storm'],
        ['forseBlink', 'Forse Blink', 3, 2, ['forsePull'], 'movement', 'magic'],
        ['stormCloud', 'Storm Cloud', 4, 0, ['stormNova', 'chainLightning'], 'area', 'storm'],
        ['forseShield', 'Forse Shield', 4, 2, ['forseBlink', 'chainLightning'], 'buff', 'magic'],
        ['stormMastery', 'Storm Mastery', 5, 1, [], 'passive', 'storm'],
      ],
    ],
    [
      'forseAdept.cryo',
      'Cryo',
      [
        ['frostArmor', 'Frost Armor', 0, 0, [], 'buff', 'cryo'],
        ['iceBolt', 'Ice Bolt', 0, 1, [], 'missile', 'cryo'],
        ['frostNova', 'Frost Nova', 1, 0, [], 'nova', 'cryo'],
        ['iceBlast', 'Ice Blast', 1, 1, ['iceBolt'], 'missile', 'cryo'],
        ['shiverArmor', 'Shiver Armor', 2, 2, ['iceBlast', 'frostArmor'], 'buff', 'cryo'],
        ['glacialSpike', 'Glacial Spike', 3, 1, ['iceBlast'], 'missile', 'cryo'],
        ['blizzard', 'Blizzard', 4, 0, ['frostNova', 'glacialSpike'], 'area', 'cryo'],
        ['chillArmor', 'Chill Armor', 4, 2, ['shiverArmor'], 'buff', 'cryo'],
        ['frozenOrb', 'Frozen Orb', 5, 1, ['blizzard'], 'missile', 'cryo'],
        ['cryoMastery', 'Cryo Mastery', 5, 2, [], 'passive', 'cryo'],
      ],
    ],
  ],
};
const TIER = [1, 6, 12, 18, 24, 30] as const;
const skills: SkillDef[] = [];
for (const [cid, trees] of Object.entries(TREES) as [ClassId, [string, string, SkSpec[]][]][]) {
  for (const [treeId, , specs] of trees) {
    for (const [id, name, row, col, prereqs, kind, el] of specs) {
      names[`skill.${id}`] = name;
      names[`skill.${id}.desc`] = `${name} (mock): a Wave 2 skill. Hits harder every level!`;
      const dmg = el && kind !== 'passive' && kind !== 'buff';
      skills.push({
        id,
        classId: cid,
        tree: treeId,
        name: `skill.${id}`,
        d2Analog: name,
        description: `skill.${id}.desc`,
        kind,
        reqLevel: TIER[row]!,
        prereqs,
        ui: { col, row, icon: kind },
        maxHardPoints: 20,
        manaCost: kind === 'passive' ? 0 : { base: 3 + row, perLevel: [0.5, 0.5, 0.75, 0.75, 1] },
        ...(el ? { element: el } : {}),
        ...(dmg
          ? {
              damage: {
                [el]: {
                  min: { base: 4 + row * 6, perLevel: [3, 5, 7, 9, 11] },
                  max: { base: 9 + row * 9, perLevel: [5, 7, 9, 11, 13] },
                },
              },
            }
          : {}),
        ...(kind === 'meleeAttack'
          ? {
              weaponDamagePct: { base: 45, perLevel: [5, 6, 7, 8, 9] },
              attackRatingPct: { base: 20, perLevel: [5, 5, 5, 5, 5] },
            }
          : {}),
        ...(kind === 'passive'
          ? {
              mods: [{ stat: 'attackRating', op: 'percent', value: { base: 28, perLevel: [8, 8, 8, 8, 8] } }],
            }
          : {}),
        ...(kind === 'area' || kind === 'nova'
          ? { params: { radius: { base: 2, perLevel: [0.2, 0.2, 0.2, 0.2, 0.2] }, duration: 4 } }
          : {}),
        ...(prereqs[0] && dmg ? { synergies: [{ from: prereqs[0], pctPerLevel: 12, target: el }] } : {}),
        leftClickable: kind === 'meleeAttack',
        vfx: 'vfx.mock',
        anim: 'cast',
      } as SkillDef);
    }
  }
}

registerNames({
  ...names,
  'npc.yoduh': 'Master Yoduh',
  'npc.cantinoVendor': 'Greedo-ish Trader',
  'dlg.yoduh.1': 'Hmm. Strong with the Forse, you are. Misspelled, everything is!',
  'dlg.yoduh.2': 'A tiny error, the Padawon made. Fix it, we must.',
  'dlg.opt.quest': 'Tell me about the Old Comm Tower',
  'dlg.opt.trade': 'Show me your stuff',
  'merc.trooper': 'Rebel Trooper',
  'lvl.a1.outpost': 'Rebel Allowance Outpost',
  'lvl.a1.mossfields': 'Mossfields',
  'lvl.a1.crashSite': 'Crash Site',
  'lvl.a1.standingStones': 'Standing Stones',
  'lvl.a1.darkwood': 'Darkwood',
  'lvl.a1.dagobaa': 'Dagobaa Swamp',
  'lvl.a1.temple': 'Old Yedi Temple',
  'lvl.a1.undercroft': 'Undercroft',
  'lvl.a2.spaceport': 'Moss Easily Spaceport',
  'lvl.a2.duneSea': 'Dune Sea',
  'q.a1.1': 'Clear the Den',
  'q.a1.1.desc': 'Tuskin Raiders took over a cave near the outpost. Clear them all out!',
  'q.a1.2': 'Crash Site',
  'q.a1.2.desc': 'Find the crashed ship and defeat the droyd captain guarding it.',
  'q.a1.3': 'Rescue Master Yoduh',
  'q.a1.3.desc':
    'Master Yoduh is trapped in the Ewokz village. Touch the Standing Stones in the right order.',
  'q.a1.4': 'The Comm Tower',
  'q.a1.5': 'Tools of the Trade',
  'q.a1.6': 'The Old Yedi Temple',
});

// ------------------------------------------------------------------ mock player

const TREE_POINTS: Record<ClassId, Record<string, number>> = {
  yediKnight: {
    litesaberStrike: 5,
    forseLeap: 1,
    twinStrike: 3,
    stunStrike: 1,
    leapStrike: 1,
    focusStrike: 4,
    saberMastery: 8,
    fearRoar: 1,
    rally: 2,
    battleOrders: 1,
    endurance: 1,
  },
  bountyHuntur: {
    vibroJab: 1,
    powerThrust: 4,
    arcJavelin: 6,
    chargedThrust: 2,
    precision: 3,
    dodge: 1,
    avoid: 1,
    toxinDart: 1,
  },
  forseAdept: {
    iceBolt: 7,
    frostArmor: 1,
    frostNova: 1,
    iceBlast: 6,
    glacialSpike: 4,
    blizzard: 1,
    staticField: 1,
    forsePull: 1,
    forseBlink: 1,
    plasmaBolt: 20,
  },
};

const stats: DerivedStats = {
  strength: 58,
  dexterity: 45,
  vitality: 70,
  energy: 25,
  lifeMax: 412,
  manaMax: 96,
  staminaMax: 180,
  lifeRegen: 1.5,
  manaRegenPerSec: 2.1,
  attackRating: 1290,
  defense: 342,
  blockChance: 38,
  res: { plasma: 42, cryo: 75, storm: -12, toxin: 18 },
  physMin: 28,
  physMax: 64,
  elemental: {
    plasma: { min: 3, max: 9 },
    cryo: { min: 0, max: 0 },
    storm: { min: 1, max: 22 },
    toxin: { min: 0, max: 0 },
    magic: { min: 0, max: 0 },
  },
  attackSpeedMul: 1.2,
  castSpeedMul: 1,
  hitRecoveryMul: 1.1,
  blockSpeedMul: 1,
  moveSpeedMul: 1.15,
  raw: { lifeSteal: 6, magicFind: 35, goldFind: 50, crushingBlow: 10, damageReduced: 3 },
  skillBonus: { all: 1, byClass: {}, byTree: {}, bySkill: { saberCyclone: 2 } },
};

const inv: GridContainer = { w: 10, h: 4, items: [] };
const put = (c: GridContainer, item: ItemInstance, x: number, y: number) => c.items.push({ item, x, y });
put(
  inv,
  it('duelistLitesaber', 'rare', {
    label: 'Doom Hum',
    sockets: 2,
    socketed: [],
    lines: [
      ['mod', '+42% Enhanced Damage'],
      ['mod', '+65 to Attack Rating'],
      ['mod', '+20% Attack Speed'],
      ['better', '+12 damage vs. equipped'],
    ],
  }),
  0,
  0,
);
put(
  inv,
  it('plateVest', 'magic', {
    label: 'Sturdy Plate Vest of the Wookie',
    lines: [
      ['mod', '+15 to Vitality'],
      ['mod', '+31% Enhanced Defense'],
    ],
    defense: 41,
  }),
  1,
  0,
);
put(
  inv,
  it('pilotHelm', 'unique', {
    label: "Tarkin't's Thinking Cap",
    lines: [
      ['mod', '+1 to All Skills'],
      ['mod', '+25% Salvage Find'],
      ['flavor', '"I did not misspell it."'],
    ],
  }),
  3,
  0,
);
put(
  inv,
  it('ring', 'rare', {
    label: 'Glyph Coil',
    lines: [
      ['mod', '+18 to Life'],
      ['mod', 'Storm Resist +22%'],
    ],
  }),
  3,
  2,
);
put(inv, it('ring', 'magic', { label: 'Ring of Precision', lines: [['mod', '+40 to Attack Rating']] }), 4, 2);
put(
  inv,
  it('longRifle', 'set', {
    label: "Huntur's Long Shot",
    sockets: 3,
    socketed: [it('kyburRed')],
    lines: [
      ['set', 'Bounty Huntur Gear (2/4)'],
      ['mod', '+3 to Blasturs'],
    ],
  }),
  5,
  0,
);
put(inv, it('baktaStim', 'normal', { quantity: 1 }), 7, 0);
put(inv, it('baktaStim'), 7, 1);
put(inv, it('energyCell'), 8, 0);
put(inv, it('recallBeacon'), 9, 0);
put(inv, it('kyburRed'), 8, 1);
put(inv, it('glyphZod'), 9, 1);
put(inv, it('jumpBoots', 'inferior', { label: 'Cracked Jump Boots' }), 7, 2);

const player: PlayerEntity = {
  id: 1,
  kind: 'player',
  pos: { x: 0, y: 0 },
  facing: 0,
  radius: 0.4,
  alive: true,
  defId: classId,
  team: 'players',
  level: 24,
  life: 380,
  mana: 72,
  stamina: 150,
  stats,
  mode: 'idle',
  modeTime: 0,
  path: [],
  running: true,
  effects: [],
  buffs: [],
  cooldowns: {},
  statsDirty: false,
  modelId: `hero.${classId}`,
  classId,
  name: q.get('name') ?? 'Kix Starwhistle',
  xp: 1_480_000,
  creditz: 12_345,
  statPointsUnspent: Number(q.get('statPts') ?? 5),
  skillPointsUnspent: Number(q.get('skillPts') ?? 3),
  allocated: { strength: 28, dexterity: 25, vitality: 45, energy: 0 },
  skills: { ...TREE_POINTS[classId] },
  leftSkill: 'attack',
  rightSkill: 'attack',
  hotkeys: [],
  equipment: {
    mainHand: it('trainingLitesaber', 'magic', {
      label: 'Glowing Training Litesaber',
      lines: [['mod', '+8% Enhanced Damage']],
      durability: { cur: 3, max: 30 },
    }),
    offHand: it('buckler', 'normal', { sockets: 2, socketed: [it('kyburRed')] }),
    head: it('troopHelm', 'normal'),
    chest: it('flightSuit', 'rare', { label: 'Storm Weave', lines: [['mod', '+22 to Defense']] }),
    gloves: it('gripGloves', 'magic', { label: 'Grip Gloves of Speed' }),
    belt: it('utilityBelt'),
    boots: it('jumpBoots', 'magic', { label: 'Hasty Jump Boots' }),
    ring1: it('ring', 'magic', { label: 'Ring of the Bantha', lines: [['mod', '+12 to Strength']] }),
    amulet: it('amulet', 'unique', { label: 'Holocrumb Pendant', lines: [['mod', '+2 to All Skills']] }),
  },
  swap: {},
  inventory: inv,
  belt: { rows: 2, cols: 4, slots: [] },
  respecs: { normal: 1, veteran: 1, legend: 1 },
};

// ------------------------------------------------------------------ data sources

const grid = (w: number, h: number, list: [ItemInstance, number, number][]): GridContainer => ({
  w,
  h,
  items: list.map(([item, x, y]) => ({ item, x, y })),
});
const stashData = {
  personal: grid(10, 10, [
    [it('towerShield', 'set', { label: "Rebel's Bulwark" }), 0, 0],
    [it('doubleSaber', 'unique', { label: 'The Twin Hum', lines: [['mod', '+200% Enhanced Damage']] }), 2, 0],
    [it('amulet', 'rare', { label: 'Star Charm' }), 9, 9],
    [it('apprenticeStaff', 'magic', { label: 'Staff of Sparks' }), 5, 2],
  ]),
  shared: [grid(10, 10, [[it('kyburFocus', 'magic'), 0, 0]]), grid(10, 10, []), grid(10, 10, [])],
};
const vendorData = {
  npcId: 99,
  nameKey: 'npc.cantinoVendor',
  repairCost: 120,
  stock: grid(10, 10, [
    [it('baktaStim'), 0, 0],
    [it('baktaStim'), 1, 0],
    [it('energyCell'), 2, 0],
    [it('recallBeacon'), 3, 0],
    [it('shockBaton', 'magic', { label: 'Zappy Shock Baton' }), 0, 2],
    [it('scoutBlastur', 'normal'), 1, 2],
    [it('troopHelm', 'magic', { label: 'Lucky Trooper Helmet' }), 3, 2],
    [it('plateVest', 'normal', { sockets: 2 }), 5, 2],
    [it('ring', 'magic', { label: 'Ring of Light' }), 7, 2],
    [it('javelinTrainer', 'normal', { quantity: 40 }), 8, 2],
    [it('gripGloves'), 0, 6],
    [it('jumpBoots', 'magic'), 2, 6],
  ]),
};
const data: PanelDataSource = {
  stash: () => stashData,
  vendor: () => vendorData,
  cube: () =>
    grid(3, 4, [
      [it('kyburRed'), 0, 0],
      [it('kyburRed'), 1, 0],
    ]),
  waypoints: () => ({
    currentLevelId: 'a1.darkwood',
    acts: [
      {
        act: 1,
        unlocked: true,
        levels: [
          'outpost',
          'mossfields',
          'crashSite',
          'standingStones',
          'darkwood',
          'dagobaa',
          'temple',
          'undercroft',
        ].map((l, i) => ({
          id: `a1.${l}`,
          nameKey: `lvl.a1.${l}`,
          unlocked: i < 6,
        })),
      },
      {
        act: 2,
        unlocked: true,
        levels: [
          { id: 'a2.spaceport', nameKey: 'lvl.a2.spaceport', unlocked: true },
          { id: 'a2.duneSea', nameKey: 'lvl.a2.duneSea', unlocked: false },
        ],
      },
      { act: 3, unlocked: false, levels: [] },
      { act: 4, unlocked: false, levels: [] },
    ],
  }),
  quests: () => ({
    currentAct: 1,
    acts: [
      {
        act: 1,
        unlocked: true,
        quests: [
          { id: 'a1q1', nameKey: 'q.a1.1', state: 'done', descKey: 'q.a1.1.desc' },
          { id: 'a1q2', nameKey: 'q.a1.2', state: 'rewardReady', descKey: 'q.a1.2.desc' },
          { id: 'a1q3', nameKey: 'q.a1.3', state: 'active', descKey: 'q.a1.3.desc' },
          { id: 'a1q4', nameKey: 'q.a1.4', state: 'notStarted' },
          { id: 'a1q5', nameKey: 'q.a1.5', state: 'notStarted' },
          { id: 'a1q6', nameKey: 'q.a1.6', state: 'notStarted' },
        ],
      },
      { act: 2, unlocked: true, quests: [] },
      { act: 3, unlocked: false, quests: [] },
      { act: 4, unlocked: false, quests: [] },
    ],
  }),
  dialogue: () => ({
    npcId: 7,
    nameKey: 'npc.yoduh',
    lines: ['dlg.yoduh.1', 'dlg.yoduh.2'],
    options: [
      { id: 'quest', labelKey: 'dlg.opt.quest' },
      { id: 'trade', labelKey: 'dlg.opt.trade' },
    ],
  }),
  merc: () => ({
    name: 'Sgt. Pebbles',
    typeKey: 'merc.trooper',
    level: 21,
    life: 260,
    lifeMax: 340,
    alive: true,
    equipment: { head: it('troopHelm'), mainHand: it('scoutBlastur', 'magic'), chest: it('flightSuit') },
    stats: [
      { label: 'Damage', value: '12-30' },
      { label: 'Defense', value: '210' },
    ],
  }),
};

const services: Partial<PanelServices> = {
  itemSize: (item) => baseMap.get(item.base)?.size ?? { w: 1, h: 1 },
  itemBase: (id) => baseMap.get(id),
  describeItem: describeMock,
  skillsForClass: (id) => skills.filter((s) => s.classId === id),
  classDef: (id) => DB.classes.get(id),
};

// ------------------------------------------------------------------ mock UiApi

const settings = signal<Settings>({
  masterVolume: 0.8,
  musicVolume: 0.6,
  sfxVolume: 0.9,
  voiceVolume: 0.9,
  movement: 'auto',
  showBuildGuide: q.get('guide') === '1',
  showStatHints: q.get('hints') !== '0',
  lootFilter: 'all',
  screenShake: true,
  colorblind: (q.get('cb') as Settings['colorblind']) ?? 'none',
  textScale: Number(q.get('text') ?? 1),
  readAloud: false,
  quality: 'auto',
  sessionTimerMin: 0,
});

const view: WorldView = {
  tick: 0,
  time: 0,
  difficulty: (q.get('diff') as WorldView['difficulty']) ?? 'veteran',
  level: null,
  localPlayerId: 1,
  paused: false,
  get: (id) => (id === 1 ? (player as Entity) : undefined),
  all: () => [player as Entity],
  frameEvents: [],
};

const open = (q.get('open') ?? 'inventory,character').split(',').filter(Boolean) as PanelId[];
const store: UiStore = {
  frame: signal(0),
  view: signal(view),
  openPanels: signal(open),
  settings,
  hoveredEntity: signal(null),
  interactNpc: signal(null),
  isTouch: signal(false),
  worldToScreen: () => null,
};

const bump = () => (store.frame.value = store.frame.value + 1);

function containerOf(ref: string): GridContainer | null {
  if (ref === 'inventory') return player.inventory;
  if (ref === 'stash') return stashData.personal;
  if (ref === 'vendor') return vendorData.stock;
  return null;
}
function take(uid: string): ItemInstance | null {
  for (const c of [player.inventory, stashData.personal, vendorData.stock]) {
    const i = c.items.findIndex((e) => e.item.uid === uid);
    if (i >= 0) return c.items.splice(i, 1)[0]!.item;
  }
  for (const [slot, item] of Object.entries(player.equipment)) {
    if (item?.uid === uid) {
      delete player.equipment[slot as EquipSlot];
      return item;
    }
  }
  return null;
}
function freeSpot(c: GridContainer, item: ItemInstance) {
  const s = baseMap.get(item.base)?.size ?? { w: 1, h: 1 };
  for (let y = 0; y + s.h <= c.h; y++)
    for (let x = 0; x + s.w <= c.w; x++) {
      const hit = c.items.some((e) => {
        const es = baseMap.get(e.item.base)?.size ?? { w: 1, h: 1 };
        return x < e.x + es.w && x + s.w > e.x && y < e.y + es.h && y + s.h > e.y;
      });
      if (!hit) return { x, y };
    }
  return null;
}

const log: Command[] = [];
(window as unknown as { __cmds: Command[] }).__cmds = log;

const api: UiApi = {
  store,
  dispatch(cmd) {
    log.push(cmd);
    console.log('[cmd]', JSON.stringify(cmd));
    switch (cmd.type) {
      case 'allocateStat':
        player.allocated[cmd.stat] += cmd.amount;
        player.stats = { ...player.stats, [cmd.stat]: player.stats[cmd.stat] + cmd.amount };
        player.statPointsUnspent -= cmd.amount;
        break;
      case 'allocateSkill':
        player.skills[cmd.skillId] = (player.skills[cmd.skillId] ?? 0) + 1;
        player.skillPointsUnspent -= 1;
        break;
      case 'moveItem': {
        const to = containerOf(cmd.to);
        const item = take(cmd.uid);
        if (item && to) {
          const spot =
            cmd.x !== undefined && cmd.y !== undefined ? { x: cmd.x, y: cmd.y } : freeSpot(to, item);
          if (spot) to.items.push({ item, ...spot });
        }
        break;
      }
      case 'equip': {
        const old = player.equipment[cmd.slot];
        const item = take(cmd.uid);
        if (!item) break;
        if (old) {
          const spot = freeSpot(player.inventory, old);
          if (spot) player.inventory.items.push({ item: old, ...spot });
        }
        player.equipment[cmd.slot] = item;
        break;
      }
      case 'unequip': {
        const item = player.equipment[cmd.slot];
        const spot = item && freeSpot(player.inventory, item);
        if (item && spot) {
          delete player.equipment[cmd.slot];
          player.inventory.items.push({ item, ...spot });
        }
        break;
      }
      case 'dropItem':
      case 'useItem':
      case 'sellItem':
        take(cmd.uid);
        break;
      case 'buyItem': {
        const src = vendorData.stock.items.find((e) => e.item.uid === cmd.uid);
        const spot = src && freeSpot(player.inventory, src.item);
        if (src && spot) player.inventory.items.push({ item: { ...src.item, uid: `u${uidN++}` }, ...spot });
        break;
      }
    }
    bump();
  },
  onEvents: () => () => {},
  togglePanel(id) {
    const cur = store.openPanels.value;
    store.openPanels.value = cur.includes(id) ? cur.filter((p) => p !== id) : [...cur, id];
  },
  closeAllPanels() {
    store.openPanels.value = [];
  },
  updateSettings(patch) {
    settings.value = { ...settings.value, ...patch };
  },
};
(window as unknown as { __api: UiApi }).__api = api;

// ------------------------------------------------------------------ mount

const root = document.getElementById('ui-root')!;
const menu = q.get('menu');
if (menu) {
  const chars = [
    {
      id: 'a',
      name: 'Kix Starwhistle',
      classId: 'yediKnight' as const,
      level: 24,
      updatedAt: Date.now() - 5 * 60000,
    },
    {
      id: 'b',
      name: 'Nova',
      classId: 'forseAdept' as const,
      level: 11,
      updatedAt: Date.now() - 26 * 3600000,
    },
    {
      id: 'c',
      name: 'Rook',
      classId: 'bountyHuntur' as const,
      level: 3,
      updatedAt: Date.now() - 3 * 86400000,
    },
  ];
  const App = () => (
    <MainMenu
      characters={q.get('empty') ? [] : chars}
      lastCharacterId="a"
      settings={settings.value}
      initialScreen={menu as 'title'}
      version="0.1.0"
      onPlay={(id) => console.log('[menu] play', id)}
      onCreate={(c) => console.log('[menu] create', JSON.stringify(c))}
      onDelete={(id) => console.log('[menu] delete', id)}
      onUpdateSettings={(p) => api.updateSettings(p)}
    />
  );
  render(<App />, root);
} else {
  render(
    <Panels api={api} data={data} services={services} onQuitToMenu={() => console.log('[menu] quit')} />,
    root,
  );
  const bar = document.createElement('div');
  bar.id = 'dev-bar';
  for (const id of [
    'inventory',
    'character',
    'skills',
    'quests',
    'stash',
    'vendor',
    'waypoint',
    'merc',
    'cube',
    'options',
    'dialogue',
    'menu',
  ] as PanelId[]) {
    const b = document.createElement('button');
    b.textContent = id;
    b.onclick = () => api.togglePanel(id);
    bar.appendChild(b);
  }
  if (!q.get('nobar')) document.body.appendChild(bar);
}
