/**
 * AI evals for `gate` (ADR 0003) and their calibration cases.
 *
 *   ai-eval.ts design-critic [--page <id>]...   score built pages against DESIGN.md (gate check)
 *   ai-eval.ts auditor                          review the branch diff (gate check)
 *   ai-eval.ts case <eval> <case>               run one calibration case (the promptfoo provider)
 *
 * Every mode prints exactly one JSON object `{score, passes, issues, tokens}` on stdout and
 * exits 0; progress and notes go to stderr; any internal failure exits 1. Backend and model:
 * `--backend`/`--model`, else GATE_AI_BACKEND/GATE_AI_MODEL (set by `gate` for the check), else
 * `ai.<eval>` in ~/.config/jq-tools/gate/config.yaml.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadToolConfig } from '../lib/config';
import type { Page } from '@playwright/test';
import { runAgent, type AgentRun, type Tokens } from './ai-agent';

export const EVALS = ['design-critic', 'auditor'] as const;
export type EvalName = (typeof EVALS)[number];
export type Pair = { backend: string; model: string };
export type Reply = { score: number; passes: boolean; issues: string[] };
export type EvalResult = Reply & { tokens: Tokens };

/** Defaults for `ai.<eval>` in the gate config (merged under whatever the file sets). */
export const EVAL_CONFIG_DEFAULTS = {
  ai: {
    'design-critic': { backend: 'claude', model: 'default' },
    auditor: { backend: 'claude', model: 'default' },
  },
};

export const ROOT = process.cwd();
const WIDTHS = [390, 1280] as const;
const MAX_INLINE_DIFF = 60_000;

export function isEvalName(x: string): x is EvalName {
  return (EVALS as readonly string[]).includes(x);
}

/** Backend and model for an eval: explicit, then the gate's env for the check, then the config file. */
export function resolvePair(name: EvalName, explicit: Partial<Pair> = {}, env: NodeJS.ProcessEnv = process.env): Pair {
  const fromConfig = loadToolConfig('gate', EVAL_CONFIG_DEFAULTS).ai[name];
  return {
    backend: explicit.backend || env.GATE_AI_BACKEND || fromConfig.backend,
    model: explicit.model || env.GATE_AI_MODEL || fromConfig.model,
  };
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** A markdown file without its YAML front matter. */
export function stripFrontmatter(text: string): string {
  return text.replace(FRONTMATTER, '').trim();
}

/** `threshold: <n>` from a rubric's front matter. */
export function rubricThreshold(text: string): number {
  const m = FRONTMATTER.exec(text)?.[1].match(/^threshold:\s*(\d+(?:\.\d+)?)\s*$/m);
  if (!m) throw new Error('rubric has no `threshold: <0-100>` in its front matter');
  return Number(m[1]);
}

/**
 * The agent's reply as `{score, passes, issues}`. Takes the JSON object even when the model
 * wrapped it in a code fence or a sentence; null when there is no valid object.
 */
export function parseReply(text: string): Reply | null {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const candidates = [t, t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)];
  for (const c of candidates) {
    let x: unknown;
    try {
      x = JSON.parse(c);
    } catch {
      continue;
    }
    if (!x || typeof x !== 'object' || Array.isArray(x)) continue;
    const o = x as Record<string, unknown>;
    if (typeof o.score !== 'number' || !Number.isFinite(o.score) || o.score < 0 || o.score > 100) continue;
    if (typeof o.passes !== 'boolean') continue;
    if (!Array.isArray(o.issues) || !o.issues.every((i) => typeof i === 'string')) continue;
    return { score: o.score, passes: o.passes, issues: o.issues as string[] };
  }
  return null;
}

/** Pass only when the agent says so and the score meets the rubric threshold. */
export function finalVerdict(r: Reply, threshold: number): Reply {
  const passes = r.passes && r.score >= threshold;
  const issues = r.passes && !passes ? [...r.issues, `score ${r.score} is below the pass threshold ${threshold}`] : r.issues;
  return { score: r.score, passes, issues };
}

const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const ANSWER = 'Read every file named above that you need, then reply with exactly one JSON object {"score": <0-100>, "passes": <true|false>, "issues": [<string>, ...]} and nothing else: no prose, no code fence.';

export type Shots = { label: string; files: string[] };

