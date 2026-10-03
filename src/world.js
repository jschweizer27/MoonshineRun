import * as THREE from 'three';
import { CONFIG } from './config.js';
import { MODELS } from './assets.js';
import { Sky } from './sky.js';
import { createRng } from './rng.js';
import { CollisionWorld } from './collision.js';
import { RoadGraph } from './roadgraph.js';
import { buildCounty, COUNTY } from './county.js';
import { ATLAS, region, makePaintedAtlas, atlasMaterial, uvToRegion } from './atlas.js';
import { mergeGeometries } from '../vendor/three/addons/utils/BufferGeometryUtils.js';

// Named corners around the city, each with its sign over the door (at night there's jazz
// from the speakeasies among them).
export const DROPS = [
  { name: 'Highlandtown Speakeasy', sign: 'PRIVATE CLUB', x: 176, z: 44 },
  { name: 'Fells Point Docks', sign: 'PIER 5', x: 132, z: 176 },
  { name: 'Mount Vernon Hotel', sign: 'HOTEL', x: 0, z: -132 },
  { name: 'Little Italy Social Club', sign: 'SOCIAL CLUB', x: 44, z: 132 },
  { name: 'Hampden Mill', sign: 'HAMPDEN MILL', x: -176, z: -132 },
  { name: 'Canton Cannery', sign: 'CANNERY', x: 220, z: 132 },
  { name: 'Federal Hill Tavern', sign: 'TAVERN', x: -88, z: 176 },
  { name: 'Station North Jazz Club', sign: 'JAZZ CLUB', x: 88, z: -176 },
  { name: 'Charles Village Drugstore', sign: 'DRUGSTORE', x: -88, z: -88 },
  { name: 'Lexington Market', sign: 'MARKET', x: -132, z: 44 },
];
const SIGN_WORDS = ['CAFE', 'DINER', 'BARBER', 'THEATRE', 'JAZZ', 'CIGARS', 'BANK', 'GARAGE', 'TAILOR', 'BAKERY', 'RADIO', 'DANCING', 'BILLIARDS', 'SHOES', 'LUNCH', 'HOTEL'];
const AWNINGS = [0xd84a3a, 0x3f9a6a, 0x4a72b8, 0xd8a040, 0xb85a8a];
const NEON = ['#ff5a8a', '#5ae0ff', '#ffd05a', '#7dff8a', '#ff7a4a', '#f2f2ff'];

// The 1920s city: a street grid with cobbles and streetcar rails, brick blocks with lit
// windows, and gas lamps. Street lighting is faked with glowing decals instead of
// hundreds of real lights, and every repeated object is instanced, so the whole city
// costs only a handful of draw calls.
export class World {
  constructor(scene, { seed = CONFIG.seed } = {}) {
    this.scene = scene;
    this.cfg = CONFIG.world;
    this.seed = seed;
    this.rng = createRng(seed);
    this.collision = new CollisionWorld(this.cfg.blockSize);
    this.roads = new RoadGraph();
    this.buildings = [];   // footprints { minX, minZ, maxX, maxZ, h }
    this.extraLights = []; // lantern glows (no pole) added by the county
    this.uniforms = {
      uWindowGlow: { value: 1.1 },
      uWindowLitRatio: { value: 0.45 },
      uDaylight: { value: 0 },
    };

    this._buildLights();
    this._buildGround();
    this._buildRoadGraph();
    this._buildBuildings();
    const county = buildCounty(this, this.rng);
    this.barns = county.barns;
    this.drops = DROPS;
    this._buildLamps();
    this._buildDressing();
    this._buildWater();
    this._buildBounds();
    this.enableShadows();
  }

