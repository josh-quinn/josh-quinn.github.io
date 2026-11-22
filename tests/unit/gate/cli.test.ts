import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { main, taskIdFromBranch } from '../../../tools/gate/cli';
import { readVerdict } from '../../../tools/gate/verdict';
import { captureIo, commitAll, gateYaml, git, isolateEnv, makeRepo, write } from './helpers';

let restore: () => void;
beforeEach(() => {
  restore = isolateEnv();
});
afterEach(() => restore());

const PASSING = gateYaml([{ name: 'ok', kind: 'deterministic', run: 'exit 0' }]);
const FAILING = gateYaml([{ name: 'bad', kind: 'deterministic', run: 'exit 1' }]);
const AI_JSON = `echo '{"score":90,"passes":true,"issues":[]}'`;

function repoWith(yaml: string): string {
  return makeRepo({ 'gate.yaml': yaml });
}
async function gate(repo: string, ...argv: string[]) {
  const c = captureIo(repo);
  const code = await main(argv, c.io);
  return { code, out: c.out(), err: c.err() };
}
function commitGate(repo: string) {
  git(repo, 'add', '.gate');
  git(repo, 'commit', '-q', '-m', 'chore(gate): verdict');
}

describe('gate task', () => {
  it('runs the checks, writes verdict.json and report.md, exits 0 on pass', async () => {
    const repo = repoWith(PASSING);
    const { code } = await gate(repo, 'task', 'T1');
    expect(code).toBe(0);
    const v = readVerdict('T1', repo)!;
    expect(v).toMatchObject({ version: 1, taskId: 'T1', mode: 'task', overall: 'pass' });
    expect(v.checks.map((c) => [c.name, c.status])).toEqual([['ok', 'pass']]);
    expect(existsSync(join(repo, '.gate/T1/report.md'))).toBe(true);
  });

  it('exits 1 and writes a failing verdict when a check fails', async () => {
    const repo = repoWith(FAILING);
    expect((await gate(repo, 'task', 'T1')).code).toBe(1);
    expect(readVerdict('T1', repo)!.overall).toBe('fail');
  });

  it('refuses with exit 2 on an untracked file and writes no verdict', async () => {
    const repo = repoWith(PASSING);
    write(repo, 'src/new.txt', 'x\n');
    const { code, err } = await gate(repo, 'task', 'T1');
    expect(code).toBe(2);
    expect(err).toContain('src/new.txt');
    expect(existsSync(join(repo, '.gate/T1/verdict.json'))).toBe(false);
  });

  it('refuses with exit 2 on a modified tracked file', async () => {
    const repo = repoWith(PASSING);
    write(repo, 'src/a', 'changed\n');
    expect((await gate(repo, 'task', 'T1')).code).toBe(2);
    expect(existsSync(join(repo, '.gate/T1/verdict.json'))).toBe(false);
  });

  it('refuses with exit 2 on a staged change', async () => {
    const repo = repoWith(PASSING);
    write(repo, 'src/a', 'changed\n');
    git(repo, 'add', 'src/a');
    expect((await gate(repo, 'task', 'T1')).code).toBe(2);
  });

  it('allows uncommitted changes under .gate/ only', async () => {
    const repo = repoWith(PASSING);
    write(repo, '.gate/T0/old.txt', 'stale\n');
    expect((await gate(repo, 'task', 'T1')).code).toBe(0);
  });

  it('allows gitignored files', async () => {
    const repo = repoWith(PASSING);
    write(repo, '.gitignore', 'scratch/\n');
    commitAll(repo, 'ignore scratch');
    write(repo, 'scratch/notes.md', 'x\n');
    expect((await gate(repo, 'task', 'T1')).code).toBe(0);
  });

  it('an AI check with a missing backend makes the gate fail (never pass by default)', async () => {
    const repo = repoWith(gateYaml([
      { name: 'ok', kind: 'deterministic', run: 'exit 0' },
      { name: 'auditor', kind: 'ai', run: 'definitely-not-a-binary -p x' },
    ]));
    expect((await gate(repo, 'task', 'T1')).code).toBe(1);
    const v = readVerdict('T1', repo)!;
    expect(v.overall).toBe('fail');
    expect(v.checks.find((c) => c.name === 'auditor')!.status).toBe('error');
  });

  it('an AI check that is not logged in, or returns malformed output, makes the gate fail', async () => {
    const repo = repoWith(gateYaml([
      { name: 'login', kind: 'ai', run: 'echo "Invalid API key. Please run /login"; exit 1' },
      { name: 'malformed', kind: 'ai', run: 'echo "score: 90, looks fine"' },
    ]));
    expect((await gate(repo, 'task', 'T1')).code).toBe(1);
    expect(readVerdict('T1', repo)!.checks.map((c) => c.status)).toEqual(['error', 'error']);
  });

  it('applies the timeout from the gate config file (TOOLS_CONFIG)', async () => {
    const repo = repoWith(gateYaml([{ name: 'slow', kind: 'ai', run: `sleep 5; ${AI_JSON}` }]));
    write(process.env.TOOLS_CONFIG!, 'gate/config.yaml', 'timeoutMs: 300\n');
    expect((await gate(repo, 'task', 'T1')).code).toBe(1);
    const c = readVerdict('T1', repo)!.checks[0];
    expect(c.status).toBe('error');
    expect(c.detail).toMatch(/timed out/i);
  });

  it('records the backend and model from the gate config for AI checks', async () => {
    const repo = repoWith(gateYaml([{ name: 'auditor', kind: 'ai', run: AI_JSON }]));
    write(process.env.TOOLS_CONFIG!, 'gate/config.yaml', 'ai:\n  model: m-local\n');
    expect((await gate(repo, 'task', 'T1')).code).toBe(0);
    expect(readVerdict('T1', repo)!.checks[0]).toMatchObject({ status: 'pass', score: 90, backend: 'claude', model: 'm-local' });
  });

  it('fails the verdict if a check changes the working tree', async () => {
    const repo = repoWith(gateYaml([{ name: 'dirty', kind: 'deterministic', run: 'echo x > src/a' }]));
    expect((await gate(repo, 'task', 'T1')).code).toBe(1);
    const v = readVerdict('T1', repo)!;
    expect(v.overall).toBe('fail');
    expect(v.checks.map((c) => [c.name, c.status])).toContainEqual(['clean-tree', 'error']);
  });

  it('exits 2 on an invalid task id', async () => {
    const repo = repoWith(PASSING);
    expect((await gate(repo, 'task', '../x')).code).toBe(2);
  });

  it('exits 2 when gate.yaml is missing or invalid', async () => {
    expect((await gate(makeRepo(), 'task', 'T1')).code).toBe(2);
    const bad = repoWith(gateYaml([{ name: 'x', kind: 'nope', run: 'exit 0' }]));
    const res = await gate(bad, 'task', 'T1');
    expect(res.code).toBe(2);
    expect(res.err).toMatch(/kind/);
  });

  it('exports GATE_TASK to the checks', async () => {
    const repo = repoWith(gateYaml([{ name: 'env', kind: 'deterministic', run: 'test "$GATE_TASK" = T7' }]));
    expect((await gate(repo, 'task', 'T7')).code).toBe(0);
  });
});

