/**
 * Audio catalog: id -> files. All files are under /assets/audio (see assets/manifest.json for licenses).
 * Ids follow the audio system's lookup order: `skill.<skillId>`, `death.droyd`, `death.organic`,
 * `hit.<damageType>`, `itemDrop.<quality>`, `music.<mood>` (town|wild|dungeon|boss), or any direct id.
 * `urls` lists alternate encodings of ONE clip (first = preferred ogg, then mp3 fallback).
 * `variants` (optional) lists other catalog ids that sound alike; pick one at random with `pickVariant`.
 */
export interface AudioEntry {
  id: string;
  urls: string[];
  volume?: number;
  loop?: boolean;
  /** Suggested random playback-rate range for variation. */
  rate?: [number, number];
  /** Other entry ids to randomly alternate with (includes none of itself). */
  variants?: string[];
  /** License id; resolve details via assets/manifest.json (matching `path` of the files). */
  license: 'CC0-1.0';
  category: 'sfx' | 'music';
}

const sfx = (name: string, volume = 0.8, extra: Partial<AudioEntry> = {}): Omit<AudioEntry, 'id'> => ({
  urls: [`/assets/audio/sfx/${name}.ogg`, `/assets/audio/sfx/${name}.mp3`],
  volume,
  license: 'CC0-1.0',
  category: 'sfx',
  ...extra,
});
const music = (name: string, volume = 0.5): Omit<AudioEntry, 'id'> => ({
  urls: [`/assets/audio/music/${name}.ogg`, `/assets/audio/music/${name}.mp3`],
  volume,
  loop: true,
  license: 'CC0-1.0',
  category: 'music',
});

