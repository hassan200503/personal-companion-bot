# Requirements Registry (v3 brief)

Last graded: 2026-10-29
Method: read the implementation, run `npm.cmd run verify` from `companion/` (39 files / 248 tests passed, 0 lint warnings), run the documented Windows runtime/UIA probes, and inspect the Electron main process. Status values are `PASS`, `PARTIAL`, `FAIL`, `BLOCKED`, `MANUAL`, `NOT BUILT`. A row is only `PASS` when the evidence column names a runnable check and its observed result.

Baseline evidence: `docs/VERIFICATION_LOG.md` section 14. Safety-slice evidence: section 15. Earlier catalog rows remain in `docs/REQUIREMENTS_MATRIX.md`; this registry is the v3 source of truth.

## Success criteria

| ID | Acceptance check | Status | Evidence |
| --- | --- | --- | --- |
| SC1 | Greeting on every app open, owner name, pronunciation override, <=2 sentences, varied, <=3 s after UI ready, offline, interruptible, mute/quiet hours | PARTIAL | Offline `GreetingComposer` tests cover name, pronunciation markup, variation, mute and quiet hours and the renderer uses it; real audio, editable pronunciation settings and <=3 s startup timing remain unmeasured. |
| SC2 | 30-prompt persona suite across 3 provider profiles, >=95% rule checks; provider switch loses no memory, plan or confirmation | PARTIAL | Typed cognition is wired into the desktop conversation engine; a deterministic 30-prompt/three-profile suite passes its >=95% normalized-output rules, but provider-switch persistence for plans/confirmations remains open. |
| SC3 | >=10 app tasks observed and measured; elevated/secure refused with explanation | PARTIAL | Real Notepad UIA feasibility spike returned 106 elements and Calculator process postconditions passed; reusable UIA service, 10-task benchmark and real elevated/secure transitions remain open. |
| SC4 | Fixture messenger flow: resolve, ambiguity, read-back, policy, send, observe; Sent only when observed; last seen on request | PARTIAL | Fixture messenger tests cover ambiguity, confirmation, observed outgoing state, hidden last-seen and hourly cap; production parser/WhatsApp UI adapter and separate fixture desktop app remain open. |
| SC5 | Login start, single instance, restart after own crash/hang, never after Stop/Exit/termination, sleep/mic changes, measured idle | PARTIAL | Persisted per-user startup setting, tray enable/disable controls, single-instance lock, live heartbeat/markers and a detached capped supervisor are implemented; real crash/hang app restart, sleep/mic handling and resource measurements remain open. |
| SC6 | On-device wake word, measured false accepts, visible mic state, no raw audio stored | BLOCKED | G1 approval is required for on-device models/always-listening. The UI no longer auto-starts dictation and explicitly says mic off; start is a visible owner action. No wake word. |
| SC7 | Simulation proves budget, quiet hours, cooldowns, dismissals reduce frequency; every nudge has a reason | PARTIAL | Proactive engine tests cover reasons, quiet/focus, budgets, cooldowns, dismissals and resettable receptivity; scheduler/storage integration remains open. |
| SC8 | Local match first with ranked disambiguation, fallback chain, quota tracking, no scraping | PARTIAL | Ranked local resolver, ambiguity output, official fallback interface and daily quota tests exist; incremental indexing, live adapters and playback observation remain open. |
| SC9 | Evidence thresholds, approval before facts, no sensitive-trait inference, weekly review, self-healing recipes | PARTIAL | Evidence/sensitive-trait/third-party guards, approval inbox and rejection lookup are tested; consolidation integration, weekly review and recipes remain open. |
| SC10 | Class 4 blocked, Class 3 enforced, injection corpus cannot act, locked-screen commands ignored | PARTIAL | Policy/guard block Class 4, force Class 3 confirmation, deny untrusted/system sources, inspect locked/secure desktop and sensitive targets, and IPC defaults to safe permissions with no auto-confirm. The seven-origin injection corpus passes core tests; runtime producer wiring, path-level IPC tests and real integrity/lock transitions remain open. |
| SC11 | Every row PASS/BLOCKED/MANUAL with evidence; two consecutive clean sweeps | FAIL | This registry is new; no sweep has been recorded. |
| SC12 | Clean build/lint/types/tests, kill tests, one-hour soak | PARTIAL | `npm.cmd run verify` passed: 0 lint errors/warnings, TypeScript clean, 35 files / 239 tests, Electron and renderer builds. No kill tests or soak. |

## Constancy

