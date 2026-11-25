import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const config = join(process.cwd(), '.gitleaks.toml');

// Fake PII is assembled at runtime so no literal ever lands in the repo.
const fakeEmail = ['someone', 'example.com'].join('@');
const fakePhone = ['+353', '87', '000', '0000'].join(' ');
const fakeDob = ['4', 'March', '1990'].join(' ');

function scan(content: string): { status: number | null; rules: string[] } {
  const dir = mkdtempSync(join(tmpdir(), 'gitleaks-'));
  const report = join(dir, 'report.json');
  writeFileSync(join(dir, 'scratch.txt'), content);
  const r = spawnSync(
    'gitleaks',
    ['dir', dir, '--config', config, '--no-banner', '--redact', '--report-format', 'json', '--report-path', report, '--exit-code', '1'],
    { encoding: 'utf8' },
  );
  if (r.error) throw r.error; // gitleaks must be installed
  const findings = JSON.parse(readFileSync(report, 'utf8') || '[]') as { RuleID: string }[];
  return { status: r.status, rules: [...new Set(findings.map((f) => f.RuleID))].sort() };
}

describe('.gitleaks.toml', () => {
  it('flags a fake email, phone and DOB with their rule IDs', () => {
    const { status, rules } = scan(`email ${fakeEmail}\nphone ${fakePhone}\nborn ${fakeDob}\n`);
    expect(status).not.toBe(0);
    expect(rules).toEqual(['pii-dob', 'pii-email', 'pii-phone']);
  });

  it('does not flag date-shaped text, versions or non-personal addresses', () => {
    const ok = [
      'released 2026-11-22, built 2026-11, active 2019 - 2023 and 2019-2023',
      'created 2026-08-03, latest 2026-10-24 (5 stars)',
      'version 1.22.333 and pkg@1.2.3',
      ['git', 'github.com'].join('@') + ':owner/repo.git',
      ['12345+name', 'users.noreply.github.com'].join('@'),
      ['noreply', 'anthropic.com'].join('@'),
    ].join('\n');
    const { status, rules } = scan(ok);
    expect({ status, rules }).toEqual({ status: 0, rules: [] });
  });

  it('still flags a phone after a date, or after a year range', () => {
    const local = ['087', '123', '4567'].join(' ');
    expect(scan(`updated 2026-11-22 ${local}`).rules).toContain('pii-phone');
    expect(scan(`worked 2019 - 2023 ${local}`).rules).toContain('pii-phone');
    expect(scan(`${local} 2026-11-22`).rules).toContain('pii-phone');
  });

  it('does not flag digit groups inside canonical UUIDs, but still flags a phone next to one', () => {
    const uuids = [
      ['abcd1234', '0000', '0000', '0000', '0'.repeat(12)].join('-'),
      ['ffff0000', '1111', '2222', '3333', '4'.repeat(12)].join('-'),
      ['12345678', '1234', '5678', '9012', 'a1b2c3d4e5f6'].join('-'),
    ];
    // One per scan: the phone pattern's whitespace class can join two all-digit UUIDs on adjacent lines.
    for (const u of uuids) expect(scan(u)).toEqual({ status: 0, rules: [] });
    const local = ['087', '123', '4567'].join(' ');
    const uuid = ['abcd1234', '0000', '0000', '0000', '0'.repeat(12)].join('-');
    expect(scan(`${uuid} ${local}`).rules).toContain('pii-phone');
    expect(scan(`${local} ${uuid}`).rules).toContain('pii-phone');
  });

  it('flags lookalike addresses that only contain an allowlisted one', () => {
    const lookalikes = [
      ['legit', 'github.com'].join('@'),
      ['x.git', 'github.com'].join('@'),
      ['git', 'github.com.evil.org'].join('@'),
      ['mynoreply', 'anthropic.com'].join('@'),
      ['someone', '1.2.example.org'].join('@'),
    ];
    for (const addr of lookalikes) {
      expect(scan(`contact ${addr}\n`).rules, 'lookalike should be flagged').toContain('pii-email');
    }
  });
});
