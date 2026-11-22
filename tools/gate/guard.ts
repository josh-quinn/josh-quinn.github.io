/**
 * Edit-time guard, shared by the Claude Code, Copilot CLI and agy pre-tool hooks (ADR 0004).
 *
 *   node tools/gate/guard.ts --agent claude|copilot|agy   (hook payload on stdin)
 *
 * Denies:
 *   - writes to `.gate/**` (only `gate` itself writes verdicts),
 *   - writes to `tests/acceptance/**`, except `tests/acceptance/<id>/` when the agent process
 *     was started with GATE_TEST_AUTHOR=<id> (the test-author step),
 *   - shell commands that bypass git hooks (`--no-verify`, `-n` on commit/push, LEFTHOOK=0,
 *     core.hooksPath) or that add a `Gate-Test-Author` trailer outside the test-author step,
 *   - shell commands that visibly write to a protected path (redirects, rm/mv/cp/tee/...,
 *     sed -i, git checkout/restore/rm/clean, inline interpreter code).
 *
 * Shell analysis is best effort; CI `gate integrity` and `gate verify` are the guarantee.
 * Self-contained (node: imports only, erasable TS) so Node runs it without tsx, fast.
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export type Agent = 'claude' | 'copilot' | 'agy';
export type Decision = { deny: false } | { deny: true; reason: string };
export type GuardOptions = { root?: string; env?: Record<string, string | undefined> };

const AGENTS = new Set<string>(['claude', 'copilot', 'agy']);

/** Tools that only read; never denied. Names are compared lower-case. */
const READ_TOOLS = new Set([
  // Claude Code
  'read', 'grep', 'glob', 'ls', 'webfetch', 'websearch', 'todowrite', 'task', 'agent', 'bashoutput', 'killshell', 'exitplanmode', 'askuserquestion', 'skill', 'toolsearch',
  // Messaging between agents: text only, no file writes.
  'subagenthandback', 'sendmessage',
  // Copilot CLI
  'view', 'search', 'rg', 'fetch', 'web_fetch', 'report_intent', 'think', 'ask_user', 'read_bash', 'list_bash', 'stop_bash',
  // agy
  'view_file', 'read_file', 'list_dir', 'find_by_name', 'grep_search', 'search_web', 'read_url_content', 'list_permissions', 'ask_question', 'manage_task',
]);

/** Tools that run shell commands, and where their command string lives. */
const SHELL_TOOLS = new Set(['bash', 'run_command', 'shell', 'powershell', 'write_bash', 'run_in_terminal']);
const COMMAND_KEYS = ['command', 'commandline', 'cmd', 'input'];

/** Edit tools whose target path keys are known; their content is not scanned. */
const WRITE_TOOLS = new Set([
  'write', 'edit', 'multiedit', 'notebookedit',
  'apply_patch', 'create', 'str_replace_editor', 'str_replace', 'insert', 'edit_file',
  'write_file', 'write_to_file', 'replace_file_content', 'multi_replace_file_content',
]);
const PATH_KEYS = new Set(['file_path', 'notebook_path', 'path', 'targetfile', 'target_file', 'filepath', 'absolutepath', 'new_path', 'destination']);

const PATCH_HEADER = /^\*\*\* (?:Add|Update|Delete) File: (.+)$|^\*\*\* Move to: (.+)$/gm;

type Call = { tool: string; args: unknown; cwd: string };

function obj(x: unknown): Record<string, unknown> | null {
  return x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
}

/** Pull tool name, arguments and cwd out of each agent's PreToolUse payload. */
function normalise(agent: Agent, payload: unknown): Call | null {
  const p = obj(payload);
  if (!p) return null;
  const cwd = typeof p.cwd === 'string' ? p.cwd : Array.isArray(p.workspacePaths) && typeof p.workspacePaths[0] === 'string' ? p.workspacePaths[0] : process.cwd();
  if (agent === 'claude') return typeof p.tool_name === 'string' ? { tool: p.tool_name, args: p.tool_input, cwd } : null;
  if (agent === 'copilot') {
    if (typeof p.toolName !== 'string') return null;
    let args = p.toolArgs;
    if (typeof args === 'string') {
      try {
        const parsed = JSON.parse(args);
        if (obj(parsed)) args = parsed;
      } catch {
        // A raw string (apply_patch sends the patch text).
      }
    }
    return { tool: p.toolName, args, cwd };
  }
  const call = obj(p.toolCall);
  return call && typeof call.name === 'string' ? { tool: call.name, args: call.args, cwd } : null;
}

