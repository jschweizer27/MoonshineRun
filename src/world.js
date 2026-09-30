import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createRng } from './rng.js';
import { CollisionWorld } from './collision.js';
import { RoadGraph } from './roadgraph.js';
import { buildCounty, COUNTY } from './county.js';

// Named drop sites around the city (intersections), for the order board.
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
const NEON = ['#ff5a8a', '#5ae0ff', '#ffd05a', '#7dff8a', '#ff7a4a', '#f2f2ff'];

// The 1920s city: a street grid with cobbles and streetcar rails, brick blocks with lit
// windows, and gas lamps. Street lighting is faked with glowing decals instead of
// hundreds of real lights, and every repeated object is instanced, so the whole city
// costs only a handful of draw calls.
export class World {
  constructor(scene, { seed = CONFIG.seed } = {}) {
    this.scene = scene;
    this.cfg = CONFIG.world;
    this.rng = createRng(seed);
    this.collision = new CollisionWorld(this.cfg.blockSize);
    this.roads = new RoadGraph();
    this.buildings = [];   // footprints { minX, minZ, maxX, maxZ, h }
    this.extraLights = []; // lantern glows (no pole) added by the county
    this.uniforms = {
      uWindowGlow: { value: 1.1 },
      uWindowLitRatio: { value: 0.45 },
    };

    this._buildLights();
    this._buildGround();
    this._buildRoadGraph();
    this._buildBuildings();
    const county = buildCounty(this, this.rng);
    this.barns = county.barns;
    this.hideout = county.hideout;
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
    // Each buyer's corner building carries its sign.
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

    // Rooftops: water towers on the tall ones, chimneys on the rest.
    const towers = [], chimneys = [];
    for (const b of city) {
      const top = b.h > 40 ? b.h * 1.48 : b.h > 26 ? b.h * 1.3 : b.h;
      const scale = b.h > 40 ? 0.46 : b.h > 26 ? 0.72 : 1;
      const w = (b.maxX - b.minX) * scale, d = (b.maxZ - b.minZ) * scale;
      const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
      if (b.h > 18 && rng.chance(0.4) && w > 5 && d > 5) towers.push([cx + rng.range(-w / 4, w / 4), top, cz + rng.range(-d / 4, d / 4)]);
      else if (rng.chance(0.5)) chimneys.push([cx + rng.range(-w / 3, w / 3), top, cz + rng.range(-d / 3, d / 3)]);
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.9 });
    const tank = new THREE.InstancedMesh(new THREE.CylinderGeometry(2, 2, 3.6, 12).translate(0, 4.6, 0), wood, towers.length);
    const cap = new THREE.InstancedMesh(new THREE.ConeGeometry(2.3, 1.6, 12).translate(0, 7.2, 0), new THREE.MeshStandardMaterial({ color: 0x2c2c30, roughness: 0.8 }), towers.length);
    const legs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.12, 2.8, 5).translate(0, 1.4, 0), new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.6 }), towers.length * 4);
    towers.forEach(([x, y, z], i) => {
      tank.setMatrixAt(i, m.compose(p.set(x, y, z), q, s));
      cap.setMatrixAt(i, m.compose(p.set(x, y, z), q, s));
      [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]].forEach(([lx, lz], k) => legs.setMatrixAt(i * 4 + k, m.compose(p.set(x + lx, y, z + lz), q, s)));
    });
    const chim = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 2.4, 0.9).translate(0, 1.2, 0), new THREE.MeshStandardMaterial({ color: 0x5a2e24, roughness: 0.95 }), chimneys.length);
    chimneys.forEach(([x, y, z], i) => chim.setMatrixAt(i, m.compose(p.set(x, y, z), q, s)));
    for (const im of [tank, cap, legs, chim]) { im.instanceMatrix.needsUpdate = true; this.scene.add(im); }
  }

  inCounty(p) { return p.z < -250; }

  _buildLights() {
    const s = this.scene, L = CONFIG.look;
    s.background = new THREE.Color(L.sky);
    s.fog = new THREE.FogExp2(L.sky, L.fogDensity);

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

    // One shared effects light (fires, muzzle flashes). It always exists, even at zero
    // intensity, so the light count never changes and shaders never recompile.
    this.fxLight = new THREE.PointLight(0xff8a3a, 0, 60, 1.6);
    this.fxLight.position.set(0, -50, 0);
    s.add(this.fxLight);
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
    const tex = new THREE.CanvasTexture(makeCityTile(this.rng, this.cfg));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(tiles, tiles);
    this.groundTexture = tex;
    this.roadMaterial = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0 });
    const city = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), this.roadMaterial);
    this.scene.add(city);
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
    const addBuilding = (minX, minZ, maxX, maxZ, h) => {
      const color = rng.pick(brick);
      const w = maxX - minX, d = maxZ - minZ, x = (minX + maxX) / 2, z = (minZ + maxZ) / 2;
      boxes.push({ x, z, w, d, h, y: 0, color });
      // Art-deco setbacks on the tall ones.
      if (h > 26) boxes.push({ x, z, w: w * 0.72, d: d * 0.72, h: h * 0.3, y: h, color });
      if (h > 40) boxes.push({ x, z, w: w * 0.46, d: d * 0.46, h: h * 0.18, y: h * 1.3, color });
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

    // One instanced mesh for every box, with procedural lit windows.
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.02 });
    addWindowShader(mat, this.uniforms);
    const mesh = new THREE.InstancedMesh(geo, mat, boxes.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const c = new THREE.Color();
    boxes.forEach((b, k) => {
      m.compose(p.set(b.x, b.y, b.z), q, s.set(b.w, b.h, b.d));
      mesh.setMatrixAt(k, m);
      mesh.setColorAt(k, c.setHex(b.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    this.buildingMesh = mesh;
    this.scene.add(mesh);
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
    const poles = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.09, 0.15, 5.0, 6).translate(0, 2.5, 0),
      new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.55, metalness: 0.6 }), n);
    // 1920s lantern heads: a glowing glass box under a dark iron cap.
    this.lampColor = new THREE.Color(L.lampColor);
    this.bulbMaterial = new THREE.MeshBasicMaterial({ color: this.lampColor.clone() });
    const bulbs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.58, 0.42), this.bulbMaterial, n);
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
      poles.setMatrixAt(k, m.compose(p.set(sp.x, 0, sp.z), q, s.set(pole ? 1 : 0, pole ? 1 : 0, pole ? 1 : 0)));
      bulbs.setMatrixAt(k, m.compose(p.set(sp.x, y, sp.z), q, s.set(1, 1, 1)));
      caps.setMatrixAt(k, m);
      cones.setMatrixAt(k, m.compose(p.set(sp.x, y - 0.3, sp.z), q, s.set(1, (y - 0.3) / 5, 1)));
      pools.setMatrixAt(k, m.compose(p.set(sp.x + sp.tx * 2, 0.04, sp.z + sp.tz * 2), q, s.set(20, 1, 20)));
      pools.setColorAt(k, white);
      haloPos.set([sp.x, y, sp.z], k * 3);
      if (pole) this.collision.addCircle(sp.x, sp.z, 0.25, { tag: 'lamp' });
    });
    for (const im of [poles, bulbs, caps, cones, pools]) { im.instanceMatrix.needsUpdate = true; this.scene.add(im); }
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
    let li = 0;
    for (let i = 0; i < active; i++) {
      const k = rank[i];
      if (k < 0) continue;
      const sp = spots[k], w = weight(dist[i]) * this.lampLevel;
      const light = i === spotIdx ? this.lampSpot : this.lampLights[li++];
      if (!light || !light.visible) continue;
      light.position.set(sp.x, sp.y - 0.35, sp.z);
      light.intensity = L.lampIntensity * w * (light.isSpotLight ? 1.6 : 1);
      if (light.isSpotLight) { light.target.position.set(sp.x + sp.tx * 1.5, 0, sp.z + sp.tz * 1.5); light.target.updateMatrixWorld(); }
      // Its real light replaces the fake pool decal.
      this.lampPools.setColorAt(k, _tint.setScalar(1 - 0.6 * w));
      this._dimmed.push(k);
    }
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
      { text: 'GREEN SPRING VALLEY', x: 0, z: -610 }, { text: 'MONKTON', x: 0, z: -1015 },
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

  lineOfSight(a, b) {
    return !this.collision.segmentBlocked(a.x, a.z, b.x, b.z);
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
    this.groundTexture.anisotropy = n;
    this.groundTexture.needsUpdate = true;
  }

  // Graphics level: low drops the lamp halos (lots of overdraw on weak GPUs). The
  // environment also hides them by day.
  setDetail(level) {
    this.detailHalos = level !== 'low';
    this.halos.visible = this.detailHalos;
  }
}