  // Art-deco dressing: glowing blade signs along the streets (drop sites get theirs),
  // rooftop water towers and chimneys. Signs share one texture atlas and one draw call.
  _buildDressing() {
    const rng = this.rng, B = this.cfg.blockSize, edge = this.edge - 1;
    const words = [...SIGN_WORDS, ...DROPS.map((d) => d.sign)];
    const rows = 32, rowH = 64;
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = rows * rowH;
    const g = cv.getContext('2d');
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    words.forEach((w, k) => {
      const y = k * rowH, c = NEON[k % NEON.length];
      g.fillStyle = '#120e0c'; g.fillRect(0, y, 512, rowH);
      g.strokeStyle = c; g.lineWidth = 4; g.strokeRect(6, y + 6, 500, rowH - 12);
      g.font = `bold ${w.length > 9 ? 30 : 40}px Georgia, serif`;
      g.shadowColor = c; g.shadowBlur = 14; g.fillStyle = c;
      g.fillText(w, 256, y + rowH / 2 + 2);
      g.shadowBlur = 0; g.fillStyle = '#fff8ee'; g.globalAlpha = 0.55; g.fillText(w, 256, y + rowH / 2 + 2); g.globalAlpha = 1;
    });
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.signMaterial = new THREE.MeshBasicMaterial({ map: tex });

    const pos = [], uv = [], idx = [];
    // A double-sided blade sign sticking out of a facade: (x,z) on the wall, (nx,nz) the
    // outward normal, word row k.
    const addSign = (x, z, nx, nz, y, k) => {
      const len = 3.2, h = 0.8, v0 = 1 - (k + 1) / rows + 0.002, v1 = 1 - k / rows - 0.002;
      const ax = x + nx * 0.3, az = z + nz * 0.3, bx = x + nx * (0.3 + len), bz = z + nz * (0.3 + len);
      for (const side of [1, -1]) {
        const base = pos.length / 3;
        const o = side * 0.06;       // two faces, a hair apart, each reading correctly
        const px = -nz * o, pz = nx * o;
        const [s, e] = side === 1 ? [[ax, az], [bx, bz]] : [[bx, bz], [ax, az]];
        pos.push(s[0] + px, y - h / 2, s[1] + pz, e[0] + px, y - h / 2, e[1] + pz, e[0] + px, y + h / 2, e[1] + pz, s[0] + px, y + h / 2, s[1] + pz);
        uv.push(0, v0, 1, v0, 1, v1, 0, v1);
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    };
    // Which facades face a street: walls within 12 m of a road centreline.
    const faces = (b) => {
      const out = [];
      const near = (v) => Math.abs(v - Math.round(v / B) * B) < 12;
      if (near(b.minX)) out.push(['w', b.minX, (b.minZ + b.maxZ) / 2, -1, 0]);
      if (near(b.maxX)) out.push(['e', b.maxX, (b.minZ + b.maxZ) / 2, 1, 0]);
      if (near(b.minZ)) out.push(['n', (b.minX + b.maxX) / 2, b.minZ, 0, -1]);
      if (near(b.maxZ)) out.push(['s', (b.minX + b.maxX) / 2, b.maxZ, 0, 1]);
      return out;
    };
    const city = this.buildings.filter((b) => !b.barn && [b.minX, b.maxX, b.minZ, b.maxZ].every((v) => Math.abs(v) < edge));
    for (const b of city) {
      if (b.h < 9 || !rng.chance(0.22)) continue;
      const f = faces(b);
      if (!f.length) continue;
      const [dir, fx, fz, nx, nz] = rng.pick(f);
      const along = dir === 'w' || dir === 'e' ? [0, (b.maxZ - b.minZ) / 2 - 1.5] : [(b.maxX - b.minX) / 2 - 1.5, 0];
      const sgn = rng.chance(0.5) ? 1 : -1;
      addSign(fx + along[0] * sgn, fz + along[1] * sgn, nx, nz, rng.range(4.2, 6.5), rng.int(0, SIGN_WORDS.length - 1));
    }
    // Fascia boards over some shopfronts (flat on the wall, above the display window),
    // and striped canvas awnings over others.
    const addFascia = (x, z, nx, nz, len, k) => {
      const h = 0.62, y = 4.05, v0 = 1 - (k + 1) / rows + 0.002, v1 = 1 - k / rows - 0.002;
      const ax = -nz, az = nx, cx = x + nx * 0.06, cz = z + nz * 0.06, base = pos.length / 3;
      pos.push(cx - ax * len / 2, y - h / 2, cz - az * len / 2, cx + ax * len / 2, y - h / 2, cz + az * len / 2,
        cx + ax * len / 2, y + h / 2, cz + az * len / 2, cx - ax * len / 2, y + h / 2, cz - az * len / 2);
      uv.push(1, v0, 0, v0, 0, v1, 1, v1);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    const awnings = [];
    for (const b of city) {
      if (b.h < 7) continue;
      for (const [dir, fx, fz, nx, nz] of faces(b)) {
        const len = dir === 'w' || dir === 'e' ? b.maxZ - b.minZ : b.maxX - b.minX;
        const r = rng();
        if (r < 0.28) addFascia(fx, fz, nx, nz, Math.min(len - 1, rng.range(3.2, 5.5)), rng.int(0, SIGN_WORDS.length - 1));
        else if (r < 0.6) awnings.push([fx, fz, nx, nz, Math.min(len - 1.2, rng.range(3.5, 8)), rng.int(0, AWNINGS.length - 1)]);
      }
    }
    this._buildAwnings(awnings);

    // Each named corner's building carries its sign.
    DROPS.forEach((d, k) => {
      let best = null, bestD = Infinity;
      for (const b of city) {
        const cx = Math.max(b.minX, Math.min(d.x, b.maxX)), cz = Math.max(b.minZ, Math.min(d.z, b.maxZ));
        const dist = Math.hypot(cx - d.x, cz - d.z);
        if (dist < bestD) { bestD = dist; best = b; }
      }
      if (!best) return;
      const west = best.maxX < d.x, north = best.maxZ < d.z;
      const x = west ? best.maxX : best.minX, z = north ? best.maxZ - 1.5 : best.minZ + 1.5;
      addSign(x, z, west ? 1 : -1, 0, 5, SIGN_WORDS.length + k);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    this.signMaterial.side = THREE.DoubleSide;
    this.scene.add(new THREE.Mesh(geo, this.signMaterial));

    // Rooftops: water towers on the tall ones, chimneys, stair bulkheads and skylights.
    const towers = [], chimneys = [], bulkheads = [];
    for (const b of city) {
      const top = b.h > 40 ? b.h * 1.48 : b.h > 26 ? b.h * 1.3 : b.h;
      const scale = b.h > 40 ? 0.46 : b.h > 26 ? 0.72 : 1;
      const w = (b.maxX - b.minX) * scale, d = (b.maxZ - b.minZ) * scale;
      const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
      if (b.h > 18 && rng.chance(0.4) && w > 5 && d > 5) towers.push([cx + rng.range(-w / 4, w / 4), top, cz + rng.range(-d / 4, d / 4)]);
      else if (rng.chance(0.5)) chimneys.push([cx + rng.range(-w / 3, w / 3), top, cz + rng.range(-d / 3, d / 3)]);
      if (w > 6 && d > 6 && rng.chance(0.55)) bulkheads.push([cx + rng.range(-w / 4, w / 4), top, cz + rng.range(-d / 4, d / 4), rng.range(2, 3.2), rng.range(2.2, 3), rng.range(2, 3.2)]);
      if (w > 8 && d > 8 && rng.chance(0.35)) bulkheads.push([cx + rng.range(-w / 4, w / 4), top, cz + rng.range(-d / 4, d / 4), rng.range(1.6, 2.6), 0.7, rng.range(1.2, 2)]);
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    const A = this.atlas;
    // Sizes, extra stacks and caps draw from their own stream, so the layout never moves.
    const vary = createRng(this.seed + 15485863);
    for (const b of city) {
      if (b.h < 12 || !vary.chance(0.3)) continue;   // a second stack on a party wall
      const top = b.h > 40 ? b.h * 1.48 : b.h > 26 ? b.h * 1.3 : b.h, scale = b.h > 40 ? 0.46 : b.h > 26 ? 0.72 : 1;
      const w = (b.maxX - b.minX) * scale, d = (b.maxZ - b.minZ) * scale;
      chimneys.push([(b.minX + b.maxX) / 2 + w * (vary.chance(0.5) ? 0.38 : -0.38), top, (b.minZ + b.maxZ) / 2 + vary.range(-d / 3, d / 3)]);
    }
    // Water towers: a wooden tank and roof (one mesh) of its own size on steel legs of its
    // own height.
    const tankGeo = mergeGeometries([new THREE.CylinderGeometry(1, 1, 1, 12).translate(0, 0.5, 0), new THREE.ConeGeometry(1.14, 0.42, 12).translate(0, 1.21, 0)]);
    const tank = new THREE.InstancedMesh(tankGeo, atlasMaterial(A, { side: 'staves', tile: 4 }), towers.length);
    const legs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.12, 1, 5).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.6 }), towers.length * 4);
    towers.forEach(([x, y, z], i) => {
      const r = vary.range(1.5, 2.4), th = vary.range(2.8, 4.4), lh = vary.range(2, 3.8);
      tank.setMatrixAt(i, m.compose(p.set(x, y + lh, z), q, s.set(r, th, r)));
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([lx, lz], k) => legs.setMatrixAt(i * 4 + k, m.compose(p.set(x + lx * r * 0.65, y, z + lz * r * 0.65), q, s.set(1, lh + 0.1, 1))));
    });
    this.waterTowers = tank;
    // Chimneys: stacks of one to three flues side by side, each capped, some with a pot.
    // Smoke rises from the first flue of each stack.
    const flues = [];
    this.chimneys = [];
    for (const [x, y, z] of chimneys) {
      const n = vary.int(1, 3), alongX = vary.chance(0.5), fw = vary.range(0.55, 0.9), fd = vary.range(0.6, 1), h = vary.range(1.4, 3.4);
      for (let i = 0; i < n; i++) {
        const o = (i - (n - 1) / 2) * (fw + 0.06), fx = x + (alongX ? o : 0), fz = z + (alongX ? 0 : o), fh = h * vary.range(0.88, 1.1);
        flues.push([fx, y, fz, fw, fh, fd], [fx, y + fh, fz, fw + 0.18, 0.16, fd + 0.18]);
        if (vary.chance(0.3)) flues.push([fx, y + fh + 0.16, fz, 0.28, 0.45, 0.28]);
        if (i === 0) this.chimneys.push([fx, y + fh + 0.2, fz]);   // chimney tops (smoke rises from them)
      }
    }
    const chim = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), atlasMaterial(A, { side: 'brick', tile: 1.4, color: 0xd0d0d0, roughness: 0.95 }), flues.length);
    flues.forEach(([x, y, z, w, h, d], i) => chim.setMatrixAt(i, m.compose(p.set(x, y, z), q, s.set(w, h, d))));
    this.chimneyStacks = chim;
    const bulk = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), atlasMaterial(A, { side: 'brick', top: 'roof', tile: 1.4, topTile: 4, color: 0xa0a0a0 }), bulkheads.length);
    bulkheads.forEach(([x, y, z, bw, bh, bd], i) => bulk.setMatrixAt(i, m.compose(p.set(x, y, z), q, s.set(bw, bh, bd))));
    s.set(1, 1, 1);
    for (const im of [tank, legs, chim, bulk]) { im.instanceMatrix.needsUpdate = true; this.scene.add(im); }
  }

  // Striped canvas awnings sloping out over the shopfronts: one draw call, colourway by
  // instance colour. They start above the truck's roof. The canvas is painted in the
  // building atlas: pale and grey stripes that the instance colour dyes.
  _buildAwnings(list) {
    const mat = new THREE.MeshStandardMaterial({ map: this.atlas.color, roughness: 0.95, side: THREE.DoubleSide });
    const mesh = new THREE.InstancedMesh(uvToRegion(new THREE.BoxGeometry(1, 0.06, 1), 'awning'), mat, list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ');
    const p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
    const depth = 1.7, tilt = 0.38;
    list.forEach(([x, z, nx, nz, len, k], i) => {
      e.set(tilt, Math.atan2(nx, nz), 0);
      q.setFromEuler(e);
      const out = (depth / 2) * Math.cos(tilt);
      p.set(x + nx * out, 3.7 - (depth / 2) * Math.sin(tilt), z + nz * out);
      mesh.setMatrixAt(i, m.compose(p, q, s.set(len, 1, depth)));
      mesh.setColorAt(i, c.setHex(AWNINGS[k]));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.awnings = mesh;
    this.scene.add(mesh);
  }

  inCounty(p) { return p.z < -250; }

  _buildLights() {
    const s = this.scene, L = CONFIG.look;
    s.background = new THREE.Color(L.sky);
    s.fog = new THREE.FogExp2(L.sky, L.fogDensity);
    this.sky = new Sky(s);          // stars, moon and clouds; the horizon is the fog colour

    // A dim teal fill so nothing is pure black; the lamps do the real lighting.
    this.hemi = new THREE.HemisphereLight(L.ambientSky, L.ambientGround, L.ambient);
    s.add(this.hemi);

    // Cool moonlight (the sun by day) is the key light and casts the shadows. Its shadow
    // box follows the view (see updateShadow).
    this.moon = new THREE.DirectionalLight(L.moon, L.moonIntensity);
    this.moon.position.set(-120, 220, -90);
    this.lightDir = new THREE.Vector3(-0.45, 0.8, -0.35).normalize();
    const sc = this.moon.shadow.camera, r = L.shadowRange;
    sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r;
    sc.near = 1; sc.far = 600;
    this.moon.shadow.bias = -0.0004;
    this.moon.shadow.normalBias = 0.04;
    s.add(this.moon, this.moon.target);
  }

  _buildGround() {
    const { blockSize: B, gridRadius: R } = this.cfg;

    // Distant ground to the horizon (the fog hides its edge).
    const far = new THREE.Mesh(
      new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x24211d, roughness: 1 })
    );
    far.position.y = -0.05;
    this.scene.add(far);

    // The city: one plane, one tiling texture. Each tile is centered on an intersection.
    const tiles = R * 2 + 1;
    const size = tiles * B;
    const [colorCv, heightCv, roughCv] = makeCityTile(this.rng, this.cfg);
    const tex = new THREE.CanvasTexture(colorCv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const rough = new THREE.CanvasTexture(roughCv);
    const normal = normalMapFrom(heightCv);
    for (const t of [tex, rough, normal]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(tiles, tiles); }
    this.groundTexture = tex;
    // The street grates painted into the tile (one per intersection, see makeCityTile): steam
    // rises from them (particles.atmosphere).
    this.grates = [];
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) this.grates.push([i * B + GRATE[0] * this.cfg.roadWidth / 2, j * B + this.cfg.roadWidth / 2 + GRATE[1]]);
    this.groundMaps = [rough, normal];
    this.roadMaterial = new THREE.MeshStandardMaterial({
      map: tex, roughnessMap: rough, normalMap: normal, normalScale: new THREE.Vector2(1, 1),
      roughness: 1, metalness: 0,
    });
    const city = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), this.roadMaterial);
    this.scene.add(city);

    // Raised granite curbs along every block (visual only; one draw call).
    const half = this.cfg.roadWidth / 2, walk = half + this.cfg.sidewalk, curbs = [];
    for (let i = -R; i <= R; i++) {
      for (let j = -R; j < R; j++) {
        const a = j * B + walk, b = (j + 1) * B - walk;
        for (const sd of [-1, 1]) {
          curbs.push([i * B + sd * half, (a + b) / 2, 0.26, b - a]);    // along z
          curbs.push([(a + b) / 2, i * B + sd * half, b - a, 0.26]);    // along x
        }
      }
    }
    // Drawn with the buildings' stone trim (same granite, one draw call).
    this._curbs = curbs.map(([x, z, w, d]) => [x, 0, z, w, 0.14, d, 0.82]);
  }

  // Reflections for the wet road: a small environment map rendered once from a stand-in
  // night street (blue-black sky, a ring of amber lamp glows, warm window patches).
  buildReflections(renderer) {
    const env = new THREE.Scene();
    env.background = new THREE.Color(0x0a1220);
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb466).multiplyScalar(6) });
    const win = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff9a50).multiplyScalar(1.6) });
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), glow);
      lamp.position.set(Math.cos(a) * 12, 4, Math.sin(a) * 12);
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.5), win);
      pane.position.set(Math.cos(a + 0.26) * 20, 7 + (k % 3) * 3, Math.sin(a + 0.26) * 20);
      pane.lookAt(0, pane.position.y, 0);
      env.add(lamp, pane);
    }
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.reflections = pmrem.fromScene(env, 0.02).texture;
    pmrem.dispose();
    this.roadMaterial.envMap = this.reflections;
    this.roadMaterial.envMapIntensity = 0.3;
  }

  _buildRoadGraph() {
    const { blockSize: B, gridRadius: R } = this.cfg;
    const id = (i, j) => (i + R) * (R * 2 + 1) + (j + R);
    for (let i = -R; i <= R; i++) {
      for (let j = -R; j <= R; j++) this.roads.addNode(i * B, j * B, 'city');
    }
    for (let i = -R; i <= R; i++) {
      for (let j = -R; j <= R; j++) {
        if (i < R) this.roads.link(id(i, j), id(i + 1, j));
        if (j < R) this.roads.link(id(i, j), id(i, j + 1));
      }
    }
  }

  _buildBuildings() {
    const { blockSize: B, gridRadius: R, roadWidth, sidewalk, edge } = this.cfg;
    const rng = this.rng;
    const setback = roadWidth / 2 + sidewalk;      // lot starts this far from a road centerline
    const lot = B - setback * 2;                   // 26 m of buildable land per block
    const boxes = [];                              // { x, z, w, d, h, y, color }

    const brick = [0x7c4a3a, 0x8b5d45, 0x6f4a3c, 0x8a7560, 0x6d6862, 0x5d4a3c, 0x93705a, 0x7a6f66];
    // Wall styles, rooflines and bay windows draw from their own random stream, so dressing
    // the skyline never moves the city's layout.
    const vary = createRng(this.seed + 104729);
    const addBuilding = (minX, minZ, maxX, maxZ, h) => {
      const color = rng.pick(brick);
      const look = { style: vary.int(0, ATLAS.STYLES - 1), win: vary.int(0, 1) };   // wall style; sash or arched windows
      const w = maxX - minX, d = maxZ - minZ, x = (minX + maxX) / 2, z = (minZ + maxZ) / 2;
      boxes.push({ x, z, w, d, h, y: 0, color, look });
      // Art-deco setbacks on the tall ones.
      if (h > 26) boxes.push({ x, z, w: w * 0.72, d: d * 0.72, h: h * 0.3, y: h, color, look });
      if (h > 40) boxes.push({ x, z, w: w * 0.46, d: d * 0.46, h: h * 0.18, y: h * 1.3, color, look });
      this.buildings.push({ minX, minZ, maxX, maxZ, h });
      this.collision.addBox(minX, minZ, maxX, maxZ, { tag: 'building' });
    };

    for (let i = -R; i < R; i++) {
      for (let j = -R; j < R; j++) {
        const lx = i * B + setback;            // lot min corner
        const lz = j * B + setback;
        // Taller buildings downtown.
        const centrality = 1 - Math.min(1, Math.hypot(i + 0.5, j + 0.5) / R);
        const maxH = 16 + centrality * 38;
        const half = lot / 2;

        // Split the lot into 2x2 parcels; sometimes merge two into one wide building
        // and occasionally leave a parcel empty for variety.
        const mergeRow = rng.chance(0.2);   // one wide building across the near row
        for (let px = 0; px < 2; px++) {
          for (let pz = 0; pz < 2; pz++) {
            if (mergeRow && px === 1 && pz === 0) continue;
            if (rng.chance(0.07)) continue;
            const inset = 0.6;
            const wFull = mergeRow && pz === 0 && px === 0 ? lot : half;
            const minX = lx + px * half + inset;
            const minZ = lz + pz * half + inset;
            const w = wFull - inset * 2 - rng.range(0, 2.5);
            const d = half - inset * 2 - rng.range(0, 2.5);
            // Hug the street-facing edges so blocks read as continuous frontage.
            const sx = px === 0 ? minX : minX + (wFull - inset * 2 - w);
            const sz = pz === 0 ? minZ : minZ + (half - inset * 2 - d);
            const h = rng.range(8, maxH);
            addBuilding(sx, sz, sx + w, sz + d, h);
          }
        }
      }
    }

    // Warehouses ring the city and form its boundary wall.
    const wallIn = R * B + setback;       // 229
    const wallOut = wallIn + 16;
    const addWall = (minX, minZ, maxX, maxZ) => {
      const len = Math.max(maxX - minX, maxZ - minZ);
      const alongX = maxX - minX > maxZ - minZ;
      const n = Math.ceil(len / 22);
      for (let k = 0; k < n; k++) {
        const a = k / n, b = (k + 1) / n;
        const h = rng.range(7, 13);
        if (alongX) addBuilding(minX + (maxX - minX) * a, minZ, minX + (maxX - minX) * b, maxZ, h);
        else addBuilding(minX, minZ + (maxZ - minZ) * a, maxX, minZ + (maxZ - minZ) * b, h);
      }
    };
    addWall(-wallOut, -wallOut, -9, -wallIn);        // north, with a gap for York Road
    addWall(9, -wallOut, wallOut, -wallIn);
    addWall(-wallOut, wallIn, wallOut, wallOut);     // south (the docks)
    addWall(-wallOut, -wallIn, -wallIn, wallIn);     // west
    addWall(wallIn, -wallIn, wallOut, wallIn);       // east
    this.edge = Math.min(edge, wallIn);

    // One instanced mesh for every box, and for the bay windows and brick parapets that
    // vary the street fronts and the skyline. Facades come from the painted atlas (brick
    // and stone bays, shopfronts, windows), laid out in world space by the facade shader;
    // the trims, chimneys, tanks, awnings and barns paint themselves from the same atlas.
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0.02 });
    // Its own random stream, so repainting the atlas never reshuffles the city. The old
    // facade atlas drew 3044 numbers from the city's stream here: skip as many, so every
    // seed still builds the same city as before.
    const atlas = makePaintedAtlas(createRng(this.seed + 7919));
    for (let i = 0; i < 3044; i++) rng();
    this.atlas = atlas;
    this.facadeTextures = [atlas.color, atlas.mask];
    addFacadeShader(mat, this.uniforms, atlas);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const c = new THREE.Color();
    const trims = [...(this._curbs || [])];   // stone: [x, y, z, w, h, d, shade]
    const extra = [];                          // facade boxes: [x, y, z, w, h, d, building, kind, offset]
    // A box's walls that face a street (within 12 m of a road centreline): [the axis the
    // wall faces, its coordinate, outward sign].
    const nearRoad = (v) => Math.abs(v - Math.round(v / B) * B) < 12;
    const streetWalls = (b) => [['x', b.x - b.w / 2, -1], ['x', b.x + b.w / 2, 1], ['z', b.z - b.d / 2, -1], ['z', b.z + b.d / 2, 1]].filter(([, v]) => nearRoad(v));
    const inCity = (b) => Math.max(Math.abs(b.x) + b.w / 2, Math.abs(b.z) + b.d / 2) < this.edge - 1;

    // Rooflines, all in stone trim and brick: a thin coping; a deep cornice on brackets
    // over a frieze; or a brick parapet round the roof, plain, raised over the main street
    // front in one block (a pediment), or raised in steps.
    const ROOFLINES = ['coping', 'cornice', 'cornice', 'parapet', 'pediment', 'stepped'];
    const roofline = (b, top, shade) => {
      const kind = vary.pick(ROOFLINES), walls = streetWalls(b);
      const slab = (y, h, grow, k = 1) => trims.push([b.x, y, b.z, b.w + grow, h, b.d + grow, shade * k]);
      if (kind === 'coping') { slab(top - 0.05, 0.3, 0.3); return; }
      if (kind === 'cornice') {
        slab(top - 0.1, 0.45, 1.1);
        slab(top - 0.45, 0.22, 0.5, 0.85);
        slab(top - 1.25, 0.7, 0.16, 0.92);                                     // frieze
        if (top > 26) return;                                                  // brackets only where they can be seen
        for (const [axis, v, sgn] of walls) {
          const n = Math.floor(((axis === 'x' ? b.d : b.w) - 1.2) / 1.3);
          for (let i = 0; i <= n; i++) {
            const a = i * 1.3 - (n * 1.3) / 2;
            if (axis === 'x') trims.push([v + sgn * 0.25, top - 0.72, b.z + a, 0.5, 0.62, 0.26, shade * 0.9]);
            else trims.push([b.x + a, top - 0.72, v + sgn * 0.25, 0.26, 0.62, 0.5, shade * 0.9]);
          }
        }
        return;
      }
      // A parapet: four low brick walls flush with the facade, stone-capped, on a course
      // that hides the joint.
      const t = 0.35, ph = vary.range(0.6, 0.9);
      slab(top - 0.12, 0.24, 0.35, 0.85);
      const ring = (y, h, th, out, stone) => {
        const W = b.w + out * 2, D = b.d + out * 2, list = stone ? trims : extra;
        const add = (x, z, w, d) => list.push(stone ? [x, y, z, w, h, d, shade] : [x, y, z, w, h, d, b, 3, 0]);
        add(b.x, b.z - D / 2 + th / 2, W, th); add(b.x, b.z + D / 2 - th / 2, W, th);
        add(b.x - W / 2 + th / 2, b.z, th, D - th * 2); add(b.x + W / 2 - th / 2, b.z, th, D - th * 2);
      };
      ring(top, ph, t, 0, false);
      ring(top + ph, 0.14, t + 0.24, 0.12, true);                               // coping
      if (kind === 'parapet' || !walls.length) return;
      // Raised over the main street front: brick blocks, each stone-capped.
      const [axis, v, sgn] = walls[0], len = axis === 'x' ? b.d : b.w, y = top + ph + 0.14;
      const raise = (along, wide, h) => {
        const x = axis === 'x' ? v - sgn * t / 2 : b.x + along, z = axis === 'x' ? b.z + along : v - sgn * t / 2;
        const [w, d] = axis === 'x' ? [t, wide] : [wide, t];
        extra.push([x, y, z, w, h, d, b, 3, 0]);
        trims.push([x, y + h, z, w + 0.24, 0.14, d + 0.24, shade]);
      };
      if (kind === 'pediment') raise(0, len * vary.range(0.25, 0.4), vary.range(0.6, 0.9));
      else { const cw = len * 0.24, sw = len * 0.14; raise(0, cw, 0.85); raise(-(cw + sw) / 2, sw, 0.45); raise((cw + sw) / 2, sw, 0.45); }
    };

    // Bay windows: oriels on some street fronts, one or two bays wide and two or three
    // floors tall from the first or second floor up, clear of the corners (blade signs hang
    // there) and of the roofline. They wear their building's style.
    const addBays = (b) => {
      for (const [axis, v, sgn] of streetWalls(b)) {
        if (!vary.chance(0.32)) continue;
        const lo = (axis === 'x' ? b.z - b.d / 2 : b.x - b.w / 2) + 3, hi = lo + (axis === 'x' ? b.d : b.w) - 6;
        const wide = (vary.chance(0.35) ? 2 : 1) * BAY_W, floors = vary.int(2, 3), from = vary.int(0, 1);
        const first = Math.ceil(lo / BAY_W), last = Math.floor((hi - wide) / BAY_W);
        const y0 = SHOP_H + from * FLOOR_H, y1 = y0 + floors * FLOOR_H;
        if (last < first || y1 > b.h - FLOOR_H) continue;
        const mid = vary.int(first, last) * BAY_W + wide / 2, depth = 0.8, out = v + sgn * depth / 2;
        // Its narrow sides show the middle of a window: shift them onto a bay's centre.
        const offset = BAY_W / 2 - out;
        if (axis === 'x') extra.push([out, y0, mid, depth, y1 - y0, wide, b, 1, offset]);
        else extra.push([mid, y0, out, wide, y1 - y0, depth, b, 2, offset]);
        // Stone cap on top, a corbelled stone base underneath.
        trims.push(axis === 'x' ? [out + sgn * 0.08, y1, mid, depth + 0.3, 0.22, wide + 0.3, 0.85] : [mid, y1, out + sgn * 0.08, wide + 0.3, 0.22, depth + 0.3, 0.85]);
        trims.push(axis === 'x' ? [out, y0 - 0.32, mid, depth + 0.12, 0.32, wide + 0.12, 0.8] : [mid, y0 - 0.32, out, wide + 0.12, 0.32, depth + 0.12, 0.8]);
        trims.push(axis === 'x' ? [out - sgn * 0.12, y0 - 0.62, mid, depth - 0.24, 0.3, wide - 0.3, 0.75] : [mid, y0 - 0.62, out - sgn * 0.12, wide - 0.3, 0.3, depth - 0.24, 0.75]);
      }
    };

    boxes.forEach((b) => {
      const t = rng.range(0.82, 1.06);
      b.tint = [t, t * rng.range(0.96, 1.02), t * rng.range(0.93, 1.0)];
      const top = b.y + b.h, shade = rng.range(0.7, 1);
      if (b.y === 0 && b.h > 7) trims.push([b.x, 4.5, b.z, b.w + 0.25, 0.28, b.d + 0.25, shade]);   // string course
      if (inCity(b)) { roofline(b, top, shade); if (b.y === 0) addBays(b); }
      else { trims.push([b.x, top - 0.1, b.z, b.w + 0.7, 0.45, b.d + 0.7, shade]); trims.push([b.x, top - 0.45, b.z, b.w + 0.35, 0.22, b.d + 0.35, shade * 0.85]); }
    });
    // Per instance: wall style, window kind, what it is (0 building, 1-2 a bay window on an
    // x / z wall, 3 a plain brick wall) and a bay's side shift.
    const n = boxes.length + extra.length, facade = new Float32Array(n * 4);
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    const put = (k, x, y, z, w, h, d, b, kind, offset) => {
      mesh.setMatrixAt(k, m.compose(p.set(x, y, z), q, s.set(w, h, d)));
      mesh.setColorAt(k, c.setRGB(...b.tint));
      facade.set([b.look.style, b.look.win, kind, offset], k * 4);
    };
    boxes.forEach((b, k) => put(k, b.x, b.y, b.z, b.w, b.h, b.d, b, 0, 0));
    extra.forEach((e, i) => put(boxes.length + i, ...e));
    geo.setAttribute('aFacade', new THREE.InstancedBufferAttribute(facade, 4));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    this.buildingMesh = mesh;
    this.bays = extra.filter((e) => e[7] === 1 || e[7] === 2).map((e) => e.slice(0, 6));   // [x, y, z, w, h, d]
    this.scene.add(mesh);

    const trim = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
      atlasMaterial(atlas, { side: 'stone', tile: 2.4, color: 0xbab4ac, roughness: 0.8 }), trims.length);
    trims.forEach(([x, y, z, w, h, d, shade], k) => {
      trim.setMatrixAt(k, m.compose(p.set(x, y, z), q, s.set(w, h, d)));
      trim.setColorAt(k, c.setScalar(shade));
    });
    trim.instanceMatrix.needsUpdate = true;
    trim.instanceColor.needsUpdate = true;
    this.cornices = trim;
    this.curbCount = (this._curbs || []).length;
    this.scene.add(trim);
  }

  _buildLamps() {
    const { blockSize: B, gridRadius: R, roadWidth, sidewalk } = this.cfg;
    const off = roadWidth / 2 + sidewalk / 2;   // middle of the sidewalk
    const spots = [];                           // { x, z, tx, tz } lamp + direction toward the road
    for (let i = -R; i <= R; i++) {
      for (let j = -R; j <= R; j++) {
        const sx = (i + j) & 1 ? 1 : -1, sz = i & 1 ? 1 : -1;
        spots.push({ x: i * B + sx * off, z: j * B + sz * off, tx: -sx, tz: -sz });
        if (j < R) { const s2 = (i + j) & 1 ? 1 : -1; spots.push({ x: i * B + s2 * off, z: j * B + B / 2, tx: -s2, tz: 0 }); }
        if (i < R) { const s2 = (i + j) & 1 ? -1 : 1; spots.push({ x: i * B + B / 2, z: j * B + s2 * off, tx: 0, tz: -s2 }); }
      }
    }
    spots.push(...this.extraLights);
    this.lampSpots = spots;
    const n = spots.length;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);

    const L = CONFIG.look;
    // The arc-lamp model (assets/) if it loaded: an iron post whose arm reaches out over the
    // road with a glowing globe; else a plain post with a 1920s lantern box under an iron cap.
    const arc = MODELS.lamp && MODELS.lamp.glow ? MODELS.lamp : null;
    const iron = arc
      ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.7 })
      : new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.55, metalness: 0.6 });
    const poles = new THREE.InstancedMesh(arc ? arc.body : new THREE.CylinderGeometry(0.09, 0.15, 5.0, 6).translate(0, 2.5, 0), iron, n);
    this.lampColor = new THREE.Color(L.lampColor);
    this.bulbMaterial = new THREE.MeshBasicMaterial({ color: this.lampColor.clone() });
    const bulbs = new THREE.InstancedMesh(arc ? arc.glow : new THREE.BoxGeometry(0.42, 0.58, 0.42), this.bulbMaterial, n);
    // The model is scaled so its globe hangs where the lantern was (5.3 m), arm toward the road.
    const head = arc ? new THREE.Vector3(...arc.extras.head) : null;
    const scale = arc ? 5.3 / head.y : 1;
    if (arc) arc.body.computeBoundingBox();
    const postX = arc ? arc.body.boundingBox.max.x - 0.06 : 0;   // the post is the far end from the arm
    const turn = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), shift = new THREE.Vector3();
    const caps = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.46, 0.34, 4).rotateY(Math.PI / 4).translate(0, 0.46, 0),
      poles.material, n);
    // A faint cone of light under each lantern (fog and bloom carry it).
    this.coneMaterial = new THREE.MeshBasicMaterial({
      map: gradientTexture([[0, 'rgba(255,190,120,0)'], [0.45, 'rgba(255,190,120,0.12)'], [0.85, 'rgba(255,205,150,0.55)'], [1, 'rgba(255,220,170,1)']]),
      color: 0xffffff, transparent: true, opacity: L.coneOpacity, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    });
    this.coneMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vFacing;')
        .replace('#include <project_vertex>', `#include <project_vertex>
          vec3 coneN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
          vFacing = abs(dot(coneN, normalize(-mvPosition.xyz)));`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vFacing;')
        .replace('#include <opaque_fragment>', 'diffuseColor.a *= smoothstep(0.05, 0.7, vFacing);\n#include <opaque_fragment>');
    };
    this.coneMaterial.customProgramCacheKey = () => 'shine-cone';
    const cones = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 2.6, 5, 16, 1, true).translate(0, -2.5, 0), this.coneMaterial, n);
    this.poolMaterial = new THREE.MeshBasicMaterial({
      map: radialTexture([[0, 'rgba(255,178,92,0.9)'], [0.4, 'rgba(255,150,64,0.32)'], [1, 'rgba(255,130,50,0)']]),
      color: 0xffffff, transparent: true, opacity: L.poolOpacity, blending: THREE.AdditiveBlending,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    });
    const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.poolMaterial, n);
    const haloPos = new Float32Array(n * 3);
    const white = new THREE.Color(1, 1, 1);

    spots.forEach((sp, k) => {
      const pole = sp.pole !== false;           // barn lanterns hang on the wall: no post
      const y = pole ? 5.3 : 3.4;
      sp.y = y;
      if (arc) {
        // The model's arm points along -X: turn it toward the road, then shift the lamp so
        // the globe lands on the light spot.
        turn.setFromAxisAngle(up, Math.atan2(sp.tz, -sp.tx));
        shift.copy(head).multiplyScalar(scale).applyQuaternion(turn);
        const base = p.set(sp.x - shift.x, y - shift.y, sp.z - shift.z);
        poles.setMatrixAt(k, m.compose(base, turn, s.setScalar(pole ? scale : 0)));
        bulbs.setMatrixAt(k, m.compose(base, turn, s.setScalar(scale)));
        caps.setMatrixAt(k, m.compose(base, turn, s.setScalar(0)));
        shift.set(postX * scale, 0, 0).applyQuaternion(turn);
        sp.postX = base.x + shift.x;
        sp.postZ = base.z + shift.z;
      } else {
        poles.setMatrixAt(k, m.compose(p.set(sp.x, 0, sp.z), q, s.set(pole ? 1 : 0, pole ? 1 : 0, pole ? 1 : 0)));
        bulbs.setMatrixAt(k, m.compose(p.set(sp.x, y, sp.z), q, s.set(1, 1, 1)));
        caps.setMatrixAt(k, m);
      }
      cones.setMatrixAt(k, m.compose(p.set(sp.x, y - 0.3, sp.z), q, s.set(1, (y - 0.3) / 5, 1)));
      pools.setMatrixAt(k, m.compose(p.set(sp.x + sp.tx * 2, 0.04, sp.z + sp.tz * 2), q, s.set(20, 1, 20)));
      pools.setColorAt(k, white);
      haloPos.set([sp.x, y, sp.z], k * 3);
      if (pole) this.collision.addCircle(sp.postX ?? sp.x, sp.postZ ?? sp.z, 0.25, { tag: 'lamp' });
    });
    for (const im of [poles, bulbs, caps, cones, pools]) { im.instanceMatrix.needsUpdate = true; this.scene.add(im); }
    caps.visible = !arc;          // the arc lamp has its own hood
    pools.renderOrder = 1;
    cones.renderOrder = 2;
    this.lampPools = pools;
    this.lampCones = cones;

    const haloGeo = new THREE.BufferGeometry();
    haloGeo.setAttribute('position', new THREE.BufferAttribute(haloPos, 3));
    this.haloMaterial = new THREE.PointsMaterial({
      map: radialTexture([[0, 'rgba(255,226,170,1)'], [0.22, 'rgba(255,180,100,0.5)'], [1, 'rgba(255,150,70,0)']]),
      size: 2.2, sizeAttenuation: true, transparent: true, depthWrite: false, opacity: 0.7,
      blending: THREE.AdditiveBlending, color: 0xffffff,
    });
    this.halos = new THREE.Points(haloGeo, this.haloMaterial);
    this.scene.add(this.halos);
    this._buildLampLights();
  }

  // Real light for the lamps near the view: a fixed pool of warm point lights (plus one
  // shadow-casting spot on the nearest lamp) that hop to whichever lamps are closest to
  // the camera each frame. The count never changes, so shaders never recompile; each
  // lamp's light fades in and out with its distance so hopping never pops. Every other
  // lamp keeps its glowing pool decal.
  _buildLampLights() {
    const L = CONFIG.look;
    this.lampLevel = 1;                       // 0 by day (set by the environment)
    this.lampLights = [];
    for (let k = 0; k < L.lampLights; k++) {
      const light = new THREE.PointLight(L.lampColor, 0, L.lampRange, 2);
      light.position.set(0, -50, 0);
      this.scene.add(light);
      this.lampLights.push(light);
    }
    const spot = new THREE.SpotLight(L.lampColor, 0, L.lampRange, 1.05, 0.65, 2);
    spot.position.set(0, -50, 0);
    spot.shadow.mapSize.set(512, 512);
    spot.shadow.camera.near = 0.5;
    spot.shadow.camera.far = L.lampRange;
    spot.shadow.bias = -0.0008;
    this.scene.add(spot, spot.target);
    this.lampSpot = spot;
    this._spotLamp = -1;
    // Reflections of the lit lamps on the wet road: a long glow stretched from under each
    // lamp toward the viewer (one draw call; strength follows the road's wetness).
    const cv = document.createElement('canvas');
    cv.width = 32; cv.height = 128;
    const g = cv.getContext('2d');
    const img = g.createImageData(32, 128);
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 32; x++) {
        const across = Math.exp(-(((x - 15.5) / 7) ** 2)), along = (1 - y / 128) ** 1.6 * (0.35 + 0.65 * Math.exp(-(((y - 10) / 18) ** 2)));
        const o = (y * 32 + x) * 4;
        img.data.set([255, 190, 120, 255 * across * along], o);
      }
    }
    g.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.streakMaterial = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(3.2, 3.2, 3.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
    const n = L.lampLights + 1;
    this.lampStreaks = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.streakMaterial, n);
    this.lampStreaks.frustumCulled = false;
    this.lampStreaks.renderOrder = 1;
    for (let k = 0; k < n; k++) this.lampStreaks.setMatrixAt(k, new THREE.Matrix4().makeScale(0, 0, 0));
    this.lampStreaks.setColorAt(0, _white);
    this.scene.add(this.lampStreaks);
    this._lampRank = new Int32Array(L.lampLights + 2).fill(-1);
    this._lampDist = new Float32Array(L.lampLights + 2);
    this._dimmed = [];
  }

  // Graphics level: how many lamp lights, and whether the nearest casts shadows. Changing
  // it recompiles shaders once, so it only happens when the quality setting changes.
  setLampDetail(level) {
    const n = { low: 4, medium: 6, high: CONFIG.look.lampLights }[level] ?? CONFIG.look.lampLights;
    this.lampLights.forEach((l, k) => { l.visible = k < n; });
    this.lampSpot.visible = level !== 'low';
    this.lampSpot.castShadow = level === 'high' && CONFIG.look.lampShadow;
  }

  updateLamps(camera) {
    const L = CONFIG.look, spots = this.lampSpots;
    camera.getWorldDirection(_v);
    // Rank lamps by distance to a point a little ahead of the camera.
    const fx = camera.position.x + _v.x * 16, fz = camera.position.z + _v.z * 16;
    const active = this.lampLights.filter((l) => l.visible).length + (this.lampSpot.visible ? 1 : 0);
    const want = active + 1;                  // one extra: the fade-out reference
    const rank = this._lampRank, dist = this._lampDist;
    rank.fill(-1);
    dist.fill(Infinity);
    for (let k = 0; k < spots.length; k++) {
      const d = Math.hypot(spots[k].x - fx, spots[k].z - fz);
      if (d >= dist[want - 1]) continue;
      let i = want - 1;
      while (i > 0 && dist[i - 1] > d) { dist[i] = dist[i - 1]; rank[i] = rank[i - 1]; i--; }
      dist[i] = d; rank[i] = k;
    }
    // Weight: 1 near the view, fading to 0 by the distance of the first unlit lamp.
    const edge = dist[want - 1] === Infinity ? 1e3 : dist[want - 1];
    const weight = (d) => { const t = Math.min(1, Math.max(0, (edge - d) / (edge * 0.45))); return t * t * (3 - 2 * t); };

    // The shadow-casting spot sticks to its lamp until another is clearly nearer.
    let spotIdx = -1;
    if (this.lampSpot.visible) {
      const cur = rank.indexOf(this._spotLamp);
      spotIdx = cur >= 0 && cur < active && dist[cur] < dist[0] * 1.35 + 3 ? cur : 0;
      this._spotLamp = rank[spotIdx];
    }
    for (const k of this._dimmed) this.lampPools.setColorAt(k, _white);
    this._dimmed.length = 0;
    let li = 0, si = 0;
    const streaks = this.lampStreaks;
    for (let i = 0; i < active; i++) {
      const k = rank[i];
      if (k < 0) continue;
      const sp = spots[k], w = weight(dist[i]) * this.lampLevel;
      const light = i === spotIdx ? this.lampSpot : this.lampLights[li++];
      if (!light || !light.visible) continue;
      light.position.set(sp.x + sp.tx * 1.4, sp.y - 0.35, sp.z + sp.tz * 1.4);
      light.intensity = L.lampIntensity * w * (light.isSpotLight ? 1.6 : 1);
      if (light.isSpotLight) { light.target.position.set(sp.x + sp.tx * 1.5, 0, sp.z + sp.tz * 1.5); light.target.updateMatrixWorld(); }
      // Its real light replaces the fake pool decal.
      this.lampPools.setColorAt(k, _tint.setScalar(1 - 0.6 * w));
      this._dimmed.push(k);
      // Its reflection on the wet road, stretched from under the lamp toward the viewer.
      const lx = light.position.x, lz = light.position.z;
      const dx = camera.position.x - lx, dz = camera.position.z - lz, d = Math.hypot(dx, dz) || 1;
      const len = Math.min(14, d * 0.8), yaw = Math.atan2(dx, dz);
      _q.setFromAxisAngle(_up, yaw);
      _m4.compose(_c.set(lx + (dx / d) * (len / 2 + 0.3), 0.035, lz + (dz / d) * (len / 2 + 0.3)), _q, _s.set(2.4, 1, len));
      streaks.setMatrixAt(si, _m4);
      // Up close the reflection falls away under your feet instead of filling the view.
      const near = Math.min(1, Math.max(0, (d - 8) / 14));
      streaks.setColorAt(si++, _tint.setScalar(w * near * near));
    }
    while (si < streaks.count) streaks.setMatrixAt(si++, _m4.makeScale(0, 0, 0));
    streaks.instanceMatrix.needsUpdate = true;
    streaks.instanceColor.needsUpdate = true;
    while (li < this.lampLights.length) this.lampLights[li++].intensity = 0;
    if (spotIdx < 0) this.lampSpot.intensity = 0;
    this.lampPools.instanceColor.needsUpdate = true;
  }

  // The Inner Harbor beyond the docks.
  _buildWater() {
    this.waterMaterial = new THREE.MeshStandardMaterial({ color: 0x0f1c26, roughness: 0.25, metalness: 0.4 });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(1400, 700).rotateX(-Math.PI / 2), this.waterMaterial);
    water.position.set(0, -0.3, 600);
    this.scene.add(water);
  }

  _buildBounds() {
    const e = this.edge;
    this.collision.addZone(-e, -e, e, e);
    this.mapBounds = { minX: COUNTY.minX - 20, maxX: COUNTY.maxX + 20, minZ: COUNTY.minZ - 20, maxZ: 300 };
    this.mapLabels = [
      { text: 'HIGHLANDTOWN', x: 175, z: 22 }, { text: 'FELLS POINT', x: 150, z: 198 },
      { text: 'MOUNT VERNON', x: 0, z: -110 }, { text: 'LITTLE ITALY', x: 60, z: 110 },
      { text: 'HAMPDEN', x: -175, z: -154 }, { text: 'FEDERAL HILL', x: -110, z: 198 },
      { text: 'INNER HARBOR', x: 0, z: 275 }, { text: 'YORK ROAD', x: 60, z: -330 },
      { text: 'GREEN SPRING VALLEY', x: 0, z: -540 }, { text: 'MONKTON', x: 0, z: -712 }, { text: 'GLYNDON', x: -390, z: -742 },
    ];
  }

  // Background of the prerendered map: county fields, woods and the harbor.
  drawMapGround(g, X, Z, s) {
    g.fillStyle = '#16211a';
    g.fillRect(X(COUNTY.minX), Z(COUNTY.minZ), (COUNTY.maxX - COUNTY.minX) * s, (COUNTY.maxZ - COUNTY.minZ) * s);
    g.fillStyle = '#0f1c26';
    g.fillRect(X(this.mapBounds.minX), Z(250), (this.mapBounds.maxX - this.mapBounds.minX) * s, 60 * s);
    g.fillStyle = '#1d2c1e';
    const { blockSize: B, gridRadius: R } = this.cfg;
    g.fillRect(X(-R * B - 22), Z(-R * B - 22), (R * B * 2 + 44) * s, (R * B * 2 + 44) * s);
    g.fillStyle = '#243a22';
    for (const [x, z, sc] of this.trees || []) { g.beginPath(); g.arc(X(x), Z(z), 2.6 * sc * s, 0, Math.PI * 2); g.fill(); }
  }

  // A road node position, optionally at least `minDist` from `avoid`.
  randomRoadPoint(rng, avoid = null, minDist = 0) {
    for (let tries = 0; tries < 60; tries++) {
      const n = this.roads.random(rng);
      if (!avoid || Math.hypot(n.x - avoid.x, n.z - avoid.z) >= minDist) return new THREE.Vector3(n.x, 0, n.z);
    }
    // Fall back to the farthest node so we never spawn on top of the player.
    let best = this.roads.nodes[0], bestD = -1;
    for (const n of this.roads.nodes) {
      const d = avoid ? Math.hypot(n.x - avoid.x, n.z - avoid.z) : 0;
      if (d > bestD) { bestD = d; best = n; }
    }
    return new THREE.Vector3(best.x, 0, best.z);
  }

  // Graphics level: 0 = no shadows, else the shadow map size. Changing it recompiles
  // shaders, so it only happens when the quality setting changes.
  setShadows(size) {
    const m = this.moon;
    m.castShadow = size > 0;
    if (size > 0 && m.shadow.mapSize.x !== size) {
      m.shadow.mapSize.set(size, size);
      m.shadow.map?.dispose();
      m.shadow.map = null;
    }
  }

  // Centre the key light's shadow box ahead of the camera, snapped to whole shadow-map
  // texels so shadow edges don't shimmer as the view moves.
  updateShadow(camera) {
    const m = this.moon;
    if (!m.castShadow) return;
    const dir = this.lightDir, r = CONFIG.look.shadowRange;
    camera.getWorldDirection(_v);
    _c.set(camera.position.x + _v.x * r * 0.55, 0, camera.position.z + _v.z * r * 0.55);
    const texel = (r * 2) / m.shadow.mapSize.x;
    // Light-space axes: right = up x dir, up2 = dir x right.
    _r.set(0, 1, 0).cross(dir).normalize();
    _u.copy(dir).cross(_r);
    const a = Math.round(_c.dot(_r) / texel) * texel, b = Math.round(_c.dot(_u) / texel) * texel, d = _c.dot(dir);
    _c.copy(_r).multiplyScalar(a).addScaledVector(_u, b).addScaledVector(dir, d);
    m.target.position.copy(_c);
    m.position.copy(_c).addScaledVector(dir, 300);
    m.target.updateMatrixWorld();
  }

  // Everything solid casts and receives shadows; flat ground only receives.
  enableShadows(root = this.scene) {
    root.traverse((o) => {
      if (!o.isMesh || !o.material || o.material.transparent || !o.material.isMeshStandardMaterial) return;
      o.receiveShadow = true;
      o.castShadow = o.geometry.type !== 'PlaneGeometry';
    });
  }

  setAnisotropy(n) {
    for (const t of [this.groundTexture, ...(this.groundMaps || []), ...(this.facadeTextures || [])]) { t.anisotropy = n; t.needsUpdate = true; }
  }

  // Graphics level: low drops the lamp halos (lots of overdraw on weak GPUs). The
  // environment also hides them by day.
  setDetail(level) {
    this.detailHalos = level !== 'low';
    this.halos.visible = this.detailHalos;
  }
}

