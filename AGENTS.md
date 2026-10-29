# Agent instructions

Repository: `personal-companion-bot` (renamed from `whatsapp-persona-bot` on 2026-10-26; the GitHub repo was renamed too).

This repository hosts two things:

1. `src/`, `scripts/`, `data/` — the existing, working WhatsApp persona bot (Node.js, pm2). Treat it as legacy: do not change or delete its files unless the task explicitly concerns it. Never read `.env`, `auth/`, `data/style-log.jsonl`, or `data/companion.db*`; they contain secrets or personal data.
2. `docs/` and `companion/` — the Windows-first personal AI companion specified in `docs/AGENT_BRIEF.md`. That brief supersedes `docs/MASTER_PROMPT.md` wherever they disagree.

Before doing any companion work:

1. Read `docs/AGENT_BRIEF.md` completely (v3 master brief, adopted 2026-10-29).
2. Read `docs/PROJECT_STATE.md` and continue from the current milestone/task.
3. Follow the hard rules in Section 3 and stop at the decision gates in Section 13.
4. Update `docs/PROJECT_STATE.md`, `docs/REQUIREMENTS.md`, `docs/GAPS.md` and `docs/VERIFICATION_LOG.md` after every task. The earlier catalog remains in `docs/REQUIREMENTS_MATRIX.md`.
5. Commit locally after each task; never push without owner approval.

Verified commands: `git status`, `node -v` (v24.16.0), `npm -v` (11.13.0), and from `companion/`: `npm install`, `npm run verify`, `npm start`, `npm run package`. Read `docs/PROJECT_STATE.md` for the current verified status; do not invent results.

Project-level permissions live in `opencode.json`: edits are allowed inside the repo; shell is limited to build/test/lint, local git inspection/add/commit/branch, and installing declared dependencies; everything else asks the owner. Commit locally after each task. Never push without explicit owner approval.
