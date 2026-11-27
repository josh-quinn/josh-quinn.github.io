import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { htmlFiles, urlPathOf } from '../helpers/dist';

// Every page in the build, served by `astro preview` (playwright.config.ts webServer).
const pages = htmlFiles().map((f) => urlPathOf(f));

test('dist contains built pages to check', () => {
  expect(pages.length, 'no HTML in dist/: run `npm run build` first').toBeGreaterThan(0);
});

for (const path of pages) {
  test(`no axe violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    // Let the entrance animations finish (they start at opacity 0); the cursor blinks forever.
    // Scroll-driven animations (the home terminal) follow the scroll and never finish: skip them.
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a.timeline === document.timeline && a.effect?.getTiming().iterations !== Infinity)
          .map((a) => a.finished),
      ),
    );
    const { violations } = await new AxeBuilder({ page }).analyze();
    const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.help} [${v.nodes.map((n) => n.target.join(' ')).join(', ')}]`);
    expect(summary).toEqual([]);
  });
}

// In story mode only one home terminal pane shows at a time, so axe skips the hidden ones.
// With reduced motion every pane is on screen in the static layout: check them all.
test('no axe violations on / under reduced motion, with every terminal pane visible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const visible = await page.locator('.term').evaluateAll((ts) => ts.filter((t) => getComputedStyle(t).opacity === '1').length);
  expect(visible).toBe(await page.locator('.term').count());
  const { violations } = await new AxeBuilder({ page }).analyze();
  const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.help} [${v.nodes.map((n) => n.target.join(' ')).join(', ')}]`);
  expect(summary).toEqual([]);
});

// WCAG 1.4.4: text-only zoom to 200% at a phone width, in both motion modes.
for (const motion of ['no-preference', 'reduce'] as const) {
  test(`no axe violations on / at 390px with the root font at 200%, motion ${motion}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: motion });
    await page.goto('/');
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a.timeline === document.timeline && a.effect?.getTiming().iterations !== Infinity)
          .map((a) => a.finished),
      ),
    );
    const { violations } = await new AxeBuilder({ page }).analyze();
    const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.help} [${v.nodes.map((n) => n.target.join(' ')).join(', ')}]`);
    expect(summary).toEqual([]);
  });
}
