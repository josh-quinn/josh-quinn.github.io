import { gitRaw } from './git';
import { assertTaskId } from './ids';

export const TEST_AUTHOR_TRAILER = 'Gate-Test-Author';

export type IntegrityResult = { ok: boolean; changed: string[]; reason?: string };

/**
 * The most recent commit reachable from HEAD whose trailers include
 * `Gate-Test-Author: <taskId>` (exact value, real trailer only), or null.
 */
export function testAuthorCommit(taskId: string, cwd = process.cwd()): string | null {
  const out = gitRaw(cwd, ['log', '-z', `--format=%H%x01%(trailers:key=${TEST_AUTHOR_TRAILER},valueonly,separator=%x02)`, 'HEAD']);
  for (const rec of out.split('\0')) {
    const [sha, values = ''] = rec.replace(/^\n/, '').split('\x01');
    if (sha && values.split('\x02').some((v) => v.trim() === taskId)) return sha.trim();
  }
  return null;
}

/**
 * Diff `tests/acceptance/<taskId>/` between the latest test-author commit and HEAD.
 * Any added, deleted, modified or renamed file means not ok. No test-author commit also
 * means not ok: without a baseline the tests' provenance cannot be shown.
 */
export function checkTestIntegrity(taskId: string, cwd = process.cwd()): IntegrityResult {
  assertTaskId(taskId);
  const base = testAuthorCommit(taskId, cwd);
  if (!base) return { ok: false, changed: [], reason: `no commit with trailer "${TEST_AUTHOR_TRAILER}: ${taskId}" is reachable from HEAD` };
  const out = gitRaw(cwd, ['diff', '-z', '--name-only', '--no-renames', base, 'HEAD', '--', `tests/acceptance/${taskId}/`]);
  const changed = out.split('\0').filter(Boolean);
  return { ok: changed.length === 0, changed };
}
