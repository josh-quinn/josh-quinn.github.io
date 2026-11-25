import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// The home terminal's interactive layer (docs/decisions/0008-home-terminal-js.md).
const data = JSON.parse(readFileSync(join(process.cwd(), 'src/content/terminal.json'), 'utf8'));

test.use({ viewport: { width: 1280, height: 900 } });

async function openFirst(page: Page) {
  await page.goto('/');
  const pane = page.locator('.term[data-row="1"]');
  await pane.click();
  const input = pane.getByRole('textbox');
  await expect(input).toBeFocused();
  return { pane, input, log: pane.locator('[role="log"]') };
}

async function type(page: Page, cmd: string) {
  await page.keyboard.type(cmd);
  await page.keyboard.press('Enter');
}

test('the home page loads one bundled module script from /_astro/', async ({ page }) => {
  await page.goto('/');
  const scripts = await page.locator('script').evaluateAll((s) => s.map((x) => ({ type: x.getAttribute('type'), src: x.getAttribute('src') })));
  expect(scripts).toHaveLength(1);
  expect(scripts[0].type).toBe('module');
  expect(scripts[0].src).toMatch(/^\/_astro\/[\w.-]+\.js$/);
});

test('each demo shows a visible [ click to type ] hint', async ({ page }) => {
  await page.goto('/');
  const hint = page.locator('.term[data-row="1"] .t-hint');
  await expect(hint).toBeVisible();
  await expect(hint).toHaveText('click to type');
});

test('clicking the terminal swaps in a labelled prompt seeded from the demo', async ({ page }) => {
  const { pane, input, log } = await openFirst(page);
  await expect(input).toHaveAccessibleName(/type a command/i);
  await expect(log).toHaveAttribute('aria-live', 'polite');
  await expect(log).toContainText('cat now.txt');
  await expect(pane).toHaveClass(/is-live/);
});

test('whoami prints the fictional name into the live output', async ({ page }) => {
  const { log } = await openFirst(page);
  await log.evaluate((el) => el.replaceChildren());
  await type(page, 'whoami');
  await expect(log).toContainText(data.persona.name);
});

test('help lists the commands', async ({ page }) => {
  const { log } = await openFirst(page);
  await type(page, 'help');
  for (const c of ['whoami', 'cat <file>', 'notes ls', './my-journey.sh', 'clear', 'history']) await expect(log).toContainText(c);
});

test('an unknown command prints command not found', async ({ page }) => {
  const { log } = await openFirst(page);
  await type(page, 'frobnicate');
  await expect(log).toContainText('command not found: frobnicate');
});

test('notes and the journey answer from the canned data; clear empties the screen', async ({ page }) => {
  const { log } = await openFirst(page);
  await type(page, 'notes ls');
  await expect(log.locator('.t-line', { hasText: /3\s+todo\s+water the plants/ }).last()).toBeVisible();
  await type(page, './my-journey.sh');
  await expect(log.locator('.t-scenes').last().locator('svg[role="img"]')).toHaveCount(3);
  await type(page, 'clear');
  await expect(log.locator('.t-line')).toHaveCount(0);
});

test('a second command typed quickly prints after the first one\'s answer', async ({ page }) => {
  const { log } = await openFirst(page);
  await log.evaluate((el) => el.replaceChildren());
  await type(page, 'notes ls');
  await type(page, 'whoami');
  await expect(log).toContainText(data.persona.name);
  const lines = await log.locator(':scope > .t-line').allTextContents();
  expect(lines.findIndex((l) => l.includes('whoami'))).toBeGreaterThan(lines.findIndex((l) => /water the plants/.test(l)));
});

test('Esc leaves the prompt and puts focus back on the terminal', async ({ page }) => {
  const { pane, input } = await openFirst(page);
  await page.keyboard.press('Escape');
  await expect(input).toHaveCount(0);
  await expect(pane).toBeFocused();
  await expect(pane).not.toHaveClass(/is-live/);
});

test('Tab moves on from the prompt: no keyboard trap', async ({ page }) => {
  const { input } = await openFirst(page);
  await page.keyboard.press('Tab');
  await expect(input).not.toBeFocused();
});