describe('gate design', () => {
  it('fails when the design mode has no checks (nothing checked is not a pass)', async () => {
    const repo = repoWith(PASSING);
    expect((await gate(repo, 'design', 'cv')).code).toBe(1);
    expect(readVerdict('design-cv', repo)!).toMatchObject({ mode: 'design', overall: 'fail' });
  });

  it('runs design-mode checks', async () => {
    const repo = repoWith(gateYaml([], [{ name: 'critic', kind: 'ai', run: AI_JSON }]));
    expect((await gate(repo, 'design', 'cv')).code).toBe(0);
  });
});

describe('gate verify', () => {
  async function passingCommitted(): Promise<string> {
    const repo = repoWith(PASSING);
    expect((await gate(repo, 'task', 'T1')).code).toBe(0);
    commitGate(repo);
    return repo;
  }

  it('passes right after a passing run plus committing .gate/', async () => {
    const repo = await passingCommitted();
    expect((await gate(repo, 'verify', 'T1')).code).toBe(0);
  });

  it('fails after an extra commit that touches src/', async () => {
    const repo = await passingCommitted();
    write(repo, 'src/a', 'later\n');
    commitAll(repo, 'feat: more');
    const res = await gate(repo, 'verify', 'T1');
    expect(res.code).toBe(1);
    expect(res.err).toMatch(/tree/i);
  });

  it('fails after an amend that changes content', async () => {
    const repo = await passingCommitted();
    write(repo, 'src/a', 'amended\n');
    git(repo, 'add', 'src/a');
    git(repo, 'commit', '-q', '--amend', '--no-edit');
    expect((await gate(repo, 'verify', 'T1')).code).toBe(1);
  });

  it('fails after a rebase onto a moved main', async () => {
    const repo = repoWith(PASSING);
    git(repo, 'checkout', '-q', '-b', 'task/T1-x');
    write(repo, 'src/b', 'feature\n');
    commitAll(repo, 'feat: b');
    expect((await gate(repo, 'task', 'T1')).code).toBe(0);
    commitGate(repo);
    expect((await gate(repo, 'verify', 'T1')).code).toBe(0);
    git(repo, 'checkout', '-q', 'main');
    write(repo, 'src/c', 'main moved\n');
    commitAll(repo, 'feat: c');
    git(repo, 'checkout', '-q', 'task/T1-x');
    git(repo, 'rebase', '-q', 'main');
    expect((await gate(repo, 'verify', 'T1')).code).toBe(1);
  });

  it('still passes after a commit that touches only .gate/', async () => {
    const repo = await passingCommitted();
    write(repo, '.gate/T2/note.txt', 'x\n');
    commitAll(repo, 'chore: other gate dir');
    expect((await gate(repo, 'verify', 'T1')).code).toBe(0);
  });

  it('fails when overall is fail', async () => {
    const repo = repoWith(FAILING);
    expect((await gate(repo, 'task', 'T1')).code).toBe(1);
    commitGate(repo);
    expect((await gate(repo, 'verify', 'T1')).code).toBe(1);
  });

  it('fails when no verdict exists', async () => {
    expect((await gate(repoWith(PASSING), 'verify', 'T1')).code).toBe(1);
  });

  it('fails when the verdict says pass but a check result is not pass (edited verdict)', async () => {
    const repo = repoWith(FAILING);
    await gate(repo, 'task', 'T1');
    const file = join(repo, '.gate/T1/verdict.json');
    const v = JSON.parse(readFileSync(file, 'utf8'));
    write(repo, '.gate/T1/verdict.json', JSON.stringify({ ...v, overall: 'pass' }));
    commitGate(repo);
    expect((await gate(repo, 'verify', 'T1')).code).toBe(1);
  });

  it('fails for a verdict of another task copied into place', async () => {
    const repo = repoWith(PASSING);
    await gate(repo, 'task', 'T2');
    write(repo, '.gate/T1/verdict.json', readFileSync(join(repo, '.gate/T2/verdict.json'), 'utf8'));
    commitGate(repo);
    expect((await gate(repo, 'verify', 'T1')).code).toBe(1);
  });
});

