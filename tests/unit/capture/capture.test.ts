import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { capture, redact } from '../../../tools/capture/capture';

const KEYS = ['TOOLS_CONFIG', 'JQ_TOOLS_CONFIG', 'XDG_STATE_HOME', 'JQ_CAPTURE_ACTIVE'] as const;
let saved: Record<string, string | undefined>;
let tmp: string;
let journal: string;
let transcript: string;
let envLog: string;

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Fake PII built at runtime so no literal lands in the repo. */
const fakeEmail = () => ['someone', 'example.org'].join('@');
const fakeToken = () => 'ghp_' + 'a1B2'.repeat(6);

function writeStub(body: string, sleep = 0) {
  const stub = join(tmp, 'stub-backend');
  writeFileSync(
    stub,
    `#!/bin/sh\ncat >/dev/null\n${sleep ? `sleep ${sleep}\n` : ''}echo "$JQ_CAPTURE_ACTIVE" > "${envLog}"\ncat <<'EOF2'\n${body}\nEOF2\n`,
  );
  chmodSync(stub, 0o755);
  return stub;
}

function configure(backend: string) {
  const dir = join(tmp, 'config', 'capture');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'config.yaml'), `journal_dir: ${journal}\nbackend: ${backend}\n`);
}

const ENTRY = `## Decisions
- Use a thin hook.

## Learnings / gotchas (article leads)
- **Recursion guard** needed.

## Open threads
- None.`;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  tmp = mkdtempSync(join(tmpdir(), 'capture-'));
  journal = join(tmp, 'journal');
  envLog = join(tmp, 'env.log');
  delete process.env.JQ_CAPTURE_ACTIVE;
  delete process.env.JQ_TOOLS_CONFIG;
  process.env.TOOLS_CONFIG = join(tmp, 'config');
  process.env.XDG_STATE_HOME = join(tmp, 'state');
  transcript = join(tmp, 'abcd1234-0000-0000-0000-000000000000.jsonl');
  writeFileSync(
    transcript,
    [
      { type: 'user', message: { role: 'user', content: 'Plan the capture hook' } },
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Use a thin script.' }] } },
    ]
      .map((o) => JSON.stringify(o))
      .join('\n') + '\n',
  );
});
afterEach(() => {
  for (const k of KEYS) saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]);
  rmSync(tmp, { recursive: true, force: true });
});

const run = (extra: Partial<Parameters<typeof capture>[0]> = {}) =>
  capture({ transcriptPath: transcript, event: 'SessionEnd', agent: 'claude', ...extra });

describe('capture', () => {
  it('skips with reason nested when JQ_CAPTURE_ACTIVE=1 (recursion guard)', async () => {
    process.env.JQ_CAPTURE_ACTIVE = '1';
    expect(await run()).toEqual({ status: 'skipped', reason: 'nested' });
  });

  it('skips with reason no-transcript when the file is missing', async () => {
    expect(await run({ transcriptPath: join(tmp, 'nope.jsonl') })).toEqual({ status: 'skipped', reason: 'no-transcript' });
  });

  it('writes <journal_dir>/<date>-<session>.md with the hand-written entry headings', async () => {
    configure(writeStub(ENTRY));
    const res = await run();
    expect(res.status).toBe('written');
    expect(res.file).toBe(join(journal, `${today()}-abcd1234.md`));
    const text = readFileSync(res.file!, 'utf8');
    expect(text).toMatch(/^---\ndate: /);
    for (const h of ['## Decisions', '## Learnings / gotchas (article leads)', '## Open threads']) expect(text).toContain(h);
    // the backend ran with the recursion guard set
    expect(readFileSync(envLog, 'utf8').trim()).toBe('1');
  });

  it('skips the same transcript at the same byte offset the second time (seen)', async () => {
    configure(writeStub(ENTRY));
    expect((await run()).status).toBe('written');
    expect(await run()).toEqual({ status: 'skipped', reason: 'seen' });
    expect(existsSync(join(tmp, 'state', 'jq-tools', 'capture'))).toBe(true);
    expect(readdirSync(journal)).toHaveLength(1);
  });

  it('captures again after the transcript grows, appending to the same file', async () => {
    configure(writeStub(ENTRY));
    const first = await run();
    writeFileSync(transcript, JSON.stringify({ type: 'user', message: { content: 'more' } }) + '\n', { flag: 'a' });
    const second = await run({ event: 'PreCompact' });
    expect(second.file).toBe(first.file);
    expect(readFileSync(first.file!, 'utf8')).toContain('## Update (PreCompact');
  });

  it('does not record a seen mark when the backend fails', async () => {
    configure('/nonexistent/backend');
    expect(await run()).toEqual({ status: 'skipped', reason: 'backend-failed' });
    configure(writeStub(ENTRY));
    expect((await run()).status).toBe('written');
  });

  it('reads a Copilot events.jsonl transcript', async () => {
    configure(writeStub(ENTRY));
    const dir = join(tmp, 'ffff0000-1111-2222-3333-444444444444');
    mkdirSync(dir);
    const events = join(dir, 'events.jsonl');
    writeFileSync(events, JSON.stringify({ type: 'user.message', data: { content: 'hi' } }) + '\n');
    const res = await run({ transcriptPath: events, agent: 'copilot' });
    expect(res.file).toBe(join(journal, `${today()}-ffff0000.md`));
  });

  it('redacts secrets, emails and phone numbers from the backend output before writing', async () => {
    const phone = ['+353', '85', '123', '4567'].join(' ');
    configure(writeStub(`${ENTRY}\n- leaked ${fakeEmail()} ${fakeToken()} ${phone}`));
    const res = await run();
    const text = readFileSync(res.file!, 'utf8');
    expect(text).not.toContain(fakeEmail());
    expect(text).not.toContain(fakeToken());
    expect(text).not.toContain(phone);
    expect(text).toContain(`${today()}`); // dates are not mistaken for phone numbers
  });
});

describe('redact', () => {
  it('leaves dates and ordinary text alone', () => {
    expect(redact('on 2026-11-22 we decided')).toBe('on 2026-11-22 we decided');
  });
});

describe('hook wrapper', () => {
  it('returns in under 1s because the backend call is detached', () => {
    configure(writeStub(ENTRY, 3));
    const t0 = Date.now();
    const r = spawnSync(process.execPath, ['--import', 'tsx', 'tools/capture/capture.ts', '--event', 'SessionEnd'], {
      input: JSON.stringify({ transcript_path: transcript, session_id: 'x', hook_event_name: 'SessionEnd' }),
      env: process.env,
      encoding: 'utf8',
    });
    expect(r.status).toBe(0);
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(existsSync(journal)).toBe(false); // the backend is still running
  });
});
