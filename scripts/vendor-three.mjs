#!/usr/bin/env node
// Copy Three.js from node_modules into vendor/ so the game runs with no CDN.
// To upgrade: bump "three" in package.json, npm install, npm run vendor, then playtest.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const src = path.join(root, 'node_modules/three');
const dest = path.join(root, 'vendor/three');
if (!fs.existsSync(src)) {
  console.error('node_modules/three not found; run npm install first.');
  process.exit(1);
}
fs.mkdirSync(dest, { recursive: true });
fs.copyFileSync(path.join(src, 'build/three.module.min.js'), path.join(dest, 'three.module.min.js'));
fs.copyFileSync(path.join(src, 'LICENSE'), path.join(dest, 'LICENSE'));
const { version } = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8'));
console.log(`Vendored three@${version} into vendor/three/`);
