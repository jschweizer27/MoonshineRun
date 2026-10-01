// Corner radar (heading-up or north-up) and the full-screen map. The static map (roads,
// buildings) is drawn once into an offscreen canvas; each frame only draws the visible
// slice plus the route and icons. Markers use distinct shapes, not just colours.
const LAYER_SCALE = 1;                   // pixels per metre in the prerendered layer
const COLORS = { still: '#e0a83a', drop: '#5aa7d8', hideout: '#8fd18a', goal: '#f2c55c', gold: '#f2c55c', loot: '#f0d070', me: '#ece3cf', fed: ['#ff3b30', '#3b82ff'], zealot: '#ff8a2a' };

export class MiniMap {
  constructor(world, canvas, bigCanvas) {
    this.world = world;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.big = bigCanvas;
    this.rotate = true;
    this.radius = 150;
    this.route = [];
    this._routeTimer = 0;
    this._routeTarget = null;
    this.bounds = world.mapBounds;
    this.layer = this._prerender();
  }

  _prerender() {
    const b = this.bounds;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil((b.maxX - b.minX) * LAYER_SCALE);
    cv.height = Math.ceil((b.maxZ - b.minZ) * LAYER_SCALE);
    const g = cv.getContext('2d');
    const X = (x) => (x - b.minX) * LAYER_SCALE, Z = (z) => (z - b.minZ) * LAYER_SCALE;
    g.fillStyle = '#12141b';
    g.fillRect(0, 0, cv.width, cv.height);
    if (this.world.drawMapGround) this.world.drawMapGround(g, X, Z, LAYER_SCALE);
    // Roads from the road graph.
    g.strokeStyle = '#5b5750';
    g.lineCap = 'round';
    g.lineWidth = this.world.cfg.roadWidth * LAYER_SCALE;
    g.beginPath();
    for (const n of this.world.roads.nodes) {
      for (const id of n.links) {
        if (id < n.id) continue;
        const m = this.world.roads.nodes[id];
        g.moveTo(X(n.x), Z(n.z));
        g.lineTo(X(m.x), Z(m.z));
      }
    }
    g.stroke();
    // Buildings.
    g.fillStyle = '#2c2723';
    for (const r of this.world.buildings) g.fillRect(X(r.minX), Z(r.minZ), (r.maxX - r.minX) * LAYER_SCALE, (r.maxZ - r.minZ) * LAYER_SCALE);
    return cv;
  }

  // Recompute the GPS route along the roads, around any roadblocks (cheap; throttled).
  updateRoute(dt, from, to, blocked = null) {
    this._routeTimer -= dt;
    const moved = !this._routeTarget || this._routeTarget.x !== to.x || this._routeTarget.z !== to.z;
    const blocks = blocked ? blocked.size : 0;
    if (this._routeTimer > 0 && !moved && blocks === this._blocks) return;
    this._routeTimer = 0.5;
    this._blocks = blocks;
    this._routeTarget = { x: to.x, z: to.z };
    const roads = this.world.roads;
    const a = roads.nearest(from.x, from.z), b = roads.nearest(to.x, to.z);
    const ids = roads.path(a.id, b.id, blocked) || roads.path(a.id, b.id) || [];
    this.route = [...ids.map((i) => roads.nodes[i]), { x: to.x, z: to.z }];
  }

