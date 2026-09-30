import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createRng } from './rng.js';
import { CollisionWorld } from './collision.js';
import { RoadGraph } from './roadgraph.js';

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
    this.uniforms = {
      uWindowGlow: { value: 1.1 },
      uWindowLitRatio: { value: 0.45 },
    };

    this._buildLights();
    this._buildGround();
    this._buildRoadGraph();
    this._buildBuildings();
    this._buildLamps();
    this._buildBounds();
  }

  _buildLights() {
    const s = this.scene;
    s.background = new THREE.Color(0x141c30);
    s.fog = new THREE.Fog(0x141c30, 70, 430);

    // Cool moonlit sky over warm ground bounce keeps the night readable.
    this.hemi = new THREE.HemisphereLight(0x8196d0, 0x3a3026, 2.4);
    s.add(this.hemi);

    this.moon = new THREE.DirectionalLight(0xc2d0ff, 1.5);
    this.moon.position.set(-120, 220, -90);
    s.add(this.moon);

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
    addWall(-wallOut, -wallOut, wallOut, -wallIn);   // north
    addWall(-wallOut, wallIn, wallOut, wallOut);     // south
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
    this.lampSpots = spots;
    const n = spots.length;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);

    const poles = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.1, 0.16, 5.2, 6).translate(0, 2.6, 0),
      new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.6, metalness: 0.5 }), n);
    this.lampColor = new THREE.Color(0xffc27a);
    this.bulbMaterial = new THREE.MeshBasicMaterial({ color: this.lampColor.clone() });
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.32, 10, 8), this.bulbMaterial, n);
    this.poolMaterial = new THREE.MeshBasicMaterial({
      map: radialTexture([[0, 'rgba(255,196,120,0.95)'], [0.45, 'rgba(255,170,90,0.35)'], [1, 'rgba(255,150,70,0)']]),
      color: 0xffffff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    });
    const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.poolMaterial, n);
    const haloPos = new Float32Array(n * 3);

    spots.forEach((sp, k) => {
      poles.setMatrixAt(k, m.compose(p.set(sp.x, 0, sp.z), q, s.set(1, 1, 1)));
      bulbs.setMatrixAt(k, m.compose(p.set(sp.x, 5.35, sp.z), q, s));
      pools.setMatrixAt(k, m.compose(p.set(sp.x + sp.tx * 2.5, 0.04, sp.z + sp.tz * 2.5), q, s.set(22, 1, 22)));
      haloPos.set([sp.x, 5.35, sp.z], k * 3);
      this.collision.addCircle(sp.x, sp.z, 0.25, { tag: 'lamp' });
    });
    for (const im of [poles, bulbs, pools]) { im.instanceMatrix.needsUpdate = true; this.scene.add(im); }
    pools.renderOrder = 1;

    const haloGeo = new THREE.BufferGeometry();
    haloGeo.setAttribute('position', new THREE.BufferAttribute(haloPos, 3));
    this.haloMaterial = new THREE.PointsMaterial({
      map: radialTexture([[0, 'rgba(255,230,180,1)'], [0.25, 'rgba(255,190,110,0.5)'], [1, 'rgba(255,160,80,0)']]),
      size: 3.4, sizeAttenuation: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, color: 0xffffff,
    });
    this.scene.add(new THREE.Points(haloGeo, this.haloMaterial));
  }

  _buildBounds() {
    const e = this.edge;
    this.collision.addZone(-e, -e, e, e);
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

  setAnisotropy(n) {
    this.groundTexture.anisotropy = n;
    this.groundTexture.needsUpdate = true;
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
          vec3 warm = mix(vec3(1.0, 0.68, 0.34), vec3(1.0, 0.86, 0.6), fract(h * 7.0));
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
