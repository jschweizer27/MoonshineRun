#!/usr/bin/env node
// Turns downloaded glTF models (Sketchfab etc.) into small game-ready files in assets/.
// Its tools aren't project dependencies; install them once, without saving:
//   npm i --no-save @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp
//   node scripts/optimize-models.mjs runner=<file.glb> sedan=<file.glb> rolls=<file.glb> lamp=<file.glb>
// (the originals are big downloads and are not kept in the repo).
//
// Each model is turned to face -Z (north), scaled to game size, set on the ground and
// centred. Vehicles get one wheel cut out as its own mesh (centred, axle along X) so the
// game can spin it; the wheel positions, headlights and roof height go in scene extras.
// `bake` models lose their textures: colour and finish are sampled into vertex colours and
// a _SURF attribute (roughness, metalness, clearcoat) so they share the game's one vehicle
// material. Otherwise the model keeps its own material (textures shrunk to WebP).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const MODELS = {
  // Otto's truck: keeps its painted, rusty textures.
  runner: { out: 'runner.glb', yaw: -Math.PI / 2, length: 4.9, body: 22000, wheel: 900, lights: 'front' },
  // Prohibition Bureau sedans.
  sedan: { out: 'bureau-sedan.glb', yaw: Math.PI, length: 4.5, bake: true, body: 14000, wheel: 700, drop: /^Text/, wheelNodes: /wheel|tyre/i, lightNodes: /headlight glass/i },
  // The garage's 1925 Rolls-Royce Phantom I.
  rolls: { out: 'rolls-royce.glb', yaw: Math.PI, length: 5.4, bake: true, body: 26000, wheel: 900, wheelNodes: /\/SM_(Wheel|Hubcap)/, lightNodes: /\/SM_Headlightbulb/ },
  // Victorian arc street lamp (no wheels): iron, plus the glowing globe.
  lamp: { out: 'arc-lamp.glb', height: 7.5, bake: true, body: 500, glow: /glass|light/i },
};

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

