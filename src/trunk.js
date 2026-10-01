import { CONFIG } from './config.js';

// The dredge run's trunk: a grid you pack loot into, Tetris-style. Pure logic (no DOM, no
// Three.js) so it can be tested on its own. A piece's shape is a list of [col, row] cells
// (CONFIG.dredge.loot.kinds); rotation turns it a quarter clockwise at a time.
export const KINDS = Object.fromEntries(CONFIG.dredge.loot.kinds.map((k) => [k.id, k]));

// The cells of `kindId` turned `rot` quarter-turns clockwise, shifted to start at 0, 0.
export function shape(kindId, rot = 0) {
  let cells = KINDS[kindId].cells.map(([c, r]) => [c, r]);
  for (let k = 0; k < ((rot % 4) + 4) % 4; k++) cells = cells.map(([c, r]) => [-r, c]);
  const minC = Math.min(...cells.map((p) => p[0])), minR = Math.min(...cells.map((p) => p[1]));
  return cells.map(([c, r]) => [c - minC, r - minR]);
}

export function shapeSize(cells) {
  return { w: Math.max(...cells.map((p) => p[0])) + 1, h: Math.max(...cells.map((p) => p[1])) + 1 };
}

export class Trunk {
  constructor(cols = CONFIG.dredge.trunk.cols, rows = CONFIG.dredge.trunk.rows) {
    this.cols = cols;
    this.rows = rows;
    this.grid = new Int16Array(cols * rows).fill(-1);
    this.pieces = new Map();      // id -> { id, kind, rot, x, y, cells: [[col, row]] (absolute) }
    this._next = 0;
  }

  get count() { return this.pieces.size; }
  get used() { return this.grid.reduce((n, v) => n + (v >= 0 ? 1 : 0), 0); }
  get size() { return this.cols * this.rows; }
  get value() { let v = 0; for (const p of this.pieces.values()) v += KINDS[p.kind].value; return v; }

  pieceAt(x, y) {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return null;
    const id = this.grid[y * this.cols + x];
    return id >= 0 ? this.pieces.get(id) : null;
  }

  // The pieces a shape at x, y would overlap (and whether it stays inside the trunk).
  overlaps(kindId, x, y, rot) {
    const ids = new Set();
    let inside = true;
    for (const [c, r] of shape(kindId, rot)) {
      const cx = x + c, cy = y + r;
      if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) { inside = false; continue; }
      const id = this.grid[cy * this.cols + cx];
      if (id >= 0) ids.add(id);
    }
    return { inside, ids: [...ids] };
  }

  canPlace(kindId, x, y, rot = 0, ignore = -1) {
    const o = this.overlaps(kindId, x, y, rot);
    return o.inside && o.ids.every((id) => id === ignore);
  }

  place(kindId, x, y, rot = 0) {
    if (!this.canPlace(kindId, x, y, rot)) return null;
    const id = this._next++;
    const cells = shape(kindId, rot).map(([c, r]) => [x + c, y + r]);
    for (const [cx, cy] of cells) this.grid[cy * this.cols + cx] = id;
    const piece = { id, kind: kindId, rot, x, y, cells };
    this.pieces.set(id, piece);
    return piece;
  }

  remove(id) {
    const p = this.pieces.get(id);
    if (!p) return null;
    for (const [cx, cy] of p.cells) this.grid[cy * this.cols + cx] = -1;
    this.pieces.delete(id);
    return p;
  }

  // The first spot (any rotation) where the piece fits, scanning rows top to bottom.
  findSpot(kindId) {
    for (let rot = 0; rot < 4; rot++) {
      for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.cols; x++) {
        if (this.canPlace(kindId, x, y, rot)) return { x, y, rot };
      }
    }
    return null;
  }

  clear() {
    this.grid.fill(-1);
    this.pieces.clear();
  }

  toJSON() {
    return { cols: this.cols, rows: this.rows, pieces: [...this.pieces.values()].map(({ kind, rot, x, y }) => ({ kind, rot, x, y })) };
  }

  static fromJSON(data) {
    const t = new Trunk(data.cols, data.rows);
    for (const p of data.pieces || []) if (KINDS[p.kind]) t.place(p.kind, p.x, p.y, p.rot);
    return t;
  }
}