function findRoot(start: string): string {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(resolve(dir, '.git'))) return dir;
    const up = dirname(dir);
    if (up === dir) return resolve(start);
    dir = up;
  }
}

class Ctx {
  root: string;
  author: string | null;
  constructor(root: string, env: Record<string, string | undefined>) {
    this.root = root;
    const a = env.GATE_TEST_AUTHOR;
    this.author = a && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(a) ? a.toLowerCase() : null;
  }

  /** Which protected area `p` (resolved from `base`) falls in, or null. Case-insensitive (macOS). */
  protectedArea(p: string, base: string): string | null {
    const target = p.trim();
    if (!target) return null;
    const r = relative(this.root, resolve(base, target)).split(sep).join('/').toLowerCase();
    if (r.startsWith('..') || isAbsolute(r)) return null;
    if (r === '.gate' || r.startsWith('.gate/')) return '.gate/';
    if (r === 'tests/acceptance' || r.startsWith('tests/acceptance/')) {
      if (this.author && r.startsWith(`tests/acceptance/${this.author}/`)) return null;
      return 'tests/acceptance/';
    }
    return null;
  }
}

/** Loose check used where paths are buried in text (unknown tools, inline code). */
function mentionsProtected(s: string): boolean {
  const l = s.toLowerCase();
  return /(^|[^a-z0-9_.-])\.gate(\/|$|[^a-z0-9_-])/.test(l) || l.includes('tests/acceptance');
}

function strings(x: unknown, out: string[] = []): string[] {
  if (typeof x === 'string') out.push(x);
  else if (Array.isArray(x)) x.forEach((v) => strings(v, out));
  else if (x && typeof x === 'object') Object.values(x).forEach((v) => strings(v, out));
  return out;
}

function pathValues(x: unknown, out: string[] = []): string[] {
  if (Array.isArray(x)) x.forEach((v) => pathValues(v, out));
  else if (x && typeof x === 'object')
    for (const [k, v] of Object.entries(x)) {
      if (PATH_KEYS.has(k.toLowerCase()) && typeof v === 'string') out.push(v);
      else pathValues(v, out);
    }
  return out;
}

function patchPaths(text: string): string[] {
  return [...text.matchAll(PATCH_HEADER)].map((m) => (m[1] ?? m[2]).trim());
}

const DENY_GATE = 'gate: .gate/ is written only by `npm run gate` (ADR 0004); agents must not edit verdicts';
const DENY_TESTS =
  'gate: tests/acceptance/ is written only by the test-author step (started with GATE_TEST_AUTHOR=<task-id>); the implementer must not edit acceptance tests. Stop and report the problem instead';
const DENY_HOOKS = 'gate: git hooks must not be bypassed (--no-verify, -n, LEFTHOOK=0, core.hooksPath); fix the failure instead';
const DENY_TRAILER = 'gate: only the test-author step for that task may add a Gate-Test-Author trailer';
const DENY_EXEMPT =
  'gate: GATE_TEST_AUTHOR is set only by whoever starts the test-author step, never from an agent shell (it would hand a nested agent the exemption)';

/** A deny reason when an env assignment (or exported name) touches a guarded variable. */
function guardedEnv(word: string): string | null {
  const eq = word.indexOf('=');
  const name = eq < 0 ? word : word.slice(0, eq);
  const value = eq < 0 ? '' : word.slice(eq + 1).toLowerCase();
  if (name === 'GATE_TEST_AUTHOR') return DENY_EXEMPT;
  if (eq >= 0 && /^LEFTHOOK(?:_EXCLUDE|_SKIP)?$/.test(name)) return DENY_HOOKS;
  // Config injected through the environment (GIT_CONFIG_COUNT/KEY_n/VALUE_n, GIT_CONFIG_PARAMETERS).
  if (/^GIT_CONFIG_(?:KEY_\d+|PARAMETERS)$/.test(name) && value.includes('hookspath')) return DENY_HOOKS;
  return null;
}

function areaReason(area: string): string {
  return area === '.gate/' ? DENY_GATE : DENY_TESTS;
}

// ---- shell -------------------------------------------------------------------------------

type Seg = { words: string[]; redirs: string[]; heredocs: string[] };

/**
 * A small POSIX-ish tokenizer: quotes, escapes, control operators, output redirects and
 * heredocs. Heredoc bodies are kept apart (`heredocs`), not read as commands.
 */
