import { describe, expect, it } from 'vitest';
import { findForbiddenDeps } from '../../../scripts/check-deps';

type Pkg = Parameters<typeof findForbiddenDeps>[0];
const pkg = (deps: Record<string, string>, field = 'dependencies'): Pkg => ({ [field]: deps });

describe('dependency check: no CSS framework or component kit', () => {
  it.each(['tailwindcss', '@tailwindcss/vite', 'bootstrap', 'bulma', '@shadcn/ui', 'shadcn', 'daisyui'])('fails on %s', (name) => {
    expect(findForbiddenDeps(pkg({ [name]: '1.0.0' }))).toEqual([name]);
  });

  it.each(['devDependencies', 'optionalDependencies', 'peerDependencies'])('looks in %s too', (field) => {
    expect(findForbiddenDeps(pkg({ tailwindcss: '4.0.0' }, field))).toEqual(['tailwindcss']);
  });

  it('passes the real site dependencies', () => {
    expect(findForbiddenDeps(pkg({ astro: '7.0.0', yaml: '2.0.0', stylelint: '18.0.0' }))).toEqual([]);
  });

  it('does not match on a substring of an allowed name', () => {
    expect(findForbiddenDeps(pkg({ 'not-bootstrap-at-all': '1.0.0', 'prettier-plugin-tailwind-free': '1.0.0' }))).toEqual([]);
  });

  it('reports transitive packages found in a lockfile', () => {
    const lock = { packages: { '': {}, 'node_modules/astro': {}, 'node_modules/foo/node_modules/daisyui': {} } };
    expect(findForbiddenDeps(pkg({ astro: '7.0.0' }), lock)).toEqual(['daisyui (via package-lock.json)']);
  });
});
