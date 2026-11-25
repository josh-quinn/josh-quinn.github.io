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
