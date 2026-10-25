# Requirements Matrix

Last updated: 2026-10-25
Source of truth: `docs/MASTER_PROMPT.md`
Status vocabulary is fixed by master prompt section 16. A requirement is never marked `IMPLEMENTED AND TESTED` without a recorded passing run. For `NOT IMPLEMENTED` rows, the evidence is the absence of companion code plus `docs/PROJECT_STATE.md`; the milestone column shows where the requirement is expected to land.

Current position: M1 scaffold committed locally as `bb0815b` with state record `a35d58d`; local verification green. The G2 proposal is drafted in `docs/DECISIONS/ADR-0002-storage-encryption.md` and awaits owner approval; no storage code exists. GitHub CI and clean-machine install remain open.

## M0 and project governance

| ID | Requirement | Milestone | Status | Evidence / note |
| --- | --- | --- | --- | --- |
| M0-01 | Inspect the repository and record language, frameworks, dependencies, tests and conventions | M0 | IMPLEMENTED BUT NOT FULLY VERIFIED | `VERIFICATION_LOG.md` R-01 to R-09 |
| M0-02 | Create `PROJECT_STATE.md`, `REQUIREMENTS_MATRIX.md`, `VERIFICATION_LOG.md`, `DECISIONS/` | M0 | IMPLEMENTED BUT NOT FULLY VERIFIED | Files exist; owner review pending |
| M0-03 | Verify every Section 4 UNVERIFIED item from official sources and record URL/date | M0 | PARTIALLY IMPLEMENTED | `VERIFICATION_LOG.md` sections 2-4; open items in section 6 |
| M0-04 | Write the stack ADR comparing Tauri/Rust, Electron/TypeScript and .NET/WPF or WinUI against the required criteria | M0 | IMPLEMENTED BUT NOT FULLY VERIFIED | `DECISIONS/ADR-0001-stack.md`; accepted at G1 |
| M0-05 | Obtain owner approval of the stack ADR at G1 | M0 | IMPLEMENTED BUT NOT FULLY VERIFIED | Owner approved all four G1 questions on 2026-10-25 |
| M0-06 | Record the minimum supported Windows version and install footprint | M0/M10 | PARTIALLY IMPLEMENTED | Minimum OS recommended in ADR; M1 installer measured; clean install still pending |

## M1 scaffold

| ID | Requirement | Milestone | Status | Evidence / note |
| --- | --- | --- | --- | --- |
| M1-01 | Create the companion workspace, TypeScript project and package boundaries | M1 | IMPLEMENTED BUT NOT FULLY VERIFIED | `companion/package.json`, `apps/desktop`, `packages/core`; committed in `bb0815b`; GitHub CI not run |
| M1-02 | Electron main process, sandboxed preload bridge and React renderer | M1 | IMPLEMENTED BUT NOT FULLY VERIFIED | Manual `npm start` logged `desktop window created`; unpacked `Companion.exe` launched with 4 responding processes; no E2E or UI interaction test |
| M1-03 | CI workflow for the companion | M1 | IMPLEMENTED BUT NOT FULLY VERIFIED | `.github/workflows/companion-ci.yml`; has not run on GitHub |
| M1-04 | Lint, typecheck, test harness and production build | M1 | IMPLEMENTED AND TESTED | `npm run verify` passed: ESLint, tsc, 2 files / 9 tests, build |
| M1-05 | Logging with secret redaction | M1 | IMPLEMENTED AND TESTED | `packages/core/src/logger.ts`; 3 logger tests pass; key-name redaction only |
| M1-06 | Versioned config schema | M1 | IMPLEMENTED AND TESTED | `packages/core/src/config.ts`; 5 config tests pass |
| M1-07 | Installer generation and footprint measurement | M1 | IMPLEMENTED BUT NOT FULLY VERIFIED | Unsigned NSIS built: 115.9 MiB installer, 359.1 MiB unpacked, SHA256 `CEE02741491F0BF7253E05879BC85E49FE2BBAED228FCC76A9228EC451165CDB`; Authenticode `NotSigned`; not installed |
| M1-08 | M1 milestone report | M1 | IMPLEMENTED BUT NOT FULLY VERIFIED | `docs/MILESTONES/M1.md`; committed in `bb0815b` |

