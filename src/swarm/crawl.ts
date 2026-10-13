import type { Sfx } from "./audio";

export type NormBox = { x: number; y: number; w: number; h: number };
export type Scan = { boxes: NormBox[]; dark: boolean; barren: boolean };
export type ReadDir = "rtl" | "ltr";
export type DocLine = { y: number; h: number; x0: number; x1: number; text: string };
export type Weave = "rhyme" | "topic";
export type Surface = "void" | "table" | "photo";

const LEGS = ["#5ce1ff", "#ff4ad8", "#d6ff4a", "#ffd24a", "#ff5d3a", "#c9a6ff", "#5ce1ff", "#ff4ad8"];
const LINE_COLORS = ["#5ce1ff", "#ff4ad8", "#d6ff4a", "#ffd24a"];

type Pt = { x: number; y: number };
type Word = Pt & { w: number; h: number };
type Line = { y: number; h: number; x0: number; x1: number; words: Word[] };
type Mark = Word & { color: string; a: number; on: boolean; spin: boolean; t: number };
type Pulse = { x: number; y: number; w: number; h: number; t: number };
type Agent = {
  page: number;
  age: number;
  line: number;
  lineT: number;
  dur: number;
  salt: number;
  saltT: number;
  linesRead: number;
  budget: number;
  done: boolean;
  hold: number;
  flying: boolean;
  wonderT: number;
  gasped: boolean;
  caretKey: string;
  tickT: number;
  body: Pt;
  feet: Pt[];
  marks: Mark[];
  pulses: Pulse[];
};
type Page = {
  image: HTMLImageElement;
  w: number;
  h: number;
  x: number;
  y: number;
  dark: boolean;
  barren: boolean;
  lines: Line[];
};
const BALL_FILL = ["#101114", "#f6f6f1", "#22c55e"] as const;
const BALL_INK = ["#f6f6f1", "#101114", "#f6f6f1"] as const;
const BALL_RIM = ["#f6f6f1", "#101114", "#052e16"] as const;
const METAL = ["#c5ccd6", "#e4c27a", "#d4896c"] as const;

type BallKind = "metal" | "rubber";
type Spark = { x: number; y: number; vx: number; vy: number; t: number; metal: boolean };

type Ball = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: 0 | 1 | 2;
  kind: BallKind;
  squash: number;
  page: number;
  mate: number;
  perch: boolean;
  eye: 0 | 1 | 2;
  lid: number;
  lidDir: number;
  lidWait: number;
  wink: number;
  kick: number;
  spin: number;
  bulge: number;
  flight: number;
  fromX: number;
  fromY: number;
  landX: number;
  landY: number;
};

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => (img.naturalWidth > 0 ? resolve(img) : reject(new Error("image")));
    img.onerror = () => reject(new Error("image"));
    img.src = url;
  });
}

export function scanImage(img: HTMLImageElement): Scan {
  try {
    const maxW = 460;
    const scale = Math.min(1, maxW / img.naturalWidth);
    const w = Math.max(48, Math.round(img.naturalWidth * scale));
    const h = Math.max(48, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { boxes: [], dark: true, barren: true };
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const luma = new Float32Array(w * h);
    let sum = 0;
    for (let i = 0; i < w * h; i++) {
      const o = i * 4;
      const y = (0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]) / 255;
      luma[i] = y;
      sum += y;
    }
    const dark = sum / (w * h) < 0.46;
    const row = new Float32Array(h);
    for (let y = 0; y < h; y++) {
      let s = 0;
      const off = y * w;
      for (let x = 1; x < w; x++) s += Math.abs(luma[off + x] - luma[off + x - 1]);
      row[y] = s / w;
    }
    const sm = new Float32Array(h);
    for (let y = 0; y < h; y++) {
      let a = 0;
      let n = 0;
      for (let k = -2; k <= 2; k++) {
        const yy = y + k;
        if (yy < 0 || yy >= h) continue;
        a += row[yy];
        n++;
      }
      sm[y] = a / n;
    }
    let peak = 0;
    for (let y = 1; y < h - 1; y++) if (sm[y] > peak) peak = sm[y];
    const thr = Math.max(0.015, peak * 0.34);
    const bands: { y0: number; y1: number }[] = [];
    let y = 0;
    while (y < h) {
      if (sm[y] < thr) {
        y++;
        continue;
      }
      const y0 = y;
      while (y < h && sm[y] >= thr * 0.8) y++;
      if (y - y0 >= 2 && y - y0 < h * 0.08) bands.push({ y0, y1: y });
    }
    const boxes: NormBox[] = [];
    for (const band of bands) {
      const ink = new Uint8Array(w);
      for (let x = 0; x < w; x++) {
        let m = 0;
        for (let yy = band.y0; yy < band.y1; yy++) {
          const left = luma[yy * w + Math.max(0, x - 1)];
          m = Math.max(m, Math.abs(luma[yy * w + x] - left));
        }
        ink[x] = m > 0.07 ? 1 : 0;
      }
      const dil = new Uint8Array(w);
      for (let x = 0; x < w; x++) {
        let on = 0;
        for (let k = -2; k <= 2; k++) {
          const xx = x + k;
          if (xx >= 0 && xx < w && ink[xx]) on = 1;
        }
        dil[x] = on;
      }
      let x = 0;
      while (x < w) {
        if (!dil[x]) {
          x++;
          continue;
        }
        const x0 = x;
        while (x < w && dil[x]) x++;
        const bw = x - x0;
        const bh = band.y1 - band.y0;
        if (bw < 5 || bh < 2) continue;
        const parts = Math.max(1, Math.ceil(bw / (w * 0.11)));
        const gap = parts > 1 ? 3 : 0;
        const part = (bw - gap * (parts - 1)) / parts;
        for (let i = 0; i < parts; i++) {
          boxes.push({
            x: (x0 + (part + gap) * i) / w,
            y: band.y0 / h,
            w: part / w,
            h: bh / h,
          });
        }
      }
    }
    const usable = boxes.filter((b) => b.w > 0.012 && b.h > 0.004 && b.h < 0.06);
    const barren = usable.length < 8 || peak < 0.022;
    return { boxes: barren ? [] : usable.slice(0, 700), dark, barren };
  } catch {
    return { boxes: [], dark: true, barren: true };
  }
}

function mergeWords(words: Word[]): Word[] {
  const sorted = [...words].sort((a, b) => a.x - b.x);
  const out: Word[] = [];
  for (const w of sorted) {
    const prev = out[out.length - 1];
    if (!prev) {
      out.push({ ...w });
      continue;
    }
    const right = Math.max(prev.x + prev.w, w.x + w.w);
    const left = Math.min(prev.x, w.x);
    if (w.x - (prev.x + prev.w) < 12 && right - left < 190) {
      const top = Math.min(prev.y, w.y);
      const bot = Math.max(prev.y + prev.h, w.y + w.h);
      prev.x = left;
      prev.w = right - left;
      prev.y = top;
      prev.h = bot - top;
    } else out.push({ ...w });
  }
  return out;
}

function cluster(words: Word[]): Line[] {
  const sorted = [...words].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2) || a.x - b.x);
  const lines: Line[] = [];
  for (const w of sorted) {
    const mid = w.y + w.h / 2;
    const last = lines[lines.length - 1];
    if (last && Math.abs(mid - (last.y + last.h / 2)) < Math.max(last.h, w.h) * 0.7) {
      last.words.push(w);
      const top = Math.min(last.y, w.y);
      const bot = Math.max(last.y + last.h, w.y + w.h);
      last.y = top;
      last.h = bot - top;
    } else {
      lines.push({ y: w.y, h: w.h, x0: w.x, x1: w.x + w.w, words: [w] });
    }
  }
  for (const line of lines) {
    line.words = mergeWords(line.words);
    const first = line.words[0];
    const lastW = line.words[line.words.length - 1];
    line.x0 = first.x;
    line.x1 = lastW.x + lastW.w;
    const top = Math.min(...line.words.map((w) => w.y));
    const bot = Math.max(...line.words.map((w) => w.y + w.h));
    line.y = top;
    line.h = Math.max(14, bot - top);
  }
  return lines.filter((line) => line.x1 - line.x0 > 18);
}

function takeLines(lines: Line[]): Line[] {
  const max = 20;
  if (lines.length <= max) return lines;
  const out: Line[] = [];
  const step = (lines.length - 1) / (max - 1);
  let prev = -1;
  for (let i = 0; i < max; i++) {
    const idx = Math.round(i * step);
    if (idx === prev) continue;
    prev = idx;
    out.push(lines[idx]);
  }
  return out;
}

function corner(w: Word, i: number): Pt {
  const cx = [0.08, 0.92, 0.92, 0.08][i % 4];
  const cy = [0.2, 0.2, 0.85, 0.85][i % 4];
  return { x: w.x + w.w * cx, y: w.y + w.h * cy };
}

function closestWord(words: Word[], x: number): Word {
  let best = words[0];
  let bestD = Infinity;
  for (const w of words) {
    const d = Math.abs(w.x + w.w / 2 - x);
    if (d < bestD) {
      bestD = d;
      best = w;
    }
  }
  return best;
}

function nearbyWords(lines: Line[], index: number, head: number): Word[] {
  const pool: Word[] = [];
  for (let d = 1; d <= 3; d++) {
    for (const j of [index - d, index + d]) {
      const line = lines[j];
      if (!line) continue;
      for (const w of line.words) {
        if (w.w < 240 && Math.abs(w.x + w.w / 2 - head) < 460) pool.push(w);
      }
    }
  }
  return pool;
}

