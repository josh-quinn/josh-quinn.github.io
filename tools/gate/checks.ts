import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, matchesGlob } from 'node:path';
import { parse } from 'yaml';
import type { CheckResult } from './verdict';

export type CheckSpec = {
  name: string;
  kind: 'deterministic' | 'ai';
  /** Shell command, run with `sh -c` from the repo root. */
  run: string;
  /** Globs; when given and none matches a changed file, the check is skipped. */
  when?: string[];
  backend?: string;
  model?: string;
  /** Per-check timeout; overrides the run-level default. */
  timeoutMs?: number;
};

export type AiOutput = { score: number; passes: boolean; issues: string[]; tokens?: { input: number; output: number } };

export type RunOptions = {
  /** Repo root the checks run in; evidence goes under `<cwd>/.gate/<taskId>/evidence/`. */
  cwd?: string;
  /** Exported as GATE_TASK. Defaults to $GATE_TASK, else `adhoc`. */
  taskId?: string;
  /** Default timeout for checks without their own `timeoutMs`. */
  timeoutMs?: number;
  /** Default backend/model for AI checks without their own. */
  ai?: { backend?: string; model?: string };
  /** Extra environment for every check. */
  env?: Record<string, string>;
};

export const DEFAULT_TIMEOUT_MS = 600_000;
/** Exit codes the shell uses for "command not found" and "found but not executable". */
const MISSING_BINARY = new Set([126, 127]);
/** Grace between SIGTERM and SIGKILL when a check times out. */
const KILL_GRACE_MS = 2_000;

const AI_KEYS = new Set(['score', 'passes', 'issues', 'tokens']);

function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

/**
 * Parse an AI check's stdout. Accepts exactly one JSON object
 * `{score, passes, issues, tokens?}` with optional surrounding whitespace; anything else is null.
 */
export function parseAiOutput(text: string): AiOutput | null {
  let x: unknown;
  try {
    x = JSON.parse(text.trim());
  } catch {
    return null;
  }
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  if (!Object.keys(o).every((k) => AI_KEYS.has(k))) return null;
  if (!isFiniteNumber(o.score) || typeof o.passes !== 'boolean') return null;
  if (!Array.isArray(o.issues) || !o.issues.every((i) => typeof i === 'string')) return null;
  const out: AiOutput = { score: o.score, passes: o.passes, issues: o.issues as string[] };
  if (o.tokens !== undefined) {
    const t = o.tokens as Record<string, unknown> | null;
    if (!t || typeof t !== 'object' || !isFiniteNumber(t.input) || !isFiniteNumber(t.output)) return null;
    out.tokens = { input: t.input, output: t.output };
  }
  return out;
}

function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '_') || '_';
}

type Exec = { code: number | null; signal: NodeJS.Signals | null; timedOut: boolean; spawnError?: string; stdout: string; log: string };

function killGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    // Group already gone.
  }
}

/** Run `sh -c <command>` in its own process group, capturing output; kill the group on timeout. */
function runShell(command: string, cwd: string, env: NodeJS.ProcessEnv, timeoutMs: number): Promise<Exec> {
  return new Promise((resolve) => {
    const chunks: string[] = [];
    const stdout: string[] = [];
    let timedOut = false;
    let code: number | null = null;
    let signal: NodeJS.Signals | null = null;
    const child = spawn('sh', ['-c', command], { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const pid = child.pid;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d: string) => {
      stdout.push(d);
      chunks.push(d);
    });
    child.stderr.on('data', (d: string) => chunks.push(d));
    let killTimer: NodeJS.Timeout | undefined;
    const timer = setTimeout(() => {
      timedOut = true;
      if (pid) {
        killGroup(pid, 'SIGTERM');
        killTimer = setTimeout(() => killGroup(pid, 'SIGKILL'), KILL_GRACE_MS);
      }
    }, timeoutMs);
    child.on('exit', (c, s) => {
      code = c;
      signal = s;
      // Reap anything the check left running in its group, so its pipes close.
      if (pid) killGroup(pid, 'SIGKILL');
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: null, signal: null, timedOut, spawnError: e.message, stdout: '', log: '' });
    });
    child.on('close', () => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolve({ code, signal, timedOut, stdout: stdout.join(''), log: chunks.join('') });
    });
  });
}

function redactHome(s: string): string {
  return s.split(homedir()).join('~');
}

/** `prefix: <last non-empty output line>` (home dir redacted, at most 200 chars), or just `prefix`. */
function withLastLine(prefix: string, log: string): string {
  const last = log.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).pop();
  return last ? `${prefix}: ${redactHome(last).slice(0, 200)}` : prefix;
}

function matchesAny(globs: string[], changed: string[]): boolean {
  return changed.some((f) => globs.some((g) => matchesGlob(f, g)));
}

/**
 * Run each check's `run` via the shell, in order. Exit 0 is `pass`, non-zero is `fail`.
 * A missing binary (exit 126/127), a timeout, a signal or a spawn failure is `error`.
 * For `kind: 'ai'` the check must exit 0 and print exactly one `{score, passes, issues, tokens?}`
 * object: `passes` gives `pass`/`fail`; a non-zero exit or any other output is `error`.
 * With `when` globs, a check none of whose globs match `changed` is `skipped`.
 */