## M2 storage and secrets

| ID | Requirement | Milestone | Status | Evidence / note |
| --- | --- | --- | --- | --- |
| M2-01 | Encrypted local database for companion data | M2 | NOT IMPLEMENTED | ADR-0002 proposes SQLCipher-compatible `better-sqlite3-multiple-ciphers`; G2 pending |
| M2-02 | Versioned migrations with up/down paths | M2 | NOT IMPLEMENTED | ADR-0002 proposes `schema_migrations`, checksums and pre-migration snapshots; no schema |
| M2-03 | Encrypted persistence across restart proven by test | M2 | NOT IMPLEMENTED | No storage code or test |
| M2-04 | Credential storage adapter for provider keys, with no plaintext fallback | M2 | NOT IMPLEMENTED | ADR-0002 proposes Windows Credential Manager via `@github/keytar` or a minimal native adapter; G2 pending |
| M2-05 | Backup and restore, including portable owner-controlled recovery | M2 | NOT IMPLEMENTED | ADR-0002 proposes local snapshots and scrypt/AES-256-GCM passphrase exports; not implemented |
| M2-06 | Separate stores or clearly separated tables for conversations, memories, credentials, config and audit | M2 | NOT IMPLEMENTED | ADR-0002 proposes separate tables and Credential Manager for provider keys; no schema |
| M2-07 | No key material in database, config, logs, exports or tests; automated check | M2 | NOT IMPLEMENTED | No key or storage code; scan test not written |
| M2-08 | Storage prototype gates pass before implementation | M2 | NOT IMPLEMENTED | Eight gates are defined in ADR-0002; none executed |


## Product scope

| ID | Requirement | Milestone | Status | Evidence / note |
| --- | --- | --- | --- | --- |
| PRD-01 | Windows-only v1; x64 first, ARM64 as a goal | M1/M10 | PARTIALLY IMPLEMENTED | Electron scaffold and Windows x64 NSIS installer exist; ARM64 and installed v1 behaviour are unverified |
| PRD-02 | Resumable setup wizard including provider setup | M5 | NOT IMPLEMENTED | No code |
| PRD-03 | Hosted free-tier AI gateway with automatic switching | M3 | NOT IMPLEMENTED | No code |
| PRD-04 | Local encrypted memory | M2/M6 | NOT IMPLEMENTED | No code; encryption is G2 |
| PRD-05 | Text chat with history | M4 | NOT IMPLEMENTED | No code |
| PRD-06 | Permission engine, typed tool registry and audit log | M7 | NOT IMPLEMENTED | No code |
| PRD-07 | Background agent with tray, optional startup and bounded reflection loop | M8 | NOT IMPLEMENTED | No code |
| PRD-08 | Privacy center with export and delete | M9 | NOT IMPLEMENTED | No code |
| PRD-09 | GitHub-based install | M10 | NOT IMPLEMENTED | No code or release |
| PRD-10 | Automated tests and end-to-end acceptance suite | M1-M11 | PARTIALLY IMPLEMENTED | Vitest harness with 2 files / 9 tests for config and logger; no E2E or acceptance suite |
| PRD-11 | Push-to-talk voice after the core, once Windows speech options are verified | M11+ | NOT IMPLEMENTED | Voice is deferred and gated by G6 |
| PRD-12 | No local language model; all reasoning through hosted free tiers; memory, tools, permissions and storage local | M1-M11 | NOT IMPLEMENTED | Architectural constraint; no code yet |
| PRD-13 | No paid cloud backend, no multi-device sync, no always-listening wake word, no covert recording | M1-M11 | NOT IMPLEMENTED | Non-goal enforcement begins with the scaffold |