function poseOf(lines: Line[], agent: Agent, dir: ReadDir): Pose {
  const line = lines[Math.max(0, Math.min(agent.line, lines.length - 1))];
  const u = ease(Math.min(1, agent.lineT / agent.dur));
  const from = dir === "rtl" ? line.x1 : line.x0;
  const to = dir === "rtl" ? line.x0 : line.x1;
  const head = from + (to - from) * u;
  const left = Math.min(from, head);
  const color = LINE_COLORS[agent.line % LINE_COLORS.length];
  const bar = { x: left, y: line.y - 2, w: Math.max(18, Math.abs(head - from)), h: line.h + 4, color };
  const caretWord = closestWord(line.words, head);
  const pool = nearbyWords(lines, agent.line, head);
  const sats: Word[] = [];
  const used = new Set<Word>();
  const stride = 1 + (agent.salt % 4);
  for (let i = 0; i < pool.length && sats.length < 5; i++) {
    const word = pool[(i * stride + agent.salt * 3) % pool.length];
    if (used.has(word)) continue;
    used.add(word);
    sats.push(word);
  }
  const targets = [corner(caretWord, 0), corner(caretWord, 2)];
  sats.forEach((w, i) => targets.push(corner(w, i + 1)));
  while (targets.length < 8) targets.push(corner(caretWord, targets.length));
  return { bar, head, targets, body: { x: head, y: line.y + line.h * 0.5 }, color, sats, caret: caretWord };
}

function ease(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - ((-2 * u + 2) ** 2) / 2;
}

function stretchOf(age: number, salt: number) {
  const period = 2.45;
  const u = ((age + salt * 0.37) % period) / period;
  if (u > 0.42) return { amp: 0 };
  const p = u / 0.42;
  return { amp: Math.sin(Math.PI * p) };
}

