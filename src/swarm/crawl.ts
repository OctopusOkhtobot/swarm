import type { Sfx } from "./audio";
import { makeWeb, quadAt, strandPoint, sway, type Anchor, type Pt, type Web } from "./web";

export type NormBox = { x: number; y: number; w: number; h: number };
export type Scan = { boxes: NormBox[]; dark: boolean; barren: boolean };
export type ReadDir = "rtl" | "ltr";
export type DocLine = { y: number; h: number; x0: number; x1: number; text: string };
export type Weave = "rhyme" | "topic";
export type Surface = "void" | "table" | "photo";

const TAU = Math.PI * 2;
const LEGS = ["#5ce1ff", "#ff4ad8", "#d6ff4a", "#ffd24a", "#ff5d3a", "#c9a6ff", "#5ce1ff", "#ff4ad8"];
const LINE_COLORS = ["#5ce1ff", "#ff4ad8", "#d6ff4a", "#ffd24a"];

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
  stepU: number[];
  stepFrom: Pt[];
  stepCool: number[];
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
  lid: number;
  lidDir: number;
  lidWait: number;
  kick: number;
  spin: number;
  bulge: number;
  flight: number;
  fromX: number;
  fromY: number;
  landX: number;
  landY: number;
  h: number;
  vh: number;
  face: number;
  trail: Pt[];
  trailClock: number;
};

type Spider = {
  edge: number;
  u: number;
  dir: 1 | -1;
  speed: number;
  pause: number;
  size: number;
  accent: string;
  age: number;
  x: number;
  y: number;
  heading: number;
  hop: number;
  hopV: number;
  hopWait: number;
  body: Pt;
  feet: Pt[];
  stepU: number[];
  stepFrom: Pt[];
  stepCool: number[];
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
    stepU: Array.from({ length: 8 }, () => -1),
    stepFrom: Array.from({ length: 8 }, () => ({ ...origin })),
    stepCool: Array.from({ length: 8 }, (_, i) => 0.02 * i),
    marks: [],
    pulses: [],
    budget: Math.max(1, lines.length),
  };
}

export type CrawlStats = { agents: number; pages: number; lines: number; seen: number[]; threads: number; left: number };
export type CrawlHandle = { stop: () => void; toggle: () => boolean; grokbot: () => boolean; friends: () => boolean; spiders: () => boolean };


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

