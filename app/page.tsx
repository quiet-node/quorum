"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Home() {
  const router = useRouter();
  const createRoom = useMutation(api.rooms.createRoom);
  const [title, setTitle] = useState("");
  const [taskPrompt, setTaskPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !taskPrompt.trim() || submitting) return;
    setSubmitting(true);
    try {
      const roomId = await createRoom({ title, taskPrompt });
      router.push(`/room/${roomId}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <h1 className="mb-2 text-2xl font-semibold">War Room</h1>
        <p className="mb-8 text-sm text-zinc-400">
          Spin up a room, watch Claude work, steer it together.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="title" className="text-sm text-zinc-400">
              Room title
            </label>
            <input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Launch night"
              className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-500"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="taskPrompt" className="text-sm text-zinc-400">
              Task prompt
            </label>
            <textarea
              id="taskPrompt"
              value={taskPrompt}
              onChange={(e) => setTaskPrompt(e.target.value)}
              placeholder="What should the agent work on?"
              rows={4}
              className="resize-none rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-500"
              required
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-md bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create room"}
          </button>
        </form>
      </div>
    </div>
  );
}
