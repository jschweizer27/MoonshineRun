#!/usr/bin/env node
// Zero-dependency local web server for playing and developing SHINE.
//   node scripts/serve.mjs [--open] [--port 8080] [--dir .]
// With --open it launches your default browser. If the port is busy it tries the next one.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const dir = path.resolve(root, opt('dir', '.'));
const explicitPort = opt('port', process.env.PORT);
let port = Number(explicitPort || 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  const file = path.normalize(path.join(dir, urlPath));
  if (file !== dir && !file.startsWith(dir + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && !explicitPort && port < 8100) {
    port += 1;
    server.listen(port);
    return;
  }
  console.error(`Could not start the server: ${err.message}`);
  process.exit(1);
});

server.on('listening', () => {
  const url = `http://localhost:${port}/`;
  console.log(`\n  SHINE is running at ${url}\n  (Leave this window open while you play. Press Ctrl+C to stop.)\n`);
  if (flag('open')) openBrowser(url);
});

server.listen(port);

function openBrowser(url) {
  const [cmd, cmdArgs] =
    process.platform === 'darwin' ? ['open', [url]] :
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] :
    ['xdg-open', [url]];
  try {
    spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  } catch {
    // No browser launcher available; the URL is printed above.
  }
}
