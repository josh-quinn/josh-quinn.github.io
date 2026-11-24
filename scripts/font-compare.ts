/**
 * Font comparison (DESIGN.md "Fonts"): screenshot each serif candidate's block on /_fonts/ at
 * 390 and 1280px, put each beside the reference screenshots in a local composite, and (with
 * --score) ask the design critic to score each candidate against the reference.
 * Everything is written to the uncommitted .cache/fonts/. Needs a build (npm run build).
 *
 *   npx tsx scripts/font-compare.ts [--score] [--backend <b>] [--model <m>]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { critiqueShots, referenceShots, resolvePair } from '../tools/gate/ai-eval';
import { startServer } from './serve-dist.mjs';

const OUT = join(process.cwd(), '.cache', 'fonts');
const CANDIDATES = ['brygada', 'newsreader', 'source'];
const WIDTHS = [390, 1280] as const;

async function main(argv: string[]): Promise<void> {
  const arg = (k: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
  mkdirSync(OUT, { recursive: true });
  const server = await startServer('dist', 0);
  const browser = await chromium.launch();
  const shots: Record<string, string[]> = {};
  try {
    for (const w of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      await page.goto(`${server.url}/_fonts/`, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      for (const c of CANDIDATES) {
        const file = join(OUT, `${c}-${w}.png`);
        await page.locator(`[data-font="${c}"]`).screenshot({ path: file });
        (shots[c] ??= []).push(file);
      }
      await ctx.close();
    }

    // Local composites for a human look: the reference beside each candidate, per width.
    const ref = await referenceShots();
    for (const [i, w] of WIDTHS.entries()) {
      const cells = [`<figure><figcaption>reference</figcaption><img src="${pathToFileURL(ref.shots.files[i]).href}"></figure>`]
        .concat(CANDIDATES.map((c) => `<figure><figcaption>${c}</figcaption><img src="${pathToFileURL(shots[c][i]).href}"></figure>`))
        .join('');
      const html = join(OUT, `compare-${w}.html`);
      writeFileSync(
        html,
        `<!doctype html><meta charset="utf-8"><style>body{margin:0;display:flex;gap:16px;align-items:flex-start;background:#888;font:14px monospace}figure{margin:0}img{display:block;width:${w}px}</style>${cells}`,
      );
      const ctx = await browser.newContext({ viewport: { width: (w + 16) * 4, height: 900 } });
      const page = await ctx.newPage();
      await page.goto(pathToFileURL(html).href);
      await page.screenshot({ path: join(OUT, `compare-${w}.png`), fullPage: true });
      await ctx.close();
      console.log(`fonts: composite ${join('.cache', 'fonts', `compare-${w}.png`)}`);
    }
  } finally {
    await browser.close();
    await server.close();
  }

  if (argv.includes('--score')) {
    const pair = resolvePair('design-critic', { backend: arg('--backend'), model: arg('--model') });
    for (const c of CANDIDATES) {
      const r = await critiqueShots([{ label: `font candidate ${c} (a CV block)`, files: shots[c] }], pair);
      console.log(`fonts: ${c}: score ${r.score} passes ${r.passes} tokens ${r.tokens.input}/${r.tokens.output}`);
      for (const i of r.issues) console.log(`  - ${i}`);
    }
  }
}

main(process.argv.slice(2)).catch((e) => {
  console.error(`fonts: ${(e as Error).message}`);
  process.exitCode = 1;
});
