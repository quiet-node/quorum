"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useUIMessages } from "@convex-dev/agent/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { QRCodeSVG } from "qrcode.react";

type StoredIdentity = {
  participantId: Id<"participants">;
  name: string;
  color: string;
};

function storageKey(roomId: string) {
  return `warroom:${roomId}`;
}

function loadIdentity(roomId: string): StoredIdentity | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(storageKey(roomId));
  return raw ? (JSON.parse(raw) as StoredIdentity) : null;
}

const FALLBACK_COLORS = [
  "#9fb2ab",
  "#a8a8b0",
  "#b0a493",
  "#94a3b2",
  "#a9b09a",
  "#b19aa8",
  "#9aa7b0",
  "#b0ab9a",
];

function hashColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const raw =
    parts.length > 1 ? parts[0][0] + parts[1][0] : name.trim().slice(0, 2);
  return raw.toUpperCase();
}

const ARTIFACT_RE = /```artifact\n([\s\S]*?)```/g;

function extractLastArtifact(
  messages: { text: string }[] | undefined,
): string | null {
  if (!messages) return null;
  let last: string | null = null;
  for (const m of messages) {
    const matches = [...m.text.matchAll(ARTIFACT_RE)];
    if (matches.length > 0) {
      last = matches[matches.length - 1][1];
    }
  }
  return last;
}

// The agent re-emits the whole working draft inside a ```artifact fence every
// step. The draft belongs in the right pane, not in the transcript prose.
function stripArtifact(text: string) {
  return text.replace(ARTIFACT_RE, "").replace(/\n{3,}/g, "\n\n").trim();
}

function clockTime(ms: number) {
  return new Date(ms).toLocaleTimeString("en-US", { hour12: false });
}