| ID | Acceptance check | Status | Evidence |
| --- | --- | --- | --- |
| K1 | Identical Context Packet for every provider | PARTIAL | Provider-independent L0-L7 packet compiler is now built by the live cognition path and has truncation/provider-independent tests; owner-model and tool-schema persistence remain open. |
| K2 | Turn Decision validated, repaired once, then failover | PARTIAL | Live desktop conversation wiring and tests cover validation, one repair, thrown-provider failover and provider attribution; plan execution/confirmation handoff remains open. |
| K3 | Style normalizer enforces length, name, banned phrases, honesty markers | PARTIAL | Normalizer is wired into renderer and `os.speak`, with safe-overheard tests; full persona rules remain open. |
| K4 | Persona suite >=95% | PASS | `persona-suite.test.ts` replays 30 fixed prompts through three provider-output profiles (90 cases); the rule-based normalized-output score is >=95% in the full verify gate. |
| K5 | Provider switch preserves working memory, plan, pending confirmations | PARTIAL | Conversations and confirmations persist in DB only while the process lives; plans do not exist. Pending confirmations are in-memory only. |
| K6 | All providers down still serves fast path | PARTIAL | Memory browser, chat history and the setup UI remain; there is no deterministic intent router or offline command path beyond hard-coded string matching. |

## Voice

| ID | Acceptance check | Status | Evidence |
| --- | --- | --- | --- |
| V1 | Greeting uses stored name and pronunciation, offline | PARTIAL | Composer is integrated into the renderer and tested for name, pronunciation SSML, variation, mute and quiet hours; real audio observation remains open. |
| V2 | Greeting never delays startup | PARTIAL | Greeting runs after `loadAll`/owner load and is not awaited; no timed startup measurement. |
| V3 | Barge-in works | PARTIAL | Renderer calls `voiceStopSpeaking` on final/interim voice input and has a "stop everything" control; no automated test. |
| V4 | Listening pauses while speaking | PARTIAL | Renderer tracks `speaking` but the Windows recognizer keeps running. |
| V5 | Wake word on-device, memory buffer only | BLOCKED | G1. Current code uses push-to-start dictation, not a wake word. |
| V6 | No raw audio on disk (scan) | PARTIAL | PowerShell recognizer streams text; no audio file is written by the current code, but no automated scan exists. |
| V7 | Mute stops capture | PARTIAL | Mute stops active recognition and TTS in the renderer; main process has no persistent mute setting, and the greeting checks renderer mute only once. |
| V8 | Locked session ignores commands | PARTIAL | Main-process probe and guard deny locked/secure desktop; probe failure fails closed. Real lock transitions are not exercised by tests. |
| V9 | Speak-safe rule enforced | PARTIAL | Safe normalization is applied in renderer speech and the `os.speak` tool; dedicated Electron audio-content E2E remains open. |

## Action stack

| ID | Acceptance check | Status | Evidence |
| --- | --- | --- | --- |
| O1 | Refuse elevated/secure targets with explanation | PARTIAL | Probe now reads foreground token integrity and fails closed; real elevated-window and secure-desktop transitions remain manual. |
| O2 | Denylist enforced | PARTIAL | Process/title/target denylist covers password managers, banking, Windows Security and password fields; not exhaustively tested. |
| O3 | Every action has a verified postcondition | PARTIAL | Executor enforces declared postconditions; known app launches observe the target process, and a real Calculator smoke passed. UIA observations for arbitrary apps and WhatsApp remain open. |
| O4 | Capability probe and store | PARTIAL | Reusable typed UIA service, real Notepad probe and durable key-value-backed per-app/version capability store with explicit observation counts are tested; encrypted-settings integration and app-adapter use remain open. |
| O5 | Emergency stop cancels all automation within 1 s | PARTIAL | Global `Ctrl+Shift+Esc` aborts armed tool controllers, stops voice/TTS and rejects pending confirmations; timing and full UI E2E measurement remain open. |
| O6 | Recipes self-heal without raising permissions | NOT BUILT | No recipes. |
| O7 | Clipboard restored after paste entry | NOT BUILT | No paste entry path. |
| O8 | Vision fallback off unless authorized, indicator shown | NOT BUILT | No vision path. |

## Messaging

| ID | Acceptance check | Status | Evidence |
| --- | --- | --- | --- |
| W1 | Contact ambiguity asks | PARTIAL | Fixture resolver returns candidates for ambiguous names; production parser and WhatsApp UI adapter remain open. |
| W2 | Read-back and policy enforced | PARTIAL | WhatsApp tool is class 3, requires `os.message.send` and confirmation; UI shows action and the message is not auto-confirmed. No explicit read-back yet. |
| W3 | Sent only when observed | PARTIAL | `sendWhatsAppMessage` returns `{typed, sent:false, verified:false}` unless an observed outgoing bubble sets the flags; no observation path exists yet. |
| W4 | Last seen on demand only, hidden handled | PARTIAL | Fixture flow returns observed status or `not shown`; real WhatsApp accessibility reader remains open. |
| W5 | No monitoring or alerts about a person | NOT BUILT | No monitoring exists, but no guard/test. |
| W6 | Hourly cap | PARTIAL | Fixture messenger enforces and tests a configurable hourly cap; production integration remains open. |
| W7 | Fixture messenger tests in CI | PARTIAL | Fixture messenger end-to-end tests run in Vitest; no separate fixture desktop app exists. |
| W8 | No unofficial clients in dependency tree | PASS | Dependency inspection: no WhatsApp protocol library. |

