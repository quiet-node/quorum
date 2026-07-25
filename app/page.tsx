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

/** Rows rendered while the rooms rail is loading, so the rail never jumps. */
const SKELETON_ROWS = [0, 1, 2];

/** Room names cycled through the title field placeholder. */
const TITLE_SUGGESTIONS = [
  "Checkout bug war-room",
  "Pricing page sprint",
  "Launch-day incident",
  "Onboarding revamp",
  "API rate-limit fix",
  "Docs overhaul",
];

/** Task prompts cycled through the composer textarea placeholder. */
const TASK_SUGGESTIONS = [
  "Fix the flaky checkout webhook and draft the patch",
  "Plan tomorrow's launch, hour by hour",
  "Triage tonight's incident and draft the status page",
  "Rewrite the onboarding flow and list the tradeoffs",
  "Find why the API rate limiter drops retries",
];

/** How long each placeholder suggestion stays on screen. */
const ROTATION_MS = 3500;

/**
 * Cycles through placeholder suggestions on a fixed interval.
 *
 * Rotation is suspended while `paused` is true (field focused or non-empty) and
 * is skipped entirely when the user prefers reduced motion, in which case the
 * first suggestion stays put.
 */
function useRotatingPlaceholder(
  suggestions: readonly string[],
  paused: boolean,
): string {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % suggestions.length);
    }, ROTATION_MS);
    return () => window.clearInterval(timer);
  }, [paused, suggestions.length]);

  return suggestions[index];
}

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
  const agentModel = useQuery(api.rooms.getAgentModel, {});
  const [title, setTitle] = useState("");
  const [taskPrompt, setTaskPrompt] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [titleFocused, setTitleFocused] = useState(false);
  const [taskFocused, setTaskFocused] = useState(false);

  const titlePlaceholder = useRotatingPlaceholder(
    TITLE_SUGGESTIONS,
    titleFocused || title.length > 0,
  );
  const taskPlaceholder = useRotatingPlaceholder(
    TASK_SUGGESTIONS,
    taskFocused || taskPrompt.length > 0,
  );

  /** Fills the composer from a template chip. */
  function applyTemplate(template: (typeof TEMPLATES)[number]) {
    setTitle(template.title);
    setTaskPrompt(template.taskPrompt);
  }

  /** Creates a room and navigates into it. */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!taskPrompt.trim() || submitting) return;
    setSubmitting(true);
    setNotice(null);
    try {
      const roomId = await createRoom({
        title: title.trim() || "Untitled room",
        taskPrompt,
      });
      router.push(`/room/${roomId}`);
    } catch (err) {
      setNotice(convexErrorMessage(err, "Could not create the room."));
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
              setNotice(null);
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
              onFocus={() => setTaskFocused(true)}
              onBlur={() => setTaskFocused(false)}
              placeholder={taskPlaceholder}
              aria-label="Task description"
              rows={3}
              required
            />

            <div className="lp-title-row">
              <span className="lp-title-label">Room</span>
              <input
                className="lp-title-field"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onFocus={() => setTitleFocused(true)}
                onBlur={() => setTitleFocused(false)}
                placeholder={titlePlaceholder}
                aria-label="Room title"
              />
            </div>

            <div className="lp-bar">
              <span className="lp-model">{agentModel ?? " "}</span>
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

          {notice && <div className="lp-notice">{notice}</div>}

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
