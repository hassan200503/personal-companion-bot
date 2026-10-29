# Requirements Registry (v3 brief)

Last graded: 2026-10-29
Method: read the implementation, run `npm.cmd run verify` from `companion/` (182 tests passed), and inspect the Electron main process. Status values are `PASS`, `PARTIAL`, `FAIL`, `BLOCKED`, `MANUAL`, `NOT BUILT`. A row is only `PASS` when the evidence column names a runnable check and its observed result.

Baseline evidence: `docs/VERIFICATION_LOG.md` section 14. Earlier catalog rows remain in `docs/REQUIREMENTS_MATRIX.md`; this registry is the v3 source of truth.

## Success criteria

| ID | Acceptance check | Status | Evidence |
| --- | --- | --- | --- |
| SC1 | Greeting on every app open, owner name, pronunciation override, <=2 sentences, varied, <=3 s after UI ready, offline, interruptible, mute/quiet hours | FAIL | No greeting engine or startup speech exists. `apps/desktop/src/main/index.ts` creates the window and tray only. |
| SC2 | 30-prompt persona suite across 3 provider profiles, >=95% rule checks; provider switch loses no memory, plan or confirmation | FAIL | No persona suite, prompt compiler, Turn Decision schema or style normalizer. `DefaultConversationEngine` sends plain messages. |
| SC3 | >=10 app tasks observed and measured; elevated/secure refused with explanation | FAIL | No UIA service, integrity probe, capability store or benchmark harness. Only `cmd /c start` aliases and SendKeys. |
| SC4 | Fixture messenger flow: resolve, ambiguity, read-back, policy, send, observe; Sent only when observed; last seen on request | FAIL | `sendWhatsAppMessage` always returns `sent: true` after SendKeys and does not verify. Tool is risk class 2 with no confirmation. |
| SC5 | Login start, single instance, restart after own crash/hang, never after Stop/Exit/termination, sleep/mic changes, measured idle | FAIL | No single-instance lock, supervisor, stop marker or heartbeat. Tray has pause and exit only. |
| SC6 | On-device wake word, measured false accepts, visible mic state, no raw audio stored | BLOCKED | G1 approval is required for on-device models/always-listening. Current code starts continuous Windows dictation when a chat is active; no wake word. |
| SC7 | Simulation proves budget, quiet hours, cooldowns, dismissals reduce frequency; every nudge has a reason | NOT BUILT | No proactive engine. |
| SC8 | Local match first with ranked disambiguation, fallback chain, quota tracking, no scraping | FAIL | `playMedia` walks folders with a substring match, then scrapes YouTube HTML and opens the first video. Scraping violates M3. |
| SC9 | Evidence thresholds, approval before facts, no sensitive-trait inference, weekly review, self-healing recipes | PARTIAL | Memory proposals and approval inbox exist (`packages/core/src/memory`), but no thresholds, review, sensitive-trait guard or recipes. |
| SC10 | Class 4 blocked, Class 3 enforced, injection corpus cannot act, locked-screen commands ignored | FAIL | Policy blocks Class 4 at registry/policy level, but IPC grants every permission and `osTryCommand` auto-confirms Class 3. No lock check, injection corpus or audio/screen-text guard. |
| SC11 | Every row PASS/BLOCKED/MANUAL with evidence; two consecutive clean sweeps | FAIL | This registry is new; no sweep has been recorded. |
| SC12 | Clean build/lint/types/tests, kill tests, one-hour soak | PARTIAL | Baseline verify passed 182 tests and build, with 6 lint warnings. No kill tests or soak. |

## Constancy

| ID | Acceptance check | Status | Evidence |
| --- | --- | --- | --- |
| K1 | Identical Context Packet for every provider | NOT BUILT | No prompt compiler. |
| K2 | Turn Decision validated, repaired once, then failover | NOT BUILT | No schema or validator. |
| K3 | Style normalizer enforces length, name, banned phrases, honesty markers | NOT BUILT | No normalizer. |
| K4 | Persona suite >=95% | NOT BUILT | No suite. |
| K5 | Provider switch preserves working memory, plan, pending confirmations | PARTIAL | Conversations and confirmations persist in DB only while the process lives; plans do not exist. Pending confirmations are in-memory only. |
| K6 | All providers down still serves fast path | PARTIAL | Memory browser, chat history and the setup UI remain; there is no deterministic intent router or offline command path beyond hard-coded string matching. |

## Voice

| ID | Acceptance check | Status | Evidence |
| --- | --- | --- | --- |
| V1 | Greeting uses stored name and pronunciation, offline | FAIL | No greeting composer; owner name is only injected into the chat prompt. |
| V2 | Greeting never delays startup | FAIL | No greeting path to measure. |
| V3 | Barge-in works | PARTIAL | Renderer calls `voiceStopSpeaking`; no startup greeting to interrupt. |
| V4 | Listening pauses while speaking | PARTIAL | Renderer tracks `speaking` but the Windows recognizer keeps running. |
| V5 | Wake word on-device, memory buffer only | BLOCKED | G1. Current code uses continuous dictation, not a wake word. |
| V6 | No raw audio on disk (scan) | PARTIAL | PowerShell recognizer streams text; no audio file is written by the current code, but no automated scan exists. |
| V7 | Mute stops capture | FAIL | Mute is renderer state; `voiceStop` is called when muted toggles, but the main process has no persistent mute setting and OS TTS is not gated by it. |
| V8 | Locked session ignores commands | FAIL | No session-lock check anywhere. |
| V9 | Speak-safe rule enforced | FAIL | Renderer speaks arbitrary assistant content; no screen-only rule. |

