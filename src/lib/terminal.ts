/*
 * The terminal's canned session: pure functions over src/content/terminal.json, no DOM.
 * The home page runs each demo's commands through it at build time to print the static
 * transcripts, and the interactive layer (src/scripts/terminal.ts) runs what a visitor types
 * through the same code, so the demo and the live prompt always agree.
 *
 * A line is a string or a list of segments; a segment is a string or [tone, text], where
 * tone is one of dim, green, red, amber, blue, bold (terminal.css .t-<tone>).
 */
export type Tone = 'dim' | 'green' | 'red' | 'amber' | 'blue' | 'bold';
export type Seg = string | [Tone, string];
export type Line = string | Seg[];

export type Output = { kind: 'lines'; lines: Line[] } | { kind: 'journey' } | { kind: 'clear' } | { kind: 'exit' };
export type Completion = { kind: 'none' } | { kind: 'one'; value: string } | { kind: 'many'; value: string; candidates: string[] };

export interface Step {
  cmd: string;
}

export interface Demo {
  title: string;
  label: string;
  foot: string;
  steps: Step[];
}

export interface SceneData {
  id: string;
  title: string;
  caption: string;
  alt: string;
  map: string[];
}

export interface Note {
  status: 'todo' | 'doing' | 'done';
  text: string;
}

/** A file is a list of lines; a directory maps names to nodes. */
export type FsNode = Line[] | { [name: string]: FsNode };

export type TuiAction = 'up' | 'down' | 'left' | 'right' | 'move';

export interface TuiData {
  cmd: string;
  columns: string[];
  start: Record<string, string[]>;
  select: [string, number];
  actions: TuiAction[];
  keys: string;
}

export interface TermData {
  persona: { name: string; role: string };
  home: string;
  user: string;
  fs: Record<string, FsNode>;
  help: Line[];
  notes: { start: Note[]; help: Line[] };
  journey: { intro: string; outro: string; scenes: SceneData[] };
  tui: TuiData;
  demos: Record<'whoami' | 'notes' | 'tui' | 'journey' | 'try', Demo>;
}

/** Split a command line on whitespace, keeping "double" or 'single' quoted words together. */
export function tokenize(input: string): string[] {
  const words: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  for (const m of input.matchAll(re)) words.push(m[1] ?? m[2] ?? m[3]);
  return words;
}

/** The plain text of a line (tones dropped). */
export function lineText(line: Line): string {
  return typeof line === 'string' ? line : line.map((s) => (typeof s === 'string' ? s : s[1])).join('');
}

const isDir = (n: FsNode | undefined): n is { [name: string]: FsNode } => !!n && !Array.isArray(n);

export const COMMANDS = ['cat', 'cd', 'clear', 'exit', 'help', 'history', 'll', 'ls', 'notes', 'pwd', 'whoami'];
const NOTES_SUBS = ['add', 'done', 'ls', 'tui'];
const JOURNEY_NAMES = new Set(['./my-journey.sh', '~/.my-journey.sh', './.my-journey.sh', '.my-journey.sh', 'my-journey.sh']);
const STATUS_TONE: Record<Note['status'], Tone> = { todo: 'blue', doing: 'amber', done: 'green' };

const commonPrefix = (xs: string[]) => xs.reduce((p, x) => {
  let i = 0;
  while (i < p.length && p[i] === x[i]) i++;
  return p.slice(0, i);
});

