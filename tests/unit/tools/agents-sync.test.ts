import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { beforeEach, describe, expect, it } from 'vitest';
import { syncAgents } from '../../../tools/agents/sync';

let root: string;
let src: string;
let outDirs: { claude: string; copilot: string };

const SOURCE = `---
name: x
description: Example agent for tests.
tools:
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - Bash
---
You are agent x.

Do the thing.
`;

function frontmatter(text: string): Record<string, unknown> {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) throw new Error('no frontmatter');
  return parse(m[1]) as Record<string, unknown>;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'agents-sync-'));
  src = join(root, 'agents', 'src');
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, 'x.md'), SOURCE);
  outDirs = { claude: join(root, '.claude', 'agents'), copilot: join(root, '.github', 'agents') };
});

describe('syncAgents', () => {
  it('writes .claude/agents/x.md and .github/agents/x.agent.md and returns both paths', () => {
    const written = syncAgents(src, outDirs);
    expect(written.sort()).toEqual(
      [join(outDirs.claude, 'x.md'), join(outDirs.copilot, 'x.agent.md')].sort(),
    );
  });

  it('renders Claude frontmatter with a comma-separated tools string', () => {
    syncAgents(src, outDirs);
    const text = readFileSync(join(outDirs.claude, 'x.md'), 'utf8');
    expect(frontmatter(text)).toEqual({
      name: 'x',
      description: 'Example agent for tests.',
      tools: 'Read, Write, Edit, Grep, Glob, Bash',
    });
    expect(text).toContain('generated from agents/src/x.md');
    expect(text).toContain('do not edit');
    expect(text).toContain('You are agent x.');
  });

  it('renders Copilot frontmatter with mapped, de-duplicated tool aliases', () => {
    syncAgents(src, outDirs);
    const text = readFileSync(join(outDirs.copilot, 'x.agent.md'), 'utf8');
    expect(frontmatter(text)).toEqual({
      name: 'x',
      description: 'Example agent for tests.',
      tools: ['read', 'edit', 'search', 'execute'],
    });
    expect(text).toContain('generated from agents/src/x.md');
    expect(text).toContain('You are agent x.');
  });

  it('is idempotent: a second run leaves both files byte-identical', () => {
    syncAgents(src, outDirs);
    const a = readFileSync(join(outDirs.claude, 'x.md'));
    const b = readFileSync(join(outDirs.copilot, 'x.agent.md'));
    syncAgents(src, outDirs);
    expect(readFileSync(join(outDirs.claude, 'x.md')).equals(a)).toBe(true);
    expect(readFileSync(join(outDirs.copilot, 'x.agent.md')).equals(b)).toBe(true);
  });

  it('rejects a source with an unknown tool name', () => {
    writeFileSync(join(src, 'bad.md'), SOURCE.replace('Bash', 'Teleport').replace('name: x', 'name: bad'));
    expect(() => syncAgents(src, outDirs)).toThrow(/Teleport/);
  });
});
