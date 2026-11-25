/**
 * Capture v0: turn a Claude Code or Copilot CLI session transcript into a journal entry.
 *
 *   hook (stdin JSON)  ->  capture.ts --event PreCompact|SessionEnd [--agent claude|copilot]
 *                          reads the hook payload, spawns a detached worker and returns at once
 *   worker             ->  capture.ts --worker --transcript <path> --event <E> --agent <A>
 *                          summarises through the configured backend CLI and appends the entry
 *
 * Privacy: the transcript goes only to the configured backend CLI (`claude -p` by default),
 * the same vendor as the session. No other network. Output is redacted before writing.
 * Config: ~/.config/jq-tools/capture/config.yaml (journal_dir, backend). Dedupe state is kept
 * in the tool state dir. Recursion guard: the backend runs with JQ_CAPTURE_ACTIVE=1.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadToolConfig, toolStateDir } from '../lib/config.ts';
import { PRIVATE_PATTERNS, UUID_SHAPED } from '../../tests/privacy/patterns.ts';

export type CaptureEvent = 'PreCompact' | 'SessionEnd' | 'manual';
export type CaptureAgent = 'claude' | 'copilot';
export interface CaptureOpts {
  transcriptPath: string;
  event: CaptureEvent;
  agent: CaptureAgent;
}
export interface CaptureResult {
  status: 'written' | 'skipped';
  reason?: string;
  file?: string;
}

const DEFAULTS = {
  journal_dir: '~/vault/development/ai-engineering-toolkit/journal/',
  backend: 'claude',
  max_transcript_chars: 60000,
  backend_timeout_s: 300,
};

const here = dirname(fileURLToPath(import.meta.url));
const expandHome = (p: string) => (p === '~' || p.startsWith('~/') ? join(homedir(), p.slice(1)) : p);

// ---- transcript -> plain text ------------------------------------------------

function blockText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((b) => (b && typeof b === 'object' && (b as { type?: string }).type === 'text' ? String((b as { text?: unknown }).text ?? '') : ''))
    .filter(Boolean)
    .join('\n');
}

/** User and assistant text only, from a Claude Code or Copilot CLI JSONL transcript. */
export function transcriptToText(jsonl: string): string {
  const turns: string[] = [];
  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue;
    let o: any;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    let role = '';
    let text = '';
    if (o.type === 'user' || o.type === 'assistant') {
      if (o.isSidechain || o.isMeta) continue;
      role = o.type;
      text = blockText(o.message?.content);
    } else if (o.type === 'user.message') {
      role = 'user';
      text = typeof o.data?.content === 'string' ? o.data.content : '';
    } else if (o.type === 'assistant.message') {
      role = 'assistant';
      text = typeof o.data?.content === 'string' ? o.data.content : '';
    }
    text = text.trim();
    if (role && text && !/^<(system-reminder|command-|local-command)/.test(text)) turns.push(`${role.toUpperCase()}: ${text}`);
  }
  return turns.join('\n\n');
}

/** Keep the start and the end when the transcript is too long. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = Math.floor(max * 0.3);
  return `${text.slice(0, head)}\n\n[... middle of the transcript omitted ...]\n\n${text.slice(text.length - (max - head))}`;
}

// ---- redaction ---------------------------------------------------------------

const DATE_SHAPED = /^(?:\d{4}-\d{2}(?:-\d{2})?|\d{4}\s*-\s*\d{4})$/;
const SECRET_RES: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  /\b(?:api[_-]?key|secret|token|password|passwd)\s*[:=]\s*["']?[^\s"']{8,}/gi,
];

/** Cheap redaction pass: secrets, emails, phone numbers. Not a guarantee; the prompt also forbids them. */
export function redact(text: string): string {
  let out = text;
  for (const re of SECRET_RES) out = out.replace(re, '[redacted-secret]');
  const email = PRIVATE_PATTERNS.find((p) => p.name === 'email')!;
  const phone = PRIVATE_PATTERNS.find((p) => p.name === 'phone')!;
  out = out.replace(new RegExp(email.re.source, 'g'), '[redacted-email]');
  out = out.replace(new RegExp(`(${UUID_SHAPED.source})|(${phone.re.source})`, 'gi'), (m, uuid) =>
    uuid || DATE_SHAPED.test(m.trim()) ? m : '[redacted-phone]',
  );
  return out;
}

// ---- dedupe state ------------------------------------------------------------

function seenFile(): string {
  return join(toolStateDir('capture'), 'seen.json');
}
function readSeen(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(seenFile(), 'utf8'));
  } catch {
    return {};
  }
}
const seenKey = (path: string, size: number) => createHash('sha256').update(`${path}\0${size}`).digest('hex');

// ---- backend -----------------------------------------------------------------

/**
 * argv and stdin for the summariser. It reads an untrusted transcript, so it runs with no tools
 * and no MCP servers: a prompt injection then has nothing to act with.
 * claude takes the transcript on stdin; copilot ignores stdin in -p mode, so it goes in the prompt.
 */