export function parseShell(cmd: string): Seg[] {
  const segs: Seg[] = [];
  let cur: Seg = { words: [], redirs: [], heredocs: [] };
  let word = '';
  let inWord = false;
  let redirNext = false;
  const pending: { delim: string; stripTabs: boolean }[] = [];
  const pushWord = () => {
    if (!inWord) return;
    (redirNext ? cur.redirs : cur.words).push(word);
    redirNext = false;
    word = '';
    inWord = false;
  };
  const endSeg = () => {
    pushWord();
    redirNext = false;
    if (cur.words.length || cur.redirs.length || cur.heredocs.length) segs.push(cur);
    cur = { words: [], redirs: [], heredocs: [] };
  };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (c === '\n' && pending.length) {
      // Bodies of the heredocs opened on this line, each up to its delimiter line.
      let pos = i + 1;
      for (const h of pending) {
        const lines: string[] = [];
        while (pos <= cmd.length) {
          const nl = cmd.indexOf('\n', pos);
          const line = cmd.slice(pos, nl < 0 ? cmd.length : nl);
          pos = nl < 0 ? cmd.length + 1 : nl + 1;
          if ((h.stripTabs ? line.replace(/^\t+/, '') : line) === h.delim) break;
          lines.push(line);
        }
        cur.heredocs.push(lines.join('\n'));
      }
      pending.length = 0;
      endSeg();
      i = pos - 1;
      continue;
    }
    if (c === '<' && cmd[i + 1] === '<' && cmd[i + 2] !== '<') {
      pushWord();
      let j = i + 2;
      const stripTabs = cmd[j] === '-';
      if (stripTabs) j++;
      while (cmd[j] === ' ' || cmd[j] === '\t') j++;
      let delim = '';
      while (j < cmd.length && !/[\s;&|<>()]/.test(cmd[j])) {
        if (cmd[j] !== "'" && cmd[j] !== '"' && cmd[j] !== '\\') delim += cmd[j];
        j++;
      }
      pending.push({ delim, stripTabs });
      i = j - 1;
      continue;
    }
    if (c === "'") {
      const j = cmd.indexOf("'", i + 1);
      const end = j < 0 ? cmd.length : j;
      word += cmd.slice(i + 1, end);
      inWord = true;
      i = end;
    } else if (c === '"') {
      let j = i + 1;
      for (; j < cmd.length && cmd[j] !== '"'; j++) {
        if (cmd[j] === '\\' && j + 1 < cmd.length) j++;
        word += cmd[j];
      }
      inWord = true;
      i = j;
    } else if (c === '\\' && i + 1 < cmd.length) {
      word += cmd[++i];
      inWord = true;
    } else if (c === ' ' || c === '\t') {
      pushWord();
    } else if (c === '&' && cmd[i + 1] === '>') {
      pushWord();
      i += cmd[i + 2] === '>' ? 2 : 1;
      redirNext = true;
    } else if (c === '>') {
      if (inWord && /^\d+$/.test(word)) {
        word = '';
        inWord = false;
      } else pushWord();
      if (cmd[i + 1] === '>' || cmd[i + 1] === '|') i++;
      if (cmd[i + 1] === '&') {
        // >&2: duplicate a descriptor, no file.
        i++;
        while (i + 1 < cmd.length && /[\d-]/.test(cmd[i + 1])) i++;
      } else redirNext = true;
    } else if ('\n;&|()`{}'.includes(c)) {
      endSeg();
    } else if (c === '<') {
      // Input redirect or here-string (<<<): a read, not a write.
      pushWord();
      if (cmd[i + 1] === '<' && cmd[i + 2] === '<') i += 2;
    } else {
      word += c;
      inWord = true;
    }
  }
  endSeg();
  return segs;
}

