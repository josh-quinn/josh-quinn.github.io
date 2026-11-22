import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGateFile } from '../../../tools/gate/checks';

describe("the repo's gate.yaml", () => {
  const gate = parseGateFile(readFileSync('gate.yaml', 'utf8'));

  it('defines the deterministic task checks in order', () => {
    expect(gate.task.map((c) => c.name)).toEqual(['build', 'unit', 'integrity', 'acceptance', 'axe', 'privacy', 'links']);
    expect(gate.task.every((c) => c.kind === 'deterministic')).toBe(true);
  });

  it('wires acceptance and integrity to $GATE_TASK', () => {
    const run = (n: string) => gate.task.find((c) => c.name === n)!.run;
    expect(run('acceptance')).toContain('tests/acceptance/$GATE_TASK/');
    expect(run('integrity')).toContain('integrity "$GATE_TASK"');
    expect(run('links')).toMatch(/lychee --offline .*--root-dir/);
    expect(run('privacy')).toContain('gitleaks git --config .gitleaks.toml');
  });
});

describe('parseGateFile', () => {
  it.each([
    ['wrong version', 'version: 2'],
    ['unknown key', 'version: 1\nmodes: {task: {checks: [{name: a, kind: deterministic, run: x, extra: 1}]}}'],
    ['bad name', 'version: 1\nmodes: {task: {checks: [{name: "../a", kind: deterministic, run: x}]}}'],
    ['empty run', 'version: 1\nmodes: {task: {checks: [{name: a, kind: ai, run: ""}]}}'],
    ['bad when', 'version: 1\nmodes: {task: {checks: [{name: a, kind: ai, run: x, when: "src/**"}]}}'],
    ['bad timeout', 'version: 1\nmodes: {task: {checks: [{name: a, kind: ai, run: x, timeoutMs: -1}]}}'],
    ['duplicate names', 'version: 1\nmodes: {task: {checks: [{name: a, kind: ai, run: x}, {name: a, kind: ai, run: y}]}}'],
  ])('rejects %s', (_l, text) => {
    expect(() => parseGateFile(text)).toThrow();
  });
});
