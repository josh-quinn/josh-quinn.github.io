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

test('clicking the terminal pauses the demo and adds a labelled prompt below it', async ({ page }) => {
  const { pane, input, log } = await openFirst(page);
  await expect(input).toHaveAccessibleName(/type a command/i);
  await expect(log).toHaveAttribute('aria-live', 'polite');
  // The paused demo stays on screen above the prompt; the log holds only what is typed from now on.
  await expect(pane.locator('.t-feed')).toBeVisible();
  await expect(log).toHaveText('');
  await expect(pane).toHaveClass(/is-live/);
  await expect(pane).toHaveClass(/is-paused/);
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
  await expect(page.locator('.term[data-row="1"] .t-feed')).toBeHidden();
});

test('cd, ls and ll walk the fictional tree, and the prompt shows the cwd', async ({ page }) => {
  const { pane, log } = await openFirst(page);
  const ps = pane.locator('.t-prompt .t-ps');
  await expect(ps).toHaveText('~ $ ');
  await type(page, 'ls');
  await expect(log).toContainText('about.txt  notes/  now.txt  projects/');
  await type(page, 'cd notes');
  await expect(ps).toHaveText('~/notes $ ');
  await type(page, 'll');
  await expect(log).toContainText(/-rw-r--r--\s+sample\s+\d+ ideas\.md/);
  await type(page, 'cd ..');
  await expect(ps).toHaveText('~ $ ');
  await type(page, 'll');
  await expect(log).toContainText(/-rwxr-xr-x\s+sample\s+\d+ \.my-journey\.sh/);
});

test.describe('Tab completion', () => {
  test('a single match completes the line', async ({ page }) => {
    const { input } = await openFirst(page);
    await page.keyboard.type('wh');
    await page.keyboard.press('Tab');
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('whoami ');
    await page.keyboard.press('Control+U');
    await page.keyboard.type('cat no');
    await page.keyboard.press('Tab');
    await page.keyboard.type('w');
    await page.keyboard.press('Tab');
    await expect(input).toHaveValue('cat now.txt ');
  });

  test('several matches print the candidates and keep the line', async ({ page }) => {
    const { input, log } = await openFirst(page);
    await page.keyboard.type('c');
    await page.keyboard.press('Tab');
    await expect(input).toBeFocused();
    await expect(log).toContainText('cat  cd  clear');
    await expect(input).toHaveValue('c');
  });

  test('an empty line, or no match, lets Tab move focus on', async ({ page }) => {
    const { input } = await openFirst(page);
    await page.keyboard.press('Tab');
    await expect(input).not.toBeFocused();
    const again = await openFirst(page);
    await page.keyboard.type('xyz');
    await page.keyboard.press('Tab');
    await expect(again.input).not.toBeFocused();
  });
});

test.describe('readline shortcuts', () => {
  const caret = (page: Page) => page.locator('.term[data-row="1"] .t-input').evaluate((el: HTMLInputElement) => el.selectionStart);

  test('Ctrl+L clears the screen', async ({ page }) => {
    const { log } = await openFirst(page);
    await type(page, 'whoami');
    await expect(log).toContainText(data.persona.name);
    await page.keyboard.press('Control+L');
    await expect(log.locator('.t-line')).toHaveCount(0);
  });

  test('Ctrl+A and Ctrl+E go to the start and the end of the line', async ({ page }) => {
    const { input } = await openFirst(page);
    await page.keyboard.type('hoami');
    await page.keyboard.press('Control+A');
    expect(await caret(page)).toBe(0);
    await page.keyboard.type('w');
    await expect(input).toHaveValue('whoami');
    await page.keyboard.press('Control+E');
    expect(await caret(page)).toBe(6);
  });

  test('Ctrl+W deletes the previous word and Ctrl+U deletes to the line start', async ({ page }) => {
    const { input } = await openFirst(page);
    await page.keyboard.type('cat now.txt');
    await page.keyboard.press('Control+W');
    await expect(input).toHaveValue('cat ');
    await page.keyboard.type('about.txt');
    await page.keyboard.press('Control+U');
    await expect(input).toHaveValue('');
  });

  test('Alt+Left and Alt+Right move by word', async ({ page }) => {
    await openFirst(page);
    await page.keyboard.type('notes add plants');
    await page.keyboard.press('Alt+ArrowLeft');
    expect(await caret(page)).toBe(10);
    await page.keyboard.press('Alt+ArrowLeft');
    expect(await caret(page)).toBe(6);
    await page.keyboard.press('Alt+ArrowRight');
    expect(await caret(page)).toBe(9);
  });

  test('Cmd/Meta combinations are left to the browser', async ({ page }) => {
    const { input } = await openFirst(page);
    await page.keyboard.type('cat now.txt');
    const prevented = await input.evaluate((el) =>
      ['w', 'a', 'l', 'u', 'e'].map((key) => {
        const ev = new KeyboardEvent('keydown', { key, metaKey: true, bubbles: true, cancelable: true });
        el.dispatchEvent(ev);
        return ev.defaultPrevented;
      }),
    );
    expect(prevented).toEqual([false, false, false, false, false]);
    await expect(input).toHaveValue('cat now.txt');
  });
});

test('the outline-free input keeps a visible focus cue: a solid cursor and a highlighted caption bar', async ({ page }) => {
  const { pane, input } = await openFirst(page);
  const lum = (rgb: string) => {
    const [r, g, b] = (rgb.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((c) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  };
  const state = () =>
    pane.evaluate((el) => {
      const i = getComputedStyle(el.querySelector('.t-input')!);
      const c = getComputedStyle(el.querySelector('.t-block')!);
      const bar = getComputedStyle(el.querySelector('.t-bar')!);
      return {
        outline: i.outlineStyle,
        border: i.borderTopStyle,
        shadow: i.boxShadow,
        cursorFill: c.backgroundColor,
        cursorOutline: `${c.outlineStyle} ${c.outlineWidth}`,
        bar: bar.backgroundColor,
        screen: getComputedStyle(el.querySelector('.t-screen')!).backgroundColor,
      };
    });
  await expect(input).toBeFocused();
  const on = await state();
  expect(on.outline).toBe('none');
  expect(on.border).toBe('none');
  expect(on.shadow).toBe('none');
  expect(ratio(on.cursorFill, on.screen)).toBeGreaterThanOrEqual(3);
  await page.keyboard.press('Tab');
  const off = await state();
  expect(off.cursorFill).toBe('rgba(0, 0, 0, 0)');
  expect(off.cursorOutline).toMatch(/^solid \dpx$/);
  expect(ratio(on.bar, off.bar)).toBeGreaterThanOrEqual(3);
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
