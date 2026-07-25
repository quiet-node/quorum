"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

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
      <header className="border-b border-zinc-800 px-4 py-3">
        <h1 className="text-base font-semibold">{room.title}</h1>
        <p className="text-xs text-zinc-500">{room.status}</p>
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

      <main className="flex flex-1 items-center justify-center px-4 py-8 text-sm text-zinc-500">
        Waiting for agent…
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
