// Loopback-only static server for the PharmaLedger synthetic workbench.
// Serves app/, src/ and fixtures/ from this checkout. No network fetches, no proxying,
// no uploads: every request is answered from local files on 127.0.0.1 only.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep, extname } from 'node:path';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ALLOWED_PREFIXES = ['app', 'src', 'fixtures'].map((d) => resolve(ROOT, d) + sep);
const HOST = '127.0.0.1';
const PORT = Number.parseInt(process.env.PORT ?? '8787', 10);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};
const HEADERS = {
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { ...HEADERS, 'Content-Type': type, 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, `http://${HOST}`).pathname);
  } catch {
    return send(res, 400, 'bad request');
  }
  if (pathname === '/' || pathname === '/app' || pathname === '/app/') pathname = '/app/index.html';
  if (pathname.includes('\0')) return send(res, 400, 'bad request');
  const filePath = resolve(ROOT, `.${pathname}`);
  if (!ALLOWED_PREFIXES.some((p) => filePath.startsWith(p))) return send(res, 404, 'not found');
  const type = TYPES[extname(filePath)];
  if (!type) return send(res, 404, 'not found');
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return send(res, 404, 'not found');
    const body = await readFile(filePath);
    res.writeHead(200, { ...HEADERS, 'Content-Type': type, 'Content-Length': body.length });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    send(res, 404, 'not found');
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`PharmaLedger synthetic workbench: http://${HOST}:${PORT}/ (loopback only, Ctrl+C to stop)\n`);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
