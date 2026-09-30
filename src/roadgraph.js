// The street network as a graph of intersections/bends. Pursuers path-find along it
// so they drive the roads instead of ploughing through buildings.
export class RoadGraph {
  constructor() {
    this.nodes = [];   // { id, x, z, links: [id], tag }
  }

  addNode(x, z, tag = 'road') {
    const node = { id: this.nodes.length, x, z, links: [], tag };
    this.nodes.push(node);
    return node.id;
  }

  link(a, b) {
    if (a === b || this.nodes[a].links.includes(b)) return;
    this.nodes[a].links.push(b);
    this.nodes[b].links.push(a);
  }

  nearest(x, z, filter = null) {
    let best = null, bestD = Infinity;
    for (const n of this.nodes) {
      if (filter && !filter(n)) continue;
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  random(rng, filter = null) {
    const pool = filter ? this.nodes.filter(filter) : this.nodes;
    return pool[Math.floor(rng() * pool.length)];
  }

  static edgeKey(a, b) { return a < b ? `${a}-${b}` : `${b}-${a}`; }

  // Shortest path (Dijkstra; the graph is small) as a list of node ids, start..goal.
  // `blocked` is an optional Set of edge keys (roadblocks) to route around.
  path(fromId, toId, blocked = null) {
    if (fromId === toId) return [fromId];
    const n = this.nodes.length;
    const dist = new Float64Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    const done = new Uint8Array(n);
    dist[fromId] = 0;
    for (;;) {
      let u = -1, best = Infinity;
      for (let i = 0; i < n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0 || u === toId) break;
      done[u] = 1;
      const a = this.nodes[u];
      for (const v of a.links) {
        if (blocked && blocked.has(RoadGraph.edgeKey(u, v))) continue;
        const b = this.nodes[v];
        const nd = best + Math.hypot(a.x - b.x, a.z - b.z);
        if (nd < dist[v]) { dist[v] = nd; prev[v] = u; }
      }
    }
    if (prev[toId] < 0) return null;
    const out = [];
    for (let v = toId; v >= 0; v = prev[v]) out.push(v);
    return out.reverse();
  }
}
