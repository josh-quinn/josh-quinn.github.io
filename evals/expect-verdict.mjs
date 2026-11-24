/**
 * promptfoo assertion: the eval classified the case as expected (`vars.expected` is
 * `pass` or `fail`). The case passes when the critic's or auditor's `passes` matches.
 */
export default function expectVerdict(output, context) {
  let r;
  try {
    r = JSON.parse(output);
  } catch {
    return { pass: false, score: 0, reason: 'output is not the {score, passes, issues} JSON object' };
  }
  const want = context.vars.expected === 'pass';
  const ok = r.passes === want;
  const issues = (r.issues ?? []).slice(0, 3).join(' | ');
  return {
    pass: ok,
    score: ok ? 1 : 0,
    reason: `expected ${context.vars.expected}, got ${r.passes ? 'pass' : 'fail'} (score ${r.score})${issues ? `: ${issues}` : ''}`,
  };
}