## Architecture

| ID | Requirement | Milestone | Status | Evidence / note |
| --- | --- | --- | --- | --- |
| ARC-01 | A local agent process owns memory, gateway, tools, permissions and scheduler; the UI talks to it over an authenticated local channel | M1 | PARTIALLY IMPLEMENTED | Electron main + validated IPC with a per-window token exist; memory, gateway, tools and scheduler do not |
| ARC-02 | Core domain logic is isolated behind typed contracts so Android v2 can reuse it | M1 | PARTIALLY IMPLEMENTED | `packages/core` exists with config, logger and provider contracts; domain modules are not implemented |
| ARC-03 | Stable modules: shell, onboarding, profile, conversation, memory/retrieval, personalization, gateway, tool registry, permission engine, Windows adapters, workflow executor, scheduler, notifications, security/encryption, observability, import/export/backup, update management | M1-M10 | PARTIALLY IMPLEMENTED | Shell, core package, config and logger exist; most modules are absent |
| ARC-04 | SQLite with encryption evaluated (SQLCipher or equivalent), FTS5 lexical search and versioned migrations from day one | M2 | NOT IMPLEMENTED | ADR-0002 proposes SQLCipher-compatible storage, FTS5 in the same encrypted database and versioned migrations; G2 pending |
| ARC-05 | Conversations, memories, credentials, configuration and audit records live in separate stores or clearly separated tables | M2 | NOT IMPLEMENTED | ADR-0002 proposes separate tables and Windows Credential Manager for provider keys; no schema |
| ARC-06 | Retrieval combines lexical search, metadata, recency, relevance and access checks; embeddings only if a measured benefit justifies a hosted provider | M6 | NOT IMPLEMENTED | No retrieval |
| ARC-07 | No Kubernetes, queues, microservices or hosted backend | M1-M11 | NOT IMPLEMENTED | Constraint; no infrastructure chosen |
| ARC-08 | Stack ADR covers installer size, tray/background, UIA, credential storage, installer generation, build/test tooling, solo maintainability, ARM64 | M0 | IMPLEMENTED BUT NOT FULLY VERIFIED | `ADR-0001-stack.md`; accepted at G1 |
| ARC-09 | Reserve Android findings for v2 in `docs/android-v2-notes.md`; do not build Android in v1 | M0 | IMPLEMENTED BUT NOT FULLY VERIFIED | Document exists; findings are SECONDARY until re-verified |

## Provider gateway

| ID | Requirement | Milestone | Status | Evidence / note |
| --- | --- | --- | --- | --- |
| GW-01 | `ChatProvider` contract with `capabilities()`, `healthCheck()`, `complete(request, signal)` and `stream(request, signal)` | M3 | PARTIALLY IMPLEMENTED | Contract types exist in `packages/core/src/contracts/provider.ts`; no adapter or runtime |
| GW-02 | Typed requests/responses, the full error taxonomy, cancellation on every call and usage reporting | M3 | PARTIALLY IMPLEMENTED | Request/response/error types exist; cancellation and usage runtime are absent |
| GW-03 | Versioned provider catalog as a data file with id, name, signup/key URLs, key-prefix hint, needs, base URL, compatibility, data-policy URL, privacy note, guide, models and `lastVerified` | M3 | NOT IMPLEMENTED | Research exists in `VERIFICATION_LOG.md`; catalog not built |
| GW-04 | Quota ledger per provider and model built from response headers, 429s and failures; published numbers are hints only | M3 | NOT IMPLEMENTED | No code |
| GW-05 | Rate-limit handling: honour `Retry-After`, exponential backoff with jitter, retry cap, per-provider-model circuit breaker, failover, no rapid loops | M3 | NOT IMPLEMENTED | No code |
| GW-06 | Route cheap tasks to the least-contended eligible provider and reserve the best capacity for user-facing replies | M3 | NOT IMPLEMENTED | No code |
| GW-07 | One key per provider per user; no rotation across multiple accounts | M3 | NOT IMPLEMENTED | No code |
| GW-08 | Never send sensitive content, credentials or protected memories to an unauthorised provider/data class; redact before sending; never include secrets in fallback requests | M3 | NOT IMPLEMENTED | No code; G3 applies |
| GW-09 | Never claim a model switch preserves a running generation; rebuild context from local conversation and memory | M3 | NOT IMPLEMENTED | No code |
| GW-10 | Degraded mode when all providers fail: history, memory browsing, notes and reminders still work; show failure and expected quota return; queue the request | M3/M4 | NOT IMPLEMENTED | No code |
| GW-11 | Deterministic mock provider with scriptable latency, 429s, outages and malformed output; live tests opt-in only | M3 | NOT IMPLEMENTED | No test harness |
| GW-12 | Only add providers after verifying their terms, retention, training policy and signup/key pages | M0/M3 | PARTIALLY IMPLEMENTED | Research in `VERIFICATION_LOG.md`; Kenya eligibility and some limits remain unverified |