## Media

| ID | Acceptance check | Status | Evidence |
| --- | --- | --- | --- |
| M1 | Local-first search with disambiguation | PARTIAL | Ranked local resolver is tested and used by `playMedia`; incremental indexing and tags remain open. |
| M2 | Fallback chain with quota ledger | PARTIAL | Official fallback interface and daily quota tests exist; live provider adapters and media-session verification remain open. |
| M3 | No scraping, no pirate sources | PASS | `playMedia` no longer fetches/scrapes result HTML; it opens the official YouTube search page and returns `played: false` until the owner selects. Source inspection + typecheck/build. |
| M4 | Cached meaning of names | NOT BUILT | No cache. |

## Proactive engine

| ID | Acceptance check | Status | Evidence |
| --- | --- | --- | --- |
| P1 | Budget, quiet hours, cooldowns | PARTIAL | Proactive engine simulation covers all three; scheduler/storage integration remains open. |
| P2 | Reason stored for every nudge | PARTIAL | Candidate decisions require and preserve a reason; persistent nudge records remain open. |
| P3 | Receptivity learning visible and resettable | PARTIAL | Acceptance/dismissal counters are visible and resettable in core; UI integration remains open. |
| P4 | Private details not spoken by default | PARTIAL | Safe speech normalization covers sensitive markers in renderer and `os.speak`; full privacy fixture remains open. |

## Learning

| ID | Acceptance check | Status | Evidence |
| --- | --- | --- | --- |
| L1 | Evidence thresholds | PARTIAL | Learning policy enforces explicit-owner or 3-observation/14-day thresholds; consolidation integration remains open. |
| L2 | Nothing becomes fact without approval | PASS | `approval.ts` and `SqliteMemoryRepository` separate proposed/approved; retriever only searches approved memories. |
| L3 | Rejected proposals not repeated | PARTIAL | `wasMemoryRejected` checks the repository's rejected records by normalized category/content and is tested; consolidation must still call it before proposing. |
| L4 | No sensitive-trait inference (fixtures) | PARTIAL | Sensitive-trait and third-party-content rejection tests exist; consolidation fixture remains open. |
| L5 | Third-party message content not learned by default | PASS | Desktop wiring creates the memory recorder with `recordConversation:false`; focused memory and desktop-boundary tests prove conversation content is not inserted into the learning repository by default. |
| L6 | Policy bundle unchanged by learning (tamper test) | PASS | Frozen, hashed built-in policy bundle is verified on every policy evaluation; tamper test rejects a modified Class 4 rule and full verify passes. |

## Safety

| ID | Acceptance check | Status | Evidence |
| --- | --- | --- | --- |
| S1 | Injection corpus incl. screen text and audio cannot trigger actions | PARTIAL | `routeExternalContent` covers web/email/file/screen/filename/notification/audio; `untrusted-content.test.ts` covers all seven origins across classes 1-3 (22 focused security tests passed). Runtime producer wiring and Electron E2E remain open. |
| S2 | Class 4 blocked on every path | PARTIAL | Registry rejects Class 4, policy denies it, and guard tests cover class 4; no path-level tests for adapters/IPC. |
| S3 | Class 3 policy | PARTIAL | Guard forces class 3 confirmation and WhatsApp is now class 3 with `os.message.send`; IPC auto-confirm removed. No end-to-end confirmation test. |
| S4 | No secrets anywhere (canary scan) | PARTIAL | `spikes/secret-canary-scan.ps1` scanned companion apps/core source, docs and spikes (4 roots, 8 text extensions) with 0 high-confidence matches; intentionally excluded legacy secrets/config stores and generated dependencies, so the whole-repository claim remains open. |

## Next actions

1. Add the injection corpus and route screen/audio text explicitly as `untrusted_content`; add end-to-end confirmation tests.
2. Add a Greeting Composer with pronunciation override, variation, quiet hours and a startup-latency measurement.
3. Add prompt compiler, Turn Decision validation, style normalizer and persona suite.
4. Replace substring media matching with a local index, ranked disambiguation and official fallback.
5. Add proactive and learning guard modules with tests.
