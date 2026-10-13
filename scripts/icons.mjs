// Regenerates PNG icons from public/icons/icon.svg using Playwright's Chromium.
// Usage: node scripts/icons.mjs   (needs Chromium at /opt/pw-browsers/chromium or a playwright install)
import { chromium } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons');
const svg = readFileSync(join(outDir, 'icon.svg'), 'utf8');
// Maskable: full-bleed background, artwork shrunk into the 80% safe zone.
const inner = svg.replace(/<svg[^>]*>/, '').replace('</svg>', '');
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#0b0d17"/><g transform="translate(51.2 51.2) scale(0.8)">${inner}</g></svg>`;
const fullBleedSvg = svg.replace('rx="96"', 'rx="0"');

const targets = [
  { file: 'icon-192.png', size: 192, svg },
  { file: 'icon-512.png', size: 512, svg },
  { file: 'maskable-512.png', size: 512, svg: maskableSvg },
  // iOS rounds corners itself and dislikes transparency.
  { file: 'apple-touch-icon.png', size: 180, svg: fullBleedSvg },
];

const exe = ['/opt/pw-browsers/chromium'].find(existsSync);
const browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {});
for (const t of targets) {
  const page = await browser.newPage({ viewport: { width: t.size, height: t.size } });
  await page.setContent(
    `<html><body style="margin:0;background:transparent"><div style="width:${t.size}px;height:${t.size}px">${t.svg.replace(
      /<svg /,
      `<svg width="${t.size}" height="${t.size}" `,
    )}</div></body></html>`,
  );
  await page.screenshot({
    path: join(outDir, t.file),
    omitBackground: true,
    clip: { x: 0, y: 0, width: t.size, height: t.size },
  });
  await page.close();
}
await browser.close();
console.log('icons written to', outDir);
