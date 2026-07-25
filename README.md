# Quorum

**One live AI agent. Your whole team steering.**

Agent sessions are single-player today: one person prompts, everyone else reads the transcript afterwards. Quorum turns a run into a room: scan a QR code, type a name, no account and no login, and you are watching the same Claude agent work live and steering it mid-run by typing an interjection it acknowledges by name. The demo task points the agent at a snapshot of this very repo, where it explores with its own `listFiles` / `readFile` tools and drafts a real unified diff while the room redirects it.

## Demo video

https://github.com/user-attachments/assets/7f6c1089-9b91-4fe9-8026-583f16f5c4a7

## Live demo

https://usequorum.vercel.app

No login required. Create a room and the agent starts working on it immediately; share the QR and anyone can steer. Typing into a quiet room wakes the agent by itself, no start button needed. The Anthropic key behind it is event-scoped and may stop working roughly 24 hours after the event.

A session from tonight with three humans steering one agent: https://usequorum.vercel.app/room/jd73y05nsc4eqezz7cmekf3jw98b7b1t

## Built tonight at Night Hack

Night Hack by Founders, Inc., Fort Mason, San Francisco, 2026-07-24, solo build.

The repository was empty at kickoff. The first commit (`4177efc`, 7:22 PM, during the event window) contains only a `.gitignore` and the event constraints file, no product code. Every line of Quorum was written between kickoff and the submission deadline. The commit history is the receipt.

## How it works

- **Next.js 16 (App Router) on Vercel** for the room UI: live transcript, participant rail, artifact pane, QR invite.
- **Convex** as the reactive backend. Every client subscribes to the same queries, so joins, interjections, and run status land on every screen at once with no socket code, and `@convex-dev/agent` saves the model output as streamed deltas, which is what makes one run watchable by many clients at the same time rather than only by the browser that started it.
- **Anthropic Claude** for the agent. The model id is read from `AGENT_MODEL` at run time (no redeploy to change it) and defaults to `claude-sonnet-5`.
- **Hand-rolled steering queue.** The run is a loop of short agent steps. Between steps the server drains the unconsumed interjections for the room, prepends them to the next prompt as `INTERJECTION from <name>:` lines, and marks them consumed. That gap between steps is the co-steering mechanic. A message sent into an idle or finished room schedules a fresh run on its own, so the agent always answers.
- **Server-side spend caps.** One transactional mutation (`reserveRun`) enforces 3 concurrent runs globally and 10 runs per room before flipping a room to running, so two racing clients cannot both slip past the cap. Stale slots expire so an abandoned run cannot hold capacity forever.

## Run locally

```bash
npm install
npx convex dev   # writes NEXT_PUBLIC_CONVEX_URL into .env.local
npm run dev
```

Environment:

- `ANTHROPIC_API_KEY` on the Convex deployment (set it in the Convex dashboard, not in `.env.local`). Required.
- `AGENT_MODEL` on the Convex deployment. Optional, defaults to `claude-sonnet-5`.

The codebase-editing demo also needs the repo snapshot in the `repoFiles` table: `node scripts/seed-repo.mjs` collects `app/`, `convex/`, and a few root files and seeds them into the production deployment (it runs `convex run ... --prod`). Other room templates (launch plan, incident triage) work without it.

## Credits

Sponsors used tonight: [Anthropic](https://www.anthropic.com) (Claude), [Convex](https://convex.dev) (reactive backend and `@convex-dev/agent`).
