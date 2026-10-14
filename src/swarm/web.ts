export type Pt = { x: number; y: number };
export type Anchor = { x: number; y: number; rel: number; score: number };
export type StrandKind = "spoke" | "ring" | "link" | "tie";

export type Strand = {
  kind: StrandKind;
  a: number;
  b: number;
  c: Pt;
  len: number;
  delay: number;
  dur: number;
  hot: boolean;
  ink: number;
  samples: number;
};

export type Dew = { node: number; r: number; phase: number };

export type Web = {
  nodes: Pt[];
  strands: Strand[];
  adj: number[][];
  dew: Dew[];
  center: Pt;
  radius: number;
  links: number;
  total: number;
};

const TAU = Math.PI * 2;

function rand(a: number, b: number) {
  return a + Math.random() * (b - a);
}

/**
 * Restrained concentric perimeter loops with hidden page-link strands retained for spider navigation.
 */
export function makeWeb(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  perPage: Anchor[][],
  topicMode: boolean,
): Web {
  const w = Math.max(1, bounds.maxX - bounds.minX);
  const h = Math.max(1, bounds.maxY - bounds.minY);
  const pad = 0.015;
  const minX = bounds.minX - w * pad;
  const maxX = bounds.maxX + w * pad;
  const minY = bounds.minY - h * pad;
  const maxY = bounds.maxY + h * pad;
  const center: Pt = {
    x: (minX + maxX) / 2 + rand(-0.09, 0.09) * w,
    y: (minY + maxY) / 2 + rand(-0.09, 0.09) * h,
  };
  const nodes: Pt[] = [{ ...center }];
  const strands: Strand[] = [];
  const adj: number[][] = [[]];

  const addNode = (p: Pt) => {
    nodes.push(p);
    adj.push([]);
    return nodes.length - 1;
  };
  const addStrand = (kind: StrandKind, a: number, b: number, sag: number, delay: number, dur: number, hot = false, ink = 0) => {
    const pa = nodes[a];
    const pb = nodes[b];
    const len = Math.hypot(pb.x - pa.x, pb.y - pa.y);
    if (len < 2) return;
    const mx = (pa.x + pb.x) / 2;
    const my = (pa.y + pb.y) / 2;
    const nx = -(pb.y - pa.y) / len;
    const ny = (pb.x - pa.x) / len;
    // sag pulls the middle toward the hub (rings) or sideways a touch (spokes, links)
    let cx = mx + nx * sag * len;
    let cy = my + ny * sag * len;
    if (kind === "ring") {
      const tx = center.x - mx;
      const ty = center.y - my;
      const tl = Math.hypot(tx, ty) || 1;
      cx = mx + (tx / tl) * Math.abs(sag) * len;
      cy = my + (ty / tl) * Math.abs(sag) * len;
    }
    const samples = Math.max(4, Math.min(14, Math.round(len / 90)));
    strands.push({ kind, a, b, c: { x: cx, y: cy }, len: len * 1.04, delay, dur, hot, ink, samples });
    adj[a].push(strands.length - 1);
    adj[b].push(strands.length - 1);
  };

  const pointsPerRing = Math.round(rand(16, 20));
  const offset = rand(0, TAU);
  const radius = Math.hypot(w, h) / 2;

  // Sparse, uneven concentric perimeter loops; leave the center and page-to-page links clear.
  const ringCount = 5;
  for (let ring = 0; ring < ringCount; ring++) {
    const radius = 0.56 + (ring / (ringCount - 1)) * 0.39;
    const ids: number[] = [];
    const phase = offset + ring * 0.16;
    for (let j = 0; j < pointsPerRing; j++) {
      const angle = phase + (j / pointsPerRing) * TAU;
      const jitter = rand(-0.012, 0.012);
      ids.push(addNode({
        x: center.x + Math.cos(angle) * (maxX - minX) * (radius + jitter) * 0.5,
        y: center.y + Math.sin(angle) * (maxY - minY) * (radius + jitter) * 0.5,
      }));
    }
    for (let j = 0; j < ids.length; j++) {
      if (Math.random() < 0.045) continue;
      addStrand("ring", ids[j], ids[(j + 1) % ids.length], rand(0.012, 0.035), 0.3 + ring * 0.38 + j * 0.012, 0.35, false, (ring + j) % 2);
    }
  }

  // No dew drops or central webbing on the restrained perimeter motif.
  const dew: Dew[] = [];

  // Link strands remain in the model for crawl navigation, but are not rendered in the finale.
  const nearestWeb = (p: Pt, skip: number) => {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < skip; i++) {
      const d = Math.hypot(nodes[i].x - p.x, nodes[i].y - p.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return { node: best, dist: bestD };
  };
  const webNodes = nodes.length;
  let links = 0;
  const pageCount = perPage.length;
  if (pageCount >= 2) {
    const want = Math.min(28, Math.max(8, pageCount * 3));
    const seen = new Set<string>();
    for (let guard = 0; guard < want * 6 && links < want; guard++) {
      const pi = Math.floor(Math.random() * pageCount);
      let pj = Math.floor(Math.random() * pageCount);
      if (pj === pi) pj = (pj + 1 + Math.floor(Math.random() * (pageCount - 1))) % pageCount;
      const la = perPage[pi];
      const lb = perPage[pj];
      if (!la.length || !lb.length) continue;
      let a = la[Math.floor(Math.random() * la.length)];
      let b: Anchor;
      let hot = false;
      if (topicMode) {
        const ta = la.filter((x) => x.score > 0);
        const tb = lb.filter((x) => x.score > 0);
        if (ta.length && tb.length) {
          a = ta[Math.floor(Math.random() * ta.length)];
          b = tb[Math.floor(Math.random() * tb.length)];
          hot = true;
        } else if (links > want * 0.6) continue;
        else b = lb[Math.floor(Math.random() * lb.length)];
      } else {
        // rhyme: lines that sit at a similar height find each other
        let pick = lb[0];
        let score = Infinity;
        for (const cand of lb) {
          const s = Math.abs(cand.rel - a.rel) + Math.random() * 0.5;
          if (s < score) {
            score = s;
            pick = cand;
          }
        }
        b = pick;
      }
      if (Math.hypot(a.x - b.x, a.y - b.y) < 80) continue;
      const key = `${Math.round(a.x / 30)}:${Math.round(a.y / 30)}:${Math.round(b.x / 30)}:${Math.round(b.y / 30)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const na = addNode({ x: a.x, y: a.y });
      const nb = addNode({ x: b.x, y: b.y });
      const ink = links % 3;
      const delay = 3.0 + links * 0.09;
      addStrand("link", na, nb, rand(0.04, 0.1) * (Math.random() < 0.5 ? -1 : 1), delay, 0.55, hot, ink);
      // tie both ends to the nearest bit of web so the whole thing hangs together
      const reach = radius * 0.42;
      for (const n of [na, nb]) {
        const near = nearestWeb(nodes[n], webNodes);
        if (near.node >= 0 && near.dist < reach) addStrand("tie", n, near.node, rand(-0.02, 0.02), delay + 0.2, 0.3, false, ink);
      }
      links += 1;
    }
  }

  return { nodes, strands, adj, dew, center, radius, links, total: strands.length };
}

/** A soft field, so shared endpoints sway together and nothing tears. */
export function sway(p: Pt, t: number, amp: number, out: Pt): Pt {
  out.x = p.x + Math.sin(t * 1.25 + p.y * 0.0062 + p.x * 0.0017) * amp;
  out.y = p.y + Math.cos(t * 1.05 + p.x * 0.0058 - p.y * 0.0021) * amp * 0.72;
  return out;
}

export function quadAt(a: Pt, c: Pt, b: Pt, u: number, out: Pt): Pt {
  const k = 1 - u;
  out.x = k * k * a.x + 2 * k * u * c.x + u * u * b.x;
  out.y = k * k * a.y + 2 * k * u * c.y + u * u * b.y;
  return out;
}

/** Where a point at `u` along strand `index` sits right now (with sway). */
export function strandPoint(web: Web, index: number, u: number, t: number, amp: number, out: Pt): Pt {
  const s = web.strands[index];
  const a = sway(web.nodes[s.a], t, amp, { x: 0, y: 0 });
  const b = sway(web.nodes[s.b], t, amp, { x: 0, y: 0 });
  const c = sway(s.c, t, amp, { x: 0, y: 0 });
  return quadAt(a, c, b, u, out);
}