// Procedural lit windows: computed from world position, so every building of any size
// gets correctly spaced windows from one shared material.
function addWindowShader(material, uniforms) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vShineWorldPos;\nvarying vec3 vShineWorldNormal;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 shineWP = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          shineWP = instanceMatrix * shineWP;
        #endif
        shineWP = modelMatrix * shineWP;
        vShineWorldPos = shineWP.xyz;
        vShineWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vShineWorldPos;
        varying vec3 vShineWorldNormal;
        uniform float uWindowGlow;
        uniform float uWindowLitRatio;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec3 shineN = abs(vShineWorldNormal);
        if (shineN.y < 0.5) {
          bool faceX = shineN.x > shineN.z;
          float along = faceX ? vShineWorldPos.z : vShineWorldPos.x;
          float faceSeed = floor((faceX ? vShineWorldPos.x : vShineWorldPos.z) * 0.37);
          vec2 cell = vec2(along / 2.6, (vShineWorldPos.y - 1.2) / 3.4);
          vec2 id = floor(cell);
          vec2 f = fract(cell);
          float win = step(0.22, f.x) * step(f.x, 0.78) * step(0.3, f.y) * step(f.y, 0.84) * step(0.0, id.y);
          float h = fract(sin(dot(id + vec2(faceSeed, faceSeed * 1.7), vec2(12.9898, 78.233))) * 43758.5453);
          float lit = step(1.0 - uWindowLitRatio, h);
          vec3 warm = mix(vec3(1.0, 0.5, 0.18), vec3(1.0, 0.74, 0.42), fract(h * 7.0)) * (0.45 + 0.55 * fract(h * 13.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.06, 0.08), win * 0.85);
          totalEmissiveRadiance += win * lit * warm * uWindowGlow;
        }`);
  };
  material.customProgramCacheKey = () => 'shine-windows';
}

// One city tile centered on an intersection: cobbled roads with streetcar rails,
// sidewalks with slab joints and curbs, and paved lots in the corners.
function makeCityTile(rng, cfg) {
  const px = 1024;
  const m = px / cfg.blockSize;
  const mid = px / 2;
  const roadHalf = (cfg.roadWidth / 2) * m;
  const walkHalf = (cfg.roadWidth / 2 + cfg.sidewalk) * m;
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const g = cv.getContext('2d');

  // Lots.
  g.fillStyle = '#4a433b';
  g.fillRect(0, 0, px, px);
  for (let k = 0; k < 2500; k++) {
    g.fillStyle = `rgba(${rng() < 0.5 ? '0,0,0' : '255,240,220'},${rng.range(0.03, 0.08)})`;
    g.fillRect(rng() * px, rng() * px, rng.range(2, 6), rng.range(2, 6));
  }

  // Sidewalks with slab joints.
  g.fillStyle = '#8a837a';
  g.fillRect(mid - walkHalf, 0, walkHalf * 2, px);
  g.fillRect(0, mid - walkHalf, px, walkHalf * 2);
  g.strokeStyle = 'rgba(40,35,30,0.35)';
  g.lineWidth = 1.5;
  const slab = 1.6 * m;
  for (let t = 0; t < px; t += slab) {
    g.beginPath(); g.moveTo(mid - walkHalf, t); g.lineTo(mid + walkHalf, t); g.stroke();
    g.beginPath(); g.moveTo(t, mid - walkHalf); g.lineTo(t, mid + walkHalf); g.stroke();
  }

  // Cobbled roads.
  g.fillStyle = '#3c3a38';
  g.fillRect(mid - roadHalf, 0, roadHalf * 2, px);
  g.fillRect(0, mid - roadHalf, px, roadHalf * 2);
  const stone = 0.55 * m;
  const cobble = (x0, y0, w, h) => {
    for (let y = y0, row = 0; y < y0 + h; y += stone, row++) {
      for (let x = x0 - (row & 1 ? stone / 2 : 0); x < x0 + w; x += stone) {
        const l = Math.floor(rng.range(70, 104));
        g.fillStyle = `rgb(${l},${l - 3},${l - 7})`;
        g.fillRect(Math.max(x0, x) + 1, y + 1, Math.min(stone, x0 + w - Math.max(x0, x)) - 2, stone - 2);
      }
    }
  };
  cobble(mid - roadHalf, 0, roadHalf * 2, px);
  cobble(0, mid - roadHalf, px, roadHalf * 2);

  // Curbs.
  g.fillStyle = '#b3ab9e';
  const curb = 0.25 * m;
  for (const s of [-1, 1]) {
    g.fillRect(mid + s * roadHalf - curb / 2, 0, curb, px);
    g.fillRect(0, mid + s * roadHalf - curb / 2, px, curb);
  }
  // Clear the curbs back out across the intersection.
  cobble(mid - roadHalf, mid - roadHalf, roadHalf * 2, roadHalf * 2);

  // Streetcar rails (Baltimore ran streetcars down most streets).
  g.strokeStyle = 'rgba(205,205,215,0.75)';
  g.lineWidth = 2.2;
  const gauge = 0.72 * m;
  for (const s of [-1, 1]) {
    g.beginPath(); g.moveTo(mid + s * gauge, 0); g.lineTo(mid + s * gauge, px); g.stroke();
    g.beginPath(); g.moveTo(0, mid + s * gauge); g.lineTo(px, mid + s * gauge); g.stroke();
  }
  return cv;
}

const _v = new THREE.Vector3(), _c = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3();
const _white = new THREE.Color(1, 1, 1), _tint = new THREE.Color();

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
