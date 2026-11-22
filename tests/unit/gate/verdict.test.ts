import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { overallOf, readVerdict, writeVerdict, type CheckResult, type Verdict } from '../../../tools/gate/verdict';
import { isolateEnv, makeRepo, write } from './helpers';

const r = (status: CheckResult['status'], name: string = status): CheckResult => ({
  name,
  kind: 'deterministic',
  status,
  evidence: `.gate/T1/evidence/${name}.log`,
  durationMs: 5,
});

const verdict = (over: Partial<Verdict> = {}): Verdict => ({
  version: 1,
  taskId: 'T1',
  mode: 'task',
  treeHash: 'a'.repeat(64),
  createdAt: '2026-11-22T00:00:00.000Z',
  checks: [r('pass', 'build'), { ...r('fail', 'auditor'), kind: 'ai', score: 40, backend: 'claude', model: 'm', detail: 'passes=false' }],
  overall: 'fail',
  ...over,
});

let restore: () => void;
let repo: string;
beforeEach(() => {
  restore = isolateEnv();
  repo = makeRepo();
});
afterEach(() => restore());

describe('overallOf', () => {
  it('gives fail for [pass, error]', () => {
    expect(overallOf([r('pass'), r('error')])).toBe('fail');
  });
  it('gives fail for any fail', () => {
    expect(overallOf([r('pass'), r('fail')])).toBe('fail');
  });
  it('gives pass when every result is pass or skipped', () => {
    expect(overallOf([r('pass'), r('skipped')])).toBe('pass');
  });
  it('gives fail for an empty list (nothing was checked)', () => {
    expect(overallOf([])).toBe('fail');
  });
});

describe('writeVerdict / readVerdict', () => {
  it('writes .gate/<id>/verdict.json and report.md, and reads it back', () => {
    const v = verdict();
    const path = writeVerdict(v, repo);
    expect(path).toBe(join(repo, '.gate', 'T1', 'verdict.json'));
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(v);
    expect(readVerdict('T1', repo)).toEqual(v);
    const report = readFileSync(join(repo, '.gate', 'T1', 'report.md'), 'utf8');
    expect(report).toContain('T1');
    expect(report).toContain('**fail**');
    expect(report).toMatch(/\| build \| deterministic \| pass \|/);
    expect(report).toMatch(/\| auditor \| ai \| fail \| 40 \|/);
    expect(report).toContain('passes=false');
  });

  it('returns null when no verdict exists', () => {
    expect(readVerdict('T9', repo)).toBeNull();
  });

  it('returns null for malformed JSON or a wrong shape', () => {
    write(repo, '.gate/T2/verdict.json', '{not json');
    expect(readVerdict('T2', repo)).toBeNull();
    write(repo, '.gate/T3/verdict.json', JSON.stringify({ ...verdict({ taskId: 'T3' }), version: 2 }));
    expect(readVerdict('T3', repo)).toBeNull();
    write(repo, '.gate/T4/verdict.json', JSON.stringify({ ...verdict({ taskId: 'T4' }), overall: 'maybe' }));
    expect(readVerdict('T4', repo)).toBeNull();
  });

  it('rejects task ids that could escape .gate/', () => {
    expect(() => writeVerdict(verdict({ taskId: '../x' }), repo)).toThrow(/task id/i);
    expect(() => readVerdict('../x', repo)).toThrow(/task id/i);
    expect(existsSync(join(repo, 'x'))).toBe(false);
  });
});
