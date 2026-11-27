import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// The home-page Terminal component (DESIGN.md "Terminal"): final text is always in the DOM,
// reduced motion shows final states, the story layout from 64rem, inline panes below it.
const data = JSON.parse(readFileSync(join(process.cwd(), 'src/content/terminal.json'), 'utf8'));
const frames = (page: Page) =>
  page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

test.describe('terminal without JavaScript', () => {
  test.use({ javaScriptEnabled: false, viewport: { width: 1280, height: 900 } });

  test('every demo transcript is real text in the DOM', async ({ page }) => {
    await page.goto('/');
    const terms = page.locator('.term');
    await expect(terms).toHaveCount(5);
    const all = (await terms.allTextContents()).join('\n');
    for (const cmd of ['whoami', 'cat now.txt', 'notes add "water the plants"', 'notes ls', 'notes tui', '~/.my-journey.sh', 'help']) {
      expect(all).toContain(cmd);
    }
    expect(all).toContain(data.persona.name);
    expect(all).toContain('Example Organisation Alpha');
    expect(all).toMatch(/3\s+todo\s+water the plants/);
    for (const s of data.journey.scenes) expect(all).toContain(s.title);
    // The scenes are images with text alternatives.
    await expect(page.locator('.term svg[role="img"]')).toHaveCount(3);
    // The notes TUI shows only its final board: the other frames exist only for the loop.
    const tui = page.locator('.term[data-demo="tui"]');
    await expect(tui.locator('.t-frame.t-final')).toBeVisible();
    expect(await tui.locator('.t-frame:not(.t-final)').evaluateAll((fs) => fs.every((f) => getComputedStyle(f).display === 'none'))).toBe(true);
    for (const col of ['todo', 'doing', 'done']) await expect(tui.locator('.t-frame.t-final')).toContainText(col);
    // Without JS the panes never stack: each sits beside its own chapter.
    for (const row of [1, 2, 3, 4]) {
      const pane = await page.locator(`.term[data-row="${row}"]`).boundingBox();
      const prose = await page.locator(`.split-prose[data-row="${row}"]`).boundingBox();
      expect(pane!.x + pane!.width).toBeLessThanOrEqual(prose!.x);
      expect(Math.abs(pane!.y - prose!.y)).toBeLessThan(80);
    }
    // No live prompt and no hint without JS: the static demo is the whole experience.
    await expect(page.locator('.t-input')).toHaveCount(0);
    await expect(page.locator('.t-hint').first()).toBeHidden();
  });

  test('the try-it terminal shows a static help transcript', async ({ page }) => {
    await page.goto('/');
    const tryPane = page.locator('.term[data-demo="try"]');
    await expect(tryPane).toBeVisible();
    await expect(tryPane).toContainText('commands');
    await expect(tryPane).toContainText('./my-journey.sh');
  });
});

test.describe('terminal under reduced motion', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('shows every final state at once, with nothing animated', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const s = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('.term, .term *, .split-prose')];
      return {
        cmds: document.querySelectorAll('.term .t-cmd').length >= 6,
        animated: nodes.filter((n) => getComputedStyle(n).animationName !== 'none').length,
        faded: nodes.filter((n) => getComputedStyle(n).opacity !== '1').length,
        clipped: [...document.querySelectorAll('.t-cmd')].filter((k) => k.scrollWidth > k.clientWidth + 1).length,
        hiddenScenes: [...document.querySelectorAll('.t-scene')].filter((n) => getComputedStyle(n).clipPath !== 'none').length,
      };
    });
    expect(s).toEqual({ cmds: true, animated: 0, faded: 0, clipped: 0, hiddenScenes: 0 });
  });

  test('sets each pane beside its own chapter (the static beat layout)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    for (const row of [1, 2, 3, 4]) {
      const pane = await page.locator(`.term[data-row="${row}"]`).boundingBox();
      const prose = await page.locator(`.split-prose[data-row="${row}"]`).boundingBox();
      expect(pane!.x + pane!.width).toBeLessThanOrEqual(prose!.x);
      expect(Math.abs(pane!.y - prose!.y)).toBeLessThan(80);
    }
  });
});

test.describe('terminal story at 1280px', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('starts centred, then moves left beside the prose and sticks', async ({ page }) => {
    await page.goto('/');
    const first = page.locator('.term[data-row="1"]');
    await frames(page);
    const start = await first.boundingBox();
    expect(Math.abs(start!.x + start!.width / 2 - 640)).toBeLessThan(40);

    await page.evaluate(() => scrollTo(0, innerHeight * 0.6));
    await frames(page);
    const moved = await first.boundingBox();
    const prose = await page.locator('.split-prose[data-row="1"]').boundingBox();
    expect(moved!.x + moved!.width).toBeLessThanOrEqual(prose!.x);
    expect(await first.evaluate((el) => getComputedStyle(el).position)).toBe('sticky');

    // It stays put in the viewport while the first chapter scrolls past.
    const top = moved!.y;
    await page.evaluate(() => scrollBy(0, 200));
    await frames(page);
    expect(Math.abs((await first.boundingBox())!.y - top)).toBeLessThan(2);
  });

  test('swaps its demo for each chapter', async ({ page }) => {
    await page.goto('/');
    const opacity = (row: number) =>
      page.locator(`.term[data-row="${row}"]`).evaluate((el) => Number(getComputedStyle(el).opacity));
    for (const row of [2, 3, 4]) {
      await page.locator(`.split-prose[data-row="${row}"]`).evaluate((el) => {
        const r = el.getBoundingClientRect();
        scrollBy(0, r.top + r.height / 2 - innerHeight * 0.55);
      });
      // The script picks the section most in view; the pane fades in over --duration-fast.
      await expect.poll(() => opacity(row)).toBeGreaterThan(0.9);
      for (const other of [1, 2, 3, 4].filter((r) => r !== row)) await expect.poll(() => opacity(other)).toBeLessThan(0.1);
    }
  });
});

test.describe('terminal demos are loops, not scroll-scrubbed', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('no part of a demo is driven by a scroll or view timeline', async ({ page }) => {
    await page.goto('/');
    for (const y of [0, 900, 1800]) {
      await page.evaluate((top) => scrollTo(0, top), y);
      await frames(page);
      const scrubbed = await page.evaluate(() =>
        [...document.querySelectorAll('.term .t-screen, .term .t-screen *')]
          .flatMap((el) => el.getAnimations())
          .filter((a) => a.timeline !== document.timeline).length,
      );
      expect(scrubbed).toBe(0);
    }
  });
});

test.describe('terminal at 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('sits inline above its chapter, never sticky, with no sideways scroll', async ({ page }) => {
    await page.goto('/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    for (const row of [1, 2, 3, 4]) {
      const pane = page.locator(`.term[data-row="${row}"]`);
      expect(await pane.evaluate((el) => getComputedStyle(el).position)).toBe('static');
      const p = await pane.boundingBox();
      const prose = await page.locator(`.split-prose[data-row="${row}"]`).boundingBox();
      expect(p!.y + p!.height).toBeLessThanOrEqual(prose!.y);
    }
  });
});
