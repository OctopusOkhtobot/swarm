const W = 1080;
const H = 1920;

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(next).width > max && cur) {
      lines.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

type Row = { text: string; kind: "h" | "p" | "link" | "mono" | "muted" | "code" };

function paintRows(ctx: CanvasRenderingContext2D, kicker: string, title: string, rows: Row[], mono = false) {
  ctx.fillStyle = "#0c0e12";
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "top";
  ctx.fillStyle = "#5ce1ff";
  ctx.font = "500 15px 'IBM Plex Sans', 'DejaVu Sans', sans-serif";
  ctx.fillText(kicker, 72, 48);
  ctx.fillStyle = "#f4f4f5";
  ctx.font = "600 32px Newsreader, 'DejaVu Serif', serif";
  ctx.fillText(title, 72, 78);
  ctx.fillStyle = "#243041";
  ctx.fillRect(72, 146, W - 144, 1);
  let y = 176;
  const max = W - 144;
  for (const row of rows) {
    if (y > H - 64) break;
    if (row.kind === "h") {
      y += 18;
      ctx.font = "600 20px Newsreader, 'DejaVu Serif', serif";
      ctx.fillStyle = "#f5f5f4";
      ctx.fillText(row.text, 72, y);
      y += 32;
      continue;
    }
    if (row.kind === "link") {
      ctx.font = "400 15px 'IBM Plex Sans', 'DejaVu Sans', sans-serif";
      ctx.fillStyle = "#8cbcff";
      for (const line of wrap(ctx, row.text, max)) {
        ctx.fillText(line, 72, y);
        y += 24;
      }
      continue;
    }
    if (row.kind === "muted") {
      ctx.font = "400 13px 'IBM Plex Sans', 'DejaVu Sans', sans-serif";
      ctx.fillStyle = "#8b919c";
      for (const line of wrap(ctx, row.text, max)) {
        ctx.fillText(line, 72, y);
        y += 22;
      }
      continue;
    }
    if (row.kind === "code" || row.kind === "mono" || mono) {
      ctx.font = "400 14px 'IBM Plex Mono', 'DejaVu Sans Mono', ui-monospace, monospace";
      ctx.fillStyle = "#e7e7ea";
      ctx.fillText(row.text, 72, y);
      y += 22;
      continue;
    }
    ctx.font = "400 15px 'IBM Plex Sans', 'DejaVu Sans', sans-serif";
    ctx.fillStyle = "#d4d4d8";
    for (const line of wrap(ctx, row.text, max)) {
      if (y > H - 64) break;
      ctx.fillText(line, 72, y);
      y += 24;
    }
  }
}

function blobUrl(paint: (ctx: CanvasRenderingContext2D) => void): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("canvas"));
  paint(ctx);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(URL.createObjectURL(blob ?? new Blob())), "image/png");
  });
}