/** The design critic's prompt: role, rubric, DESIGN.md, then the candidate and reference screenshots. */
export function criticPrompt(candidates: Shots[], reference: Shots, note?: string): string {
  const list = (s: Shots) => s.files.map((f, i) => `- ${s.label}, ${WIDTHS[i] ?? '?'}px wide: ${f}`).join('\n');
  return [
    stripFrontmatter(read('agents/src/design-critic.md')),
    '## Rubric\n\n' + stripFrontmatter(read('evals/design-critic/rubric.md')),
    '## DESIGN.md\n\n' + read('DESIGN.md').trim(),
    '## Screenshots to judge (the candidate)\n\n' + candidates.map(list).join('\n'),
    '## Reference screenshots (the target look; do not score them)\n\n' + list(reference) + (note ? `\n\nNote: ${note}` : ''),
    ANSWER,
  ].join('\n\n');
}

/** The auditor's prompt: role, rubric, constitution, then the change (inline or as a file to read). */
export function auditorPrompt(change: string, diffFile: string): string {
  const body =
    change.length <= MAX_INLINE_DIFF
      ? '```diff\n' + change.trim() + '\n```'
      : `The change is too large to inline; read it from ${diffFile}.`;
  return [
    stripFrontmatter(read('agents/src/auditor.md')),
    '## Rubric\n\n' + stripFrontmatter(read('evals/auditor/rubric.md')),
    '## Constitution (.specify/memory/constitution.md)\n\n' + read('.specify/memory/constitution.md').trim(),
    '## Change under review\n\n' + body,
    ANSWER,
  ].join('\n\n');
}

/** Run the agent, retrying once when the reply is not a valid object; tokens add up across tries. */
async function ask(name: EvalName, pair: Pair, prompt: string): Promise<EvalResult> {
  const threshold = rubricThreshold(read(`evals/${name}/rubric.md`));
  const tokens: Tokens = { input: 0, output: 0 };
  let last = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    const run: AgentRun = await runAgent({ ...pair, prompt, cwd: ROOT, tools: name === 'auditor' ? 'read-search' : 'read' });
    tokens.input += run.tokens.input;
    tokens.output += run.tokens.output;
    const reply = parseReply(run.text);
    if (reply) return { ...finalVerdict(reply, threshold), tokens };
    last = run.text;
    process.stderr.write(`ai-eval: ${name}: reply ${attempt} is not a valid {score, passes, issues} object; ${attempt === 1 ? 'retrying' : 'giving up'}\n`);
  }
  throw new Error(`${name}: no valid JSON reply after 2 tries; last reply began: ${last.slice(0, 200)}`);
}

// ---------- screenshots ----------

const SHOTS = join(ROOT, '.cache', 'evals', 'design-critic');

/** URL path of a page id: index -> /, fonts -> /_fonts/, x -> /x/. */
export function pagePath(id: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`invalid page id ${JSON.stringify(id)}`);
  return id === 'index' ? '/' : id === 'fonts' ? '/_fonts/' : `/${id}/`;
}

type Target = { url: string; prefix: string; prepare?: (page: Page) => Promise<void> };

async function shootUrls(targets: Target[]): Promise<string[][]> {
  const { openShooter } = await import('../../scripts/reference-screens');
  mkdirSync(SHOTS, { recursive: true });
  const shooter = await openShooter();
  try {
    const out: string[][] = [];
    for (const t of targets) {
      const files = WIDTHS.map((w) => join(SHOTS, `${t.prefix}-${w}.png`));
      for (let i = 0; i < WIDTHS.length; i++) await shooter.shoot(t.url, WIDTHS[i], files[i], t.prepare);
      out.push(files);
    }
    return out;
  } finally {
    await shooter.close();
  }
}

/** Screenshots of built pages (dist/ must exist), served by the dependency-free static server. */
export async function shootPages(pages: string[]): Promise<Shots[]> {
  if (!existsSync(join(ROOT, 'dist', 'index.html'))) throw new Error('dist/ has no build; run `npm run build` first');
  const { startServer } = (await import('../../scripts/serve-dist.mjs')) as { startServer: (d: string, p: number) => Promise<{ url: string; close: () => Promise<void> }> };
  const server = await startServer(join(ROOT, 'dist'), 0);
  try {
    const files = await shootUrls(pages.map((p) => ({ url: server.url + pagePath(p), prefix: `page-${p}` })));
    return pages.map((p, i) => ({ label: `page "${p}" (${pagePath(p)})`, files: files[i] }));
  } finally {
    await server.close();
  }
}

