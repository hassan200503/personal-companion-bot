# Project State

Last updated: 2026-10-25
Current milestone: M1, Scaffold
Current task: record the M1 commit, then prepare the G2 encryption proposal
Status: M1 scaffold committed locally as `bb0815b`; local verification green; GitHub CI and clean-machine install remain unverified

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
- Obtained G1 approval on 2026-10-25: Electron + TypeScript; Windows 11 25H2/26H2 x64 baseline; isolated `companion/`; unsigned v1 with SHA256. Recorded in `docs/DECISIONS/ADR-0001-stack.md`.
- Created the M1 scaffold: `companion/` npm workspace, Electron 45.0.0 main/preload, React 19 renderer, strict TypeScript, ESLint, Vitest, Zod config schema, redacting logger, provider contracts, GitHub Actions workflow and electron-builder NSIS configuration.
- Ran `npm run verify`: ESLint clean, TypeScript clean, 2 test files and 9 tests passed, main/preload/renderer builds completed.
- Launched the app with `npm start`: the main process logged `desktop window created`; the command was stopped by the tool timeout because the window stays open.
- Built the unsigned NSIS installer: 115.9 MiB, unpacked 359.1 MiB across 73 files, SHA256 `CEE02741491F0BF7253E05879BC85E49FE2BBAED228FCC76A9228EC451165CDB`, Authenticode `NotSigned`.
- Wrote the M1 milestone report at `docs/MILESTONES/M1.md`.
- Committed the M1 scaffold and report locally as `bb0815b` (`M1: scaffold Electron companion with config, logger and CI`). Nothing has been pushed.

## In progress

- M1 scaffold and report are committed as `bb0815b`. CI execution on GitHub and a clean-machine install remain open.
- The G2 encryption proposal has not been written yet.

## Blocked

| Item | Reason | Unblock condition |
| --- | --- | --- |
| Gemini Kenya eligibility | Official available-regions page timed out twice | Owner tests AI Studio signup, or the page is fetched later |
| Mistral account verification details | Console returned a transport error; docs confirm the key page but not every signup step | Owner tests signup and records the steps |
| OpenRouter free allowance without purchase | FAQ and Terms conflict | Owner checks the dashboard/support; default to G4 |
| Exact free-tier limits | Providers expose these in their consoles | Measure from the account and response headers in M3 |
| Clean-machine install test | Installer built but not installed; no clean Windows VM used | Install and uninstall on a clean VM at M10/M11 and record evidence |
| Trusted signing | No free trusted route for a private `UNLICENSED` repo in Kenya; paid routes are G4 | Owner chooses unsigned v1, paid certificate, or open-sourcing |
| SQLCipher packaging | Not evaluated; G2 design decision | G2 prototype and ADR |
| UIA implementation | Requires a native adapter and G6 approval | Prototype after the core, then G6 |
| Voice capture | Deferred until after the core and G6 | Verify Windows speech options, then G6 |

## Next three tasks

1. Record the M1 commit hash and keep CI execution and clean-machine install as open verification items.
2. Draft the G2 proposal: encryption approach, key hierarchy, recovery and credential-storage adapter. Stop at G2 for owner approval before writing storage code.
3. After G2 approval: M2 migrations, encrypted persistence, credential adapter, backup and restore, with tests.

## Commands that work

Repository level:

```text
git status --short
git log --oneline -3
git ls-files
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

From `companion/apps/desktop/`:

```text
npx electron --version
```

`npm run verify` is the required gate before a commit. `npm start` opens a window and does not exit by itself. `npm run package` writes to `apps/desktop/release/` and is unsigned. The legacy bot was not started and its `test-companion` script was not run.

## Known defects

- The NSIS installer is unsigned, uses the default Electron icon and has not been installed. SmartScreen, installed size, uninstall and first-run behaviour are unverified.
- CI is written but has not run on GitHub because the repository has not been pushed.
- No Playwright/Electron end-to-end test exists; the IPC button was not clicked during the smoke launch.
- Logger redaction covers sensitive key names but not secrets embedded in free-text messages or error strings.
- Runtime memory was not measured. The main bundle is 743.4 KB because Zod and core are bundled, and source maps are included in the package.
- The legacy bot was not exercised in this session; its runtime health is unknown and unchanged.
- Some provider facts remain unverified and are marked in `docs/VERIFICATION_LOG.md` section 6. They must not be presented as confirmed.

## Open questions

- Providers: will the owner authorise Gemini or Mistral training-data use (G3), or pay $5 for OpenRouter (G4)? Default remains Groq only.
- Encryption: SQLCipher, an equivalent, or application-level encryption? This is G2.
- UIA: is a .NET helper acceptable if Electron's native path is insufficient? This is G6.
- Kenya data-protection obligations: legal review is outstanding; do not claim compliance.
- Clean-machine install and uninstall evidence: outstanding until M10/M11.

## Handover note

Read `docs/MASTER_PROMPT.md` completely, then this file, then the ADR and `docs/MILESTONES/M1.md`. G1 is approved and the M1 scaffold is committed as `bb0815b`; local verification is green. Prepare the G2 proposal and stop for owner approval before writing storage code. The legacy WhatsApp bot is separate and must remain untouched. The M0 documents are committed locally as `34f164a` and `14871e8`; do not push without owner approval. No companion secrets, provider accounts or spending exist. The M1 installer is unsigned and has not been installed.
