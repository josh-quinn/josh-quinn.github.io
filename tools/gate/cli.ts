/**
 * gate: run a task's checks, write `.gate/<id>/verdict.json` + `report.md`, and verify that a
 * passing verdict exists for the exact tree at HEAD.
 *
 *   gate task <id>                     run the `task` checks from gate.yaml (exit 0 pass, 1 fail, 2 refused)
 *   gate design <page>                 run the `design` checks (verdict in .gate/design-<page>/)
 *   gate verify <id> | --branch <b>    exit 0 only for a passing verdict whose tree hash matches HEAD
 *   gate integrity <id> | --branch <b> exit 0 if the tests came first and tests/acceptance/<id>/ is unchanged since
 *   gate pre-push                      git hook: for every pushed task/<id>-<slug> ref, verify the pushed commit
 *
 * `--branch` takes a branch name (CI: the PR head ref); `--base <ref>` the base to diff against
 * (default origin/main, else main). A branch that is not task/<id>-<slug> is not gated: it passes
 * with a notice unless it changes anything under tests/acceptance/ or .gate/, which fails.
 */
import { existsSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadToolConfig } from '../lib/config';
import { DEFAULT_TIMEOUT_MS, parseGateFile, runChecks } from './checks';
import { BaseRefError, DEFAULT_BASE_REFS, changedBetween, dirtyOutsideGate, git, gitOrNull, gitRaw, mergeBase, repoRoot } from './git';
import { assertTaskId, isTaskId, taskIdFromBranch } from './ids';
import { checkTestIntegrity } from './integrity';
import { contentTreeHash } from './treehash';
import { overallOf, readVerdict, readVerdictAt, writeVerdict, type CheckResult, type Verdict } from './verdict';

export { taskIdFromBranch } from './ids';

export type Io = { cwd: string; stdin?: () => string; stdout: (s: string) => void; stderr: (s: string) => void };

/** Machine defaults, in `~/.config/jq-tools/gate/config.yaml` (root overridable by $TOOLS_CONFIG). */
export const GATE_DEFAULTS = {
  /** Default per-check timeout; a check's own `timeoutMs` in gate.yaml wins. */
  timeoutMs: DEFAULT_TIMEOUT_MS,
  /** Base for the changed-file list that `when` globs match against. */
  baseRef: 'origin/main',
  /**
   * Backend and model for AI checks that do not name their own in gate.yaml. A per-check entry
   * in the config file, `ai.<check name>: {backend, model}` (calibrated per eval, see
   * docs/decisions/0006-ai-eval-models.md), wins over this flat default. `model: default`
   * leaves the CLI's own default model.
   */
  ai: { backend: 'claude', model: 'sonnet' } as { backend: string; model: string; [check: string]: unknown },
};
export type GateConfig = typeof GATE_DEFAULTS;

