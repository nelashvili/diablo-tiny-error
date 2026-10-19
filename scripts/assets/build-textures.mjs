// Ground textures for the splat terrain (render/terrain): resized, JPEG-encoded copies of CC0 tiles.
// Usage: ASSET_SRC=/path/to/downloads node scripts/assets/build-textures.mjs   (macOS: uses `sips`)
// ASSET_SRC layout (see ~/github/diablo-asset-src/SOURCES.md):
//   textures/drummyfish/  "4 hand painted ground textures" (+ extras), OpenGameArt, CC0
//   textures/luminous/    "Simple seamless dirt and sand tiles" (LuminousDragonGames), OpenGameArt, CC0
// Writes public/assets/textures/ground/<name>.jpg and records sources in textures-sources.json.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = process.env.ASSET_SRC;
if (!SRC) throw new Error('set ASSET_SRC');
const OUT = path.join(ROOT, 'public/assets/textures/ground');

/** name -> [source under ASSET_SRC/textures, size px] */
export const GROUND_TEXTURES = {
  grass: ['drummyfish/grass_34.png', 512],
  grassDark: ['drummyfish/grass_38.png', 512],
  moss: ['drummyfish/grass_dev1.png', 512],
  dirt: ['luminous/Dirt_4.png', 512],
  dirtDark: ['luminous/Dirt_1.png', 512],
  dirtCracked: ['drummyfish/dirt_9.png', 512],
  sand: ['luminous/Sand2.png', 512],
  sandWaves: ['drummyfish/sand_8.png', 512],
  cobble: ['drummyfish/pavement_1.png', 512],
};

fs.mkdirSync(OUT, { recursive: true });
const sources = {};
for (const [name, [src, size]] of Object.entries(GROUND_TEXTURES)) {
  const out = path.join(OUT, `${name}.jpg`);
  execFileSync(
    'sips',
    [
      '-z',
      String(size),
      String(size),
      '-s',
      'format',
      'jpeg',
      '-s',
      'formatOptions',
      '82',
      path.join(SRC, 'textures', src),
      '--out',
      out,
    ],
    { stdio: 'ignore' },
  );
  sources[`textures/ground/${name}.jpg`] = `textures/${src}`;
  console.log(name, fs.statSync(out).size);
}
fs.writeFileSync(
  path.join(ROOT, 'scripts/assets/textures-sources.json'),
  JSON.stringify(sources, null, 2) + '\n',
);
