/**
 * Reference screenshots for the design critic (DESIGN.md "References").
 * Captured fresh into the uncommitted `.cache/reference/`, at most once per `maxAgeHours`.
 * Third-party pages are never committed. When a reference site is unreachable, the cached
 * copy is used and the result carries a note saying so.
 *
 *   npx tsx scripts/reference-screens.ts [--force]
 */
import { existsSync, mkdirSync, realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Browser } from '@playwright/test';

export const REFERENCE_URLS = ['https://pi.dev/'];
export const REFERENCE_WIDTHS: [390, 1280] = [390, 1280];
export const REFERENCE_DIR = join(process.cwd(), '.cache', 'reference');
/** Screenshots are cut at this height: enough for the first screens of type and layout. */
export const MAX_SHOT_HEIGHT = 2000;

export type CaptureOptions = { urls: string[]; widths: [390, 1280]; maxAgeHours: number };
export type CaptureResult = { files: string[]; fromCache: boolean; note?: string };
export type Shoot = (url: string, width: number, file: string) => Promise<void>;
export type CaptureDeps = {
  /** Cache directory; default `.cache/reference/` in the working directory. */
  dir?: string;
  fetch?: typeof fetch;
  /** Takes one screenshot; default is Playwright Chromium (see `openShooter`). */
  shoot?: Shoot;
  /** Ignore the age of the cache (still falls back to it when unreachable). */
  force?: boolean;
};

function slug(url: string): string {
  const u = new URL(url);
  return `${u.hostname}${u.pathname}`.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Where the screenshot of `url` at `width` is cached. */
export function referenceFile(dir: string, url: string, width: number): string {
  return join(dir, `${slug(url)}-${width}.png`);
}

/** Probe `url`; null when it answers 2xx, else the reason it is unreachable. */
async function unreachable(url: string, doFetch: typeof fetch): Promise<string | null> {
  try {
    const res = await doFetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15_000) });
    return res.ok ? null : `HTTP ${res.status}`;
  } catch (e) {
    return (e as Error).message || String(e);
  }
}

/**
 * Screenshot each url at each width into the cache, unless the cached copy is younger than
 * `maxAgeHours`. If a site is unreachable, fall back to the cache (`fromCache: true` with a
 * note naming the site and the cache date); with no cache, throw.
 */
export async function captureReferences(opts: CaptureOptions, deps: CaptureDeps = {}): Promise<CaptureResult> {
  const dir = deps.dir ?? REFERENCE_DIR;
  const files = opts.urls.flatMap((u) => opts.widths.map((w) => referenceFile(dir, u, w)));
  const cached = files.every((f) => existsSync(f));
  const oldest = cached ? Math.min(...files.map((f) => statSync(f).mtimeMs)) : 0;
  if (cached && !deps.force && Date.now() - oldest < opts.maxAgeHours * 3_600_000) return { files, fromCache: true };

  const doFetch = deps.fetch ?? fetch;
  const down: string[] = [];
  for (const url of opts.urls) {
    const why = await unreachable(url, doFetch);
    if (why) down.push(`${new URL(url).hostname} unreachable (${why})`);
  }
  if (down.length > 0) {
    if (!cached) throw new Error(`${down.join('; ')}, and no cached reference in ${dir}`);
    return { files, fromCache: true, note: `${down.join('; ')}; using the cached reference from ${new Date(oldest).toISOString()}` };
  }

  mkdirSync(dir, { recursive: true });
  const shooter = deps.shoot ? { shoot: deps.shoot, close: async () => {} } : await openShooter();
  try {
    for (const url of opts.urls) for (const w of opts.widths) await shooter.shoot(url, w, referenceFile(dir, url, w));
  } finally {
    await shooter.close();
  }
  return { files, fromCache: false };
}

/** One page at one width: light scheme, reduced motion, fonts loaded, cut at MAX_SHOT_HEIGHT. */
export async function shootPage(browser: Browser, url: string, width: number, file: string): Promise<void> {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'reduce' });
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.screenshot({ path: file, fullPage: true, clip: { x: 0, y: 0, width, height: Math.min(height, MAX_SHOT_HEIGHT) }, animations: 'disabled' });
  } finally {
    await context.close();
  }
}

/** A Chromium session for `shootPage`; close it when done. */
export async function openShooter(): Promise<{ shoot: Shoot; close: () => Promise<void> }> {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  return { shoot: (url, width, file) => shootPage(browser, url, width, file), close: () => browser.close() };
}

async function main(argv: string[]): Promise<number> {
  try {
    const r = await captureReferences({ urls: REFERENCE_URLS, widths: REFERENCE_WIDTHS, maxAgeHours: 24 }, { force: argv.includes('--force') });
    if (r.note) console.error(`refs: ${r.note}`);
    console.log(`refs: ${r.fromCache ? 'cached' : 'captured'}: ${r.files.map((f) => f.replace(process.cwd() + '/', '')).join(', ')}`);
    return 0;
  } catch (e) {
    console.error(`refs: ${(e as Error).message}`);
    return 1;
  }
}

const invokedDirectly = (() => {
  try {
    return !!process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
})();
if (invokedDirectly) main(process.argv.slice(2)).then((c) => (process.exitCode = c));
