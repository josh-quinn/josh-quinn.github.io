import { describe, expect, it } from 'vitest';
import { promptfooEnv, summarise, table } from '../../../evals/run';
import { criticCaseNames } from '../../../tools/gate/ai-eval';

const result = (kase: string, expected: string, passes: boolean, score: number, pair = 'claude:sonnet') => ({
  provider: { label: pair },
  vars: { case: kase, expected },
  latencyMs: 1000,
  success: passes === (expected === 'pass'),
  gradingResult: { pass: passes === (expected === 'pass') },
  response: { output: JSON.stringify({ score, passes, issues: [] }), tokenUsage: { prompt: 100, completion: 10 } },
});

describe('summarise (calibration table)', () => {
  it('groups repeats per case and reports the score spread', () => {
    const rows = summarise('design-critic', [
      result('generic-page', 'fail', false, 2),
      result('generic-page', 'fail', false, 5),
      result('generic-page', 'fail', false, 3),
      result('reference', 'pass', true, 92),
      result('reference', 'pass', false, 78),
      result('reference', 'pass', true, 90),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ correct: 5, total: 6, input: 600, output: 60, ms: 6000 });
    expect(rows[0].cases).toEqual(['generic-page: want fail, got fail×3, scores 2-5', 'reference: want pass, got pass×2 fail×1, scores 78-92 ✗']);
  });

  it('counts a provider error as an error and a miss', () => {
    const rows = summarise('auditor', [{ provider: { label: 'copilot:default' }, vars: { case: 'clean', expected: 'pass' }, error: 'timeout', success: false }]);
    expect(rows[0]).toMatchObject({ correct: 0, total: 1, errors: 1 });
    expect(rows[0].cases).toEqual(['clean: want pass, got error×1 ✗']);
  });

  it('renders a markdown table with accuracy as correct/total', () => {
    expect(table(summarise('auditor', [result('clean', 'pass', true, 88)]))).toMatch(/\| claude:sonnet \| auditor \| 1\/1 \|/);
  });
});

describe('promptfooEnv', () => {
  it('locks promptfoo down and points it at the dead proxy by default', () => {
    const env = promptfooEnv({ PATH: '/bin', https_proxy: 'http://corp:8080' });
    expect(env).toMatchObject({ PROMPTFOO_DISABLE_TELEMETRY: '1', PROMPTFOO_DISABLE_UPDATE: '1', HTTPS_PROXY: 'http://127.0.0.1:9', HTTP_PROXY: 'http://127.0.0.1:9' });
    expect(env.https_proxy).toBeUndefined();
  });
  it('EVALS_PROXY=none turns the proxy off', () => {
    expect(promptfooEnv({ EVALS_PROXY: 'none' }).HTTPS_PROXY).toBeUndefined();
  });
});

describe('critic cases', () => {
  it('include the reference, the generic page, the home control and three near misses (fragments are not cases)', () => {
    const names = criticCaseNames();
    expect(names).toEqual(expect.arrayContaining(['reference', 'generic-page', 'home', 'near-miss-sans-white', 'near-miss-indigo', 'near-miss-hero-cards']));
    expect(names.some((n) => n.includes('fragment'))).toBe(false);
  });
});
