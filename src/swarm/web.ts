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

/** Where a point at `u` along strand `index` sits right now (with sway). */
export function strandPoint(web: Web, index: number, u: number, t: number, amp: number, out: Pt): Pt {
  const s = web.strands[index];
  const a = sway(web.nodes[s.a], t, amp, { x: 0, y: 0 });
  const b = sway(web.nodes[s.b], t, amp, { x: 0, y: 0 });
  const c = sway(s.c, t, amp, { x: 0, y: 0 });
  return quadAt(a, c, b, u, out);
}

/**
 * Evidence-board strings: pins on lines, yarn drooping between them.
 * Ink 0 red, 1 black, 2 twine. Not a radial spider web.
 */
export function makeWeb(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  perPage: Anchor[][],
  topicMode: boolean,
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
    const droop = Math.min(h * 0.08, len * (0.035 + Math.random() * 0.07));
    const c = { x: (pa.x + pb.x) / 2 + (Math.random() - 0.5) * len * 0.03, y: (pa.y + pb.y) / 2 + droop };
    strands.push({
      kind: "link",
      a,
      b,
      c,
      len,
      delay,
      dur: 0.7,
      hot,
      ink: ink % 3,
      samples: Math.max(4, Math.min(9, Math.round(len / 160))),
    });
    const id = strands.length - 1;
    adj[a].push(id);
    adj[b].push(id);
  };

  const pins: number[][] = perPage.map((list) => {
    if (!list.length) return [];
    const pool = topicMode ? list.filter((item) => item.score > 0) : [];
    const source = pool.length >= 2 ? pool : list;
    const sorted = [...source].sort((p, q) => p.y - q.y);
    const take = Math.min(4, sorted.length);
    const picked: number[] = [];
    const seen = new Set<number>();
    for (let i = 0; i < take; i++) {
      const idx = Math.round((i * (sorted.length - 1)) / Math.max(1, take - 1));
      if (seen.has(idx)) continue;
      seen.add(idx);
      const item = sorted[idx];
      picked.push(addNode({ x: item.x, y: item.y }));
    }
    return picked;
  });

  let n = 0;
  const stamp = () => 0.35 + n * 0.42;

  for (let i = 0; i < pins.length; i++) {
    const here = pins[i];
    if (here.length < 2) continue;
    addYarn(here[0], here[here.length - 1], stamp(), false, i % 3);
    n += 1;
  }

  for (let i = 0; i < pins.length; i++) {
    for (let j = i + 1; j < pins.length; j++) {
      const hop = j - i;
      if (hop > 3) continue;
      if (hop > 1 && Math.random() < 0.4) continue;
      const A = pins[i];
      const B = pins[j];
      if (!A.length || !B.length) continue;
      const hot = topicMode && hop <= 2;
      const ink = hop === 1 ? 0 : hop === 2 ? 2 : 1;
      addYarn(A[0], B[Math.min(B.length - 1, 1)], stamp(), hot, ink);
      n += 1;
      if (hop === 1 && A.length > 1 && B.length > 1) {
        addYarn(A[A.length - 1], B[0], stamp(), hot, (ink + 1) % 3);
        n += 1;
      }
      if (n >= 34) break;
    }
    if (n >= 34) break;
  }

  return { nodes, strands, adj, dew: [], center, radius: Math.hypot(w, h) / 2, links: n, total: strands.length };
}
