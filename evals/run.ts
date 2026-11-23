/**
 * Run the AI eval suites with promptfoo, locked down (ADR 0003 and its Task 6 addendum).
 *
 *   tsx evals/run.ts critic | auditor | calibrate [--pairs <regex>]
 *
 * `calibrate` runs both suites for every pair in evals/pairs.yaml and prints, per pair and
 * eval, the accuracy (cases classified as expected), total tokens and summed wall time. The
 * table is also written to .cache/evals/calibration.md. promptfoo itself runs with telemetry,
 * update checks, sharing and remote generation disabled, its state in .cache/promptfoo/, and
 * (DEAD_PROXY below) a proxy that goes nowhere; the agent CLIs it starts get a clean env.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { captureReferences, REFERENCE_URLS, REFERENCE_WIDTHS } from '../scripts/reference-screens';

const ROOT = process.cwd();
const PROMPTFOO = join(ROOT, 'evals', 'node_modules', '.bin', 'promptfoo');
const OUT = join(ROOT, '.cache', 'evals');
const SUITES = { critic: 'design-critic', auditor: 'auditor' } as const;

/** promptfoo's own switches for telemetry, update checks, sharing and remote generation. */
export const LOCKDOWN_ENV: Record<string, string> = {
  PROMPTFOO_DISABLE_TELEMETRY: '1',
  PROMPTFOO_DISABLE_UPDATE: '1',
  PROMPTFOO_DISABLE_SHARING: '1',
  PROMPTFOO_DISABLE_SHARE_EMAIL_REQUEST: '1',
  PROMPTFOO_DISABLE_REMOTE_GENERATION: '1',
  PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION: '1',
  PROMPTFOO_CONFIG_DIR: join(ROOT, '.cache', 'promptfoo'),
};

/**
 * A proxy on a closed local port, for the promptfoo process only. Needed because 0.126.0 still
 * sends one "telemetry disabled" event with telemetry disabled (see ADR 0003, Task 6 addendum).
 * provider.mjs removes it again for the agent CLIs. EVALS_PROXY overrides it (for the logging-proxy
 * check); EVALS_PROXY=none turns it off.
 */
export const DEAD_PROXY = 'http://127.0.0.1:9';

export function promptfooEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const proxy = env.EVALS_PROXY ?? DEAD_PROXY;
  const out: NodeJS.ProcessEnv = { ...env, ...LOCKDOWN_ENV };
  for (const k of ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'NO_PROXY', 'no_proxy', 'ALL_PROXY', 'all_proxy']) delete out[k];
  if (proxy !== 'none') Object.assign(out, { HTTP_PROXY: proxy, HTTPS_PROXY: proxy });
  return out;
}

type PfResult = {
  provider?: { id?: string; label?: string };
  vars?: Record<string, string>;
  latencyMs?: number;
  success?: boolean;
  error?: string;
  response?: { output?: string; tokenUsage?: { prompt?: number; completion?: number; total?: number } };
  gradingResult?: { pass?: boolean; reason?: string };
};

export type Row = { pair: string; evalName: string; correct: number; total: number; errors: number; input: number; output: number; ms: number; cases: string[] };

/** Per-pair stats from a promptfoo `--output` JSON file. */
export function summarise(evalName: string, results: PfResult[]): Row[] {
  const rows = new Map<string, Row>();
  for (const r of results) {
    const pair = r.provider?.label ?? r.provider?.id ?? '?';
    const row = rows.get(pair) ?? { pair, evalName, correct: 0, total: 0, errors: 0, input: 0, output: 0, ms: 0, cases: [] };
    row.total++;
    const ok = r.success === true && r.gradingResult?.pass === true;
    if (ok) row.correct++;
    if (r.error && !r.response?.output) row.errors++;
    row.input += r.response?.tokenUsage?.prompt ?? 0;
    row.output += r.response?.tokenUsage?.completion ?? 0;
    row.ms += r.latencyMs ?? 0;
    let got = 'error';
    try {
      const o = JSON.parse(r.response?.output ?? '') as { passes?: boolean; score?: number };
      got = `${o.passes ? 'pass' : 'fail'} ${o.score}`;
    } catch {
      // keep 'error'
    }
    row.cases.push(`${r.vars?.case}: want ${r.vars?.expected}, got ${got}${ok ? '' : ' ✗'}`);
    rows.set(pair, row);
  }
  return [...rows.values()];
}

export function table(rows: Row[]): string {
  const head = '| Pair | Eval | Accuracy | Errors | Tokens in | Tokens out | Wall time (s) | Cases |\n|---|---|---|---|---|---|---|---|';
  const body = rows.map(
    (r) => `| ${r.pair} | ${r.evalName} | ${r.correct}/${r.total} | ${r.errors} | ${r.input} | ${r.output} | ${(r.ms / 1000).toFixed(0)} | ${r.cases.join('; ')} |`,
  );
  return [head, ...body].join('\n');
}

function runSuite(suite: keyof typeof SUITES, pairs?: string): Row[] {
  const name = SUITES[suite];
  const out = join(OUT, `${name}-results.json`);
  const args = ['eval', '-c', join(ROOT, 'evals', name, 'promptfooconfig.yaml'), '-o', out, '--no-cache', '--no-write', '--no-progress-bar', '--no-table', '-j', '3'];
  if (pairs) args.push('--filter-providers', pairs);
  process.stderr.write(`evals: promptfoo ${name}${pairs ? ` (pairs ${pairs})` : ''}\n`);
  const r = spawnSync(PROMPTFOO, args, { cwd: join(ROOT, 'evals'), env: promptfooEnv(), stdio: ['ignore', 'inherit', 'inherit'] });
  // promptfoo exits 100 when some assertion failed; that is a result, not an error.
  if (r.status !== 0 && r.status !== 100) throw new Error(`promptfoo exited ${r.status ?? r.signal}`);
  const json = JSON.parse(readFileSync(out, 'utf8')) as { results?: { results?: PfResult[] } };
  return summarise(name, json.results?.results ?? []);
}

async function main(argv: string[]): Promise<number> {
  const [cmd] = argv;
  const i = argv.indexOf('--pairs');
  const pairs = i >= 0 ? argv[i + 1] : undefined;
  if (!existsSync(PROMPTFOO)) {
    console.error('evals: promptfoo is not installed; run `npm ci --ignore-scripts --prefix evals` (see evals/README.md)');
    return 1;
  }
  const suites: (keyof typeof SUITES)[] = cmd === 'calibrate' ? ['critic', 'auditor'] : cmd === 'critic' || cmd === 'auditor' ? [cmd] : [];
  if (suites.length === 0) {
    console.error('usage: tsx evals/run.ts critic | auditor | calibrate [--pairs <regex>]');
    return 2;
  }
  mkdirSync(OUT, { recursive: true });
  if (suites.includes('critic')) {
    const refs = await captureReferences({ urls: REFERENCE_URLS, widths: REFERENCE_WIDTHS, maxAgeHours: 24 });
    if (refs.note) console.error(`evals: ${refs.note}`);
  }
  const rows = suites.flatMap((s) => runSuite(s, pairs));
  const md = table(rows.sort((a, b) => a.evalName.localeCompare(b.evalName) || a.pair.localeCompare(b.pair)));
  writeFileSync(join(OUT, cmd === 'calibrate' ? 'calibration.md' : `${SUITES[cmd as keyof typeof SUITES]}.md`), md + '\n');
  console.log(md);
  return 0;
}

if (process.argv[1]?.endsWith('evals/run.ts')) main(process.argv.slice(2)).then((c) => (process.exitCode = c));
