// Deterministic, bounded spatial graph. These links are expressive marks, not surveyed edges.
export function buildGraph(positions, {cell = .025, neighbors = 3, maxLength = .1, maxNodes = 7000} = {}) {
  if (!(cell > 0 && maxLength > 0)) throw Error('Positive cell and link lengths required');
  const cells = new Map(), nodes = [];
  for (let i = 0; i < positions.length; i += 3) {
    const p = Array.from(positions.subarray ? positions.subarray(i, i + 3) : positions.slice(i, i + 3));
    if (!p.every(Number.isFinite)) continue;
    const key = p.map(v => Math.floor(v / cell)).join(',');
    if (!cells.has(key)) { cells.set(key, nodes.length); nodes.push(p); }
  }
  if (nodes.length > maxNodes) return buildGraph(positions, {cell: cell * 1.3, neighbors, maxLength, maxNodes});
  const buckets = new Map();
  nodes.forEach((p, i) => { const key = p.map(v => Math.floor(v / maxLength)).join(','); if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(i); });
  const edges = [], seen = new Set(), limit2 = maxLength ** 2;
  nodes.forEach((p, i) => {
    const b = p.map(v => Math.floor(v / maxLength)), candidates = [];
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      for (const j of buckets.get([b[0]+x,b[1]+y,b[2]+z].join(',')) || []) {
        if (i === j) continue;
        const d = p.reduce((s,v,a)=>s+(v-nodes[j][a])**2,0);
        if (d > 1e-12 && d <= limit2) candidates.push([d,j]);
      }
    }
    candidates.sort((a,b)=>a[0]-b[0] || a[1]-b[1]);
    for (const [,j] of candidates.slice(0, Math.max(1, Math.min(6, neighbors)))) {
      const key = [Math.min(i,j),Math.max(i,j)].join(':');
      if (!seen.has(key)) { seen.add(key); edges.push([i,j]); }
    }
  });
  // Bottom-up reveal is deterministic, so a timeline scrub reproduces the same drawing.
  const ys = nodes.map(p=>p[1]), low = Math.min(...ys), range = Math.max(...ys)-low || 1;
  const vertices = new Float32Array(edges.length * 6), orders = new Float32Array(edges.length * 2);
  edges.forEach(([a,b],i)=>{ vertices.set([...nodes[a],...nodes[b]],i*6); orders[i*2]=(nodes[a][1]-low)/range; orders[i*2+1]=(nodes[b][1]-low)/range; });
  return {vertices, orders, nodes: nodes.length, edges: edges.length, cell};
}