const USAGE = `usage:
  gate task <id>
  gate design <page>
  gate verify [--base <ref>] <id> | gate verify [--base <ref>] --branch <branch>
  gate integrity [--base <ref>] <id> | gate integrity [--base <ref>] --branch <branch>
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
  for (const ref of [...new Set([baseRef, ...DEFAULT_BASE_REFS])]) {
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

type VerifyOpts = { rev?: string; baseRef?: string };

/**
 * A passing task verdict for exactly this tree. Without `rev`: the working-tree verdict file
 * against HEAD. With `rev`: the verdict committed in `rev` against `rev`'s tree (pre-push).
 * When a base resolves, the branch must also not change another task's `.gate/` folder.
 */
export function verifyTask(taskId: string, root: string, opts: VerifyOpts = {}): { ok: boolean; reason: string; changed?: string[] } {
  const rev = opts.rev ?? 'HEAD';
  const where = opts.rev ? `${opts.rev.slice(0, 12)}:.gate/${taskId}/verdict.json` : `.gate/${taskId}/verdict.json`;
  const v = opts.rev ? readVerdictAt(taskId, opts.rev, root) : readVerdict(taskId, root);
  if (!v) return { ok: false, reason: `no valid verdict at ${where}; run gate task ${taskId} and commit .gate/${taskId}/` };
  if (v.taskId !== taskId) return { ok: false, reason: `verdict is for task ${v.taskId}, not ${taskId}` };
  if (v.mode !== 'task') return { ok: false, reason: `verdict mode is ${v.mode}, not task` };
  if (v.overall !== 'pass') return { ok: false, reason: `verdict overall is ${v.overall}` };
  if (overallOf(v.checks) !== 'pass') return { ok: false, reason: 'verdict says pass but its check results do not' };
  const tree = contentTreeHash(rev, root);
  if (v.treeHash !== tree)
    return {
      ok: false,
      reason: `verdict tree ${v.treeHash.slice(0, 12)} does not match the tree of ${opts.rev ? opts.rev.slice(0, 12) : 'HEAD'} (${tree.slice(0, 12)}): commit, amend or rebase since the run; re-run gate task ${taskId}`,
    };
  const base = mergeBase(root, rev, opts.baseRef);
  if (base) {
    const foreign = changedBetween(root, base, rev, ['.gate/']).filter((f) => !f.startsWith(`.gate/${taskId}/`));
    if (foreign.length > 0) return { ok: false, reason: `the branch changes .gate/ outside .gate/${taskId}/`, changed: foreign };
  }
  return { ok: true, reason: `passing verdict matches tree ${tree.slice(0, 12)}` };
}

function verdictCommitted(taskId: string, root: string): boolean {
  const file = `.gate/${taskId}/verdict.json`;
  return gitOrNull(root, ['ls-files', '--error-unmatch', file]) !== null && gitRaw(root, ['status', '--porcelain', '--', file]) === '';
}

type Target = { id: string | null; branch?: string; baseRef?: string };

/** Parse `[--base <ref>] (<id> | --branch <branch>)`. A null id means "not a task branch". */
function parseTarget(args: string[], what: string): Target {
  let id: string | undefined;
  let branch: string | undefined;
  let baseRef: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--base' || a === '--branch') {
      const v = args[++i];
      if (v === undefined || v.startsWith('--')) throw new UsageError(`gate ${what} ${a} needs a value`);
      if (a === '--base') baseRef = v;
      else branch = v;
    } else if (a.startsWith('--')) throw new UsageError(`unknown option ${a}`);
    else if (id === undefined) id = a;
    else throw new UsageError(`gate ${what} takes one task id`);
  }
  if ((id === undefined) === (branch === undefined)) throw new UsageError(`gate ${what} needs one task id or --branch <branch>`);
  if (branch !== undefined) {
    try {
      return { id: taskIdFromBranch(branch), branch, baseRef };
    } catch (e) {
      throw new UsageError((e as Error).message);
    }
  }
  if (!isTaskId(id!)) throw new UsageError(`invalid task id ${JSON.stringify(id)}`);
  return { id: id!, baseRef };
}

/**
 * A non-task branch is not gated, but it must not change gate-owned paths: anything under
 * tests/acceptance/ or .gate/ against the base fails. Fail closed when no base resolves.
 */
function nonTaskBranch(t: Target, what: string, io: Io, root: string): number {
  const base = mergeBase(root, 'HEAD', t.baseRef);
  if (!base) {
    io.stderr(`gate: ${what}: ${t.branch} is not a task branch, and no base ref (origin/main or main) resolves to check it against\n`);
    return 1;
  }
  const touched = changedBetween(root, base, 'HEAD', ['tests/acceptance/', '.gate/']);
  if (touched.length > 0) {
    io.stderr(
      `gate: ${what}: FAIL: ${t.branch} is not a task branch (task/<id>-<slug>) but changes gate-owned paths:\n` +
        touched.map((f) => `  ${f}\n`).join(''),
    );
    return 1;
  }
  notice(io, `${t.branch} is not a task branch (task/<id>-<slug>); ${what} not enforced (no changes under tests/acceptance/ or .gate/)`);
  return 0;
}

const ZERO_SHA = /^0+$/;

type PushedRef = { localSha: string; remoteRef: string };

/** Lines git gives a pre-push hook: `<local ref> <local sha> <remote ref> <remote sha>`. */
function parsePushRefs(stdin: string): PushedRef[] {
  return stdin
    .split('\n')
    .map((l) => l.trim().split(/\s+/))
    .filter((f) => f.length === 4 && /^[0-9a-f]{40,64}$/.test(f[1]))
    .map((f) => ({ localSha: f[1], remoteRef: f[2] }));
}

async function enforceTask(id: string, sha: string | null, io: Io, root: string): Promise<number> {
  const head = git(root, ['rev-parse', 'HEAD']);
  const v = verifyTask(id, root, sha ? { rev: sha } : {});
  if (v.ok && (sha || verdictCommitted(id, root))) {
    io.stdout(`gate: ${id}: ${v.reason}\n`);
    return 0;
  }
  if (v.ok) {
    io.stderr(`gate: ${id}: verdict passes but .gate/${id}/ is not committed; commit .gate/${id}/ and push again\n`);
    return 1;
  }
  if (v.changed) {
    io.stderr(`gate: ${id}: ${v.reason}:\n` + v.changed.map((f) => `  ${f}\n`).join(''));
    return 1;
  }
  if (sha && sha !== head) {
    io.stderr(`gate: ${id}: the pushed commit ${sha.slice(0, 12)} has no current passing verdict (${v.reason}); check it out and run gate task ${id}\n`);
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

/**
 * The pre-push hook. Enforces every pushed `refs/heads/task/<id>-<slug>` from git's stdin,
 * verifying the verdict committed in the pushed SHA; deletions pass, tags and other branches
 * pass with a notice. Without refs on stdin (run by hand), it checks the checked-out branch.
 */
async function prePush(io: Io, root: string): Promise<number> {
  const refs = parsePushRefs(io.stdin?.() ?? '');
  const targets: { branch: string; sha: string | null }[] = refs.length
    ? refs.filter((r) => r.remoteRef.startsWith('refs/heads/') && !ZERO_SHA.test(r.localSha)).map((r) => ({ branch: r.remoteRef.slice('refs/heads/'.length), sha: r.localSha }))
    : [{ branch: gitOrNull(root, ['symbolic-ref', '--short', '-q', 'HEAD']) ?? '(detached HEAD)', sha: null }];
  let worst = 0;
  for (const t of targets) {
    let id: string | null;
    try {
      id = taskIdFromBranch(t.branch);
    } catch (e) {
      io.stderr(`gate: ${(e as Error).message}\n`);
      worst = Math.max(worst, 2);
      continue;
    }
    if (id === null) {
      notice(io, `${t.branch} is not a task branch (task/<id>-<slug>); pre-push gate not enforced`);
      continue;
    }
    worst = Math.max(worst, await enforceTask(id, t.sha, io, root));
  }
  return worst;
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
        const t = parseTarget(args, 'verify');
        if (t.id === null) return nonTaskBranch(t, 'verify', io, root);
        const v = verifyTask(t.id, root, { baseRef: t.baseRef });
        (v.ok ? io.stdout : io.stderr)(
          `gate: verify ${t.id}: ${v.ok ? 'ok' : 'FAIL'}: ${v.reason}\n` + (v.changed ?? []).map((f) => `  ${f}\n`).join(''),
        );
        return v.ok ? 0 : 1;
      }
      case 'integrity': {
        const t = parseTarget(args, 'integrity');
        if (t.id === null) return nonTaskBranch(t, 'integrity', io, root);
        const id = assertTaskId(t.id);
        const r = checkTestIntegrity(id, root, t.baseRef);
        if (r.ok) {
          io.stdout(`gate: integrity ${id}: ok (one test-author commit, first on the branch; tests/acceptance/${id}/ unchanged since)\n`);
          return 0;
        }
        io.stderr(`gate: integrity ${id}: FAIL: ${r.reason ?? 'tests changed'}\n` + r.changed.map((f) => `  ${f}\n`).join(''));
        return 1;
      }
      case 'pre-push':
        return await prePush(io, root);
      default:
        throw new UsageError(cmd ? `unknown command ${JSON.stringify(cmd)}` : 'no command given');
    }
  } catch (e) {
    if (e instanceof UsageError || e instanceof BaseRefError) {
      io.stderr(`gate: ${e.message}\n${USAGE}`);
      return 2;
    }
    io.stderr(`gate: error: ${(e as Error).message}\n`);
    return 2;
  }
}

function readStdin(): string {
  // Only when something is piped (git hooks); never block on a terminal.
  if (process.stdin.isTTY) return '';
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function defaultIo(): Io {
  return { cwd: process.cwd(), stdin: readStdin, stdout: (s) => void process.stdout.write(s), stderr: (s) => void process.stderr.write(s) };
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
