import { expect, test, type Page } from '@playwright/test';

// The demo loops (docs/decisions/0008-home-terminal-js.md, Amendment 1): each pane's demo is a
// CSS loop on its own timer (a steps() clock on .t-screen). JS only picks the active section,
// restarts its loop, and pauses it. Scrolling never moves a loop forwards or backwards.

test.use({ viewport: { width: 1280, height: 900 } });

/** The pane's loop clock: its state, current time (ms) and the visible text of its demo. */
const clock = (page: Page, row: number) =>
  page.locator(`.term[data-row="${row}"] .t-screen`).evaluate((el) => {
    const a = el.getAnimations().find((x) => (x as CSSAnimation).animationName === 't-clock');
    return a ? { state: a.playState, time: Number(a.currentTime ?? 0) } : null;
  });

/** Wait out the islands' one-off entrance animations (finite, time-based), so clicks land on still panes. */
const settle = (page: Page) =>
  page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.timeline === document.timeline && a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished),
    ),
  );

const toRow = async (page: Page, row: number, at = 0.5) => {
  await page.locator(`.split-prose[data-row="${row}"]`).evaluate((el, f) => {
    const r = el.getBoundingClientRect();
    scrollBy(0, r.top + r.height * f - innerHeight / 2);
  }, at);
  await expect(page.locator(`.term[data-row="${row}"]`)).toHaveClass(/is-playing/);
};

test('the first section loops on load; the others wait', async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => clock(page, 1)).toMatchObject({ state: 'running' });
  expect(await clock(page, 2)).toBeNull();
  expect(await clock(page, 3)).toBeNull();
});

test('scrolling within a section never scrubs its loop', async ({ page }) => {
  await page.goto('/');
  await toRow(page, 2, 0.3);
  await page.waitForTimeout(800);
  const a = (await clock(page, 2))!;
  await page.evaluate(() => scrollBy(0, 160));
  const b = (await clock(page, 2))!;
  await page.evaluate(() => scrollBy(0, -320));
  const c = (await clock(page, 2))!;
  // Time only moves forward, by about the time that passed, whichever way the page scrolled.
  expect(b.time).toBeGreaterThanOrEqual(a.time);
  expect(c.time).toBeGreaterThanOrEqual(b.time);
  expect(c.time - a.time).toBeLessThan(1500);
  expect(c.state).toBe('running');
});

test('returning to a section restarts its loop from the start', async ({ page }) => {
  await page.goto('/');
  await toRow(page, 2);
  await page.waitForTimeout(1500);
  expect((await clock(page, 2))!.time).toBeGreaterThan(1200);
  await toRow(page, 3);
  expect(await clock(page, 2)).toBeNull();
  await toRow(page, 2);
  expect((await clock(page, 2))!.time).toBeLessThan(600);
});

test('the notes TUI loop shows its board frames one after another', async ({ page }) => {
  await page.goto('/');
  await toRow(page, 3);
  const visibleFrames = () =>
    page.locator('.term[data-row="3"] .t-frame').evaluateAll((fs) => fs.filter((f) => getComputedStyle(f).display !== 'none' && Number(getComputedStyle(f).opacity) > 0.5).length);
  await expect.poll(visibleFrames, { timeout: 5000 }).toBe(1);
  const selected = () => page.locator('.term[data-row="3"] .t-frame').evaluateAll((fs) => {
    const f = fs.find((x) => getComputedStyle(x).display !== 'none' && Number(getComputedStyle(x).opacity) > 0.5);
    return f?.querySelector('.t-sel')?.textContent ?? '';
  });
  const seen = new Set<string>();
  for (let i = 0; i < 12; i++) {
    seen.add(await selected());
    await page.waitForTimeout(400);
  }
  expect(seen.size).toBeGreaterThan(1);
});

test('clicking a pane pauses its loop exactly where it is, with the prompt below the frame', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1600);
  const pane = page.locator('.term[data-row="1"]');
  await pane.click();
  await expect(pane.getByRole('textbox')).toBeFocused();
  const a = (await clock(page, 1))!;
  expect(a.state).toBe('paused');
  const text = await pane.locator('.t-feed').innerText();
  await page.waitForTimeout(700);
  const b = (await clock(page, 1))!;
  expect(b).toEqual(a);
  expect(await pane.locator('.t-feed').innerText()).toBe(text);
  // The prompt sits under the last line shown, not under the hidden rest of the demo.
  const feed = await pane.locator('.t-feed').boundingBox();
  const prompt = await pane.locator('.t-prompt').boundingBox();
  expect(prompt!.y).toBeGreaterThanOrEqual(feed!.y + feed!.height - 1);
  expect(prompt!.y - (feed!.y + feed!.height)).toBeLessThan(60);
});

test('handing back (Esc) restarts the loop', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1600);
  const pane = page.locator('.term[data-row="1"]');
  await pane.click();
  await page.keyboard.press('Escape');
  await expect(pane).toBeFocused();
  const c = (await clock(page, 1))!;
  expect(c.state).toBe('running');
  expect(c.time).toBeLessThan(600);
});

test('under reduced motion nothing loops and every pane shows its final frame', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  for (const row of [1, 2, 3, 4]) expect(await clock(page, row)).toBeNull();
  await expect(page.locator('.term[data-row="3"] .t-frame.t-final')).toBeVisible();
  await expect(page.locator('.term[data-row="1"]')).toContainText('one chapter a week');
});

test.describe('at 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a playing loop never changes the pane size, so the page below does not move', async ({ page }) => {
    await page.goto('/');
    await settle(page);
    await toRow(page, 2);
    const heights = await page.locator('.term[data-row="2"]').evaluate(
      (t) =>
        new Promise<number[]>((done) => {
          const out: number[] = [];
          const id = setInterval(() => {
            out.push(Math.round(t.getBoundingClientRect().height));
            if (out.length === 80) {
              clearInterval(id);
              done(out);
            }
          }, 60);
        }),
    );
    expect(new Set(heights).size).toBe(1);
  });

  test('the pane of the section in view loops, and a click pauses it', async ({ page }) => {
    await page.goto('/');
    await settle(page);
    await toRow(page, 2);
    await expect.poll(() => clock(page, 2)).toMatchObject({ state: 'running' });
    await page.locator('.term[data-row="2"]').click();
    expect((await clock(page, 2))!.state).toBe('paused');
    await page.keyboard.type('whoami');
    await page.keyboard.press('Enter');
    await expect(page.locator('.term[data-row="2"] [role="log"]')).toContainText('Josh Quinn');
  });
});
