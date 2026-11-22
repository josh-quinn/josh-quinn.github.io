import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { assertNoPrivateData } from './patterns';

function htmlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? htmlFiles(join(dir, e.name))
      : e.name.endsWith('.html')
        ? [join(dir, e.name)]
        : [],
  );
}

const dist = join(process.cwd(), 'dist');
const files = htmlFiles(dist);

test('dist contains built HTML to scan', () => {
  expect(files.length).toBeGreaterThan(0);
});

for (const file of files) {
  test(`no private data in ${file.slice(dist.length + 1)}`, () => {
    // Raw source, attributes included.
    assertNoPrivateData(readFileSync(file, 'utf8'));
  });
}
