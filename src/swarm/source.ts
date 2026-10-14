export type GithubRef = { owner: string; repo: string; start?: string };

const TEXT_EXT = new Set([
  "md",
  "txt",
  "html",
  "htm",
  "css",
  "scss",
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "json",
  "py",
  "rs",
  "go",
  "java",
  "cs",
  "vue",
  "svelte",
  "yml",
  "yaml",
  "toml",
  "sql",
  "sh",
]);

export function parseGithub(input: string): GithubRef | null {
  const trimmed = input.trim().replace(/\.git\/?$/, "");
  if (!trimmed) return null;
  const raw = trimmed.match(/raw\.githubusercontent\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/[^/]+\/(.+)$/i);
  if (raw) return { owner: raw[1], repo: raw[2], start: decodeURIComponent((raw[3] ?? "").split("?")[0] ?? "") };
  const blob = trimmed.match(/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/(?:blob|tree)\/[^/]+\/(.+)$/i);
  if (blob) {
    return { owner: blob[1], repo: blob[2], start: decodeURIComponent((blob[3] ?? "").split("?")[0] ?? "") };
  }
  const web = trimmed.match(/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/i);
  if (web) return { owner: web[1], repo: web[2] };
  const short = trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (short) return { owner: short[1], repo: short[2] };
  return null;
}

export function isTextPath(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return TEXT_EXT.has(ext);
}

function banned(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.includes("node_modules/") ||
    lower.startsWith("dist/") ||
    lower.includes("/dist/") ||
    lower.startsWith(".git/") ||
    lower.includes("package-lock") ||
    lower.includes("pnpm-lock") ||
    lower.includes("yarn.lock")
  );
}

/** Higher is earlier. The named start file always wins. */
export function rankPath(path: string, startHint: string): number {
  if (banned(path) || !isTextPath(path)) return -1;
  const base = path.split("/").pop() ?? path;
  const lower = path.toLowerCase();
  const hint = startHint.trim().toLowerCase();
  let score = Math.max(0, 12 - path.split("/").length);
  if (hint && (base.toLowerCase() === hint || lower.endsWith(`/${hint}`) || lower === hint || lower.endsWith(hint))) score += 1000;
  if (/^readme(\.|$)/i.test(base)) score += hint ? 160 : 800;
  if (/^index\.(html|tsx|jsx|vue|svelte|md|js|ts)$/i.test(base)) score += hint ? 80 : 420;
  if (lower.startsWith("src/")) score += 30;
  return score;
}

export function orderPaths(paths: string[], startHint: string, limit: number): { paths: string[]; missedStart: boolean } {
  const ranked = paths
    .map((path) => ({ path, score: rankPath(path, startHint) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score || a.path.length - b.path.length);
  const hint = startHint.trim().toLowerCase();
  const missedStart = Boolean(hint) && !ranked.some((item) => item.score >= 1000);
  return { paths: ranked.slice(0, limit).map((item) => item.path), missedStart };
}