## Memory

| ID | Requirement | Milestone | Status | Evidence / note |
| --- | --- | --- | --- | --- |
| MEM-01 | Categories: episodic, semantic, conversational, procedural, goal, relationship, interest, behavioural preference, task | M6 | NOT IMPLEMENTED | No schema |
| MEM-02 | Shared envelope with id, category, payload, origin, source, timestamps, confidence, sensitivity, approval, retention, embedding reference, supersedes chain and deletion record | M6 | NOT IMPLEMENTED | No schema |
| MEM-03 | Pipeline: authorised source, ingest, normalise, sensitive filter, candidate extraction, dedupe, conflict detection, confidence, user persistence, index, retrieve, prompt context | M6 | NOT IMPLEMENTED | No code |
| MEM-04 | Explicit statements and inferences have different origins; inferences are never auto-approved or treated as fixed personality claims | M6 | NOT IMPLEMENTED | No code |
| MEM-05 | Never infer or store health, religion, politics, sexuality or similar traits from incidental activity without explicit opt-in | M6 | NOT IMPLEMENTED | No code |
| MEM-06 | No passwords, tokens or session cookies in the memory database | M6 | NOT IMPLEMENTED | No code |
| MEM-07 | Do not build profiles of other people without a consent-based reason | M6 | NOT IMPLEMENTED | No code |
| MEM-08 | Owner can inspect, correct, export and delete memories; corrections supersede rather than silently overwrite; visible timeline of learned, inferred, confirmed and deleted items | M6/M9 | NOT IMPLEMENTED | No code |
| MEM-09 | Every retrieved memory carries provenance into the prompt | M6 | NOT IMPLEMENTED | No code |

## Companion runtime

| ID | Requirement | Milestone | Status | Evidence / note |
| --- | --- | --- | --- | --- |
| RUN-01 | Triggers: user message, due reminder/task, end of conversation, daily review, app start, idle window | M8 | NOT IMPLEMENTED | No code |
| RUN-02 | Each cycle gathers context, plans, proposes or acts, observes and logs | M8 | NOT IMPLEMENTED | No code |
| RUN-03 | Limits on steps, tool calls and wall time per cycle; loop detector aborts repeated identical steps | M8 | NOT IMPLEMENTED | No code |
| RUN-04 | Reflection budget as a share of measured daily quota; lowest priority, preempted by user requests, paused while providers are rate-limited | M8 | NOT IMPLEMENTED | No code |
| RUN-05 | Autonomous actions limited to Class 1 and pre-approved Class 2; everything else goes to an approval inbox | M7/M8 | NOT IMPLEMENTED | No code |
| RUN-06 | Reflection may summarise, propose memory updates, detect preference changes, flag stale goals and prepare reminders, with a reason for each proposal | M8 | NOT IMPLEMENTED | No code |
| RUN-07 | Plans and task state persist across restarts and resume rather than restart | M8 | NOT IMPLEMENTED | No code |
| RUN-08 | Agent cannot edit its own policy, permission grants, risk classes, tool rules or safety logic; these live in a read-only integrity-checked bundle | M7/M8 | NOT IMPLEMENTED | No code; G7 applies |
| RUN-09 | Pause switch, Stop button, activity log and a clear background-working indicator | M8 | NOT IMPLEMENTED | No code |
| RUN-10 | No unbounded sub-agents or recursive plans | M8 | NOT IMPLEMENTED | No code |

