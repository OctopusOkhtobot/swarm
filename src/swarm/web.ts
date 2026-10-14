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
 * Strings between pages that share one word or topic.
 * Caller passes only the matching anchors. Nothing is drawn until the crawl ends.
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
    const droop = Math.min(h * 0.05, len * 0.06);
    const c = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 + droop };
    strands.push({
      kind: "link",
      a,
      b,
      c,
      len,
      delay,
      dur: 0.45,
      hot,
      ink: ink % 3,
      samples: Math.max(3, Math.min(7, Math.round(len / 180))),
    });
    const id = strands.length - 1;
    adj[a].push(id);
    adj[b].push(id);
  };

  const pins: number[][] = perPage.map((list) => {
    const ranked = [...list].sort((p, q) => q.score - p.score || p.y - q.y).slice(0, 2);
    return ranked.map((item) => addNode({ x: item.x, y: item.y }));
  });

  const alive = pins.map((pin, index) => ({ index, pin })).filter((item) => item.pin.length);
  let n = 0;
  for (let i = 0; i < alive.length - 1; i++) {
    addYarn(alive[i].pin[0], alive[i + 1].pin[0], 0.15, true, i % 3);
    n += 1;
    const extraA = alive[i].pin[1];
    const extraB = alive[i + 1].pin[1];
    if (extraA != null && extraB != null) {
      addYarn(extraA, extraB, 0.3, false, (i + 1) % 3);
      n += 1;
    }
  }
  if (alive.length >= 3) {
    addYarn(alive[0].pin[0], alive[alive.length - 1].pin[0], 0.45, true, 2);
    n += 1;
  }

  return { nodes, strands, adj, dew: [], center, radius: Math.hypot(w, h) / 2, links: n, total: strands.length };
}
