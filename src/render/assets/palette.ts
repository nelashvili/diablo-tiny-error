/**
 * Painted palette for the flat-colored CC0 kits (Kenney Nature Kit and friends), by glTF material
 * name. Their stock colors are bright pastels (teal leaves, orange bark) that clash with the painted
 * ground; these earthier sRGB tones replace them when the material is converted to toon.
 */
export const MATERIAL_PALETTE: Readonly<Record<string, number>> = {
  grass: 0x6f8f46,
  leafsGreen: 0x5d8a3a,
  leafsDark: 0x3c6638,
  leafsFall: 0xc07a32,
  dirt: 0x8c7d6c,
  dirtDark: 0x6a5c4c,
  rock: 0x8a7f74,
  rockTrack: 0x9a8e80,
  stone: 0xa9aaa2,
  stoneDark: 0x7d817c,
  woodBark: 0x6e5038,
  woodBarkDark: 0x4f3b2c,
  wood: 0x9a6c46,
  woodDark: 0x6e4b31,
  woodBirch: 0xd8d0c0,
  crystal: 0x4fd0b0,
};
