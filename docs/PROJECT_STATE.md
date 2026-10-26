# Project State

Last updated: 2026-10-26
Current milestone: M11, Hardening (in progress)
Current task: M4 provider gateway thin slice complete; 180 tests passing
Status: Provider failover and configurable-provider thin slice complete; lint/typecheck/180 tests/build clean

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
- Committed the M1 state record as `a35d58d` (`M1: record local commit in project state`). Nothing has been pushed.
- Researched storage and key protection for G2: SQLCipher Community and Commercial licensing, SQLite3MultipleCiphers, `better-sqlite3-multiple-ciphers` 13.0.3, Electron async `safeStorage`/DPAPI, Windows Credential Manager and `@github/keytar`. Evidence is D-01 to D-06 in `docs/VERIFICATION_LOG.md`.
- Wrote `docs/DECISIONS/ADR-0002-storage-encryption.md` proposing a SQLCipher-compatible encrypted database, a DPAPI-wrapped random database key, Windows Credential Manager for provider keys, passphrase backups, and prototype gates.
- Wrote the initial `docs/THREAT_MODEL.md` covering local storage, provider egress, backup exposure, same-user malware and future tool risks.
- Committed the G2 proposal and threat model locally as `57aee52` (`G2: propose encrypted storage and key protection`). Nothing has been pushed.
- Obtained G2 approval on 2026-10-25 for all four questions: the proposed SQLCipher-compatible package, the DPAPI-wrapped random database key with Credential Manager provider keys and no escrow, passphrase backups, and the eight prototype gates. Recorded in ADR-0002.
- Installed `better-sqlite3-multiple-ciphers` 13.0.3 and `@github/keytar` 7.10.6; `npm install` added 3 packages with 0 vulnerabilities.
- Ran all eight G2 prototype gates successfully on Windows with Node 22.23.4 and Electron 45.0.0. Evidence is in `docs/VERIFICATION_LOG.md` section 9.
- Node 22 gate: `cipher=sqlcipher`, `legacy=0`, `kdfIter=256000`, `pageSize=4096`, `journal_mode=wal`, `temp_store=2`, `foreign_keys=1`; FTS5, wrong-key rejection, restart, failed-migration rollback, `VACUUM INTO` backup, portable export/restore/rekey, wrong-passphrase rejection, tamper rejection, no temp files after a 20,000-row sort, and a raw key scan all passed.
- Found that `better-sqlite3`'s `backup()` API rejects encrypted source/target databases in 13.0.3. `sqlcipher_export` was absent and `serialize` failed; `VACUUM INTO` works and is now the documented snapshot path. ADR-0002 was amended.
- Electron gate: async `safeStorage` was available; a 74-byte DPAPI-wrapped key was unwrapped by a sequential second process; keytar set/get/list/delete passed; a packaged Credential Manager round trip passed.
- Packaging gate: electron-builder packaged only the win32-x64 `.node` files; the all-prebuild build shrank from 412,831,026 to 378,963,727 unpacked bytes after pruning. The final unsigned NSIS installer is 122,573,738 bytes (116.9 MiB), SHA256 `F24B0C22EA23E24ED8ACD0653FA31666D71BF6F357EE48FC9601BF5383E5D577`, `NotSigned`; the final unpacked app is 379,071,247 bytes across 103 files.
- Removed the temporary packaged probe from the production main process after capturing evidence. `npm run verify` passed after cleanup: ESLint clean, TypeScript clean, 2 test files / 9 tests, main bundle 743.4 KB. A normal packaged launch produced 4 responding processes and left none running.
- Committed the G2 gate evidence, native dependencies, packaging configuration and documentation locally as `cbd31b5` (`G2: pass storage prototypes and record gate evidence`). Nothing has been pushed.
- Implemented M2 production storage: encrypted database with SQLCipher-compatible encryption, DPAPI-wrapped random database keys, Windows Credential Manager adapter for provider keys, versioned schema migrations with rollback, FTS5 full-text search indexes for messages and memories, local snapshots via `VACUUM INTO`, portable export/import with passphrase-based encryption, and comprehensive tests. All 28 tests passing (9 database, 5 credentials, 5 backup, 4 logger, 5 config). No secrets in logs, exports or temp files verified.
- Committed M2 storage implementation locally as `b188202` (`M2: implement encrypted storage with database, credentials, backup and migrations`). Nothing has been pushed.
- Implemented M3 onboarding engine core: SetupStep interface with detect/explain/run/verify/repair/rollback methods, DefaultStepRegistry with topological dependency ordering and cycle detection, DefaultOnboardingEngine state machine with idempotency (detect before run), resumability after crashes (persisted state), Setup Doctor repair mode, cancellation support via AbortSignal. Created concrete steps: SystemCheckStep (Windows platform/version/disk/memory validation) and PresetChoiceStep (Recommended/Privacy-first/Minimal user presets). Integrated with M2 encrypted storage via DatabaseOnboardingStorage and migration v2 (onboarding_state table). All 80 tests passing (56 onboarding: 9 registry + 13 engine + 9 system-check + 16 preset-choice + 9 storage; 24 storage/config/logger from M2).
- Committed M3 onboarding engine in 4 commits: `d475665` (contracts and registry), `c48e9fc` (state machine), `aa25fa2` (concrete steps), `223053c` (storage integration). Nothing has been pushed.
- M3 exit criteria met and verified: idempotency test passes (does not re-run satisfied steps), resume test passes (resumes from incomplete step after state restore), repair test passes (Setup Doctor fixes broken steps).

