import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertTaskId } from './ids';

export type CheckResult = {
  name: string;
  kind: 'deterministic' | 'ai';
  status: 'pass' | 'fail' | 'error' | 'skipped';
  score?: number;
  backend?: string;
  model?: string;
  tokens?: { input: number; output: number };
  /** Repo-relative path of the captured stdout/stderr log (local only, gitignored). */
  evidence: string;
  durationMs: number;
  /** Why a check did not pass (error cause, failing exit code), for the report. */
  detail?: string;
};

export type Verdict = {
  version: 1;
  taskId: string;
  mode: 'task' | 'design';
  treeHash: string;
  createdAt: string;
  checks: CheckResult[];
  overall: 'pass' | 'fail';
};

/** Pass only if at least one check ran and every result is `pass` or `skipped`. */
export function overallOf(results: CheckResult[]): 'pass' | 'fail' {
  return results.length > 0 && results.every((r) => r.status === 'pass' || r.status === 'skipped') ? 'pass' : 'fail';
}

export function gateDir(taskId: string, cwd = process.cwd()): string {
  return join(cwd, '.gate', assertTaskId(taskId));
}

function fmtDuration(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function cell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

export function renderReport(v: Verdict): string {
  const rows = v.checks.map(
    (c) =>
      `| ${cell(c.name)} | ${c.kind} | ${c.status} | ${c.score ?? ''} | ${fmtDuration(c.durationMs)} | ${c.evidence ? `\`${c.evidence}\`` : ''} |`,
  );
  const notes = v.checks.filter((c) => c.detail).map((c) => `- **${cell(c.name)}** (${c.status}): ${cell(c.detail!)}`);
  return [
    `# Gate verdict: ${v.taskId} (${v.mode})`,
    '',
    `- Overall: **${v.overall}**`,
    `- Tree: \`${v.treeHash}\``,
    `- Created: ${v.createdAt}`,
    '',
    '| Check | Kind | Status | Score | Duration | Evidence |',
    '|---|---|---|---|---|---|',
    ...rows,
    ...(notes.length ? ['', '## Notes', '', ...notes] : []),
    '',
    'Evidence logs stay local (gitignored). Re-run the gate to regenerate them.',
    '',
  ].join('\n');
}

/** Write `.gate/<taskId>/verdict.json` and `report.md`; returns the verdict path. */
export function writeVerdict(v: Verdict, cwd = process.cwd()): string {
  const dir = gateDir(v.taskId, cwd);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'verdict.json');
  writeFileSync(path, JSON.stringify(v, null, 2) + '\n');
  writeFileSync(join(dir, 'report.md'), renderReport(v));
  return path;
}

const STATUSES = new Set(['pass', 'fail', 'error', 'skipped']);

function isCheckResult(c: unknown): c is CheckResult {
  if (!c || typeof c !== 'object') return false;
  const r = c as Record<string, unknown>;
  return (
    typeof r.name === 'string' &&
    (r.kind === 'deterministic' || r.kind === 'ai') &&
    typeof r.status === 'string' &&
    STATUSES.has(r.status) &&
    typeof r.evidence === 'string' &&
    typeof r.durationMs === 'number'
  );
}

function isVerdict(x: unknown): x is Verdict {
  if (!x || typeof x !== 'object') return false;
  const v = x as Record<string, unknown>;
  return (
    v.version === 1 &&
    typeof v.taskId === 'string' &&
    (v.mode === 'task' || v.mode === 'design') &&
    typeof v.treeHash === 'string' &&
    /^[0-9a-f]{64}$/.test(v.treeHash) &&
    typeof v.createdAt === 'string' &&
    Array.isArray(v.checks) &&
    v.checks.every(isCheckResult) &&
    (v.overall === 'pass' || v.overall === 'fail')
  );
}

/** The verdict at `.gate/<taskId>/verdict.json`, or null when missing or malformed. */
export function readVerdict(taskId: string, cwd = process.cwd()): Verdict | null {
  const path = join(gateDir(taskId, cwd), 'verdict.json');
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return isVerdict(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** The verdict committed in `rev` (`<rev>:.gate/<taskId>/verdict.json`), or null when missing or malformed. */
export function readVerdictAt(taskId: string, rev: string, cwd = process.cwd()): Verdict | null {
  assertTaskId(taskId);
  let text: string;
  try {
    text = execFileSync('git', ['show', `${rev}:.gate/${taskId}/verdict.json`], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return isVerdict(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
