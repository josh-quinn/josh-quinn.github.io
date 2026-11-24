import { existsSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const distDir = join(process.cwd(), 'dist');

/** Every built .html file under dir (absolute paths); empty when dir does not exist. */
export function htmlFiles(dir = distDir): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? htmlFiles(join(dir, e.name)) : e.name.endsWith('.html') ? [join(dir, e.name)] : [],
  );
}

/** The URL path a built file is served at: dist/index.html -> /, dist/a/index.html -> /a/, dist/404.html -> /404.html. */
export function urlPathOf(file: string, dir = distDir): string {
  const rel = relative(dir, file).split(sep).join('/');
  return '/' + (rel === 'index.html' || rel.endsWith('/index.html') ? rel.slice(0, -'index.html'.length) : rel);
}