## Tools and permissions

| ID | Requirement | Milestone | Status | Evidence / note |
| --- | --- | --- | --- | --- |
| TOOL-01 | Typed registry where each tool declares name/version, description, schemas, permissions, data classification, risk class, reversibility, confirmation, timeout, cancellation, audit, platforms and failure/recovery | M7 | NOT IMPLEMENTED | No code |
| TOOL-02 | Risk classes 1-4; Class 4 capabilities are blocked in code, not only in the prompt | M7 | NOT IMPLEMENTED | No code; G7 applies |
| TOOL-03 | Policy engine outside the model validates every call against schemas, grants, folder/destination allow-lists and rate limits; model arguments never bypass it | M7 | NOT IMPLEMENTED | No code |
| TOOL-04 | Class 3 shows the real action, recipient/destination, full content and consequence, and requires confirmation bound to a one-time action hash that also prevents duplicate execution | M7 | NOT IMPLEMENTED | No code |
| TOOL-05 | Untrusted content is tagged as data, cannot grant permissions or directly trigger tools, and causes stricter confirmation | M7 | NOT IMPLEMENTED | No code |
| TOOL-06 | Record outcome states: drafted, confirmed, initiated, completed, failed, unknown; never claim unobservable completion | M7 | NOT IMPLEMENTED | No code |
| TOOL-07 | Append-only audit log that avoids unnecessary private content | M7 | NOT IMPLEMENTED | No code |
| TOOL-08 | v1 tools in order: open application; search authorised folders; read/summarise a selected file; notes and reminders; draft email handoff; local calendar entries; clipboard read/write on explicit request; media control | M7 | NOT IMPLEMENTED | No code |
| TOOL-09 | UIA only after the core is stable, behind per-application allow-list, visible indicator, step limits, one-key stop, screen-state verification and exclusion of password/secure windows | M11+ | NOT IMPLEMENTED | Deferred; G6 |
| TOOL-10 | Draft email hands off to the default mail client; no silent sending | M7 | NOT IMPLEMENTED | No code |

## Setup wizard

| ID | Requirement | Milestone | Status | Evidence / note |
| --- | --- | --- | --- | --- |
| WIZ-01 | Resumable, idempotent, keyboard/screen-reader accessible and understandable by nontechnical users; optional steps can be skipped and revisited | M5 | NOT IMPLEMENTED | No code |
| WIZ-02 | Stages: welcome; system check; privacy/performance; providers; voice (deferred); folder access; integrations; background/startup; memory/learning; automation permissions; backup/recovery; provider health; first conversation; dashboard | M5 | NOT IMPLEMENTED | No code |
| WIZ-03 | Provider step explains in plain language that text is sent to chosen services, that each has a free allowance, and links each data policy | M5 | NOT IMPLEMENTED | No code |
| WIZ-04 | Provider cards show honest notes: speed, phone/card needs, recommended first | M5 | NOT IMPLEMENTED | No code; catalog research exists |
| WIZ-05 | Guided key setup with numbered steps, system-browser signup button and paste field; never read the clipboard without a user action; bundle guides for low-data use | M5 | NOT IMPLEMENTED | No code |
| WIZ-06 | Validate with a tiny request and show a specific result: connected, invalid key, phone verification, region unavailable, rate-limited | M5 | NOT IMPLEMENTED | No code |
| WIZ-07 | Reliability status shows connected provider count and prompts for one more; user can skip into memory-and-notes mode | M5 | NOT IMPLEMENTED | No code |
| WIZ-08 | Settings > Providers lists status, tests, and adds/replaces/removes keys | M5 | NOT IMPLEMENTED | No code |
| WIZ-09 | Keys only in Windows credential storage, masked, never shown after saving, never in memory DB, config, logs, exports, backups or crash reports; prefix hints are warnings only | M2/M5 | NOT IMPLEMENTED | ADR-0002 proposes Credential Manager-only storage and exclusion from backups; G2 pending |

