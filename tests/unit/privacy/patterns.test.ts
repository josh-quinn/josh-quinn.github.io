import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertNoPrivateData, loadForbiddenTerms, PRIVATE_PATTERNS } from '../../privacy/patterns';

// Fake PII is assembled at runtime so no literal ever lands in the repo.
const fakeEmail = ['someone', 'example.com'].join('@');
const fakeDob = ['4', 'March', '1990'].join(' ');
const fakePhone = ['+353', '87', '000', '0000'].join(' ');

function throwsMessage(fn: () => void): string {
  try {
    fn();
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('expected to throw');
}

describe('assertNoPrivateData', () => {
  it('throws on mailto without leaking the value', () => {
    const addr = ['x', 'y.z'].join('@');
    const msg = throwsMessage(() => assertNoPrivateData(`<a href="mailto:${addr}">`, PRIVATE_PATTERNS));
    expect(msg).toContain('mailto');
    expect(msg).not.toContain(addr);
  });

  it('detects a fake email and a +353-style mobile, naming the pattern', () => {
    expect(throwsMessage(() => assertNoPrivateData(`<p>${fakeEmail}</p>`, PRIVATE_PATTERNS))).toContain('email');
    const msg = throwsMessage(() => assertNoPrivateData(`<p>${fakePhone}</p>`, PRIVATE_PATTERNS));
    expect(msg).toContain('phone');
    expect(msg).not.toContain(fakePhone);
  });

  it('does not flag ISO dates or year ranges as phones', () => {
    expect(() => assertNoPrivateData('<p>2026-11-22</p>', PRIVATE_PATTERNS)).not.toThrow();
    expect(() => assertNoPrivateData('<p>2026-11</p>', PRIVATE_PATTERNS)).not.toThrow();
    expect(() => assertNoPrivateData('<p>2019 - 2023</p>', PRIVATE_PATTERNS)).not.toThrow();
    expect(() => assertNoPrivateData('<p>2019-2023</p>', PRIVATE_PATTERNS)).not.toThrow();
    expect(() => assertNoPrivateData('<p>2026-10-24 (5 stars)</p>', PRIVATE_PATTERNS)).not.toThrow();
  });

  it('still detects a phone after a date or year range', () => {
    const local = ['087', '123', '4567'].join(' ');
    expect(() => assertNoPrivateData(`<p>updated 2026-11-22 ${local}</p>`, PRIVATE_PATTERNS)).toThrow(/phone/);
    expect(() => assertNoPrivateData(`<p>2019 - 2023 ${local}</p>`, PRIVATE_PATTERNS)).toThrow(/phone/);
  });

  it('does not flag digit groups inside a canonical UUID as a phone', () => {
    const uuid = ['abcd1234', '0000', '0000', '0000', '0'.repeat(12)].join('-');
    const uuid2 = ['ffff0000', '1111', '2222', '3333', '4'.repeat(12)].join('-');
    expect(() => assertNoPrivateData(`<p>${uuid} and ${uuid2}</p>`, PRIVATE_PATTERNS)).not.toThrow();
  });

  it('still detects a phone next to a UUID', () => {
    const uuid = ['abcd1234', '0000', '0000', '0000', '0'.repeat(12)].join('-');
    const local = ['087', '123', '4567'].join(' ');
    expect(() => assertNoPrivateData(`<p>${uuid} ${local}</p>`, PRIVATE_PATTERNS)).toThrow(/phone/);
    expect(() => assertNoPrivateData(`<p>${local} ${uuid}</p>`, PRIVATE_PATTERNS)).toThrow(/phone/);
  });

  it('detects DOB-like, passport and ENG1', () => {
    expect(() => assertNoPrivateData(`<p>${fakeDob}</p>`, PRIVATE_PATTERNS)).toThrow(/date-of-birth/);
    expect(() => assertNoPrivateData('<p>Passport</p>', PRIVATE_PATTERNS)).toThrow(/passport/);
    expect(() => assertNoPrivateData('<p>ENG1 certificate</p>', PRIVATE_PATTERNS)).toThrow(/eng1/);
  });
});

describe('loadForbiddenTerms', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'forbidden-'));

  it('returns no patterns when the file is missing', () => {
    expect(loadForbiddenTerms(join(tmp, 'nope.txt'))).toEqual([]);
  });

  it('loads terms, skips comments/blanks, matches whole words case-insensitively, names by index', () => {
    const file = join(tmp, 'forbidden.txt');
    writeFileSync(file, '# comment\n\nzorblax\n  Quux Town  \n');
    const patterns = loadForbiddenTerms(file);
    expect(patterns.map((p) => p.name)).toEqual(['forbidden.txt term #1', 'forbidden.txt term #2']);

    const msg = throwsMessage(() => assertNoPrivateData('<p>Lives near ZORBLAX.</p>', patterns));
    expect(msg).toContain('forbidden.txt term #1');
    expect(msg.toLowerCase()).not.toContain('zorblax');

    expect(() => assertNoPrivateData('<p>quux town</p>', patterns)).toThrow(/term #2/);
    expect(() => assertNoPrivateData('<p>zorblaxes</p>', patterns)).not.toThrow();
  });
});
