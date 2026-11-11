# Agent instructions

Gatekeeper is a playable demo of the Solana TSV venue. The venue's programs
and services live in [solana-tsv](https://github.com/Moonsong-Labs/solana-tsv);
this repository holds only the game, and everything in it is simulated in the
browser.

- Before doing anything, read `AGENTS.local.md` if present, then `README.md`.
- Use `mise.toml`'s pinned tools: `mise run <task>` or `mise exec -- <command>`.
- Run `mise run check` before handoff; never claim unrun checks passed.
- Store results persistently; use `/tmp` only when the user explicitly asks.
- Credit the user on commits and GitHub comments/issues/PRs. Identify them from
  the thread title's starting name; ask if unclear. Use verified name/email in
  `Co-authored-by: Name <email>` trailers and equivalent GitHub body attribution;
  ask for missing details.
- `src/game/sim/rules.ts` copies the venue's check order and refusal codes.
  Change it only to follow solana-tsv, and keep every standing tag (live, in
  review, planned) true.
- Commit/push only when explicitly asked. Handoffs: briefly state what, why,
  and verification.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
