"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { convexErrorMessage } from "@/app/convexError";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
  {
    label: "Triage an incident",
    title: "Incident triage",
    taskPrompt:
      "Triage a production incident: establish a timeline, list the leading hypotheses, and propose the next three diagnostic steps.",
  },
];

/** Where the creation code is remembered so it only has to be typed once. */
const CODE_STORAGE_KEY = "quorum:createCode";

/** Rows rendered while the rooms rail is loading, so the rail never jumps. */
const SKELETON_ROWS = [0, 1, 2];

type RecentRoom = {
  _id: string;
  title: string;
  status: "idle" | "running" | "error" | "done";
  createdAt: number;
  people: number;
};

/** Formats a creation timestamp as a compact age such as "18m" or "3h". */
function ago(timestamp: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export default function Home() {
  const router = useRouter();
  const createRoom = useMutation(api.rooms.createRoom);
  const rooms = useQuery(api.rooms.listRecentRooms, {}) as
    | RecentRoom[]
    | undefined;
  const [title, setTitle] = useState("");
  const [taskPrompt, setTaskPrompt] = useState("");
  const [createCode, setCreateCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Read after mount rather than during render so the server and client markup
  // match on first paint.
  useEffect(() => {
    const saved = window.localStorage.getItem(CODE_STORAGE_KEY);
    if (saved) setCreateCode(saved);
  }, []);

  /** Fills the composer from a template chip. */
  function applyTemplate(template: (typeof TEMPLATES)[number]) {
    setTitle(template.title);
    setTaskPrompt(template.taskPrompt);
  }

  /**
   * Creates a room and navigates into it.
   *
   * The creation code is only remembered once the server has accepted it, so a
   * wrong code never gets cached and replayed.
   */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!taskPrompt.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const roomId = await createRoom({
        title: title.trim() || "Untitled room",
        taskPrompt,
        createCode,
      });
      window.localStorage.setItem(CODE_STORAGE_KEY, createCode);
      router.push(`/room/${roomId}`);
    } catch (err) {
      setError(convexErrorMessage(err, "Could not create the room."));
      setSubmitting(false);
    }
  }

  const runningCount = (rooms ?? []).filter(
    (r) => r.status === "running",
  ).length;
  const recent = (rooms ?? []).filter((r) => r.status !== "running").slice(0, 2);

  return (
    <div className="lp-app">
      <div className="lp-mobilebar">
        <span className="wordmark">quorum</span>
        <span className="lp-count-chip">
          <i className="dot dot-em" /> {runningCount} running
        </span>
      </div>

      <aside className="lp-side">
        <div className="lp-side-top">
          <span className="wordmark">quorum</span>
        </div>

        <div className="lp-side-new">
          <button
            type="button"
            className="lp-btn-new"
            onClick={() => {
              setTitle("");
              setTaskPrompt("");
              setError(null);
            }}
          >
            <span className="lp-plus">+</span> New room
          </button>
        </div>

        <div className="lp-side-label">Rooms</div>
        <div className="lp-side-scroll">
          {rooms === undefined
            ? SKELETON_ROWS.map((i) => (
                <div className="lp-room lp-room-skeleton" key={i}>
                  <div className="lp-skel-line" />
                  <div className="lp-skel-meta" />
                </div>
              ))
            : rooms.map((room) => (
                <div
                  className="lp-room"
                  key={room._id}
                  role="link"
                  tabIndex={0}
                  onClick={() => router.push(`/room/${room._id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") router.push(`/room/${room._id}`);
                  }}
                >
                  <div className="lp-room-line">
                    <span className="lp-room-name">{room.title}</span>
                    <span
                      className={
                        room.status === "running"
                          ? "lp-status running"
                          : "lp-status"
                      }
                    >
                      <i
                        className={
                          room.status === "running"
                            ? "dot dot-em"
                            : "dot dot-idle"
                        }
                      />{" "}
                      {room.status}
                    </span>
                  </div>
                  <div className="lp-room-meta">
                    {room.people} in room · {ago(room.createdAt)} ago
                  </div>
                </div>
              ))}
        </div>

        <div className="lp-side-foot">
          {rooms === undefined
            ? "loading…"
            : `${rooms.length} rooms · ${runningCount} running`}
        </div>
      </aside>

      <main className="lp-main">
        <div className="lp-stack">
          <h1 className="lp-greet">
            Good evening{" "}
            <span className="lp-soft">— what are we building together?</span>
          </h1>
          <p className="lp-sub">
            Create a room. Your team joins by QR and steers live.
          </p>

          <form className="lp-composer" onSubmit={handleSubmit}>
            <textarea
              className="lp-task"
              value={taskPrompt}
              onChange={(e) => setTaskPrompt(e.target.value)}
              placeholder="Describe the task — your team can steer once it's running"
              rows={3}
              required
            />

            <div className="lp-title-row">
              <span className="lp-title-label">Room</span>
              <input
                className="lp-title-field"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Untitled room"
                aria-label="Room title"
              />
              <span className="lp-title-label">Code</span>
              <input
                className="lp-code-field"
                type="password"
                value={createCode}
                onChange={(e) => setCreateCode(e.target.value)}
                placeholder="creation code"
                aria-label="Creation code"
                autoComplete="off"
                required
              />
            </div>

            <div className="lp-bar">
              <span className="lp-model">claude-sonnet-5</span>
              <span className="lp-steer-note">anyone in the room can steer</span>
              <button
                type="submit"
                className="lp-btn-start"
                disabled={submitting}
              >
                {submitting ? "Starting…" : "Start"}
              </button>
            </div>
          </form>

          {error && <div className="lp-error">{error}</div>}

          <div className="lp-chips">
            {TEMPLATES.map((template) => (
              <button
                key={template.label}
                type="button"
                className="lp-chip"
                onClick={() => applyTemplate(template)}
              >
                {template.label}
              </button>
            ))}
          </div>

          <div className="lp-recent">
            <span className="lp-recent-label">Recent</span>
            {recent.map((room) => (
              <button
                key={room._id}
                type="button"
                className="lp-recent-item"
                onClick={() => router.push(`/room/${room._id}`)}
              >
                {room.title} <span className="lp-ago">{ago(room.createdAt)}</span>
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
