# Project State

Last updated: 2026-10-25
Current milestone: M0, Discovery and verification
Current task: finish the M0 documents and obtain owner approval of the stack ADR at G1
Status: waiting on the owner; no companion code has been written

## What this project is

A Windows-first personal AI companion built alongside the existing WhatsApp persona bot. The governing requirements are in `docs/MASTER_PROMPT.md`. The companion must remember only what the owner approves, adapt gradually, talk by text and later voice, and perform permissioned actions on the PC. It is not sentient, infallible or able to control everything.

The existing WhatsApp bot is legacy. It must keep working. Do not modify or delete its files, do not read `.env`, `auth/`, `data/style-log.jsonl` or `data/companion.db*`, and do not restart its pm2 process without permission.

## Completed

- Inspected the repository: branch `main`, HEAD `f0ec874`, Node v24.16.0, npm 11.13.0, a working Node WhatsApp bot with companion mode, no desktop app, no test/lint/build harness for the companion.
- Recorded existing companion facts: `node:sqlite` with WAL and tables `facts`, `reminders`, `journal`, `conversation_log`; Gemini primary with Groq fallback; Groq Whisper STT and Orpheus TTS; reminders every five minutes; nightly reflection at 23:55.
- Created `docs/MASTER_PROMPT.md`, `AGENTS.md`, `opencode.json`, `docs/VERIFICATION_LOG.md`, `docs/REQUIREMENTS_MATRIX.md`, `docs/PROJECT_STATE.md`, `docs/DECISIONS/ADR-0001-stack.md` and `docs/android-v2-notes.md`.
- Verified Windows startup mechanisms, notification area, UIA, Credential Manager, DPAPI, Electron tray/login/safeStorage, Tauri prerequisites/tray/Stronghold/installers, WebView2 distribution, WPF and .NET Windows support, Windows lifecycle and .NET speech APIs.
- Verified provider terms, limits, data handling and available signup/key documentation for Groq, Gemini, OpenRouter, Cerebras and Mistral, and recorded which items remain open.
- Verified code-signing options: unsigned SmartScreen behaviour, Azure Artifact Signing price and availability, OV/EV prices, SignPath Foundation conditions and the private-repo blocker.
- Wrote the G1 ADR recommending Electron + TypeScript, Windows 11 25H2/26H2 x64 as the baseline, an isolated `companion/` layout, and an unsigned v1 with SHA256.
- Committed the M0 documents locally as `34f164a` (`M0: record verification findings and propose Electron stack`). Nothing has been pushed.

## In progress

- M0 exit: the verification log is filled and open items are marked; the ADR is drafted. Owner approval at G1 is outstanding.
- Local commit `34f164a` contains the M0 documents. A small follow-up commit records this state.

## Blocked

| Item | Reason | Unblock condition |
| --- | --- | --- |
| G1 stack approval | Owner decision required by the master prompt | Owner approves or rejects ADR-0001 |
| Gemini Kenya eligibility | Official available-regions page timed out twice | Owner tests AI Studio signup, or the page is fetched later |
| Mistral account verification details | Console returned a transport error; docs confirm the key page but not every signup step | Owner tests signup and records the steps |
| OpenRouter free allowance without purchase | FAQ and Terms conflict | Owner checks the dashboard/support; default to G4 |
| Exact free-tier limits | Providers expose these in their consoles | Measure from the account and response headers in M3 |
| Installer/footprint numbers | No build exists | Measure in M1 and M10 |
| Trusted signing | No free trusted route for a private `UNLICENSED` repo in Kenya; paid routes are G4 | Owner chooses unsigned v1, paid certificate, or open-sourcing |
| SQLCipher packaging | Not evaluated; G2 design decision | G2 prototype and ADR |
| UIA implementation | Requires a native adapter and G6 approval | Prototype after the core, then G6 |
| Voice capture | Deferred until after the core and G6 | Verify Windows speech options, then G6 |

## Next three tasks

1. Owner reviews `docs/DECISIONS/ADR-0001-stack.md` and answers the four G1 questions. Do not scaffold before approval.
2. On approval: M1 scaffold under `companion/` with npm workspaces, Electron main/preload/renderer, TypeScript strict, ESLint, Vitest, Playwright, GitHub Actions, redacting logger, config schema and a measured install footprint. Write the M1 milestone report.
3. Start M2 storage and secrets: propose the encryption design and key hierarchy at G2 before implementing SQLCipher or an equivalent; then migrations, encrypted persistence, credential adapter, backup and restore.

## Commands that work

These are the project commands used successfully so far:

```text
git status --short
git log --oneline -3
git ls-files
node -v
npm -v
```

There is no companion build, test, lint or typecheck command yet. Do not invent one. The legacy bot was not started and its `test-companion` script was not run.

## Known defects

- No companion code exists, so there are no companion defects yet.
- The legacy bot was not exercised in this session; its runtime health is unknown and unchanged.
- Some provider facts remain unverified and are marked in `docs/VERIFICATION_LOG.md` section 6. They must not be presented as confirmed.

## Open questions

- G1: Electron, Tauri or .NET? The ADR recommends Electron.
- Minimum OS: approve Windows 11 25H2/26H2 x64, with Windows 10 LTSC/Enterprise best-effort and ARM64 after x64?
- Repository layout: approve the isolated `companion/` directory so the legacy bot and pm2 setup stay untouched?
- Distribution: approve an unsigned v1 installer with SHA256 and a documented SmartScreen warning, deferring signing to M10 and spend to G4?
- Providers: will the owner authorise Gemini or Mistral training-data use (G3), or pay $5 for OpenRouter (G4)? Default remains Groq only.
- Encryption: SQLCipher, an equivalent, or application-level encryption? This is G2.
- UIA: is a .NET helper acceptable if Electron's native path is insufficient? This is G6.
- Kenya data-protection obligations: legal review is outstanding; do not claim compliance.

## Handover note

Read `docs/MASTER_PROMPT.md` completely, then this file, then the ADR. The next agent should not scaffold anything until the owner answers G1. The legacy WhatsApp bot is separate and must remain untouched. The M0 documents are committed locally as `34f164a`; do not push without owner approval. If the session ends before G1, the state is complete: no companion code, no generated secrets, no provider accounts and no spending.
