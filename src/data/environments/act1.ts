/** Act I: Endoor, a misty forest moon. Outdoor areas follow the day/night clock; caves and the temple don't. */
import type { EnvDef, EnvLightDef } from '../schema';

/** Endoor's forest light; each area tweaks it. */
const FOREST_DAY: EnvLightDef = {
  sky: 0xbfe6c0,
  ground: 0x24301c,
  hemi: 1.0,
  sun: 0xe8f2c0,
  sunI: 2.0,
  bg: 0x0a120b,
  playerLight: 0xd8ffc0,
  playerLightI: 8,
};
const FOREST_DAWN: EnvLightDef = {
  sky: 0xd8c8d8,
  ground: 0x2a2620,
  hemi: 0.95,
  sun: 0xffc8a0,
  sunI: 1.5,
  bg: 0x100c10,
  playerLight: 0xffe0c0,
  playerLightI: 10,
  mapLights: 1.3,
};
const FOREST_DUSK: EnvLightDef = {
  sky: 0xc8b8b0,
  ground: 0x2a2020,
  hemi: 0.95,
  sun: 0xffbc88,
  sunI: 1.6,
  bg: 0x100a0a,
  playerLight: 0xffd8b0,
  playerLightI: 11,
  mapLights: 1.5,
};
// Night stays readable: a bright blue moon, a stronger hero light and brighter torches.
const FOREST_NIGHT: EnvLightDef = {
  sky: 0x7a98c8,
  ground: 0x1c2634,
  hemi: 0.95,
  sun: 0xa8c0ff,
  sunI: 1.15,
  bg: 0x04070c,
  playerLight: 0xffd8a8,
  playerLightI: 16,
  mapLights: 1.9,
};

const forest = (
  o: Partial<EnvLightDef> = {},
  n: Partial<EnvLightDef> = {},
): NonNullable<EnvDef['cycle']> => ({
  dawn: { ...FOREST_DAWN, ...o },
  dusk: { ...FOREST_DUSK, ...o },
  night: { ...FOREST_NIGHT, ...n },
});

const UNDERGROUND: EnvLightDef = {
  sky: 0x8aa0d0,
  ground: 0x1a1c28,
  hemi: 0.75,
  sun: 0xa8bce8,
  sunI: 1.4,
  bg: 0x06070d,
  playerLight: 0xbad0ff,
  playerLightI: 10,
};

const envs: EnvDef[] = [
  {
    id: 'outpost',
    grade: 'outpost',
    day: { ...FOREST_DAY, sky: 0xd8e6c8, sun: 0xfff0d0, sunI: 2.1, playerLight: 0xffe8c0 },
    cycle: forest({}, { mapLights: 2.2 }),
  },
  {
    id: 'mist',
    grade: 'mist',
    day: { ...FOREST_DAY, sky: 0xc8e8d8, hemi: 1.05, sunI: 1.9 },
    cycle: forest(),
  },
  {
    id: 'smoke',
    grade: 'smoke',
    day: { ...FOREST_DAY, sky: 0xc8c4b0, ground: 0x2a261c, sun: 0xf0dcb0, sunI: 1.8 },
    cycle: forest({}, { mapLights: 2.2 }),
  },
  {
    id: 'embers',
    grade: 'embers',
    day: { ...FOREST_DAY, sky: 0xd8d0b0, ground: 0x30201a, sun: 0xffd8a8 },
    cycle: forest({}, { sky: 0x7a78a8, mapLights: 2.4 }),
  },
  {
    id: 'gloom',
    grade: 'gloom',
    day: { ...FOREST_DAY, sky: 0x9cc0a8, ground: 0x18221a, hemi: 0.9, sunI: 1.6, bg: 0x060c08 },
    cycle: forest({ hemi: 0.8, sunI: 1.3 }, { hemi: 0.75, sunI: 0.9 }),
  },
  {
    id: 'fog',
    grade: 'fog',
    day: { ...FOREST_DAY, sky: 0xc0d8c8, ground: 0x283428, hemi: 1.1, sunI: 1.6 },
    cycle: forest({ hemi: 1.0 }, { sky: 0x6a90a8, hemi: 0.85 }),
  },
  { id: 'cave', grade: 'cave', day: { ...UNDERGROUND, sky: 0x9a9080, ground: 0x1c1812, sun: 0xc8b8a0 } },
  { id: 'temple', grade: 'temple', day: { ...UNDERGROUND, sky: 0xa0a8c8, sun: 0xc0c8e8, sunI: 1.5 } },
  { id: 'crypt', grade: 'crypt', day: { ...UNDERGROUND, hemi: 0.7, sunI: 1.2, playerLightI: 11 } },
];

export default envs;
