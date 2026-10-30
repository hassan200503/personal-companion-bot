# Gap List (v3 brief)

Baseline: 2026-10-29. Graded against `docs/REQUIREMENTS.md`.
Latest verification: `npm.cmd run verify` from `companion/` passed 0 lint errors/warnings, clean TypeScript, 44 test files / 297 tests, and both builds. See `docs/VERIFICATION_LOG.md` section 32.
Status values: `FIXED` means code + verification exist for the stated slice; `PARTIAL` means some behavior is present but the acceptance check is not fully met; `OPEN` means no implementation.

## Critical

| ID | Gap | Evidence | Dependency | Status |
| --- | --- | --- | --- | --- |
| GAP-01 | Untrusted text can execute OS actions, and Class 3 actions auto-confirm | Was: IPC granted every permission and `osTryCommand` auto-confirmed. Now: `packages/core/src/security` denies untrusted/system sources, locked/secure desktop and sensitive targets; IPC grants safe defaults only; auto-confirm removed; confirmation UI added. | None. | FIXED (unit/build; runtime E2E pending) |
| GAP-02 | WhatsApp reports `sent: true` without observing a sent message; tool is risk class 2 | Now returns `{typed, sent, verified}`; after send, UIA probes the WhatsApp window for an outgoing bubble match before setting `sent/verified`; class 3 + confirmation with spoken/UI honesty. | GAP-01 | FIXED (observation best-effort; phone delivery still not claimed) |
| GAP-03 | Media playback scrapes YouTube HTML, which the brief forbids | Scraping removed; official search page opened and `played: false` returned until owner selection. | None. | FIXED |
| GAP-04 | No locked-screen, elevated-window or sensitive-window guard | Probe now reads foreground token integrity, locked/secure desktop and target denylist; real elevated/locked transitions remain manual. | GAP-01 | PARTIAL |
| GAP-05 | No greeting at app open | `composeGreeting` is integrated into the renderer with persisted mute/quiet-hour settings; WinRT TTS audibly emitted `speech_started`/`speech_done`. Pronunciation overrides and latency instrumentation remain open. | None. | PARTIAL |

## High

| ID | Gap | Evidence | Dependency | Status |
| --- | --- | --- | --- | --- |
| GAP-06 | No persona contract, prompt compiler, Turn Decision or style normalizer | L0-L7 prompt compiler, TurnDecision validator, live typed cognition and a 30-prompt/three-profile persona suite are tested; plan/confirmation handoff and provider-switch persistence remain open. | None. | PARTIAL |
| GAP-07 | Continuous dictation can start without a wake word; mute is not persisted | Primary listen path is renderer mic → Gemini transcription with explicit `cloudSpeechConsent` (default off). Mute/consent persist in voice settings. No wake word (G1). | G1 for wake word. | PARTIAL |
| GAP-08 | No media ranking or disambiguation | Ranked resolver is used by `playMedia` and returns candidates for close matches; local play waits briefly for observation; YouTube stays official search with `played: false`. | GAP-03 | PARTIAL |
| GAP-09 | No proactive engine or reason records | Core engine tests budgets, quiet hours, cooldowns, dismissal and reasons; the renderer now schedules model-backed questions with a daily cap and quiet hours, but durable reason records and dismissal feedback remain open. | None. | PARTIAL |
| GAP-10 | No evidence thresholds, sensitive-trait guard, rejection suppression or weekly review | Learning policy rejects weak evidence, sensitive traits and third-party content; repository-backed rejection lookup is tested; desktop conversation learning is disabled by default. Consolidation, proposal integration and weekly review remain open. | None. | PARTIAL |
| GAP-11 | No single-instance lock, supervisor, heartbeat or stop marker | Single-instance lock, persisted startup controls, live heartbeat/crash/owner-stop markers and detached capped supervisor exist; fixture restart smoke passed, but real crash/hang app restart, sleep/mic handling and resource measurements remain open. | None. | PARTIAL |
| GAP-12 | No injection corpus or screen-text trust boundary test | `routeExternalContent` labels web, email, file, screen, filename, notification and audio content as `untrusted_content`; corpus test denies classes 1-3. Runtime producer wiring and Electron E2E remain open. | GAP-01 | PARTIAL |
| GAP-24 | WinRT live recognition is blocked by package identity / speech privacy; SAPI fallback is inaccurate | Primary ASR is now Gemini cloud transcription with in-app consent; WinRT helper is TTS-only for conversation. Raw audio is not written to disk. Local-only ASR / wake word remain out of scope without G1. | Owner enables cloud speech consent + Gemini key for live listening | FIXED (cloud path); local WinRT ASR still unavailable unpackaged |

## Medium

| ID | Gap | Evidence | Dependency | Status |
| --- | --- | --- | --- | --- |
| GAP-13 | No postcondition verification for OS actions | Executor enforces declared postconditions; known app launches observe processes and real Calculator smoke passed. UIA observations for arbitrary apps remain open. | UIA or process/window probe | PARTIAL |
| GAP-14 | No UIA service, capability probe or app adapters | Reusable typed UIA service and real Notepad probe passed with 39 descendants; durable key-value-backed capability store is tested, but encrypted-settings integration, app adapters and 10-task benchmark remain open. | None, but large. | PARTIAL |
| GAP-15 | No fixture messenger in CI | Fixture messenger end-to-end tests run in Vitest; a separate fixture desktop app and production adapter remain open. | GAP-02 | PARTIAL |
| GAP-16 | No last-seen reader | W4 fails. | UIA | OPEN |
| GAP-17 | No emergency stop | Core `EmergencyStop`, UI button and global `Ctrl+Shift+Esc` now abort armed tool controllers, stop voice/TTS and reject pending confirmations; timing/E2E remains open. | None. | PARTIAL |
| GAP-18 | Clipboard may not be restored after paste | O7: no paste path exists, so not yet testable. | UIA | OPEN |
| GAP-19 | No kill tests or soak | SC12 partial. | After feature work. | OPEN |
| GAP-20 | Six ESLint warnings for unused disable directives | Removed; `npm run verify` now reports 0 warnings. | None. | FIXED |

## Low

| ID | Gap | Evidence | Dependency | Status |
| --- | --- | --- | --- | --- |
| GAP-21 | Installer unsigned and not clean-machine tested | Rebuilt NSIS artifact `Companion-0.1.0-x64.exe` (122,781,868 bytes, SHA-256 `E7F85038...444E0`, V-81), prior unpacked runtime/helper smoke passed (V-77), but signing and clean-machine installation/uninstall/SmartScreen checks remain open. | Owner/VM/G4 | OPEN |
| GAP-22 | CI has not run on GitHub | `main` pushed (`9516104`+); remote CI status not yet confirmed. | Owner/CI | OPEN |
| GAP-23 | No third-party notices in packaged app | PROJECT_STATE known defects. | Release work | OPEN |

## Fix order

1. GAP-12, GAP-14: producer provenance and Electron/UI Automation E2E.
2. GAP-04, GAP-13: exercise integrity probe and add concrete OS observations.
3. GAP-06: wire prompt compiler, TurnDecision repair/failover and persona suite into conversation engine.
4. GAP-07, GAP-09, GAP-10: persistent voice controls, scheduler/storage, rejection suppression and weekly review.
5. GAP-11, GAP-17, GAP-19: supervisor, global emergency stop, kill tests and soak.
6. GAP-16, GAP-18: real messenger observation/clipboard-safe UIA paths.
7. GAP-19 to GAP-23: soak, verification and release.
8. Optional: local on-device ASR / wake word after G1.
