/*
 * The terminal's canned session: pure functions over src/content/terminal.json, no DOM.
 * The home page runs each demo's commands through it at build time to print the static
 * transcripts, and the interactive layer (src/scripts/terminal.ts) runs what a visitor types
 * through the same code, so the CSS demo and the live prompt always agree.
 *
 * A line is a string or a list of segments; a segment is a string or [tone, text], where
 * tone is one of dim, green, red, amber, blue, bold (terminal.css .t-<tone>).
 */
export type Tone = 'dim' | 'green' | 'red' | 'amber' | 'blue' | 'bold';
export type Seg = string | [Tone, string];
export type Line = string | Seg[];

export type Output = { kind: 'lines'; lines: Line[] } | { kind: 'journey' } | { kind: 'clear' } | { kind: 'exit' };

export interface Step {
  cmd: string;
  /** Seconds after load (the pane that plays on load). */
  delay?: number;
  /** 0..1, where in its chapter the step runs (scroll-driven panes). */
  at?: number;
}

export interface Demo {
  title: string;
  label: string;
  foot: string;
  steps: Step[];
  endAt?: number;
  endDelay?: number;
  sceneAt?: number[];
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

export interface TermData {
  persona: { name: string; role: string };
  home: string;
  files: Record<string, Line[]>;
  help: Line[];
  notes: { start: Note[]; help: Line[] };
  journey: { intro: string; outro: string; scenes: SceneData[] };
  demos: Record<'whoami' | 'notes' | 'journey' | 'try', Demo>;
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

const JOURNEY_NAMES = new Set(['./my-journey.sh', '~/.my-journey.sh', './.my-journey.sh', '.my-journey.sh', 'my-journey.sh']);
const STATUS_TONE: Record<Note['status'], Tone> = { todo: 'blue', doing: 'amber', done: 'green' };

export function createSession(data: TermData) {
  const notes: Note[] = data.notes.start.map((n) => ({ ...n }));
  const history: string[] = [];
  const lines = (...l: Line[]): Output => ({ kind: 'lines', lines: l });

  const file = (name: string) =>
    name.replace(/^~\//, '').replace(/^\.\//, '').replace(new RegExp(`^${data.home.replace(/[/.]/g, '\\$&')}/`), '');

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
        return lines((args.includes('-a') ? ['.', '..', '.my-journey.sh'] : []).concat(Object.keys(data.files).sort()).join('  '));
      case 'cat': {
        if (!args.length) return lines('usage: cat <file>');
        // Own keys only: an inherited name (constructor, __proto__, ...) is not a file.
        const read = (name: string) => (Object.hasOwn(data.files, name) ? data.files[name] : undefined);
        return lines(...args.flatMap((a) => read(file(a)) ?? [`cat: ${a}: No such file or directory`]));
      }
      case 'notes':
        return notesCmd(args);
      case 'sh':
      case 'bash':
        return args.length && JOURNEY_NAMES.has(args[0]) ? { kind: 'journey' } : lines(`${cmd}: this terminal only has canned answers`);
      case 'history':
        return lines(...history.map((h, i) => `${String(i + 1).padStart(4)}  ${h}`));
      case 'pwd':
        return lines(data.home);
      case 'clear':
        return { kind: 'clear' };
      case 'exit':
        return { kind: 'exit' };
      default:
        return lines(`command not found: ${cmd}`);
    }
  }

  return { run, history };
}
