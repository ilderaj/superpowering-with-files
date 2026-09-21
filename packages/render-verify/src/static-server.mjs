import { createServer } from 'node:http';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.jpg', 'image/jpeg'],
]);

function inside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function validateRoot(input) {
  const root = path.resolve(input);
  const info = await lstat(root);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('static root must be a real directory');
  return { root, rootReal: await realpath(root) };
}

async function rejectSymlinkPath(root, candidate) {
  const relative = path.relative(root, candidate);
  let current = root;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let info;
    try { info = await lstat(current); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    if (info.isSymbolicLink()) throw Object.assign(new Error('symlink paths are not served'), { code: 'ERR_SYMLINK_PATH' });
  }
}

export async function startStaticServer(rootInput, { host = '127.0.0.1', port = 0 } = {}) {
  const { root, rootReal } = await validateRoot(rootInput);
  const server = createServer(async (request, response) => {
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405); response.end(); return; }
      const requestTarget = request.url ?? '/';
      const rawPathOnly = requestTarget.split('?')[0];
      if (/(?:^|\/)\.\.(?:\/|$)/.test(rawPathOnly) || /(?:^|\/)%2e%2e(?:\/|$)/i.test(rawPathOnly)) { response.writeHead(403); response.end('forbidden'); return; }
      const rawPath = new URL(requestTarget, `http://${host}`).pathname;
      let decoded;
      try { decoded = decodeURIComponent(rawPath); } catch { response.writeHead(400); response.end('invalid path'); return; }
      if (decoded.includes('\0') || decoded.includes('\\')) { response.writeHead(403); response.end('forbidden'); return; }
      const parts = decoded.split('/').filter(Boolean);
      if (parts.some((part) => part === '..')) { response.writeHead(403); response.end('forbidden'); return; }
      let candidate = path.resolve(root, `.${decoded}`);
      if (!inside(root, candidate)) { response.writeHead(403); response.end('forbidden'); return; }
      await rejectSymlinkPath(root, candidate);
      let info = await lstat(candidate);
      if (info.isDirectory()) { candidate = path.join(candidate, 'index.html'); await rejectSymlinkPath(root, candidate); info = await lstat(candidate); }
      if (!info.isFile() || info.isSymbolicLink()) { response.writeHead(404); response.end('not found'); return; }
      const candidateReal = await realpath(candidate);
      if (!inside(rootReal, candidateReal)) { response.writeHead(403); response.end('forbidden'); return; }
      const body = await readFile(candidate);
      response.writeHead(200, { 'content-type': MIME.get(path.extname(candidate).toLowerCase()) ?? 'application/octet-stream', 'cache-control': 'no-store' });
      if (request.method === 'HEAD') response.end(); else response.end(body);
    } catch (error) {
      if (error.code === 'ERR_SYMLINK_PATH' || error.code === 'EACCES') { response.writeHead(403); response.end('forbidden'); return; }
      if (error.code === 'ENOENT') { response.writeHead(404); response.end('not found'); return; }
      response.writeHead(500); response.end('static server error');
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  const address = server.address();
  const url = `http://${host}:${address.port}`;
  return { root, rootReal, url, server, close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}
