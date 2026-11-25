import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSession, lineText, tokenize, type TermData } from '../../../src/lib/terminal';
import { renderRuns, SCENE_H, SCENE_W } from '../../../src/lib/pixels';
import { assertNoPrivateData } from '../../privacy/patterns';

const root = process.cwd();
const raw = readFileSync(join(root, 'src/content/terminal.json'), 'utf8');
const data: TermData = JSON.parse(raw);
const resume = JSON.parse(readFileSync(join(root, 'src/content/resume.json'), 'utf8'));

const text = (out: ReturnType<ReturnType<typeof createSession>['run']>) =>
  out.kind === 'lines' ? out.lines.map(lineText).join('\n') : out.kind;

describe('terminal.json (fictional content)', () => {
  it('is marked as placeholder content', () => {
    expect((data as unknown as { meta: { placeholder: boolean } }).meta.placeholder).toBe(true);
  });

  it('uses the fictional persona from resume.json', () => {
    expect(data.persona.name).toBe(resume.basics.name);
    expect(data.persona.role).toBe(resume.basics.label);
  });

  it('holds no private data, by pattern and by the local forbidden terms', () => {
    expect(() => assertNoPrivateData(raw)).not.toThrow();
  });

  it('has exactly three pixel scenes, each a valid 24x18 map', () => {
    expect(data.journey.scenes).toHaveLength(3);
    for (const s of data.journey.scenes) {
      expect(s.map).toHaveLength(SCENE_H);
      for (const row of s.map) expect(row).toHaveLength(SCENE_W);
      expect(() => renderRuns(s)).not.toThrow();
      expect(s.alt.length).toBeGreaterThan(10);
    }
  });

  it('has the four demos the home page shows', () => {
    expect(Object.keys(data.demos).sort()).toEqual(['journey', 'notes', 'try', 'whoami']);
    expect(data.demos.whoami.steps.map((s) => s.cmd)).toEqual(['whoami', 'cat now.txt']);
    expect(data.demos.notes.steps.map((s) => s.cmd)).toEqual(['notes add "water the plants"', 'notes ls']);
    expect(data.demos.journey.steps.map((s) => s.cmd)).toEqual(['~/.my-journey.sh']);
  });
});

describe('pixel scenes', () => {
  it('merges runs of one colour and rejects a malformed map', () => {
    const map = Array.from({ length: SCENE_H }, () => 's'.repeat(SCENE_W));
    expect(renderRuns({ id: 'x', map })).toEqual(map.map((_, y) => ({ x: 0, y, w: SCENE_W, cls: 'sky' })));
    expect(() => renderRuns({ id: 'short', map: map.slice(1) })).toThrow(/rows/);
    expect(() => renderRuns({ id: 'bad', map: ['?'.repeat(SCENE_W), ...map.slice(1)] })).toThrow(/unknown colour/);
  });
});

describe('tokenize', () => {
  it('splits on spaces and keeps quoted words together', () => {
    expect(tokenize('notes add "water the plants"')).toEqual(['notes', 'add', 'water the plants']);
    expect(tokenize("  notes   add 'a b'  ")).toEqual(['notes', 'add', 'a b']);
    expect(tokenize('')).toEqual([]);
  });
});

describe('the canned session', () => {
  it('answers whoami with the persona', () => {
    expect(text(createSession(data).run('whoami'))).toContain(data.persona.name);
  });

  it('lists the commands for help', () => {
    const out = text(createSession(data).run('help'));
    for (const c of ['help', 'ls', 'whoami', 'cat', 'notes', './my-journey.sh', 'clear', 'history']) expect(out).toContain(c);
  });

  it('prints command not found for anything unknown, and nothing for a blank line', () => {
    expect(text(createSession(data).run('frobnicate --now'))).toBe('command not found: frobnicate');
    expect(createSession(data).run('   ')).toEqual({ kind: 'lines', lines: [] });
  });

  it('cats the canned files and reports a missing one', () => {
    const s = createSession(data);
    expect(text(s.run('cat now.txt'))).toBe(data.files['now.txt'].map(lineText).join('\n'));
    expect(text(s.run('cat ~/now.txt'))).toContain('Sample Role A');
    expect(text(s.run('cat nope.txt'))).toBe('cat: nope.txt: No such file or directory');
    expect(text(s.run('cat'))).toBe('usage: cat <file>');
  });

  it('lists the home directory, dotfiles with -a', () => {
    const s = createSession(data);
    expect(text(s.run('ls'))).toContain('now.txt');
    expect(text(s.run('ls -a'))).toContain('.my-journey.sh');
  });

  it('runs the notes demo: add prints the new id, ls a three-row table', () => {
    const s = createSession(data);
    expect(text(s.run('notes add "water the plants"'))).toBe('added #3  water the plants');
    const table = text(s.run('notes ls')).split('\n');
    expect(table[0]).toMatch(/ID\s+STATUS\s+NOTE/);
    expect(table.slice(1)).toHaveLength(3);
    expect(table[3]).toMatch(/3\s+todo\s+water the plants/);
    expect(text(s.run('notes done 3'))).toBe('#3 done');
    expect(text(s.run('notes ls'))).toMatch(/3\s+done\s+water the plants/);
    expect(text(s.run('notes'))).toContain('usage: notes');
    expect(text(s.run('notes add'))).toBe('usage: notes add "<text>"');
    expect(text(s.run('notes done 9'))).toBe('notes: no note #9');
  });

  it('runs the journey script by any of its names', () => {
    for (const c of ['./my-journey.sh', '~/.my-journey.sh', './.my-journey.sh', 'sh .my-journey.sh']) {
      expect(createSession(data).run(c)).toEqual({ kind: 'journey' });
    }
  });

  it('clears, exits, and keeps a history the history command lists', () => {
    const s = createSession(data);
    expect(s.run('clear')).toEqual({ kind: 'clear' });
    expect(s.run('exit')).toEqual({ kind: 'exit' });
    s.run('whoami');
    expect(s.history).toEqual(['clear', 'exit', 'whoami']);
    expect(text(s.run('history'))).toMatch(/1\s+clear\n\s+2\s+exit\n\s+3\s+whoami\n\s+4\s+history/);
  });

  it('can replay commands without recording them', () => {
    const s = createSession(data);
    s.run('notes add "water the plants"', { record: false });
    expect(s.history).toEqual([]);
    expect(text(s.run('notes add "x"'))).toBe('added #4  x');
  });
});
