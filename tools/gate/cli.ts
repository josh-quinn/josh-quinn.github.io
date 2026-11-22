/**
 * gate: run a task's checks, write `.gate/<id>/verdict.json` + `report.md`, and verify that a
 * passing verdict exists for the exact tree at HEAD.
 *
 *   gate task <id>                     run the `task` checks from gate.yaml (exit 0 pass, 1 fail, 2 refused)
 *   gate design <page>                 run the `design` checks (verdict in .gate/design-<page>/)
 *   gate verify <id> | --branch <b>    exit 0 only for a passing verdict whose tree hash matches HEAD
 *   gate integrity <id> | --branch <b> exit 0 if tests/acceptance/<id>/ is unchanged since the test-author commit
 *   gate pre-push                      git hook: verify, else run the task, for task/<id>-<slug> branches
 *
 * `--branch` takes a branch name (CI: the PR head ref). On a branch that is not task/<id>-<slug>
 * it prints a notice and exits 0; enforcement happens on task branches.
 */
import { existsSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadToolConfig } from '../lib/config';
import { DEFAULT_TIMEOUT_MS, parseGateFile, runChecks } from './checks';
import { dirtyOutsideGate, gitOrNull, gitRaw, repoRoot } from './git';
import { assertTaskId, isTaskId, taskIdFromBranch } from './ids';
import { checkTestIntegrity } from './integrity';
import { contentTreeHash } from './treehash';
import { overallOf, readVerdict, writeVerdict, type CheckResult, type Verdict } from './verdict';

export { taskIdFromBranch } from './ids';

export type Io = { cwd: string; stdout: (s: string) => void; stderr: (s: string) => void };

/** Machine defaults, in `~/.config/jq-tools/gate/config.yaml` (root overridable by $TOOLS_CONFIG). */
export const GATE_DEFAULTS = {
  /** Default per-check timeout; a check's own `timeoutMs` in gate.yaml wins. */
  timeoutMs: DEFAULT_TIMEOUT_MS,
  /** Base for the changed-file list that `when` globs match against. */
  baseRef: 'origin/main',
  /** Default backend and model for AI checks that do not name their own. */
  ai: { backend: 'claude', model: 'sonnet' },
};
export type GateConfig = typeof GATE_DEFAULTS;

const USAGE = `usage:
  gate task <id>
  gate design <page>
  gate verify <id> | gate verify --branch <branch>
  gate integrity <id> | gate integrity --branch <branch>
  gate pre-push
`;

class UsageError extends Error {}

function rel(root: string, path: string): string {
  return path.startsWith(root + '/') ? path.slice(root.length + 1) : path;
}

function notice(io: Io, message: string): void {
  // A GitHub Actions annotation in CI, a plain line elsewhere.
  io.stdout(process.env.GITHUB_ACTIONS === 'true' ? `::notice title=gate::${message}\n` : `gate: ${message}\n`);
}

/** Files changed between the merge base with the base ref and HEAD; every tracked file if no base resolves. */
function changedFiles(root: string, baseRef: string): string[] {
  for (const ref of [...new Set([baseRef, 'origin/main', 'main'])]) {
    if (gitOrNull(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]) === null) continue;
    const mb = gitOrNull(root, ['merge-base', ref, 'HEAD']);
    if (!mb) continue;
    return gitRaw(root, ['diff', '-z', '--name-only', mb, 'HEAD']).split('\0').filter(Boolean);
  }
  return gitRaw(root, ['ls-files', '-z']).split('\0').filter(Boolean);
}