## Action stack

| ID | Acceptance check | Status | Evidence |
| --- | --- | --- | --- |
| O1 | Refuse elevated/secure targets with explanation | FAIL | No integrity or secure-desktop check. |
| O2 | Denylist enforced | FAIL | No password-manager, banking, Windows Security or password-field denylist. |
| O3 | Every action has a verified postcondition | FAIL | Tools return booleans from launch exit codes; no observed postcondition. |
| O4 | Capability probe and store | NOT BUILT | No probe. |
| O5 | Emergency stop cancels all automation within 1 s | NOT BUILT | No global stop. |
| O6 | Recipes self-heal without raising permissions | NOT BUILT | No recipes. |
| O7 | Clipboard restored after paste entry | NOT BUILT | No paste entry path. |
| O8 | Vision fallback off unless authorized, indicator shown | NOT BUILT | No vision path. |

## Messaging

| ID | Acceptance check | Status | Evidence |
| --- | --- | --- | --- |
| W1 | Contact ambiguity asks | FAIL | Natural-language parser defaults missing contact to `contact`. |
| W2 | Read-back and policy enforced | FAIL | WhatsApp tool is class 2, no confirmation; IPC auto-confirms. |
| W3 | Sent only when observed | FAIL | `sendWhatsAppMessage` returns `sent: true` on PowerShell exit 0. |
| W4 | Last seen on demand only, hidden handled | NOT BUILT | No last-seen path. |
| W5 | No monitoring or alerts about a person | NOT BUILT | No monitoring exists, but no guard/test. |
| W6 | Hourly cap | NOT BUILT | No cap. |
| W7 | Fixture messenger tests in CI | NOT BUILT | No fixture app. |
| W8 | No unofficial clients in dependency tree | PASS | Dependency inspection: no WhatsApp protocol library. |

## Media

| ID | Acceptance check | Status | Evidence |
| --- | --- | --- | --- |
| M1 | Local-first search with disambiguation | FAIL | Substring walk only, first match wins. |
| M2 | Fallback chain with quota ledger | FAIL | Provider quota ledger exists; media chain does not use it. |
| M3 | No scraping, no pirate sources | FAIL | `playMedia` scrapes `youtube.com/results` HTML. |
| M4 | Cached meaning of names | NOT BUILT | No cache. |

## Proactive engine

| ID | Acceptance check | Status | Evidence |
| --- | --- | --- | --- |
| P1 | Budget, quiet hours, cooldowns | NOT BUILT | No proactive engine. |
| P2 | Reason stored for every nudge | NOT BUILT | No nudge records. |
| P3 | Receptivity learning visible and resettable | NOT BUILT | No model. |
| P4 | Private details not spoken by default | FAIL | Assistant replies are spoken verbatim. |

## Learning

| ID | Acceptance check | Status | Evidence |
| --- | --- | --- | --- |
| L1 | Evidence thresholds | FAIL | Recorder stores every exchange as a proposed memory with confidence 0.5. |
| L2 | Nothing becomes fact without approval | PASS | `approval.ts` and `SqliteMemoryRepository` separate proposed/approved; retriever only searches approved memories. |
| L3 | Rejected proposals not repeated | FAIL | No rejection memory or suppression check. |
| L4 | No sensitive-trait inference (fixtures) | NOT BUILT | No guard or fixtures. |
| L5 | Third-party message content not learned by default | FAIL | Conversation recorder stores the whole exchange. |
| L6 | Policy bundle unchanged by learning (tamper test) | NOT BUILT | No policy bundle or tamper test. |

## Safety

| ID | Acceptance check | Status | Evidence |
| --- | --- | --- | --- |
| S1 | Injection corpus incl. screen text and audio cannot trigger actions | FAIL | No corpus; `osTryCommand` routes arbitrary text. |
| S2 | Class 4 blocked on every path | PARTIAL | Registry rejects Class 4 and policy denies it; no path-level tests for adapters/IPC. |
| S3 | Class 3 policy | FAIL | `osTryCommand` auto-confirms; class 3 WhatsApp is class 2. |
| S4 | No secrets anywhere (canary scan) | PARTIAL | Storage tests scan one profile; no repository-wide canary scan. |

## Next actions

1. Fix the critical trust boundary: owner intent source, lock check, no auto-confirm, class 3 confirmation UI, deny untrusted content.
2. Add Greeting Composer + offline TTS + mute/quiet-hours settings.
3. Add prompt compiler, Turn Decision validation, style normalizer and persona suite.
4. Replace media scraping with a local index and official search fallback.
5. Add proactive and learning guard modules with tests.