function elapsedLabel(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Minimal shape of an AI SDK tool part; avoids fighting the UITools generics. */
type ToolPart = {
  type: string;
  toolCallId?: string;
  toolName?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

function toolNameOf(part: ToolPart) {
  if (part.type === "dynamic-tool") return part.toolName ?? "tool";
  return part.type.slice("tool-".length);
}

function toolLabel(part: ToolPart): { verb: string; arg: string } {
  const name = toolNameOf(part);
  const input = (part.input ?? {}) as Record<string, unknown>;
  if (name === "readFile") {
    return { verb: "Reading", arg: String(input.path ?? "") };
  }
  if (name === "listFiles") {
    return { verb: "Listing", arg: "repo snapshot" };
  }
  return { verb: name, arg: JSON.stringify(input) };
}

function toolStat(part: ToolPart) {
  if (part.state === "output-error") return "error";
  if (typeof part.output !== "string") {
    return part.state === "output-available" ? "done" : "running";
  }
  const lines = part.output.split("\n").length;
  return `${lines} lines`;
}

function diffStat(artifact: string | null) {
  if (!artifact) return { adds: 0, dels: 0 };
  let adds = 0;
  let dels = 0;
  for (const line of artifact.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) adds++;
    else if (line.startsWith("-") && !line.startsWith("---")) dels++;
  }
  return { adds, dels };
}

const FENCE_RE = /```[a-zA-Z]*\n([\s\S]*?)```/g;

/** Splits the working draft into its diff blocks and its prose summary. */
function splitArtifact(artifact: string | null) {
  if (!artifact) return { diffs: [] as string[], summary: "" };
  const diffs = [...artifact.matchAll(FENCE_RE)].map((m) => m[1].trimEnd());
  const summary = artifact.replace(FENCE_RE, "").replace(/\n{3,}/g, "\n\n").trim();
  if (diffs.length === 0 && /^(---|\+\+\+|@@)/m.test(artifact)) {
    return { diffs: [artifact.trim()], summary: "" };
  }
  return { diffs, summary };
}

function diffTargetPath(diff: string) {
  const match = diff.match(/^\+\+\+ [ab]?\/?(.+)$/m);
  return match ? match[1].trim() : "unified diff";
}

type Dir = {
  dirs: Map<string, Dir>;
  files: { name: string; path: string; bytes: number }[];
};

function buildTree(files: { path: string; bytes: number }[]): Dir {
  const root: Dir = { dirs: new Map(), files: [] };
  for (const file of files) {
    const segments = file.path.split("/");
    let node = root;
    for (const segment of segments.slice(0, -1)) {
      let next = node.dirs.get(segment);
      if (!next) {
        next = { dirs: new Map(), files: [] };
        node.dirs.set(segment, next);
      }
      node = next;
    }
    node.files.push({
      name: segments[segments.length - 1],
      path: file.path,
      bytes: file.bytes,
    });
  }
  return root;
}

function diffLineClass(line: string) {
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+++") || line.startsWith("---")) return "hunk";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  return undefined;
}

const SCROLL_BOTTOM_THRESHOLD = 80;

type FeedItem =
  | {
      kind: "prose";
      key: string;
      text: string;
      creationTime: number;
      msgKey: string;
    }
  | { kind: "tool"; key: string; part: ToolPart; creationTime: number }
  | {
      kind: "interjection";
      key: string;
      authorName: string;
      text: string;
      creationTime: number;
    };

export default function RoomPage() {
  const params = useParams<{ id: string }>();
  const roomId = params.id as Id<"rooms">;

  const room = useQuery(api.rooms.getRoom, { roomId });
  const participants = useQuery(api.rooms.listParticipants, { roomId });
  const interjections = useQuery(api.rooms.listInterjections, { roomId });
  const repoFilePaths = useQuery(api.repoFiles.listRepoFilePaths, {});
  const joinRoom = useMutation(api.rooms.joinRoom);
  const heartbeat = useMutation(api.rooms.heartbeat);
  const startRun = useAction(api.agent.startRun);
  const resetRoom = useMutation(api.rooms.resetRoom);
  const requestStop = useMutation(api.rooms.requestStop);
  const addInterjection = useMutation(
    api.rooms.addInterjection,
  ).withOptimisticUpdate((localStore, args) => {
    const existing = localStore.getQuery(api.rooms.listInterjections, {
      roomId: args.roomId,
    });
    if (existing !== undefined) {
      localStore.setQuery(
        api.rooms.listInterjections,
        { roomId: args.roomId },
        [
          ...existing,
          {
            _id: crypto.randomUUID() as unknown as Id<"interjections">,
            _creationTime: Date.now(),
            roomId: args.roomId,
            authorName: args.authorName,
            text: args.text,
            consumed: false,
          },
        ],
      );
    }
  });
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [tab, setTab] = useState<"diff" | "console" | "files">("diff");
  const [openDirs, setOpenDirs] = useState<Record<string, boolean>>({});
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const selectedFile = useQuery(
    api.repoFiles.getRepoFileContent,
    selectedPath ? { path: selectedPath } : "skip",
  );
  const [workOpen, setWorkOpen] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { results: messages } = useUIMessages(
    api.rooms.listThreadMessages,
    room?.threadId ? { threadId: room.threadId } : "skip",
    { initialNumItems: 50, stream: true },
  );

  const colorByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of participants ?? []) map.set(p.name, p.color);
    return map;
  }, [participants]);

  function colorForName(name: string) {
    return colorByName.get(name) ?? hashColor(name);
  }

  const feed = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = [];
    for (const m of messages ?? []) {
      if (m.role !== "assistant") continue;
      const parts = (m.parts ?? []) as unknown as ToolPart[];
      parts.forEach((part, index) => {
        if (part.type === "text") {
          const text = stripArtifact(
            String((part as unknown as { text?: string }).text ?? ""),
          );
          if (!text) return;
          items.push({
            kind: "prose",
            key: `${m.key}:${index}`,
            msgKey: m.key,
            text,
            creationTime: m._creationTime,
          });
          return;
        }
        if (part.type === "dynamic-tool" || part.type.startsWith("tool-")) {
          items.push({
            kind: "tool",
            key: `${m.key}:${index}`,
            part,
            creationTime: m._creationTime,
          });
        }
      });
    }
    for (const i of interjections ?? []) {
      items.push({
        kind: "interjection",
        key: i._id,
        authorName: i.authorName,
        text: i.text,
        creationTime: i._creationTime,
      });
    }
    items.sort((a, b) => a.creationTime - b.creationTime);
    return items;
  }, [messages, interjections]);

  const artifact = useMemo(() => extractLastArtifact(messages), [messages]);
  const stat = useMemo(() => diffStat(artifact), [artifact]);
  const { diffs, summary } = useMemo(() => splitArtifact(artifact), [artifact]);
  const toolEvents = useMemo(
    () => feed.filter((i) => i.kind === "tool"),
    [feed],
  );
  const tree = useMemo(
    () => buildTree(repoFilePaths ?? []),
    [repoFilePaths],
  );

  const latestSteerByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of interjections ?? []) map.set(i.authorName, i.text);
    return map;
  }, [interjections]);

  const running = room?.status === "running";

  // Elapsed timer for the current run.
  const runStartRef = useRef<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  if (running && runStartRef.current === null) runStartRef.current = Date.now();
  if (!running && runStartRef.current !== null) runStartRef.current = null;
  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [running]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  useEffect(() => {
    if (!isAtBottom) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [feed, isAtBottom]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsAtBottom(distanceFromBottom < SCROLL_BOTTOM_THRESHOLD);
  }

  async function handleStart() {
    if (starting) return;
    setStarting(true);
    try {
      await startRun({ roomId });
    } finally {
      setStarting(false);
    }
  }

  async function handleNewRun() {
    if (starting) return;
    setStarting(true);
    try {
      await resetRoom({ roomId });
      await startRun({ roomId });
    } finally {
      setStarting(false);
    }
  }

  async function handleStop() {
    if (stopping) return;
    setStopping(true);
    try {
      await requestStop({ roomId });
    } finally {
      setStopping(false);
    }
  }

  const [identity, setIdentity] = useState<StoredIdentity | null>(() =>
    loadIdentity(roomId),
  );
  const [nameInput, setNameInput] = useState("");
  const [joining, setJoining] = useState(false);
  const [interjectionInput, setInterjectionInput] = useState("");
  const [sending, setSending] = useState(false);
  const [roomUrl, setRoomUrl] = useState("");

  useEffect(() => {
    setRoomUrl(window.location.href);
  }, []);

  // Heartbeat while we have an identity.
  useEffect(() => {
    if (!identity) return;
    heartbeat({ participantId: identity.participantId });
    const interval = setInterval(() => {
      heartbeat({ participantId: identity.participantId });
    }, 10_000);
    return () => clearInterval(interval);
  }, [identity, heartbeat]);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!nameInput.trim() || joining) return;
    setJoining(true);
    try {
      const { participantId, color } = await joinRoom({
        roomId,
        name: nameInput.trim(),
      });
      const next: StoredIdentity = {
        participantId,
        name: nameInput.trim(),
        color,
      };
      localStorage.setItem(storageKey(roomId), JSON.stringify(next));
      setIdentity(next);
    } finally {
      setJoining(false);
    }
  }

  async function handleSendInterjection(e: React.FormEvent) {
    e.preventDefault();
    if (!identity || !interjectionInput.trim() || sending) return;
    const text = interjectionInput.trim();
    setInterjectionInput("");
    setSending(true);
    try {
      await addInterjection({ roomId, authorName: identity.name, text });
    } finally {
      setSending(false);
    }
  }

  if (room === undefined) {
    return <div className="landing">Loading…</div>;
  }

  if (room === null) {
    return <div className="landing">Room not found.</div>;
  }

  if (!identity) {
    return (
      <div className="landing">
        <div className="landing-col">
          <div className="landing-mark">quorum</div>
          <p className="landing-sub">
            {room.title} — enter a name so the room knows who steered what.
          </p>
          <form onSubmit={handleJoin}>
            <div className="field-block">
              <label className="landing-label" htmlFor="name">
                Your name
              </label>
              <input
                id="name"
                className="input"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Logan"
                required
                autoFocus
              />
            </div>
            <button type="submit" className="btn-primary" disabled={joining}>
              {joining ? "Joining…" : "Join room"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const people = participants ?? [];
  const statusDot =
    room.status === "running"
      ? "dot dot-em"
      : room.status === "error"
        ? "dot dot-amber"
        : "dot dot-idle";

  const diffPane =
    diffs.length === 0 && !summary ? (
      <div className="empty">Nothing drafted yet.</div>
    ) : (
      <>
        {diffs.map((diff, i) => (
          <div className="card" key={i}>
            <div className="card-head">
              <span>{diffTargetPath(diff)}</span>
              {i === 0 && (
                <span className="stat">
                  <b>+{stat.adds}</b> <s>−{stat.dels}</s>
                </span>
              )}
            </div>
            <pre className="diff">
              {diff.split("\n").map((line, j) => (
                <span key={j} className={diffLineClass(line)}>
                  {line || " "}
                </span>
              ))}
            </pre>
          </div>
        ))}
        {summary && (
          <div className="card">
            <div className="card-head">
              <span>Summary</span>
            </div>
            <div className="pr">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {summary}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </>
    );

  const consolePane = (
    <div className="card">
      <div className="console">
        {toolEvents.length === 0 && (
          <div className="console-out">no tool calls yet</div>
        )}
        {toolEvents.map((item) => {
          if (item.kind !== "tool") return null;
          const { verb, arg } = toolLabel(item.part);
          const failed = item.part.state === "output-error";
          return (
            <div key={item.key}>
              <div className="console-line">
                <span className="sig">$</span>
                <span className="cmd">
                  {toolNameOf(item.part)} {arg}
                </span>
              </div>
              <div className={failed ? "console-out err" : "console-out"}>
                {failed
                  ? (item.part.errorText ?? "error")
                  : `${verb.toLowerCase()} → ${toolStat(item.part)}`}
              </div>
            </div>
          );
        })}
        {running && (
          <div className="console-cursor">
            <span className="sig">$</span>
            <span className="blink">▌</span>
          </div>
        )}
      </div>
    </div>
  );

  function renderDir(dir: Dir, prefix: string, depth: number) {
    const dirNames = [...dir.dirs.keys()].sort((a, b) => a.localeCompare(b));
    const files = [...dir.files].sort((a, b) => a.name.localeCompare(b.name));
    return (
      <>
        {dirNames.map((name) => {
          const path = prefix ? `${prefix}/${name}` : name;
          const open = openDirs[path] ?? depth === 0;
          return (
            <div key={path}>
              <button
                className="tree-row dir"
                style={{ paddingLeft: 8 + depth * 12 }}
                onClick={() =>
                  setOpenDirs((prev) => ({ ...prev, [path]: !open }))
                }
              >
                <span className="chev">{open ? "▾" : "▸"}</span>
                <span>{name}</span>
              </button>
              {open && renderDir(dir.dirs.get(name)!, path, depth + 1)}
            </div>
          );
        })}
        {files.map((file) => (
          <button
            key={file.path}
            className="tree-row"
            style={{ paddingLeft: 8 + depth * 12 + 14 }}
            onClick={() => setSelectedPath(file.path)}
          >
            <span>{file.name}</span>
            <span className="bytes">{file.bytes}B</span>
          </button>
        ))}
      </>
    );
  }

  const filesPane = selectedPath ? (
    <div className="card">
      <div className="file-head">
        <button className="file-back" onClick={() => setSelectedPath(null)}>
          ← files
        </button>
        <span>{selectedPath}</span>
      </div>
      <pre className="file-body">
        {selectedFile === undefined
          ? "loading…"
          : (selectedFile ?? "file not in snapshot")}
      </pre>
    </div>
  ) : (
    <div className="card">
      {(repoFilePaths ?? []).length === 0 ? (
        <div className="empty" style={{ padding: "12px" }}>
          No repo snapshot loaded.
        </div>
      ) : (
        <div className="tree">{renderDir(tree, "", 0)}</div>
      )}
    </div>
  );

  return (
    <div className="app">
      <header className="topbar">
        <span className="wordmark">quorum</span>
        <span className="crumb">
          <b>quiet-node/quorum</b> · main
        </span>
        <span className="spacer" />
        <span className="top-meta">
          turn {(messages ?? []).length} · {people.length} in room
        </span>
        {room.status === "idle" && (
          <button
            className="btn-ghost"
            onClick={handleStart}
            disabled={starting}
          >
            {starting ? "Starting…" : "Start"}
          </button>
        )}
        {(room.status === "done" || room.status === "error") && (
          <button
            className="btn-ghost"
            onClick={handleNewRun}
            disabled={starting}
          >
            New run
          </button>
        )}
        <button className="btn-ghost" onClick={() => setInviteOpen(true)}>
          Invite
        </button>
      </header>

      <div className="shell">
        <div className="strip">
          {people.map((p) => (
            <span key={p._id} className="s-item">
              <i className="av" style={{ background: p.color }}>
                {initials(p.name)}
              </i>
              <span className="s-name">{p.name}</span>
            </span>
          ))}
          <span className="s-legend">
            <i className={statusDot} />
            {room.status}
          </span>
        </div>

        <aside className="side">
          <div className="side-head">
            <div className="side-room">{room.title}</div>
            <div className="side-sub">
              <i className={statusDot} /> {room.status}
              {running && runStartRef.current !== null && (
                <> · {elapsedLabel(now - runStartRef.current)}</>
              )}
            </div>
          </div>

          <div className="side-scroll">
            <div className="side-label">In room · {people.length}</div>
            {people.map((p) => {
              const steer = latestSteerByName.get(p.name);
              return (
                <div
                  key={p._id}
                  className={
                    p.name === identity.name ? "person self" : "person"
                  }
                >
                  <i className="av" style={{ background: p.color }}>
                    {initials(p.name)}
                  </i>
                  <div>
                    <div className="person-name">
                      {p.name}
                      {p.name === identity.name && (
                        <span className="you">you</span>
                      )}
                    </div>
                    {steer ? (
                      <div className="person-steer">{steer}</div>
                    ) : (
                      <div className="person-idle">watching · no steers yet</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="side-foot">
            <div className="legend">
              <i className="dot dot-em" /> running — agent has the turn
            </div>
            <div className="legend">
              <i className="dot dot-amber" /> awaiting — agent waiting on a steer
            </div>
          </div>
        </aside>

        <section className="center">
          <div className="center-head">
            <span className="center-title">Agent transcript</span>
            <span className="spacer" />
            <span className={running ? "pill live" : "pill"}>
              <i className={statusDot} /> {room.status}
            </span>
          </div>

          <div className="scroll" ref={scrollRef} onScroll={handleScroll}>
            <div className="col">
              {feed.length === 0 && (
                <div className="empty">
                  {room.status === "idle"
                    ? "Waiting to start…"
                    : "Waiting for agent…"}
                </div>
              )}

              {feed.map((item) => {
                if (item.kind === "interjection") {
                  return (
                    <div
                      key={item.key}
                      className="steer"
                      style={{ borderLeftColor: colorForName(item.authorName) }}
                    >
                      <div className="steer-who">{item.authorName} steered</div>
                      <div className="steer-text">{item.text}</div>
                    </div>
                  );
                }
                if (item.kind === "tool") {
                  const { verb, arg } = toolLabel(item.part);
                  const open = expanded[item.key];
                  const output =
                    typeof item.part.output === "string"
                      ? item.part.output
                      : JSON.stringify(item.part.output ?? {}, null, 2);
                  return (
                    <div key={item.key}>
                      <button
                        className="tool"
                        onClick={() =>
                          setExpanded((prev) => ({
                            ...prev,
                            [item.key]: !prev[item.key],
                          }))
                        }
                      >
                        <span className="chev">{open ? "▾" : "▸"}</span>
                        <span className="tool-verb">{verb}</span>
                        <span className="tool-arg">{arg}</span>
                        <span className="tool-stat">{toolStat(item.part)}</span>
                      </button>
                      {open && (
                        <div className="tool-body">
                          {item.part.errorText ?? output}
                        </div>
                      )}
                    </div>
                  );
                }
                return (
                  <div key={item.key} className="msg">
                    <div className="msg-head">
                      <span className="msg-who">claude</span>
                      <span className="msg-ts">
                        {clockTime(item.creationTime)}
                      </span>
                    </div>
                    <div className="prose">{item.text}</div>
                  </div>
                );
              })}

              {running && runStartRef.current !== null && (
                <div className="working">
                  <i className="spark" />
                  Working<span>…</span>
                  <span className="elapsed">
                    {elapsedLabel(now - runStartRef.current)}
                  </span>
                  <span className="esc">anyone can steer</span>
                </div>
              )}
            </div>
          </div>

          <footer className="composer">
            <form className="composer-inner" onSubmit={handleSendInterjection}>
              <div className="field">
                <span className="caret">&gt;</span>
                <input
                  className="field-text"
                  value={interjectionInput}
                  onChange={(e) => setInterjectionInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      handleSendInterjection(e);
                    }
                  }}
                  placeholder="Steer the agent…"
                  disabled={sending}
                />
                <button
                  type="button"
                  className="stop"
                  onClick={handleStop}
                  disabled={!running || stopping}
                >
                  <i /> Stop
                </button>
              </div>
              <div className="composer-meta">
                <span>claude-sonnet-5</span>
                <span>·</span>
                <span>anyone in the room can steer</span>
                <span className="spacer" />
                <span>⌘↵ send</span>
              </div>
            </form>
          </footer>
        </section>

        <aside className={workOpen ? "work open" : "work"}>
          <div className="tabs">
            <button
              className={tab === "diff" ? "tab on" : "tab"}
              onClick={() => setTab("diff")}
            >
              Diff
              <span className="count">
                {stat.adds > 0 || stat.dels > 0
                  ? `+${stat.adds}/−${stat.dels}`
                  : "0"}
              </span>
            </button>
            <button
              className={tab === "console" ? "tab on" : "tab"}
              onClick={() => setTab("console")}
            >
              Console
              <span className="count">{toolEvents.length}</span>
            </button>
            <button
              className={tab === "files" ? "tab on" : "tab"}
              onClick={() => setTab("files")}
            >
              Files
              <span className="count">{(repoFilePaths ?? []).length}</span>
            </button>
            <div className="tabs-right">
              <button
                className="work-toggle"
                onClick={() => setWorkOpen((v) => !v)}
              >
                {workOpen ? "tap to collapse" : "tap to expand"}
              </button>
            </div>
          </div>

          <div className="work-scroll">
            {tab === "diff" ? diffPane : tab === "console" ? consolePane : filesPane}
          </div>
        </aside>
      </div>

      {inviteOpen && (
        <div className="overlay" onClick={() => setInviteOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Scan to join this room</div>
            <div className="qr">
              {roomUrl && (
                <QRCodeSVG value={roomUrl} size={340} level="M" marginSize={0} />
              )}
            </div>
            <div className="modal-url">{roomUrl}</div>
            <button className="btn-ghost" onClick={() => setInviteOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
