import { mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { captureReferences, referenceFile } from '../../../scripts/reference-screens';

const URL_ = 'https://reference.example/';
const WIDTHS: [390, 1280] = [390, 1280];
const HOUR = 3_600_000;

function cacheDir(ageHours?: number): string {
  const dir = mkdtempSync(join(tmpdir(), 'refs-'));
  if (ageHours !== undefined) {
    mkdirSync(dir, { recursive: true });
    const when = new Date(Date.now() - ageHours * HOUR);
    for (const w of WIDTHS) {
      const f = referenceFile(dir, URL_, w);
      writeFileSync(f, 'png');
      utimesSync(f, when, when);
    }
  }
  return dir;
}

const failingFetch = vi.fn(async () => {
  throw new TypeError('fetch failed: getaddrinfo ENOTFOUND');
}) as unknown as typeof fetch;

describe('captureReferences', () => {
  it('uses the cache and notes "unreachable" when the site cannot be fetched', async () => {
    const dir = cacheDir(48);
    const shoot = vi.fn();
    const r = await captureReferences({ urls: [URL_], widths: WIDTHS, maxAgeHours: 24 }, { dir, fetch: failingFetch, shoot });
    expect(r.fromCache).toBe(true);
    expect(r.note).toMatch(/unreachable/);
    expect(r.files).toEqual(WIDTHS.map((w) => referenceFile(dir, URL_, w)));
    expect(shoot).not.toHaveBeenCalled();
  });

  it('a non-2xx response also counts as unreachable', async () => {
    const dir = cacheDir(48);
    const fetch503 = (async () => new Response('down', { status: 503 })) as unknown as typeof fetch;
    const r = await captureReferences({ urls: [URL_], widths: WIDTHS, maxAgeHours: 24 }, { dir, fetch: fetch503, shoot: vi.fn() });
    expect(r).toMatchObject({ fromCache: true, note: expect.stringMatching(/unreachable.*503/) });
  });

  it('does not fetch at all while the cache is younger than maxAgeHours', async () => {
    const dir = cacheDir(2);
    const fetchSpy = vi.fn() as unknown as typeof fetch;
    const r = await captureReferences({ urls: [URL_], widths: WIDTHS, maxAgeHours: 24 }, { dir, fetch: fetchSpy, shoot: vi.fn() });
    expect(r.fromCache).toBe(true);
    expect(r.note).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('captures fresh screenshots at each width when the cache is stale and the site is up', async () => {
    const dir = cacheDir(48);
    const ok = (async () => new Response('<html></html>', { status: 200 })) as unknown as typeof fetch;
    const shoot = vi.fn(async (_url: string, _width: number, file: string) => writeFileSync(file, 'new'));
    const r = await captureReferences({ urls: [URL_], widths: WIDTHS, maxAgeHours: 24 }, { dir, fetch: ok, shoot });
    expect(r.fromCache).toBe(false);
    expect(shoot.mock.calls.map((c) => c[1])).toEqual([390, 1280]);
    expect(readFileSync(r.files[0], 'utf8')).toBe('new');
  });

  it('fails when the site is unreachable and there is no cached copy', async () => {
    const dir = cacheDir();
    await expect(
      captureReferences({ urls: [URL_], widths: WIDTHS, maxAgeHours: 24 }, { dir, fetch: failingFetch, shoot: vi.fn() }),
    ).rejects.toThrow(/unreachable.*no cached/);
  });
});
