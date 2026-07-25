# Night Hack — Hackathon Build Constraints

This project is being built live at **Night Hack by Founders, Inc.** (3rd edition), a time-boxed hackathon at Founders, Inc. in Fort Mason, San Francisco. This file describes the event constraints and how to operate during the build. It intentionally does not describe the product itself — that context comes separately.

## Event facts

- Solo builder, no team.
- Check-in: 6:30 PM. Kickoff: 7:00 PM sharp.
- Pizza / mid-hack break: ~9:45 PM.
- **Final submission warning: 11:45 PM.** Real build budget is ~4h45m (7:00–11:45 PM), not a full 5 hours — treat 11:45 PM as the hard deadline, not midnight.
- Judging: 12:00–12:40 AM. Top 10 announced: 12:40 AM. Only the top 10 present live (12:45–1:10 AM). Winners announced 1:20 AM.
- Prizes are Anthropic API credits (1st $5,000 / 2nd $3,000 / 3rd $2,000).

## Hard rules from the organizers

- Build something completely new tonight, or add a substantial new capability to an existing project. If extending existing work, the prior state must be clearly disclosed — only work done during the event window is judged.
- **Live demos only. No slides.**
- **The demo cannot be localhost-only.** It must be reachable/runnable in a way that isn't just "trust me, it works on my laptop." Plan for this early, not at 11:40 PM.
- Top 10 teams must be ready to present immediately once announced — the working build has to stay in a demoable state throughout, not just at the very end.

## How to operate during the build

- **Favor speed and execution over deliberation.** This is a hard time box. Don't produce long planning docs or design write-ups — make a reasonable call, note the assumption inline, and keep moving.
- **Minimize clarifying questions.** Time is the scarce resource tonight. Only stop and ask when a decision is genuinely blocking or hard to reverse later; otherwise make the sensible call yourself and flag it.
- **Keep the build demoable at every step, not just at the end.** Never leave things mid-refactor or broken between commits — each commit should be a working state.
- **No gold-plating.** Skip abstractions, configuration options, edge-case handling, and polish that don't serve the live demo path. YAGNI, hard.
- **Testing:** quick sanity checks on the demo-critical path only. No exhaustive test suites — there isn't time, and it isn't what's being judged tonight.
- **Prioritize the one thing that has to work live** over completeness or cleanliness anywhere else in the codebase.

## Commit discipline

- **Commit continuously through the build.** Small, frequent commits as each piece lands working — not one giant commit at the end. This is also the safety net: if something breaks late at night, there's always a recent working commit to fall back to.
- Every commit uses `git commit -s` (signed off).
- Commit messages follow **Conventional Commits** format for the title (`feat:`, `fix:`, `chore:`, `docs:`, etc.).
- **Title line only.** No body, no bullets, no prose — just the conventional-commit title and the `Signed-off-by` trailer.

## Repo layout note

`hackathon-resources/` holds reference material for this event (schedule, sponsor info, credit/API details, etc.) pasted in ahead of the build. It's gitignored — it's context for Claude, not part of the shipped project.
