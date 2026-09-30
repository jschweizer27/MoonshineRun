// 2D collision on the ground (XZ) plane. Static colliders (boxes, circles, capsules)
// live in a uniform grid; vehicles are resolved as circles. Also answers line-of-sight
// queries so pursuers can't see through buildings.
const OFFSET = 2048;
const cellKey = (ix, iz) => ((ix + OFFSET) << 12) | (iz + OFFSET);

export class CollisionWorld {
  constructor(cellSize = 44) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.zones = [];          // drivable rectangles; the player must stay inside their union
    this._stamp = 0;
  }

  addBox(minX, minZ, maxX, maxZ, opts = {}) {
    return this._insert({ type: 'box', minX, minZ, maxX, maxZ, blocksSight: opts.blocksSight ?? true, tag: opts.tag ?? 'box' });
  }

  addCircle(x, z, r, opts = {}) {
    return this.addCapsule(x, z, x, z, r, opts);
  }

  addCapsule(ax, az, bx, bz, r, opts = {}) {
    return this._insert({
      type: 'capsule', ax, az, bx, bz, r,
      minX: Math.min(ax, bx) - r, minZ: Math.min(az, bz) - r,
      maxX: Math.max(ax, bx) + r, maxZ: Math.max(az, bz) + r,
      blocksSight: opts.blocksSight ?? false, tag: opts.tag ?? 'capsule',
    });
  }

  addZone(minX, minZ, maxX, maxZ) {
    this.zones.push({ minX, minZ, maxX, maxZ });
  }

  remove(c) {
    for (const key of c._cells) {
      const list = this.cells.get(key);
      const i = list ? list.indexOf(c) : -1;
      if (i >= 0) list.splice(i, 1);
    }
    c._cells = [];
  }

  _insert(c) {
    c._cells = [];
    c._stamp = 0;
    const s = this.cellSize;
    for (let ix = Math.floor(c.minX / s); ix <= Math.floor(c.maxX / s); ix++) {
      for (let iz = Math.floor(c.minZ / s); iz <= Math.floor(c.maxZ / s); iz++) {
        const key = cellKey(ix, iz);
        if (!this.cells.has(key)) this.cells.set(key, []);
        this.cells.get(key).push(c);
        c._cells.push(key);
      }
    }
    return c;
  }

  // Visit each collider overlapping the rectangle once.
  query(minX, minZ, maxX, maxZ, visit) {
    const s = this.cellSize;
    const stamp = ++this._stamp;
    for (let ix = Math.floor(minX / s); ix <= Math.floor(maxX / s); ix++) {
      for (let iz = Math.floor(minZ / s); iz <= Math.floor(maxZ / s); iz++) {
        const list = this.cells.get(cellKey(ix, iz));
        if (!list) continue;
        for (const c of list) {
          if (c._stamp === stamp) continue;
          c._stamp = stamp;
          if (c.maxX < minX || c.minX > maxX || c.maxZ < minZ || c.minZ > maxZ) continue;
          visit(c);
        }
      }
    }
  }

  // Push a circle out of everything it overlaps. Returns the corrected position and the
  // summed push direction (zero if nothing was hit).
  resolveCircle(x, z, r) {
    let nx = 0, nz = 0, hit = false;
    for (let pass = 0; pass < 2; pass++) {
      this.query(x - r, z - r, x + r, z + r, (c) => {
        const p = c.type === 'box' ? pushFromBox(x, z, r, c) : pushFromCapsule(x, z, r, c);
        if (p) { x += p[0]; z += p[1]; nx += p[0]; nz += p[1]; hit = true; }
      });
    }
    const b = this._pushIntoZones(x, z, r);
    if (b) { x += b[0]; z += b[1]; nx += b[0]; nz += b[1]; hit = true; }
    return { x, z, nx, nz, hit };
  }

  _pushIntoZones(x, z, r) {
    if (!this.zones.length) return null;
    let best = null, bestD = Infinity;
    for (const zn of this.zones) {
      const cx = clamp(x, zn.minX + r, zn.maxX - r);
      const cz = clamp(z, zn.minZ + r, zn.maxZ - r);
      if (cx === x && cz === z) return null; // fully inside one zone
      const d = (cx - x) ** 2 + (cz - z) ** 2;
      if (d < bestD) { bestD = d; best = [cx - x, cz - z]; }
    }
    return best;
  }

  // True if a sight-blocking collider (building, barn, roadblock) sits between A and B.
  segmentBlocked(ax, az, bx, bz) {
    let blocked = false;
    this.query(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), (c) => {
      if (!blocked && c.blocksSight && c.type === 'box' && segmentHitsBox(ax, az, bx, bz, c)) blocked = true;
    });
    return blocked;
  }
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

function pushFromBox(x, z, r, b) {
  const cx = clamp(x, b.minX, b.maxX);
  const cz = clamp(z, b.minZ, b.maxZ);
  const dx = x - cx, dz = z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2);
    return [(dx / d) * (r - d), (dz / d) * (r - d)];
  }
  // Center is inside the box: leave through the nearest face.
  const exits = [
    [b.minX - r - x, 0], [b.maxX + r - x, 0],
    [0, b.minZ - r - z], [0, b.maxZ + r - z],
  ];
  exits.sort((p, q) => Math.abs(p[0] + p[1]) - Math.abs(q[0] + q[1]));
  return exits[0];
}

function pushFromCapsule(x, z, r, c) {
  const ex = c.bx - c.ax, ez = c.bz - c.az;
  const len2 = ex * ex + ez * ez;
  const t = len2 > 0 ? clamp(((x - c.ax) * ex + (z - c.az) * ez) / len2, 0, 1) : 0;
  const qx = c.ax + ex * t, qz = c.az + ez * t;
  const dx = x - qx, dz = z - qz;
  const rr = r + c.r;
  const d2 = dx * dx + dz * dz;
  if (d2 >= rr * rr) return null;
  const d = Math.sqrt(d2) || 1e-4;
  return [(dx / d) * (rr - d), (dz / d) * (rr - d)];
}

// Liang-Barsky clip of segment AB against an axis-aligned box.
export function segmentHitsBox(ax, az, bx, bz, b) {
  const dx = bx - ax, dz = bz - az;
  const p = [-dx, dx, -dz, dz];
  const q = [ax - b.minX, b.maxX - ax, az - b.minZ, b.maxZ - az];
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
  }
  return true;
}