/** The cached reference screenshots; refreshed at most daily, cache used (with a note) when offline. */
export async function referenceShots(): Promise<{ shots: Shots; note?: string }> {
  const { captureReferences, REFERENCE_URLS, REFERENCE_WIDTHS } = await import('../../scripts/reference-screens');
  const r = await captureReferences({ urls: REFERENCE_URLS, widths: REFERENCE_WIDTHS, maxAgeHours: 24 });
  if (r.note) process.stderr.write(`ai-eval: ${r.note}\n`);
  return { shots: { label: 'reference', files: r.files }, note: r.note };
}

// ---------- gate modes ----------

export async function designCritic(pages: string[], pair: Pair): Promise<EvalResult> {
  const candidates = await shootPages(pages);
  const ref = await referenceShots();
  process.stderr.write(`ai-eval: design-critic on ${pages.join(', ')} with ${pair.backend}/${pair.model}\n`);
  return ask('design-critic', pair, criticPrompt(candidates, ref.shots, ref.note ? `${ref.note}.` : undefined));
}

/** Score given screenshots (for example font candidates) beside the references. */
export async function critiqueShots(candidates: Shots[], pair: Pair): Promise<EvalResult> {
  const ref = await referenceShots();
  return ask('design-critic', pair, criticPrompt(candidates, ref.shots, ref.note));
}

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/** The branch's change against its merge base with `base` (gate's baseRef), without .gate/. */
export function branchChange(base: string): string {
  const mb = git(['merge-base', base, 'HEAD']).trim();
  const log = git(['log', '--format=%h %s%n%b', `${mb}..HEAD`]).trim();
  const diff = git(['diff', mb, 'HEAD', '--', '.', ':(exclude).gate']);
  return `Commits (newest first):\n${log || '(none)'}\n\n${diff}`;
}

export async function auditor(pair: Pair, base: string): Promise<EvalResult> {
  const change = branchChange(base);
  const dir = join(ROOT, '.cache', 'evals', 'auditor');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'branch.diff');
  writeFileSync(file, change);
  process.stderr.write(`ai-eval: auditor on ${base}...HEAD (${change.length} chars) with ${pair.backend}/${pair.model}\n`);
  return ask('auditor', pair, auditorPrompt(change, file));
}

// ---------- calibration cases ----------

/** Fake contact details for planted defects, assembled at runtime so no literal is committed. */
export function fakeEmail(): string {
  return ['robin.placeholder', 'placeholder-mail.ie'].join('@');
}

/** A committed auditor case with its placeholders filled in. */
export function auditorCase(name: string): string {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`invalid case name ${JSON.stringify(name)}`);
  return read(`evals/auditor/cases/${name}.diff`).replaceAll('{{FAKE_EMAIL}}', fakeEmail());
}

const CASES = join(ROOT, 'evals', 'design-critic', 'cases');
const caseShots = (name: string) => WIDTHS.map((w) => join(SHOTS, `case-${name}-${w}.png`));

/**
 * Critic case kinds:
 * - `reference`: the reference screenshots themselves, as the candidate;
 * - `<name>.css` (+ optional `<name>.fragment.html`): a near miss, the real built home page with
 *   one planted defect, injected as a style sheet (and HTML appended to `main`) before the shot;
 * - `<name>.html`: a whole page.
 */
export function criticCaseNames(): string[] {
  const files = readdirSync(CASES);
  const pages = files.filter((f) => f.endsWith('.html') && !f.endsWith('.fragment.html')).map((f) => f.slice(0, -5));
  const nearMisses = files.filter((f) => f.endsWith('.css')).map((f) => f.slice(0, -4));
  return ['reference', ...pages, ...nearMisses];
}

/**
 * Take every critic case's screenshots once, before the cases run (they may run in parallel).
 * Near misses need a build (dist/).
 */
