import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkTestIntegrity } from '../../../tools/gate/integrity';
import { commitAll, git, isolateEnv, makeRepo, write } from './helpers';

let restore: () => void;
let repo: string;
const SPEC = 'tests/acceptance/T1/a.spec.ts';

/** One commit with the Gate-Test-Author trailer, adding the given files. */
function authorTests(id = 'T1', files: Record<string, string> = { [SPEC]: 'test a\n' }) {
  for (const [rel, text] of Object.entries(files)) write(repo, rel, text);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', `test(${id}): acceptance tests\n\nGate-Test-Author: ${id}`);
}

beforeEach(() => {
  restore = isolateEnv();
  repo = makeRepo();
  // Task work happens on a branch off main; main is the base.
  git(repo, 'checkout', '-q', '-b', 'task/T1-x');
});
afterEach(() => restore());

describe('checkTestIntegrity', () => {
  it('is ok right after the test-author commit', () => {
    authorTests();
    expect(checkTestIntegrity('T1', repo)).toMatchObject({ ok: true, changed: [] });
  });

  it('flags a later modification of an authored test', () => {
    authorTests();
    write(repo, SPEC, 'test a, weakened\n');
    commitAll(repo, 'feat: implement');
    expect(checkTestIntegrity('T1', repo)).toMatchObject({ ok: false, changed: [SPEC] });
  });

  it('stays ok when a new file is added elsewhere', () => {
    authorTests();
    write(repo, 'src/feature.ts', 'export {};\n');
    commitAll(repo, 'feat: implement');
    expect(checkTestIntegrity('T1', repo)).toMatchObject({ ok: true, changed: [] });
  });

  it('flags added, deleted and renamed files under the task folder', () => {
    authorTests('T1', { [SPEC]: 'a\n', 'tests/acceptance/T1/b.spec.ts': 'b\n' });
    write(repo, 'tests/acceptance/T1/extra.spec.ts', 'x\n');
    git(repo, 'rm', '-q', 'tests/acceptance/T1/b.spec.ts');
    git(repo, 'mv', SPEC, 'tests/acceptance/T1/renamed.spec.ts');
    commitAll(repo, 'feat: implement');
    const res = checkTestIntegrity('T1', repo);
    expect(res.ok).toBe(false);
    expect(res.changed.sort()).toEqual(
      [SPEC, 'tests/acceptance/T1/b.spec.ts', 'tests/acceptance/T1/extra.spec.ts', 'tests/acceptance/T1/renamed.spec.ts'].sort(),
    );
  });

  it('is not ok when no commit carries the trailer (fail closed)', () => {
    write(repo, SPEC, 'a\n');
    commitAll(repo, 'test: no trailer');
    const res = checkTestIntegrity('T1', repo);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/Gate-Test-Author: T1/);
  });

  it('matches the trailer value exactly (T10 does not count for T1)', () => {
    authorTests('T10', { 'tests/acceptance/T10/a.spec.ts': 'a\n' });
    expect(checkTestIntegrity('T1', repo).ok).toBe(false);
  });

  it('ignores the trailer text when it is not a trailer (mid-message)', () => {
    write(repo, SPEC, 'a\n');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'test: x\n\nGate-Test-Author: T1\n\nmore prose after it');
    expect(checkTestIntegrity('T1', repo).ok).toBe(false);
  });

  // Review finding 1: a later, self-made trailer commit must not reset the baseline.
  it('fails when more than one commit carries the trailer for the task', () => {
    authorTests();
    authorTests('T1', { [SPEC]: 'weakened, with a second trailer commit\n' });
    const res = checkTestIntegrity('T1', repo);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/exactly one/i);
  });

  it('fails when the test-author commit touches files outside tests/acceptance/<id>/', () => {
    authorTests('T1', { [SPEC]: 'a\n', 'src/impl.ts': 'export {};\n' });
    const res = checkTestIntegrity('T1', repo);
    expect(res.ok).toBe(false);
    expect(res.changed).toEqual(['src/impl.ts']);
  });

  it('fails when any commit on the branch precedes the test-author commit (tests come first)', () => {
    write(repo, 'src/impl.ts', 'export {};\n');
    commitAll(repo, 'feat: implementation first');
    authorTests();
    const res = checkTestIntegrity('T1', repo);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/before the test-author commit/i);
  });

  it('ignores trailer commits already on the base branch', () => {
    git(repo, 'checkout', '-q', 'main');
    authorTests();
    git(repo, 'checkout', '-q', '-b', 'task/T1-y');
    const res = checkTestIntegrity('T1', repo);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/Gate-Test-Author: T1/);
  });

  it('fails when the branch changes another task\'s acceptance tests', () => {
    authorTests();
    write(repo, 'tests/acceptance/T2/other.spec.ts', 'other\n');
    commitAll(repo, 'feat: implement');
    const res = checkTestIntegrity('T1', repo);
    expect(res.ok).toBe(false);
    expect(res.changed).toEqual(['tests/acceptance/T2/other.spec.ts']);
  });

  it('uses the given base ref', () => {
    git(repo, 'checkout', '-q', 'main');
    git(repo, 'checkout', '-q', '-b', 'stack');
    write(repo, 'src/stacked.ts', 'x\n');
    commitAll(repo, 'feat: stacked base');
    git(repo, 'checkout', '-q', '-b', 'task/T1-z');
    authorTests();
    expect(checkTestIntegrity('T1', repo).ok).toBe(false);
    expect(checkTestIntegrity('T1', repo, 'stack').ok).toBe(true);
  });

  it('fails closed when no base ref resolves', () => {
    authorTests();
    const res = checkTestIntegrity('T1', repo, 'no-such-base');
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/base/);
  });
});
