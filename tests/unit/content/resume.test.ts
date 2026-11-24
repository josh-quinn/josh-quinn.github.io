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

  it('uses the placeholder LinkedIn handle while meta.placeholder is true', () => {
    const li = resume.basics.profiles.find((x: { network: string }) => x.network === 'LinkedIn');
    expect(resume.meta.placeholder).toBe(true);
    expect(li.username).toBe('example');
    expect(li.url).toBe('https://www.linkedin.com/in/example');
  });

  it('marks every organisation, institution, issuer and awarder as Example or Sample', () => {
    const fields = ['name', 'organization', 'institution', 'issuer', 'awarder'];
    const orgs: string[] = [];
    for (const s of ['work', 'volunteer', 'education', 'certificates', 'awards']) {
      for (const e of resume[s] ?? []) {
        const f = s === 'work' ? 'name' : s === 'volunteer' ? 'organization' : s === 'education' ? 'institution' : s === 'certificates' ? 'issuer' : 'awarder';
        if (e[f]) orgs.push(e[f]);
      }
    }
    expect(fields.length).toBeGreaterThan(0);
    expect(orgs.length).toBeGreaterThan(0);
    for (const o of orgs) expect(o).toMatch(/\b(Example|Sample)\b/);
  });

  it('marks skills and interests as sample content', () => {
    for (const s of [...(resume.skills ?? []), ...(resume.interests ?? [])]) {
      expect(JSON.stringify(s)).toMatch(/\b(Example|Sample)\b/);
      for (const k of s.keywords ?? []) expect(k).toMatch(/\b(Example|Sample)\b/);
    }
  });

  it('does not echo ocean, diving, sailing, telecom or postgraduate-degree themes', () => {
    expect(JSON.stringify(resume)).not.toMatch(/dive|diving|diver|sail|yacht|telecom|marine|\bMSc\b|skipper/i);
  });

  it.each(VIEWS)('has at least 3 entries in the %s view', (view) => {
    expect(entries.filter((e) => e.views?.includes(view)).length).toBeGreaterThanOrEqual(3);
  });
});
