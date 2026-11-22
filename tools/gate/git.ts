import { execFileSync } from 'node:child_process';

/** Run git and return stdout (not trimmed). Throws on a non-zero exit. */
export function gitRaw(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}

export function git(cwd: string, args: string[]): string {
  return gitRaw(cwd, args).trim();
}

/** Like `git`, but returns null instead of throwing. */
export function gitOrNull(cwd: string, args: string[]): string | null {
  try {
    return git(cwd, args);
  } catch {
    return null;
  }
}

/** Absolute path of the repository's top-level directory. */
export function repoRoot(cwd: string): string {
  return git(cwd, ['rev-parse', '--show-toplevel']);
}

/** Paths under `.gate/` are gate output and never part of what a verdict is about. */
export function isGatePath(path: string): boolean {
  return path === '.gate' || path.startsWith('.gate/');
}

/**
 * Working-tree changes outside `.gate/`: staged, unstaged and untracked (not ignored).
 * Each entry is one `git status --porcelain` path.
 */
export function dirtyOutsideGate(cwd: string): string[] {
  const fields = gitRaw(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all']).split('\0');
  const paths: string[] = [];
  for (let i = 0; i < fields.length; i++) {
    const entry = fields[i];
    if (!entry) continue;
    const xy = entry.slice(0, 2);
    paths.push(entry.slice(3));
    // Renames and copies carry the source path in the next field.
    if (xy[0] === 'R' || xy[0] === 'C') paths.push(fields[++i]);
  }
  return paths.filter((p) => p && !isGatePath(p));
}

/** Base refs tried, in order, when none is given. */
export const DEFAULT_BASE_REFS = ['origin/main', 'main'];

export class BaseRefError extends Error {}

/**
 * The merge base of `rev` with the base ref: the given one (which must resolve), else the
 * first of origin/main and main that resolves. Null when no default resolves.
 */
export function mergeBase(cwd: string, rev = 'HEAD', baseRef?: string): string | null {
  const refs = baseRef ? [baseRef] : DEFAULT_BASE_REFS;
  for (const ref of refs) {
    if (gitOrNull(cwd, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]) === null) continue;
    const mb = gitOrNull(cwd, ['merge-base', ref, rev]);
    if (mb) return mb;
  }
  if (baseRef) throw new BaseRefError(`base ref ${JSON.stringify(baseRef)} does not resolve to a commit with a merge base`);
  return null;
}

/** Files changed between two commits (NUL-safe, renames as delete + add). */
export function changedBetween(cwd: string, from: string, to: string, paths: string[] = []): string[] {
  return gitRaw(cwd, ['diff', '-z', '--name-only', '--no-renames', from, to, '--', ...paths]).split('\0').filter(Boolean);
}
