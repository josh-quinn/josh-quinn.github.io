import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGateFile } from '../../../tools/gate/checks';

describe("the repo's gate.yaml", () => {
  const gate = parseGateFile(readFileSync('gate.yaml', 'utf8'));

  it('defines the task checks in order: deterministic first, then the AI checks', () => {
    expect(gate.task.map((c) => c.name)).toEqual([
      'build', 'unit', 'integrity', 'acceptance', 'axe', 'privacy', 'links', 'stylelint', 'deps', 'visual', 'design-critic', 'auditor',
    ]);
    expect(gate.task.filter((c) => c.kind === 'ai').map((c) => c.name)).toEqual(['design-critic', 'auditor']);
  });

  it('runs the design critic in task mode only when styles, pages or DESIGN.md change', () => {
    expect(gate.task.find((c) => c.name === 'design-critic')!.when).toEqual(['src/**/*.{astro,css}', 'DESIGN.md']);
  });

  it('design mode captures the references, then runs the critic', () => {
    expect(gate.design.map((c) => [c.name, c.kind])).toEqual([
      ['refs', 'deterministic'],
      ['design-critic', 'ai'],
    ]);
  });

  it('AI checks leave backend and model to the gate config (ai.<check name>)', () => {
    for (const c of [...gate.task, ...gate.design].filter((x) => x.kind === 'ai')) {
      expect(c.backend).toBeUndefined();
      expect(c.model).toBeUndefined();
    }
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
