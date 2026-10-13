// Curate Kenney CC0 audio (git clone of a Kenney all-in-1 mirror) into public/assets/audio/sfx.
// Usage: AUDIO_SRC=".../kenney-audio-assets/Audio (295 files)" node scripts/assets/build-audio.mjs
// Each clip is copied as .ogg (as-is) and re-encoded as a small mono .mp3 fallback (needs ffmpeg).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = process.env.AUDIO_SRC;
if (!SRC) throw new Error('set AUDIO_SRC');
const OUT = path.join(ROOT, 'public/assets/audio/sfx');
fs.mkdirSync(OUT, { recursive: true });

import { SFX } from './sfx-table.mjs';

const rows = [];
for (const [name, [pack, src]] of Object.entries(SFX)) {
  const from = path.join(SRC, pack, `${src}.ogg`);
  if (!fs.existsSync(from)) throw new Error(`missing ${from}`);
  fs.copyFileSync(from, path.join(OUT, `${name}.ogg`));
  execFileSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-y',
      '-i',
      from,
      '-ac',
      '1',
      '-c:a',
      'libmp3lame',
      '-q:a',
      '5',
      path.join(OUT, `${name}.mp3`),
    ],
    { stdio: 'inherit' },
  );
  rows.push({ name, pack: pack.split(' sounds')[0], src });
}
console.log(JSON.stringify(rows));
