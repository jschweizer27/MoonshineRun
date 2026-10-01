#!/usr/bin/env node
// Copy Three.js from node_modules into vendor/ so the game runs with no CDN.
// To upgrade: bump "three" in package.json, npm install, npm run vendor, then playtest.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ADDONS = [
  'postprocessing/EffectComposer.js', 'postprocessing/Pass.js', 'postprocessing/RenderPass.js',
  'postprocessing/ShaderPass.js', 'postprocessing/MaskPass.js', 'postprocessing/UnrealBloomPass.js',
  'postprocessing/OutputPass.js', 'shaders/CopyShader.js', 'shaders/LuminosityHighPassShader.js',
  'shaders/OutputShader.js',
  // Loads the 3D models in assets/ (src/assets.js).
  'loaders/GLTFLoader.js', 'utils/BufferGeometryUtils.js',
];

// Runs when invoked (npm run vendor); scripts/check.mjs only imports the list above.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
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
  // The addons the game uses (post-processing; the glTF loader for a custom truck).
  for (const f of ADDONS) {
    fs.mkdirSync(path.dirname(path.join(dest, 'addons', f)), { recursive: true });
    fs.copyFileSync(path.join(src, 'examples/jsm', f), path.join(dest, 'addons', f));
  }
  const { version } = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8'));
  console.log(`Vendored three@${version} into vendor/three/`);
}
