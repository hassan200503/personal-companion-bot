# Agent instructions

This repository hosts two things:

1. `src/`, `scripts/`, `data/` — the existing, working WhatsApp persona bot (Node.js, pm2). Treat it as legacy: do not change or delete its files unless the task explicitly concerns it. Never read `.env`, `auth/`, `data/style-log.jsonl`, or `data/companion.db*`; they contain secrets or personal data.
2. `docs/` and the future companion app — the Windows-first personal AI companion specified in `docs/MASTER_PROMPT.md`.

Before doing any companion work:

1. Read `docs/MASTER_PROMPT.md` completely.
2. Read `docs/PROJECT_STATE.md` and continue from the current milestone/task.
3. Follow the hard rules in Section 2 and stop at the decision gates in Section 14.
4. Update `docs/PROJECT_STATE.md`, `docs/REQUIREMENTS_MATRIX.md` and `docs/VERIFICATION_LOG.md` after every task.
5. Commit locally after each task; never push without owner approval.

Verified commands so far: `git status`, `node -v` (v24.16.0), `npm -v` (11.13.0). The companion's build/test commands do not exist yet; do not invent results.
