/**
 * promptfoo custom provider: runs one calibration case through the same code path as the gate
 * check (`tools/gate/ai-eval.ts case <eval> <case>`), with the backend and model from the
 * provider's `config`. Returns the `{score, passes, issues}` object as the output and the
 * agent CLI's own token counts as `tokenUsage` (ADR 0003: an `exec:` provider reports zero).
 *
 * The agent subprocess gets an environment without proxy variables, so the dead proxy that
 * keeps promptfoo itself offline (evals/run.ts) never reaches the agent CLIs.
 */
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TSX = join(ROOT, 'node_modules', '.bin', 'tsx');
const PROXY_VARS = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy'];

function cleanEnv() {
  const env = { ...process.env };
  for (const k of PROXY_VARS) delete env[k];
  for (const k of Object.keys(env)) if (k.startsWith('PROMPTFOO_') || k === 'GATE_AI_BACKEND' || k === 'GATE_AI_MODEL') delete env[k];
  return env;
}

function run(args) {
  return new Promise((ok) => {
    const child = spawn(TSX, args, { cwd: ROOT, env: cleanEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => ok({ code, stdout, stderr }));
    child.on('error', (e) => ok({ code: -1, stdout, stderr: String(e) }));
  });
}

export default class AgentProvider {
  constructor(options = {}) {
    this.config = options.config ?? {};
    this.label = options.label;
  }

  id() {
    return this.label ?? `agent:${this.config.backend}:${this.config.model ?? 'default'}`;
  }

  async callApi(_prompt, context) {
    const { eval: evalName, case: kase } = context?.vars ?? {};
    const { backend, model = 'default' } = this.config;
    const r = await run(['tools/gate/ai-eval.ts', 'case', String(evalName), String(kase), '--backend', String(backend), '--model', String(model)]);
    if (r.code !== 0) return { error: `ai-eval exited ${r.code}: ${r.stderr.trim().split('\n').slice(-2).join(' | ')}` };
    let out;
    try {
      out = JSON.parse(r.stdout);
    } catch {
      return { error: `ai-eval printed something other than one JSON object: ${r.stdout.slice(0, 200)}` };
    }
    const { input = 0, output = 0 } = out.tokens ?? {};
    return {
      output: JSON.stringify({ score: out.score, passes: out.passes, issues: out.issues }),
      tokenUsage: { prompt: input, completion: output, total: input + output },
    };
  }
}
