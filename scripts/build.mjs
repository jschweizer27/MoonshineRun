#!/usr/bin/env node
// Production build into dist/:
//   dist/index.html + dist/assets/*   the website (GitHub Pages), minified and cache-busted
//   dist/Shine.html                   everything in ONE file: double-click to play offline
// The unbundled source still runs directly (npm start) with no build step.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = path.join(root, 'dist');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 10);
const buildId = (process.env.SHINE_BUILD_ID || `local-${Date.now().toString(36)}`).slice(0, 12);

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });

const result = await esbuild.build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  format: 'esm',
  minify: true,
  target: ['es2020'],
  write: false,
  legalComments: 'eof',
  alias: { three: path.join(root, 'vendor/three/three.module.min.js') },
  define: { __SHINE_BUILD__: JSON.stringify(buildId) },
  logLevel: 'warning',
});
const js = result.outputFiles[0].text;
const css = read('styles.css');
const jsName = `assets/shine.${hash(js)}.js`;
const cssName = `assets/shine.${hash(css)}.css`;
fs.writeFileSync(path.join(dist, jsName), js);
fs.writeFileSync(path.join(dist, cssName), css);

const source = read('index.html');
const marker = /<!-- build:js[^>]*-->[\s\S]*?<!-- endbuild -->/;
if (!marker.test(source)) throw new Error('index.html is missing the <!-- build:js --> markers');

// Website build.
const web = source
  .replace(marker, `<script type="module" src="./${jsName}"></script>`)
  .replace('href="./styles.css"', `href="./${cssName}"`);
fs.writeFileSync(path.join(dist, 'index.html'), web);

// Static files the website needs (added over time; copied if present).
for (const f of ['favicon.svg', 'manifest.webmanifest', 'icons', 'assets']) {
  const from = path.join(root, f);
  if (fs.existsSync(from)) fs.cpSync(from, path.join(dist, f), { recursive: true });
}
// Service worker: stamp the build id so each deploy refreshes the offline cache.
if (fs.existsSync(path.join(root, 'sw.js'))) {
  const assets = ['./', './index.html', `./${jsName}`, `./${cssName}`, './manifest.webmanifest', './favicon.svg'];
  fs.writeFileSync(path.join(dist, 'sw.js'), read('sw.js')
    .replace('__SHINE_BUILD__', buildId)
    .replace("['./']", JSON.stringify(assets)));
}

// Single-file offline build: inline CSS + JS, drop links that need a web server.
const favicon = fs.existsSync(path.join(root, 'favicon.svg'))
  ? `data:image/svg+xml;base64,${Buffer.from(read('favicon.svg')).toString('base64')}` : '';
const single = source
  .replace(marker, () => `<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>`)
  .replace('<link rel="stylesheet" href="./styles.css" />', () => `<style>${css}</style>`)
  .replace(/<link rel="manifest"[^>]*>\s*/g, '')
  .replace(/<link rel="apple-touch-icon"[^>]*>\s*/g, '')
  .replace(/href="\.\/favicon\.svg"/g, () => `href="${favicon}"`);
fs.writeFileSync(path.join(dist, 'Shine.html'), single);

const kb = (f) => `${(fs.statSync(path.join(dist, f)).size / 1024).toFixed(0)} KB`;
console.log(`Built ${buildId}:
  dist/index.html + ${jsName} (${kb(jsName)})
  dist/Shine.html (${kb('Shine.html')}, single file, works offline)`);
