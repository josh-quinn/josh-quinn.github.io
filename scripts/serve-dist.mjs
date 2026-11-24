/**
 * Minimal static server for the built site (dist/), with no dependencies, so it runs
 * the same on macOS and in the Linux Playwright container (where the host's
 * node_modules native binaries would not load).
 *
 *   node scripts/serve-dist.mjs [port]     default port 4322
 *
 * Also importable: `startServer(dir, port)` resolves to `{ url, close }` (port 0 = any free port).
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.ico': 'image/x-icon',
};

/** The file a URL path maps to inside root (directories serve index.html), or null. */
function fileFor(root, urlPath) {
  let p;
  try {
    p = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }
  const full = normalize(join(root, p));
  if (full !== root && !full.startsWith(root + sep)) return null;
  if (existsSync(full) && statSync(full).isDirectory()) return existsSync(join(full, 'index.html')) ? join(full, 'index.html') : null;
  return existsSync(full) ? full : null;
}

export function startServer(dir = 'dist', port = 0) {
  const root = resolve(dir);
  const server = createServer((req, res) => {
    const file = fileFor(root, req.url ?? '/');
    if (!file) {
      const notFound = join(root, '404.html');
      res.writeHead(404, { 'content-type': TYPES['.html'] });
      if (existsSync(notFound)) createReadStream(notFound).pipe(res);
      else res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      ok({ url: `http://127.0.0.1:${addr.port}`, close: () => new Promise((done) => server.close(() => done())) });
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.argv[2] ?? 4322);
  startServer('dist', port).then(({ url }) => console.log(`serving dist/ at ${url}`));
}
