import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type Line, buildLoop, createSession, lineText, tokenize, tuiFrames, type TermData } from '../../../src/lib/terminal';
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

  it('has the five demos the home page shows, the four loops and try-it', () => {
    expect(Object.keys(data.demos).sort()).toEqual(['journey', 'notes', 'try', 'tui', 'whoami']);
    expect(data.demos.tui.steps.map((s) => s.cmd)).toEqual(['notes tui']);
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
    expect(text(s.run('cat now.txt'))).toBe((data.fs['now.txt'] as Line[]).map(lineText).join('\n'));
    expect(text(s.run('cat ~/now.txt'))).toContain('Sample Role A');
    expect(text(s.run('cat nope.txt'))).toBe('cat: nope.txt: No such file or directory');
    expect(text(s.run('cat'))).toBe('usage: cat <file>');
  });

  it('treats inherited object keys as missing files, not as files', () => {
    const s = createSession(data);
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty', '~/valueOf']) {
      expect(text(s.run(`cat ${name}`))).toBe(`cat: ${name}: No such file or directory`);
    }
  });

  it('lists the home directory: dirs with a slash, dotfiles only with -a', () => {
    const s = createSession(data);
    expect(text(s.run('ls'))).toBe('about.txt  notes/  now.txt  projects/');
    expect(text(s.run('ls -a'))).toBe('./  ../  .my-journey.sh  about.txt  notes/  now.txt  projects/');
    expect(text(s.run('ls notes'))).toBe('ideas.md  reading.md');
    expect(text(s.run('ls nope'))).toBe("ls: cannot access 'nope': No such file or directory");
  });

  it('gives a long listing with ll, dotfiles and permissions included', () => {
    const out = text(createSession(data).run('ll')).split('\n');
    expect(out[0]).toMatch(/^total \d+$/);
    expect(out.find((l) => l.endsWith(' notes/'))).toMatch(/^drwxr-xr-x\s+sample\s+\d+ notes\/$/);
    expect(out.find((l) => l.endsWith(' now.txt'))).toMatch(/^-rw-r--r--\s+sample\s+\d+ now\.txt$/);
    expect(out.find((l) => l.endsWith(' .my-journey.sh'))).toMatch(/^-rwxr-xr-x\s+sample\s+\d+ \.my-journey\.sh$/);
  });

  it('changes directory, and the prompt and pwd follow the cwd', () => {
    const s = createSession(data);
    expect(s.prompt()).toBe('~');
    expect(s.run('cd notes')).toEqual({ kind: 'lines', lines: [] });
    expect(s.prompt()).toBe('~/notes');
    expect(text(s.run('pwd'))).toBe(`${data.home}/notes`);
    expect(text(s.run('ls'))).toBe('ideas.md  reading.md');
    expect(text(s.run('cat ideas.md'))).toContain('# ideas');
    expect(text(s.run('cat ~/now.txt'))).toContain('Sample Role A');
    s.run('cd ..');
    expect(s.prompt()).toBe('~');
    s.run('cd projects/notes-cli/');
    expect(s.prompt()).toBe('~/projects/notes-cli');
    s.run('cd ../../notes');
    expect(s.prompt()).toBe('~/notes');
    s.run('cd ~');
    expect(s.prompt()).toBe('~');
    s.run('cd ~/projects');
    s.run('cd');
    expect(s.prompt()).toBe('~');
    s.run('cd ..');
    expect(s.prompt()).toBe('~');
    expect(text(s.run('cd nope'))).toBe('cd: no such file or directory: nope');
    expect(text(s.run('cd now.txt'))).toBe('cd: not a directory: now.txt');
    expect(text(s.run('cat notes'))).toBe('cat: notes: Is a directory');
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

  it('prints the board as text for notes tui at the prompt', () => {
    const out = text(createSession(data).run('notes tui'));
    expect(out).toMatch(/todo/);
    expect(out).toMatch(/doing/);
    expect(out).toMatch(/done/);
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

describe('tab completion', () => {
  const c = (line: string, cmds: string[] = []) => {
    const s = createSession(data);
    for (const x of cmds) s.run(x);
    return s.complete(line);
  };

  it('completes a single command match with a trailing space', () => {
    expect(c('wh')).toEqual({ kind: 'one', value: 'whoami ' });
    expect(c('cle')).toEqual({ kind: 'one', value: 'clear ' });
  });

  it('lists the candidates for several command matches', () => {
    expect(c('c')).toEqual({ kind: 'many', value: 'c', candidates: ['cat', 'cd', 'clear'] });
  });

  it('extends to the common prefix of several matches', () => {
    expect(c('cat n')).toEqual({ kind: 'many', value: 'cat no', candidates: ['notes/', 'now.txt'] });
  });

  it('completes files and directories, dirs with a slash, in the cwd or along a path', () => {
    expect(c('cat no')).toEqual({ kind: 'many', value: 'cat no', candidates: ['notes/', 'now.txt'] });
    expect(c('cat now')).toEqual({ kind: 'one', value: 'cat now.txt ' });
    expect(c('cd pr')).toEqual({ kind: 'one', value: 'cd projects/' });
    expect(c('cat notes/i')).toEqual({ kind: 'one', value: 'cat notes/ideas.md ' });
    expect(c('cat i', ['cd notes'])).toEqual({ kind: 'one', value: 'cat ideas.md ' });
    expect(c('./.my')).toEqual({ kind: 'one', value: './.my-journey.sh ' });
    expect(c('cat .m')).toEqual({ kind: 'one', value: 'cat .my-journey.sh ' });
  });

  it('completes notes subcommands', () => {
    expect(c('notes a')).toEqual({ kind: 'one', value: 'notes add ' });
  });

  it('completes the arguments a command takes after a trailing space', () => {
    expect(c('cat ')).toEqual({ kind: 'many', value: 'cat ', candidates: ['about.txt', 'notes/', 'now.txt', 'projects/'] });
    expect(c('ls ')).toEqual({ kind: 'many', value: 'ls ', candidates: ['about.txt', 'notes/', 'now.txt', 'projects/'] });
    expect(c('cd ')).toEqual({ kind: 'many', value: 'cd ', candidates: ['notes/', 'projects/'] });
    expect(c('cd n')).toEqual({ kind: 'one', value: 'cd notes/' });
    expect(c('cd projects/')).toEqual({ kind: 'many', value: 'cd projects/', candidates: ['notes-cli/', 'pixel-scenes/'] });
    expect(c('notes ')).toEqual({ kind: 'many', value: 'notes ', candidates: ['add', 'done', 'ls', 'tui'] });
  });

  it('offers nothing for commands that take no file argument', () => {
    for (const line of ['whoami ', 'clear ', 'help ', 'pwd ', 'history ', 'notes add ', 'notes ls ', './my-journey.sh ', 'frobnicate ']) {
      expect(c(line), line).toEqual({ kind: 'none' });
    }
  });

  it('reports no completion so Tab can move focus on', () => {
    expect(c('')).toEqual({ kind: 'none' });
    expect(c('xyz')).toEqual({ kind: 'none' });
    expect(c('cat zz')).toEqual({ kind: 'none' });
  });
});

describe('help', () => {
  it('lists the commands and the readline shortcuts', () => {
    const out = createSession(data).run('help');
    const t = out.kind === 'lines' ? out.lines.map(lineText).join('\n') : '';
    for (const k of ['cd <dir>', 'll', 'Tab', 'Ctrl+A', 'Ctrl+E', 'Ctrl+W', 'Ctrl+U', 'Ctrl+L', 'Alt+←', 'Alt+→', '↑']) expect(t).toContain(k);
  });
});

describe('the notes TUI frames', () => {
  const frames = tuiFrames(data.tui);

  it('has one frame per action plus the start, each with exactly one selected item', () => {
    expect(frames).toHaveLength(data.tui.actions.length + 1);
    for (const f of frames) {
      expect(f.columns.map((c) => c.name)).toEqual(['todo', 'doing', 'done']);
      expect(f.columns.flatMap((c) => c.items.filter((i) => i.selected))).toHaveLength(1);
    }
  });

  it('moves the selection and moves an item between columns', () => {
    const where = (f: (typeof frames)[number], item: string) => f.columns.find((c) => c.items.some((i) => i.text === item))?.name;
    expect(where(frames[0], 'water the plants')).toBe('todo');
    expect(where(frames.at(-1)!, 'water the plants')).toBe('done');
    const selected = frames.map((f) => f.columns.flatMap((c) => c.items.filter((i) => i.selected).map((i) => i.text))[0]);
    expect(new Set(selected).size).toBeGreaterThan(1);
  });
});

describe('the demo loop timeline', () => {
  it('reveals each step after the last, types each command one tick a character, and holds before looping', () => {
    const l = buildLoop([{ chars: 6, out: true }, { chars: 11, out: true }], { scenes: 0, frames: 0 });
    expect(l.steps[0].cmd).toBeGreaterThan(0);
    expect(l.steps[0].out).toBeGreaterThanOrEqual(l.steps[0].cmd + 6);
    expect(l.steps[1].cmd).toBeGreaterThan(l.steps[0].out);
    expect(l.steps[1].out).toBeGreaterThanOrEqual(l.steps[1].cmd + 11);
    expect(l.end).toBeGreaterThan(l.steps[1].out);
    expect(l.loop).toBeGreaterThan(l.end + 20);
  });

  it('spaces the scenes and frames out after the command, frames back to back', () => {
    const l = buildLoop([{ chars: 9, out: true }], { scenes: 3, frames: 4 });
    expect(l.scenes).toHaveLength(3);
    expect(l.scenes[0]).toBeGreaterThan(l.steps[0].out);
    expect(l.scenes[2]).toBeGreaterThan(l.scenes[1]);
    expect(l.frames).toHaveLength(4);
    for (let i = 1; i < 4; i++) expect(l.frames[i].start).toBe(l.frames[i - 1].end);
    expect(l.end).toBeGreaterThan(Math.max(l.scenes[2], l.frames[3].start));
  });
});
