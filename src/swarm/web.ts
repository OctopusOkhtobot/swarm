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

export function strandPoint(web: Web, index: number, u: number, t: number, amp: number, out: Pt): Pt {
  const s = web.strands[index];
  const a = sway(web.nodes[s.a], t, amp, { x: 0, y: 0 });
  const b = sway(web.nodes[s.b], t, amp, { x: 0, y: 0 });
  const c = sway(s.c, t, amp, { x: 0, y: 0 });
  return quadAt(a, c, b, u, out);
}

/**
 * Investigator strings between pages. Delays span the last 15 seconds of the show.
 */
export function makeWeb(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  perPage: Anchor[][],
  _topicMode: boolean,
): Web {
  const w = Math.max(1, bounds.maxX - bounds.minX);
  const h = Math.max(1, bounds.maxY - bounds.minY);
  const center: Pt = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
  const nodes: Pt[] = [{ ...center }];
  const strands: Strand[] = [];
  const adj: number[][] = [[]];

  const addNode = (p: Pt) => {
    nodes.push(p);
    adj.push([]);
    return nodes.length - 1;
  };

  const addYarn = (a: number, b: number, delay: number, hot: boolean, ink: number) => {
    const pa = nodes[a];
    const pb = nodes[b];
    const len = Math.hypot(pb.x - pa.x, pb.y - pa.y);
    if (len < 40) return;
    const droop = Math.min(h * 0.045, len * (0.04 + (ink % 3) * 0.015));
    const c = { x: (pa.x + pb.x) / 2 + (ink % 2 === 0 ? -1 : 1) * len * 0.03, y: (pa.y + pb.y) / 2 + droop };
    strands.push({
      kind: "link",
      a,
      b,
      c,
      len,
      delay,
      dur: 1.05,
      hot,
      ink: ink % 3,
      samples: Math.max(4, Math.min(8, Math.round(len / 180))),
    });
    const id = strands.length - 1;
    adj[a].push(id);
    adj[b].push(id);
  };

  const pins: number[][] = perPage.map((list) => {
    if (!list.length) return [];
    const sorted = [...list].sort((p, q) => p.y - q.y || q.score - p.score);
    const picks = [sorted[0], sorted[Math.floor((sorted.length - 1) / 2)], sorted[sorted.length - 1]];
    const seen = new Set<number>();
    const nodesHere: number[] = [];
    for (const item of picks) {
      const key = Math.round(item.y);
      if (seen.has(key)) continue;
      seen.add(key);
      nodesHere.push(addNode({ x: item.x, y: item.y }));
    }
    return nodesHere;
  });

  const jobs: { a: number; b: number; hot: boolean; ink: number }[] = [];
  const alive = pins.filter((pin) => pin.length);
  for (let i = 0; i < alive.length - 1; i++) {
    jobs.push({ a: alive[i][0], b: alive[i + 1][0], hot: true, ink: 0 });
    if (alive[i][1] != null && alive[i + 1][2] != null) {
      jobs.push({ a: alive[i][1], b: alive[i + 1][2], hot: false, ink: 1 });
    }
    if (i + 2 < alive.length && alive[i][2] != null) {
      jobs.push({ a: alive[i][2], b: alive[i + 2][0], hot: false, ink: 2 });
    }
  }
  if (alive.length >= 3) {
    jobs.push({ a: alive[0][0], b: alive[alive.length - 1][Math.min(1, alive[alive.length - 1].length - 1)], hot: true, ink: 2 });
  }

  const span = 12;
  jobs.forEach((job, index) => {
    const delay = jobs.length < 2 ? 0.2 : (index / (jobs.length - 1)) * span;
    addYarn(job.a, job.b, delay, job.hot, job.ink);
  });

  return { nodes, strands, adj, dew: [], center, radius: Math.hypot(w, h) / 2, links: strands.length, total: strands.length };
}