describe('gate integrity', () => {
  it('exits 0 when the authored tests are untouched, 1 with the changed files otherwise', async () => {
    const repo = repoWith(PASSING);
    write(repo, 'tests/acceptance/T1/a.spec.ts', 'a\n');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'test: a\n\nGate-Test-Author: T1');
    expect((await gate(repo, 'integrity', 'T1')).code).toBe(0);
    write(repo, 'tests/acceptance/T1/a.spec.ts', 'b\n');
    commitAll(repo, 'feat: x');
    const res = await gate(repo, 'integrity', 'T1');
    expect(res.code).toBe(1);
    expect(res.err + res.out).toContain('tests/acceptance/T1/a.spec.ts');
  });
});

describe('branch handling', () => {
  it('taskIdFromBranch reads task/<id>-<slug>', () => {
    expect(taskIdFromBranch('task/T1-hero-section')).toBe('T1');
    expect(taskIdFromBranch('task/T12')).toBe('T12');
    expect(taskIdFromBranch('slice/05-gate-core')).toBeNull();
    expect(taskIdFromBranch('main')).toBeNull();
    expect(taskIdFromBranch('feature/task/T1-x')).toBeNull();
  });

  it('taskIdFromBranch throws for a malformed task/ branch', () => {
    expect(() => taskIdFromBranch('task/-x')).toThrow();
    expect(() => taskIdFromBranch('task/')).toThrow();
    expect(() => taskIdFromBranch('task/../x')).toThrow();
  });

  it('verify --branch passes with a notice on a non-task branch', async () => {
    const res = await gate(repoWith(PASSING), 'verify', '--branch', 'slice/05-gate-core');
    expect(res.code).toBe(0);
    expect(res.out).toMatch(/not a task branch/i);
  });

  it('verify --branch enforces on a task branch', async () => {
    expect((await gate(repoWith(PASSING), 'verify', '--branch', 'task/T1-x')).code).toBe(1);
  });

  it('integrity --branch passes with a notice on a non-task branch', async () => {
    const res = await gate(repoWith(PASSING), 'integrity', '--branch', 'main');
    expect(res.code).toBe(0);
    expect(res.out).toMatch(/not a task branch/i);
  });

  it('--branch with a malformed task branch exits 2', async () => {
    expect((await gate(repoWith(PASSING), 'verify', '--branch', 'task/-x')).code).toBe(2);
  });
});