const RAW: Record<string, Omit<AudioEntry, 'id'>> = {
  // --- weapons ---
  'sfx.blasturShot': sfx('blastur_shot_1', 0.55, {
    variants: ['sfx.blasturShot.2', 'sfx.blasturShot.3'],
    rate: [0.95, 1.1],
  }),
  'sfx.blasturShot.2': sfx('blastur_shot_2', 0.55, { rate: [0.95, 1.1] }),
  'sfx.blasturShot.3': sfx('blastur_shot_3', 0.55, { rate: [0.95, 1.1] }),
  'sfx.blasturHeavy': sfx('blastur_heavy_1', 0.65),
  'sfx.saberSwing': sfx('saber_swing_1', 0.6, {
    variants: ['sfx.saberSwing.2', 'sfx.saberSwing.3'],
    rate: [0.9, 1.15],
  }),
  'sfx.saberSwing.2': sfx('saber_swing_2', 0.6, { rate: [0.9, 1.15] }),
  'sfx.saberSwing.3': sfx('saber_swing_3', 0.6, { rate: [0.9, 1.15] }),
  'sfx.saberClash': sfx('saber_clash_1', 0.7, { variants: ['sfx.saberClash.2'] }),
  'sfx.saberClash.2': sfx('saber_clash_2', 0.7),
  // --- hits by damage type (audio system: hit.<dtype>) ---
  'hit.physical': sfx('hit_1', 0.8, {
    variants: ['hit.physical.2', 'hit.physical.3'],
    rate: [0.9, 1.1],
  }),
  'hit.physical.2': sfx('hit_2', 0.8, { rate: [0.9, 1.1] }),
  'hit.physical.3': sfx('hit_3', 0.8, { rate: [0.9, 1.1] }),
  'hit.plasma': sfx('droyd_sparks_1', 0.45, { rate: [0.9, 1.2], variants: ['hit.plasma.2'] }),
  'hit.plasma.2': sfx('droyd_sparks_2', 0.4, { rate: [0.8, 1.05] }),
  'hit.cryo': sfx('hit_metal_2', 0.5, { rate: [1.2, 1.5] }),
  'hit.storm': sfx('droyd_sparks_2', 0.45, { rate: [1, 1.2], variants: ['hit.storm.2'] }),
  'hit.storm.2': sfx('droyd_sparks_1', 0.4, { rate: [1.15, 1.35] }),
  'hit.toxin': sfx('smoke_poof_2', 0.6, { rate: [0.7, 0.9] }),
  'hit.magic': sfx('forse_cast', 0.4, { rate: [1.1, 1.4] }),
  'hit.metal': sfx('hit_metal_1', 0.7, { variants: ['hit.metal.2'] }),
  'hit.metal.2': sfx('hit_metal_2', 0.6),
  // --- deaths (audio system: death.droyd / death.organic) ---
  'death.droyd': sfx('droyd_death_1', 0.6, { variants: ['death.droyd.2'], rate: [0.95, 1.1] }),
  'death.droyd.2': sfx('droyd_death_2', 0.6, { rate: [0.95, 1.1] }),
  'death.organic': sfx('smoke_poof_1', 0.7, { variants: ['death.organic.2'], rate: [0.85, 1.1] }),
  'death.organic.2': sfx('smoke_poof_2', 0.7, { rate: [0.85, 1.1] }),
  'sfx.sparks': sfx('droyd_sparks_1', 0.5),
  'sfx.smokePoof': sfx('smoke_poof_1', 0.7),
  // --- skills (audio system: skill.<skillId>; ids unknown here so only generic fallbacks) ---
  'skill.default': sfx('skill_cast', 0.5),
  'skill.forse': sfx('forse_cast', 0.5),
  'skill.saber': sfx('saber_swing_2', 0.6),
  'skill.blastur': sfx('blastur_shot_2', 0.55),
  // --- movement ---
  'sfx.footstep': sfx('footstep_1', 0.35, {
    variants: ['sfx.footstep.2', 'sfx.footstep.3', 'sfx.footstep.4'],
    rate: [0.9, 1.1],
  }),
  'sfx.footstep.2': sfx('footstep_2', 0.35, { rate: [0.9, 1.1] }),
  'sfx.footstep.3': sfx('footstep_3', 0.35, { rate: [0.9, 1.1] }),
  'sfx.footstep.4': sfx('footstep_4', 0.35, { rate: [0.9, 1.1] }),
  // --- ui ---
  'sfx.uiClick': sfx('ui_click_1', 0.6, { variants: ['sfx.uiClick.2'] }),
  'sfx.uiClick.2': sfx('ui_click_2', 0.6),
  'sfx.uiHover': sfx('ui_hover', 0.3),
  'sfx.uiOpen': sfx('ui_open', 0.6),
  'sfx.uiClose': sfx('ui_close', 0.6),
  'sfx.uiError': sfx('ui_error', 0.5),
  // --- progression / items ---
  'sfx.levelUp': sfx('level_up', 0.8),
  'itemDrop.normal': sfx('item_drop', 0.6),
  'itemDrop.inferior': sfx('item_drop', 0.5),
  'itemDrop.magic': sfx('item_drop', 0.7, { rate: [1.1, 1.2] }),
  'itemDrop.rare': sfx('hit_metal_1', 0.7, { rate: [1.1, 1.3] }),
  'itemDrop.set': sfx('waypoint', 0.6, { rate: [1.2, 1.3] }),
  'itemDrop.unique': sfx('level_up', 0.55, { rate: [1.1, 1.2] }),
  'itemDrop.crafted': sfx('hit_metal_1', 0.7, { rate: [0.9, 1] }),
  'sfx.itemPickup': sfx('item_pickup', 0.6),
  'sfx.creditsPickup': sfx('credits_pickup_1', 0.6, { variants: ['sfx.creditsPickup.2'] }),
  'sfx.creditsPickup.2': sfx('credits_pickup_2', 0.6),
  'sfx.stimDrink': sfx('stim_drink', 0.7),
  // --- world ---
  'sfx.portalOpen': sfx('portal_open', 0.7),
  'sfx.portalEnter': sfx('portal_enter', 0.7),
  'sfx.waypoint': sfx('waypoint', 0.7),
  'sfx.chestOpen': sfx('chest_open', 0.7),
  'sfx.doorOpen': sfx('door_open', 0.6),
  // --- music (audio system: music.<mood>) ---
  'music.town': music('town_theme', 0.45),
  'music.wild': music('wilderness_theme', 0.45),
  'music.dungeon': music('wilderness_theme', 0.4),
  'music.boss': music('boss_theme', 0.5),
};

export const AUDIO_CATALOG: Record<string, AudioEntry> = Object.fromEntries(
  Object.entries(RAW).map(([id, e]) => [id, { id, ...e }]),
);

export function getAudioEntry(id: string): AudioEntry | undefined {
  return AUDIO_CATALOG[id];
}

/** Randomly choose between an entry and its variants. `rand` in [0,1). */
export function pickVariant(id: string, rand: number): AudioEntry | undefined {
  const e = AUDIO_CATALOG[id];
  if (!e?.variants?.length) return e;
  const all = [id, ...e.variants];
  const pick = all[Math.min(all.length - 1, Math.floor(rand * all.length))];
  return pick === undefined ? e : AUDIO_CATALOG[pick];
}
