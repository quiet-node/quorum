"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useUIMessages } from "@convex-dev/agent/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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

export default function RoomPage() {
  const params = useParams<{ id: string }>();
  const roomId = params.id as Id<"rooms">;

  const room = useQuery(api.rooms.getRoom, { roomId });
  const participants = useQuery(api.rooms.listParticipants, { roomId });
  const joinRoom = useMutation(api.rooms.joinRoom);
  const heartbeat = useMutation(api.rooms.heartbeat);
  const startRun = useAction(api.agent.startRun);
  const resetRoom = useMutation(api.rooms.resetRoom);
  const [starting, setStarting] = useState(false);

  const { results: messages } = useUIMessages(
    api.rooms.listThreadMessages,
    room?.threadId ? { threadId: room.threadId } : "skip",
    { initialNumItems: 50, stream: true },
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

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

      <main
        ref={scrollRef}
        className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-6"
      >
        {(!messages || messages.length === 0) && (
          <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
            {room.status === "idle"
              ? "Waiting to start…"
              : "Waiting for agent…"}
          </div>
        )}
        {messages?.map((m) => (
          <div key={m.key} className="whitespace-pre-wrap text-sm">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
              {m.role === "assistant" ? "Agent" : m.role}
            </span>
            {m.text}
          </div>
        ))}
      </main>

      <div className="border-t border-zinc-800 px-4 py-3">
        <input
          disabled
          placeholder="Interjections coming soon…"
          className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-500 outline-none disabled:cursor-not-allowed"
        />
      </div>
    </div>
  );
}
