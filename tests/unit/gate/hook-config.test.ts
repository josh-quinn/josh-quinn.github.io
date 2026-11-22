import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const json = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

describe('agent hook configs call the shared guard on every tool', () => {
  it('Claude Code: .claude/settings.json PreToolUse, all tools', () => {
    const [entry] = json('.claude/settings.json').hooks.PreToolUse;
    expect(entry.matcher).toBe('*');
    expect(entry.hooks[0].command).toMatch(/node .*tools\/gate\/guard\.ts"? --agent claude$/);
    expect(entry.hooks[0].timeout).toBeGreaterThanOrEqual(10);
  });

  it('Copilot CLI: .github/hooks/gate-guard.json preToolUse, timeout well above the guard run time', () => {
    const cfg = json('.github/hooks/gate-guard.json');
    expect(cfg.version).toBe(1);
    const [hook] = cfg.hooks.preToolUse;
    expect(hook.bash).toBe('node tools/gate/guard.ts --agent copilot');
    // A Copilot hook that times out fails open (ADR 0004).
    expect(hook.timeoutSec).toBeGreaterThanOrEqual(10);
  });

  it('agy: .agents/hooks.json PreToolUse, all tools', () => {
    const [entry] = json('.agents/hooks.json')['gate-guard'].PreToolUse;
    expect(entry.matcher).toBe('*');
    // agy runs hooks with .agents/ as the working directory (run, Task 5).
    expect(entry.hooks[0].command).toBe('node ../tools/gate/guard.ts --agent agy');
  });

  it('lefthook pre-push runs gate pre-push with the pushed refs on stdin', () => {
    const text = readFileSync('lefthook.yml', 'utf8');
    expect(text).toMatch(/pre-push:[\s\S]*run: npx tsx tools\/gate\/cli\.ts pre-push/);
    expect(text).toMatch(/use_stdin: true/);
  });
});
