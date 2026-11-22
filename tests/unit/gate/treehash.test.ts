import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { contentTreeHash } from '../../../tools/gate/treehash';
import { commitAll, git, isolateEnv, makeRepo, write } from './helpers';

let restore: () => void;
let repo: string;
beforeEach(() => {
  restore = isolateEnv();
  repo = makeRepo();
});
afterEach(() => restore());

describe('contentTreeHash', () => {
  it('is a sha256 hex digest', () => {
    expect(contentTreeHash('HEAD', repo)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is unchanged when only .gate/x changes', () => {
    const before = contentTreeHash('HEAD', repo);
    write(repo, '.gate/x', 'verdict\n');
    commitAll(repo, 'add .gate/x');
    expect(contentTreeHash('HEAD', repo)).toBe(before);
    write(repo, '.gate/x', 'changed\n');
    commitAll(repo, 'change .gate/x');
    expect(contentTreeHash('HEAD', repo)).toBe(before);
  });

  it('changes when src/a changes', () => {
    const before = contentTreeHash('HEAD', repo);
    write(repo, 'src/a', 'b\n');
    commitAll(repo, 'change src/a');
    expect(contentTreeHash('HEAD', repo)).not.toBe(before);
  });

  it('does not exclude look-alike paths such as .gatex/ or src/.gate/', () => {
    const before = contentTreeHash('HEAD', repo);
    write(repo, '.gatex/y', 'y\n');
    commitAll(repo, 'add .gatex');
    const mid = contentTreeHash('HEAD', repo);
    expect(mid).not.toBe(before);
    write(repo, 'src/.gate/z', 'z\n');
    commitAll(repo, 'add src/.gate');
    expect(contentTreeHash('HEAD', repo)).not.toBe(mid);
  });

  it('changes when only a file mode changes', () => {
    const before = contentTreeHash('HEAD', repo);
    git(repo, 'update-index', '--chmod=+x', 'src/a');
    git(repo, 'commit', '-q', '-m', 'chmod');
    expect(contentTreeHash('HEAD', repo)).not.toBe(before);
  });

  it('hashes a given revision, not only HEAD', () => {
    const first = contentTreeHash('HEAD', repo);
    write(repo, 'src/a', 'b\n');
    commitAll(repo, 'change');
    expect(contentTreeHash('HEAD~1', repo)).toBe(first);
  });

  it('throws on an unknown revision', () => {
    expect(() => contentTreeHash('no-such-rev', repo)).toThrow();
  });
});
