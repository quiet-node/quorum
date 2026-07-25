# Quorum

**One live AI agent. Your whole team steering.**

https://github.com/user-attachments/assets/7f6c1089-9b91-4fe9-8026-583f16f5c4a7

AI agents are single-player today: one person prompts, everyone else reads a transcript afterwards. Quorum turns an agent session into a room. Your team joins in seconds with a QR code, no account and no login, and everyone watches the same Claude agent work in real time. Anyone can steer it mid-run by typing, and the agent acknowledges them by name and adjusts course.

## Try it

Live: **https://usequorum.vercel.app**

A real session with three people steering one agent: [open the room](https://usequorum.vercel.app/room/jd73y05nsc4eqezz7cmekf3jw98b7b1t). Type into it and the agent picks the conversation back up.

Note: the hosted demo runs on an event-scoped API key that may expire; run locally if the agent stops responding.

## What it does

- **Rooms, not chats.** Create a room with a task and the agent starts working immediately. Share the QR invite and anyone is in, watching the same live stream.
- **Live co-steering.** Messages land between the agent's working steps. The agent responds to the author by name and visibly changes course. Typing into a quiet room wakes the agent on its own.
- **Presence.** A participant rail shows who is in the room and their latest steer. People who leave stay visible, dimmed, so a session keeps its history.
- **Coding mode.** The agent explores a snapshot of this repository with `listFiles` and `readFile` tools, narrates what it reads, and drafts a real unified diff plus PR summary in a live workspace pane with Diff, Console, and syntax-highlighted Files tabs.
- **Safe to leave open.** Room creation is authless, protected by atomic server-side caps (3 concurrent runs globally, 10 runs per room), so a public link cannot burn unbounded credits.

## How it works

- **Next.js (App Router) on Vercel** renders the room UI: transcript, participant rail, workspace pane, QR invite.
- **Convex** is the reactive backend. Every client subscribes to the same queries, so joins, steers, and run status update on all screens at once. `@convex-dev/agent` persists the model output as streamed deltas, which is what makes one run watchable by any number of clients.
- **Provider-agnostic model.** The `AGENT_MODEL` environment variable picks both the model and the provider at run time: an Anthropic id (e.g. `claude-sonnet-5`, the default) routes through Anthropic Claude, and a Fireworks id (`accounts/fireworks/models/...`, e.g. `accounts/fireworks/models/minimax-m2p7`) routes through Fireworks AI.
- **The steering mechanic** is a hand-rolled queue: runs execute as a loop of short agent steps, and between steps the server drains unconsumed interjections into the next prompt as `INTERJECTION from <name>:` lines. A message sent into an idle or finished room schedules a fresh run automatically.

## Run locally

```bash
npm install
npx convex dev   # writes NEXT_PUBLIC_CONVEX_URL into .env.local
npm run dev
```

Environment, set on the Convex deployment:

- `AGENT_MODEL` (optional, defaults to `claude-sonnet-5`)
- `ANTHROPIC_API_KEY` (required when `AGENT_MODEL` is an Anthropic id)
- `FIREWORKS_API_KEY` (required when `AGENT_MODEL` is a Fireworks id, `accounts/fireworks/models/...`)

Coding mode needs the repository snapshot seeded into the `repoFiles` table: `node scripts/seed-repo.mjs`. Other room templates work without it.

## Roadmap

- Create a room without a prompt; the first message becomes the task
- Live repository sync instead of a static snapshot, and applying the drafted diff as a branch or PR
- Explicit hand-off and driver roles
- Parallel agent lanes within one room

## Origin

Quorum was built solo in one night at Night Hack by Founders, Inc. (San Francisco, 2026-07-24). The repository was empty at kickoff; the first commit contains only configuration, and every line of the product was written during the event window. Sponsors used: [Anthropic](https://www.anthropic.com) (Claude) and [Convex](https://convex.dev).
