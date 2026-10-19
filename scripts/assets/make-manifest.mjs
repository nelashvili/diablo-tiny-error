// Generates assets/manifest.json: one entry per file committed under public/assets.
// Usage: node scripts/assets/make-manifest.mjs   (pure node; reads models-sources.json + sfx-table.mjs)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SFX } from './sfx-table.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PUB = path.join(ROOT, 'public/assets');
const sources = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/assets/models-sources.json'), 'utf8'));

const CC0 = { license: 'CC0-1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/' };
const KAYKIT = (repo, pack, itch) => ({
  pack,
  author: 'Kay Lousberg (KayKit)',
  ...CC0,
  homepage: itch,
  repo: `https://github.com/KayKit-Game-Assets/${repo}`,
  licenseNote: 'LICENSE.txt in the repository states Creative Commons Zero (CC0)',
});
const KENNEY_TITLES = {};
for (const line of fs
  .readFileSync(path.join(ROOT, 'scripts/assets/kenney-kits.tsv'), 'utf8')
  .trim()
  .split('\n')) {
  const [slug, title] = line.split('\t');
  KENNEY_TITLES[slug] = title;
}

function modelSource(src) {
  const first = src.split('/')[0];
  if (first === 'KayKit-Character-Pack-Adventures-1.0')
    return KAYKIT(
      first,
      'KayKit Adventurers Character Pack 1.0',
      'https://kaylousberg.itch.io/kaykit-adventurers',
    );
  if (first === 'KayKit-Character-Pack-Skeletons-1.0')
    return KAYKIT(
      first,
      'KayKit Skeletons Character Pack 1.0',
      'https://kaylousberg.itch.io/kaykit-skeletons',
    );
  if (first === 'KayKit-Dungeon-Remastered-1.0')
    return KAYKIT(
      first,
      'KayKit Dungeon Remastered 1.0',
      'https://kaylousberg.itch.io/kaykit-dungeon-remastered',
    );
  if (first === 'KayKit-Space-Base-Bits-1.0')
    return KAYKIT(first, 'KayKit Space Base Bits 1.0', 'https://kaylousberg.itch.io/kaykit-space-base-bits');
  if (first === 'kenney') {
    const kit = src.split('/')[2];
    return {
      pack: `Kenney ${KENNEY_TITLES[kit] ?? kit}`,
      author: 'Kenney (kenney.nl)',
      ...CC0,
      homepage: 'https://kenney.nl/assets',
      repo: 'https://github.com/shorepine/kenney',
      licenseNote: 'All Kenney assets are CC0; mirror repository LICENSE.txt states CC0 1.0',
    };
  }
  if (first === 'robot')
    return {
      pack: 'RobotExpressive (three.js examples)',
      author: 'Tomas Laulhe (Quaternius); glTF conversion by Don McCurdy',
      ...CC0,
      homepage: 'https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf/RobotExpressive',
      repo: 'https://github.com/mrdoob/three.js',
      licenseNote: 'README.md next to the model states CC0 1.0',
    };
  if (first === 'descent-3d-assets')
    return {
      pack: 'Quaternius Ultimate Monsters (demon/orc)',
      author: 'Quaternius',
      ...CC0,
      homepage: 'https://quaternius.com/packs/ultimatemonsters.html',
      repo: 'https://github.com/511action/descent-3d-assets',
      licenseNote:
        'Quaternius publishes all packs as CC0; the mirror repository describes these files as CC0 / public domain',
    };
  if (first === 'quaternius')
    return {
      pack: 'Quaternius Universal Base Characters, Modular Character Outfits - Fantasy, Universal Animation Library 1 & 2 (Standard)',
      author: 'Quaternius',
      ...CC0,
      homepage: 'https://quaternius.com/packs/universalbasecharacters.html',
      repo: 'https://quaternius.itch.io',
      licenseNote: 'License_Standard.txt / License.txt in each downloaded pack states CC0 1.0 Universal',
    };
  throw new Error(`unknown source ${src}`);
}

const entries = [];
const walk = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));

for (const file of walk(PUB).sort()) {
  const rel = path.relative(PUB, file).split(path.sep).join('/');
  const p = `public/assets/${rel}`;
  const bytes = fs.statSync(file).size;
  if (rel.startsWith('models/')) {
    const src = sources[rel];
    if (!src) throw new Error(`no source recorded for ${rel}`);
    const mods = ['re-packed as single-file GLB (textures embedded)'];
    if (rel.startsWith('models/chars/')) {
      mods.length = 0;
      mods.push(
        'built by scripts/assets/build-chars.mjs: outfit + head cut from a base body + hairstyle merged on one skeleton, meshes simplified and joined per material, textures downsized to base color only, meshopt-compressed',
      );
    }
    if (rel.startsWith('models/heroes') || rel.startsWith('models/monsters')) {
      mods.push('unused animation clips and baked-in held items removed to cut size');
    }
    entries.push({
      path: p,
      bytes,
      source: `${modelSource(src).repo}  (${src.split('/').slice(1).join('/')})`,
      ...modelSource(src),
      modifications: mods.join('; '),
    });
  } else if (rel.startsWith('audio/sfx/')) {
    const m = /^audio\/sfx\/(.+)\.(ogg|mp3)$/.exec(rel);
    const [pack, clip] = SFX[m[1]];
    const kind = pack.split(' ')[0];
    entries.push({
      path: p,
      bytes,
      source: `https://github.com/ismetcabbar9-oss/kenney-audio-assets  (Audio/${pack}/${clip}.ogg)`,
      pack: `Kenney ${kind} Audio`,
      author: 'Kenney (kenney.nl)',
      ...CC0,
      homepage: 'https://kenney.nl/assets?q=audio',
      repo: 'https://github.com/ismetcabbar9-oss/kenney-audio-assets',
      licenseNote: 'LICENSE.md in the repository is CC0 1.0 Universal',
      modifications: m[2] === 'ogg' ? 'none (copied)' : 'transcoded to mono MP3 (fallback encoding)',
    });
  } else if (rel.startsWith('audio/music/')) {
    entries.push({
      path: p,
      bytes,
      source: 'scripts/assets/gen-music.mjs (this repository)',
      pack: 'Diablo Tiny Error procedural music',
      author: 'Diablo Tiny Error project (generated)',
      ...CC0,
      homepage: '',
      repo: '',
      licenseNote:
        'Original work synthesised by scripts/assets/gen-music.mjs; dedicated to the public domain (CC0)',
      modifications: 'generated, encoded with ffmpeg',
    });
  } else {
    throw new Error(`unclassified asset ${rel}`);
  }
}
fs.mkdirSync(path.join(ROOT, 'assets'), { recursive: true });
fs.writeFileSync(
  path.join(ROOT, 'assets/manifest.json'),
  JSON.stringify({ version: 1, assets: entries }, null, 1) + '\n',
);
console.log(
  `${entries.length} assets, ${(entries.reduce((a, e) => a + e.bytes, 0) / 1048576).toFixed(2)} MB`,
);
