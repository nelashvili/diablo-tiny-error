import { expect, test } from '@playwright/test';

test('game boots and shows title', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.getByText('Diablo Tiny Error')).toBeVisible();
  expect(errors).toEqual([]);
});
