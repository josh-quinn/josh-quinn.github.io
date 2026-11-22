import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadToolConfig, toolStateDir, toolsConfigRoot } from '../../../tools/lib/config';

const KEYS = ['TOOLS_CONFIG', 'JQ_TOOLS_CONFIG', 'XDG_STATE_HOME'] as const;
let saved: Record<string, string | undefined>;
let tmp: string;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  KEYS.forEach((k) => delete process.env[k]);
  tmp = mkdtempSync(join(tmpdir(), 'cfg-'));
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('config', () => {
  it('creates config.yaml from defaults when missing', () => {
    process.env.TOOLS_CONFIG = tmp;
    expect(loadToolConfig('gate', { a: 1 })).toEqual({ a: 1 });
    expect(readFileSync(join(tmp, 'gate', 'config.yaml'), 'utf8')).toContain('a: 1');
  });

  it('merges file values over defaults and never rewrites the file', () => {
    process.env.TOOLS_CONFIG = tmp;
    loadToolConfig('gate', { a: 1, b: 'x' });
    const file = join(tmp, 'gate', 'config.yaml');
    writeFileSync(file, 'a: 2\n# my comment\n');
    const before = readFileSync(file);
    expect(loadToolConfig('gate', { a: 1, b: 'x' })).toEqual({ a: 2, b: 'x' });
    expect(readFileSync(file).equals(before)).toBe(true);
  });

  it('deep-merges nested objects: a partial nested override keeps sibling defaults', () => {
    process.env.TOOLS_CONFIG = tmp;
    const defaults = { timeoutMs: 600000, ai: { backend: 'claude', model: 'sonnet', auditor: { backend: 'claude', model: 'haiku' } } };
    loadToolConfig('gate', defaults);
    writeFileSync(join(tmp, 'gate', 'config.yaml'), 'ai:\n  auditor:\n    model: opus\n');
    expect(loadToolConfig('gate', defaults)).toEqual({
      timeoutMs: 600000,
      ai: { backend: 'claude', model: 'sonnet', auditor: { backend: 'claude', model: 'opus' } },
    });
  });

  it('replaces arrays instead of merging them, and does not mutate the defaults', () => {
    process.env.TOOLS_CONFIG = tmp;
    const defaults = { list: [1, 2, 3], nested: { tags: ['a', 'b'] } };
    loadToolConfig('gate', defaults);
    writeFileSync(join(tmp, 'gate', 'config.yaml'), 'list: [9]\nnested:\n  tags: []\n');
    expect(loadToolConfig('gate', defaults)).toEqual({ list: [9], nested: { tags: [] } });
    expect(defaults).toEqual({ list: [1, 2, 3], nested: { tags: ['a', 'b'] } });
  });

  it('lets a scalar in the file replace a nested default object', () => {
    process.env.TOOLS_CONFIG = tmp;
    loadToolConfig('gate', { ai: { backend: 'claude' } });
    writeFileSync(join(tmp, 'gate', 'config.yaml'), 'ai: off\n');
    expect(loadToolConfig('gate', { ai: { backend: 'claude' } })).toEqual({ ai: 'off' });
  });

  it('uses the legacy JQ_TOOLS_CONFIG when TOOLS_CONFIG is unset', () => {
    process.env.JQ_TOOLS_CONFIG = tmp;
    expect(toolsConfigRoot()).toBe(tmp);
    process.env.TOOLS_CONFIG = join(tmp, 'new');
    expect(toolsConfigRoot()).toBe(join(tmp, 'new'));
  });

  it('defaults the root to ~/.config/jq-tools', () => {
    expect(toolsConfigRoot()).toMatch(/\.config[\\/]jq-tools$/);
  });

  it('toolStateDir honours XDG_STATE_HOME and creates the dir', () => {
    process.env.XDG_STATE_HOME = tmp;
    const dir = toolStateDir('gate');
    expect(dir).toBe(join(tmp, 'jq-tools', 'gate'));
    expect(existsSync(dir)).toBe(true);
  });

  it('toolStateDir defaults to ~/.local/state/jq-tools/<tool> (path only)', () => {
    process.env.XDG_STATE_HOME = '';
    // Point HOME at a temp dir so nothing real is created.
    const home = process.env.HOME;
    process.env.HOME = tmp;
    try {
      expect(toolStateDir('gate')).toBe(join(tmp, '.local', 'state', 'jq-tools', 'gate'));
    } finally {
      process.env.HOME = home;
    }
  });
});
