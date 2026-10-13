import { expect, test, type CDPSession, type Page } from '@playwright/test';

/** Touch controls lab (/dev/input.html) driven with real multi-touch via CDP. */

type Cmd = { type: string; [k: string]: unknown };
type Pt = { x: number; y: number; id?: number };

type TouchType = 'touchStart' | 'touchEnd' | 'touchMove' | 'touchCancel';

async function cdpTouch(cdp: CDPSession, type: TouchType, points: Pt[]): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i, radiusX: 4, radiusY: 4, force: 1 })),
  });
}

async function cmds(page: Page): Promise<Cmd[]> {
  return page.evaluate(() => (window as unknown as { __cmds: Cmd[] }).__cmds.slice());
}

async function clearCmds(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __cmds: Cmd[] }).__cmds.length = 0;
  });
}

async function center(page: Page, testId: string): Promise<{ x: number; y: number }> {
  const b = await page.getByTestId(testId).boundingBox();
  if (!b) throw new Error(`no box for ${testId}`);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

async function open(page: Page, query = ''): Promise<CDPSession> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/dev/input.html${query}`);
  await expect(page.getByTestId('tc-primary')).toBeVisible();
  expect(errors).toEqual([]);
  return page.context().newCDPSession(page);
}

const VIEWPORTS = [
  { name: 'ipad-landscape', viewport: { width: 1080, height: 810 } },
  { name: 'phone-landscape', viewport: { width: 844, height: 390 } },
];

for (const vp of VIEWPORTS) {
  test.describe(`touch controls @ ${vp.name}`, () => {
    test.use({ viewport: vp.viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

    test('joystick dispatches moveDir then stop on release', async ({ page }) => {
      const cdp = await open(page);
      const h = vp.viewport.height;
      const start = { x: 140, y: h - 140 };
      await cdpTouch(cdp, 'touchStart', [start]);
      await expect(page.getByTestId('tc-stick')).toBeVisible();
      await cdpTouch(cdp, 'touchMove', [{ x: start.x + 40, y: start.y }]);
      await cdpTouch(cdp, 'touchMove', [{ x: start.x + 90, y: start.y }]);
      await page.waitForTimeout(100);
      const moves = (await cmds(page)).filter((c) => c.type === 'moveDir');
      expect(moves.length).toBeGreaterThan(0);
      const dir = moves[moves.length - 1]!.dir as { x: number; y: number };
      expect(dir.x).toBeGreaterThan(0.95);
      await cdpTouch(cdp, 'touchEnd', []);
      await page.waitForTimeout(50);
      expect((await cmds(page)).at(-1)?.type).toBe('stop');
      await expect(page.getByTestId('tc-stick')).toHaveCount(0);
    });

    test('primary attack auto-targets the monster in front', async ({ page }) => {
      const cdp = await open(page);
      await clearCmds(page);
      const p = await center(page, 'tc-primary');
      await cdpTouch(cdp, 'touchStart', [p]);
      await cdpTouch(cdp, 'touchEnd', []);
      const c = (await cmds(page)).find((x) => x.type === 'useSkill');
      expect(c).toMatchObject({ type: 'useSkill', skillId: 'dev.slash', targetId: 10 });
    });

    test('multi-touch: move with the joystick while holding attack', async ({ page }) => {
      const cdp = await open(page);
      await clearCmds(page);
      const h = vp.viewport.height;
      const stick = { x: 140, y: h - 140, id: 1 };
      const prim = { ...(await center(page, 'tc-primary')), id: 2 };
      await cdpTouch(cdp, 'touchStart', [stick]);
      await cdpTouch(cdp, 'touchMove', [{ ...stick, y: stick.y - 80 }]);
      await cdpTouch(cdp, 'touchStart', [{ ...stick, y: stick.y - 80 }, prim]);
      await page.waitForTimeout(600); // hold -> repeats
      await cdpTouch(cdp, 'touchMove', [{ ...stick, y: stick.y - 85 }, prim]);
      const during = await cmds(page);
      const up = during.filter((c) => c.type === 'moveDir').at(-1)!.dir as { x: number; y: number };
      expect(up.y).toBeLessThan(-0.95);
      expect(during.filter((c) => c.type === 'useSkill').length).toBeGreaterThanOrEqual(2);
      expect(during.some((c) => c.type === 'stop')).toBe(false);
      await cdpTouch(cdp, 'touchEnd', []);
      await page.waitForTimeout(50);
      expect((await cmds(page)).some((c) => c.type === 'stop')).toBe(true);
    });

    test('skill slot: tap casts, drag aims at ground', async ({ page }) => {
      const cdp = await open(page);
      await clearCmds(page);
      const s = await center(page, 'tc-slot-0');
      await cdpTouch(cdp, 'touchStart', [s]);
      await cdpTouch(cdp, 'touchEnd', []);
      expect((await cmds(page)).find((c) => c.type === 'useSkill')).toMatchObject({ skillId: 'dev.bolt' });

      await clearCmds(page);
      await cdpTouch(cdp, 'touchStart', [s]);
      for (let i = 1; i <= 6; i++) await cdpTouch(cdp, 'touchMove', [{ x: s.x - i * 15, y: s.y }]);
      await expect(page.getByTestId('tc-aim')).toBeVisible();
      await cdpTouch(cdp, 'touchEnd', []);
      const c = (await cmds(page)).find((x) => x.type === 'useSkill')!;
      expect(c.skillId).toBe('dev.bolt');
      const tp = c.targetPos as { x: number; y: number };
      expect(tp.x).toBeLessThan(-0.5); // aimed to the left of the player at the origin
      await expect(page.getByTestId('tc-aim')).toHaveCount(0);
    });

    test('empty slot opens the picker and binds a skill; long-press reassigns', async ({ page }) => {
      const cdp = await open(page);
      await clearCmds(page);
      const s = await center(page, 'tc-slot-3');
      await cdpTouch(cdp, 'touchStart', [s]);
      await cdpTouch(cdp, 'touchEnd', []);
      await expect(page.getByTestId('tc-picker')).toBeVisible();
      await page.getByTestId('tc-pick-dev.nova').tap();
      expect((await cmds(page)).find((c) => c.type === 'bindHotkey')).toMatchObject({
        slot: 3,
        skillId: 'dev.nova',
      });
      await expect(page.getByTestId('tc-slot-3')).toHaveAttribute('data-skill', 'dev.nova');

      const s0 = await center(page, 'tc-slot-0');
      await cdpTouch(cdp, 'touchStart', [s0]);
      await page.waitForTimeout(700);
      await expect(page.getByTestId('tc-picker')).toBeVisible();
      await cdpTouch(cdp, 'touchEnd', []);
      await page.getByTestId('tc-pick-cancel').tap();
      await expect(page.getByTestId('tc-picker')).toHaveCount(0);
      expect((await cmds(page)).filter((c) => c.type === 'useSkill')).toEqual([]);
    });

    test('stims and belt use belt slots', async ({ page }) => {
      const cdp = await open(page);
      await clearCmds(page);
      for (const id of ['tc-stim-life', 'tc-stim-mana']) {
        await cdpTouch(cdp, 'touchStart', [await center(page, id)]);
        await cdpTouch(cdp, 'touchEnd', []);
      }
      const belt = (await cmds(page)).filter((c) => c.type === 'useBeltSlot');
      expect(belt).toEqual([
        { type: 'useBeltSlot', index: 0 },
        { type: 'useBeltSlot', index: 1 },
      ]);
      await page.getByTestId('tc-belt').tap();
      await expect(page.getByTestId('tc-belt-pop')).toBeVisible();
      await page.getByTestId('tc-belt-slot-3').tap();
      expect((await cmds(page)).at(-1)).toEqual({ type: 'useBeltSlot', index: 3 });
    });

    test('world: tap monster interacts, long-press item shows label', async ({ page }) => {
      const cdp = await open(page);
      await clearCmds(page);
      const W = vp.viewport.width;
      const H = vp.viewport.height;
      // monster 10 at (3, 0.2) tiles; dev world is top-down at 40 px/tile centered on the player
      await cdpTouch(cdp, 'touchStart', [{ x: W / 2 + 120, y: H / 2 + 8 }]);
      await cdpTouch(cdp, 'touchEnd', []);
      expect((await cmds(page)).at(-1)).toEqual({ type: 'interact', targetId: 10 });
      // item 30 at (1.5, -2.5)
      await cdpTouch(cdp, 'touchStart', [{ x: W / 2 + 60, y: H / 2 - 100 }]);
      await page.waitForTimeout(650);
      await expect(page.getByTestId('tc-label')).toHaveText('Rusty Litesaber');
      await cdpTouch(cdp, 'touchEnd', []);
      expect((await cmds(page)).some((c) => c.type === 'interact' && c.targetId === 30)).toBe(false);
    });

    test('tap-to-move mode', async ({ page }) => {
      const cdp = await open(page, '?mode=tapToMove');
      await clearCmds(page);
      await cdpTouch(cdp, 'touchStart', [{ x: 120, y: 120 }]);
      await cdpTouch(cdp, 'touchEnd', []);
      const c = (await cmds(page)).find((x) => x.type === 'moveTo');
      expect(c).toBeTruthy();
      await expect(page.getByTestId('tc-stick')).toHaveCount(0);
    });

    test('screenshot', async ({ page }, info) => {
      const cdp = await open(page);
      const h = vp.viewport.height;
      await cdpTouch(cdp, 'touchStart', [{ x: 150, y: h - 150, id: 1 }]);
      await cdpTouch(cdp, 'touchMove', [{ x: 200, y: h - 190, id: 1 }]);
      const s = await center(page, 'tc-slot-1');
      await cdpTouch(cdp, 'touchStart', [
        { x: 200, y: h - 190, id: 1 },
        { ...s, id: 2 },
      ]);
      await cdpTouch(cdp, 'touchMove', [
        { x: 200, y: h - 190, id: 1 },
        { x: s.x - 90, y: s.y - 30, id: 2 },
      ]);
      await page.waitForTimeout(120);
      await page.screenshot({ path: info.outputPath(`${vp.name}.png`) });
      await cdpTouch(cdp, 'touchEnd', []);
    });
  });
}

test.describe('touch controls @ ipad-portrait', () => {
  test.use({ viewport: { width: 810, height: 1080 }, hasTouch: true, isMobile: true });
  test('layout fits and buttons are large enough', async ({ page }, info) => {
    await open(page);
    for (const id of ['tc-primary', 'tc-slot-0', 'tc-slot-5', 'tc-stim-life', 'tc-stim-mana', 'tc-belt']) {
      const b = (await page.getByTestId(id).boundingBox())!;
      expect(b.width).toBeGreaterThanOrEqual(56);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(810);
      expect(b.y + b.height).toBeLessThanOrEqual(1080);
    }
    await page.screenshot({ path: info.outputPath('ipad-portrait.png') });
  });
});