## Security and privacy

| ID | Requirement | Milestone | Status | Evidence / note |
| --- | --- | --- | --- | --- |
| SEC-01 | `docs/THREAT_MODEL.md` covers malicious files/pages, prompt injection, hallucinated tool use, unauthorised execution, excessive permissions, malware, credential theft, provider leakage, device loss, backup exposure, key compromise, dependency updates, unintended recording, memory poisoning, accidental deletion and provider outages | M1/M11 | IMPLEMENTED BUT NOT FULLY VERIFIED | Initial `docs/THREAT_MODEL.md` covers all listed categories; M11 review and tool/voice/UIA detail pending |
| SEC-02 | Least privilege, safe defaults, encrypted secrets and data at rest, input validation, dependency scanning and logs without keys or private content | M1-M11 | PARTIALLY IMPLEMENTED | Sandbox, context isolation, CSP and authenticated IPC exist; encryption, dependency scanning and full validation are absent |
| SEC-03 | Privacy center shows active permissions, providers and what each receives, selected folders, stored memories, retention, recent tool actions, pending confirmations, backup status and export/delete controls | M9 | NOT IMPLEMENTED | No code |
| SEC-04 | Export all data and delete it, including keys, with verification that nothing remains | M9 | NOT IMPLEMENTED | No code |
| SEC-05 | Evaluate data-protection requirements for target jurisdictions including Kenya; never claim compliance without legal review | M11 | NOT IMPLEMENTED | Open legal question |
| SEC-06 | No secrets in repo, logs, tests, fixtures or screenshots; app never ships with API keys | M1-M11 | PARTIALLY IMPLEMENTED | M1 contains no secrets and `.gitignore` covers local artifacts; logger covers key names only; no secret-scanning test |
| SEC-07 | No hidden persistence or control bypass; provide Pause, Stop, Exit, Disable Startup and Uninstall | M8/M10 | NOT IMPLEMENTED | No code |
| SEC-08 | Honest product claims: not sentient, not infallible, not able to control everything | M4+ | NOT IMPLEMENTED | No UI copy yet |

## Distribution and updates

| ID | Requirement | Milestone | Status | Evidence / note |
| --- | --- | --- | --- | --- |
| DIST-01 | CI builds a classic installer, SHA256 checksums and a generated winget manifest | M10 | NOT IMPLEMENTED | No CI or installer |
| DIST-02 | Three install routes: GitHub Releases download; one-line PowerShell installer that verifies SHA256 before running; winget local manifest then community submission | M10 | NOT IMPLEMENTED | No release |
| DIST-03 | winget manifest tested locally with validation and `--manifest` before community submission | M10 | NOT IMPLEMENTED | No manifest |
| DIST-04 | README explains expected SmartScreen warning, hash verification, what the app can access, and how to stop/uninstall | M10 | NOT IMPLEMENTED | No README for companion |
| DIST-05 | Research no-cost signing options and record the finding | M0/M10 | IMPLEMENTED BUT NOT FULLY VERIFIED | `VERIFICATION_LOG.md` S-01 to S-08; owner decision pending |
| DIST-06 | Updates check GitHub Releases, verify hashes before applying, and support rollback | M10 | NOT IMPLEMENTED | No code |
| DIST-07 | A no-cost trusted code-signing route for this private repository | M10 | BLOCKED BY PLATFORM OR EXTERNAL DEPENDENCY | No free trusted route for a private `UNLICENSED` repo in Kenya; SignPath requires open source, Azure Artifact Signing individuals are limited to US/CA; paid certs are G4. Evidence S-01 to S-07 |
| DIST-08 | Do not ship MSIX unless a trusted signature exists | M10 | NOT IMPLEMENTED | No release; constraint will be enforced |

