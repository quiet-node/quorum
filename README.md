# Quorum

One agent, a room full of people steering it.

Open a room, share the QR code, and everyone watches the same Claude run in real time and can interject mid-run. The agent acknowledges each steer by name and adjusts course. It reads a snapshot of this repo with its `listFiles` / `readFile` tools, and maintains a live working draft (unified diff plus a short PR description) in the right-hand workspace pane.

Built on Next.js, Convex, and `@convex-dev/agent`.

## Getting started

```bash
npm install
npm run dev
```

Convex functions live in `convex/`. The room UI is `app/room/[id]/page.tsx`.
