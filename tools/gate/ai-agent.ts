/**
 * Run one headless agent CLI call (claude, copilot or agy) and return its final text and
 * token counts. Flags per CLI are from ADR 0004 (headless) and ADR 0003 (token sources).
 * The agent gets read-only tools only, and no user plugins, MCP servers or custom instructions,
 * so the eval measures the prompt and the model, not the machine's setup.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const BACKENDS = ['claude', 'copilot', 'agy'] as const;
export type Backend = (typeof BACKENDS)[number];
export type Tokens = { input: number; output: number };
export type AgentRun = { text: string; tokens: Tokens };
export type AgentCall = {
  backend: string;
  /** Model id for the CLI's --model flag; 'default' (or '') leaves the CLI's own default. */
  model: string;
  prompt: string;
  cwd: string;
  /** Read-only tools the agent may use: files only, or files plus search. */
  tools: 'read' | 'read-search';
  timeoutMs?: number;
};

export const DEFAULT_AGENT_TIMEOUT_MS = 600_000;
const PROXY_VARS = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy'];

export function isBackend(x: string): x is Backend {
  return (BACKENDS as readonly string[]).includes(x);
}

/** The agent's environment: the caller's, minus proxy variables (the eval runner may set a dead proxy). */
export function agentEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const out = { ...env };
  for (const k of PROXY_VARS) delete out[k];
  return out;
}

const withModel = (model: string, flag = '--model') => (model && model !== 'default' ? [flag, model] : []);

/** argv for each CLI (without the binary name). */
export function agentArgs(c: Pick<AgentCall, 'backend' | 'model' | 'prompt' | 'cwd' | 'tools'>): string[] {
  const search = c.tools === 'read-search';
  switch (c.backend) {
    case 'claude': {
      const tools = search ? 'Read,Grep,Glob' : 'Read';
      return [
        '-p', c.prompt, '--output-format', 'json',
        '--safe-mode', '--tools', tools, '--allowedTools', tools,
        '--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence',
        '--max-turns', '30', ...withModel(c.model),
      ];
    }
    case 'copilot':
      return [
        '-p', c.prompt, '--output-format', 'json',
        `--available-tools=${search ? 'view,glob,grep' : 'view'}`, '--allow-tool=read', '--add-dir', c.cwd,
        '--disable-client-telemetry', '--no-custom-instructions', '--disable-builtin-mcps',
        '--no-ask-user', '--no-auto-update', ...withModel(c.model),
      ];
    case 'agy':
      return ['-p', c.prompt, '--output-format', 'json', '--disable-slash-commands', ...withModel(c.model)];
    default:
      throw new Error(`unknown AI backend ${JSON.stringify(c.backend)} (expected ${BACKENDS.join(', ')})`);
  }
}

const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);

/** Claude Code `--output-format json`: one object; input = fresh + cache-write + cache-read tokens. */
export function parseClaude(stdout: string): AgentRun {
  const j = JSON.parse(stdout) as { result?: unknown; is_error?: boolean; usage?: Record<string, unknown> };
  if (j.is_error || typeof j.result !== 'string') throw new Error(`claude reported an error: ${String(j.result).slice(0, 300)}`);
  const u = j.usage ?? {};
  return {
    text: j.result,
    tokens: { input: n(u.input_tokens) + n(u.cache_creation_input_tokens) + n(u.cache_read_input_tokens), output: n(u.output_tokens) },
  };
}

/** agy `--output-format json`: `{status, response, usage}`; thinking tokens count as output. */
export function parseAgy(stdout: string): AgentRun {
  const j = JSON.parse(stdout) as { status?: string; response?: unknown; usage?: Record<string, unknown> };
  if (j.status !== 'SUCCESS' || typeof j.response !== 'string') throw new Error(`agy status ${j.status ?? 'missing'}`);
  const u = j.usage ?? {};
  return { text: j.response, tokens: { input: n(u.input_tokens), output: n(u.output_tokens) + n(u.thinking_tokens) } };
}

type CopilotEvent = { type?: string; sessionId?: string; exitCode?: number; data?: Record<string, unknown> };
const events = (text: string): CopilotEvent[] =>
  text
    .split('\n')
    .filter((l) => l.trim().startsWith('{'))
    .map((l) => {
      try {
        return JSON.parse(l) as CopilotEvent;
      } catch {
        return {};
      }
    });

/**
 * Copilot `--output-format json` JSONL: the answer is the last `assistant.message` content; the
 * closing `result` record has only premium-request usage, so tokens are summed from the
 * session's `session.usage_record` events in `<copilotHome>/session-state/<sessionId>/events.jsonl`.
 */
export function parseCopilot(stdout: string, copilotHome = process.env.COPILOT_HOME || join(homedir(), '.copilot')): AgentRun {
  const ev = events(stdout);
  const err = ev.find((e) => e.type === 'session.error');
  const result = ev.find((e) => e.type === 'result');
  const answers = ev.filter((e) => e.type === 'assistant.message' && typeof e.data?.content === 'string' && (e.data.content as string).trim());
  if (err || !result || result.exitCode !== 0 || answers.length === 0)
    throw new Error(`copilot failed: ${String(err?.data?.message ?? `exit ${result?.exitCode ?? 'unknown'}, no answer`)}`);
  const tokens: Tokens = { input: 0, output: 0 };
  const file = join(copilotHome, 'session-state', String(result.sessionId), 'events.jsonl');
  if (existsSync(file)) {
    for (const e of events(readFileSync(file, 'utf8'))) {
      if (e.type !== 'session.usage_record') continue;
      const u = (e.data?.usage ?? {}) as Record<string, unknown>;
      tokens.input += n(u.inputTokens);
      tokens.output += n(u.outputTokens);
    }
  }
  return { text: answers[answers.length - 1].data!.content as string, tokens };
}

/** The CLI's own error text: a JSON `result`/`response`/`error` field when there is one, else the last lines. */
export function failureText(stdout: string, stderr: string): string {
  try {
    const j = JSON.parse(stdout) as Record<string, unknown>;
    const msg = j.result ?? j.response ?? j.error;
    if (typeof msg === 'string' && msg.trim()) return msg.trim().slice(0, 400);
  } catch {
    // not one JSON object
  }
  return (stderr || stdout).trim().split('\n').slice(-3).join(' | ').slice(0, 400);
}

/** Run the CLI; rejects on a non-zero exit, a timeout, or output it cannot parse. */
export function runAgent(c: AgentCall): Promise<AgentRun> {
  const args = agentArgs(c);
  const timeoutMs = c.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const child = spawn(c.backend, args, { cwd: c.cwd, env: agentEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
    const out: string[] = [];
    const err: string[] = [];
    child.stdout.setEncoding('utf8').on('data', (d: string) => out.push(d));
    child.stderr.setEncoding('utf8').on('data', (d: string) => err.push(d));
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`could not start ${c.backend}: ${e.message}`));
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const stdout = out.join('');
      if (signal) return reject(new Error(`${c.backend} killed by ${signal} (timeout ${timeoutMs} ms?)`));
      if (code !== 0) return reject(new Error(`${c.backend} exited ${code}: ${failureText(stdout, err.join(''))}`));
      try {
        resolve(c.backend === 'claude' ? parseClaude(stdout) : c.backend === 'agy' ? parseAgy(stdout) : parseCopilot(stdout));
      } catch (e) {
        reject(e as Error);
      }
    });
  });
}