const THREAD_INK = ["#c52825", "#171717"] as const;

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
  let mode: "read" | "lift" | "hold" | "cross" | "dive" | "finale" | "chaos" | "friends" | "spiders" = "read";
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
  let web: Web | null = null;
  let webT = 0;
  const spiders: Spider[] = [];
  const tmpA: Pt = { x: 0, y: 0 };
  const tmpB: Pt = { x: 0, y: 0 };
  let party: "off" | "chaos" | "friends" | "spiders" = "off";
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

  function buildWeb(): Web {
    if (web) return web;
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
    const topicMode = (opts.weave ?? "rhyme") === "topic" && (opts.topic ?? "").trim().length >= 2;
    const perPage = pages.map((page, index) => anchorsOf(page, opts.docs?.[index], topicMode ? (opts.topic ?? "") : ""));
    web = makeWeb({ minX, minY, maxX, maxY }, perPage, topicMode);
    threadCount = web.total;
    return web;
  }

  function webAmp() {
    return opts.reduced ? 0 : Math.min(9, 1.7 / camScale());
  }

  const STEP_DUR = 0.1;
  type Walker = { body: Pt; feet: Pt[]; stepU: number[]; stepFrom: Pt[]; stepCool: number[] };
  function stepFeet(who: Walker, targets: Pt[], dt: number, thresh: number, maxReach: number) {
    for (let i = 0; i < who.feet.length; i++) {
      const foot = who.feet[i];
      const t = targets[i];
      if (who.stepU[i] >= 0) {
        who.stepU[i] += dt / STEP_DUR;
        const u = Math.min(1, who.stepU[i]);
        const e = ease(u);
        const f = who.stepFrom[i];
        foot.x = f.x + (t.x - f.x) * e;
        foot.y = f.y + (t.y - f.y) * e;
        if (u >= 1) {
          who.stepU[i] = -1;
          who.stepCool[i] = 0.035 + Math.random() * 0.06;
        }
        continue;
      }
      who.stepCool[i] -= dt;
      const d = Math.hypot(t.x - foot.x, t.y - foot.y);
      const reach = Math.hypot(foot.x - who.body.x, foot.y - who.body.y);
      if ((d > thresh && who.stepCool[i] <= 0) || reach > maxReach || d > maxReach * 0.6) {
        who.stepU[i] = 0;
        who.stepFrom[i].x = foot.x;
        who.stepFrom[i].y = foot.y;
      }
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
    if (opts.reduced) {
      const fk = 1 - Math.exp(-dt * 7);
      for (let i = 0; i < 8; i++) {
        const target = pose.targets[i];
        const foot = agent.feet[i];
        foot.x += (target.x - foot.x) * fk;
        foot.y += (target.y - foot.y) * fk;
      }
    } else {
      stepFeet(agent, pose.targets, dt, 22, 340);
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
    const screen = (ball.perch ? 16.5 : 29 + ball.bulge * 1.4) * (opts.reduced ? 0.92 : 1);
    let r = screen / camScale();
    if (!ball.perch && page) r = Math.min(r, Math.min(page.w, page.h) * 0.2);
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
      lid: 0,
      lidDir: 0,
      lidWait: 0.6 + (i % 5) * 0.35,
      kick: 0.12 + (i % 4) * 0.08,
      spin: i * 0.4,
      bulge: (i % 3) * 1.6,
      flight: 0,
      fromX: 0,
      fromY: 0,
      landX: 0,
      landY: 0,
      h: 0,
      vh: 0,
      face: 0,
      trail: [],
      trailClock: 0,
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
        y: ball.y - ball.h - ball.r * 0.4,
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
      ball.trail.length = 0;
      ball.trailClock = 0;
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
      ball.lidWait = Math.random() < 0.16 ? 0.1 : 1.5 + Math.random() * 2.4;
    }
  }

  function floorOf(page: Page, friends: boolean, r: number) {
    return {
      left: page.x + page.w * 0.06 + r,
      right: page.x + page.w * 0.94 - r,
      top: page.y + page.h * (friends ? 0.08 : 0.12),
      bottom: page.y + page.h * (friends ? 0.9 : 0.8),
    };
  }

  function depthOf(ball: Ball) {
    const page = pages[ball.page];
    if (!page) return 1;
    const f = floorOf(page, party === "friends", 0);
    const u = Math.max(0, Math.min(1, (ball.y - f.top) / Math.max(1, f.bottom - f.top)));
    return 0.82 + 0.36 * u;
  }

  function recordBallTrails(dt: number) {
    const s = camScale();
    for (const ball of balls) {
      if (ball.perch) {
        ball.trail.length = 0;
        continue;
      }
      ball.trailClock += dt;
      if (ball.trailClock < 0.032) continue;
      ball.trailClock = 0;
      const point = { x: ball.x, y: ball.y - ball.h - ball.r * 0.7 };
      const last = ball.trail[0];
      if (last && Math.hypot(point.x - last.x, point.y - last.y) < 10 / s) continue;
      ball.trail.unshift(point);
      if (ball.trail.length > 10) ball.trail.pop();
    }
  }

  function ballImpact(ball: Ball) {
    opts.audio.play(ball.kind === "metal" ? "metal" : "rubber");
  }

  function stepBalls(dt: number) {
    const s = camScale();
    const friends = party === "friends";
    const g = (friends ? 1500 : 2100) / s;
    const cap = 820 / s;
    for (let i = 0; i < balls.length; i++) {
      const ball = balls[i];
      stepLids(ball, dt);
      ball.squash = Math.max(0, ball.squash - dt * 8);
      fitBall(ball);
      ball.face += (Math.max(-1, Math.min(1, (ball.vx * s) / 420)) - ball.face) * (1 - Math.exp(-dt * 7));
      if (ball.perch) {
        const agent = agents[ball.mate];
        if (!agent) continue;
        ball.page = agent.page;
        ball.x = agent.body.x;
        ball.y = agent.body.y + Math.sin(agent.age * 6.2) * (2.2 / s);
        ball.vx = 0;
        ball.vy = 0;
        ball.h = 0;
        continue;
      }
      if (ball.flight > 0) {
        const dur = 0.7;
        const was = ball.flight;
        ball.flight = Math.max(0, ball.flight - dt);
        const u = Math.min(1, 1 - ball.flight / dur);
        const arc = Math.sin(Math.PI * u) * (330 / s);
        ball.x = ball.fromX + (ball.landX - ball.fromX) * u;
        ball.y = ball.fromY + (ball.landY - ball.fromY) * u;
        ball.h = arc;
        ball.spin += dt * (ball.kind === "metal" ? 9 : 4);
        if (was > 0 && ball.flight === 0) {
          ball.trail.length = 0;
          ball.trailClock = 0;
          ball.h = 0;
          ball.vh = (ball.kind === "metal" ? 760 : 480) / s;
          ball.vx = (ball.landX - ball.fromX) * 0.35;
          ball.vy = (Math.random() - 0.5) * (240 / s);
          ball.squash = ball.kind === "rubber" ? 0.85 : 0.25;
          sparkBurst(ball, ball.kind === "metal" ? 8 : 4);
          ballImpact(ball);
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
            ball.vy += (dy / dist) * (360 / s) * dt;
          }
        }
      }
      ball.kick -= dt;
      const lim = floorOf(page, friends, ball.r);
      if (lim.right <= lim.left || lim.bottom <= lim.top) continue;
      const grounded = ball.h <= ball.r * 0.05;
      if (ball.kick <= 0 && grounded) {
        ball.kick = (opts.reduced ? 0.7 : ball.kind === "metal" ? 0.2 : 0.32) + Math.random() * 0.24;
        const hop = ball.kind === "metal" ? 620 + Math.random() * 320 : 400 + Math.random() * 240;
        ball.vh = (opts.reduced ? 260 : hop) / s;
        ball.vx += ((Math.random() * 2 - 1) * (opts.reduced ? 80 : ball.kind === "metal" ? 420 : 240)) / s;
        ball.vy += ((Math.random() * 2 - 1) * (opts.reduced ? 60 : ball.kind === "metal" ? 360 : 210)) / s;
      }
      ball.vh -= g * dt;
      ball.h += ball.vh * dt;
      const drag = Math.exp(-dt * (grounded ? 1.5 : 0.3));
      ball.vx *= drag;
      ball.vy *= drag;
      const sp = Math.hypot(ball.vx, ball.vy);
      if (sp > cap) {
        ball.vx *= cap / sp;
        ball.vy *= cap / sp;
      }
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      const wall = ball.kind === "metal" ? 0.94 : 0.7;
      if (ball.x < lim.left) {
        ball.x = lim.left;
        ball.vx = Math.abs(ball.vx) * wall;
        ball.squash = Math.min(1, (Math.abs(ball.vx) * s) / 700);
        if (ball.kind === "metal") sparkBurst(ball, 3);
      } else if (ball.x > lim.right) {
        ball.x = lim.right;
        ball.vx = -Math.abs(ball.vx) * wall;
        ball.squash = Math.min(1, (Math.abs(ball.vx) * s) / 700);
        if (ball.kind === "metal") sparkBurst(ball, 3);
      }
      if (ball.y < lim.top) {
        ball.y = lim.top;
        ball.vy = Math.abs(ball.vy) * wall;
      } else if (ball.y > lim.bottom) {
        ball.y = lim.bottom;
        ball.vy = -Math.abs(ball.vy) * wall;
      }
      if (ball.h < 0) {
        const impact = -ball.vh * s;
        ball.h = 0;
        ball.vh = -ball.vh * (ball.kind === "metal" ? 0.9 : 0.58);
        ball.squash = Math.min(1, impact / (ball.kind === "metal" ? 1300 : 520));
        if (impact > 180) {
          ballImpact(ball);
          sparkBurst(ball, ball.kind === "metal" ? 6 : 3);
        }
        if (ball.vh * s < 140) {
          ball.vh = 0;
          ball.kick = Math.min(ball.kick, 0.05);
        }
      }
      goldTouch(ball);
      if (!friends) continue;
      const host = balls[ball.mate];
      if (!host?.perch) continue;
      // the host is a ball riding on its crawler: treat it as a sphere resting on the floor under it
      const hx = host.x;
      const hy = host.y + host.r * 0.9;
      const hz = host.r;
      const dx = ball.x - hx;
      const dy = ball.y - hy;
      const dz = ball.h + ball.r - hz;
      const dist = Math.hypot(dx, dy, dz) || 1;
      const min = ball.r + host.r * 0.92;
      if (dist >= min) continue;
      const nx = dx / dist;
      const ny = dy / dist;
      const nz = dz / dist;
      ball.x = hx + nx * min;
      ball.y = hy + ny * min;
      ball.h = Math.max(0, hz + nz * min - ball.r);
      const rel = ball.vx * nx + ball.vy * ny + ball.vh * nz;
      if (rel < 0) {
        ball.vx -= rel * 1.45 * nx;
        ball.vy -= rel * 1.45 * ny;
        ball.vh -= rel * 1.45 * nz;
        ball.squash = 1;
        host.squash = 0.75;
        if (host.lidDir === 0) {
          host.lidDir = 1;
        }
        if (-rel * s > 180) ballImpact(ball);
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
      if (a.perch || a.flight > 0) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        if (b.perch || b.flight > 0 || a.page !== b.page) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.h + b.r - (a.h + a.r);
        const min = a.r + b.r;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= min * min || d2 < 0.01) continue;
        const dist = Math.sqrt(d2);
        const nx = dx / dist;
        const ny = dy / dist;
        const nz = dz / dist;
        const push = (min - dist) * 0.5;
        a.x -= nx * push;
        a.y -= ny * push;
        a.h = Math.max(0, a.h - nz * push);
        b.x += nx * push;
        b.y += ny * push;
        b.h = Math.max(0, b.h + nz * push);
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny + (a.vh - b.vh) * nz;
        if (rel >= 0) continue;
        const imp = rel * 0.9;
        a.vx -= imp * nx;
        a.vy -= imp * ny;
        a.vh -= imp * nz;
        b.vx += imp * nx;
        b.vy += imp * ny;
        b.vh += imp * nz;
        const hit = Math.min(1, (-rel * s) / 800);
        a.squash = hit;
        b.squash = hit;
        if (-rel * s > 200) ballImpact(a);
      }
    }
    recordBallTrails(dt);
  }

  function lendFeet() {
    const s = camScale();
    const loose = agents.length;
    for (let i = loose; i < balls.length; i++) {
      const ball = balls[i];
      const agent = agents[ball.mate];
      if (!agent || agent.flying) continue;
      const by = ball.y - ball.h - ball.r * 0.9;
      const dx = ball.x - agent.body.x;
      const dy = by - agent.body.y;
      if (Math.hypot(dx, dy) * s > 230) continue;
      const foot = agent.feet[i % 8];
      foot.x += (ball.x - foot.x) * 0.42;
      foot.y += (by - foot.y) * 0.42;
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
    spiders.length = 0;
    sparks.length = 0;
    releaseAgents();
    if (frozen) {
      const shot = overviewCam();
      cam.x = shot.x;
      cam.y = shot.y;
      cam.s = shot.s;
      mode = "finale";
      if (finished && !spiders.length) spawnSpiders();
      return;
    }
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
    if (party === "chaos") {
      endParty();
      return false;
    }
    party = "chaos";
    chaos = true;
    spiders.length = 0;
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
    if (party === "friends") {
      endParty();
      return false;
    }
    party = "friends";
    chaos = false;
    spiders.length = 0;
    ensureSwarm(true);
    releaseAgents();
    launchFriendBalls();
    setTravel(overviewCam());
    tween = 0;
    mode = "friends";
    opts.audio.play("bounce");
    return true;
  }

  function startSpiders() {
    if (party === "spiders") {
      endParty();
      return false;
    }
    buildWeb();
    if (!finished && mode !== "finale") webT = Math.max(webT, 9);
    party = "spiders";
    chaos = true;
    balls.length = 0;
    sparks.length = 0;
    ensureSwarm(true);
    releaseAgents();
    setTravel(overviewCam());
    tween = 0;
    mode = "spiders";
    spawnSpiders();
    opts.audio.play("gasp");
    opts.audio.play("skitter");
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
        buildWeb();
        webT = 0;
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

  type LegStyle = { color: string; lift: number; stretch: number; wob: number; width: number; dark: boolean };
  function drawLeg(ctx: CanvasRenderingContext2D, body: Pt, foot: Pt, scale: number, st: LegStyle) {
    const dx = foot.x - body.x;
    const dy = foot.y - body.y;
    const len = Math.hypot(dx, dy) || 1;
    const side = dx >= 0 ? 1 : -1;
    // two-bone knee: the joint rises off the page, higher when the foot is mid step
    const nx = (side * dy) / len;
    const ny = (-side * dx) / len;
    const slack = Math.max(0.12, 0.58 - 0.36 * st.stretch + 0.55 * st.lift);
    const kneeH = Math.min(170, len * 0.42 * Math.sqrt((1 + slack) ** 2 - 1)) * (1 + st.wob);
    const mx = body.x + dx * 0.5;
    const my = body.y + dy * 0.5;
    const kx = mx + nx * kneeH;
    const ky = my + ny * kneeH;
    const ax = kx + (foot.x - kx) * 0.74 - nx * kneeH * 0.14;
    const ay = ky + (foot.y - ky) * 0.74 - ny * kneeH * 0.14;
    ctx.beginPath();
    ctx.moveTo(body.x, body.y);
    ctx.lineTo(kx, ky);
    ctx.lineTo(ax, ay);
    ctx.lineTo(foot.x, foot.y);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    if (st.dark) {
      ctx.strokeStyle = "rgba(0,0,0,0.78)";
      ctx.lineWidth = (st.width * 2.05) / scale;
      ctx.stroke();
      ctx.strokeStyle = "#343a35";
      ctx.lineWidth = (st.width * 1.15) / scale;
      ctx.stroke();
      ctx.strokeStyle = hexA(st.color, 0.55);
      ctx.lineWidth = (st.width * 0.32) / scale;
      ctx.stroke();
      for (const [px, py, r] of [[kx, ky, 2.8], [ax, ay, 2.15], [foot.x, foot.y, 3.1 + st.lift * 1.1]] as const) {
        ctx.beginPath();
        ctx.arc(px, py, r / scale, 0, TAU);
        ctx.fillStyle = "#121713";
        ctx.fill();
        ctx.lineWidth = 1.35 / scale;
        ctx.strokeStyle = st.color;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(px, py, 0.8 / scale, 0, TAU);
        ctx.fillStyle = "#e8cf91";
        ctx.fill();
      }
      return;
    }
    ctx.strokeStyle = "rgba(0,0,0,0.72)";
    ctx.lineWidth = 5.2 / scale;
    ctx.stroke();
    ctx.strokeStyle = st.color;
    ctx.lineWidth = 1.85 / scale;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 0.45 / scale;
    ctx.stroke();
    for (const [px, py, r] of [
      [kx, ky, 2.8],
      [ax, ay, 2.1],
      [foot.x, foot.y, 3.2 + st.lift * 1.4],
    ] as const) {
      ctx.beginPath();
      ctx.arc(px, py, r / scale, 0, Math.PI * 2);
      ctx.fillStyle = "#07080c";
      ctx.fill();
      ctx.lineWidth = 1.15 / scale;
      ctx.strokeStyle = st.color;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(px, py, 0.85 / scale, 0, Math.PI * 2);
      ctx.fillStyle = st.color;
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

  function lidOpen(ball: Ball) {
    const t = ball.lid;
    const s = t * t * (3 - 2 * t);
    return 0.07 + 0.93 * (1 - s);
  }

  function drawEye(ctx: CanvasRenderingContext2D, ball: Ball, ex: number, ey: number, rx: number, ry: number) {
    const open = lidOpen(ball);
    ctx.save();
    ctx.translate(ex, ey);
    const ew = rx * 0.13;
    const eh = Math.max(ry * 0.32 * open, 0.72 / cam.s);
    ctx.beginPath();
    ctx.roundRect(-ew, -eh, ew * 2, eh * 2, Math.min(ew, eh) * 0.72);
    ctx.fillStyle = "#101412";
    ctx.fill();
    ctx.lineWidth = Math.max(0.45 / cam.s, ew * 0.1);
    ctx.strokeStyle = ball.color === 0 ? "rgba(238,239,220,0.62)" : "rgba(6,13,9,0.75)";
    ctx.stroke();
    ctx.restore();
  }

  const BALL_TONES: Record<BallKind, [string, string, string, string][]> = {
    metal: [
      ["#555b58", "#202522", "#090b0a", "#010202"],
      ["#ffffff", "#f1f2ec", "#c5ccc6", "#59635d"],
      ["#bce8c1", "#4a8d51", "#1d4c25", "#07180b"],
    ],
    rubber: [
      ["#424744", "#191d1a", "#080a08", "#010201"],
      ["#ffffff", "#fafbf6", "#e0e5de", "#a0aaa1"],
      ["#b5dcb6", "#407846", "#1a4221", "#061308"],
    ],
  };

  function drawBallShadow(ctx: CanvasRenderingContext2D, ball: Ball) {
    if (ball.perch) return;
    const R = ball.r * depthOf(ball);
    const lift = Math.min(1, Math.max(0, ball.h) / (ball.r * 9));
    const rx = R * (1.05 + 0.6 * lift);
    const ry = rx * 0.34;
    const a = 0.66 - 0.42 * lift;
    ctx.save();
    ctx.translate(ball.x + ball.h * 0.26, ball.y + R * 0.08);
    ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, `rgba(0,0,0,${a})`);
    g.addColorStop(0.5, `rgba(0,0,0,${a * 0.55})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, TAU);
    ctx.fill();
    if (lift < 0.4) {
      const core = ctx.createRadialGradient(0, 0, 0, 0, 0, rx * 0.5);
      core.addColorStop(0, `rgba(0,0,0,${0.55 * (1 - lift / 0.4)})`);
      core.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(0, 0, rx * 0.5, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBall(ctx: CanvasRenderingContext2D, ball: Ball, alpha: number) {
    const metal = ball.kind === "metal";
    const tone = BALL_TONES[ball.kind][ball.color];
    const ps = ball.perch ? 1 : depthOf(ball);
    const R = ball.r * ps;
    const squash = ball.squash * (metal ? 0.45 : 1);
    const rx = R * (1 + (metal ? 0.1 : 0.34) * squash);
    const ry = Math.max(R * 0.5, R * (1 - (metal ? 0.14 : 0.4) * squash));
    const cx = ball.x;
    const cy = ball.perch ? ball.y : ball.y - ball.h - ry * 0.92;
    ctx.save();
    ctx.globalAlpha = alpha;
    // sphere, lit from the upper left
    const body = ctx.createRadialGradient(cx - rx * 0.4, cy - ry * 0.48, R * 0.04, cx - rx * 0.1, cy - ry * 0.1, Math.max(rx, ry) * 1.12);
    body.addColorStop(0, tone[0]);
    body.addColorStop(0.2, tone[1]);
    body.addColorStop(0.62, tone[2]);
    body.addColorStop(1, tone[3]);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.save();
    ctx.clip();
    if (metal) {
      const env = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
      env.addColorStop(0, "rgba(255,255,255,0.5)");
      env.addColorStop(0.47, "rgba(255,255,255,0.05)");
      env.addColorStop(0.5, "rgba(255,255,255,0.7)");
      env.addColorStop(0.53, "rgba(0,0,0,0.38)");
      env.addColorStop(1, "rgba(0,0,0,0.05)");
      ctx.fillStyle = env;
      ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
    }
    // bounce light from the page underneath
    const under = ctx.createRadialGradient(cx + rx * 0.1, cy + ry * 1.05, 0, cx + rx * 0.1, cy + ry * 1.05, ry * 0.9);
    under.addColorStop(0, ball.color === 2 ? "rgba(73,180,86,0.24)" : "rgba(247,225,167,0.22)");
    under.addColorStop(1, "rgba(205,158,70,0)");
    ctx.fillStyle = under;
    ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
    ctx.restore();
    // soft warm rim keeps the orb readable without extra attachments
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.97, ry * 0.97, 0, Math.PI * 0.08, Math.PI * 0.72);
    ctx.lineWidth = Math.max(R * 0.06, 0.8 / cam.s);
    ctx.strokeStyle = metal ? "rgba(255,255,255,0.48)" : "rgba(227,255,232,0.3)";
    ctx.stroke();
    // specular
    ctx.beginPath();
    ctx.ellipse(cx - rx * 0.34, cy - ry * 0.42, rx * 0.26, ry * 0.15, -0.6, 0, TAU);
    ctx.fillStyle = metal ? "rgba(255,255,255,0.86)" : "rgba(255,255,255,0.26)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx - rx * 0.46, cy - ry * 0.58, R * 0.05, 0, TAU);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fill();
    // The paired eyes share one blink and one gaze vector.
    const look = Math.max(-1, Math.min(1, (ball.vx * cam.s) / 640)) * rx * 0.055;
    const eyeY = cy - ry * 0.06;
    drawEye(ctx, ball, cx - rx * 0.22 + look, eyeY, rx, ry);
    drawEye(ctx, ball, cx + rx * 0.22 + look, eyeY, rx, ry);
    ctx.restore();
  }

  function drawBalls(ctx: CanvasRenderingContext2D) {
    const loose = balls.filter((ball) => !ball.perch);
    loose.sort((p, q) => p.y - q.y);
    for (const ball of loose) drawBall(ctx, ball, 1);
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

  function drawBallTrails(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const ball of balls) {
      const points = ball.trail;
      if (points.length < 2) continue;
      ctx.shadowColor = ball.kind === "metal" ? "rgba(255,220,134,0.9)" : "rgba(222,171,70,0.76)";
      ctx.shadowBlur = 15 / camScale();
      for (let i = 2; i < points.length - 1; i++) {
        const age = i / (points.length - 1);
        ctx.globalAlpha = (1 - age) * 0.78;
        ctx.strokeStyle = i < 3 ? "#fff1bd" : ball.kind === "metal" ? "#e8b84e" : "#c58c28";
        ctx.lineWidth = (0.8 + (1 - age) * (ball.kind === "metal" ? 3.1 : 2.5)) / camScale();
        ctx.beginPath();
        ctx.moveTo(points[i + 1].x, points[i + 1].y);
        ctx.lineTo(points[i].x, points[i].y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ---------- spiders that walk the web ----------
  const spiderTargets: Pt[] = Array.from({ length: 8 }, () => ({ x: 0, y: 0 }));

  function footTargets(sp: Spider, R: number) {
    const ch = Math.cos(sp.heading);
    const sh = Math.sin(sp.heading);
    const fwd = [1.75, 0.65, -0.65, -1.75];
    const lat = [2.65, 3.05, 3.05, 2.65];
    for (let i = 0; i < 8; i++) {
      const k = i % 4;
      const side = i < 4 ? -1 : 1;
      const f = fwd[k] * R * 1.1;
      const l = lat[k] * R * side;
      spiderTargets[i].x = sp.x + ch * f - sh * l;
      spiderTargets[i].y = sp.y + sh * f + ch * l;
    }
    return spiderTargets;
  }

  function spawnSpiders() {
    spiders.length = 0;
    const wb = web;
    if (!wb || !wb.strands.length) return;
    const s = camScale();
    const count = Math.min(9, Math.max(5, pages.length + 2));
    for (let i = 0; i < count; i++) {
      let edge = 0;
      let u = 0.5;
      let far = -1;
      for (let tries = 0; tries < 14; tries++) {
        const e = Math.floor(Math.random() * wb.strands.length);
        strandPoint(wb, e, 0.5, webT, 0, tmpB);
        let nearest = Infinity;
        for (const other of spiders) nearest = Math.min(nearest, Math.hypot(other.x - tmpB.x, other.y - tmpB.y));
        if (nearest > far) {
          far = nearest;
          edge = e;
          u = Math.random();
        }
      }
      strandPoint(wb, edge, u, webT, 0, tmpA);
      const size = 23 + Math.random() * 8;
      const R = size / s;
      const sp: Spider = {
        edge,
        u,
        dir: Math.random() < 0.5 ? 1 : -1,
        speed: 120 + Math.random() * 110,
        pause: Math.random() * 0.8,
        size,
        accent: LEGS[i % LEGS.length],
        age: Math.random() * 5,
        x: tmpA.x,
        y: tmpA.y,
        heading: Math.random() * TAU,
        hop: 0,
        hopV: 0,
        hopWait: 1 + Math.random() * 3,
        body: { x: tmpA.x, y: tmpA.y },
        feet: [],
        stepU: Array.from({ length: 8 }, () => -1),
        stepFrom: Array.from({ length: 8 }, () => ({ x: tmpA.x, y: tmpA.y })),
        stepCool: Array.from({ length: 8 }, (_, k) => 0.025 * k),
      };
      sp.feet = footTargets(sp, R).map((pt) => ({ x: pt.x, y: pt.y }));
      spiders.push(sp);
    }
  }

  function nextEdge(sp: Spider, node: number) {
    const wb = web;
    if (!wb) return;
    const options = wb.adj[node].filter((idx) => idx !== sp.edge);
    let pick = sp.edge;
    let best = -Infinity;
    // wander, but drift toward the parts of the web nobody is standing on
    for (const idx of options) {
      const st = wb.strands[idx];
      const far = wb.nodes[st.a === node ? st.b : st.a];
      let crowd = Infinity;
      for (const other of spiders) {
        if (other === sp) continue;
        crowd = Math.min(crowd, Math.hypot(other.x - far.x, other.y - far.y));
      }
      const room = Math.min(1, crowd / Math.max(1, wb.radius * 0.35));
      const taste = st.kind === "tie" ? 0.15 : st.kind === "link" ? 0.5 : 0.35;
      const score = Math.random() * 0.75 + room * 0.9 + taste * Math.random();
      if (score > best) {
        best = score;
        pick = idx;
      }
    }
    sp.edge = pick;
    const strand = wb.strands[pick];
    if (strand.a === node) {
      sp.u = 0;
      sp.dir = 1;
    } else {
      sp.u = 1;
      sp.dir = -1;
    }
    if (Math.random() < 0.22) sp.pause = 0.25 + Math.random() * 0.8;
  }

  function stepSpiders(dt: number) {
    const wb = web;
    if (!wb) return;
    const s = camScale();
    const amp = webAmp();
    for (const sp of spiders) {
      sp.age += dt;
      const strand = wb.strands[sp.edge];
      if (sp.pause > 0) sp.pause -= dt;
      else {
        sp.u += (sp.dir * ((sp.speed / s) * dt)) / Math.max(40, strand.len);
        if (sp.u >= 1 || sp.u <= 0) {
          const node = sp.u >= 1 ? strand.b : strand.a;
          sp.u = Math.max(0, Math.min(1, sp.u));
          nextEdge(sp, node);
        }
      }
      strandPoint(wb, sp.edge, Math.max(0, Math.min(1, sp.u)), webT, amp, tmpA);
      const dx = tmpA.x - sp.x;
      const dy = tmpA.y - sp.y;
      if (Math.hypot(dx, dy) * s > 0.12) {
        const want = Math.atan2(dy, dx);
        let diff = want - sp.heading;
        while (diff > Math.PI) diff -= TAU;
        while (diff < -Math.PI) diff += TAU;
        sp.heading += diff * (1 - Math.exp(-dt * 9));
      }
      sp.x = tmpA.x;
      sp.y = tmpA.y;
      sp.body.x = sp.x;
      sp.body.y = sp.y;
      sp.hopWait -= dt;
      if (sp.hopWait <= 0 && sp.hop <= 0 && !opts.reduced) {
        sp.hopV = (360 + Math.random() * 220) / s;
        sp.hopWait = 2.4 + Math.random() * 3.6;
      }
      if (sp.hopV !== 0 || sp.hop > 0) {
        sp.hopV -= (1500 / s) * dt;
        sp.hop += sp.hopV * dt;
        if (sp.hop <= 0) {
          sp.hop = 0;
          sp.hopV = 0;
        }
      }
      const R = sp.size / s;
      stepFeet(sp, footTargets(sp, R), dt, R * 1.15, R * 7);
    }
  }

  function drawSpiderShadow(ctx: CanvasRenderingContext2D, sp: Spider) {
    const s = camScale();
    const R = sp.size / s;
    const lift = Math.min(1, sp.hop / (R * 5));
    const ox = R * 0.55 + sp.hop * 0.28;
    const oy = R * 0.5;
    ctx.save();
    ctx.globalAlpha = 0.34 - 0.16 * lift;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = (R * 0.2) * 1;
    for (let i = 0; i < 8; i++) {
      const foot = sp.feet[i];
      ctx.beginPath();
      ctx.moveTo(sp.x + ox, sp.y + oy);
      ctx.lineTo(foot.x + ox * 0.7, foot.y + oy * 0.7);
      ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    ctx.translate(sp.x + ox, sp.y + oy);
    ctx.rotate(sp.heading);
    ctx.scale(1, 0.62);
    const rx = R * (2.3 + 0.5 * lift);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, `rgba(0,0,0,${0.55 - 0.3 * lift})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawSpider(ctx: CanvasRenderingContext2D, sp: Spider) {
    const s = camScale();
    const R = sp.size / s;
    const ch = Math.cos(sp.heading);
    const sh = Math.sin(sp.heading);
    const bob = opts.reduced ? 0 : Math.sin(sp.age * 9) * R * 0.05;
    const raise = R * 0.78 + sp.hop + bob;
    const hub = { x: sp.x, y: sp.y - raise };
    for (let i = 0; i < 8; i++) {
      const foot = sp.feet[i];
      const lift = sp.stepU[i] >= 0 ? Math.sin(Math.PI * Math.min(1, sp.stepU[i])) : 0;
      const side = i < 4 ? -1 : 1;
      const along = [1.42, 0.48, -0.48, -1.42][i % 4];
      const across = side * (0.72 + (i % 4 === 1 || i % 4 === 2 ? 0.12 : 0));
      const hip = {
        x: hub.x + ch * R * along - sh * R * across,
        y: hub.y + sh * R * along + ch * R * across,
      };
      drawLeg(ctx, hip, { x: foot.x, y: foot.y - lift * R * 0.7 }, cam.s, { color: sp.accent, lift, stretch: 0, wob: 0, width: Math.max(2.2, sp.size * 0.21), dark: true });
    }
    ctx.save();
    ctx.translate(hub.x, hub.y);
    ctx.rotate(sp.heading);
    const shell = ctx.createLinearGradient(-R * 1.8, -R, R * 1.8, R);
    shell.addColorStop(0, "#5a615d");
    shell.addColorStop(0.28, "#252b27");
    shell.addColorStop(0.74, "#141916");
    shell.addColorStop(1, "#050806");
    ctx.beginPath();
    ctx.roundRect(-R * 1.9, -R * 0.9, R * 3.8, R * 1.8, R * 0.48);
    ctx.fillStyle = shell;
    ctx.fill();
    ctx.lineWidth = 1.2 / cam.s;
    ctx.strokeStyle = "rgba(226,190,116,0.72)";
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(R * 0.48, -R * 0.68, R * 1.32, R * 1.36, R * 0.42);
    ctx.fillStyle = "#313a34";
    ctx.fill();
    ctx.lineWidth = 0.75 / cam.s;
    ctx.strokeStyle = "rgba(255,255,255,0.24)";
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-R * 1.15, 0);
    ctx.lineTo(R * 0.3, 0);
    ctx.strokeStyle = "rgba(224,184,98,0.48)";
    ctx.lineWidth = 1.1 / cam.s;
    ctx.stroke();
    for (const ey of [-0.25, 0.25]) {
      ctx.beginPath();
      ctx.ellipse(R * 1.48, R * ey, R * 0.1, R * 0.22, 0.08, 0, TAU);
      ctx.fillStyle = "#f6f1de";
      ctx.fill();
    }
    ctx.restore();
  }

  function drawWeb(ctx: CanvasRenderingContext2D) {
    const wb = web;
    if (!wb) return;
    const t = webT;
    const amp = webAmp();
    const sc = cam.s;
    const A = { x: 0, y: 0 };
    const B = { x: 0, y: 0 };
    const C = { x: 0, y: 0 };
    const P = { x: 0, y: 0 };
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // Draw only the perimeter loops: no spokes, center weave, or page-to-page links.
    for (const st of wb.strands) {
      if (st.kind !== "ring") continue;
      const p = Math.max(0, Math.min(1, (t - st.delay) / st.dur));
      if (p <= 0) continue;
      sway(wb.nodes[st.a], t, amp, A);
      sway(wb.nodes[st.b], t, amp, B);
      sway(st.c, t, amp, C);
      const n = Math.max(2, Math.ceil(st.samples * p));
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      for (let k = 1; k <= n; k++) {
        quadAt(A, C, B, (p * k) / n, P);
        ctx.lineTo(P.x, P.y);
      }
      const color = THREAD_INK[st.ink % THREAD_INK.length];
      ctx.globalAlpha = p < 1 ? 0.35 + p * 0.5 : 0.85;
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = 2.2 / sc;
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2 / sc;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawEvidenceThreads(ctx: CanvasRenderingContext2D) {
    if (pages.length < 2) return;
    const progress = Math.max(0, Math.min(1, (showT - (showFor - 20)) / 20));
    if (progress <= 0) return;
    const count = Math.min(pages.length - 1, 9);
    const sc = Math.max(0.25, cam.s);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 0; i < count; i++) {
      const reveal = Math.max(0, Math.min(1, progress * count - i));
      if (reveal <= 0) continue;
      const from = pages[i];
      const to = pages[i + 1];
      const ax = from.x + from.w * (0.28 + ((i * 17) % 48) / 100);
      const ay = from.y + from.h * (0.2 + ((i * 23) % 60) / 100);
      const bx = to.x + to.w * (0.25 + ((i * 31) % 52) / 100);
      const by = to.y + to.h * (0.18 + ((i * 19) % 64) / 100);
      const bend = Math.sin(i * 4.7 + 0.6) * Math.hypot(bx - ax, by - ay) * 0.13;
      const mx = (ax + bx) * 0.5 + bend * (by - ay) / Math.max(1, Math.hypot(bx - ax, by - ay));
      const my = (ay + by) * 0.5 - bend * (bx - ax) / Math.max(1, Math.hypot(bx - ax, by - ay));
      const ex = ax + (bx - ax) * reveal;
      const ey = ay + (by - ay) * reveal;
      const cx = ax + (mx - ax) * reveal;
      const cy = ay + (my - ay) * reveal;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(cx, cy, ex, ey);
      ctx.strokeStyle = "rgba(42, 5, 8, 0.65)";
      ctx.lineWidth = 3.1 / sc;
      ctx.stroke();
      ctx.strokeStyle = "rgba(197, 35, 43, 0.9)";
      ctx.lineWidth = 1.15 / sc;
      ctx.stroke();
      if (reveal >= 1) {
        for (const [x, y] of [[ax, ay], [bx, by]]) {
          ctx.beginPath();
          ctx.arc(x, y, 3.3 / sc, 0, TAU);
          ctx.fillStyle = "#a91e27";
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x, y, 1.1 / sc, 0, TAU);
          ctx.fillStyle = "#f2c7a1";
          ctx.fill();
        }
      }
    }
    ctx.restore();
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
    for (const [index, page] of pages.entries()) {
      if (surface !== "void") {
        ctx.fillStyle = "rgba(0,0,0,0.38)";
        ctx.fillRect(page.x + 18, page.y + 22, page.w, page.h);
      }
      const paperX = (index % 3 - 1) * 2.4;
      const paperY = ((index * 2) % 3 - 1) * 2.2;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.62)";
      ctx.shadowBlur = 20 / cam.s;
      ctx.shadowOffsetX = 8 / cam.s;
      ctx.shadowOffsetY = 10 / cam.s;
      ctx.fillStyle = index % 2 ? "#d8cfb9" : "#e4dbc5";
      ctx.fillRect(page.x - 7 / cam.s + paperX / cam.s, page.y - 7 / cam.s + paperY / cam.s, page.w + 14 / cam.s, page.h + 14 / cam.s);
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = "rgba(67,52,33,0.58)";
      ctx.lineWidth = 1 / cam.s;
      ctx.strokeRect(page.x - 7 / cam.s + paperX / cam.s, page.y - 7 / cam.s + paperY / cam.s, page.w + 14 / cam.s, page.h + 14 / cam.s);
      ctx.drawImage(page.image, page.x, page.y, page.w, page.h);
      ctx.restore();
      const wide = mode !== "read";
      ctx.strokeStyle = wide ? "rgba(190,116,63,0.62)" : "rgba(222,194,153,0.3)";
      ctx.lineWidth = (wide ? 2.2 : 1.2) / cam.s;
      ctx.strokeRect(page.x, page.y, page.w, page.h);
    }
    drawEvidenceThreads(ctx);
    if (glints.length) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.shadowColor = "rgba(250,190,72,0.8)";
      ctx.shadowBlur = 13 / camScale();
      for (const glow of glints) {
        ctx.globalAlpha = Math.min(0.58, glow.life * 0.72);
        const height = Math.max(10, glow.h);
        const sheen = ctx.createLinearGradient(0, glow.y, 0, glow.y + height);
        sheen.addColorStop(0, "rgba(255,221,142,0.08)");
        sheen.addColorStop(0.48, "rgba(241,180,61,0.72)");
        sheen.addColorStop(1, "rgba(255,207,93,0.12)");
        ctx.fillStyle = sheen;
        ctx.fillRect(glow.x, glow.y, glow.w, height);
        ctx.beginPath();
        ctx.moveTo(glow.x, glow.y + height * 0.54);
        ctx.lineTo(glow.x + glow.w, glow.y + height * 0.54);
        ctx.strokeStyle = "rgba(255,223,155,0.9)";
        ctx.lineWidth = 1.1 / camScale();
        ctx.stroke();
      }
      ctx.restore();
    }
    for (const ball of balls) drawBallShadow(ctx, ball);
    for (const sp of spiders) drawSpiderShadow(ctx, sp);
    if (web && (finished || party === "spiders") && (mode === "finale" || mode === "chaos" || mode === "friends" || mode === "spiders")) drawWeb(ctx);
    agents.forEach((agent, ai) => {
      const page = pages[agent.page];
      if (!page || party === "spiders") return;
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
        const wobble = opts.reduced ? 0 : Math.sin(agent.age * 7.5 + i * 1.15) * 0.07;
        const lift = !opts.reduced && !agent.flying && !page.barren && agent.stepU[i] >= 0 ? Math.sin(Math.PI * Math.min(1, agent.stepU[i])) : 0;
        const color = i < 2 && pose ? pose.color : LEGS[i];
        const side = i < 4 ? -1 : 1;
        const anchor = {
          x: body.x + (((i % 4) - 1.5) * 7.2) / cam.s,
          y: body.y + (side * 6.6) / cam.s,
        };
        ctx.globalAlpha = fade;
        drawLeg(ctx, anchor, { x: placed.x, y: placed.y - (lift * 7) / cam.s }, cam.s, { color, lift, stretch, wob: wobble, width: 1.35, dark: false });
        ctx.globalAlpha = 1;
      }
      const perch = party === "friends" ? balls[ai] : undefined;
      if (perch?.perch) {
        perch.x = body.x;
        perch.y = body.y + Math.sin(agent.age * 6.2) * (2.2 / camScale());
        drawBall(ctx, perch, fade);
      } else {
        const hub = "#d8b05c";
        const grow = 1 + 0.35 * stretch;
        const bw = (17 / cam.s) * grow;
        const bh = (10 / cam.s) * grow;
        ctx.globalAlpha = fade;
        ctx.shadowColor = "rgba(222,176,83,0.32)";
        ctx.shadowBlur = 7 / cam.s;
        ctx.beginPath();
        ctx.roundRect(body.x - bw, body.y - bh, bw * 2, bh * 2, 4 / cam.s);
        ctx.fillStyle = "#111719";
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.lineWidth = 1.8 / cam.s;
        ctx.strokeStyle = "rgba(0,0,0,0.82)";
        ctx.stroke();
        ctx.beginPath();
        ctx.roundRect(body.x - bw + 1 / cam.s, body.y - bh + 1 / cam.s, bw * 2 - 2 / cam.s, bh * 2 - 2 / cam.s, 3 / cam.s);
        ctx.lineWidth = 1.15 / cam.s;
        ctx.strokeStyle = hexA(hub, 0.86);
        ctx.stroke();
        ctx.fillStyle = hexA(hub, 0.9);
        ctx.fillRect(body.x - 2 / cam.s, body.y - 1 / cam.s, 4 / cam.s, 2 / cam.s);
        ctx.globalAlpha = 1;
      }
    });
    drawBallTrails(ctx);
    drawBalls(ctx);
    for (const sp of spiders) drawSpider(ctx, sp);
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
      buildWeb();
      ensureSwarm(true);
      webT = Math.max(webT, 9);
      if (party === "off") spawnSpiders();
    }
    webT = Math.max(webT, 9);
    glints.length = 0;
    if (party === "off") {
      balls.length = 0;
      sparks.length = 0;
      chaos = false;
      const shot = overviewCam();
      cam.x = shot.x;
      cam.y = shot.y;
      cam.s = shot.s;
      mode = "finale";
    }
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
    if (!paused && viewW > 2) webT += dt;
    if (!paused && viewW > 2 && !frozen) {
      showT += dt;
      spinT += dt;
      for (let i = glints.length - 1; i >= 0; i--) {
        glints[i].life -= dt;
        if (glints[i].life <= 0) glints.splice(i, 1);
      }
      if (showT >= showFor) settleFinale();
    }
    if (!paused && viewW > 2 && (!frozen || party !== "off" || spiders.length > 0)) {
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
      } else if (mode === "spiders") {
        tween += dt;
        const dur = fast ? 0.32 : 0.8;
        if (tween <= dur) tweenCam(dur);
        stepSpiders(dt);
        skitter(dt * 0.4);
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
        if (spiders.length) stepSpiders(dt);
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
    spiders() {
      return startSpiders();
    },
  };
}
