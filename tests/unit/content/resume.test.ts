import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';
import { assertNoPrivateData, PRIVATE_PATTERNS } from '../../privacy/patterns';

const root = process.cwd();
const load = (f: string) => JSON.parse(readFileSync(join(root, 'src/content', f), 'utf8'));
const resume = load('resume.json');
const schema = load('resume.schema.json');

const SECTIONS = ['work', 'education', 'certificates', 'awards', 'volunteer', 'projects', 'interests'];
const VIEWS = ['engineering', 'ocean', 'life'];
const entries: Array<{ views?: string[] }> = SECTIONS.flatMap((s) => resume[s] ?? []);

function keysDeep(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => keysDeep(x, out));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      out.push(k);
      keysDeep(x, out);
    }
  }
  return out;
}

describe('resume.json', () => {
  it('validates against resume.schema.json', () => {
    const validate = new Ajv({ allErrors: true }).compile(schema);
    const ok = validate(resume);
    expect(validate.errors ?? []).toEqual([]);
    expect(ok).toBe(true);
  });

  it('gives every entry a non-empty views list', () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      expect(Array.isArray(e.views) && e.views.length > 0).toBe(true);
      for (const v of e.views ?? []) expect(VIEWS).toContain(v);
    }
  });

  it('contains no private data patterns', () => {
    expect(() => assertNoPrivateData(JSON.stringify(resume), PRIVATE_PATTERNS)).not.toThrow();
  });

  it('keeps location to country level and has no phone, email or address', () => {
    expect(resume.basics.location.countryCode).toBe('IE');
    expect(Object.keys(resume.basics.location).sort()).toEqual(['countryCode', 'region']);
    const keys = keysDeep(resume).map((k) => k.toLowerCase());
    for (const banned of ['phone', 'email', 'address', 'postalcode', 'city']) {
      expect(keys).not.toContain(banned);
    }
  });

  it('has no date fields', () => {
    const keys = keysDeep(resume);
    for (const d of ['startDate', 'endDate', 'date', 'releaseDate']) expect(keys).not.toContain(d);
  });

  it('is marked as placeholder content', () => {
    expect(resume.meta.placeholder).toBe(true);
  });

  it('lists GitHub josh-quinn and a LinkedIn profile', () => {
    const p: Array<{ network: string; username: string }> = resume.basics.profiles;
    expect(p.some((x) => x.network === 'GitHub' && x.username === 'josh-quinn')).toBe(true);
    expect(p.some((x) => x.network === 'LinkedIn')).toBe(true);
  });

  it.each(VIEWS)('has at least 3 entries in the %s view', (view) => {
    expect(entries.filter((e) => e.views?.includes(view)).length).toBeGreaterThanOrEqual(3);
  });
});