function hexA(hex: string, a: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

type Pose = { bar: Word & { color: string }; head: number; targets: Pt[]; body: Pt; color: string; sats: Word[]; caret: Word };

function makeAgent(pageIndex: number, lines: Line[]): Agent {
  const line = lines[0];
  const origin = line ? { x: (line.x0 + line.x1) / 2, y: line.y + line.h / 2 } : { x: 0, y: 0 };
  const count = Math.max(1, lines.length);
  return {
    page: pageIndex,
    age: 0,
    line: 0,
    lineT: 0,
    dur: Math.max(0.28, Math.min(0.52, 7.2 / count)),
    salt: 1,
    saltT: 0,
    linesRead: 0,
    done: false,
    hold: 0.4,
    flying: false,
    wonderT: 0,
    gasped: false,
    caretKey: "",
    tickT: 0.08,
    body: { ...origin },
    feet: Array.from({ length: 8 }, () => ({ ...origin })),
    marks: [],
    pulses: [],
    budget: Math.max(1, lines.length),
  };
}

export type CrawlStats = { agents: number; pages: number; lines: number; seen: number[]; threads: number; left: number };
export type CrawlHandle = { stop: () => void; toggle: () => boolean; grokbot: () => boolean; friends: () => boolean };

type Anchor = { x: number; y: number; rel: number; score: number };
type Thread = { x0: number; y0: number; x1: number; y1: number; color: string; hot: boolean };

function scoreText(text: string, topic: string): number {
  const needle = topic.trim().toLowerCase();
  if (needle.length < 2) return 0;
  const hay = text.toLowerCase();
  const parts = needle.split(/\s+/).filter((part) => part.length >= 2);
  const keys = parts.length ? parts : [needle];
  let score = 0;
  for (const key of keys) {
    let from = 0;
    while (from < hay.length) {
      const at = hay.indexOf(key, from);
      if (at < 0) break;
      score += key.length;
      from = at + key.length;
    }
  }
  return score;
}

function anchorsOf(page: Page, doc: { lines: DocLine[] } | undefined, topic: string): Anchor[] {
  if (doc && doc.lines.length) {
    return doc.lines.map((line) => ({
      x: page.x + ((line.x0 + line.x1) / 2) * page.w,
      y: page.y + (line.y + line.h * 0.5) * page.h,
      rel: line.y + line.h * 0.5,
      score: scoreText(line.text, topic),
    }));
  }
  if (!page.lines.length) {
    return [0.3, 0.5, 0.7].map((rel) => ({
      x: page.x + page.w * 0.5,
      y: page.y + page.h * rel,
      rel,
      score: 0,
    }));
  }
  return page.lines.map((line) => ({
    x: (line.x0 + line.x1) / 2,
    y: line.y + line.h / 2,
    rel: (line.y + line.h / 2 - page.y) / Math.max(1, page.h),
    score: 0,
  }));
}

const THREAD_INK = ["#f6f6f1", "#ff2a2a", "#111111"] as const;

function makeThreads(pages: Page[], docs: { lines: DocLine[] }[] | undefined, weave: Weave, topic: string): Thread[] {
  if (pages.length < 2) return [];
  const perPage = pages.map((page, index) => anchorsOf(page, docs?.[index], weave === "topic" ? topic : ""));
  const picked = perPage.map((list) => {
    if (list.length <= 6) return list;
    const out: Anchor[] = [];
    for (let i = 0; i < 6; i++) out.push(list[Math.floor((i * (list.length - 1)) / 5)]);
    return out;
  });
  const out: Thread[] = [];
  const seen = new Set<string>();
  const push = (a: Anchor | undefined, b: Anchor | undefined, hot: boolean) => {
    if (!a || !b || out.length >= 36) return;
    if (Math.hypot(a.x - b.x, a.y - b.y) < 36) return;
    const key = `${Math.round(a.x / 8)}:${Math.round(a.y / 8)}:${Math.round(b.x / 8)}:${Math.round(b.y / 8)}`;
    if (seen.has(key)) return;
    seen.add(key);
    const topicHot = hot || (a.score > 0 && b.score > 0);
    out.push({ x0: a.x, y0: a.y, x1: b.x, y1: b.y, color: THREAD_INK[out.length % 3], hot: topicHot });
  };
  for (let i = 0; i < picked.length - 1; i++) {
    const left = picked[i];
    const right = picked[i + 1];
    const n = Math.min(left.length, right.length);
    for (let k = 0; k < n; k++) {
      push(left[k], right[k], false);
      push(left[k], right[(k + 2) % n], false);
    }
  }
  for (let i = 0; i < picked.length - 2; i++) {
    const left = picked[i];
    const far = picked[i + 2];
    push(left[0], far[far.length - 1], true);
    push(left[Math.min(2, left.length - 1)], far[Math.min(1, far.length - 1)], false);
  }
  if (picked.length > 2) {
    const first = picked[0];
    const last = picked[picked.length - 1];
    push(first[0], last[last.length - 1], true);
    push(first[first.length - 1], last[0], false);
  }
  return out;
}

export function startCrawl(opts: {
  canvas: HTMLCanvasElement;
  images: HTMLImageElement[];
  scans: Scan[];
  audio: { play: (kind: Sfx) => void };
  dir: ReadDir;
  reduced: boolean;
  docs?: { lines: DocLine[] }[];
  weave?: Weave;
  topic?: string;
  seconds?: number;
  surface?: Surface;
  desk?: HTMLImageElement | null;
  onStats: (stats: CrawlStats) => void;
  onPage: (index: number) => void;
  onMark: (on: boolean) => void;
  onHold?: (held: boolean) => void;
}): CrawlHandle {
  const pageW = 1080;
  const pages: Page[] = opts.images.map((image, i) => {
    const h = Math.max(720, pageW * (image.naturalHeight / Math.max(1, image.naturalWidth)));
    return { image, w: pageW, h, x: 0, y: 0, dark: opts.scans[i]?.dark ?? true, barren: opts.scans[i]?.barren ?? true, lines: [] as Line[] };
  });
  const cols = pages.length <= 3 ? Math.max(1, pages.length) : pages.length <= 8 ? 3 : 4;
  let col = 0;
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const page of pages) {
    page.x = x;
    page.y = y;
    rowH = Math.max(rowH, page.h);
    col += 1;
    if (col >= cols) {
      col = 0;
      x = 0;
      y += rowH + 280;
      rowH = 0;
    } else x += page.w + 220;
  }
  for (const page of pages) {
    const scan = opts.scans[pages.indexOf(page)];
    page.barren = scan?.barren ?? true;
    page.dark = scan?.dark ?? true;
    if (!page.barren && scan && scan.boxes.length) {
      const words = scan.boxes.map((b) => ({
        x: page.x + b.x * page.w,
        y: page.y + b.y * page.h,
        w: b.w * page.w,
        h: Math.max(14, b.h * page.h),
      }));
      page.lines = takeLines(cluster(words));
      if (page.lines.length < 2) {
        page.barren = true;
        page.lines = [];
      }
    } else {
      page.lines = [];
      page.barren = true;
    }
  }

  let focus = 0;
  const agents: Agent[] = [makeAgent(0, pages[0]?.lines ?? [])];
  let paused = false;
  let running = true;
  let raf = 0;
  let last = performance.now();
  let statsT = 0;
  let pageSent = -1;
  const cam = { x: 0, y: 0, s: 1, ready: false };
  let mode: "read" | "lift" | "hold" | "cross" | "dive" | "finale" | "chaos" | "friends" = "read";
  let tween = 0;
  let hops = 2;
  let pending = 0;
  let finaleT = 0;
  let markOn = false;
  let linesTotal = 0;
  let swarmT = 0;
  let chaos = false;
  let finished = false;
  let frozen = false;
  let threadCount = 0;
  const showFor = Math.min(300, Math.max(50, opts.seconds ?? 90));
  let showT = 0;
  const web: Thread[] = [];
  let party: "off" | "chaos" | "friends" = "off";
  const balls: Ball[] = [];
  const sparks: Spark[] = [];
  const glints: { x: number; y: number; w: number; h: number; life: number }[] = [];
  let spinT = 0;
  const visited = new Set<number>([0]);
  const travel = { fx: 0, fy: 0, fs: 1, tx: 0, ty: 0, ts: 1 };
  const hop = {
    from: { x: 0, y: 0 },
    ctrl: { x: 0, y: 0 },
    to: { x: 0, y: 0 },
    agent: null as Agent | null,
    skim: false,
  };
  let viewW = 1;
  let viewH = 1;
  let dpr = 1;

  opts.audio.play("birth");
  emit();

  function emit() {
    opts.onStats({
      agents: agents.length,
      pages: visited.size,
      lines: linesTotal,
      seen: [...visited],
      threads: threadCount,
      left: Math.max(0, Math.ceil(showFor - showT)),
    });
    if (pageSent !== focus) {
      pageSent = focus;
      opts.onPage(focus);
    }
  }

  function stepAgent(agent: Agent, lines: Line[], dt: number, quiet = false) {
    if (!lines.length) {
      agent.done = true;
      agent.hold -= dt;
      return;
    }
    agent.age += dt;
    if (!agent.done) {
      agent.lineT += dt;
      agent.saltT += dt;
      if (agent.saltT > 0.38) {
        agent.saltT = 0;
        agent.salt += 1;
      }
      if (!quiet) {
        agent.tickT += dt;
        const gap = 0.11 + (agent.salt % 4) * 0.018;
        if (agent.tickT >= gap) {
          agent.tickT = 0;
          opts.audio.play("step");
        }
      }
      if (agent.lineT >= agent.dur) {
        agent.linesRead += 1;
        if (!quiet) linesTotal += 1;
        if (!quiet && agent.linesRead % 5 === 0) opts.audio.play("focus");
        const lastLine = agent.line >= lines.length - 1;
        if (lastLine || agent.linesRead >= agent.budget) {
          agent.done = true;
          agent.hold = quiet ? 0.05 : 0.48;
          agent.lineT = agent.dur;
        } else {
          agent.line += 1;
          agent.lineT = 0;
        }
      }
    } else {
      agent.hold -= dt;
    }
    if (!quiet && !opts.reduced && agent.age > 0.45) {
      const period = 2.45;
      const shift = agent.salt * 0.37;
      const phase = (agent.age + shift) % period;
      const prev = (agent.age - dt + shift) % period;
      if (phase < prev) opts.audio.play("stretch");
    }
    const pose = poseOf(lines, agent, opts.dir);
    if (!opts.reduced && !agent.done) {
      const caret = pose.caret;
      const key = `${Math.round(caret.x)}:${Math.round(caret.y)}:${Math.round(caret.w)}`;
      if (key !== agent.caretKey) {
        agent.caretKey = key;
        agent.pulses.push({ x: caret.x, y: caret.y, w: caret.w, h: caret.h, t: 0 });
        if (agent.pulses.length > 12) agent.pulses.shift();
      }
    }
    for (const pulse of agent.pulses) pulse.t += dt;
    if (agent.pulses.length) agent.pulses = agent.pulses.filter((pulse) => pulse.t <= 0.46);
    const bk = 1 - Math.exp(-dt * 9);
    agent.body.x += (pose.body.x - agent.body.x) * bk;
    agent.body.y += (pose.body.y - agent.body.y) * bk;
    const fk = 1 - Math.exp(-dt * (opts.reduced ? 7 : 12));
    for (let i = 0; i < 8; i++) {
      const target = pose.targets[i];
      const foot = agent.feet[i];
      foot.x += (target.x - foot.x) * fk;
      foot.y += (target.y - foot.y) * fk;
    }
    const desired = pose.sats.map((w, i) => ({
      x: w.x - 2,
      y: w.y - 2,
      w: w.w + 4,
      h: w.h + 4,
      color: LEGS[(i + 2) % LEGS.length],
    }));
    const used = new Set<number>();
    for (const d of desired) {
      let found = -1;
      for (let i = 0; i < agent.marks.length; i++) {
        if (used.has(i)) continue;
        const m = agent.marks[i];
        if (Math.abs(m.x - d.x) < 3 && Math.abs(m.y - d.y) < 3) found = i;
      }
      if (found >= 0) {
        used.add(found);
        agent.marks[found].on = true;
        agent.marks[found].color = d.color;
        agent.marks[found].w = d.w;
        agent.marks[found].h = d.h;
      } else {
        agent.marks.push({ ...d, a: 0, on: true, spin: (agent.salt + agent.line) % 3 === 0, t: 0 });
        used.add(agent.marks.length - 1);
      }
    }
    for (let i = 0; i < agent.marks.length; i++) if (!used.has(i)) agent.marks[i].on = false;
    const mk = 1 - Math.exp(-dt * 18);
    agent.marks = agent.marks.filter((m) => {
      m.a += ((m.on ? 1 : 0) - m.a) * mk;
      return m.on || m.a > 0.04;
    });
  }

  function resize() {
    const w = opts.canvas.clientWidth;
    const h = opts.canvas.clientHeight;
    if (w < 2 || h < 2) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const bw = Math.round(w * dpr);
    const bh = Math.round(h * dpr);
    if (opts.canvas.width !== bw || opts.canvas.height !== bh) {
      opts.canvas.width = bw;
      opts.canvas.height = bh;
    }
    viewW = w;
    viewH = h;
  }

  function cameraTarget(index = focus, shrink = true) {
    const page = pages[index];
    const agent = agents.find((item) => item.page === index) ?? agents[0];
    if (!page || !agent) return { x: 0, y: 0, s: 1 };
    const worldW = viewW < 720 ? Math.min(page.w, 760) : Math.min(page.w, page.w * 0.98);
    let s = viewW / worldW;
    if (shrink && !opts.reduced && !agent.flying) {
      const count = Math.max(1, page.lines.length);
      const pageU = agent.line / count;
      const lineU = Math.min(1, agent.lineT / Math.max(0.05, agent.dur));
      s *= 0.96 - 0.09 * pageU - 0.05 * lineU;
    }
    const visW = viewW / s;
    const visH = viewH / s;
    let left = agent.body.x - visW * (opts.dir === "rtl" ? 0.62 : 0.38);
    let top = agent.body.y - visH * 0.42;
    if (page.w <= visW) left = page.x - (visW - page.w) / 2;
    else left = Math.max(page.x, Math.min(page.x + page.w - visW, left));
    if (page.h <= visH) top = page.y - (visH - page.h) / 2;
    else top = Math.max(page.y - 108 / s, Math.min(page.y + page.h - visH + 72 / s, top));
    return { x: -left * s, y: -top * s, s };
  }

  function fitCam(minX: number, minY: number, maxX: number, maxY: number, padX: number, padY: number) {
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);
    const s = Math.min((viewW * padX) / w, (viewH * padY) / h);
    const left = minX - (viewW / s - w) / 2;
    const top = minY - (viewH / s - h) / 2;
    return { x: -left * s, y: -top * s, s };
  }

  function overviewCam() {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const page of pages) {
      minX = Math.min(minX, page.x);
      minY = Math.min(minY, page.y);
      maxX = Math.max(maxX, page.x + page.w);
      maxY = Math.max(maxY, page.y + page.h);
    }
    return fitCam(minX, minY, maxX, maxY, 0.88, 0.76);
  }

  function pairCam(a: number, b: number) {
    const pa = pages[a];
    const pb = pages[b];
    if (!pa || !pb) return overviewCam();
    const minX = Math.min(pa.x, pb.x) - 120;
    const minY = Math.min(pa.y, pb.y) - 120;
    const maxX = Math.max(pa.x + pa.w, pb.x + pb.w) + 120;
    const maxY = Math.max(pa.y + pa.h, pb.y + pb.h) + 120;
    return fitCam(minX, minY, maxX, maxY, 0.86, 0.78);
  }

  function pickNext() {
    const unseen = pages.map((_, i) => i).filter((i) => !visited.has(i));
    if (unseen.length) return unseen[Math.floor(Math.random() * unseen.length)];
    if (hops > 0 && pages.length > 1) {
      hops -= 1;
      let i = focus;
      let guard = 0;
      while (i === focus && guard < 8) {
        i = Math.floor(Math.random() * pages.length);
        guard += 1;
      }
      return i === focus ? -1 : i;
    }
    return -1;
  }

  function entryOf(index: number): Pt {
    const page = pages[index];
    const line = page?.lines[0];
    if (!page || !line) return { x: (page?.x ?? 0) + (page?.w ?? 0) / 2, y: (page?.y ?? 0) + 80 };
    const x = opts.dir === "rtl" ? line.x1 : line.x0;
    return { x, y: line.y + line.h * 0.5 };
  }

  function setTravel(target: { x: number; y: number; s: number }) {
    travel.fx = cam.x;
    travel.fy = cam.y;
    travel.fs = cam.s;
    travel.tx = target.x;
    travel.ty = target.y;
    travel.ts = target.s;
    tween = 0;
  }

  function tweenCam(dur: number) {
    const u = ease(Math.min(1, tween / dur));
    cam.x = travel.fx + (travel.tx - travel.fx) * u;
    cam.y = travel.fy + (travel.ty - travel.fy) * u;
    cam.s = travel.fs + (travel.ts - travel.fs) * u;
    return u;
  }

  function glide(target: { x: number; y: number; s: number }, dt: number) {
    const dist = Math.hypot(target.x - cam.x, target.y - cam.y);
    const rate = dist > 320 ? 2.2 : 7.2;
    const k = 1 - Math.exp(-dt * rate);
    cam.x += (target.x - cam.x) * k;
    cam.y += (target.y - cam.y) * k;
    cam.s += (target.s - cam.s) * (1 - Math.exp(-dt * 5.2));
  }

  function quad(a: Pt, b: Pt, c: Pt, u: number): Pt {
    const k = 1 - u;
    return {
      x: k * k * a.x + 2 * k * u * b.x + u * u * c.x,
      y: k * k * a.y + 2 * k * u * b.y + u * u * c.y,
    };
  }

  function stepFly(agent: Agent, u: number, dt: number) {
    const p = quad(hop.from, hop.ctrl, hop.to, u);
    agent.body.x = p.x;
    agent.body.y = p.y;
    agent.age += dt;
    const fk = 1 - Math.exp(-dt * 16);
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + u * 13;
      const reach = 46 + (i % 2) * 28;
      const tx = p.x + Math.cos(ang) * reach;
      const ty = p.y + Math.sin(ang) * reach * 0.58;
      const foot = agent.feet[i];
      foot.x += (tx - foot.x) * fk;
      foot.y += (ty - foot.y) * fk;
    }
  }

  function stepWonder(agent: Agent, page: Page, dt: number, quiet: boolean) {
    if (agent.done) {
      agent.hold -= dt;
      return;
    }
    agent.age += dt;
    agent.wonderT += dt;
    if (!quiet && !agent.gasped && agent.wonderT > 0.22) {
      agent.gasped = true;
      opts.audio.play("gasp");
    }
    const t = agent.wonderT;
    const cx = page.x + page.w * 0.48;
    const cy = page.y + page.h * 0.42;
    const reach = t < 0.28 ? 0 : t < 1.15 ? ease((t - 0.28) / 0.87) : t < 1.7 ? 1 : Math.max(0, 1 - (t - 1.7) / 0.55);
    const pull = reach * 42;
    const k = 1 - Math.exp(-dt * 8);
    agent.body.x += (cx - pull - agent.body.x) * k;
    agent.body.y += (cy - agent.body.y) * k;
    const tip = { x: cx + 280 * reach, y: cy - 18 };
    for (let i = 0; i < 8; i++) {
      let tx = agent.body.x;
      let ty = agent.body.y;
      if (i === 0) {
        tx = tip.x;
        ty = tip.y;
      } else if (i === 1) {
        tx = cx + 150 * reach;
        ty = cy + 48;
      } else {
        const ang = Math.PI * 0.2 + ((i - 2) / 6) * Math.PI;
        const rad = 26 + (i % 2) * 12;
        tx = agent.body.x + Math.cos(ang) * rad;
        ty = agent.body.y + Math.sin(ang) * rad * 0.72;
      }
      const foot = agent.feet[i];
      const fk = 1 - Math.exp(-dt * (i === 0 ? 6.5 : 11));
      foot.x += (tx - foot.x) * fk;
      foot.y += (ty - foot.y) * fk;
    }
    if (t > 2.45) {
      agent.done = true;
      agent.hold = quiet ? 0.08 : 0.32;
    }
  }

  function stepSwarm(dt: number, audible: Agent | null) {
    for (const agent of agents) {
      if (agent.flying) continue;
      const page = pages[agent.page];
      const lines = page?.lines ?? [];
      const lead = agent === audible;
      if (page?.barren) {
        if (!lead && agent.done && agent.hold <= 0) {
          agent.done = false;
          agent.wonderT = 0;
          agent.gasped = false;
          agent.hold = 0;
        }
        stepWonder(agent, page, dt, !lead);
        continue;
      }
      if (!lines.length) {
        agent.age += dt;
        agent.done = true;
        agent.hold -= dt;
        continue;
      }
      if (!lead && agent.done && agent.hold <= 0) {
        agent.done = false;
        agent.line = (agent.line + 1) % lines.length;
        agent.lineT = 0;
        agent.hold = 0;
        agent.budget = agent.linesRead + lines.length + 1;
        agent.caretKey = "";
      }
      const pace = lead ? 1 : 0.58 + (agent.page % 5) * 0.07;
      stepAgent(agent, lines, dt * pace, !lead);
    }
  }

  function ensureSwarm(silent = false) {
    let born = 0;
    for (let i = 0; i < pages.length; i++) {
      if (agents.some((agent) => agent.page === i)) continue;
      const lines = pages[i].lines;
      const agent = makeAgent(i, lines);
      const n = lines.length;
      if (n > 1) {
        agent.line = (i * 3 + 1) % n;
        agent.lineT = ((i * 0.17) % 1) * agent.dur;
      }
      agent.salt = i * 3 + 2;
      agent.age = 0.55 + (i % 4) * 0.07;
      agent.dur = Math.min(0.62, Math.max(0.3, agent.dur * (0.76 + (i % 4) * 0.1)));
      if (n) {
        const pose = poseOf(lines, agent, opts.dir);
        agent.body = { x: pose.body.x, y: pose.body.y };
        agent.feet = pose.targets.map((point) => ({ x: point.x, y: point.y }));
      }
      agents.push(agent);
      born += 1;
    }
    if (born && !silent) opts.audio.play("birth");
  }

  function skitter(dt: number) {
    swarmT += dt;
    if (swarmT < 0.17) return;
    swarmT = 0;
    opts.audio.play("skitter");
  }

  function camScale() {
    return Math.max(0.16, cam.s);
  }

  function fitBall(ball: Ball) {
    const page = pages[ball.page];
    const screen = (ball.perch ? 18 : 15 + ball.bulge) * (opts.reduced ? 0.92 : 1);
    let r = screen / camScale();
    if (!ball.perch && page) r = Math.min(r, Math.min(page.w, page.h) * 0.075);
    ball.r = r;
  }

  function makeBall(i: number, perch: boolean): Ball {
    const pageIndex = pages.length ? i % pages.length : 0;
    const page = pages[pageIndex];
    const ball: Ball = {
      x: page ? page.x + page.w * (0.22 + (i % 3) * 0.26) : 0,
      y: page ? page.y + page.h * (0.18 + (i % 4) * 0.16) : 0,
      vx: ((i % 2 === 0 ? 1 : -1) * (260 + (i % 4) * 40)) / camScale(),
      vy: -(420 + (i % 5) * 50) / camScale(),
      r: 12,
      color: (i % 3) as 0 | 1 | 2,
      kind: i % 2 === 0 ? "metal" : "rubber",
      squash: 0,
      page: pageIndex,
      mate: 0,
      perch,
      eye: perch ? (i % 2 === 0 ? 1 : 2) : 0,
      lid: 0,
      lidDir: 0,
      lidWait: 0.6 + (i % 5) * 0.35,
      wink: 0,
      kick: 0.12 + (i % 4) * 0.08,
      spin: i * 0.4,
      bulge: (i % 3) * 1.6,
      flight: 0,
      fromX: 0,
      fromY: 0,
      landX: 0,
      landY: 0,
    };
    fitBall(ball);
    return ball;
  }

  function launchPoint(side: -1 | 1): Pt {
    return {
      x: (viewW * (0.5 + side * 0.16) - cam.x) / cam.s,
      y: (viewH - 28 - cam.y) / cam.s,
    };
  }

  function sparkBurst(ball: Ball, n: number) {
    const s = camScale();
    for (let i = 0; i < n && sparks.length < 48; i++) {
      const a = -Math.PI * (0.15 + Math.random() * 0.7);
      const speed = (ball.kind === "metal" ? 280 + Math.random() * 220 : 80 + Math.random() * 70) / s;
      sparks.push({
        x: ball.x,
        y: ball.y,
        vx: Math.cos(a) * speed * (Math.random() < 0.5 ? -1 : 1),
        vy: Math.sin(a) * speed,
        t: 0,
        metal: ball.kind === "metal",
      });
    }
  }

  function volley(items: Ball[], side: -1 | 1) {
    const origin = launchPoint(side);
    const s = camScale();
    items.forEach((ball, i) => {
      const page = pages[ball.page];
      const spread = (i - (items.length - 1) / 2) * (22 / s);
      ball.fromX = origin.x + spread;
      ball.fromY = origin.y;
      ball.x = ball.fromX;
      ball.y = ball.fromY;
      ball.kind = i % 2 === 0 ? "metal" : "rubber";
      ball.flight = 0.7;
      if (page) {
        ball.landX = page.x + page.w * (0.22 + ((i * 2) % 5) * 0.12);
        ball.landY = page.y + page.h * (0.42 + (i % 3) * 0.14);
      } else {
        ball.landX = ball.fromX;
        ball.landY = ball.fromY - 240 / s;
      }
    });
  }

  function launchChaosBalls() {
    balls.length = 0;
    sparks.length = 0;
    const count = Math.min(8, Math.max(5, pages.length + 1));
    const made: Ball[] = [];
    for (let i = 0; i < count; i++) {
      const ball = makeBall(i, false);
      ball.page = i % pages.length;
      ball.eye = 0;
      fitBall(ball);
      balls.push(ball);
      made.push(ball);
    }
    volley(made, -1);
  }

  function launchFriendBalls() {
    balls.length = 0;
    sparks.length = 0;
    for (let i = 0; i < agents.length; i++) {
      const ball = makeBall(i, true);
      const agent = agents[i];
      ball.mate = i;
      ball.page = agent.page;
      ball.eye = i % 2 === 0 ? 1 : 2;
      ball.kind = "rubber";
      ball.x = agent.body.x;
      ball.y = agent.body.y;
      fitBall(ball);
      balls.push(ball);
    }
    const loose = Math.min(6, Math.max(3, agents.length));
    const made: Ball[] = [];
    for (let i = 0; i < loose; i++) {
      const ball = makeBall(i + 2, false);
      const agent = agents[i % agents.length];
      ball.mate = i % agents.length;
      ball.eye = 0;
      ball.perch = false;
      ball.page = agent?.page ?? 0;
      fitBall(ball);
      balls.push(ball);
      made.push(ball);
    }
    volley(made, 1);
  }

  function goldTouch(ball: Ball) {
    const page = pages[ball.page];
    if (!page || glints.length > 16) return;
    let best: Line | null = null;
    let bestD = ball.r * 7;
    for (const line of page.lines) {
      const cy = line.y + line.h * 0.5;
      const dy = Math.abs(cy - ball.y);
      if (dy < bestD) {
        best = line;
        bestD = dy;
      }
    }
    if (!best) return;
    for (const glow of glints) {
      if (glow.life > 0.2 && Math.abs(glow.y - best.y) < 3 && Math.abs(glow.x - best.x0) < 6) return;
    }
    glints.push({ x: best.x0, y: best.y, w: Math.max(28, best.x1 - best.x0), h: best.h, life: 0.7 });
  }

  function stepLids(ball: Ball, dt: number) {
    if (ball.lidDir === 0) {
      ball.lidWait -= dt;
      if (ball.lidWait <= 0) {
        ball.lidDir = 1;
        ball.wink = Math.random() < 0.2 ? 1 : 0;
      }
      return;
    }
    ball.lid += ball.lidDir * dt * 9.5;
    if (ball.lid >= 1) {
      ball.lid = 1;
      ball.lidDir = -1;
    } else if (ball.lid <= 0) {
      ball.lid = 0;
      ball.lidDir = 0;
      ball.wink = 0;
      ball.lidWait = Math.random() < 0.16 ? 0.1 : 1.5 + Math.random() * 2.4;
    }
  }

  function stepBalls(dt: number) {
    const s = camScale();
    const friends = party === "friends";
    const g = (friends ? 1680 : 2650) / s;
    const cap = 920 / s;
    for (let i = 0; i < balls.length; i++) {
      const ball = balls[i];
      stepLids(ball, dt);
      ball.squash = Math.max(0, ball.squash - dt * 8);
      fitBall(ball);
      if (ball.perch) {
        const agent = agents[ball.mate];
        if (!agent) continue;
        ball.page = agent.page;
        ball.x = agent.body.x;
        ball.y = agent.body.y + Math.sin(agent.age * 6.2) * (2.2 / s);
        ball.vx = 0;
        ball.vy = 0;
        continue;
      }
      if (ball.flight > 0) {
        const dur = 0.7;
        const was = ball.flight;
        ball.flight = Math.max(0, ball.flight - dt);
        const u = 1 - ball.flight / dur;
        const arc = Math.sin(Math.PI * Math.min(1, u)) * (320 / s);
        ball.x = ball.fromX + (ball.landX - ball.fromX) * Math.min(1, u);
        ball.y = ball.fromY + (ball.landY - ball.fromY) * Math.min(1, u) - arc;
        ball.spin += dt * (ball.kind === "metal" ? 9 : 4);
        if (was > 0 && ball.flight === 0) {
          ball.vy = -(ball.kind === "metal" ? 860 : 520) / s;
          ball.vx = (ball.landX - ball.fromX) * 0.4;
          ball.squash = ball.kind === "rubber" ? 0.85 : 0.25;
          sparkBurst(ball, ball.kind === "metal" ? 8 : 4);
          opts.audio.play("bounce");
        }
        continue;
      }
      const page = pages[ball.page];
      if (!page) continue;
      ball.spin += (ball.vx / ball.r) * dt;
      if (friends) {
        const agent = agents[ball.mate];
        if (agent) {
          const dx = agent.body.x - ball.x;
          const dy = agent.body.y - ball.y;
          const dist = Math.hypot(dx, dy) || 1;
          if (dist > 150 / s) {
            ball.vx += (dx / dist) * (520 / s) * dt;
            ball.vy += (dy / dist) * (180 / s) * dt;
          }
        }
      }
      ball.kick -= dt;
      const left = page.x + page.w * 0.06 + ball.r;
      const right = page.x + page.w * 0.94 - ball.r;
      const top = page.y + page.h * (friends ? 0.06 : 0.1) + ball.r;
      const bottom = page.y + page.h * (friends ? 0.9 : 0.78) - ball.r;
      if (right <= left || bottom <= top) continue;
      if (ball.kick <= 0 && ball.y >= bottom - 14) {
        ball.kick = (opts.reduced ? 0.7 : ball.kind === "metal" ? 0.16 : 0.28) + Math.random() * 0.22;
        const hop = ball.kind === "metal" ? 820 + Math.random() * 340 : 460 + Math.random() * 220;
        ball.vy = -(opts.reduced ? 280 : hop) / s;
        ball.vx += ((Math.random() * 2 - 1) * (opts.reduced ? 80 : ball.kind === "metal" ? 520 : 280)) / s;
      }
      ball.vy += g * dt;
      ball.vx *= Math.exp(-dt * 0.45);
      const sp = Math.hypot(ball.vx, ball.vy);
      if (sp > cap) {
        ball.vx *= cap / sp;
        ball.vy *= cap / sp;
      }
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      if (ball.x < left) {
        ball.x = left;
        ball.vx = Math.abs(ball.vx) * (ball.kind === "metal" ? 0.96 : 0.72);
        ball.squash = Math.min(1, (Math.abs(ball.vx) * s) / (ball.kind === "metal" ? 1100 : 520));
        if (ball.kind === "metal") sparkBurst(ball, 3);
      } else if (ball.x > right) {
        ball.x = right;
        ball.vx = -Math.abs(ball.vx) * (ball.kind === "metal" ? 0.96 : 0.72);
        ball.squash = Math.min(1, (Math.abs(ball.vx) * s) / (ball.kind === "metal" ? 1100 : 520));
        if (ball.kind === "metal") sparkBurst(ball, 3);
      }
      if (ball.y < top) {
        ball.y = top;
        ball.vy = Math.abs(ball.vy) * 0.72;
      }
      if (ball.y > bottom) {
        const impact = ball.vy * s;
        ball.y = bottom;
        const bounce = ball.kind === "metal" ? 0.93 : 0.62;
        ball.vy = -Math.abs(ball.vy) * bounce;
        ball.vx += (Math.random() - 0.5) * (160 / s);
        ball.squash = Math.min(1, impact / (ball.kind === "metal" ? 1400 : 480));
        if (impact > 180) {
          opts.audio.play("bounce");
          sparkBurst(ball, ball.kind === "metal" ? 6 : 3);
        }
        if (Math.abs(ball.vy) * s < 160) ball.kick = Math.min(ball.kick, 0.05);
      }
      goldTouch(ball);
      if (!friends) continue;
      const host = balls[ball.mate];
      if (!host?.perch) continue;
      const dx = ball.x - host.x;
      const dy = ball.y - host.y;
      const dist = Math.hypot(dx, dy) || 1;
      const min = ball.r + host.r * 0.92;
      if (dist >= min) continue;
      const nx = dx / dist;
      const ny = dy / dist;
      ball.x = host.x + nx * min;
      ball.y = host.y + ny * min;
      const rel = ball.vx * nx + ball.vy * ny;
      if (rel < 0) {
        ball.vx -= rel * 1.45 * nx;
        ball.vy -= rel * 1.45 * ny;
        ball.squash = 1;
        host.squash = 0.75;
        if (host.lidDir === 0) {
          host.lidDir = 1;
          host.wink = 0;
        }
        if (-rel * s > 180) opts.audio.play("bounce");
      }
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const spark = sparks[i];
      spark.t += dt;
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      spark.vy += (900 / s) * dt;
      if (spark.t > (spark.metal ? 0.45 : 0.32)) sparks.splice(i, 1);
    }
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (a.perch) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        if (b.perch || a.page !== b.page) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 < 0.01) continue;
        const dist = Math.sqrt(d2);
        const nx = dx / dist;
        const ny = dy / dist;
        const push = (min - dist) * 0.5;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel >= 0) continue;
        const imp = rel * 0.9;
        a.vx -= imp * nx;
        a.vy -= imp * ny;
        b.vx += imp * nx;
        b.vy += imp * ny;
        const hit = Math.min(1, (-rel * s) / 800);
        a.squash = hit;
        b.squash = hit;
        if (-rel * s > 200) opts.audio.play("bounce");
      }
    }
  }

  function lendFeet() {
    const s = camScale();
    const loose = agents.length;
    for (let i = loose; i < balls.length; i++) {
      const ball = balls[i];
      const agent = agents[ball.mate];
      if (!agent || agent.flying) continue;
      const dx = ball.x - agent.body.x;
      const dy = ball.y - agent.body.y;
      if (Math.hypot(dx, dy) * s > 230) continue;
      const foot = agent.feet[i % 8];
      foot.x += (ball.x - foot.x) * 0.42;
      foot.y += (ball.y - ball.r * 0.15 - foot.y) * 0.42;
    }
  }

  function releaseAgents() {
    for (const agent of agents) {
      agent.flying = false;
      if (pages[agent.page]?.barren) {
        agent.done = false;
        agent.wonderT = 0;
        agent.gasped = false;
        agent.hold = 0.2;
      }
    }
  }

  function endParty() {
    party = "off";
    chaos = false;
    balls.length = 0;
    releaseAgents();
    const back = cameraTarget(focus, true);
    cam.x = back.x;
    cam.y = back.y;
    cam.s = back.s;
    mode = "read";
  }

  function cornerOf(page: Page, index: number): Pt {
    const m = 86;
    const spots = [
      { x: page.x + m, y: page.y + m },
      { x: page.x + page.w - m, y: page.y + m },
      { x: page.x + m, y: page.y + page.h - m },
      { x: page.x + page.w - m, y: page.y + page.h - m },
    ];
    return spots[index % 4];
  }

  function stepFlee(dt: number) {
    const k = 1 - Math.exp(-dt * 5.5);
    for (const agent of agents) {
      const page = pages[agent.page];
      if (!page) continue;
      agent.flying = true;
      const spot = cornerOf(page, agent.page + agent.salt);
      agent.body.x += (spot.x - agent.body.x) * k;
      agent.body.y += (spot.y - agent.body.y) * k;
      agent.age += dt * 0.35;
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2 + agent.age;
        const tx = spot.x + Math.cos(ang) * 20;
        const ty = spot.y + Math.sin(ang) * 14;
        agent.feet[i].x += (tx - agent.feet[i].x) * k;
        agent.feet[i].y += (ty - agent.feet[i].y) * k;
      }
    }
  }

  function startChaos() {
    if (frozen) return false;
    if (party === "chaos") {
      endParty();
      return false;
    }
    party = "chaos";
    chaos = true;
    ensureSwarm(true);
    releaseAgents();
    launchChaosBalls();
    setTravel(overviewCam());
    tween = 0;
    mode = "chaos";
    opts.audio.play("gasp");
    opts.audio.play("bounce");
    return true;
  }

  function startFriends() {
    if (frozen) return false;
    if (party === "friends") {
      endParty();
      return false;
    }
    party = "friends";
    chaos = false;
    ensureSwarm(true);
    releaseAgents();
    launchFriendBalls();
    setTravel(overviewCam());
    tween = 0;
    mode = "friends";
    opts.audio.play("bounce");
    return true;
  }

  function beginTransit() {
    const next = pickNext();
    ensureSwarm();
    setTravel(overviewCam());
    opts.audio.play("thread");
    if (next < 0) {
      mode = "finale";
      finaleT = 0;
      if (!finished) {
        finished = true;
        web.push(...makeThreads(pages, opts.docs, opts.weave ?? "rhyme", opts.topic ?? ""));
        threadCount = web.length;
      }
      if (markOn) {
        markOn = false;
        opts.onMark(false);
      }
      return;
    }
    pending = next;
    mode = "lift";
  }

  function armTraveler() {
    const origin = focus;
    const dest = entryOf(pending);
    const parked = agents.find((item) => item.page === origin);
    const start = parked ? { x: parked.body.x, y: parked.body.y } : { x: dest.x, y: dest.y };
    const seen = visited.has(pending);
    let traveler = agents.find((item) => item.page === pending);
    if (!traveler) {
      traveler = makeAgent(pending, pages[pending].lines);
      agents.push(traveler);
      opts.audio.play("birth");
      hop.skim = false;
    } else if (seen) {
      hop.skim = true;
      traveler.budget = Math.min(4, Math.max(1, pages[pending].lines.length));
      traveler.done = false;
      traveler.line = 0;
      traveler.lineT = 0;
      traveler.linesRead = 0;
      traveler.hold = 0.4;
      traveler.caretKey = "";
      traveler.pulses = [];
      traveler.marks = [];
    } else hop.skim = false;
    traveler.flying = true;
    traveler.body = { ...start };
    traveler.feet = traveler.feet.map(() => ({ ...start }));
    const dx = dest.x - start.x;
    const dy = dest.y - start.y;
    const len = Math.hypot(dx, dy) || 1;
    const sign = (origin + pending) % 2 === 0 ? 1 : -1;
    const bow = Math.min(420, len * 0.24) * sign;
    hop.from = start;
    hop.to = dest;
    hop.ctrl = { x: (start.x + dest.x) / 2 + (-dy / len) * bow, y: (start.y + dest.y) / 2 + (dx / len) * bow };
    hop.agent = traveler;
  }

  function hover(agent: Agent, dt: number) {
    agent.age += dt;
    agent.body.x = hop.from.x;
    agent.body.y = hop.from.y;
    const fk = 1 - Math.exp(-dt * 12);
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + agent.age * 2.4;
      const reach = 32 + (i % 2) * 14;
      const tx = hop.from.x + Math.cos(ang) * reach;
      const ty = hop.from.y + Math.sin(ang) * reach * 0.62;
      const foot = agent.feet[i];
      foot.x += (tx - foot.x) * fk;
      foot.y += (ty - foot.y) * fk;
    }
  }

  function beginCross() {
    const origin = focus;
    if (!hop.agent) armTraveler();
    focus = pending;
    visited.add(pending);
    pageSent = pending;
    opts.onPage(pending);
    setTravel(pairCam(origin, pending));
    mode = "cross";
    opts.audio.play("page");
    emit();
  }

  function land() {
    const agent = hop.agent;
    if (agent) {
      agent.flying = false;
      agent.line = 0;
      agent.lineT = 0;
      agent.linesRead = 0;
      agent.wonderT = 0;
      agent.gasped = false;
      agent.done = !pages[pending].barren && pages[pending].lines.length === 0;
      agent.budget = hop.skim ? Math.min(4, Math.max(1, pages[pending].lines.length)) : Math.max(1, pages[pending].lines.length);
      agent.hold = 0.35;
      agent.age = 0;
      agent.body.x = hop.to.x;
      agent.body.y = hop.to.y;
    }
    setTravel(cameraTarget(pending, true));
    mode = "dive";
  }

  function flashOn(t: number) {
    const beats: [number, number][] = [
      [0.12, 0.26],
      [0.4, 0.52],
      [0.58, 0.7],
      [0.96, 1.1],
      [1.16, 1.28],
      [1.62, 1.86],
      [1.94, 2.08],
    ];
    for (const [a, b] of beats) if (t >= a && t < b) return true;
    return false;
  }

  function drawLeg(ctx: CanvasRenderingContext2D, body: Pt, foot: Pt, color: string, bend: number, scale: number) {
    const dx = foot.x - body.x;
    const dy = foot.y - body.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const p1x = body.x + dx * 0.34 + nx * bend;
    const p1y = body.y + dy * 0.34 + ny * bend;
    const p2x = body.x + dx * 0.7 + nx * bend * -0.25;
    const p2y = body.y + dy * 0.7 + ny * bend * -0.25;
    ctx.beginPath();
    ctx.moveTo(body.x, body.y);
    ctx.lineTo(p1x, p1y);
    ctx.lineTo(p2x, p2y);
    ctx.lineTo(foot.x, foot.y);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(0,0,0,0.72)";
    ctx.lineWidth = 4.2 / scale;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.35 / scale;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 0.45 / scale;
    ctx.stroke();
    for (const [px, py, r] of [
      [p1x, p1y, 2.15],
      [p2x, p2y, 1.7],
      [foot.x, foot.y, 2.5],
    ] as const) {
      ctx.beginPath();
      ctx.arc(px, py, r / scale, 0, Math.PI * 2);
      ctx.fillStyle = "#07080c";
      ctx.fill();
      ctx.lineWidth = 1.15 / scale;
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(px, py, 0.85 / scale, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  function axisOf(ctx: CanvasRenderingContext2D, box: Word, tumble: number) {
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    ctx.translate(cx, cy);
    ctx.rotate(Math.sin(tumble) * 1.05);
    ctx.scale(Math.max(-1, Math.min(1, Math.cos(tumble))), 1);
    ctx.translate(-cx, -cy);
  }

  function fillMark(ctx: CanvasRenderingContext2D, mark: Word, color: string, dark: boolean, scale: number, alpha: number, tumble = 0) {
    ctx.save();
    if (tumble) axisOf(ctx, mark, tumble);
    if (dark) {
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.58 * alpha;
      ctx.fillStyle = color;
      ctx.fillRect(mark.x, mark.y, mark.w, mark.h);
    } else {
      ctx.globalAlpha = 0.42 * alpha;
      ctx.fillStyle = color;
      ctx.fillRect(mark.x, mark.y, mark.w, mark.h);
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2 / scale;
    ctx.strokeRect(mark.x, mark.y, mark.w, mark.h);
    ctx.restore();
  }

  function tumbleStrip(ctx: CanvasRenderingContext2D, page: Page, box: Word, tumble: number, alpha: number) {
    if (Math.abs(Math.cos(tumble)) < 0.06) return;
    const img = page.image;
    const sx = ((box.x - page.x) / page.w) * img.naturalWidth;
    const sy = ((box.y - page.y) / page.h) * img.naturalHeight;
    const sw = (box.w / page.w) * img.naturalWidth;
    const sh = (box.h / page.h) * img.naturalHeight;
    if (sw < 1 || sh < 1) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    axisOf(ctx, box, tumble);
    ctx.drawImage(img, sx, sy, sw, sh, box.x, box.y, box.w, box.h);
    ctx.restore();
  }

  function paintSwell(ctx: CanvasRenderingContext2D, page: Page, word: Word, amp: number) {
    const img = page.image;
    const sx = ((word.x - page.x) / page.w) * img.naturalWidth;
    const sy = ((word.y - page.y) / page.h) * img.naturalHeight;
    const sw = (word.w / page.w) * img.naturalWidth;
    const sh = (word.h / page.h) * img.naturalHeight;
    if (sw < 1 || sh < 1 || sx < -2 || sy < -2) return;
    const sc = 1 + 0.34 * amp;
    const cx = word.x + word.w / 2;
    const cy = word.y + word.h / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(word.x, word.y, word.w, word.h);
    ctx.clip();
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "#000";
    ctx.fillRect(word.x, word.y, word.w, word.h);
    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(sc, sc);
    ctx.translate(-cx, -cy);
    ctx.drawImage(img, sx, sy, sw, sh, word.x, word.y, word.w, word.h);
    ctx.restore();
  }

  function lidOpen(ball: Ball, which: 0 | 1) {
    const t = ball.wink === 1 && which === 1 ? 0 : ball.lid;
    const s = t * t * (3 - 2 * t);
    return 0.07 + 0.93 * (1 - s);
  }

  function drawStar(ctx: CanvasRenderingContext2D, r: number) {
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const rad = k % 2 === 0 ? r : r * 0.42;
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const x = Math.cos(a) * rad;
      const y = Math.sin(a) * rad;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function drawRay(ctx: CanvasRenderingContext2D, r: number) {
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.lineTo(r, 0);
    ctx.moveTo(0, -r);
    ctx.lineTo(0, r);
    const d = r * 0.62;
    ctx.moveTo(-d, -d);
    ctx.lineTo(d, d);
    ctx.moveTo(d, -d);
    ctx.lineTo(-d, d);
  }

  function drawEye(ctx: CanvasRenderingContext2D, ball: Ball, ex: number, ey: number, which: 0 | 1, rx: number, ry: number) {
    const open = lidOpen(ball, which);
    const ink = BALL_INK[ball.color];
    ctx.save();
    ctx.translate(ex, ey);
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    if (ball.eye === 1) {
      ctx.scale(1, Math.max(0.08, open));
      drawStar(ctx, rx * 0.34);
      ctx.fill();
    } else if (ball.eye === 2) {
      ctx.lineCap = "round";
      ctx.lineWidth = Math.max(rx * 0.1, 1.15 / cam.s);
      drawRay(ctx, rx * 0.46 * Math.max(0.08, open));
      ctx.stroke();
    } else {
      const erx = rx * 0.2;
      const ery = Math.max(ry * 0.3 * open, 0.55 / cam.s);
      ctx.beginPath();
      ctx.ellipse(0, 0, erx, ery, 0, 0, Math.PI * 2);
      ctx.fill();
      if (open > 0.58) {
        ctx.fillStyle = ball.color === 1 ? "#f6f6f1" : "#101114";
        ctx.beginPath();
        ctx.ellipse(erx * 0.15, ery * 0.08, erx * 0.34, ery * 0.38, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawBall(ctx: CanvasRenderingContext2D, ball: Ball, alpha: number) {
    const metal = ball.kind === "metal";
    const squash = ball.squash * (metal ? 0.45 : 1);
    const rx = ball.r * (1 + (metal ? 0.12 : 0.42) * squash);
    const ry = Math.max(ball.r * (metal ? 0.82 : 0.42), ball.r * (1 - (metal ? 0.16 : 0.48) * squash));
    const look = Math.max(-1, Math.min(1, (ball.vx * cam.s) / 640));
    const lookY = Math.max(-0.35, Math.min(0.45, (ball.vy * cam.s) / 900));
    const drop = ry * (metal ? 0.05 : 0.16) * squash;
    const fill = metal ? METAL[ball.color] : BALL_FILL[ball.color];
    ctx.save();
    ctx.globalAlpha = alpha * (metal ? 0.35 : 0.28);
    ctx.beginPath();
    ctx.ellipse(ball.x + rx * 0.15, ball.y + ry * 0.9, rx * 0.72, Math.max(ry * 0.16, 0.8 / cam.s), 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(ball.x, ball.y + drop);
    if (!ball.perch) ctx.rotate(ball.spin);
    const body = ctx.createRadialGradient(-rx * 0.35, -ry * 0.4, rx * 0.1, 0, 0, Math.max(rx, ry));
    if (metal) {
      body.addColorStop(0, "#ffffff");
      body.addColorStop(0.18, fill);
      body.addColorStop(0.55, fill);
      body.addColorStop(1, "#1a1c22");
    } else {
      body.addColorStop(0, "rgba(255,255,255,0.55)");
      body.addColorStop(0.28, fill);
      body.addColorStop(1, "#05060a");
    }
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.lineWidth = (metal ? 1.1 : 2.4) / cam.s;
    ctx.strokeStyle = metal ? "rgba(255,255,255,0.75)" : BALL_RIM[ball.color];
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.beginPath();
    if (metal) {
      ctx.ellipse(-rx * 0.18, -ry * 0.22, rx * 0.46, ry * 0.18, -0.6, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.72)";
    } else if (ball.color === 1) {
      ctx.ellipse(0, ry * 0.36, rx * 0.48, ry * 0.2, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(16,17,20,0.12)";
    } else {
      ctx.ellipse(-rx * 0.28, -ry * 0.34, rx * 0.24, ry * 0.15, -0.45, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(246,246,241,0.45)";
    }
    ctx.fill();
    ctx.restore();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(ball.x, ball.y + drop);
    const ox = look * rx * 0.12;
    const oy = lookY * ry * 0.08;
    drawEye(ctx, ball, -rx * 0.26 + ox, -ry * 0.06 + oy, 0, rx, ry);
    drawEye(ctx, ball, rx * 0.26 + ox, -ry * 0.1 + oy, 1, rx, ry);
    ctx.restore();
  }

  function drawSparks(ctx: CanvasRenderingContext2D) {
    for (const spark of sparks) {
      const life = 1 - spark.t / (spark.metal ? 0.45 : 0.32);
      if (life <= 0) continue;
      ctx.globalAlpha = life;
      ctx.strokeStyle = spark.metal ? "#f4f4f5" : "#ffd24a";
      ctx.lineWidth = (spark.metal ? 1.4 : 2.2) / cam.s;
      ctx.beginPath();
      ctx.moveTo(spark.x, spark.y);
      ctx.lineTo(spark.x - spark.vx * 0.04, spark.y - spark.vy * 0.04);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    const ctx = opts.canvas.getContext("2d");
    if (!ctx || viewW < 2) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#07080c";
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.setTransform(dpr * cam.s, 0, 0, dpr * cam.s, dpr * cam.x, dpr * cam.y);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const surface = opts.surface ?? "void";
    if (surface !== "void" && pages.length) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const page of pages) {
        minX = Math.min(minX, page.x);
        minY = Math.min(minY, page.y);
        maxX = Math.max(maxX, page.x + page.w);
        maxY = Math.max(maxY, page.y + page.h);
      }
      const dx = minX - 280;
      const dy = minY - 220;
      const dw = maxX - minX + 560;
      const dh = maxY - minY + 440;
      if (surface === "photo" && opts.desk) {
        const img = opts.desk;
        const ir = img.naturalWidth / Math.max(1, img.naturalHeight);
        const r = dw / dh;
        let iw = dw;
        let ih = dh;
        let ix = dx;
        let iy = dy;
        if (ir > r) {
          iw = dh * ir;
          ix = dx - (iw - dw) / 2;
        } else {
          ih = dw / ir;
          iy = dy - (ih - dh) / 2;
        }
        ctx.save();
        ctx.beginPath();
        ctx.rect(dx, dy, dw, dh);
        ctx.clip();
        ctx.drawImage(img, ix, iy, iw, ih);
        ctx.restore();
      } else {
        ctx.fillStyle = "#140c09";
        ctx.fillRect(dx - 34, dy - 34, dw + 68, dh + 68);
        ctx.fillStyle = "#6a4628";
        ctx.fillRect(dx - 12, dy - 12, dw + 24, dh + 24);
        const plank = 84;
        let row = 0;
        for (let py = dy; py < dy + dh; py += plank) {
          const hh = Math.min(plank - 5, dy + dh - py);
          const tone = 62 + ((row * 19) % 26);
          ctx.fillStyle = `rgb(${tone + 48},${Math.round(tone * 0.58)},${Math.round(tone * 0.32)})`;
          ctx.fillRect(dx, py, dw, hh);
          ctx.strokeStyle = "rgba(28,14,6,0.4)";
          ctx.lineWidth = 2 / cam.s;
          ctx.beginPath();
          ctx.moveTo(dx, py + hh);
          ctx.lineTo(dx + dw, py + hh);
          ctx.stroke();
          ctx.strokeStyle = "rgba(255,214,160,0.07)";
          ctx.lineWidth = 1 / cam.s;
          for (let g = 0; g < 2; g++) {
            const gy = py + 12 + ((row * 17 + g * 29) % Math.max(10, hh - 16));
            ctx.beginPath();
            ctx.moveTo(dx, gy);
            for (let k = 1; k <= 5; k++) ctx.lineTo(dx + (dw * k) / 5, gy + Math.sin(k + row) * 5);
            ctx.stroke();
          }
          row += 1;
        }
      }
    }
    for (const page of pages) {
      if (surface !== "void") {
        ctx.fillStyle = "rgba(0,0,0,0.38)";
        ctx.fillRect(page.x + 18, page.y + 22, page.w, page.h);
      }
      ctx.drawImage(page.image, page.x, page.y, page.w, page.h);
      const wide = mode !== "read";
      ctx.strokeStyle = wide ? "rgba(92,225,255,0.28)" : "rgba(255,255,255,0.08)";
      ctx.lineWidth = (wide ? 2.2 : 1) / cam.s;
      ctx.strokeRect(page.x, page.y, page.w, page.h);
    }
    if (glints.length) {
      ctx.save();
      for (const glow of glints) {
        ctx.globalAlpha = Math.min(0.62, glow.life);
        ctx.fillStyle = "#f0b429";
        ctx.fillRect(glow.x, glow.y, glow.w, Math.max(10, glow.h));
      }
      ctx.restore();
    }
    if (finished && (mode === "finale" || mode === "chaos" || mode === "friends")) {
      for (const thread of web) {
        ctx.beginPath();
        ctx.moveTo(thread.x0, thread.y0);
        ctx.lineTo(thread.x1, thread.y1);
        ctx.lineCap = "round";
        ctx.strokeStyle = thread.color === "#111111" ? "rgba(255,255,255,0.72)" : "rgba(0,0,0,0.55)";
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = (thread.hot ? 4.4 : 2.8) / cam.s;
        ctx.stroke();
        ctx.strokeStyle = thread.color;
        ctx.globalAlpha = thread.hot ? 1 : 0.82;
        ctx.lineWidth = (thread.hot ? 2.1 : 1.15) / cam.s;
        ctx.stroke();
        ctx.globalAlpha = 1;
        const knot = (thread.hot ? 5.2 : 3.4) / cam.s;
        ctx.fillStyle = thread.color === "#111111" ? "#f6f6f1" : thread.color;
        ctx.fillRect(thread.x0 - knot / 2, thread.y0 - knot / 2, knot, knot);
        ctx.fillRect(thread.x1 - knot / 2, thread.y1 - knot / 2, knot, knot);
      }
    }
    agents.forEach((agent, ai) => {
      const page = pages[agent.page];
      if (!page) return;
      const pose = agent.flying || !page.lines.length ? null : poseOf(page.lines, agent, opts.dir);
      const fade = Math.min(1, agent.age / 0.28);
      const barTurn = opts.reduced || chaos ? 0 : spinT * 1.8;
      const live = page.lines[agent.line];
      if (pose && live && !page.barren && !chaos) {
        const plate = { x: live.x0, y: live.y - 2, w: Math.max(24, live.x1 - live.x0), h: live.h + 4 };
        tumbleStrip(ctx, page, plate, barTurn, fade);
        fillMark(ctx, plate, pose.color, page.dark, cam.s, fade, barTurn);
      }
      if (!page.barren && !chaos) {
        for (const mark of agent.marks) fillMark(ctx, mark, mark.color, page.dark, cam.s, mark.a * fade);
      }
      if (!page.barren && !chaos && !opts.reduced && !agent.flying && agent.page === focus && (mode === "read" || mode === "dive")) {
        for (const pulse of agent.pulses) {
          const amp = Math.sin(Math.PI * Math.min(1, pulse.t / 0.42));
          if (amp < 0.04) continue;
          paintSwell(ctx, page, pulse, amp);
        }
      }
      if (pose) {
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.fillRect(pose.head - 1 / cam.s, pose.bar.y, 2 / cam.s, pose.bar.h);
      }
      const stretch = opts.reduced || agent.flying || page.barren ? 0 : stretchOf(agent.age, agent.salt).amp;
      const reach = 1 + 0.46 * stretch;
      const body = { x: agent.body.x, y: agent.body.y - 20 * stretch };
      for (let i = 0; i < 8; i++) {
        const foot = agent.feet[i];
        const placed = {
          x: agent.body.x + (foot.x - agent.body.x) * reach,
          y: agent.body.y + (foot.y - agent.body.y) * reach,
        };
        const dx = placed.x - body.x;
        const dy = placed.y - body.y;
        const len = Math.hypot(dx, dy) || 1;
        const side = placed.x >= body.x ? 1 : -1;
        const wobble = opts.reduced ? 0 : Math.sin(agent.age * 7.5 + i * 1.15) * 16;
        const bend = side * Math.min(190, Math.max(36, len * 0.5)) * (1 + 0.2 * stretch) + wobble;
        const color = i < 2 && pose ? pose.color : LEGS[i];
        ctx.globalAlpha = fade;
        drawLeg(ctx, body, placed, color, bend, cam.s);
        ctx.globalAlpha = 1;
      }
      const perch = party === "friends" ? balls[ai] : undefined;
      if (perch?.perch) {
        perch.x = body.x;
        perch.y = body.y + Math.sin(agent.age * 6.2) * (2.2 / camScale());
        drawBall(ctx, perch, fade);
      } else {
        const hub = pose?.color ?? "#5ce1ff";
        const grow = 1 + 0.9 * stretch;
        const hx = (6.5 / cam.s) * grow;
        const hy = (7.4 / cam.s) * grow;
        ctx.globalAlpha = fade;
        ctx.beginPath();
        ctx.moveTo(body.x, body.y - hy);
        ctx.lineTo(body.x + hx, body.y);
        ctx.lineTo(body.x, body.y + hy);
        ctx.lineTo(body.x - hx, body.y);
        ctx.closePath();
        ctx.fillStyle = "#07080c";
        ctx.fill();
        ctx.lineWidth = 1.4 / cam.s;
        ctx.strokeStyle = hub;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(body.x, body.y, (1.8 / cam.s) * (1 + 0.35 * stretch), 0, Math.PI * 2);
        ctx.fillStyle = hub;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    });
    for (let i = 0; i < balls.length; i++) {
      const ball = balls[i];
      if (ball.perch) continue;
      drawBall(ctx, ball, 1);
    }
    drawSparks(ctx);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx.createRadialGradient(viewW * 0.5, viewH * 0.48, viewW * 0.28, viewW * 0.5, viewH * 0.5, viewW * 0.72);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.38)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, viewW, viewH);
    const topFade = ctx.createLinearGradient(0, 0, 0, 64);
    topFade.addColorStop(0, "#07080c");
    topFade.addColorStop(1, "rgba(7,8,12,0)");
    ctx.fillStyle = topFade;
    ctx.fillRect(0, 0, viewW, 64);
    const botFade = ctx.createLinearGradient(0, viewH - 78, 0, viewH);
    botFade.addColorStop(0, "rgba(7,8,12,0)");
    botFade.addColorStop(1, "#07080c");
    ctx.fillStyle = botFade;
    ctx.fillRect(0, viewH - 78, viewW, 78);
  }

  function clockPace() {
    if (finished) return 1;
    const left = Math.max(0.35, showFor * 0.86 - showT);
    const unread = Math.max(0, pages.length - visited.size);
    const here = mode === "read" || mode === "dive" ? 0.6 : 0.2;
    const guess = (unread + here) * 7.2;
    return Math.min(8, Math.max(0.18, guess / left));
  }

  function settleFinale() {
    if (!finished) {
      finished = true;
      web.push(...makeThreads(pages, opts.docs, opts.weave ?? "rhyme", opts.topic ?? ""));
      threadCount = web.length;
      ensureSwarm(true);
    }
    party = "off";
    chaos = false;
    balls.length = 0;
    sparks.length = 0;
    glints.length = 0;
    const shot = overviewCam();
    cam.x = shot.x;
    cam.y = shot.y;
    cam.s = shot.s;
    mode = "finale";
    if (!frozen) {
      frozen = true;
      opts.onHold?.(true);
    }
    emit();
  }

  function frame(now: number) {
    if (!running) return;
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    resize();
    if (!cam.ready && viewW > 2) {
      const target = cameraTarget();
      cam.x = target.x;
      cam.y = target.y;
      cam.s = target.s;
      cam.ready = true;
    }
    if (!paused && viewW > 2 && !frozen) {
      showT += dt;
      spinT += dt;
      for (let i = glints.length - 1; i >= 0; i--) {
        glints[i].life -= dt;
        if (glints[i].life <= 0) glints.splice(i, 1);
      }
      if (showT >= showFor) settleFinale();
    }
    if (!paused && viewW > 2 && !frozen) {
      const fast = opts.reduced;
      const paced = dt * clockPace();
      if (mode === "read") {
        const agent = agents.find((item) => item.page === focus) ?? agents[0];
        stepSwarm(fast ? paced * 0.55 : paced, agent);
        glide(cameraTarget(focus, true), dt);
        if (agent.done && agent.hold <= 0) beginTransit();
      } else if (mode === "lift") {
        tween += paced;
        const dur = fast ? 0.42 : 0.9;
        tweenCam(dur);
        const agent = agents.find((item) => item.page === focus) ?? null;
        stepSwarm(paced, agent);
        skitter(dt);
        if (tween >= dur) {
          armTraveler();
          tween = 0;
          mode = "hold";
        }
      } else if (mode === "hold") {
        tween += paced;
        if (hop.agent) hover(hop.agent, paced);
        stepSwarm(paced, null);
        skitter(dt);
        if (tween >= (fast ? 0.08 : 0.36)) beginCross();
      } else if (mode === "cross") {
        tween += paced;
        const dur = fast ? 0.5 : 1.12;
        const u = tweenCam(dur);
        if (hop.agent) stepFly(hop.agent, u, paced);
        stepSwarm(paced, null);
        skitter(dt);
        if (tween >= dur) land();
      } else if (mode === "dive") {
        tween += paced;
        const dur = fast ? 0.42 : 0.84;
        tweenCam(dur);
        stepSwarm(paced * (fast ? 0.4 : 0.62), hop.agent);
        if (tween >= dur) mode = "read";
      } else if (mode === "chaos") {
        tween += dt;
        const dur = fast ? 0.32 : 0.72;
        if (tween <= dur) tweenCam(dur);
        stepFlee(dt);
        stepBalls(dt);
      } else if (mode === "friends") {
        tween += dt;
        const dur = fast ? 0.32 : 0.7;
        if (tween <= dur) tweenCam(dur);
        stepSwarm(fast ? dt * 0.65 : dt, null);
        stepBalls(dt);
        lendFeet();
      } else {
        finaleT += dt;
        tween += dt;
        const dur = fast ? 0.4 : 0.9;
        if (tween <= dur) tweenCam(dur);
        stepSwarm(dt, null);
        skitter(dt);
        const on = flashOn(finaleT);
        if (on !== markOn) {
          markOn = on;
          opts.onMark(on);
        }
      }
      statsT += dt;
      if (statsT > 0.12) {
        statsT = 0;
        emit();
      }
    }
    draw();
    raf = requestAnimationFrame(frame);
  }

  raf = requestAnimationFrame(frame);
  return {
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    toggle() {
      paused = !paused;
      last = performance.now();
      return paused;
    },
    grokbot() {
      return startChaos();
    },
    friends() {
      return startFriends();
    },
  };
}
