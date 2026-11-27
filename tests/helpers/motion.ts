import type { Page } from '@playwright/test';

/**
 * Wait out one-off, time-based animations (the islands' entrance fades and rises), so clicks land
 * on still elements and axe sees final colours. Infinite loops (the cursor blink, the terminal
 * demo clocks) and scroll-driven animations never finish, so they are skipped.
 */
export const settle = (page: Page) =>
  page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.timeline === document.timeline && a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished),
    ),
  );

/** Scroll with the mouse wheel, as a reader would, until the row's prose is centred in the viewport. */
export async function wheelToRow(page: Page, row: number) {
  await page.mouse.move(900, 450);
  for (let i = 0; i < 60; i++) {
    const delta = await page.locator(`.split-prose[data-row="${row}"]`).evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.top + r.height / 2 - innerHeight / 2;
    });
    if (Math.abs(delta) < 60) return;
    await page.mouse.wheel(0, Math.sign(delta) * Math.min(240, Math.abs(delta)));
    await page.waitForTimeout(40);
  }
}