export async function prepareCriticCases(names: string[] = criticCaseNames()): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  const ref = await referenceShots();
  const targets: Target[] = [];
  let server: { url: string; close: () => Promise<void> } | undefined;
  try {
    for (const name of names) {
      if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`invalid case name ${JSON.stringify(name)}`);
      if (name === 'reference') {
        // A copy, so the candidate is judged on its own rather than recognised by its path.
        ref.shots.files.forEach((f, i) => copyFileSync(f, caseShots(name)[i]));
        continue;
      }
      const css = join(CASES, `${name}.css`);
      const html = join(CASES, `${name}.html`);
      if (existsSync(css)) {
        if (!server) {
          if (!existsSync(join(ROOT, 'dist', 'index.html'))) throw new Error('near-miss critic cases need a build; run `npm run build` first');
          const { startServer } = (await import('../../scripts/serve-dist.mjs')) as { startServer: (d: string, p: number) => Promise<{ url: string; close: () => Promise<void> }> };
          server = await startServer(join(ROOT, 'dist'), 0);
        }
        const style = readFileSync(css, 'utf8');
        const fragmentFile = join(CASES, `${name}.fragment.html`);
        const fragment = existsSync(fragmentFile) ? readFileSync(fragmentFile, 'utf8') : '';
        targets.push({
          url: server.url + '/',
          prefix: `case-${name}`,
          prepare: async (page) => {
            await page.addStyleTag({ content: style });
            if (fragment) await page.evaluate((f) => document.querySelector('main')?.insertAdjacentHTML('beforeend', f), fragment);
          },
        });
      } else if (existsSync(html)) targets.push({ url: pathToFileURL(html).href, prefix: `case-${name}` });
      else throw new Error(`no critic case ${name} in ${CASES}`);
    }
    if (targets.length) await shootUrls(targets);
  } finally {
    await server?.close();
  }
}

/** Run one critic case; its screenshots are taken first if `prepareCriticCases` has not. */
export async function criticCase(name: string, pair: Pair): Promise<EvalResult> {
  const ref = await referenceShots();
  if (!caseShots(name).every((f) => existsSync(f)) || process.env.EVAL_RESHOOT === '1') await prepareCriticCases([name]);
  const candidate: Shots = { label: 'candidate page', files: caseShots(name) };
  return ask('design-critic', pair, criticPrompt([candidate], ref.shots, ref.note));
}

export async function runCase(name: EvalName, kase: string, pair: Pair): Promise<EvalResult> {
  if (name === 'design-critic') return criticCase(kase, pair);
  const dir = join(ROOT, '.cache', 'evals', 'auditor');
  mkdirSync(dir, { recursive: true });
  const change = auditorCase(kase);
  const file = join(dir, `case-${kase}.diff`);
  writeFileSync(file, change);
  return ask('auditor', pair, auditorPrompt(change, file));
}

// ---------- CLI ----------

type Args = { positional: string[]; pages: string[]; backend?: string; model?: string; base?: string };

function parseArgs(argv: string[]): Args {
  const a: Args = { positional: [], pages: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => {
      const x = argv[++i];
      if (x === undefined) throw new Error(`${k} needs a value`);
      return x;
    };
    if (k === '--page') a.pages.push(v());
    else if (k === '--backend') a.backend = v();
    else if (k === '--model') a.model = v();
    else if (k === '--base') a.base = v();
    else if (k.startsWith('--')) throw new Error(`unknown option ${k}`);
    else a.positional.push(k);
  }
  return a;
}

/** Page for `gate design <page>` (GATE_TASK=design-<page>); else the home page. */
function defaultPages(env: NodeJS.ProcessEnv): string[] {
  const m = /^design-(.+)$/.exec(env.GATE_TASK ?? '');
  return [m ? m[1] : 'index'];
}

export async function main(argv: string[]): Promise<number> {
  try {
    const a = parseArgs(argv);
    const [mode, ...rest] = a.positional;
    let result: EvalResult;
    if (mode === 'design-critic') {
      result = await designCritic(a.pages.length ? a.pages : defaultPages(process.env), resolvePair('design-critic', a));
    } else if (mode === 'auditor') {
      const base = a.base ?? loadToolConfig('gate', { baseRef: 'origin/main' }).baseRef;
      result = await auditor(resolvePair('auditor', a), base);
    } else if (mode === 'case') {
      const [name, kase] = rest;
      if (!name || !isEvalName(name) || !kase) throw new Error('usage: ai-eval.ts case <design-critic|auditor> <case>');
      result = await runCase(name, kase, resolvePair(name, a));
    } else throw new Error('usage: ai-eval.ts design-critic [--page <id>]... | auditor [--base <ref>] | case <eval> <case>');
    process.stdout.write(JSON.stringify(result) + '\n');
    return 0;
  } catch (e) {
    process.stderr.write(`ai-eval: ${(e as Error).message}\n`);
    return 1;
  }
}

const invokedDirectly = (() => {
  try {
    return !!process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href;
  } catch {
    return false;
  }
})();
if (invokedDirectly) main(process.argv.slice(2)).then((c) => (process.exitCode = c));
