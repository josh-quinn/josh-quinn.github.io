import { test, expect } from '@playwright/test';

test('home page responds 200 and has a main element', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.locator('main')).toHaveCount(1);
});
