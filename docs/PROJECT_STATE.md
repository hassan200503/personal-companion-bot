# Project State

Last updated: 2026-10-29
Brief: `docs/AGENT_BRIEF.md` (v3 master brief, adopted 2026-10-29). The previous handoff brief is archived at `docs/archive/AGENT_BRIEF-v1-handoff.md`.
Current milestone: M0/M1 transition, safety hardening first
Status: Baseline verified; critical trust-boundary gaps identified and being fixed

## What this project is

A Windows-first personal AI companion in `companion/`, built alongside the legacy WhatsApp persona bot in `src/`. The companion must greet its owner aloud, listen safely, act on the PC with observed results, remember only approved facts, stay the same character across providers, and never claim more than it verified.

The legacy bot is separate and must not be changed or restarted without the owner's approval. Never read `.env`, `auth/`, `data/style-log.jsonl` or `data/companion.db*`.

## Baseline (2026-10-29)

- Repository: `C:\Users\kkc36\Documents\personal-companion-bot`, branch `main`, clean before the v3 work.
- `git log --oneline -10` HEAD: `6244f85 Improve WhatsApp automation: search contact and send`.
- `npm.cmd run verify` from `companion/`: ESLint 0 errors / 6 warnings, TypeScript clean, 20 test files / 182 tests passed, Electron main/preload and Vite renderer built.
- `docs/AGENT_BRIEF.md` replaced with the v3 master brief; v1 archived.
- New registry `docs/REQUIREMENTS.md` grades every SC and K/V/O/W/M/P/L/S row from source inspection and the baseline run. New `docs/GAPS.md` records the fix order.
- The existing tests are mostly storage, onboarding, provider and memory unit tests. They do not cover OS control, greeting, voice safety, lock state, messaging verification, proactive or learning behavior.

## Already working (verified by tests or inspection)

- Encrypted SQLCipher-compatible storage, DPAPI-wrapped keys, Windows Credential Manager, migrations, snapshots, portable export/restore (20 storage tests).
- Resumable onboarding engine, system check and preset steps.
- Provider catalog, router with quota ledger/circuit breaker/fallback, mock provider and Gemini/OpenAI-compatible/Anthropic adapters (unit-tested; live accounts not tested).
- Conversation history persisted in SQLite with FTS5.
- Memory proposals, approval inbox, corrections and retrieval of approved memories.
- Tool registry blocks Class 4 registration; policy denies Class 4; audit log persists.
- Electron shell with sandboxed preload, session token on IPC, tray, pause/exit, update check, provider setup UI and chat UI.

## Critical gaps (from `docs/GAPS.md`)

1. `osTryCommand` grants all permissions and auto-confirms any tool that asks for confirmation, including `os.run`. Renderer text is treated as trusted.
2. WhatsApp send returns `sent: true` after SendKeys without observing a sent bubble; it is risk class 2 and unconfirmed.
3. `playMedia` scrapes YouTube search HTML and opens the first result, which the brief forbids.
4. No locked-screen, elevated-window or sensitive-window guard.
5. No greeting at app open.
6. No prompt compiler, Turn Decision contract, style normalizer or persona suite.
7. Continuous dictation auto-starts with an active chat; no wake word; mute is renderer-only.
8. No proactive engine, evidence thresholds, sensitive-trait guard or recipe system.

## Blocked

| Item | Reason | Unblock condition |
| --- | --- | --- |
| Wake word / always-listening default (SC6, V5) | G1 requires owner approval for on-device speech models and always-listening | Owner answers G1 |
| Vision fallback / screenshots leaving the PC (O8) | G2 | Owner answers G2 |
| Real WhatsApp sending and account risk (SC4, G3) | G3 | Owner answers G3 and provides a test account |
| UIA/elevated control beyond standard user (G4) | G4 | Owner answers G4 |
| Clean-machine install, GitHub CI, paid signing | Owner/VM/release work | Owner action |

## Next three tasks

1. Add the trust boundary: owner-intent source, locked-screen and denylist guard, no auto-confirm, Class 3 confirmation UI, reject untrusted content.
2. Fix WhatsApp honesty and media scraping; add tests.
3. Add Greeting Composer with offline TTS, pronunciation override, mute and quiet hours; wire it to app startup without delaying the window.

## Commands that work

Repository:

```text
git status --short
git log --oneline -10
node -v
npm -v
```

From `companion/`:

```text
npm install
npm run lint
npm run typecheck
npm run test
npm run build
npm run verify
npm start
npm run package
```

`npm run verify` is the required gate before a commit. `npm start` opens a window and does not exit by itself. `npm run package` writes to `apps/desktop/release/` and is unsigned.

## Known defects

- Six ESLint warnings (unused disable directives) in `apps/desktop/src/main/index.ts`.
- Installer unsigned, default icon, not installed on a clean machine; SmartScreen/uninstall/first-run unverified.
- CI has not run on GitHub because the repository has not been pushed.
- No end-to-end Electron test.
- Logger redaction does not cover secrets embedded in free-text messages or error strings.
- Runtime memory and idle CPU were not measured; no one-hour soak.
- Third-party MIT notices for bundled native packages are not in the package.
- Legacy WhatsApp bot health was not exercised this session.

## Open questions for the owner

- G1: approve on-device Windows speech/wake word and always-listening default, or keep push-to-talk only?
- G2: allow vision fallback/screenshots to leave the machine?
- G3: approve real WhatsApp sending and accept the account risk? Provide a test account.
- G4: approve any elevated/UIAccess control or code signing?
- G6/G7/G8 if a later task needs spending, policy changes or a destructive operation.

## Handover note

Start with `docs/AGENT_BRIEF.md`, then this file, `docs/REQUIREMENTS.md`, `docs/GAPS.md`, `docs/VERIFICATION_LOG.md` section 14, and `docs/DECISIONS/`. The code is in `companion/`; the v3 brief is stricter than the old matrix. Trust code and test output over notes. Do not mark a row PASS without a recorded command and observed output. Do not push.