function loadGateFile(root: string) {
  const path = join(root, 'gate.yaml');
  if (!existsSync(path)) throw new UsageError(`no gate.yaml at the repository root`);
  try {
    return parseGateFile(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new UsageError((e as Error).message);
  }
}

async function runGate(mode: 'task' | 'design', taskId: string, io: Io, root: string): Promise<number> {
  const dirty = dirtyOutsideGate(root);
  if (dirty.length > 0) {
    io.stderr(
      `gate: refusing to run on a dirty working tree; commit or stash these first (only .gate/ may differ):\n` +
        dirty.map((p) => `  ${p}\n`).join(''),
    );
    return 2;
  }
  const checks = loadGateFile(root)[mode];
  const config = loadToolConfig<GateConfig>('gate', GATE_DEFAULTS);
  const treeHash = contentTreeHash('HEAD', root);
  rmSync(join(root, '.gate', taskId, 'evidence'), { recursive: true, force: true });
  if (checks.length === 0) io.stderr(`gate: no checks configured for mode ${mode} in gate.yaml; that is not a pass\n`);

  const results: CheckResult[] = await runChecks(checks, changedFiles(root, config.baseRef), {
    cwd: root,
    taskId,
    timeoutMs: config.timeoutMs,
    ai: config.ai,
    env: { GATE_MODE: mode },
  });

  // A verdict is only about the tree it was made on: checks must not change it.
  const after = dirtyOutsideGate(root);
  if (after.length > 0 || contentTreeHash('HEAD', root) !== treeHash) {
    results.push({
      name: 'clean-tree',
      kind: 'deterministic',
      status: 'error',
      evidence: '',
      durationMs: 0,
      detail: `checks changed the tree: ${after.join(', ') || 'HEAD moved'}`,
    });
  }

  const verdict: Verdict = {
    version: 1,
    taskId,
    mode,
    treeHash,
    createdAt: new Date().toISOString(),
    checks: results,
    overall: overallOf(results),
  };
  const path = writeVerdict(verdict, root);
  for (const r of results) {
    io.stdout(`  ${r.status.padEnd(7)} ${r.name}${r.score !== undefined ? ` (score ${r.score})` : ''}${r.detail ? `: ${r.detail}` : ''}\n`);
  }
  io.stdout(`gate: ${mode} ${taskId}: ${verdict.overall} (${rel(root, path)}, report.md)\n`);
  return verdict.overall === 'pass' ? 0 : 1;
}

export function verifyTask(taskId: string, root: string): { ok: boolean; reason: string } {
  const v = readVerdict(taskId, root);
  if (!v) return { ok: false, reason: `no valid verdict at .gate/${taskId}/verdict.json; run gate task ${taskId}` };
  if (v.taskId !== taskId) return { ok: false, reason: `verdict is for task ${v.taskId}, not ${taskId}` };
  if (v.mode !== 'task') return { ok: false, reason: `verdict mode is ${v.mode}, not task` };
  if (v.overall !== 'pass') return { ok: false, reason: `verdict overall is ${v.overall}` };
  if (overallOf(v.checks) !== 'pass') return { ok: false, reason: 'verdict says pass but its check results do not' };
  const head = contentTreeHash('HEAD', root);
  if (v.treeHash !== head)
    return {
      ok: false,
      reason: `verdict tree ${v.treeHash.slice(0, 12)} does not match HEAD tree ${head.slice(0, 12)} (commit, amend or rebase since the run; re-run gate task ${taskId})`,
    };
  return { ok: true, reason: `passing verdict matches HEAD tree ${head.slice(0, 12)}` };
}

function verdictCommitted(taskId: string, root: string): boolean {
  const file = `.gate/${taskId}/verdict.json`;
  return gitOrNull(root, ['ls-files', '--error-unmatch', file]) !== null && gitRaw(root, ['status', '--porcelain', '--', file]) === '';
}

/** Resolve `<id>` or `--branch <branch>` to a task id; null means "not a task branch" (notice printed). */
function idArg(args: string[], io: Io, what: string): string | null {
  if (args[0] === '--branch') {
    if (args.length !== 2) throw new UsageError(`gate ${what} --branch needs one branch name`);
    let id: string | null;
    try {
      id = taskIdFromBranch(args[1]);
    } catch (e) {
      throw new UsageError((e as Error).message);
    }
    if (id === null) notice(io, `${args[1]} is not a task branch (task/<id>-<slug>); ${what} not enforced`);
    return id;
  }
  if (args.length !== 1) throw new UsageError(`gate ${what} needs one task id`);
  if (!isTaskId(args[0])) throw new UsageError(`invalid task id ${JSON.stringify(args[0])}`);
  return args[0];
}

async function prePush(io: Io, root: string): Promise<number> {
  const branch = gitOrNull(root, ['symbolic-ref', '--short', '-q', 'HEAD']) ?? '(detached HEAD)';
  let id: string | null;
  try {
    id = taskIdFromBranch(branch);
  } catch (e) {
    io.stderr(`gate: ${(e as Error).message}\n`);
    return 2;
  }
  if (id === null) {
    notice(io, `${branch} is not a task branch (task/<id>-<slug>); pre-push gate not enforced`);
    return 0;
  }
  const v = verifyTask(id, root);
  if (v.ok) {
    if (verdictCommitted(id, root)) {
      io.stdout(`gate: ${id}: ${v.reason}\n`);
      return 0;
    }
    io.stderr(`gate: ${id}: verdict passes but .gate/${id}/ is not committed; commit .gate/${id}/ and push again\n`);
    return 1;
  }
  io.stdout(`gate: verify ${id} failed (${v.reason}); running gate task ${id}\n`);
  const code = await runGate('task', id, io, root);
  if (code === 0) {
    io.stderr(`gate: task ${id} passed; commit .gate/${id}/ and push again (the pushed commit has no current verdict)\n`);
    return 1;
  }
  return code;
}

export async function main(argv: string[], io: Io = defaultIo()): Promise<number> {
  const [cmd, ...args] = argv;
  try {
    const root = repoRoot(io.cwd);
    switch (cmd) {
      case 'task':
        if (args.length !== 1) throw new UsageError('gate task needs one task id');
        if (!isTaskId(args[0])) throw new UsageError(`invalid task id ${JSON.stringify(args[0])}`);
        return await runGate('task', args[0], io, root);
      case 'design': {
        if (args.length !== 1) throw new UsageError('gate design needs one page name');
        const id = `design-${args[0]}`;
        if (!isTaskId(id)) throw new UsageError(`invalid page name ${JSON.stringify(args[0])}`);
        return await runGate('design', id, io, root);
      }
      case 'verify': {
        const id = idArg(args, io, 'verify');
        if (id === null) return 0;
        const v = verifyTask(id, root);
        (v.ok ? io.stdout : io.stderr)(`gate: verify ${id}: ${v.ok ? 'ok' : 'FAIL'}: ${v.reason}\n`);
        return v.ok ? 0 : 1;
      }
      case 'integrity': {
        const id = idArg(args, io, 'integrity');
        if (id === null) return 0;
        const r = checkTestIntegrity(assertTaskId(id), root);
        if (r.ok) {
          io.stdout(`gate: integrity ${id}: ok (tests/acceptance/${id}/ unchanged since the test-author commit)\n`);
          return 0;
        }
        io.stderr(
          `gate: integrity ${id}: FAIL: ${r.reason ?? `tests/acceptance/${id}/ changed after the test-author commit:`}\n` +
            r.changed.map((f) => `  ${f}\n`).join(''),
        );
        return 1;
      }
      case 'pre-push':
        return await prePush(io, root);
      default:
        throw new UsageError(cmd ? `unknown command ${JSON.stringify(cmd)}` : 'no command given');
    }
  } catch (e) {
    if (e instanceof UsageError) {
      io.stderr(`gate: ${e.message}\n${USAGE}`);
      return 2;
    }
    io.stderr(`gate: error: ${(e as Error).message}\n`);
    return 2;
  }
}

function defaultIo(): Io {
  return { cwd: process.cwd(), stdout: (s) => void process.stdout.write(s), stderr: (s) => void process.stderr.write(s) };
}

const invokedDirectly = (() => {
  try {
    return !!process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
})();
if (invokedDirectly) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