// Facades: every building face is laid out in world space as 2.6 m bays. The ground floor
// (4.6 m) is a shopfront bay, the floors above are window bays, 3.4 m each. The wall style
// (red brick, dark brick, limestone, slate ashlar) and the window kind (sash or arched) are
// picked per building from its centre, so setback tiers match; shopfronts mix display
// windows and doors bay by bay. The atlas mask marks the glass: a random share of windows
// glows warm at night, the rest are dark glossy panes. Roofs are painted tar paper.
const BAY_W = 2.6, SHOP_H = 4.6, FLOOR_H = 3.4;

function addFacadeShader(material, uniforms, atlas) {
  const { TW, TH, STYLES, W, H } = ATLAS;   // each instance's style comes from its aFacade attribute
  const n = (v) => v.toFixed(6);
  const roof = region('roof');
  const u = { ...uniforms, uFacade: { value: atlas.color }, uFacadeMask: { value: atlas.mask } };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aFacade;\nvarying vec4 vShineFacade;\nvarying vec3 vShineWorldPos;\nvarying vec3 vShineWorldNormal;\nvarying vec3 vShineBox;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vShineFacade = aFacade;
        vec4 shineWP = vec4(transformed, 1.0);
        vShineBox = vec3(0.0);
        #ifdef USE_INSTANCING
          shineWP = instanceMatrix * shineWP;
          vShineBox = instanceMatrix[3].xyz;
        #endif
        shineWP = modelMatrix * shineWP;
        vShineWorldPos = shineWP.xyz;
        vShineWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec4 vShineFacade;
        varying vec3 vShineWorldPos;
        varying vec3 vShineWorldNormal;
        varying vec3 vShineBox;
        uniform float uWindowGlow;
        uniform float uWindowLitRatio;
        uniform float uDaylight;
        uniform sampler2D uFacade;
        uniform sampler2D uFacadeMask;
        float shineHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 shineN = abs(vShineWorldNormal);
        float shineGlass = 0.0;
        vec3 shineGlow = vec3(0.0);
        if (shineN.y < 0.5) {
          bool faceX = shineN.x > shineN.z;
          // Per-instance values, rounded: interpolation can drift them by a hair, and the
          // window hash below would turn that into speckle.
          float kind = floor(vShineFacade.z + 0.5);
          float along = faceX ? vShineWorldPos.z : vShineWorldPos.x;
          // A bay window's narrow sides are shifted to show the middle of a window.
          if (kind > 0.5 && kind < 2.5 && (kind < 1.5) != faceX) along += vShineFacade.w;
          float faceSeed = floor((faceX ? vShineWorldPos.x : vShineWorldPos.z) * 0.37);
          float style = floor(vShineFacade.x + 0.5);
          bool shop = vShineBox.y < 0.5 && vShineWorldPos.y < ${SHOP_H.toFixed(1)};
          vec2 cell = vec2(along / ${BAY_W.toFixed(1)}, shop ? vShineWorldPos.y / ${SHOP_H.toFixed(1)} : (vShineWorldPos.y - (vShineBox.y < 0.5 ? ${SHOP_H.toFixed(1)} : vShineBox.y)) / ${FLOOR_H.toFixed(1)});
          vec2 id = floor(cell);
          vec2 f = clamp(fract(cell), 0.004, 0.996);
          // Atlas rows: 0-1 shopfronts (display window; door and window), 2-3 windows (sash;
          // arched). One bay in three of a shopfront is a door; one window kind per building.
          // Parapets are lower than a sill, so they show only brick.
          float row = shop ? step(0.66, shineHash(vec2(id.x, faceSeed) + 5.3)) : 2.0 + (kind > 2.5 ? 0.0 : floor(vShineFacade.y + 0.5));
          vec2 tileSize = vec2(${n(TW / W)}, ${n(TH / H)});
          vec2 uv = vec2(style * tileSize.x, 1.0 - (row + 1.0) * tileSize.y) + f * tileSize;
          vec2 gx = dFdx(cell) * tileSize, gy = dFdy(cell) * tileSize;
          diffuseColor.rgb *= textureGrad(uFacade, uv, gx, gy).rgb;
          // The mask covers the facade block only (the left part of the atlas).
          vec2 maskScale = vec2(${n(W / (TW * STYLES))}, 1.0);
          vec2 mk = textureGrad(uFacadeMask, uv * maskScale, gx * maskScale, gy * maskScale).rg;
          shineGlass = mk.r;
          // By day the panes reflect the sky instead of looking like holes.
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.25, 0.3) * (0.7 + 0.3 * f.y), shineGlass * uDaylight * 0.45);
          // Which windows are lit: per bay, shops a little more often.
          float h = shineHash(id + vec2(faceSeed, faceSeed * 1.7) + style * 3.1);
          float lit = step(1.0 - uWindowLitRatio * (shop ? 0.9 : 1.0), h);
          vec3 warm = mix(vec3(1.0, 0.42, 0.12), vec3(1.0, 0.66, 0.32), fract(h * 7.0)) * (0.35 + 0.65 * fract(h * 13.0)) * (shop ? 0.75 : 1.0);
          // Brighter low in the pane (lamp inside), with the curtain pattern from the mask.
          shineGlow = shineGlass * lit * warm * uWindowGlow * (0.55 + 0.45 * (1.0 - f.y)) * (0.6 + 0.4 * mk.g);
        } else if (vShineWorldNormal.y > 0.5) {
          // Tar-paper roofs, one painted sheet per 6 m.
          vec4 roofR = vec4(${roof.map(n).join(', ')});
          vec2 rc = vShineWorldPos.xz / vec2(6.0, ${n(6 * (roof[3] * H) / (roof[2] * W))});
          vec2 rf = clamp(fract(rc), 0.01, 0.99);
          diffuseColor.rgb *= textureGrad(uFacade, roofR.xy + rf * roofR.zw, dFdx(rc) * roofR.zw, dFdy(rc) * roofR.zw).rgb;
        } else {
          diffuseColor.rgb *= 0.3;                       // the undersides of the bay windows
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.16, shineGlass);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += shineGlow;`);
  };
  material.customProgramCacheKey = () => 'shine-facades';
}

// One city tile centred on an intersection, painted three times from the same seeded
// layout: colour, height (for the normal map) and roughness. Cobbled roads with worn tyre
// tracks, streetcar rails, crosswalk paint and a manhole; darker sidewalk slabs with joints
// and stains; granite curbs; puddles that are low, dark and glossy.
// Where each intersection's manhole sits: across the road (share of its half-width) and
// metres past the corner, down the approach toward +Z.
const GRATE = [0.35, 3];

function makeCityTile(rng, cfg) {
  const px = 1024;
  const m = px / cfg.blockSize;
  const mid = px / 2;
  const roadHalf = (cfg.roadWidth / 2) * m;
  const walkHalf = (cfg.roadWidth / 2 + cfg.sidewalk) * m;
  const layers = ['color', 'height', 'rough'].map(() => { const c = document.createElement('canvas'); c.width = c.height = px; return c; });
  const [cg, hg, rg] = layers.map((c) => c.getContext('2d'));
  const grey = (v) => `rgb(${v},${v},${v})`;
  // Paint a rectangle in all three layers: colour, height 0-255, roughness 0-255.
  const paint = (x, y, w, h, col, hgt, rgh) => {
    cg.fillStyle = col; cg.fillRect(x, y, w, h);
    hg.fillStyle = grey(hgt); hg.fillRect(x, y, w, h);
    rg.fillStyle = grey(rgh); rg.fillRect(x, y, w, h);
  };

  // Lots (paved yards behind the buildings).
  paint(0, 0, px, px, '#3a352f', 120, 235);
  // Sidewalks: darker slabs with joints and the odd stain.
  paint(mid - walkHalf, 0, walkHalf * 2, px, '#5a544c', 150, 220);
  paint(0, mid - walkHalf, px, walkHalf * 2, '#5a544c', 150, 220);
  const slab = 1.6 * m;
  for (const vertical of [true, false]) {
    for (let t = 0; t < px; t += slab) {
      for (let a = mid - walkHalf; a < mid + walkHalf; a += slab) {
        const l = Math.floor(rng.range(78, 98));
        const [x, y] = vertical ? [a, t] : [t, a];
        paint(x + 1.5, y + 1.5, slab - 3, slab - 3, `rgb(${l},${l - 4},${l - 10})`, 160 + rng.int(-6, 6), 215 + rng.int(-10, 10));
      }
    }
  }
  for (let k = 0; k < 40; k++) {
    cg.fillStyle = `rgba(20,16,12,${rng.range(0.1, 0.3)})`;
    cg.beginPath(); cg.ellipse(rng() * px, rng() * px, rng.range(4, 16), rng.range(3, 10), rng() * 3, 0, Math.PI * 2); cg.fill();
  }

  // Cobbled roads.
  paint(mid - roadHalf, 0, roadHalf * 2, px, '#2b2927', 60, 180);
  paint(0, mid - roadHalf, px, roadHalf * 2, '#2b2927', 60, 180);
  const stone = 0.5 * m;
  const cobble = (x0, y0, w, h) => {
    for (let y = y0, row = 0; y < y0 + h; y += stone, row++) {
      for (let x = x0 - (row & 1 ? stone / 2 : 0); x < x0 + w; x += stone) {
        const l = Math.floor(rng.range(60, 96)), xx = Math.max(x0, x), ww = Math.min(stone, x0 + w - xx) - 2;
        if (ww <= 0) continue;
        paint(xx + 1, y + 1, ww, stone - 2, `rgb(${l},${l - 3},${l - 7})`, 200 + rng.int(-25, 20), 225 + rng.int(-25, 15));
        hg.fillStyle = grey(212 + rng.int(-10, 18)); hg.fillRect(xx + 3, y + 3, ww - 5, stone - 7);   // worn, uneven tops
      }
    }
  };
  cobble(mid - roadHalf, 0, roadHalf * 2, px);
  cobble(0, mid - roadHalf, px, roadHalf * 2);

  // Worn, polished tyre tracks along each road (slightly smoother and darker).
  for (const off of [-0.55, 0.55]) {
    const x = mid + off * roadHalf;
    cg.fillStyle = 'rgba(0,0,0,0.12)'; cg.fillRect(x - 0.6 * m, 0, 1.2 * m, px); cg.fillRect(0, x - 0.6 * m, px, 1.2 * m);
    rg.fillStyle = 'rgba(80,80,80,0.35)'; rg.fillRect(x - 0.6 * m, 0, 1.2 * m, px); rg.fillRect(0, x - 0.6 * m, px, 1.2 * m);
  }

  // Curbs (granite, raised).
  const curb = 0.28 * m;
  for (const s of [-1, 1]) {
    paint(mid + s * roadHalf - curb / 2, 0, curb, px, '#7c766c', 255, 200);
    paint(0, mid + s * roadHalf - curb / 2, px, curb, '#7c766c', 255, 200);
  }
  // Clear the curbs back out across the intersection.
  cobble(mid - roadHalf, mid - roadHalf, roadHalf * 2, roadHalf * 2);

  // Crosswalks: worn white paint bars on each approach.
  for (let side = 0; side < 4; side++) {
    for (let k = 0; k < 6; k++) {
      const along = mid - roadHalf + (k + 0.5) * (roadHalf * 2) / 6 - 0.25 * m;
      const from = mid + (side < 2 ? 1 : -1) * (roadHalf + 0.6 * m), len = 2 * m;
      cg.fillStyle = `rgba(200,195,180,${rng.range(0.35, 0.6)})`;
      rg.fillStyle = 'rgba(150,150,150,0.8)';
      const r = side % 2 === 0
        ? [along, side < 2 ? from : from - len, 0.5 * m, len]
        : [side < 2 ? from : from - len, along, len, 0.5 * m];
      cg.fillRect(...r); rg.fillRect(...r);
    }
  }

  // Streetcar rails: shiny steel set in a groove.
  const gauge = 0.72 * m;
  for (const s of [-1, 1]) {
    for (const [x, y, w, h] of [[mid + s * gauge - 1.5, 0, 3, px], [0, mid + s * gauge - 1.5, px, 3]]) {
      paint(x, y, w, h, '#a8a8b0', 190, 40);
      hg.fillStyle = grey(120); hg.fillRect(x + (w > 3 ? 0 : 3), y + (w > 3 ? 3 : 0), w > 3 ? w : 2, w > 3 ? 2 : h);
    }
  }

  // A manhole cover on one approach (World.grates puts the steam on it).
  const mx = mid + roadHalf * GRATE[0], my = mid + roadHalf + GRATE[1] * m;
  cg.fillStyle = '#1e1c1a'; cg.beginPath(); cg.arc(mx, my, 0.4 * m, 0, Math.PI * 2); cg.fill();
  rg.fillStyle = grey(90); rg.beginPath(); rg.arc(mx, my, 0.4 * m, 0, Math.PI * 2); rg.fill();

  // Puddles: dark, glossy, sunk into the low spots of the road.
  for (let k = 0; k < 9; k++) {
    const onX = rng.chance(0.5);
    const x = onX ? mid + rng.range(-0.8, 0.8) * roadHalf : rng() * px;
    const y = onX ? rng() * px : mid + rng.range(-0.8, 0.8) * roadHalf;
    const rx = rng.range(0.6, 1.8) * m, ry = rng.range(0.4, 1.1) * m, rot = rng() * Math.PI;
    const blob = (ctx, style) => { ctx.fillStyle = style; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); ctx.fill(); };
    blob(cg, 'rgba(8,10,14,0.55)');
    blob(rg, 'rgba(10,10,10,0.92)');
    blob(hg, 'rgba(40,40,40,0.85)');
  }
  return layers;
}

// A tangent-space normal map from a height canvas (one pass at load; tiles seamlessly).
function normalMapFrom(canvas, strength = 1.3) {
  const w = canvas.width, h = canvas.height;
  const src = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const out = new Uint8Array(w * h * 4);
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1), o = (y * w + x) * 4;
      out[o] = (-dx / len * 0.5 + 0.5) * 255;
      out[o + 1] = (dy / len * 0.5 + 0.5) * 255;
      out[o + 2] = (1 / len * 0.5 + 0.5) * 255;
      out[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(out, w, h, THREE.RGBAFormat);
  tex.flipY = true;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

const _v = new THREE.Vector3(), _c = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3();
const _white = new THREE.Color(1, 1, 1), _tint = new THREE.Color();
const _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _m4 = new THREE.Matrix4(), _s = new THREE.Vector3();

function radialTexture(stops, size = 128) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [t, c] of stops) grad.addColorStop(t, c);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
export { radialTexture };

// A vertical gradient (top of the texture = stops[1]).
function gradientTexture(stops) {
  const cv = document.createElement('canvas');
  cv.width = 4; cv.height = 128;
  const g = cv.getContext('2d');
  const grad = g.createLinearGradient(0, 128, 0, 0);
  for (const [t, c] of stops) grad.addColorStop(t, c);
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 128);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
