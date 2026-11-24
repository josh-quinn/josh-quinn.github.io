import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { agentArgs, agentEnv, failureText, parseAgy, parseClaude, parseCopilot } from '../../../tools/gate/ai-agent';
import { auditorCase, fakeEmail, finalVerdict, pagePath, parseReply, resolvePair, rubricThreshold } from '../../../tools/gate/ai-eval';
import { isolateEnv, write } from '../gate/helpers';

describe('parseReply', () => {
  it('accepts the bare object', () => {
    expect(parseReply('{"score":91,"passes":true,"issues":[]}')).toEqual({ score: 91, passes: true, issues: [] });
  });
  it('takes the object out of a code fence or a sentence', () => {
    expect(parseReply('```json\n{"score":10,"passes":false,"issues":["x"]}\n```')?.score).toBe(10);
    expect(parseReply('Here it is: {"score":10,"passes":false,"issues":["x"]} Thanks.')?.issues).toEqual(['x']);
  });
  it.each([
    ['no object', 'I could not read the image.'],
    ['score out of range', '{"score":120,"passes":true,"issues":[]}'],
    ['score as a fraction string', '{"score":"0.8","passes":true,"issues":[]}'],
    ['passes missing', '{"score":80,"issues":[]}'],
    ['issues not strings', '{"score":80,"passes":true,"issues":[{"a":1}]}'],
  ])('rejects %s', (_l, text) => {
    expect(parseReply(text)).toBeNull();
  });
});

describe('finalVerdict', () => {
  it('passes only when the agent says pass and the score meets the threshold', () => {
    expect(finalVerdict({ score: 85, passes: true, issues: [] }, 80).passes).toBe(true);
    expect(finalVerdict({ score: 85, passes: false, issues: ['never-list item'] }, 80).passes).toBe(false);
    const low = finalVerdict({ score: 70, passes: true, issues: [] }, 80);
    expect(low.passes).toBe(false);
    expect(low.issues.at(-1)).toMatch(/below the pass threshold 80/);
  });
});

describe('rubricThreshold', () => {
  it('reads threshold from the front matter', () => {
    expect(rubricThreshold('---\nthreshold: 80\n---\nScore it.')).toBe(80);
  });
  it('throws when there is none', () => {
    expect(() => rubricThreshold('Score it.')).toThrow(/threshold/);
  });
  it('the committed rubrics both have one', async () => {
    const { readFileSync } = await import('node:fs');
    for (const e of ['design-critic', 'auditor']) expect(rubricThreshold(readFileSync(`evals/${e}/rubric.md`, 'utf8'))).toBeGreaterThan(0);
  });
});

describe('pagePath', () => {
  it('maps page ids to URL paths', () => {
    expect(pagePath('index')).toBe('/');
    expect(pagePath('fonts')).toBe('/_fonts/');
    expect(pagePath('cv')).toBe('/cv/');
  });
  it('rejects ids that could leave the site', () => {
    expect(() => pagePath('../x')).toThrow();
  });
});

describe('auditor cases', () => {
  it('fills the fake email in at runtime; the committed case holds only the placeholder', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('evals/auditor/cases/mailto-link.diff', 'utf8')).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    const filled = auditorCase('mailto-link');
    expect(filled).toContain(`mailto:${fakeEmail()}`);
    expect(filled).not.toContain('{{FAKE_EMAIL}}');
  });
});

describe('resolvePair', () => {
  let restore: () => void;
  beforeEach(() => (restore = isolateEnv()));
  afterEach(() => restore());

  it('defaults to claude with the CLI default model, per eval', () => {
    expect(resolvePair('design-critic', {}, {})).toEqual({ backend: 'claude', model: 'default' });
  });
  it('reads ai.<eval> from the gate config', () => {
    write(process.env.TOOLS_CONFIG!, 'gate/config.yaml', 'ai:\n  backend: claude\n  model: sonnet\n  auditor:\n    backend: agy\n    model: m1\n');
    expect(resolvePair('auditor', {}, {})).toEqual({ backend: 'agy', model: 'm1' });
  });
  it("the gate's env for the check wins over the file; explicit flags win over both", () => {
    write(process.env.TOOLS_CONFIG!, 'gate/config.yaml', 'ai:\n  auditor:\n    backend: agy\n    model: m1\n');
    expect(resolvePair('auditor', {}, { GATE_AI_BACKEND: 'copilot', GATE_AI_MODEL: 'default' })).toEqual({ backend: 'copilot', model: 'default' });
    expect(resolvePair('auditor', { backend: 'claude', model: 'haiku' }, { GATE_AI_BACKEND: 'copilot' })).toEqual({ backend: 'claude', model: 'haiku' });
  });
});

