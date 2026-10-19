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
  fog: { color: 0x9cb8a8, near: 16, far: 38 },
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
  // Morning mist.
  fog: { color: 0xb8b0b8, near: 9, far: 28 },
  mist: 0.6,
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
  fog: { color: 0x584440, near: 13, far: 32 },
  mist: 0.2,
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
  // The dark closes in around the hero (D2's light radius).
  fog: { color: 0x0a1424, near: 8, far: 22 },
  mist: 0.3,
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
  fog: { color: 0x06070d, near: 10, far: 26 },
};

const envs: EnvDef[] = [
  {
    id: 'outpost',
    weather: [
      { kind: 'clear', weight: 7 },
      { kind: 'rain', weight: 3 },
    ],
    grade: 'outpost',
    day: {
      ...FOREST_DAY,
      sky: 0xd8e6c8,
      sun: 0xfff0d0,
      sunI: 2.1,
      playerLight: 0xffe8c0,
      fog: { color: 0xb0c4b0, near: 20, far: 44 },
    },
    cycle: forest({}, { mapLights: 2.2 }),
  },
  {
    id: 'mist',
    weather: [
      { kind: 'clear', weight: 5 },
      { kind: 'rain', weight: 3 },
      { kind: 'storm', weight: 1 },
    ],
    grade: 'mist',
    day: {
      ...FOREST_DAY,
      sky: 0xc8e8d8,
      hemi: 1.05,
      sunI: 1.9,
      fog: { color: 0xa8c8b8, near: 11, far: 30 },
      mist: 0.4,
    },
    cycle: forest(),
  },
  {
    id: 'smoke',
    weather: [
      { kind: 'ash', weight: 6 },
      { kind: 'clear', weight: 4 },
    ],
    grade: 'smoke',
    day: {
      ...FOREST_DAY,
      sky: 0xc8c4b0,
      ground: 0x2a261c,
      sun: 0xf0dcb0,
      sunI: 1.8,
      fog: { color: 0x8a8274, near: 11, far: 30 },
    },
    cycle: forest({}, { mapLights: 2.2 }),
  },
  {
    id: 'embers',
    weather: [
      { kind: 'embers', weight: 6 },
      { kind: 'rain', weight: 2 },
      { kind: 'clear', weight: 2 },
    ],
    grade: 'embers',
    day: {
      ...FOREST_DAY,
      sky: 0xd8d0b0,
      ground: 0x30201a,
      sun: 0xffd8a8,
      fog: { color: 0x8a7060, near: 14, far: 34 },
    },
    cycle: forest({}, { sky: 0x7a78a8, mapLights: 2.4 }),
  },
  {
    id: 'gloom',
    weather: [
      { kind: 'clear', weight: 4 },
      { kind: 'rain', weight: 3 },
      { kind: 'storm', weight: 2 },
      { kind: 'spores', weight: 1 },
    ],
    grade: 'gloom',
    day: {
      ...FOREST_DAY,
      sky: 0x9cc0a8,
      ground: 0x18221a,
      hemi: 0.9,
      sunI: 1.6,
      bg: 0x060c08,
      fog: { color: 0x1c2c22, near: 10, far: 26 },
      mist: 0.35,
    },
    cycle: forest(
      { hemi: 0.8, sunI: 1.3, mist: 0.6 },
      { hemi: 0.85, sunI: 0.9, fog: { color: 0x08100c, near: 7, far: 20 }, mist: 0.5 },
    ),
  },
  {
    id: 'fog',
    weather: [
      { kind: 'spores', weight: 4 },
      { kind: 'rain', weight: 4 },
      { kind: 'clear', weight: 2 },
    ],
    grade: 'fog',
    day: {
      ...FOREST_DAY,
      sky: 0xc0d8c8,
      ground: 0x283428,
      hemi: 1.1,
      sunI: 1.6,
      fog: { color: 0xa0b8b0, near: 6, far: 22 },
      mist: 0.9,
    },
    cycle: forest(
      { hemi: 1.0, fog: { color: 0x9aa8a8, near: 6, far: 22 }, mist: 1 },
      { sky: 0x6a90a8, hemi: 0.95, fog: { color: 0x1a2a34, near: 6, far: 20 }, mist: 0.9 },
    ),
  },
  {
    id: 'cave',
    grade: 'cave',
    day: {
      ...UNDERGROUND,
      sky: 0xa8a4a8,
      ground: 0x1e1a18,
      hemi: 0.95,
      sun: 0xd0c4b0,
      sunI: 1.6,
      fog: { color: 0x0a0808, near: 12, far: 30 },
    },
  },
  { id: 'temple', grade: 'temple', day: { ...UNDERGROUND, sky: 0xa0a8c8, sun: 0xc0c8e8, sunI: 1.5 } },
  {
    id: 'crypt',
    grade: 'crypt',
    day: {
      ...UNDERGROUND,
      hemi: 0.7,
      sunI: 1.2,
      playerLightI: 11,
      fog: { color: 0x05060c, near: 8, far: 23 },
      // Cold air pooled on the crypt floor.
      mist: 0.22,
    },
  },
];

export default envs;
