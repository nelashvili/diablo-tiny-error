/**
 * THE single source of display names (PLAN §2a). Everything visible goes through `t(key)`.
 * Parody "funny typo" names live here so they can be swapped in one place.
 *
 * Content agents ADD keys in their own namespaced files under data/names/ and register them
 * via `registerNames`. This file holds the shared glossary.
 */
const names: Record<string, string> = {
  'game.title': 'Diablo Tiny Error',
  'game.subtitle': 'A long time ago, in a galaxy slightly misspelled...',

  // glossary
  'g.yedi': 'Yedi',
  'g.syth': 'Syth',
  'g.padawon': 'Padawon',
  'g.forse': 'the Forse',
  'g.litesaber': 'Litesaber',
  'g.blastur': 'Blastur',
  'g.droyd': 'Droyd',
  'g.normtrooper': 'Normtrooper',
  'g.rebelAllowance': 'Rebel Allowance',
  'g.galacticUmpire': 'Galactic Umpire',
  'g.deafStar': 'Deaf Star',
  'g.millenniumFalcone': 'Millennium Falcone',
  'g.darthVapor': 'Darth Vapor',
  'g.emperorPalpitate': 'Emperor Palpitate',
  'g.darthMole': 'Darth Mole',
  'g.countDooky': 'Count Dooky',
  'g.generalGrevious': 'General Grevious',
  'g.tarkint': "Grand Moff Tarkin't",
  'g.yoduh': 'Master Yoduh',
  'g.jabbo': 'Jabbo the Hutz',
  'g.wookieCookie': 'Wookie-Cookie',
  'g.ewokz': 'Ewokz',
  'g.jawwa': 'Jawwa',
  'g.tuskin': 'Tuskin Raider',
  'g.sarlack': 'the Great Sarlack',
  'g.rankor': 'Rankor',
  'g.wompa': 'Wompa',
  'g.banthaa': 'Banthaa',
  'g.porg': 'Porg',
  'g.holocrumb': 'Holocrumb',
  'g.kybur': 'Kybur',
  'g.bakta': 'Bakta',
  'g.creditz': 'Creditz',
  'g.cantino': 'Cantino',
  'g.tatoonie': 'Tatoonie',
  'g.endoor': 'Endoor',
  'g.dagobaa': 'Dagobaa',
  'g.kashyyyyyk': 'Kashyyyyyk',
  'g.mossEasily': 'Moss Easily',
  'g.sandcrawlr': 'Sandcrawlr',
  'g.atatWalkur': 'AT-AT Walkur',
  'g.theError': 'The Error',

  // classes
  'class.yediKnight': 'Yedi Knight',
  'class.bountyHuntur': 'Bounty Huntur',
  'class.forseAdept': 'Forse Adept',
  'resource.energy': 'Energy',
  'resource.forse': 'Forse',

  // difficulties
  'difficulty.normal': 'Normal',
  'difficulty.veteran': 'Veteran',
  'difficulty.legend': 'Legend',

  // damage types
  'dmg.physical': 'Physical',
  'dmg.plasma': 'Plasma',
  'dmg.cryo': 'Cryo',
  'dmg.storm': 'Storm',
  'dmg.toxin': 'Toxin',
  'dmg.magic': 'Magic',
};

export function registerNames(entries: Record<string, string>): void {
  for (const [k, v] of Object.entries(entries)) {
    if (k in names && names[k] !== v) console.warn(`[names] overriding key ${k}`);
    names[k] = v;
  }
}

/** Translate a NameKey. `{param}` placeholders are substituted. Unknown keys render as the key. */
export function t(key: string, params?: Record<string, string | number>): string {
  let s = names[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function hasName(key: string): boolean {
  return key in names;
}