export function createSession(data: TermData) {
  const notes: Note[] = data.notes.start.map((n) => ({ ...n }));
  const history: string[] = [];
  let cwd: string[] = [];
  const lines = (...l: Line[]): Output => ({ kind: 'lines', lines: l });

  /** Path parts for a path typed at the prompt; ~, the home path and .. are understood. */
  const resolve = (path: string): string[] => {
    let rest = path;
    let parts = [...cwd];
    if (rest === '~' || rest.startsWith('~/')) {
      parts = [];
      rest = rest.slice(1);
    } else if (rest === data.home || rest.startsWith(`${data.home}/`)) {
      parts = [];
      rest = rest.slice(data.home.length);
    }
    for (const p of rest.split('/')) {
      if (!p || p === '.') continue;
      if (p === '..') parts.pop();
      else parts.push(p);
    }
    return parts;
  };

  /** The node at path parts, own keys only (an inherited name such as constructor is no file). */
  const lookup = (parts: string[]): FsNode | undefined => {
    let node: FsNode = data.fs;
    for (const p of parts) {
      if (!isDir(node) || !Object.hasOwn(node, p)) return undefined;
      node = node[p];
    }
    return node;
  };

  const size = (n: FsNode) => (isDir(n) ? 4096 : n.reduce((s, l) => s + lineText(l).length + 1, 0));
  const shown = (name: string, n: FsNode) => (isDir(n) ? `${name}/` : name);
  const perms = (name: string, n: FsNode) => (isDir(n) ? 'drwxr-xr-x' : name.endsWith('.sh') ? '-rwxr-xr-x' : '-rw-r--r--');

  const ls = (args: string[], long = false): Output => {
    const flags = args.filter((a) => a.startsWith('-')).join('');
    const all = long || flags.includes('a');
    const target = args.find((a) => !a.startsWith('-')) ?? '.';
    const node = lookup(resolve(target));
    if (!node) return lines(`ls: cannot access '${target}': No such file or directory`);
    const parts = resolve(target);
    const entries: [string, FsNode][] = isDir(node)
      ? Object.keys(node).sort().filter((n) => all || !n.startsWith('.')).map((n) => [n, node[n]])
      : [[parts.at(-1) ?? target, node]];
    if (!long) return lines([...(all && isDir(node) ? ['./', '../'] : []), ...entries.map(([n, x]) => shown(n, x))].join('  '));
    const rows = (isDir(node) ? ([['.', node], ['..', node]] as [string, FsNode][]) : []).concat(entries);
    return lines(
      `total ${rows.length}`,
      ...rows.map(([n, x]): Line => [
        [isDir(x) ? 'blue' : 'dim', perms(n, x)],
        `  ${data.user}  ${String(size(x)).padStart(5)} `,
        isDir(x) ? ['blue', shown(n, x)] : n.endsWith('.sh') ? ['green', n] : n,
      ]),
    );
  };

  const cd = (target?: string): Output => {
    if (!target || target === '~') {
      cwd = [];
      return lines();
    }
    const parts = resolve(target);
    const node = lookup(parts);
    if (!node) return lines(`cd: no such file or directory: ${target}`);
    if (!isDir(node)) return lines(`cd: not a directory: ${target}`);
    cwd = parts;
    return lines();
  };

  const cat = (args: string[]): Output => {
    if (!args.length) return lines('usage: cat <file>');
    return lines(
      ...args.flatMap((a): Line[] => {
        const node = lookup(resolve(a));
        if (!node) return [`cat: ${a}: No such file or directory`];
        if (isDir(node)) return [`cat: ${a}: Is a directory`];
        return node;
      }),
    );
  };

  const notesCmd = (args: string[]): Output => {
    const [sub, ...rest] = args;
    if (sub === 'add') {
      const text = rest.join(' ').trim();
      if (!text) return lines('usage: notes add "<text>"');
      notes.push({ status: 'todo', text });
      return lines([['green', `added #${notes.length}`], `  ${text}`]);
    }
    if (sub === 'ls' || sub === 'list') {
      return lines(
        [['dim', ' ID  STATUS  NOTE']],
        ...notes.map((n, i): Line => [`${String(i + 1).padStart(3)}  `, [STATUS_TONE[n.status], n.status.padEnd(6)], `  ${n.text}`]),
      );
    }
    if (sub === 'done') {
      const id = Number(rest[0]);
      const n = notes[id - 1];
      if (!n) return lines(`notes: no note #${rest[0] ?? ''}`);
      n.status = 'done';
      return lines([['green', `#${id} done`]]);
    }
    if (sub === 'tui') {
      // The board needs the whole pane; at the prompt it prints as text.
      return lines(
        ...(['todo', 'doing', 'done'] as const).flatMap((s): Line[] => [
          [[STATUS_TONE[s], s]],
          ...notes.filter((n) => n.status === s).map((n) => `  · ${n.text}`),
        ]),
        [['dim', data.tui.keys]],
      );
    }
    return lines(...data.notes.help);
  };

  function run(input: string, { record = true }: { record?: boolean } = {}): Output {
    const trimmed = input.trim();
    if (record && trimmed) history.push(trimmed);
    const words = tokenize(trimmed);
    if (!words.length) return lines();
    const [cmd, ...args] = words;
    if (JOURNEY_NAMES.has(cmd)) return { kind: 'journey' };
    switch (cmd) {
      case 'help':
        return lines(...data.help);
      case 'whoami':
        return lines(data.persona.name, [['dim', data.persona.role]]);
      case 'ls':
        return ls(args);
      case 'll':
        return ls(args, true);
      case 'cd':
        return cd(args[0]);
      case 'cat':
        return cat(args);
      case 'notes':
        return notesCmd(args);
      case 'sh':
      case 'bash':
        return args.length && JOURNEY_NAMES.has(args[0]) ? { kind: 'journey' } : lines(`${cmd}: this terminal only has canned answers`);
      case 'history':
        return lines(...history.map((h, i) => `${String(i + 1).padStart(4)}  ${h}`));
      case 'pwd':
        return lines(data.home + (cwd.length ? `/${cwd.join('/')}` : ''));
      case 'clear':
        return { kind: 'clear' };
      case 'exit':
        return { kind: 'exit' };
      default:
        return lines(`command not found: ${cmd}`);
    }
  }

  /** Tab completion for the line: commands first, notes subcommands, then paths. */
  function complete(line: string): Completion {
    if (!line.trim()) return { kind: 'none' };
    const partial = /(\S*)$/.exec(line)![1];
    const head = line.slice(0, line.length - partial.length);
    const words = tokenize(head);
    let cands: string[];
    let shownAs: string[];
    if (!words.length && !partial.includes('/')) {
      cands = shownAs = COMMANDS.filter((c) => c.startsWith(partial));
    } else if (words.length === 1 && words[0] === 'notes' && !partial.includes('/')) {
      cands = shownAs = NOTES_SUBS.filter((c) => c.startsWith(partial));
    } else {
      const cut = partial.lastIndexOf('/') + 1;
      const dir = partial.slice(0, cut);
      const base = partial.slice(cut);
      const node = lookup(resolve(dir || '.'));
      if (!isDir(node)) return { kind: 'none' };
      const names = Object.keys(node).sort().filter((n) => n.startsWith(base) && (base.startsWith('.') || !n.startsWith('.')));
      shownAs = names.map((n) => shown(n, node[n]));
      cands = shownAs.map((n) => dir + n);
    }
    if (!cands.length) return { kind: 'none' };
    if (cands.length === 1) return { kind: 'one', value: head + cands[0] + (cands[0].endsWith('/') ? '' : ' ') };
    const prefix = commonPrefix(cands);
    return { kind: 'many', value: head + (prefix.length > partial.length ? prefix : partial), candidates: shownAs };
  }

  const prompt = () => `~${cwd.length ? `/${cwd.join('/')}` : ''}`;

  return { run, complete, prompt, history };
}

