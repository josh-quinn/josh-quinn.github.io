import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Patterns for private data that must never appear in built pages.
 * Patterns only, never literal private values. Extra literal terms
 * (e.g. place names) come from the gitignored `.private/forbidden.txt`.
 */
export interface PrivatePattern {
  name: string;
  re: RegExp;
  /** Text matching `mask` is blanked out before `re` runs (removes known false positives). */
  mask?: RegExp;
}

// Date-shaped phone false positives: YYYY-MM-DD, YYYY-MM, and year ranges.
const DATE_SHAPED = /\b(?:\d{4}-\d{2}(?:-\d{2})?|\d{4}\s*-\s*\d{4})\b/g;

// Canonical UUIDs (e.g. session ids): their digit groups look like phone numbers.
export const UUID_SHAPED = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const PHONE_MASK = new RegExp(`${DATE_SHAPED.source}|${UUID_SHAPED.source}`, 'gi');

export const PRIVATE_PATTERNS: PrivatePattern[] = [
  { name: 'email', re: /[\w.+-]+@[\w-]+\.[\w.]+/ },
  { name: 'mailto', re: /mailto:/i },
  { name: 'phone', re: /\+?\d[\d\s().-]{8,}\d/, mask: PHONE_MASK },
  {
    name: 'date-of-birth',
    re: /\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+19\d{2}\b/i,
  },
  { name: 'passport', re: /passport/i },
  { name: 'eng1', re: /\bENG1\b/ },
];

export const FORBIDDEN_FILE = join(process.cwd(), '.private', 'forbidden.txt');

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Load literal terms from a forbidden-terms file: one per line, `#` comments
 * and blank lines ignored, matched case-insensitively as whole words.
 * Missing file means no extra patterns. Patterns are named by position only,
 * so a report never reveals the term.
 */
export function loadForbiddenTerms(file: string = FORBIDDEN_FILE): PrivatePattern[] {
  if (!existsSync(file)) return [];
  const terms = readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  return terms.map((t, i) => ({
    name: `forbidden.txt term #${i + 1}`,
    re: new RegExp(`(?<![\\w])${escapeRe(t)}(?![\\w])`, 'i'),
  }));
}

/** Names of the patterns that match `text` (never the matched values). */
export function findPrivateData(text: string, patterns: PrivatePattern[]): string[] {
  const hits: string[] = [];
  for (const { name, re, mask } of patterns) {
    if (re.test(mask ? text.replace(mask, '#') : text)) hits.push(name);
  }
  return hits;
}

/** Throws naming each matched pattern, never the matched value. */
export function assertNoPrivateData(
  html: string,
  patterns: PrivatePattern[] = [...PRIVATE_PATTERNS, ...loadForbiddenTerms()],
): void {
  const hits = findPrivateData(html, patterns);
  if (hits.length) {
    throw new Error(`Private data pattern(s) matched: ${hits.join(', ')}`);
  }
}
