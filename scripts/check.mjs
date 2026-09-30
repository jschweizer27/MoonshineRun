#!/usr/bin/env node
// Fast pre-flight checks: every JS file parses, the vendored Three.js matches the
// version pinned in package.json, and the UE5 scaffold passes its static checks.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ADDONS } from './vendor-three.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const walk = (dir) => {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : /\.m?js$/.test(e.name) ? [path.join(dir, e.name)] : []);
};

const files = [...walk('src'), ...walk('scripts'), ...walk('tests'), 'sw.js', 'playwright.config.js', 'eslint.config.js']
  .filter((f) => fs.existsSync(path.join(root, f)));

let failed = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, ['--check', path.join(root, f)], { encoding: 'utf8' });
  if (r.status !== 0) {
    failed++;
    console.error(`✗ ${f}\n${r.stderr}`);
  }
}
console.log(`${files.length - failed}/${files.length} files parse`);

const vendored = path.join(root, 'vendor/three/three.module.min.js');
const installed = path.join(root, 'node_modules/three/build/three.module.min.js');
if (!fs.existsSync(vendored)) {
  failed++;
  console.error('✗ vendor/three/three.module.min.js is missing (run: npm run vendor)');
} else if (fs.existsSync(installed)) {
  const stale = ADDONS.filter((f) => {
    const v = path.join(root, 'vendor/three/addons', f), n = path.join(root, 'node_modules/three/examples/jsm', f);
    return !fs.existsSync(v) || !fs.readFileSync(v).equals(fs.readFileSync(n));
  });
  if (stale.length) {
    failed++;
    console.error(`✗ vendor/three/addons out of date (${stale.join(', ')}); run: npm run vendor`);
  }
  if (!fs.readFileSync(vendored).equals(fs.readFileSync(installed))) {
    failed++;
    console.error('✗ vendor/three does not match node_modules/three (run: npm run vendor)');
  } else {
    console.log('vendored Three.js matches package.json');
  }
}

// The UE5 scaffold can't be compiled without the engine; run its static checks instead.
if (spawnSync(process.execPath, [path.join(root, 'scripts/check-ue5.mjs')], { stdio: 'inherit' }).status !== 0) failed++;

process.exit(failed ? 1 : 0);
