/**
 * Run the AI eval suites with promptfoo, locked down (ADR 0003 and its Task 6 addendum).
 *
 *   tsx evals/run.ts critic | auditor | calibrate [--pairs <regex>] [--repeat <n>]
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
import { prepareCriticCases } from '../tools/gate/ai-eval';

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

/** Per-pair stats from a promptfoo `--output` JSON file; repeats of a case are grouped with their score spread. */
export function summarise(evalName: string, results: PfResult[]): Row[] {
  const rows = new Map<string, Row & { byCase: Map<string, { expected: string; got: string[]; scores: number[]; misses: number }> }>();
  for (const r of results) {
    const pair = r.provider?.label ?? r.provider?.id ?? '?';
    const row = rows.get(pair) ?? { pair, evalName, correct: 0, total: 0, errors: 0, input: 0, output: 0, ms: 0, cases: [], byCase: new Map() };
    row.total++;
    const ok = r.success === true && r.gradingResult?.pass === true;
    if (ok) row.correct++;
    if (r.error && !r.response?.output) row.errors++;
    row.input += r.response?.tokenUsage?.prompt ?? 0;
    row.output += r.response?.tokenUsage?.completion ?? 0;
    row.ms += r.latencyMs ?? 0;
    const kase = String(r.vars?.case);
    const c = row.byCase.get(kase) ?? { expected: String(r.vars?.expected), got: [], scores: [], misses: 0 };
    try {
      const o = JSON.parse(r.response?.output ?? '') as { passes?: boolean; score?: number };
      c.got.push(o.passes ? 'pass' : 'fail');
      if (typeof o.score === 'number') c.scores.push(o.score);
    } catch {
      c.got.push('error');
    }
    if (!ok) c.misses++;
    row.byCase.set(kase, c);
    rows.set(pair, row);
  }
  return [...rows.values()].map(({ byCase, ...row }) => ({
    ...row,
    cases: [...byCase.entries()].map(([kase, c]) => {
      const counts = ['pass', 'fail', 'error'].filter((k) => c.got.includes(k)).map((k) => `${k}×${c.got.filter((g) => g === k).length}`).join(' ');
      const spread = c.scores.length ? `, scores ${Math.min(...c.scores)}-${Math.max(...c.scores)}` : '';
      return `${kase}: want ${c.expected}, got ${counts}${spread}${c.misses ? ' ✗' : ''}`;
    }),
  }));
}

export function table(rows: Row[]): string {
  const head = '| Pair | Eval | Accuracy | Errors | Tokens in | Tokens out | Wall time (s) | Cases |\n|---|---|---|---|---|---|---|---|';
  const body = rows.map(
    (r) => `| ${r.pair} | ${r.evalName} | ${r.correct}/${r.total} | ${r.errors} | ${r.input} | ${r.output} | ${(r.ms / 1000).toFixed(0)} | ${r.cases.join('; ')} |`,
  );
  return [head, ...body].join('\n');
}

function runSuite(suite: keyof typeof SUITES, pairs?: string, repeat = 1): Row[] {
  const name = SUITES[suite];
  const out = join(OUT, `${name}-results.json`);
  const args = ['eval', '-c', join(ROOT, 'evals', name, 'promptfooconfig.yaml'), '-o', out, '--no-cache', '--no-write', '--no-progress-bar', '--no-table', '-j', '3'];
  if (pairs) args.push('--filter-providers', pairs);
  if (repeat > 1) args.push('--repeat', String(repeat));
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
  const j = argv.indexOf('--repeat');
  const repeat = j >= 0 ? Number(argv[j + 1]) : 1;
  if (!Number.isInteger(repeat) || repeat < 1) {
    console.error('evals: --repeat needs a positive integer');
    return 2;
  }
  if (!existsSync(PROMPTFOO)) {
    console.error('evals: promptfoo is not installed; run `npm ci --ignore-scripts --prefix evals` (see evals/README.md)');
    return 1;
  }
  const suites: (keyof typeof SUITES)[] = cmd === 'calibrate' ? ['critic', 'auditor'] : cmd === 'critic' || cmd === 'auditor' ? [cmd] : [];
  if (suites.length === 0) {
    console.error('usage: tsx evals/run.ts critic | auditor | calibrate [--pairs <regex>] [--repeat <n>]');
    return 2;
  }
  mkdirSync(OUT, { recursive: true });
  if (suites.includes('critic')) {
    // Near-miss cases screenshot the built home page; take every case's shots once, up front.
    const build = spawnSync('npm', ['run', 'build', '--silent'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
    if (build.status !== 0) throw new Error('npm run build failed');
    const refs = await captureReferences({ urls: REFERENCE_URLS, widths: REFERENCE_WIDTHS, maxAgeHours: 24 });
    if (refs.note) console.error(`evals: ${refs.note}`);
    await prepareCriticCases();
  }
  const rows = suites.flatMap((s) => runSuite(s, pairs, repeat));
  const md = table(rows.sort((a, b) => a.evalName.localeCompare(b.evalName) || a.pair.localeCompare(b.pair)));
  writeFileSync(join(OUT, cmd === 'calibrate' ? 'calibration.md' : `${SUITES[cmd as keyof typeof SUITES]}.md`), md + '\n');
  console.log(md);
  return 0;
}

if (process.argv[1]?.endsWith('evals/run.ts')) main(process.argv.slice(2)).then((c) => (process.exitCode = c));