describe('gate pre-push', () => {
  it('passes with a notice on a non-task branch', async () => {
    const repo = repoWith(FAILING);
    const res = await gate(repo, 'pre-push');
    expect(res.code).toBe(0);
    expect(res.out).toMatch(/not a task branch/i);
  });

  it('passes on a task branch with a committed, current, passing verdict', async () => {
    const repo = repoWith(PASSING);
    git(repo, 'checkout', '-q', '-b', 'task/T1-x');
    await gate(repo, 'task', 'T1');
    commitGate(repo);
    expect((await gate(repo, 'pre-push')).code).toBe(0);
  });

  it('runs gate task when verify fails, and blocks so the new verdict gets committed', async () => {
    const repo = repoWith(PASSING);
    git(repo, 'checkout', '-q', '-b', 'task/T1-x');
    const res = await gate(repo, 'pre-push');
    expect(res.code).toBe(1);
    expect(res.err).toMatch(/commit .gate\/T1/);
    expect(readVerdict('T1', repo)!.overall).toBe('pass');
  });

  it('blocks when the checks fail', async () => {
    const repo = repoWith(FAILING);
    git(repo, 'checkout', '-q', '-b', 'task/T1-x');
    expect((await gate(repo, 'pre-push')).code).toBe(1);
  });

  it('blocks on a malformed task branch', async () => {
    const repo = repoWith(PASSING);
    git(repo, 'checkout', '-q', '-b', 'task/-x');
    expect((await gate(repo, 'pre-push')).code).toBe(2);
  });
});

describe('usage', () => {
  it('exits 2 on an unknown or missing command', async () => {
    const repo = repoWith(PASSING);
    expect((await gate(repo)).code).toBe(2);
    expect((await gate(repo, 'frobnicate')).code).toBe(2);
    expect((await gate(repo, 'verify')).code).toBe(2);
  });
});

describe('the real CLI entry point', () => {
  it('runs under tsx and returns the exit code', async () => {
    const repo = repoWith(PASSING);
    const tsx = resolve('node_modules/.bin/tsx');
    const cli = resolve('tools/gate/cli.ts');
    const run = (...args: string[]) => spawnSync(tsx, [cli, ...args], { cwd: repo, encoding: 'utf8' });
    expect(run('verify', 'T1').status).toBe(1);
    expect(run('task', 'T1').status).toBe(0);
    commitGate(repo);
    expect(run('verify', 'T1').status).toBe(0);
  }, 30_000);
});