// A texture as raw RGBA pixels, for sampling at vertex UVs.
const pixels = new Map();
async function pixelsOf(tex) {
  if (!tex) return null;
  if (!pixels.has(tex)) {
    const { data, info } = await sharp(Buffer.from(tex.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    pixels.set(tex, { data, w: info.width, h: info.height });
  }
  return pixels.get(tex);
}
function sample(px, u, v) {
  const x = Math.min(px.w - 1, Math.floor((((u % 1) + 1) % 1) * px.w));
  const y = Math.min(px.h - 1, Math.floor((((v % 1) + 1) % 1) * px.h));
  const i = (y * px.w + x) * 4;
  return [px.data[i] / 255, px.data[i + 1] / 255, px.data[i + 2] / 255, px.data[i + 3] / 255];
}

// Every triangle of the scene in world space, with its source node and material.
async function soup(doc, spec) {
  const tris = [];   // { p: [9], n: [9], uv: [6] | null, c: [9], s: [9], node, glow }
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    const nm = normalMatrix(m);
    for (const prim of mesh.listPrimitives()) {
      const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL'), UV = prim.getAttribute('TEXCOORD_0');
      const idx = prim.getIndices() ? prim.getIndices().getArray() : [...Array(P.getCount()).keys()];
      const mat = prim.getMaterial();
      // Names of the node and its parents (Sketchfab puts the meshes on unnamed children).
      let path = '';
      for (let n = node; n; n = n.getParentNode()) path = `${n.getName()}/${path}`;
      const name = `${path} ${mat?.getName() || ''}`;
      const glow = spec.glow ? spec.glow.test(name) : false;
      let base = [0.8, 0.8, 0.8, 1], rough = 0.5, metal = 0, colorPx = null, mrPx = null, glass = false;
      if (mat) {
        base = mat.getBaseColorFactor();
        rough = mat.getRoughnessFactor();
        metal = mat.getMetallicFactor();
        if (spec.bake) { colorPx = await pixelsOf(mat.getBaseColorTexture()); mrPx = await pixelsOf(mat.getMetallicRoughnessTexture()); }
        glass = !!mat.getExtension('KHR_materials_transmission') || mat.getAlphaMode() === 'BLEND' || /glass/i.test(name);
      }
      const v = [], n = [], t = [];
      for (const i of idx) {
        v.push(xform(m, P.getElement(i, [])));
        n.push(N ? norm(xform3(nm, N.getElement(i, []))) : [0, 1, 0]);
        t.push(UV ? UV.getElement(i, []) : [0, 0]);
      }
      for (let k = 0; k < v.length; k += 3) {
        const tri = { p: [...v[k], ...v[k + 1], ...v[k + 2]], n: [...n[k], ...n[k + 1], ...n[k + 2]], uv: UV ? [...t[k], ...t[k + 1], ...t[k + 2]] : null, node: path, prim: mesh.listPrimitives().indexOf(prim), glow, mat };
        if (spec.bake) {
          tri.c = []; tri.s = [];
          for (let j = 0; j < 3; j++) {
            let c = base.slice(0, 3);
            if (colorPx) { const px = sample(colorPx, t[k + j][0], t[k + j][1]); c = c.map((x, a) => x * srgbToLinear(px[a])); }
            let r = rough, me = metal;
            if (mrPx) { const px = sample(mrPx, t[k + j][0], t[k + j][1]); r *= px[1]; me *= px[2]; }
            if (glass) { c = c.map((x) => 0.04 + x * 0.1); r = 0.05; me = 0; }
            // Clearcoat on glossy paint and glass; none on bare metal, rubber or wood.
            const coat = glass ? 1 : me < 0.5 && r < 0.55 ? 1 : 0;
            tri.c.push(...c);
            tri.s.push(Math.max(0.04, Math.min(1, r)), me, coat);
          }
        }
        tris.push(tri);
      }
    }
  }
  return tris;
}

function xform(m, p) {
  return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
}
function xform3(m, p) { return [m[0] * p[0] + m[3] * p[1] + m[6] * p[2], m[1] * p[0] + m[4] * p[1] + m[7] * p[2], m[2] * p[0] + m[5] * p[1] + m[8] * p[2]]; }
function norm(v) { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); }
// Inverse transpose of the upper 3x3, column-major.
function normalMatrix(m) {
  const [a, b, c, d, e, f, g, h, i] = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C || 1;
  return [A / det, B / det, C / det, -(b * i - c * h) / det, (a * i - c * g) / det, -(a * h - b * g) / det, (b * f - c * e) / det, -(a * f - c * d) / det, (a * e - b * d) / det];
}

// Turn, scale, ground and centre the triangles in place.
function normalise(tris, spec) {
  const cos = Math.cos(spec.yaw || 0), sin = Math.sin(spec.yaw || 0);
  const rot = (x, z) => [x * cos + z * sin, -x * sin + z * cos];
  for (const t of tris) for (let k = 0; k < 9; k += 3) {
    [t.p[k], t.p[k + 2]] = rot(t.p[k], t.p[k + 2]);
    [t.n[k], t.n[k + 2]] = rot(t.n[k], t.n[k + 2]);
  }
  const b = bounds(tris);
  const k = spec.length ? spec.length / (b.max[2] - b.min[2]) : spec.height / (b.max[1] - b.min[1]);
  const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
  for (const t of tris) for (let j = 0; j < 9; j += 3) {
    t.p[j] = (t.p[j] - cx) * k; t.p[j + 1] = (t.p[j + 1] - b.min[1]) * k; t.p[j + 2] = (t.p[j + 2] - cz) * k;
  }
}
function bounds(tris) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const t of tris) for (let j = 0; j < 9; j++) { min[j % 3] = Math.min(min[j % 3], t.p[j]); max[j % 3] = Math.max(max[j % 3], t.p[j]); }
  return { min, max };
}
const centre = (b) => b.min.map((x, a) => (x + b.max[a]) / 2);