const WRAPPERS = new Set(['sudo', 'command', 'exec', 'nohup', 'time', 'nice', 'xargs', 'env', 'doas', 'builtin']);
const WRITE_CMDS = new Set(['rm', 'rmdir', 'mv', 'cp', 'tee', 'touch', 'mkdir', 'ln', 'truncate', 'dd', 'install', 'rsync', 'chmod', 'chown', 'unlink', 'shred', 'patch', 'curl', 'wget', 'tar', 'unzip', 'trash']);
const INTERPRETERS = new Set(['node', 'nodejs', 'python', 'python3', 'perl', 'ruby', 'deno', 'bun', 'php', 'osascript', 'awk', 'tsx']);
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'fish']);
const GIT_PATH_WRITES = new Set(['checkout', 'restore', 'rm', 'mv', 'clean', 'reset', 'apply', 'stash']);
const GIT_TRAILER_SUBS = new Set(['commit', 'interpret-trailers', 'merge', 'rebase', 'cherry-pick', 'revert', 'tag', 'notes', 'am']);
/** Short options of commit/push that take a value: the rest of the cluster is that value. */
const SHORT_WITH_VALUE = new Set(['m', 'F', 'c', 'C', 't', 'S', 'u', 'o']);
const LONG_WITH_VALUE = new Set(['--message', '--file', '--trailer', '--author', '--date', '--template', '--reuse-message', '--reedit-message', '--fixup', '--squash', '--cleanup', '--push-option', '--repo', '--receive-pack', '--exec', '--gpg-sign', '--untracked-files']);

function bypassesHooks(sub: string, rest: string[]): boolean {
  if (sub !== 'commit' && sub !== 'push') return false;
  for (let i = 0; i < rest.length; i++) {
    const w = rest[i];
    if (w === '--') break;
    // git accepts any unambiguous prefix of a long option (`--no-veri`); treat `--no-ve` and longer as the bypass.
    if (w.length >= '--no-ve'.length && '--no-verify'.startsWith(w)) return true;
    if (w.startsWith('--')) {
      if (LONG_WITH_VALUE.has(w)) i++;
      continue;
    }
    if (w.startsWith('-') && w.length > 1) {
      for (let k = 1; k < w.length; k++) {
        if (w[k] === 'n') return true;
        if (SHORT_WITH_VALUE.has(w[k])) {
          if (k === w.length - 1) i++;
          break;
        }
      }
    }
  }
  return false;
}

function checkShell(command: string, base: string, ctx: Ctx, depth = 0): string | null {
  if (depth > 3) return null;
  let dir = base;
  for (const seg of parseShell(command)) {
    const words = [...seg.words];
    const assigns: string[] = [];
    while (words.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0]) || WRAPPERS.has(words[0]) || (words[0].startsWith('-') && words.length > 1))) {
      const w = words.shift()!;
      if (w.includes('=')) assigns.push(w);
    }
    const cmd = words.length ? basename(words[0]) : '';
    const args = words.slice(1);
    // Guarded variables, as an env prefix (`X=1 cmd`, `env X=1 cmd`), a bare assignment or an export.
    const exported = cmd === 'export' || cmd === 'declare' || cmd === 'typeset' || cmd === 'readonly' ? args : [];
    for (const w of [...assigns, ...exported]) {
      const r = guardedEnv(w);
      if (r) return r;
    }

    for (const r of seg.redirs) {
      const area = ctx.protectedArea(r, dir);
      if (area) return areaReason(area);
    }
    if (!cmd) continue;

    if (cmd === 'cd') {
      dir = resolve(dir, args[0] ?? ctx.root);
      continue;
    }
    if (SHELLS.has(cmd)) {
      const c = args.findIndex((a) => /^-[a-z]*c$/.test(a));
      const scripts = c >= 0 && args[c + 1] !== undefined ? [args[c + 1]] : seg.heredocs;
      for (const script of scripts) {
        const r = checkShell(script, dir, ctx, depth + 1);
        if (r) return r;
      }
      continue;
    }
    if (cmd === 'eval') {
      const r = checkShell(args.join(' '), dir, ctx, depth + 1);
      if (r) return r;
      continue;
    }
    if (cmd === 'git') {
      let i = 0;
      for (; i < args.length && args[i].startsWith('-'); i++) {
        if (args[i] === '-C' && args[i + 1] !== undefined) dir = resolve(dir, args[++i]);
        else if (args[i] === '-c' && args[i + 1] !== undefined && args[++i].toLowerCase().startsWith('core.hookspath')) return DENY_HOOKS;
        else if (args[i].startsWith('--config-env')) {
          const value = args[i].includes('=') ? args[i].slice(args[i].indexOf('=') + 1) : (args[++i] ?? '');
          if (value.toLowerCase().startsWith('core.hookspath')) return DENY_HOOKS;
        }
      }
      const sub = args[i] ?? '';
      const rest = args.slice(i + 1);
      if (bypassesHooks(sub, rest)) return DENY_HOOKS;
      if (sub === 'config' && rest.some((w) => w.toLowerCase() === 'core.hookspath')) return DENY_HOOKS;
      if (GIT_TRAILER_SUBS.has(sub)) {
        const values = [...seg.words.join(' ').matchAll(/gate-test-author\s*[:=]\s*([A-Za-z0-9._-]*)/gi)].map((m) => m[1].toLowerCase());
        if (values.length && !(ctx.author && values.every((v) => v === ctx.author))) return DENY_TRAILER;
      }
      if (GIT_PATH_WRITES.has(sub))
        for (const w of rest) {
          const area = w.startsWith('-') ? null : ctx.protectedArea(w, dir);
          if (area) return areaReason(area);
        }
      continue;
    }
    const inPlace = (cmd === 'sed' || cmd === 'perl') && args.some((a) => /^-[a-zA-Z]*i/.test(a) || a.startsWith('--in-place'));
    if (WRITE_CMDS.has(cmd) || inPlace) {
      for (const w of args) {
        if (w.startsWith('-') && !w.includes('=')) continue;
        const candidate = w.includes('=') ? w.slice(w.indexOf('=') + 1) : w;
        const area = ctx.protectedArea(candidate, dir);
        if (area) return areaReason(area);
      }
      continue;
    }
    if (INTERPRETERS.has(cmd) && [...args, ...seg.heredocs].some(mentionsProtected))
      return 'gate: inline scripts must not touch .gate/ or tests/acceptance/';
  }
  return null;
}

