import { createHash } from 'node:crypto';
import { gitRaw, isGatePath } from './git';

/**
 * sha256 over the NUL-joined `git ls-tree -r -z <rev>` entries (mode, type, object id, path) of every
 * file except those under `.gate/`. Committing a verdict therefore leaves the hash
 * unchanged, while any content, mode or path change elsewhere changes it.
 */
export function contentTreeHash(rev = 'HEAD', cwd = process.cwd()): string {
  // -z: paths are not quoted, so a path is matched exactly as stored.
  const entries = gitRaw(cwd, ['ls-tree', '-r', '-z', '--full-tree', rev]).split('\0').filter(Boolean);
  const kept = entries.filter((line) => !isGatePath(line.slice(line.indexOf('\t') + 1)));
  return createHash('sha256').update(kept.join('\0')).digest('hex');
}
