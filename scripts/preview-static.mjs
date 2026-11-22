import {createServer} from 'node:http';
import {existsSync, readFileSync, statSync} from 'node:fs';
import {extname, resolve, dirname, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {headersForPath} from '../src/lib/static-headers.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.asc': 'text/plain; charset=utf-8',
  '.dbc': 'text/plain; charset=utf-8',
};

function safeFile(publicRoot, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const rel = decoded === '/' ? '/index.html' : decoded;
  const candidates = [rel];
  if (!extname(rel)) {
    const trimmed = rel.endsWith('/') ? rel.slice(0, -1) : rel;
    candidates.push(`${trimmed}.html`, `${trimmed}/index.html`);
  }
  const rootWithSep = publicRoot.endsWith(sep) ? publicRoot : publicRoot + sep;
  for (const candidate of candidates) {
    const file = resolve(publicRoot, candidate.replace(/^\/+/, ''));
    if (file !== publicRoot && !file.startsWith(rootWithSep)) continue;
    if (existsSync(file) && statSync(file).isFile()) return file;
  }
  return null;
}

function send(response, status, pathname, body, contentType) {
  const headers = {...headersForPath(pathname), 'Content-Type': contentType};
  response.writeHead(status, headers);
  response.end(body);
}

async function handle(request, response, options) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    send(response, 405, '/', '', 'text/plain; charset=utf-8');
    return;
  }
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  if (pathname === '/version.json') {
    if (options.manifest === 'missing') {
      send(response, 404, pathname, '', 'application/json; charset=utf-8');
      return;
    }
    const body = options.manifest && typeof options.manifest === 'object'
      ? JSON.stringify(options.manifest)
      : readFileSync(resolve(options.publicRoot, 'version.json'));
    send(response, 200, pathname, request.method === 'HEAD' ? '' : body, 'application/json; charset=utf-8');
    return;
  }
  const file = safeFile(options.publicRoot, pathname);
  if (!file) {
    send(response, 404, pathname, '', 'text/plain; charset=utf-8');
    return;
  }
  const body = request.method === 'HEAD' ? '' : readFileSync(file);
  send(response, 200, pathname, body, TYPES[extname(file).toLowerCase()] || 'application/octet-stream');
}

export function startPreview(options = {}) {
  const publicRoot = options.publicRoot || resolve(root, 'public');
  const host = options.host || '127.0.0.1';
  const manifest = Object.prototype.hasOwnProperty.call(options, 'manifest') ? options.manifest : 'file';
  const server = createServer((request, response) => {
    handle(request, response, {publicRoot, manifest}).catch(() => {
      if (!response.headersSent) send(response, 500, '/', '', 'text/plain; charset=utf-8');
      else response.end();
    });
  });
  return new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(options.port ?? 0, host, () => {
      const {port} = server.address();
      resolveListen({
        url: `http://${host}:${port}`,
        port,
        close() {
          return new Promise((resolveClose, rejectClose) => {
            server.close((error) => error ? rejectClose(error) : resolveClose());
          });
        },
      });
    });
  });
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  const preview = await startPreview({port: Number(process.env.PORT || 4173)});
  console.log(preview.url);
}
