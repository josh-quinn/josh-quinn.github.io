import { expect, test } from '@playwright/test';

/**
 * Visual baselines for the built pages, at the two design-critic widths. Run in the Linux
 * Playwright image (npm run test:visual); update with `npm run test:visual -- --update-snapshots`.
 * CV pages get their baselines with Task 8.
 */
const PAGES = [
  { id: 'index', path: '/' },
  { id: 'fonts', path: '/_fonts/' },
];
const WIDTHS = [390, 1280];

for (const { id, path } of PAGES) {
  for (const width of WIDTHS) {
    test(`${id} at ${width}px matches its baseline`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await expect(page).toHaveScreenshot(`${id}-${width}.png`, { fullPage: true });
    });
  }
}
