# Quorum

**One live AI agent. Your whole team steering.**

Agent sessions are single-player today: one person prompts, everyone else reads the transcript afterwards. Quorum turns a run into a room. Scan a QR code, type a name, and you are in, no account and no login, watching the same Claude agent work token by token and steering it mid-run by typing an interjection the agent acknowledges by name.

The demo task points the agent at a snapshot of this very repo. It explores with its own `listFiles` / `readFile` tools, narrates which files it is reading, and maintains a live working draft (a short PR description on top of a real unified diff) while the room redirects it.

## Live demo

https://usequorum.vercel.app

No login required. Open a room, share the QR, start a run. The Anthropic key behind it is event-scoped and may stop working roughly 24 hours after the event.

## Built tonight at Night Hack

Night Hack by Founders, Inc., Fort Mason, San Francisco, 2026-07-24, solo build.

The repository was empty at kickoff. The first commit (`4177efc`, 7:22 PM, during the event window) contains only a `.gitignore` and the event constraints file, no product code. Every line of Quorum was written between kickoff and the submission deadline. The commit history is the receipt.

## How it works

- **Next.js 16 (App Router) on Vercel** for the room UI: live transcript, participant rail, artifact pane, QR invite.
- **Convex** as the reactive backend. Every client subscribes to the same queries, so joins, interjections, run status, and the working draft land on every screen at once with no socket code.
- **`@convex-dev/agent`** streams the model output as saved deltas, which is what makes one run watchable by many clients simultaneously rather than only by the browser that started it.
- **Anthropic Claude** for the agent. The model id is read from `AGENT_MODEL` at run time (no redeploy to change it) and defaults to `claude-sonnet-5`.
- **Hand-rolled steering queue.** The run is a loop of short agent steps. Between steps the server drains the unconsumed interjections for the room, prepends them to the next prompt as `INTERJECTION from <name>:` lines, and marks them consumed. That gap between steps is the co-steering mechanic.
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
