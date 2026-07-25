"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { useState } from "react";

const TEMPLATES = [
  {
    label: "Improve this codebase",
    title: "Coding session",
    taskPrompt:
      "Add a 'Copy room link' button to the room page header of this very app. Explore the codebase with your tools first, name the files you read, then draft the diff and PR description in the artifact.",
  },
  {
    label: "Plan a launch",
    title: "Launch plan",
    taskPrompt:
      "Draft a launch plan for a new product feature: goals, timeline, and key risks.",
  },
];

export default function Home() {
  const router = useRouter();
  const createRoom = useMutation(api.rooms.createRoom);
  const [title, setTitle] = useState("");
  const [taskPrompt, setTaskPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function applyTemplate(template: (typeof TEMPLATES)[number]) {
    setTitle(template.title);
    setTaskPrompt(template.taskPrompt);
  }

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
    <div className="landing">
      <div className="landing-col">
        <div className="landing-mark">quorum</div>
        <p className="landing-sub">
          One agent, a room full of people steering it. Open a room, share the
          QR, and everyone watches the same run in real time.
        </p>

        <span className="landing-label">Start from</span>
        <div className="tpl-row">
          {TEMPLATES.map((template, i) => (
            <button
              key={template.label}
              type="button"
              onClick={() => applyTemplate(template)}
              className={i === 0 ? "tpl primary" : "tpl"}
            >
              {template.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="field-block">
            <label className="landing-label" htmlFor="title">
              Room title
            </label>
            <input
              id="title"
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Launch night"
              required
            />
          </div>
          <div className="field-block">
            <label className="landing-label" htmlFor="taskPrompt">
              Task prompt
            </label>
            <textarea
              id="taskPrompt"
              className="input mono"
              value={taskPrompt}
              onChange={(e) => setTaskPrompt(e.target.value)}
              placeholder="What should the agent work on?"
              rows={4}
              style={{ resize: "none" }}
              required
            />
          </div>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Creating…" : "Open room"}
          </button>
        </form>

        <div className="landing-foot">claude-sonnet-5 · anyone can steer</div>
      </div>
    </div>
  );
}