export async function makeDemo(): Promise<string[]> {
  if (document.fonts?.ready) await Promise.race([document.fonts.ready, wait(900)]);
  return Promise.all([
    blobUrl((ctx) =>
      paintRows(ctx, "ARTICLE", "Web crawler", [
        { kind: "p", text: "A crawler starts at one public page. It reads the lines that are already there, keeps a hand on each word it touches, and follows the next address when the page runs out." },
        { kind: "h", text: "What it touches" },
        { kind: "p", text: "Nothing in this pass is private. The creature only walks text the picture already shows: titles, sentences, links, and the small print under them." },
        { kind: "link", text: "Behaviour of a single agent" },
        { kind: "p", text: "The body stays near the line being read. Two front legs hold the caret. The others reach up and down the paragraph and pinch nearby words, then let go." },
        { kind: "h", text: "References" },
        { kind: "muted", text: "1. Brin, S.; Page, L. (1998). The anatomy of a large-scale hypertextual Web search engine. Computer Networks. 30: 107–117." },
        { kind: "muted", text: "2. Olston, C.; Najork, M. (2010). Web crawling. Foundations and Trends in Information Retrieval. 4 (3): 175–246." },
        { kind: "link", text: "Field notes on polite fetching" },
        { kind: "p", text: "A polite agent waits its turn, names itself, and does not hammer a host. The drawing is the same idea at the speed of a glance: one line, then the next, then another page." },
        { kind: "h", text: "See also" },
        { kind: "link", text: "Search engine indexing" },
        { kind: "link", text: "robots.txt" },
        { kind: "link", text: "Focused crawler" },
        { kind: "p", text: "When the main page ends, the swarm does not stretch one body across every branch. A new crawler is born on the next picture, and the camera travels there to watch it work." },
        { kind: "h", text: "Further reading" },
        { kind: "muted", text: "Cho, J.; Garcia-Molina, H. (2002). Parallel crawlers. Proceedings of the 11th international conference on World Wide Web." },
        { kind: "muted", text: "Heydon, A.; Najork, M. (1999). Mercator: A scalable, extensible web crawler. World Wide Web. 2 (4): 219–229." },
        { kind: "p", text: "The red and cyan rectangles are not part of the page. They are the agent's grip: a selection that grows along the line, then jumps when the line is finished." },
        { kind: "link", text: "Category: Web crawlers" },
      ]),
    ),
    blobUrl((ctx) =>
      paintRows(
        ctx,
        "SOURCE",
        "crawler.ts",
        [
          { kind: "code", text: "type Grip = { line: number; word: number };" },
          { kind: "code", text: "" },
          { kind: "code", text: "export function read(page: string[]): Grip[] {" },
          { kind: "code", text: "  const hits: Grip[] = [];" },
          { kind: "code", text: "  for (let line = 0; line < page.length; line++) {" },
          { kind: "code", text: "    const words = page[line].split(/\\s+/);" },
          { kind: "code", text: "    for (let word = 0; word < words.length; word++) {" },
          { kind: "code", text: "      if (!words[word]) continue;" },
          { kind: "code", text: "      hits.push({ line, word });" },
          { kind: "code", text: "    }" },
          { kind: "code", text: "  }" },
          { kind: "code", text: "  return hits;" },
          { kind: "code", text: "}" },
          { kind: "code", text: "" },
          { kind: "code", text: "export function branch(seed: string) {" },
          { kind: "code", text: "  return [" },
          { kind: "code", text: "    seed + \"/notes\"," },
          { kind: "code", text: "    seed + \"/source\"," },
          { kind: "code", text: "    seed + \"/links\"," },
          { kind: "code", text: "  ];" },
          { kind: "code", text: "}" },
          { kind: "code", text: "" },
          { kind: "code", text: "function step(grip: Grip, page: string[]) {" },
          { kind: "code", text: "  const words = page[grip.line]?.split(/\\s+/) ?? [];" },
          { kind: "code", text: "  if (grip.word + 1 < words.length) {" },
          { kind: "code", text: "    return { line: grip.line, word: grip.word + 1 };" },
          { kind: "code", text: "  }" },
          { kind: "code", text: "  return { line: Math.min(page.length - 1, grip.line + 1), word: 0 };" },
          { kind: "code", text: "}" },
          { kind: "code", text: "" },
          { kind: "muted", text: "// one agent, one page. a branch is a new agent." },
          { kind: "code", text: "export function swarm(root: string, pages: string[][]) {" },
          { kind: "code", text: "  const grips = pages.map(() => ({ line: 0, word: 0 }));" },
          { kind: "code", text: "  return { root, grips };" },
          { kind: "code", text: "}" },
        ],
        true,
      ),
    ),
    blobUrl((ctx) =>
      paintRows(ctx, "LOG", "fetch.log", [
        { kind: "mono", text: "00:00.12  GET  /            200   18kb   agent-0" },
        { kind: "mono", text: "00:00.40  READ line 1       caret  Behaviour" },
        { kind: "mono", text: "00:00.62  READ line 4       words  11" },
        { kind: "mono", text: "00:01.10  LINK external     queued 1" },
        { kind: "mono", text: "00:01.44  READ line 9       isbn   held" },
        { kind: "mono", text: "00:02.02  PAGE end          spawn  agent-1" },
        { kind: "mono", text: "00:02.20  GET  /source      200   9kb    agent-1" },
        { kind: "mono", text: "00:02.55  READ line 2       token  export" },
        { kind: "mono", text: "00:03.10  READ line 8       token  return" },
        { kind: "mono", text: "00:03.40  PAGE end          spawn  agent-2" },
        { kind: "mono", text: "00:03.58  GET  /log         200   6kb    agent-2" },
        { kind: "mono", text: "00:04.02  READ line 6       host   public" },
        { kind: "mono", text: "00:04.40  PAGE end          spawn  agent-3" },
        { kind: "mono", text: "00:04.60  GET  /links       200   7kb    agent-3" },
        { kind: "muted", text: "no errors. four pictures, four grips. nothing left the browser." },
        { kind: "mono", text: "00:05.10  READ line 3       href   notes" },
        { kind: "mono", text: "00:05.44  READ line 7       href   source" },
        { kind: "mono", text: "00:06.02  IDLE loop         agent-3 still on the last page" },
      ]),
    ),
    blobUrl((ctx) =>
      paintRows(ctx, "LINKS", "Branches", [
        { kind: "p", text: "The main picture is the seed. Each branch below is a page the first agent pointed at. Open one and another crawler is already there." },
        { kind: "h", text: "From the seed" },
        { kind: "link", text: "notes — how a line selection grows" },
        { kind: "link", text: "source — the small reader that walks words" },
        { kind: "link", text: "log — the timestamps of one pass" },
        { kind: "h", text: "Public only" },
        { kind: "p", text: "These addresses are examples painted into the picture. The live app does not fetch the network. It reads the pixels you gave it." },
        { kind: "muted", text: "seed.example/article" },
        { kind: "muted", text: "seed.example/article/source" },
        { kind: "muted", text: "seed.example/article/log" },
        { kind: "muted", text: "seed.example/article/links" },
        { kind: "h", text: "What the grip means" },
        { kind: "p", text: "A rectangle is a word the leg is holding. The bright bar is the line in progress. When the bar reaches the end, the caret drops to the next line." },
        { kind: "link", text: "Back to the main picture" },
      ]),
    ),
    blobUrl((ctx) =>
      paintRows(ctx, "NOTES", "Line pulse", [
        { kind: "p", text: "The word under the tip grows, then settles. The rest of the line breathes with it. Nothing else on the page moves." },
        { kind: "h", text: "A smaller type" },
        { kind: "p", text: "These notes are set tighter so the crawler has more lines to walk and the picture reads like a page, not a poster." },
        { kind: "link", text: "See the grip on a single token" },
        { kind: "muted", text: "scale 1.00 to 1.20 and back, once per touch" },
        { kind: "p", text: "When the page ends the camera pulls away until several sheets are in frame, then dives into one chosen at random." },
      ]),
    ),
    blobUrl((ctx) =>
      paintRows(ctx, "MAP", "Sheets", [
        { kind: "mono", text: "sheet 0   main     open" },
        { kind: "mono", text: "sheet 1   source   waiting" },
        { kind: "mono", text: "sheet 2   log      waiting" },
        { kind: "mono", text: "sheet 3   links    waiting" },
        { kind: "mono", text: "sheet 4   notes    waiting" },
        { kind: "mono", text: "sheet 5   map      waiting" },
        { kind: "h", text: "Order" },
        { kind: "p", text: "The first sheet is always the seed. After that the next sheet is a dice roll. A crawler already born stays on its page." },
        { kind: "link", text: "Return by chance, not by index" },
      ]),
    ),
    blobUrl((ctx) => {
      const wash = ctx.createRadialGradient(W * 0.5, H * 0.42, 40, W * 0.5, H * 0.5, 980);
      wash.addColorStop(0, "#23262e");
      wash.addColorStop(1, "#101218");
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, W, H);
    }),
  ]);
}
