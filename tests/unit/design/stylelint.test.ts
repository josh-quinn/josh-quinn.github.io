import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import stylelint from 'stylelint';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const fixture = (name: string) => join(root, 'tests/unit/design/fixtures', name);

/** Lint one fixture with the repo's .stylelintrc.json; returns the rule ids that fired. */
async function rulesFor(name: string): Promise<string[]> {
  const file = fixture(name);
  const { results } = await stylelint.lint({
    code: readFileSync(file, 'utf8'),
    codeFilename: file,
    configFile: join(root, '.stylelintrc.json'),
    configBasedir: root,
  });
  return results.flatMap((r) => r.warnings.map((w) => w.rule));
}

describe('stylelint: colour, font and spacing only from tokens', () => {
  it('rejects a hard-coded colour (color: #333)', async () => {
    expect(await rulesFor('hex-colour.css')).toContain('scale-unlimited/declaration-strict-value');
  });

  it('rejects a raw font stack (font-family: Arial)', async () => {
    expect(await rulesFor('raw-font.css')).toContain('scale-unlimited/declaration-strict-value');
  });

  it('rejects raw spacing (padding: 13px)', async () => {
    expect(await rulesFor('raw-spacing.css')).toContain('scale-unlimited/declaration-strict-value');
  });

  it('rejects gradients (never list)', async () => {
    expect(await rulesFor('gradient.css')).toContain('function-disallowed-list');
  });

  it('allows structural gradients only in the paper layer (src/styles/paper.css)', async () => {
    const code = 'body::before {\n  background-image: linear-gradient(var(--grid-minor) 0 1px, transparent 1px);\n}\n';
    const lint = async (rel: string) =>
      (
        await stylelint.lint({ code, codeFilename: join(root, rel), configFile: join(root, '.stylelintrc.json'), configBasedir: root })
      ).results.flatMap((r) => r.warnings.map((w) => w.rule));
    expect(await lint('src/styles/paper.css')).toEqual([]);
    expect(await lint('src/styles/base.css')).toContain('function-disallowed-list');
  });

  it('lints <style> blocks in .astro files too', async () => {
    expect(await rulesFor('hex-colour.astro')).toContain('scale-unlimited/declaration-strict-value');
  });

  it('accepts colour, font and spacing from custom properties', async () => {
    expect(await rulesFor('tokens-only.css')).toEqual([]);
  });
});
