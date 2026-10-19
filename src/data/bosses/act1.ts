import type { BossDef } from '../schema';

const tcFor = (key: string) => ({
  normal: `tc.a1.${key}.normal`,
  veteran: `tc.a1.${key}.veteran`,
  legend: `tc.a1.${key}.legend`,
});

/** Act I bosses & superuniques (D2 analogs in comments). */
export default [
  {
    // Andariel
    id: 'countDooky',
    monster: 'countDooky',
    name: 'boss.countDooky',
    mods: [],
    minions: { monster: 'scrapDroyd', count: { min: 0, max: 0 } },
    level: { normal: 12, veteran: 36, legend: 63 },
    treasure: tcFor('countDooky'),
    intro: 'boss.countDooky.intro',
  },
  {
    // Corpsefire
    id: 'captainScrapfire',
    monster: 'tuskinRaider',
    name: 'boss.captainScrapfire',
    // D2 Corpsefire is Spectral Hit; Plasma Enchanted (75% plasma res on him and every minion) walled
    // off the whole plasma tree at the first boss.
    mods: ['spectralHit', 'extraStrong'],
    minions: { monster: 'tuskinRaider', count: { min: 3, max: 5 } },
    level: { normal: 3, veteran: 33, legend: 60 },
    treasure: tcFor('superunique'),
    intro: 'boss.captainScrapfire.intro',
  },
  {
    // Bishibosh
    id: 'bishyBosh',
    monster: 'jawwa',
    name: 'boss.bishyBosh',
    mods: ['extraFast', 'cursed'],
    minions: { monster: 'scrapDroyd', count: { min: 4, max: 6 } },
    level: { normal: 5, veteran: 34, legend: 61 },
    treasure: tcFor('superunique'),
    intro: 'boss.bishyBosh.intro',
  },
  {
    // Rakanishu
    id: 'rakanishoo',
    monster: 'jawwa',
    name: 'boss.rakanishoo',
    mods: ['stormEnchanted', 'teleport'],
    minions: { monster: 'jawwa', count: { min: 2, max: 3 } },
    level: { normal: 4, veteran: 35, legend: 62 },
    treasure: tcFor('superunique'),
    intro: 'boss.rakanishoo.intro',
  },
  {
    // Griswold
    id: 'grizzwaldRustySmith',
    monster: 'grizzwald',
    name: 'boss.grizzwald',
    // D2 Griswold is Cursed + Extra Strong; Stone Skin on top of his armor made melee land ~1 swing in 10.
    mods: ['extraStrong', 'cursed', 'magicResistant'],
    minions: { monster: 'tuskinRaider', count: { min: 2, max: 3 } },
    level: { normal: 7, veteran: 36, legend: 63 },
    treasure: tcFor('superunique'),
    intro: 'boss.grizzwald.intro',
  },
  {
    // The Countess
    id: 'theCountezz',
    monster: 'countezz',
    name: 'boss.countezz',
    mods: ['plasmaEnchanted', 'multishot'],
    minions: { monster: 'shadowWraith', count: { min: 2, max: 4 } },
    level: { normal: 10, veteran: 38, legend: 64 },
    treasure: tcFor('superunique'),
    intro: 'boss.countezz.intro',
  },
] satisfies BossDef[];
