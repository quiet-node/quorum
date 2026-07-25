"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useUIMessages } from "@convex-dev/agent/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
  "#f87171",
  "#fb923c",
  "#fbbf24",
  "#4ade80",
  "#22d3ee",
  "#60a5fa",
  "#a78bfa",
  "#f472b6",
];

function hashColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
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

const SCROLL_BOTTOM_THRESHOLD = 80;

export default function RoomPage() {
  const params = useParams<{ id: string }>();
  const roomId = params.id as Id<"rooms">;

  const room = useQuery(api.rooms.getRoom, { roomId });
  const participants = useQuery(api.rooms.listParticipants, { roomId });
  const interjections = useQuery(api.rooms.listInterjections, { roomId });
  const joinRoom = useMutation(api.rooms.joinRoom);
  const heartbeat = useMutation(api.rooms.heartbeat);
  const startRun = useAction(api.agent.startRun);
  const resetRoom = useMutation(api.rooms.resetRoom);
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

  type FeedItem =
    | { kind: "message"; key: string; role: string; text: string; creationTime: number }
    | {
        kind: "interjection";
        key: string;
        authorName: string;
        text: string;
        creationTime: number;
      };

  const feed = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = [];
    for (const m of messages ?? []) {
      if (!m.text) continue;
      items.push({
        kind: "message",
        key: m.key,
        role: m.role,
        text: m.text,
        creationTime: m._creationTime,
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

  const scrollRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  useEffect(() => {
    if (!isAtBottom) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [feed, isAtBottom]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsAtBottom(distanceFromBottom < SCROLL_BOTTOM_THRESHOLD);
  }

  function jumpToBottom() {
    setIsAtBottom(true);
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
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

  const [identity, setIdentity] = useState<StoredIdentity | null>(() =>
    loadIdentity(roomId),
  );
  const [nameInput, setNameInput] = useState("");
  const [joining, setJoining] = useState(false);
  const [interjectionInput, setInterjectionInput] = useState("");
  const [sending, setSending] = useState(false);

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
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
        Loading…
      </div>
    );
  }

  if (room === null) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
        Room not found.
      </div>
    );
  }

  if (!identity) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm">
          <h1 className="mb-1 text-xl font-semibold">{room.title}</h1>
          <p className="mb-6 text-sm text-zinc-400">Enter a name to join.</p>
          <form onSubmit={handleJoin} className="flex flex-col gap-3">
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Your name"
              className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-500"
              required
              autoFocus
            />
            <button
              type="submit"
              disabled={joining}
              className="rounded-md bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50"
            >
              {joining ? "Joining…" : "Join room"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const artifactBody = artifact ? (
    <div className="prose prose-invert prose-sm max-w-none prose-pre:bg-zinc-900 prose-pre:text-zinc-200">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{artifact}</ReactMarkdown>
    </div>
  ) : (
    <span className="text-zinc-500">No draft yet.</span>
  );

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div>
          <h1 className="text-base font-semibold">{room.title}</h1>
          <span
            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${
              room.status === "running"
                ? "bg-emerald-900 text-emerald-300"
                : room.status === "error"
                  ? "bg-red-900 text-red-300"
                  : room.status === "done"
                    ? "bg-zinc-800 text-zinc-300"
                    : "bg-zinc-800 text-zinc-400"
            }`}
          >
            {room.status}
          </span>
        </div>
        {room.status === "idle" && (
          <button
            onClick={handleStart}
            disabled={starting}
            className="rounded-md bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50"
          >
            {starting ? "Starting…" : "Start"}
          </button>
        )}
        {(room.status === "done" || room.status === "error") && (
          <button
            onClick={handleNewRun}
            disabled={starting}
            className="rounded-md bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50"
          >
            New run
          </button>
        )}
      </header>

      <div className="flex flex-wrap gap-2 border-b border-zinc-800 px-4 py-3">
        {(participants ?? []).map((p) => (
          <div key={p._id} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: p.color }}
            />
            <span className="text-xs text-zinc-400">{p.name}</span>
          </div>
        ))}
      </div>

      {room.status === "error" && (
        <div className="flex items-center justify-between border-b border-red-900 bg-red-950 px-4 py-2 text-sm text-red-300">
          <span>Run hit an error.</span>
          <button
            onClick={handleStart}
            disabled={starting}
            className="rounded-md bg-red-800 px-3 py-1 text-xs font-medium text-red-100 disabled:opacity-50"
          >
            Retry
          </button>
        </div>
      )}

      {/* Mobile artifact pane: collapsible */}
      <details className="border-b border-zinc-800 md:hidden">
        <summary className="cursor-pointer select-none px-4 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Working draft
        </summary>
        <div className="max-h-64 overflow-y-auto px-4 py-3 text-sm">
          {artifactBody}
        </div>
      </details>

      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex flex-1 flex-col overflow-hidden">
          <main
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-6"
          >
            {feed.length === 0 && (
              <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
                {room.status === "idle"
                  ? "Waiting to start…"
                  : "Waiting for agent…"}
              </div>
            )}
            {feed.map((item) =>
              item.kind === "interjection" ? (
                <div
                  key={item.key}
                  className="self-start rounded-lg border-l-4 bg-zinc-900 px-3 py-2 text-sm"
                  style={{ borderColor: colorForName(item.authorName) }}
                >
                  <span
                    className="font-semibold"
                    style={{ color: colorForName(item.authorName) }}
                  >
                    {item.authorName}
                  </span>{" "}
                  <span className="text-zinc-400">steered:</span>{" "}
                  <span className="text-zinc-200">{item.text}</span>
                </div>
              ) : (
                <div key={item.key} className="whitespace-pre-wrap text-sm">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                    {item.role === "assistant" ? "Agent" : item.role}
                  </span>
                  {item.text}
                </div>
              ),
            )}
          </main>
          {!isAtBottom && (
            <button
              onClick={jumpToBottom}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-950 shadow-lg"
            >
              Jump to bottom
            </button>
          )}

          <form
            onSubmit={handleSendInterjection}
            className="border-t border-zinc-800 px-4 py-3"
          >
            <input
              value={interjectionInput}
              onChange={(e) => setInterjectionInput(e.target.value)}
              placeholder="Steer the agent…"
              disabled={sending}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-500 disabled:opacity-50"
            />
          </form>
        </div>

        {/* Desktop artifact pane */}
        <div className="hidden w-96 flex-col overflow-hidden border-l border-zinc-800 md:flex">
          <div className="border-b border-zinc-800 px-4 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Working draft
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 text-sm">
            {artifactBody}
          </div>
        </div>
      </div>
    </div>
  );
}
