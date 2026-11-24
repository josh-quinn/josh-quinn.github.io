/**
 * Dependency check (DESIGN.md "never" list): the site uses no CSS framework or component kit.
 * Fails when package.json, or the lockfile's resolved tree, contains one.
 *
 *   npx tsx scripts/check-deps.ts      exit 0 clean, 1 forbidden package found
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Exact package names, and scopes (ending in `/`) whose every package is forbidden. */
const FORBIDDEN = ['tailwindcss', '@tailwindcss/', 'bootstrap', 'bulma', '@shadcn/', 'shadcn', 'shadcn-ui', 'daisyui'];
const FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const;

function forbidden(name: string): boolean {
  return FORBIDDEN.some((f) => (f.endsWith('/') ? name.startsWith(f) : name === f));
}

type Pkg = Partial<Record<(typeof FIELDS)[number], Record<string, string>>>;
type Lock = { packages?: Record<string, unknown> };

/** Forbidden names declared in `pkg`, then any found only in the lockfile (`<name> (via package-lock.json)`). */
export function findForbiddenDeps(pkg: Pkg, lock?: Lock): string[] {
  const declared = new Set(FIELDS.flatMap((f) => Object.keys(pkg[f] ?? {})).filter(forbidden));
  const out = [...declared];
  for (const key of Object.keys(lock?.packages ?? {})) {
    const name = key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
    if (key && forbidden(name) && !declared.has(name)) {
      declared.add(name);
      out.push(`${name} (via package-lock.json)`);
    }
  }
  return out;
}

function main(root = process.cwd()): number {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as Pkg;
  const lockPath = join(root, 'package-lock.json');
  const lock = existsSync(lockPath) ? (JSON.parse(readFileSync(lockPath, 'utf8')) as Lock) : undefined;
  const hits = findForbiddenDeps(pkg, lock);
  if (hits.length === 0) {
    console.log('deps: no CSS framework or component kit in package.json or package-lock.json');
    return 0;
  }
  console.error(`deps: forbidden by DESIGN.md (no CSS framework, no component kit):\n${hits.map((h) => `  ${h}\n`).join('')}`);
  return 1;
}

const invokedDirectly = (() => {
  try {
    return !!process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
})();
if (invokedDirectly) process.exitCode = main();