## In progress

- M4 provider gateway hardening is complete for this thin slice: Gemini REST support, free-tier-oriented catalog defaults, structured HTTP error mapping, per-provider model routing, and custom HTTPS OpenAI-compatible provider onboarding are implemented.

## Latest task evidence

- `npm.cmd run verify` from `companion/` passed outside the restricted sandbox: ESLint clean, TypeScript clean, 20 test files / 180 tests passed, Electron main/preload bundles and Vite renderer build completed.
- The first sandboxed build attempt failed only because esbuild could not traverse the workspace junction; rerunning with approved elevated build execution passed.
- Official provider research rechecked 2026-10-26: Gemini pricing/free-tier page, Gemini model page, Groq rate-limit page, and Mistral free-mode/API-limit pages. Exact quotas remain account-specific and are not hard-coded.
- Provider defaults now use Gemini `gemini-2.5-flash-lite`, Groq free developer models, and an OpenRouter model explicitly marked `:free`; free availability remains subject to provider account/region rules.
- Custom providers require HTTPS and are encoded without the API key in the Credential Manager target name; the API key itself remains in Windows Credential Manager.

## Blocked

| Item | Reason | Unblock condition |
| --- | --- | --- |
| Gemini Kenya eligibility | Official available-regions page timed out twice | Owner tests AI Studio signup, or the page is fetched later |
| Mistral account verification details | Console returned a transport error; docs confirm the key page but not every signup step | Owner tests signup and records the steps |
| OpenRouter free allowance without purchase | FAQ and Terms conflict | Owner checks the dashboard/support; default to G4 |
| Exact free-tier limits | Providers expose these in their consoles | Measure from the account and response headers in M3 |
| Clean-machine install test | Installer built but not installed; no clean Windows VM used | Install and uninstall on a clean VM at M10/M11 and record evidence |
| Trusted signing | No free trusted route for a private `UNLICENSED` repo in Kenya; paid routes are G4 | Owner chooses unsigned v1, paid certificate, or open-sourcing |
| UIA implementation | Requires a native adapter and G6 approval | Prototype after the core, then G6 |
| Voice capture | Deferred until after the core and G6 | Verify Windows speech options, then G6 |

## Next three tasks

1. Design ChatProvider interface with capabilities(), healthCheck(), complete(), stream() methods and error taxonomy (auth_invalid, rate_limited, quota_exhausted, region_blocked, etc).
2. Create provider catalog structure with onboarding modes: Mode A (OAuth PKCE for OpenRouter), Mode B (assisted with clipboard paste), Mode C (manual guide).
3. Implement router with quota ledger (from observed headers and 429s), circuit breakers, and fallback logic.

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

- The NSIS installer is unsigned, uses the default Electron icon and has not been installed. The current installer is 116.9 MiB; SmartScreen, installed size, uninstall and first-run behaviour are unverified.
- CI is written but has not run on GitHub because the repository has not been pushed.
- No Playwright/Electron end-to-end test exists; the IPC button was not clicked during the smoke launch.
- Logger redaction covers sensitive key names but not secrets embedded in free-text messages or error strings.
- Runtime memory was not measured. The main bundle is 743.4 KB because Zod and core are bundled, and source maps are included in the package.
- The legacy bot was not exercised in this session; its runtime health is unknown and unchanged.
- Some provider facts remain unverified and are marked in `docs/VERIFICATION_LOG.md` section 6. They must not be presented as confirmed.
- No production encrypted storage, credential adapter, migration, backup or restore code exists yet; the G2 prototype gates passed on 2026-10-25, but they used temporary probes rather than production modules.
- `better-sqlite3-multiple-ciphers` 13.0.3, `@github/keytar` 7.10.6, FTS5, WAL, temp behaviour and packaged native modules passed their prototypes. The package's `backup()` API is unusable for encrypted source/target; `VACUUM INTO` is the snapshot path. The page size is 4096 and must be pinned in production code.
- Third-party MIT notices for the bundled native packages are not yet included in the packaged app; add them before distribution.
- The threat model is an initial draft and does not yet cover tools, UIA, voice or update signing in depth.

## Open questions

- Providers: will the owner authorise Gemini or Mistral training-data use (G3), or pay $5 for OpenRouter (G4)? Default remains Groq only.
- UIA: is a .NET helper acceptable if Electron's native path is insufficient? This is G6.
- Kenya data-protection obligations: legal review is outstanding; do not claim compliance.
- Clean-machine install and uninstall evidence: outstanding until M10/M11.

## Handover note

Read `docs/MASTER_PROMPT.md` completely, then this file, then `docs/DECISIONS/ADR-0002-storage-encryption.md`, `docs/THREAT_MODEL.md` and `docs/MILESTONES/M1.md`. G1 and G2 are approved, and all eight G2 prototype gates passed on 2026-10-25; evidence is in `docs/VERIFICATION_LOG.md` section 9 and committed as `cbd31b5`. The accepted design is in ADR-0002. Implement production M2 storage next; the temporary gate probes are not production code. The M1 scaffold is committed as `bb0815b`, with the state record at `a35d58d`. The current unsigned package is SHA256 `F24B0C22EA23E24ED8ACD0653FA31666D71BF6F357EE48FC9601BF5383E5D577`. The legacy WhatsApp bot is separate and must remain untouched. The M0 documents are committed locally as `34f164a` and `14871e8`; do not push without owner approval. No companion secrets, provider accounts or spending exist.