## Tests and acceptance

| ID | Requirement | Milestone | Status | Evidence / note |
| --- | --- | --- | --- | --- |
| TEST-01 | Unit tests | M1-M11 | PARTIALLY IMPLEMENTED | Vitest harness and 2 files / 9 tests for config and logger pass; most modules are absent or untested |
| TEST-02 | Migration up and rollback tests | M2 | NOT IMPLEMENTED | No schema |
| TEST-03 | Encryption and recovery tests | M2 | NOT IMPLEMENTED | G2 pending |
| TEST-04 | Memory create, retrieve, correct and delete tests | M6 | NOT IMPLEMENTED | No code |
| TEST-05 | Provider fallback, quota exhaustion, timeout and cancellation tests with the mock provider | M3 | NOT IMPLEMENTED | No code |
| TEST-06 | Degraded-mode tests | M4 | NOT IMPLEMENTED | No code |
| TEST-07 | Prompt-injection corpus against the tool layer | M7/M11 | NOT IMPLEMENTED | No code |
| TEST-08 | Permission-enforcement tests | M7 | NOT IMPLEMENTED | No code |
| TEST-09 | Confirmation and duplicate-action-prevention tests | M7 | NOT IMPLEMENTED | No code |
| TEST-10 | Reflection-budget and loop-limit tests | M8 | NOT IMPLEMENTED | No code |
| TEST-11 | Background lifecycle tests: start, pause, stop, crash recovery | M8 | NOT IMPLEMENTED | No code |
| TEST-12 | Wizard-resume tests | M5 | NOT IMPLEMENTED | No code |
| TEST-13 | Accessibility checks | M5/M11 | NOT IMPLEMENTED | No code |
| TEST-14 | Upgrade and rollback tests | M10/M11 | NOT IMPLEMENTED | No code |
| TEST-15 | No default test depends on live free-tier quotas | M3-M11 | NOT IMPLEMENTED | No tests |
| ACC-01 | Clean Windows/VM install and setup with one provider | M11 | NOT IMPLEMENTED | No build |
| ACC-02 | Hold a conversation | M11 | NOT IMPLEMENTED | No build |
| ACC-03 | Restart and confirm approved memory persists | M11 | NOT IMPLEMENTED | No build |
| ACC-04 | Ask about an earlier event and get an answer using stored memory | M11 | NOT IMPLEMENTED | No build |
| ACC-05 | Correct a memory and confirm the correction survives restart | M11 | NOT IMPLEMENTED | No build |
| ACC-06 | Switch providers with conversation and memory intact | M11 | NOT IMPLEMENTED | No build |
| ACC-07 | Force provider failure, observe fallback, then degraded mode when all fail | M11 | NOT IMPLEMENTED | No build |
| ACC-08 | Request a device action | M11 | NOT IMPLEMENTED | No build |
| ACC-09 | Review and confirm a Class 3 action showing real content | M11 | NOT IMPLEMENTED | No build |
| ACC-10 | Inspect the audit record for that action | M11 | NOT IMPLEMENTED | No build |
| ACC-11 | Disable background operation and startup | M11 | NOT IMPLEMENTED | No build |
| ACC-12 | Export all data, delete it, and verify nothing remains including keys | M11 | NOT IMPLEMENTED | No build |
| ACC-13 | New user connects one provider in under 5 minutes in a usability test with at least 5 people | M11 | NOT IMPLEMENTED | No build |
| ACC-14 | Search database, config, logs and backups and find no key material | M11 | NOT IMPLEMENTED | No build |