// ---- decision ----------------------------------------------------------------------------

export function decide(agent: Agent, payload: unknown, opts: GuardOptions = {}): Decision {
  const call = normalise(agent, payload);
  if (!call) return { deny: true, reason: 'gate: unrecognised hook payload; denying to be safe' };
  const env = opts.env ?? process.env;
  const ctx = new Ctx(opts.root ?? findRoot(call.cwd), env);
  const tool = call.tool.toLowerCase();

  if (READ_TOOLS.has(tool)) return { deny: false };

  if (SHELL_TOOLS.has(tool)) {
    const a = obj(call.args);
    const command = typeof call.args === 'string' ? call.args : a ? Object.entries(a).find(([k, v]) => COMMAND_KEYS.includes(k.toLowerCase()) && typeof v === 'string')?.[1] : undefined;
    if (typeof command !== 'string') return { deny: true, reason: 'gate: shell call without a command string; denying to be safe' };
    const cwdArg = a && typeof a.Cwd === 'string' ? a.Cwd : call.cwd;
    const reason = checkShell(command, cwdArg, ctx);
    return reason ? { deny: true, reason } : { deny: false };
  }

  const all = strings(call.args);
  const candidates = [...pathValues(call.args), ...all.flatMap(patchPaths)];
  for (const p of candidates) {
    const area = ctx.protectedArea(p, call.cwd);
    if (area) return { deny: true, reason: areaReason(area) };
  }
  // Unknown tools: fail closed on any mention of a protected path.
  if (!WRITE_TOOLS.has(tool) && all.some(mentionsProtected))
    return { deny: true, reason: `gate: unknown tool ${call.tool} names a protected path (.gate/ or tests/acceptance/)` };
  return { deny: false };
}

export function respond(agent: Agent, d: Decision): { exitCode: number; stdout: string; stderr: string } {
  if (!d.deny) return { exitCode: 0, stdout: '', stderr: '' };
  if (agent === 'claude') return { exitCode: 2, stdout: '', stderr: d.reason + '\n' };
  if (agent === 'copilot') return { exitCode: 0, stdout: JSON.stringify({ permissionDecision: 'deny', permissionDecisionReason: d.reason }), stderr: '' };
  return { exitCode: 0, stdout: JSON.stringify({ decision: 'deny', reason: d.reason }), stderr: '' };
}

function cli(): void {
  const i = process.argv.indexOf('--agent');
  const agent = i >= 0 ? process.argv[i + 1] : undefined;
  if (!agent || !AGENTS.has(agent)) {
    process.stderr.write('gate guard: usage: guard.ts --agent claude|copilot|agy\n');
    process.exit(2);
  }
  let payload: unknown = null;
  try {
    payload = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    // normalise() rejects null: fail closed.
  }
  const r = respond(agent as Agent, decide(agent as Agent, payload));
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  process.exit(r.exitCode);
}

const invokedDirectly = (() => {
  try {
    return !!process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
})();
if (invokedDirectly) cli();
