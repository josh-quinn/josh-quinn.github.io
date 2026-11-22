import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { distDir as dist, htmlFiles } from '../helpers/dist';
import { assertNoPrivateData } from './patterns';

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