export function backendInvocation(backend: string, prompt: string, transcript: string): { args: string[]; stdin: string } {
  const name = basename(backend);
  if (name === 'copilot') {
    const deny = ['shell', 'write', 'read', 'url', 'memory'].map((t) => `--deny-tool=${t}`);
    return {
      args: ['-p', `${prompt}\n\n${transcript}`, '-s', '--disable-client-telemetry', '--disable-builtin-mcps', ...deny],
      stdin: '',
    };
  }
  if (name === 'claude') {
    return {
      args: ['-p', prompt, '--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence', '--tools', ''],
      stdin: transcript,
    };
  }
  return { args: ['-p', prompt], stdin: transcript };
}

function runBackend(backend: string, prompt: string, transcript: string, timeoutS: number): Promise<string | null> {
  const { args, stdin } = backendInvocation(backend, prompt, transcript);
  return new Promise((resolve) => {
    const child = spawn(backend, args, {
      env: { ...process.env, JQ_CAPTURE_ACTIVE: '1' },
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    let out = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutS * 1000);
    child.stdout.on('data', (d) => (out += d));
    child.on('error', () => resolve(null));
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0 && out.trim() ? out.trim() : null);
    });
    child.stdin.on('error', () => {});
    child.stdin.end(stdin);
  });
}

// ---- capture -----------------------------------------------------------------

const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function sessionId(transcriptPath: string): string {
  const base = basename(transcriptPath).replace(/\.jsonl$/, '');
  const id = base === 'events' ? basename(dirname(transcriptPath)) : base;
  return id.slice(0, 8);
}

export async function capture(opts: CaptureOpts): Promise<CaptureResult> {
  if (process.env.JQ_CAPTURE_ACTIVE) return { status: 'skipped', reason: 'nested' };
  if (!opts.transcriptPath || !existsSync(opts.transcriptPath)) return { status: 'skipped', reason: 'no-transcript' };

  const cfg = loadToolConfig('capture', DEFAULTS);
  const size = statSync(opts.transcriptPath).size;
  const key = seenKey(opts.transcriptPath, size);
  if (readSeen()[key]) return { status: 'skipped', reason: 'seen' };

  const text = transcriptToText(readFileSync(opts.transcriptPath, 'utf8'));
  if (!text) return { status: 'skipped', reason: 'empty' };

  const prompt = readFileSync(join(here, 'editor-prompt.md'), 'utf8');
  const transcript = clip(text, cfg.max_transcript_chars);
  const raw = await runBackend(expandHome(cfg.backend), prompt, transcript, cfg.backend_timeout_s);
  if (!raw) return { status: 'skipped', reason: 'backend-failed' };

  const body = redact(raw);
  const id = sessionId(opts.transcriptPath);
  const now = new Date();
  const dir = expandHome(cfg.journal_dir);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${localDate(now)}-${id}.md`);
  if (existsSync(file)) {
    const later = body.replace(/^## /gm, '### ');
    appendFileSync(file, `\n\n## Update (${opts.event}, ${now.toISOString()})\n\n${later}\n`);
  } else {
    const head = `---\ndate: ${localDate(now)}\nsession: ${opts.agent} ${id}\ncaptured: automatically by the capture hook (${opts.event})\n---\n\n# Session ${id}\n\n`;
    writeFileSync(file, `${head}${body}\n`);
  }

  const seen = readSeen();
  seen[key] = now.toISOString();
  const tmpFile = `${seenFile()}.${process.pid}.tmp`;
  writeFileSync(tmpFile, JSON.stringify(seen, null, 2));
  renameSync(tmpFile, seenFile());
  return { status: 'written', file };
}

// ---- hook wrapper ------------------------------------------------------------

function arg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  let s = '';
  for await (const c of process.stdin) s += c;
  return s;
}

/** Copilot sessionEnd has no transcript path: use the session's events file. */
function copilotEvents(sessionId: string): string {
  return join(homedir(), '.copilot', 'session-state', sessionId, 'events.jsonl');
}

export async function main(argv: string[]): Promise<void> {
  const event = (arg(argv, '--event') ?? 'manual') as CaptureEvent;
  const agent = (arg(argv, '--agent') ?? 'claude') as CaptureAgent;

  if (argv.includes('--worker')) {
    const res = await capture({ transcriptPath: arg(argv, '--transcript') ?? '', event, agent });
    if (res.status === 'skipped' && res.reason !== 'seen' && res.reason !== 'nested') console.error(`capture: skipped (${res.reason})`);
    return;
  }

  if (process.env.JQ_CAPTURE_ACTIVE) return;
  let payload: any = {};
  try {
    payload = JSON.parse((await readStdin()) || '{}');
  } catch {
    /* no usable payload */
  }
  let transcript: string | undefined = arg(argv, '--transcript') ?? payload.transcript_path ?? payload.transcriptPath;
  if (!transcript && agent === 'copilot' && payload.sessionId) transcript = copilotEvents(payload.sessionId);
  if (!transcript) return;

  // Detach: the hook returns at once; the worker does the slow backend call.
  const child = spawn(
    process.execPath,
    [...process.execArgv, fileURLToPath(import.meta.url), '--worker', '--transcript', transcript, '--event', event, '--agent', agent],
    { detached: true, stdio: 'ignore', env: process.env },
  );
  child.unref();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`capture: ${e instanceof Error ? e.message : e}`);
  });
}
