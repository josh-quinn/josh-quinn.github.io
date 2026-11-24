import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { htmlFiles } from '../helpers/dist';

// DESIGN.md: technical paper, islands, CSS-only motion (none under reduced motion), no client JS.

test('no built page ships client JavaScript', () => {
  const files = htmlFiles();
  expect(files.length).toBeGreaterThan(0);
  for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(/<script\b/i);
});

test.describe('home page', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('sits on a fixed technical-paper grid with a vignette', async ({ page }) => {
    await page.goto('/');
    const layer = await page.evaluate(() => {
      const b = getComputedStyle(document.body, '::before');
      const a = getComputedStyle(document.body, '::after');
      return { position: b.position, grid: b.backgroundImage, vignette: a.backgroundImage, afterPosition: a.position };
    });
    expect(layer.position).toBe('fixed');
    expect(layer.grid.match(/linear-gradient/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(layer.afterPosition).toBe('fixed');
    expect(layer.vignette).toMatch(/gradient/);
  });

  test('has islands: bordered raised panels without drop shadows', async ({ page }) => {
    await page.goto('/');
    const islands = page.locator('.island');
    expect(await islands.count()).toBeGreaterThanOrEqual(1);
    const s = await islands.first().evaluate((el) => {
      const c = getComputedStyle(el);
      return { shadow: c.boxShadow, border: c.borderTopWidth, style: c.borderTopStyle };
    });
    expect(s.shadow).toBe('none');
    expect(s.border).toBe('1px');
    expect(s.style).toBe('solid');
  });

  test('body text is about 1rem (18px) and the display heading 1.75-2x that', async ({ page }) => {
    await page.goto('/');
    const sizes = await page.evaluate(() => ({
      body: parseFloat(getComputedStyle(document.querySelector('main p')!).fontSize),
      h1: parseFloat(getComputedStyle(document.querySelector('h1')!).fontSize),
      h1Style: getComputedStyle(document.querySelector('h1')!).fontStyle,
    }));
    expect(sizes.body).toBeGreaterThanOrEqual(16);
    expect(sizes.body).toBeLessThanOrEqual(18.5);
    expect(sizes.h1 / sizes.body).toBeGreaterThanOrEqual(1.75);
    expect(sizes.h1 / sizes.body).toBeLessThanOrEqual(2.05);
    expect(sizes.h1Style).toBe('italic');
  });

  test('animates the opening lines, the heading, the panels and a terminal cursor', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    const names = await page.evaluate(() =>
      ['.reveal', 'h1', '.island', '.cursor'].map((sel) => {
        const el = document.querySelector(sel);
        return el ? getComputedStyle(el).animationName : 'missing';
      }),
    );
    for (const n of names) expect(n).not.toMatch(/^(none|missing)$/);
    // The cursor blinks forever; the others play once.
    const cursor = await page.locator('.cursor').evaluate((el) => getComputedStyle(el).animationIterationCount);
    expect(cursor).toBe('infinite');
  });

  test('has no motion at all under prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const animated = await page.evaluate(() =>
      [...document.querySelectorAll('*')].filter((el) => getComputedStyle(el).animationName !== 'none').map((el) => el.tagName + '.' + el.className),
    );
    expect(animated).toEqual([]);
  });
});
