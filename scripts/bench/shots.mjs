// Graphics bench: fixed screenshots + render stats per tileset and quality, for before/after comparison.
// Usage: npm run dev (port 5173), then
//   node scripts/bench/shots.mjs [outDir] [--port 5173] [--qualities low,medium,high] [--headed]
// Writes <outDir>/<scene>-<quality>.png and <outDir>/stats.json.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const out = path.resolve(
  args[0] && !args[0].startsWith('--') ? args[0] : path.join(os.tmpdir(), 'dte-bench'),
);
const port = flag('port', '5173');
const qualities = flag('qualities', 'low,medium,high').split(',');
fs.mkdirSync(out, { recursive: true });

// One scene per tileset in use, plus a monster lineup for character models.
const SCENES = [
  { name: 'town', level: 'a1.town' },
  { name: 'forest', level: 'a1.mossfields', lineup: true },
  { name: 'cave', level: 'a1.tuskinDen' },
  { name: 'temple', level: 'a1.commTower' },
];
const LINEUP = ['battleDroyd', 'jawwa', 'tuskinRaider', 'shadowWraith', 'normtrooper', 'scrapDroyd'];

// PW_CHROMIUM: a browser binary to use instead of Playwright's bundled one (as in playwright.config.ts).
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM,
  headless: !args.includes('--headed'),
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.error('pageerror:', e.message));
await page.goto(`http://localhost:${port}/?mute`);
await page.waitForFunction(() => window.__game !== undefined, null, { timeout: 30000 });
await page.evaluate(async () => {
  const g = window.__game;
  await g.newCharacter('yediKnight', 'Bench');
  g.levels.reset(12345); // same maps every run, so before/after shots line up
});
await page.waitForTimeout(1500);

const stats = {};
for (const scene of SCENES) {
  await page.evaluate(
    async ({ level, lineup, ids }) => {
      const g = window.__game;
      g.levels.enter(level);
      await g.afterLevelChange();
      // Only the 3D scene: hide the whole Preact overlay (menu, HUD, panels).
      document.getElementById('ui-root').style.visibility = 'hidden';
      const w = g.world;
      const p = g.player;
      for (const e of w.entities.values()) if (e.kind === 'monster') e.pos.x = -999;
      if (lineup) {
        const { createMonster } = await import('/src/core/monsters/create.ts');
        ids.forEach((id, i) => {
          const e = createMonster(
            w,
            id,
            { x: p.pos.x - 3 + i * 1.3, y: p.pos.y + 2.5 - i * 0.5 },
            1,
            'normal',
          );
          e.facing = Math.PI * 0.5;
        });
      }
      w.paused = true;
    },
    { level: scene.level, lineup: !!scene.lineup, ids: LINEUP },
  );
  for (const q of qualities) {
    await page.evaluate((q) => window.__game.renderer.setQuality(q), q);
    await page.waitForTimeout(2500);
    const file = path.join(out, `${scene.name}-${q}.png`);
    await page.screenshot({ path: file });
    stats[`${scene.name}-${q}`] = await page.evaluate(async () => {
      // Average frame time over 2 s of real rAF frames (the world is paused, rendering is not).
      const t0 = performance.now();
      let n = 0;
      await new Promise((done) => {
        const f = () => (++n, performance.now() - t0 < 2000 ? requestAnimationFrame(f) : done());
        requestAnimationFrame(f);
      });
      const s = window.__game.renderer.getStats();
      const ms = (performance.now() - t0) / n;
      return {
        frameMs: +ms.toFixed(1),
        drawCalls: s.drawCalls,
        triangles: s.triangles,
        textures: s.textures,
      };
    });
    console.log(scene.name, q, JSON.stringify(stats[`${scene.name}-${q}`]));
  }
}
fs.writeFileSync(path.join(out, 'stats.json'), JSON.stringify(stats, null, 2));
await browser.close();
console.log('wrote', out);