describe('agent CLIs', () => {
  it('claude: read-only tools, no user plugins or MCP, model only when not default', () => {
    const a = agentArgs({ backend: 'claude', model: 'default', prompt: 'p', cwd: '/r', tools: 'read' });
    expect(a).toEqual(expect.arrayContaining(['--safe-mode', '--tools', 'Read', '--strict-mcp-config', '--output-format', 'json']));
    expect(a).not.toContain('--model');
    expect(agentArgs({ backend: 'claude', model: 'sonnet', prompt: 'p', cwd: '/r', tools: 'read-search' })).toEqual(
      expect.arrayContaining(['--tools', 'Read,Grep,Glob', '--model', 'sonnet']),
    );
  });
  it('copilot: view-only tools, no telemetry or custom instructions', () => {
    const a = agentArgs({ backend: 'copilot', model: 'default', prompt: 'p', cwd: '/r', tools: 'read' });
    expect(a).toEqual(expect.arrayContaining(['--available-tools=view', '--disable-client-telemetry', '--no-custom-instructions', '--add-dir', '/r']));
  });
  it('rejects an unknown backend', () => {
    expect(() => agentArgs({ backend: 'gpt', model: 'x', prompt: 'p', cwd: '/r', tools: 'read' })).toThrow(/unknown AI backend/);
  });
  it("reports the CLI's own error text on a failed run", () => {
    expect(failureText(JSON.stringify({ is_error: true, result: 'API Error: rate limited', usage: {} }), '')).toBe('API Error: rate limited');
    expect(failureText('', 'line 1\nNot logged in\n')).toBe('line 1 | Not logged in');
  });
  it('strips proxy variables from the agent env', () => {
    expect(agentEnv({ HTTPS_PROXY: 'http://127.0.0.1:9', https_proxy: 'x', PATH: '/bin' })).toEqual({ PATH: '/bin' });
  });

  it('parses claude JSON: input counts fresh, cache-write and cache-read tokens', () => {
    const out = JSON.stringify({ result: 'hi', is_error: false, usage: { input_tokens: 4, cache_creation_input_tokens: 10, cache_read_input_tokens: 100, output_tokens: 7 } });
    expect(parseClaude(out)).toEqual({ text: 'hi', tokens: { input: 114, output: 7 } });
    expect(() => parseClaude(JSON.stringify({ result: 'Not logged in', is_error: true }))).toThrow();
  });

  it('parses agy JSON: thinking tokens count as output', () => {
    const out = JSON.stringify({ status: 'SUCCESS', response: 'hi', usage: { input_tokens: 50, output_tokens: 5, thinking_tokens: 20 } });
    expect(parseAgy(out)).toEqual({ text: 'hi', tokens: { input: 50, output: 25 } });
    expect(() => parseAgy(JSON.stringify({ status: 'ERROR' }))).toThrow();
  });

  it('parses copilot JSONL and sums tokens from the session file', () => {
    const home = mkdtempSync(join(tmpdir(), 'copilot-'));
    mkdirSync(join(home, 'session-state', 's1'), { recursive: true });
    const rec = (i: number, o: number) => JSON.stringify({ type: 'session.usage_record', data: { usage: { inputTokens: i, outputTokens: o } } });
    writeFileSync(join(home, 'session-state', 's1', 'events.jsonl'), [rec(100, 3), rec(200, 4), '{"type":"other"}'].join('\n'));
    const jsonl = [
      { type: 'session.start', data: { sessionId: 's1' } },
      { type: 'assistant.message', data: { content: '' } },
      { type: 'assistant.message', data: { content: '{"score":1}' } },
      { type: 'result', sessionId: 's1', exitCode: 0 },
    ].map((e) => JSON.stringify(e)).join('\n');
    expect(parseCopilot(jsonl, home)).toEqual({ text: '{"score":1}', tokens: { input: 300, output: 7 } });
    const failed = [{ type: 'session.error', data: { message: 'Model "x" is not available.' } }, { type: 'result', sessionId: 's1', exitCode: 1 }]
      .map((e) => JSON.stringify(e)).join('\n');
    expect(() => parseCopilot(failed, home)).toThrow(/not available/);
  });
});
