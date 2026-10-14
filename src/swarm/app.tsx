import { useEffect, useRef, useState } from "react";
import { ImagePlus, Minus, Pause, Play, Plus, RotateCcw, Settings2, Volume2, VolumeX, X } from "lucide-react";
import { createAudio, type SwarmAudio } from "./audio";
import { ui, type Copy, type Lang } from "./copy";
import { loadImage, scanImage, startCrawl, type CrawlHandle, type CrawlStats, type DocLine, type ReadDir, type Surface, type Weave } from "./crawl";
import { makeDemo } from "./demo";
import { collectPages, PageError } from "./pages";

type Shot = { url: string; name: string };
type LocalFile = { id: string; file: File };

const emptyStats: CrawlStats = { agents: 1, pages: 1, lines: 0, seen: [0], threads: 0, left: 0 };

function clockLabel(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function ensureDir(lang: Lang) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
}

const MAX_BRANCH = 10;
const MIN_BRANCH = 3;

export function SwarmApp() {
  const [lang, setLang] = useState<Lang>("en");
  const [kind, setKind] = useState<"pictures" | "pages">("pictures");
  const [main, setMain] = useState<Shot | null>(null);
  const [branches, setBranches] = useState<Shot[]>([]);
  const [readDir, setReadDir] = useState<ReadDir>("ltr");
  const [mode, setMode] = useState<"edit" | "run">("edit");
  const [runId, setRunId] = useState(0);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState<"main" | "add" | "files" | null>(null);
  const [audio, setAudio] = useState<SwarmAudio | null>(null);
  const [muted, setMuted] = useState(false);
  const [github, setGithub] = useState("");
  const [startAt, setStartAt] = useState("");
  const [topic, setTopic] = useState("");
  const [weave, setWeave] = useState<Weave>("rhyme");
  const [locals, setLocals] = useState<LocalFile[]>([]);
  const [pageNote, setPageNote] = useState("");
  const [pageCount, setPageCount] = useState(7);
  const [seconds, setSeconds] = useState(90);
  const [surface, setSurface] = useState<Surface>("void");
  const [deskShot, setDeskShot] = useState<Shot | null>(null);
  const [runDocs, setRunDocs] = useState<{ lines: DocLine[] }[]>([]);
  const [runWeave, setRunWeave] = useState<Weave>("rhyme");
  const [runTopic, setRunTopic] = useState("");
  const [runSeconds, setRunSeconds] = useState(90);
  const [runSurface, setRunSurface] = useState<Surface>("void");
  const [runDesk, setRunDesk] = useState<string | null>(null);
  const copy = ui[lang];
  const ready = Boolean(main) && branches.length >= MIN_BRANCH;
  const pagesReady = github.trim().length > 0 || locals.length >= 2;

  useEffect(() => {
    localStorage.setItem("swarm-lang", lang);
    ensureDir(lang);
  }, [lang]);

  useEffect(() => {
    audio?.setMuted(muted);
  }, [audio, muted]);

  function arm() {
    const next = audio ?? createAudio();
    if (!audio) setAudio(next);
    next.unlock();
    return next;
  }

  function addBranches(files: File[]) {
    setBranches((prev) => {
      const next = [...prev];
      for (const file of files) {
        if (!file.type.startsWith("image/")) continue;
        if (next.length >= MAX_BRANCH) break;
        next.push({ url: URL.createObjectURL(file), name: file.name });
      }
      return next;
    });
  }

  function takeMain(list: FileList | null) {
    if (!list?.length) return;
    const images = Array.from(list).filter((file) => file.type.startsWith("image/"));
    if (!images.length) return;
    const [first, ...rest] = images;
    setMain((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { url: URL.createObjectURL(first), name: first.name };
    });
    if (rest.length) addBranches(rest);
  }

  function clearMain() {
    setMain((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  }

  function clearBranch(index: number) {
    setBranches((prev) => {
      const next = [...prev];
      const shot = next[index];
      if (shot) URL.revokeObjectURL(shot.url);
      next.splice(index, 1);
      return next;
    });
  }

  function replaceBranch(index: number, list: FileList | null) {
    if (!list?.length) return;
    const images = Array.from(list).filter((file) => file.type.startsWith("image/"));
    if (!images.length) return;
    const [first, ...rest] = images;
    setBranches((prev) => {
      const next = [...prev];
      const shot = next[index];
      if (shot) URL.revokeObjectURL(shot.url);
      next[index] = { url: URL.createObjectURL(first), name: first.name };
      return next;
    });
    if (rest.length) addBranches(rest);
  }

  function launch(dir: ReadDir, nextShots?: Shot[], docs: { lines: DocLine[] }[] = [], nextWeave: Weave = "rhyme", nextTopic = "") {
    arm();
    if (nextShots) {
      if (main) URL.revokeObjectURL(main.url);
      for (const shot of branches) URL.revokeObjectURL(shot.url);
      setMain(nextShots[0] ?? null);
      setBranches(nextShots.slice(1));
    }
    setRunDocs(docs);
    setRunWeave(nextWeave);
    setRunTopic(nextTopic);
    setRunSeconds(seconds);
    setRunSurface(surface);
    setRunDesk(surface === "photo" ? (deskShot?.url ?? null) : null);
    setReadDir(dir);
    setRunId((n) => n + 1);
    setMode("run");
  }

  async function onDemo() {
    setBusy(true);
    try {
      const urls = await makeDemo();
      launch(
        "ltr",
        urls.map((url, i) => ({ url, name: ["article", "source", "log", "links", "notes", "map", "quiet"][i] ?? "page" })),
      );
    } finally {
      setBusy(false);
    }
  }

  function addLocals(list: FileList | File[] | null) {
    if (!list) return;
    const incoming = Array.from(list);
    setLocals((prev) => {
      const next = [...prev];
      for (const file of incoming) {
        if (next.length >= 12) break;
        next.push({ id: `${file.name}-${file.size}-${next.length}-${file.lastModified}`, file });
      }
      return next;
    });
    setPageNote("");
  }

  async function onPages() {
    setBusy(true);
    setPageNote("");
    const useTopic = weave === "topic" && topic.trim().length >= 2;
    try {
      const gathered = await collectPages({
        github,
        startAt,
        topic: useTopic ? topic : "",
        files: locals.map((item) => item.file),
        limit: pageCount,
      });
      if (gathered.missedStart) setPageNote(copy.nostart);
      launch(
        readDir,
        gathered.pages.map((page) => ({ url: page.url, name: page.name })),
        gathered.pages.map((page) => ({ lines: page.lines })),
        useTopic ? "topic" : "rhyme",
        useTopic ? topic.trim() : "",
      );
    } catch (error) {
      const code = error instanceof PageError ? error.code : "empty";
      const text = code === "bad" ? copy.bad : code === "missing" ? copy.missing : code === "rate" ? copy.rate : copy.emptyPages;
      setPageNote(text);
    } finally {
      setBusy(false);
    }
  }

  const pack = main ? [main, ...branches] : [];

  return (
    <div className="app-root" dir={lang === "ar" ? "rtl" : "ltr"}>
      {mode === "run" && audio && pack.length > 1 ? (
        <Stage
          key={runId}
          audio={audio}
          urls={pack.map((shot) => shot.url)}
          labels={pack.map((shot) => shot.name)}
          dir={readDir}
          docs={runDocs}
          weave={runWeave}
          topic={runTopic}
          seconds={runSeconds}
          surface={runSurface}
          deskUrl={runDesk}
          copy={copy}
          muted={muted}
          onMute={() => setMuted((value) => !value)}
          onExit={() => setMode("edit")}
          onAgain={() => {
            arm();
            setRunId((n) => n + 1);
          }}
        />
      ) : (
        <main className="desk">
          <header className="desk-top">
            <div>
              <p className="kicker">{copy.kicker}</p>
              <h1 className="brand">{copy.brand}</h1>
              <p className="lead">{kind === "pages" ? copy.leadPages : copy.lead}</p>
            </div>
            <button type="button" className="ghost" onClick={() => setLang(lang === "ar" ? "en" : "ar")}>
              {copy.lang}
            </button>
          </header>

          <div className="kind-row" role="tablist">
            <button type="button" className={kind === "pictures" ? "chip is-on" : "chip"} aria-pressed={kind === "pictures"} onClick={() => setKind("pictures")}>
              {copy.pictures}
            </button>
            <button type="button" className={kind === "pages" ? "chip is-on" : "chip"} aria-pressed={kind === "pages"} onClick={() => setKind("pages")}>
              {copy.pagesKind}
            </button>
          </div>

          <div className="read-row">
            <span>{copy.surface}</span>
            <button type="button" className={surface === "void" ? "chip is-on" : "chip"} aria-pressed={surface === "void"} onClick={() => setSurface("void")}>
              {copy.void}
            </button>
            <button type="button" className={surface === "table" ? "chip is-on" : "chip"} aria-pressed={surface === "table"} onClick={() => setSurface("table")}>
              {copy.table}
            </button>
            <button type="button" className={surface === "photo" ? "chip is-on" : "chip"} aria-pressed={surface === "photo"} onClick={() => setSurface("photo")}>
              {copy.photo}
            </button>
            {surface === "photo" ? (
              <label className="ghost file-btn">
                {deskShot ? deskShot.name : copy.deskPick}
                <input
                  type="file"
                  accept="image/*"
                  aria-label={copy.deskPick}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    setDeskShot((prev) => {
                      if (prev) URL.revokeObjectURL(prev.url);
                      return { url: URL.createObjectURL(file), name: file.name };
                    });
                  }}
                />
              </label>
            ) : null}
          </div>

          <section className="timer-control" aria-label={copy.show}>
            <div className="timer-heading">
              <span className="timer-title"><Settings2 size={15} /> {copy.show}</span>
              <output className="timer-readout" aria-live="polite">{clockLabel(seconds)}</output>
            </div>
            <div className="timer-adjust">
              <button type="button" className="timer-step" aria-label="−10" disabled={seconds <= 50} onClick={() => setSeconds((n) => Math.max(50, n - 10))}><Minus size={14} /></button>
              <label className="timer-range">
                <input type="range" min={50} max={300} step={10} value={seconds} aria-label={copy.show} onChange={(event) => setSeconds(Number(event.target.value))} />
                <span className="timer-ticks" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>
              </label>
              <button type="button" className="timer-step" aria-label="+10" disabled={seconds >= 300} onClick={() => setSeconds((n) => Math.min(300, n + 10))}><Plus size={14} /></button>
            </div>
          </section>

          {kind === "pictures" ? (
            <div className="slots">
              <Slot
                shot={main}
                label={copy.main}
                hint={copy.drop}
                big
                multiple
                over={over === "main"}
                removeLabel={copy.remove}
                onOver={(value) => setOver(value ? "main" : null)}
                onFiles={(files) => takeMain(files)}
                onClear={clearMain}
              />
              <div className="branches">
                {branches.map((shot, index) => (
                  <Slot
                    key={shot.url}
                    shot={shot}
                    label={`${copy.branch} ${index + 1}`}
                    hint={shot.name}
                    over={false}
                    removeLabel={copy.remove}
                    onOver={() => undefined}
                    onFiles={(files) => replaceBranch(index, files)}
                    onClear={() => clearBranch(index)}
                  />
                ))}
                {branches.length < MAX_BRANCH ? (
                  <Slot
                    shot={null}
                    label={copy.add}
                    hint={copy.addHint}
                    multiple
                    over={over === "add"}
                    removeLabel={copy.remove}
                    onOver={(value) => setOver(value ? "add" : null)}
                    onFiles={(files) => addBranches(files ? Array.from(files) : [])}
                    onClear={() => undefined}
                  />
                ) : null}
              </div>
            </div>
          ) : (
            <div className="page-form">
              <label className="field">
                <span>{copy.github}</span>
                <input value={github} placeholder={copy.githubHint} onChange={(event) => setGithub(event.target.value)} spellCheck={false} />
              </label>
              <div className="field-row">
                <label className="field">
                  <span>{copy.startAt}</span>
                  <input value={startAt} placeholder={copy.startAtHint} onChange={(event) => setStartAt(event.target.value)} spellCheck={false} />
                </label>
                <label className="field">
                  <span>{copy.topic}</span>
                  <input value={topic} placeholder={copy.topicHint} onChange={(event) => setTopic(event.target.value)} />
                </label>
                <label className="field">
                  <span>{copy.count}</span>
                  <input
                    type="number"
                    min={2}
                    max={12}
                    value={pageCount}
                    aria-label={copy.count}
                    onChange={(event) => setPageCount(Math.max(2, Math.min(12, Number(event.target.value) || 7)))}
                  />
                </label>
              </div>
              <div className="read-row">
                <span>{copy.weave}</span>
                <button type="button" className={weave === "rhyme" ? "chip is-on" : "chip"} aria-pressed={weave === "rhyme"} onClick={() => setWeave("rhyme")}>
                  {copy.rhyme}
                </button>
                <button type="button" className={weave === "topic" ? "chip is-on" : "chip"} aria-pressed={weave === "topic"} onClick={() => setWeave("topic")}>
                  {copy.byTopic}
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setGithub("https://github.com/OctopusOkhtobot/swarm");
                    setStartAt("src/swarm/crawl.ts");
                    setTopic("line");
                    setWeave("topic");
                    setPageNote("");
                  }}
                >
                  {copy.ownRepo}
                </button>
              </div>
              <p className="need">{copy.weaveNote}</p>
              <div
                className={over === "files" ? "file-drop is-over" : "file-drop"}
                onDragOver={(event) => {
                  event.preventDefault();
                  setOver("files");
                }}
                onDragLeave={() => setOver(null)}
                onDrop={(event) => {
                  event.preventDefault();
                  setOver(null);
                  addLocals(event.dataTransfer.files);
                }}
              >
                <span>{copy.files}</span>
                <em>{copy.filesHint}</em>
                <input
                  type="file"
                  multiple
                  aria-label={copy.files}
                  onChange={(event) => {
                    addLocals(event.target.files);
                    event.target.value = "";
                  }}
                />
              </div>
              {locals.length ? (
                <ul className="file-list">
                  {locals.map((item, index) => (
                    <li key={item.id}>
                      <span>{index === 0 && !github.trim() ? `${copy.main} · ${item.file.name}` : item.file.name}</span>
                      <button
                        type="button"
                        className="slot-x"
                        aria-label={copy.remove}
                        onClick={() => setLocals((prev) => prev.filter((file) => file.id !== item.id))}
                      >
                        <X size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}

          <div className="read-row">
            <span>{copy.read}</span>
            <button type="button" className={readDir === "ltr" ? "chip is-on" : "chip"} aria-pressed={readDir === "ltr"} onClick={() => setReadDir("ltr")}>
              {copy.fromLeft}
            </button>
            <button type="button" className={readDir === "rtl" ? "chip is-on" : "chip"} aria-pressed={readDir === "rtl"} onClick={() => setReadDir("rtl")}>
              {copy.fromRight}
            </button>
          </div>

          <div className="actions">
            {kind === "pictures" ? (
              <button type="button" className="go" disabled={!ready || busy} onClick={() => launch(readDir)}>
                {copy.start}
              </button>
            ) : (
              <button type="button" className="go" disabled={!pagesReady || busy} onClick={() => void onPages()}>
                {busy ? copy.fetching : copy.start}
              </button>
            )}
            <button type="button" className="ghost" disabled={busy} onClick={() => void onDemo()}>
              {busy ? copy.busy : copy.demo}
            </button>
            <p className={pageNote && kind === "pages" ? "need is-warn" : "need"}>
              {kind === "pages" ? pageNote || (pagesReady ? copy.local : copy.pageNeed) : ready ? copy.local : `${copy.need} · ${branches.length}/${MAX_BRANCH}`}
            </p>
          </div>
        </main>
      )}
    </div>
  );
}

function Slot({
  shot,
  label,
  hint,
  big,
  multiple,
  over,
  removeLabel,
  onOver,
  onFiles,
  onClear,
}: {
  shot: Shot | null;
  label: string;
  hint: string;
  big?: boolean;
  multiple?: boolean;
  over: boolean;
  removeLabel: string;
  onOver: (value: boolean) => void;
  onFiles: (files: FileList | null) => void;
  onClear: () => void;
}) {
  return (
    <div
      className={["slot", big ? "slot-main" : "", shot ? "has-img" : "", over ? "is-over" : ""].filter(Boolean).join(" ")}
      onDragOver={(event) => {
        event.preventDefault();
        onOver(true);
      }}
      onDragLeave={() => onOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        onOver(false);
        onFiles(event.dataTransfer.files);
      }}
    >
      {shot ? <img src={shot.url} alt="" /> : null}
      <div className="slot-meta">
        <span className="slot-label">{label}</span>
        <em>{shot ? shot.name : hint}</em>
        {shot ? (
          <button type="button" className="slot-x" aria-label={removeLabel} onClick={onClear}>
            <X size={16} />
          </button>
        ) : (
          <ImagePlus size={18} />
        )}
      </div>
      <input
        type="file"
        accept="image/*"
        multiple={multiple}
        aria-label={label}
        onChange={(event) => {
          onFiles(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}

function Stage({
  audio,
  urls,
  labels,
  dir,
  docs,
  weave,
  topic,
  seconds,
  surface,
  deskUrl,
  copy,
  muted,
  onMute,
  onExit,
  onAgain,
}: {
  audio: SwarmAudio;
  urls: string[];
  labels: string[];
  dir: ReadDir;
  docs: { lines: DocLine[] }[];
  weave: Weave;
  topic: string;
  seconds: number;
  surface: Surface;
  deskUrl: string | null;
  copy: Copy;
  muted: boolean;
  onMute: () => void;
  onExit: () => void;
  onAgain: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const apiRef = useRef<CrawlHandle | null>(null);
  const pickPartyRef = useRef<(kind: "bots" | "friends" | "spiders") => void>(() => undefined);
  const exitRef = useRef(onExit);
  exitRef.current = onExit;
  const urlKey = urls.join("|");
  const [boot, setBoot] = useState(true);
  const [paused, setPaused] = useState(false);
  const [stats, setStats] = useState<CrawlStats>(emptyStats);
  const [pageIndex, setPageIndex] = useState(0);
  const [mark, setMark] = useState(false);
  const [botsOn, setBotsOn] = useState(false);
  const [friendsOn, setFriendsOn] = useState(false);
  const [spidersOn, setSpidersOn] = useState(false);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dead = false;
    let handle: CrawlHandle | null = null;
    setBoot(true);
    setPaused(false);
    setPageIndex(0);
    setStats(emptyStats);
    setMark(false);
    setBotsOn(false);
    setFriendsOn(false);
    setSpidersOn(false);
    setHeld(false);
    void (async () => {
      try {
        const images = await Promise.all(urls.map((url) => loadImage(url)));
        if (dead) return;
        const scans = images.map((image) => scanImage(image));
        if (dead) return;
        let desk: HTMLImageElement | null = null;
        if (deskUrl) {
          try {
            desk = await loadImage(deskUrl);
          } catch {
            desk = null;
          }
        }
        if (dead) return;
        handle = startCrawl({
          canvas,
          images,
          scans,
          audio,
          dir,
          docs,
          weave,
          topic,
          seconds,
          surface,
          desk,
          reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
          onStats: (next) => {
            if (!dead) setStats(next);
          },
          onPage: (index) => {
            if (!dead) setPageIndex(index);
          },
          onMark: (on) => {
            if (!dead) setMark(on);
          },
          onHold: (on) => {
            if (!dead) setHeld(on);
          },
        });
        apiRef.current = handle;
        if (!dead) setBoot(false);
      } catch {
        if (!dead) setBoot(false);
      }
    })();
    const pickParty = (kind: "bots" | "friends" | "spiders") => {
      const api = apiRef.current;
      if (!api) return;
      const on = kind === "bots" ? api.grokbot() : kind === "friends" ? api.friends() : api.spiders();
      setBotsOn(on && kind === "bots");
      setFriendsOn(on && kind === "friends");
      setSpidersOn(on && kind === "spiders");
    };
    pickPartyRef.current = pickParty;
    const onKey = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        event.preventDefault();
        setPaused(apiRef.current?.toggle() ?? false);
      } else if (event.key === "Escape") {
        exitRef.current();
      } else if (event.key === "g" || event.key === "G") {
        pickParty("bots");
      } else if (event.key === "f" || event.key === "F") {
        pickParty("friends");
      } else if (event.key === "s" || event.key === "S") {
        pickParty("spiders");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      dead = true;
      window.removeEventListener("keydown", onKey);
      handle?.stop();
      apiRef.current = null;
    };
  }, [audio, deskUrl, dir, docs, seconds, surface, topic, urlKey, weave]);

  return (
    <section className="stage" aria-busy={boot}>
      <canvas ref={canvasRef} />
      <div className="hud" aria-live="polite">
        <div>
          <b>{stats.agents}</b>
          <span>{copy.agents}</span>
        </div>
        <div>
          <b>{stats.pages}</b>
          <span>{copy.pages}</span>
        </div>
        <div>
          <b>{stats.lines}</b>
          <span>{copy.lines}</span>
        </div>
        {stats.threads > 0 ? (
          <div>
            <b>{stats.threads}</b>
            <span>{copy.threads}</span>
          </div>
        ) : null}
        <div>
          <b>{clockLabel(stats.left)}</b>
          <span>{held ? copy.held : copy.left}</span>
        </div>
        <div className="pager" aria-hidden="true">
          {labels.map((label, index) => (
            <i key={`${label}-${index}`} className={index === pageIndex ? "is-on" : stats.seen.includes(index) ? "is-done" : ""} />
          ))}
        </div>
      </div>
      <p className="cap">{labels[pageIndex] ?? labels[0]}</p>
      <p className={mark ? "sigil is-on" : "sigil"} aria-hidden="true">
        grok / cursor
      </p>
      {boot ? <p className="boot">{copy.booting}</p> : null}
      <div className="dock">
        <button type="button" className="ghost" onClick={() => setPaused(apiRef.current?.toggle() ?? false)} aria-pressed={paused}>
          {paused ? <Play size={16} /> : <Pause size={16} />}
          {paused ? copy.resume : copy.pause}
        </button>
        <button type="button" className="ghost" onClick={onAgain}>
          <RotateCcw size={16} />
          {copy.again}
        </button>
        <button type="button" className="ghost" onClick={onMute} aria-pressed={muted}>
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          {muted ? copy.mute : copy.sound}
        </button>
        <button type="button" className={friendsOn ? "ghost is-friend" : "ghost"} aria-pressed={friendsOn} onClick={() => pickPartyRef.current("friends")}>
          {copy.friends}
        </button>
        <button type="button" className={botsOn ? "ghost is-on" : "ghost"} aria-pressed={botsOn} onClick={() => pickPartyRef.current("bots")}>
          {copy.grokbot}
        </button>
        <button type="button" className={spidersOn ? "ghost is-spider" : "ghost"} aria-pressed={spidersOn} onClick={() => pickPartyRef.current("spiders")}>
          {copy.spiders}
        </button>
        <button type="button" className="ghost" onClick={onExit}>
          {copy.back}
        </button>
      </div>
    </section>
  );
}
