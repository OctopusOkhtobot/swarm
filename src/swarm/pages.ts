import type { DocLine } from "./crawl";
import { loadImage } from "./crawl";
import { isTextPath, orderPaths, parseGithub } from "./source";

export type GatheredPage = { url: string; name: string; lines: DocLine[] };

export type PageFail = "bad" | "missing" | "rate" | "empty";

export class PageError extends Error {
  code: PageFail;
  constructor(code: PageFail) {
    super(code);
    this.code = code;
  }
}

type TreeItem = { path?: string; type?: string; size?: number };

const MAX_LINES = 86;

function topicHit(text: string, topic: string): boolean {
  const needle = topic.trim().toLowerCase();
  if (needle.length < 2) return false;
  const hay = text.toLowerCase();
  return needle.split(/\s+/).some((part) => part.length >= 2 && hay.includes(part));
}

async function paintDoc(name: string, text: string, topic: string): Promise<GatheredPage> {
  await document.fonts.ready;
  const raw = text.replace(/\r\n/g, "\n").replace(/\u0000/g, "").split("\n").slice(0, MAX_LINES);
  const rows = raw.length ? raw : [""];
  const width = 1080;
  const lineH = 26;
  const head = 118;
  const height = Math.max(960, head + rows.length * lineH + 72);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new PageError("empty");
  ctx.fillStyle = "#0c0e12";
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = "top";
  ctx.fillStyle = "#5ce1ff";
  ctx.font = "500 15px 'IBM Plex Sans', 'DejaVu Sans', sans-serif";
  ctx.fillText(name, 72, 46);
  ctx.fillStyle = "#243041";
  ctx.fillRect(72, 84, width - 144, 1);
  const lines: DocLine[] = [];
  rows.forEach((row, index) => {
    const y = head + index * lineH;
    const hit = topicHit(row, topic);
    if (hit) {
      ctx.fillStyle = "rgba(92,225,255,0.14)";
      ctx.fillRect(56, y - 4, width - 112, lineH);
      ctx.fillStyle = "#5ce1ff";
      ctx.fillRect(48, y - 2, 3, lineH - 6);
    }
    ctx.font = "400 16px 'IBM Plex Mono', 'DejaVu Sans Mono', ui-monospace, monospace";
    ctx.fillStyle = hit ? "#f4f4f5" : "#d4d4d8";
    ctx.fillText(row.slice(0, 96), 72, y);
    lines.push({
      text: row,
      y: (y - 2) / height,
      h: (lineH - 4) / height,
      x0: 72 / width,
      x1: (width - 72) / width,
    });
  });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
  if (!blob) throw new PageError("empty");
  return { url: URL.createObjectURL(blob), name, lines };
}

async function readFile(file: File, topic: string): Promise<GatheredPage | null> {
  if (file.type.startsWith("image/")) {
    return { url: URL.createObjectURL(file), name: file.name, lines: [] };
  }
  if (file.type && !file.type.startsWith("text") && !isTextPath(file.name) && file.type !== "application/json") return null;
  const text = await file.text();
  if (text.includes("\u0000")) return null;
  return paintDoc(file.name, text.slice(0, 14000), topic);
}

async function githubPages(input: string, startAt: string, topic: string, limit: number): Promise<{ pages: GatheredPage[]; missedStart: boolean }> {
  const ref = parseGithub(input);
  if (!ref) throw new PageError("bad");
  const headers = { Accept: "application/vnd.github+json" };
  const metaRes = await fetch(`https://api.github.com/repos/${ref.owner}/${ref.repo}`, { headers, credentials: "omit" });
  if (metaRes.status === 403 || metaRes.status === 429) throw new PageError("rate");
  if (!metaRes.ok) throw new PageError("missing");
  const meta = (await metaRes.json()) as { default_branch?: string };
  const branch = meta.default_branch || "main";
  const treeRes = await fetch(
    `https://api.github.com/repos/${ref.owner}/${ref.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    { headers, credentials: "omit" },
  );
  if (treeRes.status === 403 || treeRes.status === 429) throw new PageError("rate");
  if (!treeRes.ok) throw new PageError("missing");
  const tree = (await treeRes.json()) as { tree?: TreeItem[] };
  const paths = (tree.tree ?? [])
    .filter((item) => item.type === "blob" && item.path && (item.size ?? 0) < 120_000)
    .map((item) => item.path as string);
  const hint = startAt.trim() || ref.start || "";
  const ordered = orderPaths(paths, hint, limit);
  if (!ordered.paths.length) throw new PageError("empty");
  const pages: GatheredPage[] = [];
  for (const path of ordered.paths) {
    const raw = await fetch(`https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${branch}/${path.split("/").map(encodeURIComponent).join("/")}`, {
      credentials: "omit",
    });
    if (!raw.ok) continue;
    const text = (await raw.text()).slice(0, 14000);
    if (text.includes("\u0000")) continue;
    pages.push(await paintDoc(path, text, topic));
  }
  if (pages.length < 2) throw new PageError("empty");
  return { pages, missedStart: ordered.missedStart };
}

async function openLoose(input: string, topic: string): Promise<GatheredPage> {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new PageError("bad");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new PageError("bad");
  const name = decodeURIComponent(url.pathname.split("/").pop() || url.hostname);
  if (/\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(url.pathname)) {
    try {
      await loadImage(url.href);
      return { url: url.href, name, lines: [] };
    } catch {
      throw new PageError("bad");
    }
  }
  try {
    const res = await fetch(url.href, { credentials: "omit" });
    if (!res.ok) throw new PageError("bad");
    const type = res.headers.get("content-type") ?? "";
    if (type.startsWith("image/")) {
      const blob = await res.blob();
      return { url: URL.createObjectURL(blob), name, lines: [] };
    }
    const text = (await res.text()).slice(0, 14000);
    const head = text.trimStart().slice(0, 20).toLowerCase();
    if (!text.trim() || text.includes("\u0000") || head.startsWith("<!doctype") || head.startsWith("<html")) throw new PageError("bad");
    return paintDoc(name, text, topic);
  } catch (error) {
    if (error instanceof PageError) throw error;
    throw new PageError("bad");
  }
}

export async function collectPages(opts: {
  github: string;
  startAt: string;
  topic: string;
  files: File[];
  limit: number;
}): Promise<{ pages: GatheredPage[]; missedStart: boolean }> {
  const limit = Math.max(2, Math.min(12, Math.round(opts.limit) || 7));
  const locals: GatheredPage[] = [];
  for (const file of opts.files) {
    const page = await readFile(file, opts.topic);
    if (page) locals.push(page);
  }
  if (!opts.github.trim()) {
    if (locals.length < 2) throw new PageError("empty");
    return { pages: locals.slice(0, limit), missedStart: false };
  }
  const remote = parseGithub(opts.github)
    ? await githubPages(opts.github, opts.startAt, opts.topic, limit)
    : { pages: [await openLoose(opts.github, opts.topic)], missedStart: false };
  const pages = [...remote.pages, ...locals].slice(0, limit);
  if (pages.length < 2) throw new PageError("empty");
  return { pages, missedStart: remote.missedStart };
}