test('arrow up recalls history, arrow down returns to an empty line', async ({ page }) => {
  const { input } = await openFirst(page);
  await type(page, 'whoami');
  await type(page, 'ls');
  await page.keyboard.press('ArrowUp');
  await expect(input).toHaveValue('ls');
  await page.keyboard.press('ArrowUp');
  await expect(input).toHaveValue('whoami');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(input).toHaveValue('');
});

test('Enter on the focused terminal opens the prompt, with a visible focus ring', async ({ page }) => {
  await page.goto('/');
  const pane = page.locator('.term[data-row="1"]');
  await pane.focus();
  expect(await pane.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none');
  await page.keyboard.press('Enter');
  await expect(pane.getByRole('textbox')).toBeFocused();
});

test('scrolling to another chapter hands back to the CSS demo', async ({ page }) => {
  const { pane } = await openFirst(page);
  await page.locator('.split-prose[data-row="2"]').evaluate((el) => {
    const r = el.getBoundingClientRect();
    scrollBy(0, r.top + r.height / 2 - innerHeight / 2);
  });
  await expect(pane.locator('.t-input')).toHaveCount(0);
  await expect(pane).not.toHaveClass(/is-live/);
});

test('a chapter change while typing moves focus to the pane now on screen, not the page', async ({ page }) => {
  const { input } = await openFirst(page);
  await expect(input).toBeFocused();
  await page.locator('.split-prose[data-row="2"]').evaluate((el) => {
    const r = el.getBoundingClientRect();
    scrollBy(0, r.top + r.height / 2 - innerHeight / 2);
  });
  await expect(page.locator('.t-input')).toHaveCount(1); // only the try-it prompt is left
  await expect(page.locator('.term[data-row="2"]')).toBeFocused();
});

test.describe('at 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a pane scrolled out of view hands back and keeps focus on itself, without scrolling back', async ({ page }) => {
    const { pane, input } = await openFirst(page);
    await expect(input).toBeFocused();
    await page.evaluate(() => scrollTo(0, document.querySelector<HTMLElement>('.split-prose[data-row="2"]')!.offsetTop));
    await expect(pane.locator('.t-input')).toHaveCount(0);
    await expect(pane).toBeFocused();
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(400);
  });
});

test('about 20s idle with an empty prompt hands back to the CSS demo', async ({ page }) => {
  await page.clock.install();
  const { pane } = await openFirst(page);
  await page.clock.runFor(21_000);
  await expect(pane.locator('.t-input')).toHaveCount(0);
});

test('the try-it terminal near the bottom is always live', async ({ page }) => {
  await page.goto('/');
  const tryPane = page.locator('.term[data-demo="try"]');
  await tryPane.scrollIntoViewIfNeeded();
  await tryPane.click();
  await expect(tryPane.getByRole('textbox')).toBeFocused();
  await type(page, 'whoami');
  await expect(tryPane.locator('[role="log"]')).toContainText(data.persona.name);
});

test('the try-it terminal is focusable and Esc returns focus to it', async ({ page }) => {
  await page.goto('/');
  const tryPane = page.locator('.term[data-demo="try"]');
  await tryPane.scrollIntoViewIfNeeded();
  await expect(tryPane).toHaveAttribute('tabindex', '0');
  await expect(tryPane).toHaveAccessibleName(/try it yourself/i);
  await tryPane.click();
  await expect(tryPane.getByRole('textbox')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(tryPane).toBeFocused();
  await expect(tryPane.getByRole('textbox')).toHaveCount(1); // it stays live
  await page.keyboard.press('Enter');
  await expect(tryPane.getByRole('textbox')).toBeFocused();
});

test('input is printed as text, never markup, and nothing leaves the page', async ({ page }) => {
  const off: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://localhost:4321/')) off.push(r.url());
  });
  const { log } = await openFirst(page);
  await type(page, 'echo <img src=x id=pwned>');
  await type(page, '<b id=pwned2>hi</b>');
  await expect(log).toContainText('command not found: <b');
  await expect(page.locator('#pwned, #pwned2')).toHaveCount(0);
  expect(off).toEqual([]);
});

test('with reduced motion an answer prints at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { log } = await openFirst(page);
  await type(page, 'help');
  expect(await log.textContent()).toContain('./my-journey.sh');
});

test('no axe violations with the live prompt open', async ({ page }) => {
  await openFirst(page);
  await type(page, 'help');
  const { violations } = await new AxeBuilder({ page }).include('.term.is-live').analyze();
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});