  _fit(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr) || canvas.width;
    if (canvas.width !== w) { canvas.width = w; canvas.height = w; }
    return w;
  }

  draw(player, markers, police, time) {
    if (!this.canvas.offsetParent) return;   // hidden
    const g = this.ctx;
    const size = this._fit(this.canvas);
    const c = size / 2;
    const s = size / (2 * this.radius);      // px per metre
    const p = player.position;
    const h = player.heading;
    const b = this.bounds;
    g.save();
    g.clearRect(0, 0, size, size);
    g.beginPath();
    g.arc(c, c, c, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#12141b';
    g.fillRect(0, 0, size, size);
    g.translate(c, c);
    if (this.rotate) g.rotate(-h);
    g.drawImage(this.layer, (b.minX - p.x) * s, (b.minZ - p.z) * s, this.layer.width * (s / LAYER_SCALE), this.layer.height * (s / LAYER_SCALE));
    this._drawRoute(g, (x) => (x - p.x) * s, (z) => (z - p.z) * s, Math.max(2, size / 60));
    g.restore();

    // Icons stay upright: rotate their positions by hand and clamp to the rim.
    const cos = Math.cos(-h), sin = Math.sin(-h);
    const place = (x, z) => {
      let dx = (x - p.x) * s, dz = (z - p.z) * s;
      if (this.rotate) [dx, dz] = [dx * cos - dz * sin, dx * sin + dz * cos];
      const d = Math.hypot(dx, dz), max = c - size * 0.07;
      const edge = d > max;
      if (edge) { dx *= max / d; dz *= max / d; }
      return [c + dx, c + dz, edge];
    };
    const r = size * 0.045;
    for (const m of markers) { const [x, y] = place(m.x, m.z); drawMarker(g, m.kind, x, y, r); }
    for (const u of police) {
      const [x, y] = place(u.x, u.z);
      g.fillStyle = u.kind === 'fed' ? COLORS.fed[Math.floor(time * 4) % 2] : COLORS.zealot;
      g.fillRect(x - r * 0.7, y - r * 0.7, r * 1.4, r * 1.4);
    }
    drawPlayer(g, c, c, this.rotate ? 0 : h, r * 1.3);
    if (this.rotate) {
      const [nx, ny] = [c + (c - size * 0.08) * Math.sin(-h), c - (c - size * 0.08) * Math.cos(-h)];
      g.fillStyle = '#ece3cf';
      g.font = `bold ${Math.round(size * 0.075)}px Georgia, serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('N', nx, ny);
    }
  }

  _drawRoute(g, X, Z, width) {
    if (this.route.length < 2) return;
    g.strokeStyle = COLORS.gold;
    g.globalAlpha = 0.85;
    g.lineWidth = width;
    g.lineJoin = 'round';
    g.beginPath();
    this.route.forEach((n, i) => (i ? g.lineTo(X(n.x), Z(n.z)) : g.moveTo(X(n.x), Z(n.z))));
    g.stroke();
    g.globalAlpha = 1;
  }

  // Full map, north up, whole world fitted to the canvas.
  drawBig(player, markers, police, time) {
    const cv = this.big;
    const size = this._fit(cv);
    const g = cv.getContext('2d');
    const b = this.bounds;
    const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
    const s = (size * 0.96) / span;
    const ox = (size - (b.maxX - b.minX) * s) / 2, oz = (size - (b.maxZ - b.minZ) * s) / 2;
    const X = (x) => ox + (x - b.minX) * s, Z = (z) => oz + (z - b.minZ) * s;
    g.fillStyle = '#0b0d14';
    g.fillRect(0, 0, size, size);
    g.drawImage(this.layer, ox, oz, this.layer.width * (s / LAYER_SCALE), this.layer.height * (s / LAYER_SCALE));
    this._drawRoute(g, X, Z, Math.max(2, size / 150));
    if (this.world.mapLabels) {
      g.fillStyle = 'rgba(236,227,207,0.55)';
      g.font = `${Math.round(size / 42)}px Georgia, serif`;
      g.textAlign = 'center';
      for (const l of this.world.mapLabels) g.fillText(l.text, X(l.x), Z(l.z));
    }
    const r = size / 70;
    for (const m of markers) drawMarker(g, m.kind, X(m.x), Z(m.z), r);
    for (const u of police) {
      g.fillStyle = u.kind === 'fed' ? COLORS.fed[Math.floor(time * 4) % 2] : COLORS.zealot;
      g.fillRect(X(u.x) - r * 0.7, Z(u.z) - r * 0.7, r * 1.4, r * 1.4);
    }
    drawPlayer(g, X(player.position.x), Z(player.position.z), player.heading, r * 1.5);
  }
}

// still = circle, drop = diamond, hideout = house, goal = flag, loot = small square (shape + colour for
// colour-blind players)
function drawMarker(g, kind, x, y, r) {
  g.lineWidth = Math.max(1.5, r * 0.3);
  g.strokeStyle = '#0b0d14';
  g.fillStyle = COLORS[kind] || '#fff';
  g.beginPath();
  if (kind === 'loot') {
    // Loot: a small square, smaller than the places you drive to.
    g.rect(x - r * 0.55, y - r * 0.55, r * 1.1, r * 1.1);
  } else if (kind === 'goal') {
    g.rect(x - r * 0.9, y - r * 1.3, r * 0.35, r * 2.6);
    g.moveTo(x - r * 0.55, y - r * 1.3); g.lineTo(x + r * 1.2, y - r * 0.75); g.lineTo(x - r * 0.55, y - r * 0.2); g.closePath();
  } else if (kind === 'drop') {
    g.moveTo(x, y - r * 1.25); g.lineTo(x + r * 1.25, y); g.lineTo(x, y + r * 1.25); g.lineTo(x - r * 1.25, y); g.closePath();
  } else if (kind === 'hideout') {
    g.moveTo(x, y - r * 1.3); g.lineTo(x + r * 1.2, y - r * 0.2); g.lineTo(x + r, y + r); g.lineTo(x - r, y + r); g.lineTo(x - r * 1.2, y - r * 0.2); g.closePath();
  } else {
    g.arc(x, y, r, 0, Math.PI * 2);
  }
  g.fill();
  g.stroke();
}

function drawPlayer(g, x, y, heading, r) {
  g.save();
  g.translate(x, y);
  g.rotate(heading);
  g.fillStyle = COLORS.me;
  g.strokeStyle = '#0b0d14';
  g.lineWidth = Math.max(1.5, r * 0.25);
  g.beginPath();
  g.moveTo(0, -r * 1.4);
  g.lineTo(r, r);
  g.lineTo(0, r * 0.5);
  g.lineTo(-r, r);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
}