export async function runChecks(specs: CheckSpec[], changed: string[], opts: RunOptions = {}): Promise<CheckResult[]> {
  const cwd = opts.cwd ?? process.cwd();
  const taskId = opts.taskId ?? process.env.GATE_TASK ?? 'adhoc';
  const evidenceRel = `.gate/${safeName(taskId)}/evidence`;
  const results: CheckResult[] = [];
  for (const spec of specs) {
    const base = { name: spec.name, kind: spec.kind } as const;
    const ai =
      spec.kind === 'ai'
        ? { backend: spec.backend ?? opts.ai?.backend ?? '', model: spec.model ?? opts.ai?.model ?? '' }
        : undefined;
    if (spec.when && spec.when.length > 0 && !matchesAny(spec.when, changed)) {
      results.push({ ...base, ...ai, status: 'skipped', evidence: '', durationMs: 0, detail: `no changed file matches ${spec.when.join(', ')}` });
      continue;
    }
    const timeoutMs = spec.timeoutMs ?? opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const env: NodeJS.ProcessEnv = { ...process.env, ...opts.env, GATE_TASK: taskId };
    if (ai) {
      env.GATE_AI_BACKEND = ai.backend;
      env.GATE_AI_MODEL = ai.model;
    }
    const started = Date.now();
    const r = await runShell(spec.run, cwd, env, timeoutMs);
    const durationMs = Date.now() - started;

    let status: CheckResult['status'];
    let detail: string | undefined;
    let parsed: AiOutput | null = null;
    if (r.spawnError) [status, detail] = ['error', `could not start the shell: ${r.spawnError}`];
    else if (r.timedOut) [status, detail] = ['error', `timed out after ${timeoutMs} ms (process group killed)`];
    else if (r.code === null) [status, detail] = ['error', `killed by signal ${r.signal}`];
    else if (MISSING_BINARY.has(r.code)) [status, detail] = ['error', `command not found or not executable (exit ${r.code})`];
    else if (spec.kind === 'ai') {
      if (r.code !== 0) [status, detail] = ['error', withLastLine(`AI backend exited ${r.code} (not installed, not logged in, or failed)`, r.log)];
      else if (!(parsed = parseAiOutput(r.stdout)))
        [status, detail] = ['error', 'AI output is not exactly one JSON object {score, passes, issues, tokens?}'];
      else [status, detail] = parsed.passes ? ['pass', undefined] : ['fail', parsed.issues.join('; ') || 'passes=false'];
    } else if (r.code === 0) status = 'pass';
    else [status, detail] = ['fail', withLastLine(`exit ${r.code}`, r.log)];

    const evidence = `${evidenceRel}/${safeName(spec.name)}.log`;
    mkdirSync(join(cwd, evidenceRel), { recursive: true });
    const header = `$ ${spec.run}\n# status: ${status}${detail ? ` (${detail})` : ''}; exit: ${r.code ?? r.signal ?? 'none'}; ${durationMs} ms\n\n`;
    // Keep home paths out of the log, in case it is ever shared.
    writeFileSync(join(cwd, evidence), redactHome(header + r.log));

    const result: CheckResult = { ...base, ...ai, status, evidence, durationMs };
    if (parsed) {
      result.score = parsed.score;
      if (parsed.tokens) result.tokens = parsed.tokens;
    }
    if (detail) result.detail = detail;
    results.push(result);
  }
  return results;
}

export type GateFile = { task: CheckSpec[]; design: CheckSpec[] };

const SPEC_KEYS = new Set(['name', 'kind', 'run', 'when', 'backend', 'model', 'timeoutMs']);

function parseSpec(x: unknown, where: string): CheckSpec {
  if (!x || typeof x !== 'object' || Array.isArray(x)) throw new Error(`${where}: a check must be a mapping`);
  const o = x as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!SPEC_KEYS.has(k)) throw new Error(`${where}: unknown key ${JSON.stringify(k)}`);
  if (typeof o.name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(o.name)) throw new Error(`${where}: name must match [A-Za-z0-9][A-Za-z0-9._-]*`);
  if (o.kind !== 'deterministic' && o.kind !== 'ai') throw new Error(`${where} (${o.name}): kind must be 'deterministic' or 'ai'`);
  if (typeof o.run !== 'string' || !o.run.trim()) throw new Error(`${where} (${o.name}): run must be a non-empty string`);
  if (o.when !== undefined && (!Array.isArray(o.when) || !o.when.every((g) => typeof g === 'string')))
    throw new Error(`${where} (${o.name}): when must be a list of globs`);
  for (const k of ['backend', 'model'] as const)
    if (o[k] !== undefined && typeof o[k] !== 'string') throw new Error(`${where} (${o.name}): ${k} must be a string`);
  if (o.timeoutMs !== undefined && (!isFiniteNumber(o.timeoutMs) || o.timeoutMs <= 0))
    throw new Error(`${where} (${o.name}): timeoutMs must be a positive number`);
  return o as CheckSpec;
}

/** Parse and validate `gate.yaml`: `{version: 1, modes: {task: {checks: [...]}, design: {checks: [...]}}}`. */
export function parseGateFile(text: string): GateFile {
  const doc = parse(text) as Record<string, unknown> | null;
  if (!doc || typeof doc !== 'object' || doc.version !== 1) throw new Error('gate.yaml: expected version: 1');
  const modes = (doc.modes ?? {}) as Record<string, unknown>;
  const out: GateFile = { task: [], design: [] };
  for (const mode of ['task', 'design'] as const) {
    const checks = (modes[mode] as { checks?: unknown } | undefined)?.checks ?? [];
    if (!Array.isArray(checks)) throw new Error(`gate.yaml: modes.${mode}.checks must be a list`);
    out[mode] = checks.map((c, i) => parseSpec(c, `gate.yaml modes.${mode}.checks[${i}]`));
    const names = out[mode].map((c) => c.name);
    const dup = names.find((n, i) => names.indexOf(n) !== i);
    if (dup) throw new Error(`gate.yaml: duplicate check name ${JSON.stringify(dup)} in modes.${mode}`);
  }
  return out;
}
