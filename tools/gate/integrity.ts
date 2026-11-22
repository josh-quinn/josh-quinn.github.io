import { BaseRefError, changedBetween, gitRaw, mergeBase } from './git';
import { assertTaskId } from './ids';

export const TEST_AUTHOR_TRAILER = 'Gate-Test-Author';

export type IntegrityResult = { ok: boolean; changed: string[]; reason?: string };

/**
 * Commits in `base..HEAD` whose trailers include `Gate-Test-Author: <taskId>`
 * (exact value, real trailers only), oldest first.
 */
export function testAuthorCommits(taskId: string, base: string, cwd = process.cwd()): string[] {
  const out = gitRaw(cwd, ['log', '-z', '--reverse', `--format=%H%x01%(trailers:key=${TEST_AUTHOR_TRAILER},valueonly,separator=%x02)`, `${base}..HEAD`]);
  const shas: string[] = [];
  for (const rec of out.split('\0')) {
    const [sha, values = ''] = rec.replace(/^\n/, '').split('\x01');
    if (sha && values.split('\x02').some((v) => v.trim() === taskId)) shas.push(sha.trim());
  }
  return shas;
}

/**
 * Test-first provenance of `tests/acceptance/<taskId>/` on this branch (commits since the
 * merge base with the base ref; default origin/main, else main). Ok only when:
 *   - exactly one commit on the branch carries `Gate-Test-Author: <taskId>`,
 *   - it is the first commit on the branch and touches only `tests/acceptance/<taskId>/`,
 *   - nothing under `tests/acceptance/<taskId>/` changed after it,
 *   - the branch changes no other task's `tests/acceptance/` folder.
 * Anything else, including no base or no trailer commit, is not ok (fail closed).
 */
export function checkTestIntegrity(taskId: string, cwd = process.cwd(), baseRef?: string): IntegrityResult {
  assertTaskId(taskId);
  const own = `tests/acceptance/${taskId}/`;
  let base: string | null;
  try {
    base = mergeBase(cwd, 'HEAD', baseRef);
  } catch (e) {
    if (e instanceof BaseRefError) return { ok: false, changed: [], reason: e.message };
    throw e;
  }
  if (!base) return { ok: false, changed: [], reason: 'no base ref (origin/main or main) to measure the branch from' };

  const authored = testAuthorCommits(taskId, base, cwd);
  if (authored.length === 0)
    return { ok: false, changed: [], reason: `no commit with trailer "${TEST_AUTHOR_TRAILER}: ${taskId}" on this branch (since the merge base with main)` };
  if (authored.length > 1)
    return {
      ok: false,
      changed: [],
      reason: `${authored.length} commits carry "${TEST_AUTHOR_TRAILER}: ${taskId}" (${authored.map((s) => s.slice(0, 8)).join(', ')}); expected exactly one`,
    };
  const [author] = authored;

  const before = gitRaw(cwd, ['rev-list', `${base}..${author}`]).split('\n').filter((s) => s && s !== author);
  if (before.length > 0)
    return {
      ok: false,
      changed: [],
      reason: `${before.length} commit(s) on the branch come before the test-author commit ${author.slice(0, 8)}; the tests must come first`,
    };

  const outside = changedBetween(cwd, `${author}^`, author).filter((f) => !f.startsWith(own));
  if (outside.length > 0)
    return { ok: false, changed: outside, reason: `the test-author commit ${author.slice(0, 8)} changes files outside ${own}` };

  const foreign = changedBetween(cwd, base, 'HEAD', ['tests/acceptance/']).filter((f) => !f.startsWith(own));
  if (foreign.length > 0) return { ok: false, changed: foreign, reason: `the branch changes acceptance tests outside ${own}` };

  const changed = changedBetween(cwd, author, 'HEAD', [own]);
  if (changed.length > 0) return { ok: false, changed, reason: `${own} changed after the test-author commit` };
  return { ok: true, changed: [] };
}
