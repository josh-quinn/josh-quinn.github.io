import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

  it('prunes generated files whose source is gone, but keeps hand-written ones', () => {
    syncAgents(src, outDirs);
    writeFileSync(join(src, 'old.md'), SOURCE.replace('name: x', 'name: old'));
    syncAgents(src, outDirs);
    expect(existsSync(join(outDirs.claude, 'old.md'))).toBe(true);
    const mine = join(outDirs.claude, 'mine.md');
    const mineCopilot = join(outDirs.copilot, 'mine.agent.md');
    writeFileSync(mine, '---\nname: mine\n---\nhand written\n');
    writeFileSync(mineCopilot, '---\nname: mine\n---\nhand written\n');
    rmSync(join(src, 'old.md'));
    syncAgents(src, outDirs);
    expect(existsSync(join(outDirs.claude, 'old.md'))).toBe(false);
    expect(existsSync(join(outDirs.copilot, 'old.agent.md'))).toBe(false);
    expect(readFileSync(mine, 'utf8')).toContain('hand written');
    expect(existsSync(mineCopilot)).toBe(true);
    expect(existsSync(join(outDirs.claude, 'x.md'))).toBe(true);
  });

  it('accepts CRLF sources and renders the same output as LF', () => {
    syncAgents(src, outDirs);
    const lf = readFileSync(join(outDirs.claude, 'x.md'), 'utf8');
    writeFileSync(join(src, 'x.md'), SOURCE.replace(/\n/g, '\r\n'));
    syncAgents(src, outDirs);
    expect(readFileSync(join(outDirs.claude, 'x.md'), 'utf8')).toBe(lf);
  });

  describe('errors name the source file', () => {
    const cases: [string, string, RegExp][] = [
      ['missing frontmatter', 'just text\n', /bad\.md: missing frontmatter/],
      ['invalid YAML', '---\nname: [unclosed\n---\nbody\n', /bad\.md: invalid frontmatter/],
      ['non-mapping frontmatter', '---\n- a\n- b\n---\nbody\n', /bad\.md: invalid frontmatter/],
      ['non-string name', '---\nname: 5\ndescription: d\ntools: [Read]\n---\nb\n', /bad\.md: frontmatter needs string name/],
      ['missing description', '---\nname: bad\ntools: [Read]\n---\nb\n', /bad\.md: frontmatter needs string name/],
      ['non-list tools', '---\nname: bad\ndescription: d\ntools: Read\n---\nb\n', /bad\.md: frontmatter tools must be a list/],
      ['non-string tool entry', '---\nname: bad\ndescription: d\ntools: [1]\n---\nb\n', /bad\.md: frontmatter tools must be a list/],
    ];
    for (const [label, text, re] of cases) {
      it(label, () => {
        writeFileSync(join(src, 'bad.md'), text);
        expect(() => syncAgents(src, outDirs)).toThrow(re);
      });
    }
  });
});