/* ---- The notes TUI frames ---------------------------------------------------------------- */

export interface TuiFrame {
  columns: { name: string; items: { text: string; selected: boolean }[] }[];
  status: string;
}

/** Play the TUI's actions over its start board: one frame for the start and one per action. */
export function tuiFrames(tui: TuiData): TuiFrame[] {
  const board = tui.columns.map((c) => [...(tui.start[c] ?? [])]);
  let col = Math.max(0, tui.columns.indexOf(tui.select[0]));
  let row = tui.select[1];
  const snap = (status: string): TuiFrame => ({
    columns: tui.columns.map((name, c) => ({ name, items: board[c].map((text, r) => ({ text, selected: c === col && r === row })) })),
    status,
  });
  const frames = [snap(tui.keys)];
  const clampRow = () => {
    row = Math.max(0, Math.min(row, board[col].length - 1));
  };
  for (const a of tui.actions) {
    if (a === 'down') row += 1;
    if (a === 'up') row -= 1;
    if (a === 'left') col = Math.max(0, col - 1);
    if (a === 'right') col = Math.min(board.length - 1, col + 1);
    clampRow();
    let status = `selected: ${board[col][row] ?? ''}`;
    if (a === 'move' && col < board.length - 1) {
      const [item] = board[col].splice(row, 1);
      col += 1;
      board[col].push(item);
      row = board[col].length - 1;
      status = `moved "${item}" to ${tui.columns[col]}`;
    }
    frames.push(snap(status));
  }
  return frames;
}

/* ---- The demo loop timeline -------------------------------------------------------------- */

/** Ticks are --term-tick long (70ms, one typed character). */
export const LOOP = { start: 6, afterCmd: 4, gap: 12, scene: 12, frame: 16, hold: 45 };

export interface LoopPlan {
  steps: { cmd: number; out: number }[];
  scenes: number[];
  /** When the trailing line (after the scenes) appears. */
  after: number;
  frames: { start: number; end: number }[];
  end: number;
  loop: number;
}

/**
 * When each part of a demo appears in its loop, in ticks: commands type one character a tick,
 * then their output shows; scenes and TUI frames follow the last output; the final state holds
 * for a while before the loop starts again.
 */
export function buildLoop(steps: { chars: number; out: boolean }[], { scenes = 0, frames = 0 } = {}): LoopPlan {
  let t = LOOP.start;
  const plan: LoopPlan['steps'] = [];
  for (const s of steps) {
    const out = t + s.chars + LOOP.afterCmd;
    plan.push({ cmd: t, out });
    t = out + (s.out ? LOOP.gap : 1);
  }
  const base = (plan.at(-1)?.out ?? t) + LOOP.afterCmd;
  const sceneAt = Array.from({ length: scenes }, (_, i) => base + i * LOOP.scene);
  const after = base + scenes * LOOP.scene;
  const frameAt = Array.from({ length: frames }, (_, i) => ({ start: base + i * LOOP.frame, end: base + (i + 1) * LOOP.frame }));
  const end = Math.max(t, scenes ? after + LOOP.afterCmd : 0, frames ? base + (frames - 1) * LOOP.frame + 1 : 0);
  const loop = Math.max(end, frames ? base + frames * LOOP.frame : 0) + LOOP.hold;
  if (frameAt.length) frameAt[frameAt.length - 1].end = loop;
  return { steps: plan, scenes: sceneAt, after, frames: frameAt, end, loop };
}
