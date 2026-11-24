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
      ['.reveal', 'h1', '.island', '.cursor', '.typed'].map((sel) => {
        const el = document.querySelector(sel);
        return el ? getComputedStyle(el).animationName : 'missing';
      }),
    );
    for (const n of names) expect(n).not.toMatch(/^(none|missing)$/);
    // The cursor blinks forever; the others play once.
    const cursor = await page.locator('.cursor').evaluate((el) => getComputedStyle(el).animationIterationCount);
    expect(cursor).toBe('infinite');
  });

  test('opens with a thin full-width italic announcement bar', async ({ page }) => {
    await page.goto('/');
    const bar = await page.evaluate(() => {
      const el = document.body.firstElementChild!;
      const c = getComputedStyle(el);
      return {
        cls: el.className,
        width: el.getBoundingClientRect().width,
        height: el.getBoundingClientRect().height,
        viewport: document.documentElement.clientWidth,
        style: c.fontStyle,
        family: c.fontFamily,
        border: c.borderBottomWidth + ' ' + c.borderBottomStyle,
      };
    });
    expect(bar.cls).toContain('announce');
    expect(bar.width).toBe(bar.viewport);
    expect(bar.height).toBeLessThanOrEqual(48);
    expect(bar.style).toBe('italic');
    expect(bar.family).toContain('Newsreader');
    expect(bar.border).toBe('1px solid');
  });

  test('has a mono nav bar: uppercase, tracked Departure Mono links over a hairline', async ({ page }) => {
    await page.goto('/');
    const bar = page.locator('header.navbar');
    await expect(bar).toHaveCount(1);
    const s = await bar.evaluate((el) => {
      const a = getComputedStyle(el.querySelector('a')!);
      const c = getComputedStyle(el);
      return { family: a.fontFamily, transform: a.textTransform, tracking: parseFloat(a.letterSpacing), border: c.borderBottomWidth + ' ' + c.borderBottomStyle };
    });
    expect(s.family).toContain('Departure Mono');
    expect(s.transform).toBe('uppercase');
    expect(s.tracking).toBeGreaterThan(0);
    expect(s.border).toBe('1px solid');
    // Only links to built pages (lychee runs offline on every task).
    for (const href of await bar.locator('a').evaluateAll((as) => as.map((a) => a.getAttribute('href')))) expect(href).toBe('/');
  });

  test('has a bracket link: mono, uppercase, hairline border, faint raised fill, brackets outside its name', async ({ page }) => {
    await page.goto('/');
    const link = page.locator('a.bracket').first();
    await expect(link).toHaveCount(1);
    const s = await link.evaluate((el) => {
      const c = getComputedStyle(el);
      return {
        family: c.fontFamily,
        transform: c.textTransform,
        border: c.borderTopWidth + ' ' + c.borderTopStyle,
        fill: c.backgroundColor,
        paper: getComputedStyle(document.documentElement).backgroundColor,
        shadow: c.boxShadow,
        before: getComputedStyle(el, '::before').content,
        after: getComputedStyle(el, '::after').content,
        text: el.textContent ?? '',
      };
    });
    expect(s.family).toContain('Departure Mono');
    expect(s.transform).toBe('uppercase');
    expect(s.border).toBe('1px solid');
    expect(s.fill).not.toBe('rgba(0, 0, 0, 0)');
    expect(s.fill).not.toBe(s.paper);
    expect(s.shadow).toBe('none');
    expect(s.before).toContain('[');
    expect(s.after).toContain(']');
    // The brackets are decoration: the link's accessible name is its text alone.
    await expect(page.getByRole('link', { name: s.text.trim(), exact: true })).toHaveCount(1);
  });

  test('lays out a two-column split with a sticky media island', async ({ page }) => {
    await page.goto('/');
    const s = await page.evaluate(() => {
      const split = document.querySelector('.split')!;
      const media = split.querySelector('.split-media .island')!;
      const prose = split.querySelector('.split-prose')!;
      return {
        columns: getComputedStyle(split).gridTemplateColumns.split(' ').length,
        position: getComputedStyle(media).position,
        mediaLeft: media.getBoundingClientRect().left,
        proseLeft: prose.getBoundingClientRect().left,
        captions: !!media.querySelector('.island-bar .label') && !!media.querySelector('.island-foot .label'),
        h2: [...prose.querySelectorAll('h2')].map((h) => ({ style: getComputedStyle(h).fontStyle, size: parseFloat(getComputedStyle(h).fontSize) })),
        body: parseFloat(getComputedStyle(document.body).fontSize),
        h1: parseFloat(getComputedStyle(document.querySelector('h1')!).fontSize),
      };
    });
    expect(s.columns).toBe(2);
    expect(s.position).toBe('sticky');
    expect(s.mediaLeft).toBeLessThan(s.proseLeft);
    expect(s.captions).toBe(true);
    expect(s.h2.length).toBeGreaterThanOrEqual(2);
    for (const h of s.h2) {
      expect(h.style).toBe('italic');
      expect(h.size / s.body).toBeGreaterThanOrEqual(1.75);
      // The page h1 is never smaller than a section heading.
      expect(h.size).toBeLessThanOrEqual(s.h1);
    }
  });

  test('has no motion at all under prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const animated = await page.evaluate(() =>
      [...document.querySelectorAll('*')].filter((el) => getComputedStyle(el).animationName !== 'none').map((el) => el.tagName + '.' + el.className),
    );
    expect(animated).toEqual([]);
    // No transitions are declared either (links and bracket links fade only with motion allowed).
    const transitioned = await page.evaluate(() =>
      [...document.querySelectorAll('*')].filter((el) => getComputedStyle(el).transitionProperty !== 'all').map((el) => el.tagName + '.' + el.className),
    );
    expect(transitioned).toEqual([]);
  });
});

test.describe('home page at 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('stacks the split into one column without sideways scrolling', async ({ page }) => {
    await page.goto('/');
    const s = await page.evaluate(() => ({
      columns: getComputedStyle(document.querySelector('.split')!).gridTemplateColumns.split(' ').length,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }));
    expect(s.columns).toBe(1);
    expect(s.overflow).toBe(false);
  });
});
