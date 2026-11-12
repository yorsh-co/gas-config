/**
 * Development server: serves the repository root read-only on 127.0.0.1 so the
 * harness can load the real UI sources. Browser TypeScript under `src/` is
 * transpiled on request, exactly as `gasdev html` does, so a `.js`
 * reference resolves to its `.ts` source. Not part of the product.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env['PORT'] ?? 5173);
const HOST = '127.0.0.1';
const INDEX = '/dev/index.html';

const TRANSPILE_OPTIONS = {
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.None,
};

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Maps a request path to a file under the root.
 *
 * @param {string} pathname Decoded URL path.
 * @returns {string | null} Absolute path, or null when it leaves the root or
 *   names a hidden entry such as `.git`.
 */
function resolveInRoot(pathname) {
  const file = resolve(ROOT, '.' + pathname);
  if (file !== ROOT && !file.startsWith(ROOT + sep)) return null;
  const relative = file.slice(ROOT.length);
  if (relative.split(sep).some((part) => part.startsWith('.'))) return null;
  return file;
}

/**
 * @param {string} file Absolute path of a requested file.
 * @returns {{ body: Buffer | string, type: string } | null} The response
 *   body, or null when nothing serves this path.
 */
function load(file) {
  const type = CONTENT_TYPES[extname(file)] ?? 'application/octet-stream';
  if (existsSync(file) && statSync(file).isFile()) {
    return { body: readFileSync(file), type };
  }

  const source = file.replace(/\.js$/, '.ts');
  const underSrc = file.startsWith(resolve(ROOT, 'src') + sep);
  if (underSrc && source !== file && existsSync(source)) {
    const { outputText } = ts.transpileModule(readFileSync(source, 'utf8'), {
      compilerOptions: TRANSPILE_OPTIONS,
      fileName: source,
    });
    return { body: outputText, type };
  }
  return null;
}

const server = createServer((request, response) => {
  const send = (status, body, headers = {}) => {
    response.writeHead(status, {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
      ...headers,
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    send(405, 'Method not allowed', {
      Allow: 'GET, HEAD',
      'Content-Type': 'text/plain',
    });
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(
      new URL(request.url ?? '/', `http://${HOST}`).pathname,
    );
  } catch {
    send(400, 'Bad request', { 'Content-Type': 'text/plain' });
    return;
  }

  if (pathname === '/') {
    send(302, '', { Location: INDEX });
    return;
  }

  const file = resolveInRoot(pathname);
  if (file === null) {
    send(403, 'Forbidden', { 'Content-Type': 'text/plain' });
    return;
  }

  try {
    const found = load(file);
    if (found) send(200, found.body, { 'Content-Type': found.type });
    else send(404, 'Not found', { 'Content-Type': 'text/plain' });
  } catch (error) {
    console.error(error);
    send(500, 'Server error', { 'Content-Type': 'text/plain' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Dev server: http://${HOST}:${PORT}/`);
});
