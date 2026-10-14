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

function rayToBox(c: Pt, dx: number, dy: number, minX: number, minY: number, maxX: number, maxY: number) {
  let t = Infinity;
  if (dx > 1e-6) t = Math.min(t, (maxX - c.x) / dx);
  else if (dx < -1e-6) t = Math.min(t, (minX - c.x) / dx);
  if (dy > 1e-6) t = Math.min(t, (maxY - c.y) / dy);
  else if (dy < -1e-6) t = Math.min(t, (minY - c.y) / dy);
  return Number.isFinite(t) ? Math.max(0, t) : 0;
}

/**
 * A loose orb web: jittered spokes, an uneven spiral that drifts out from the hub, a ragged
 * frame, plus "link" threads that tie text lines on different pages. Everything shares nodes,
 * so the result is a graph the spiders can walk.
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

  const spokeCount = Math.round(rand(13, 18));
  const turns = Math.round(rand(9, 12));
  const offset = rand(0, TAU);
  const radius = Math.hypot(w, h) / 2;

  // spokes: uneven angles, ends land on the outer frame
  const angles: number[] = [];
  for (let i = 0; i < spokeCount; i++) {
    angles.push(offset + (i / spokeCount) * TAU + rand(-0.42, 0.42) * (TAU / spokeCount));
  }
  angles.sort((x, y) => x - y);
  const ends: Pt[] = angles.map((ang) => {
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    const t = rayToBox(center, dx, dy, minX, minY, maxX, maxY) * rand(0.9, 1);
    return { x: center.x + dx * t, y: center.y + dy * t };
  });

  // spiral: one continuous drift outward, hopping spoke to spoke
  const spokeNodes: { f: number; node: number }[][] = Array.from({ length: spokeCount }, () => []);
  const spiral: number[] = [];
  const total = spokeCount * turns;
  for (let t = 0; t < total; t++) {
    const j = t % spokeCount;
    const base = 0.065 + 0.9 * (t / total) ** 0.92;
    const f = Math.min(0.97, Math.max(0.05, base + rand(-0.018, 0.018)));
    const end = ends[j];
    // nudge nodes a little off the spoke line so the rings stop looking ruled
    const jx = rand(-1, 1) * 10;
    const jy = rand(-1, 1) * 10;
    const node = addNode({ x: center.x + (end.x - center.x) * f + jx, y: center.y + (end.y - center.y) * f + jy });
    spokeNodes[j].push({ f, node });
    spiral.push(node);
  }

  // spokes (hub -> each node in order -> frame)
  const endNodes: number[] = [];
  for (let j = 0; j < spokeCount; j++) {
    const list = spokeNodes[j].sort((p, q) => p.f - q.f);
    const endNode = addNode({ ...ends[j] });
    endNodes.push(endNode);
    let prev = 0;
    const d0 = rand(0, 0.7);
    list.forEach((item, idx) => {
      addStrand("spoke", prev, item.node, rand(-0.012, 0.012), d0 + idx * 0.05, 0.5);
      prev = item.node;
    });
    addStrand("spoke", prev, endNode, rand(-0.012, 0.012), d0 + list.length * 0.05, 0.5);
  }

  // spiral strands (some gaps, some torn)
  for (let t = 1; t < spiral.length; t++) {
    if (Math.random() < 0.07) continue;
    addStrand("ring", spiral[t - 1], spiral[t], rand(0.035, 0.1), 0.8 + (t / total) * 2.8, 0.2);
  }
  // ragged frame
  for (let j = 0; j < spokeCount; j++) {
    if (Math.random() < 0.16) continue;
    addStrand("ring", endNodes[j], endNodes[(j + 1) % spokeCount], rand(0.02, 0.07), 0.4 + j * 0.05, 0.4);
  }

  // dew
  const dew: Dew[] = [];
  const dewCount = Math.min(30, Math.round(spiral.length * 0.14));
  for (let i = 0; i < dewCount; i++) {
    dew.push({ node: spiral[Math.floor(Math.random() * spiral.length)], r: rand(2.4, 4.6), phase: rand(0, TAU) });
  }

  // link threads between the pages' own lines
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
