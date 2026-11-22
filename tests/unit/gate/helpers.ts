import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const ISOLATED_ENV = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM', 'TOOLS_CONFIG', 'JQ_TOOLS_CONFIG', 'GATE_TASK', 'GATE_TEST_AUTHOR'] as const;

/**
 * Isolate a test file from the developer's git and tool config: an empty global
 * git config, no system config, and TOOLS_CONFIG pointing at a temp dir.
 * Returns a restore function for afterEach.
 */
export function isolateEnv(): () => void {
  const saved = Object.fromEntries(ISOLATED_ENV.map((k) => [k, process.env[k]]));
  const home = mkdtempSync(join(tmpdir(), 'gate-env-'));
  writeFileSync(join(home, 'gitconfig'), '');
  process.env.GIT_CONFIG_GLOBAL = join(home, 'gitconfig');
  process.env.GIT_CONFIG_NOSYSTEM = '1';
  process.env.TOOLS_CONFIG = join(home, 'tools-config');
  delete process.env.JQ_TOOLS_CONFIG;
  delete process.env.GATE_TASK;
  delete process.env.GATE_TEST_AUTHOR;
  return () => {
    for (const k of ISOLATED_ENV) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  };
}

export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

export function write(root: string, rel: string, text: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}

export function commitAll(root: string, message: string): string {
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
}

/** A temp git repo on branch `main` with one commit containing src/a and README.md. */
export function makeRepo(files: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'gate-repo-'));
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.name', 'Gate Test');
  // Assembled at runtime so no address literal is committed.
  git(root, 'config', 'user.email', ['gate-test', 'users.noreply.github.com'].join('@'));
  git(root, 'config', 'commit.gpgsign', 'false');
  write(root, 'src/a', 'a\n');
  write(root, 'README.md', '# test\n');
  for (const [rel, text] of Object.entries(files)) write(root, rel, text);
  commitAll(root, 'init');
  return root;
}

/** gate.yaml text with the given task-mode checks. */
export function gateYaml(taskChecks: object[], designChecks: object[] = []): string {
  return JSON.stringify({ version: 1, modes: { task: { checks: taskChecks }, design: { checks: designChecks } } }, null, 2);
}

/** Collects what the CLI prints. */
export function captureIo(cwd: string) {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: { cwd, stdout: (s: string) => out.push(s), stderr: (s: string) => err.push(s) },
    out: () => out.join(''),
    err: () => err.join(''),
  };
}