// Connected pieces (triangles sharing a vertex position).
function components(tris) {
  const id = new Map(), parent = [];
  const find = (a) => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
  const vert = (x, y, z) => { const key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`; if (!id.has(key)) { id.set(key, parent.length); parent.push(parent.length); } return id.get(key); };
  const tv = tris.map((t) => [vert(t.p[0], t.p[1], t.p[2]), vert(t.p[3], t.p[4], t.p[5]), vert(t.p[6], t.p[7], t.p[8])]);
  for (const [a, b, c] of tv) { parent[find(b)] = find(a); parent[find(c)] = find(a); }
  const groups = new Map();
  tv.forEach(([a], i) => { const r = find(a); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(tris[i]); });
  return [...groups.values()];
}

// The four wheels. First the tyres: round pieces standing on the ground at the four
// corners. Then every piece inside a tyre's cylinder (rim, spokes, hub) joins its wheel.
// `wheelNodes` limits the search to named parts when the model has them.
function findWheels(tris, spec) {
  const b = bounds(tris), height = b.max[1] - b.min[1];
  // Pieces: connected parts of the named wheel nodes, or of each source mesh separately.
  const pool = spec.wheelNodes ? tris.filter((t) => spec.wheelNodes.test(t.node)) : tris;
  const byMesh = new Map();
  for (const t of pool) { const k = `${t.node}#${t.prim}`; if (!byMesh.has(k)) byMesh.set(k, []); byMesh.get(k).push(t); }
  const pieces = [...byMesh.values()].flatMap(components).map((c) => ({ tris: c, ...bounds(c) }));
  if (process.env.DEBUG) for (const c of pieces.filter((x) => x.tris.length > 100)) console.log('piece', c.tris[0].node, c.tris.length, c.min.map((x) => x.toFixed(2)).join(), '|', c.max.map((x) => x.toFixed(2)).join());
  const tyres = pieces.filter((c) => {
    const sy = c.max[1] - c.min[1], sz = c.max[2] - c.min[2], sx = c.max[0] - c.min[0];
    return c.min[1] < height * 0.06 && sy > height * 0.2 && Math.abs(sy - sz) < 0.2 * sy && sx < sy * 0.8;
  });
  const wheels = [], missing = [];
  for (const key of ['LF', 'RF', 'LB', 'RB']) {
    const sx = key[0] === 'L' ? -1 : 1, sz = key[1] === 'F' ? -1 : 1;
    // The biggest round piece at this corner is the tyre (inner discs and hubs are smaller).
    const pick = tyres.filter((c) => Math.sign(centre(c)[0]) === sx && Math.sign(centre(c)[2]) === sz)
      .sort((a, c) => (c.max[1] - c.min[1]) - (a.max[1] - a.min[1]))[0];
    if (!pick) { missing.push({ key, sx, sz }); continue; }
    const ctr = centre(pick), r = (pick.max[1] - pick.min[1]) / 2, half = (pick.max[0] - pick.min[0]) / 2 + r * 0.15;
    const inside = (c) => c !== pick && Math.abs(centre(c)[0] - ctr[0]) < half &&
      Math.hypot(c.max[1] - ctr[1], c.max[2] - ctr[2]) <= r * 1.05 && Math.hypot(c.min[1] - ctr[1], c.min[2] - ctr[2]) <= r * 1.05;
    wheels.push({ key, tris: [pick, ...pieces.filter(inside)].flatMap((c) => c.tris), min: pick.min, max: pick.max });
  }
  // A tyre fused into the body (one merged mesh): find where it touches the ground, take
  // the size of a tyre that was found, and cut out everything inside that cylinder.
  if (missing.length && wheels.length) {
    const ref = wheels[0], r = (ref.max[1] - ref.min[1]) / 2, half = (ref.max[0] - ref.min[0]) / 2;
    const taken = new Set(wheels.flatMap((w) => w.tris));
    for (const { key, sx, sz } of missing) {
      const ground = tris.filter((t) => !taken.has(t) && [1, 4, 7].some((j) => t.p[j] < height * 0.01) && Math.sign(t.p[0]) === sx && Math.sign(t.p[2]) === sz);
      if (!ground.length) throw new Error(`${spec.out}: no tyre found at corner ${key}`);
      const g = bounds(ground);
      // The outer edge of the contact patch lines up with the reference tyre's outer face.
      const cx = sx > 0 ? g.max[0] - half : g.min[0] + half, cz = (g.min[2] + g.max[2]) / 2, cy = r;
      const inCyl = (t) => [0, 3, 6].every((j) => Math.abs(t.p[j] - cx) < half * 1.1 && Math.hypot(t.p[j + 1] - cy, t.p[j + 2] - cz) < r * 1.03);
      const cut = tris.filter((t) => !taken.has(t) && inCyl(t));
      wheels.push({ key, tris: cut, min: [cx - half, cy - r, cz - r], max: [cx + half, cy + r, cz + r] });
    }
  } else if (missing.length) throw new Error(`${spec.out}: no tyres found`);
  wheels.sort((a, b) => ['LF', 'RF', 'LB', 'RB'].indexOf(a.key) - ['LF', 'RF', 'LB', 'RB'].indexOf(b.key));
  return wheels;
}

// Triangles -> an indexed, simplified primitive.
function buildPrimitive(doc, tris, spec, target, offset = [0, 0, 0]) {
  const keyOf = (t, j) => [0, 1, 2].map((a) => (t.p[j * 3 + a] - offset[a]).toFixed(5)).join(',') + (t.uv ? `|${t.uv[j * 2].toFixed(4)},${t.uv[j * 2 + 1].toFixed(4)}` : '') + (t.c ? `|${t.c.slice(j * 3, j * 3 + 3).map((x) => x.toFixed(3))}` : '') + `|${t.n.slice(j * 3, j * 3 + 3).map((x) => x.toFixed(2))}`;
  const map = new Map(), P = [], N = [], UV = [], C = [], S = [], I = [];
  for (const t of tris) for (let j = 0; j < 3; j++) {
    const key = keyOf(t, j);
    let i = map.get(key);
    if (i === undefined) {
      i = P.length / 3;
      map.set(key, i);
      P.push(t.p[j * 3] - offset[0], t.p[j * 3 + 1] - offset[1], t.p[j * 3 + 2] - offset[2]);
      N.push(...t.n.slice(j * 3, j * 3 + 3));
      if (t.uv) UV.push(t.uv[j * 2], t.uv[j * 2 + 1]);
      if (t.c) { C.push(...t.c.slice(j * 3, j * 3 + 3)); S.push(...t.s.slice(j * 3, j * 3 + 3)); }
    }
    I.push(i);
  }
  const pos = new Float32Array(P);
  let indices = new Uint32Array(I);
  if (target && I.length / 3 > target) {
    const attrs = new Float32Array(N), weights = [0.5, 0.5, 0.5];
    [indices] = MeshoptSimplifier.simplifyWithAttributes(indices, pos, 3, attrs, 3, weights, null, target * 3, 0.05, ['Permissive', 'Prune']);
    if (indices.length / 3 > target * 1.5) [indices] = MeshoptSimplifier.simplifySloppy(new Uint32Array(I), pos, 3, null, target * 3, 0.2);
  }
  // Keep only the vertices the simplified triangles still use.
  const remap = new Map(), keep = [];
  indices = indices.map((i) => { if (!remap.has(i)) { remap.set(i, keep.length); keep.push(i); } return remap.get(i); });
  const pick = (arr, n) => { const out = new Float32Array(keep.length * n); keep.forEach((i, k) => { for (let a = 0; a < n; a++) out[k * n + a] = arr[i * n + a]; }); return out; };
  const buffer = doc.getRoot().listBuffers()[0] || doc.createBuffer();
  const acc = (arr, type) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buffer);
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', acc(pick(pos, 3), 'VEC3'))
    .setAttribute('NORMAL', acc(pick(N, 3), 'VEC3'))
    .setIndices(acc(indices, 'SCALAR'));
  if (UV.length && !spec.bake) prim.setAttribute('TEXCOORD_0', acc(pick(UV, 2), 'VEC2'));
  if (C.length) { prim.setAttribute('COLOR_0', acc(pick(C, 3), 'VEC3')); prim.setAttribute('_SURF', acc(pick(S, 3), 'VEC3')); }
  if (!spec.bake && tris[0].mat) prim.setMaterial(tris[0].mat);
  return prim;
}

