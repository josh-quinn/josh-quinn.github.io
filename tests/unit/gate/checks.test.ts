import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseAiOutput, runChecks, type CheckSpec } from '../../../tools/gate/checks';
import { isolateEnv, makeRepo } from './helpers';

let restore: () => void;
let repo: string;
beforeEach(() => {
  restore = isolateEnv();
  repo = makeRepo();
});
afterEach(() => restore());

const det = (name: string, run: string, extra: Partial<CheckSpec> = {}): CheckSpec => ({ name, kind: 'deterministic', run, ...extra });
const ai = (name: string, run: string, extra: Partial<CheckSpec> = {}): CheckSpec => ({ name, kind: 'ai', run, ...extra });
const one = async (spec: CheckSpec, changed: string[] = [], timeoutMs?: number) =>
  (await runChecks([spec], changed, { cwd: repo, taskId: 'T1', timeoutMs }))[0];

describe('runChecks: deterministic', () => {
  it("'exit 0' gives pass and 'exit 3' gives fail", async () => {
    const [a, b] = await runChecks([det('ok', 'exit 0'), det('bad', 'exit 3')], [], { cwd: repo, taskId: 'T1' });
    expect(a).toMatchObject({ name: 'ok', kind: 'deterministic', status: 'pass' });
    expect(b).toMatchObject({ name: 'bad', status: 'fail' });
    expect(a.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('a missing binary gives error, never pass or fail', async () => {
    expect((await one(det('nobin', 'definitely-not-a-binary'))).status).toBe('error');
  });

  it('captures stdout and stderr into .gate/<task>/evidence/<check>.log', async () => {
    const res = await one(det('noisy', 'echo to-stdout; echo to-stderr >&2'));
    expect(res.evidence).toBe('.gate/T1/evidence/noisy.log');
    const log = readFileSync(join(repo, res.evidence), 'utf8');
    expect(log).toContain('to-stdout');
    expect(log).toContain('to-stderr');
  });

  it('exports GATE_TASK to every check', async () => {
    expect((await one(det('env', 'test "$GATE_TASK" = T1'))).status).toBe('pass');
  });

  it('runs in the given cwd', async () => {
    expect((await one(det('cwd', 'test -f src/a'))).status).toBe('pass');
  });

  it('times out with error and kills the whole process group', async () => {
    const started = Date.now();
    const res = await one(det('slow', 'sleep 30 & echo $! > child.pid; wait', { timeoutMs: 300 }));
    expect(res.status).toBe('error');
    expect(res.detail).toMatch(/timed out/i);
    expect(Date.now() - started).toBeLessThan(10_000);
    const pid = Number(readFileSync(join(repo, 'child.pid'), 'utf8'));
    await new Promise((r) => setTimeout(r, 200));
    expect(() => process.kill(pid, 0)).toThrow();
  });

  it('uses the run-level default timeout when the spec has none', async () => {
    expect((await one(det('slow', 'sleep 5'), [], 200)).status).toBe('error');
  });

  it("is skipped when 'when' globs match none of the changed files", async () => {
    const res = await one(det('css', 'exit 1', { when: ['src/**/*.css'] }), ['README.md']);
    expect(res.status).toBe('skipped');
  });

  it("runs when a 'when' glob matches a changed file", async () => {
    const res = await one(det('css', 'exit 1', { when: ['src/**/*.css'] }), ['README.md', 'src/styles/site.css']);
    expect(res.status).toBe('fail');
  });
});

describe('runChecks: ai', () => {
  it('a valid passing JSON object gives pass with the score', async () => {
    const res = await one(ai('auditor', `echo '{"score":80,"passes":true,"issues":[]}'`));
    expect(res).toMatchObject({ status: 'pass', score: 80, kind: 'ai' });
  });

  it('passes:false gives fail with the score', async () => {
    const res = await one(ai('auditor', `echo '{"score":20,"passes":false,"issues":["contrast too low"]}'`));
    expect(res).toMatchObject({ status: 'fail', score: 20 });
  });

  it('records tokens, backend and model', async () => {
    const res = await (
      await runChecks(
        [ai('auditor', `echo '{"score":1,"passes":true,"issues":[],"tokens":{"input":10,"output":2}}'`, { backend: 'copilot', model: 'm1' })],
        [],
        { cwd: repo, taskId: 'T1' },
      )
    )[0];
    expect(res).toMatchObject({ status: 'pass', tokens: { input: 10, output: 2 }, backend: 'copilot', model: 'm1' });
  });

  it('exports the backend and model to the check', async () => {
    const res = await one(ai('a', `test "$GATE_AI_BACKEND/$GATE_AI_MODEL" = agy/m2 && echo '{"score":1,"passes":true,"issues":[]}'`, { backend: 'agy', model: 'm2' }));
    expect(res.status).toBe('pass');
  });

  it("output 'not json' gives error", async () => {
    expect((await one(ai('a', 'echo not json'))).status).toBe('error');
  });

  it('a missing backend binary gives error', async () => {
    expect((await one(ai('a', 'definitely-not-a-binary'))).status).toBe('error');
  });

  it('a backend that is not logged in (message, non-zero exit) gives error', async () => {
    expect((await one(ai('a', 'echo "Not logged in. Please run /login" >&2; exit 1'))).status).toBe('error');
  });

  it('a non-zero exit gives error even if stdout is valid JSON', async () => {
    expect((await one(ai('a', `echo '{"score":80,"passes":true,"issues":[]}'; exit 1`))).status).toBe('error');
  });

  it('a timeout gives error', async () => {
    expect((await one(ai('a', 'sleep 5', { timeoutMs: 200 }))).status).toBe('error');
  });

  it('empty output gives error', async () => {
    expect((await one(ai('a', 'true'))).status).toBe('error');
  });
});

describe('parseAiOutput', () => {
  it('accepts exactly one object with surrounding whitespace', () => {
    expect(parseAiOutput('\n  {"score":80,"passes":true,"issues":["x"]}\n\n')).toEqual({ score: 80, passes: true, issues: ['x'] });
  });
  it.each([
    ['not json', 'not json'],
    ['two objects', '{"score":1,"passes":true,"issues":[]}\n{"score":1,"passes":true,"issues":[]}'],
    ['prose around the object', 'Here you go: {"score":1,"passes":true,"issues":[]}'],
    ['an array', '[{"score":1,"passes":true,"issues":[]}]'],
    ['missing passes', '{"score":1,"issues":[]}'],
    ['string score', '{"score":"80","passes":true,"issues":[]}'],
    ['non-finite score', '{"score":1e999,"passes":true,"issues":[]}'],
    ['string passes', '{"score":1,"passes":"true","issues":[]}'],
    ['issues not an array of strings', '{"score":1,"passes":true,"issues":[1]}'],
    ['bad tokens', '{"score":1,"passes":true,"issues":[],"tokens":{"input":"x","output":1}}'],
    ['unknown key', '{"score":1,"passes":true,"issues":[],"verdict":"ok"}'],
    ['null', 'null'],
    ['empty', ''],
  ])('rejects %s', (_label, text) => {
    expect(parseAiOutput(text)).toBeNull();
  });
});

describe('runChecks: evidence path safety', () => {
  it('sanitises check names used as file names', async () => {
    const res = await one(det('../../escape', 'exit 0'));
    expect(res.evidence.startsWith('.gate/T1/evidence/')).toBe(true);
    expect(existsSync(join(repo, res.evidence))).toBe(true);
    expect(existsSync(join(repo, '..', 'escape.log'))).toBe(false);
  });
});
