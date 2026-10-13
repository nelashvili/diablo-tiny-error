// Generates CREDITS.md from assets/manifest.json (pure node).
// Usage: node scripts/assets/credits.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.json'), 'utf8'));

/** group by pack */
const packs = new Map();
for (const a of manifest.assets) {
  const key = `${a.pack}|${a.author}|${a.license}`;
  if (!packs.has(key)) packs.set(key, { ...a, files: [] });
  packs.get(key).files.push(a.path.replace('public/assets/', ''));
}

const lines = [
  '# Credits',
  '',
  'Generated from `assets/manifest.json` by `scripts/assets/credits.mjs`. Do not edit by hand.',
  '',
  'All bundled third-party assets are CC0 1.0 (public domain dedication); attribution is not required but given gladly.',
  'Skill and item icons (game-icons.net, CC BY 3.0) and fonts are credited separately by the agents that add them.',
  '',
];
for (const p of [...packs.values()].sort((a, b) => a.pack.localeCompare(b.pack))) {
  lines.push(`## ${p.pack}`, '');
  lines.push(`- Author: ${p.author}`);
  lines.push(`- License: [${p.license}](${p.licenseUrl})`);
  if (p.homepage) lines.push(`- Home: ${p.homepage}`);
  if (p.repo) lines.push(`- Obtained from: ${p.repo}`);
  if (p.licenseNote) lines.push(`- License evidence: ${p.licenseNote}`);
  if (p.modifications) lines.push(`- Modifications: ${p.modifications}`);
  const shown = p.files
    .slice(0, 12)
    .map((f) => `\`${f}\``)
    .join(', ');
  lines.push(`- Files (${p.files.length}): ${shown}${p.files.length > 12 ? ', ...' : ''}`, '');
}
fs.writeFileSync(path.join(ROOT, 'CREDITS.md'), lines.join('\n'));
console.log(`CREDITS.md: ${packs.size} packs`);