async function run(name, src) {
  const spec = MODELS[name];
  if (!spec) throw new Error(`unknown model "${name}" (expected ${Object.keys(MODELS).join(', ')})`);
  const doc = await io.read(src);
  for (const node of doc.getRoot().listNodes()) if (spec.drop && spec.drop.test(node.getName())) node.dispose();
  if (!spec.bake) await doc.transform(dedup(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }));
  const tris = await soup(doc, spec);
  normalise(tris, spec);
  const b = bounds(tris);
  const extras = { source: path.basename(src), size: b.max.map((x, a) => +(x - b.min[a]).toFixed(3)) };
  const meshes = {};
  let rest = tris;
  if (spec.wheel) {
    const wheels = findWheels(tris, spec);
    // Stand on the tyres (some models have parts hanging lower, or a ground plane).
    const dy = Math.min(...wheels.map((w) => w.min[1]));
    for (const t of tris) for (let j = 1; j < 9; j += 3) t.p[j] -= dy;
    for (const w of wheels) { w.min = [w.min[0], w.min[1] - dy, w.min[2]]; w.max = [w.max[0], w.max[1] - dy, w.max[2]]; }
    const inWheel = new Set(wheels.flatMap((w) => w.tris));
    rest = tris.filter((t) => !inWheel.has(t));
    extras.wheels = wheels.map((w) => centre(w).map((x) => +x.toFixed(3)));
    // The template wheel is a rear one: front wheels are often modelled steered.
    const lb = wheels[2];
    extras.wheelRadius = +((lb.max[1] - lb.min[1]) / 2).toFixed(3);
    meshes.wheel = buildPrimitive(doc, lb.tris, spec, spec.wheel, centre(lb));
  }
  if (spec.lightNodes) {
    const lights = components(tris.filter((t) => spec.lightNodes.test(t.node))).map((c) => centre(bounds(c)));
    extras.headlights = lights.filter((c) => c[2] < 0).map((c) => c.map((x) => +x.toFixed(3)));
  }
  if (spec.glow) {
    meshes.glow = buildPrimitive(doc, rest.filter((t) => t.glow), spec, 160);
    rest = rest.filter((t) => !t.glow);
    extras.head = centre(bounds(tris.filter((t) => t.glow))).map((x) => +x.toFixed(3));
  }
  // Roof: the highest point over the middle of the body.
  const mid = rest.filter((t) => Math.abs(t.p[2]) < b.max[2] * 0.3 && Math.abs(t.p[0]) < b.max[0] * 0.5);
  extras.roof = +bounds(mid.length ? mid : rest).max[1].toFixed(3);
  meshes.body = buildPrimitive(doc, rest, spec, spec.body);

  // Replace the scene with the new meshes.
  const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  for (const child of scene.listChildren()) child.dispose();
  for (const [key, prim] of Object.entries(meshes)) scene.addChild(doc.createNode(key).setMesh(doc.createMesh(key).addPrimitive(prim)));
  scene.setExtras(extras);
  await doc.transform(prune());
  if (spec.bake) for (const t of doc.getRoot().listTextures()) t.dispose();
  await io.write(path.join(root, 'assets', spec.out), doc);
  const count = (p) => (p ? p.getIndices().getCount() / 3 : 0);
  console.log(`assets/${spec.out}: body ${count(meshes.body)} + wheel ${count(meshes.wheel)} + glow ${count(meshes.glow)} triangles`, JSON.stringify(extras));
}

for (const arg of process.argv.slice(2)) {
  const [name, file] = arg.split('=');
  await run(name, file);
}
