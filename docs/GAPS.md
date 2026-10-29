# Gap List (v3 brief)

Baseline: 2026-10-29. Graded against `docs/REQUIREMENTS.md`. `npm.cmd run verify` passed 182 tests, but the tests do not cover the gaps below.

## Critical

| ID | Gap | Evidence | Dependency |
| --- | --- | --- | --- |
| GAP-01 | Untrusted text can execute OS actions, and Class 3 actions auto-confirm | `apps/desktop/src/main/index.ts:685-701` grants every permission; `:859-863` confirms any `needs_confirmation` result immediately. `osTryCommand` accepts any renderer text as trusted. | None. Fix first. |
| GAP-02 | WhatsApp reports `sent: true` without observing a sent message; tool is risk class 2 | `packages/core/src/os-control/windows.ts:373-411`; `tools.ts:209-229`. Violates SC4/W2/W3. | GAP-01 |
| GAP-03 | Media playback scrapes YouTube HTML, which the brief forbids | `packages/core/src/os-control/windows.ts:97-116`. | None; replace with official search page or API. |
| GAP-04 | No locked-screen, elevated-window or sensitive-window guard | No code; `docs/REQUIREMENTS.md` O1/O2/V8. | GAP-01 |
| GAP-05 | No greeting at app open | `apps/desktop/src/main/index.ts` has no greeting path; SC1 fails. | None. |

## High

| ID | Gap | Evidence | Dependency |
| --- | --- | --- | --- |
| GAP-06 | No persona contract, prompt compiler, Turn Decision or style normalizer | `DefaultConversationEngine` sends plain text; SC2/K1-K4 fail. | None. |
| GAP-07 | Continuous dictation starts when a chat is active; no wake word, no explicit persistent mute | `App.tsx:106-113`, `:320-349`; SC6/V5/V7. | G1 for wake word. Mute can be fixed now. |
| GAP-08 | No media ranking or disambiguation | `playMedia` first substring match; SC8/M1 fails. | GAP-03 |
| GAP-09 | No proactive engine or reason records | None; SC7/P1-P4 fail. | None; core module can be added. |
| GAP-10 | No evidence thresholds, sensitive-trait guard, rejection suppression or weekly review | `memory/recorder.ts` records every exchange; SC9/L1/L3/L4/L5 fail. | None. |
| GAP-11 | No single-instance lock, supervisor, heartbeat or stop marker | Main process lifecycle; SC5 fails. | None, but hang restart requires a supervisor design. |
| GAP-12 | No injection corpus or screen-text trust boundary test | No tests; SC10/S1 fails. | GAP-01 |

## Medium

| ID | Gap | Evidence | Dependency |
| --- | --- | --- | --- |
| GAP-13 | No postcondition verification for OS actions | Tools return launch success; O3 fails. | UIA or process/window probe |
| GAP-14 | No UIA service, capability probe or app adapters | O1-O4, SC3 fail. | None, but large. |
| GAP-15 | No fixture messenger in CI | W7 fails. | GAP-02 |
| GAP-16 | No last-seen reader | W4 fails. | UIA |
| GAP-17 | No emergency stop | O5 fails. | None; small core module. |
| GAP-18 | Clipboard may not be restored after paste | O7: no paste path exists, so not yet testable. | UIA |
| GAP-19 | No kill tests or soak | SC12 partial. | After feature work. |
| GAP-20 | Six ESLint warnings for unused disable directives | `npm run verify` output, 2026-10-29. | None. |

## Low

| ID | Gap | Evidence | Dependency |
| --- | --- | --- | --- |
| GAP-21 | Installer unsigned and not clean-machine tested | PROJECT_STATE known defects. | Owner/VM |
| GAP-22 | CI has not run on GitHub | Repository not pushed. | Owner push decision |
| GAP-23 | No third-party notices in packaged app | PROJECT_STATE known defects. | Release work |

## Fix order

1. GAP-01, GAP-02, GAP-04: trust boundary and action authorization.
2. GAP-03, GAP-08: media safety and ranking.
3. GAP-05, GAP-07: greeting and mute.
4. GAP-06: constancy core.
5. GAP-09, GAP-10: proactive and learning cores.
6. GAP-11, GAP-17, GAP-12: lifecycle, emergency stop, injection tests.
7. GAP-13 to GAP-16: UIA and fixture messenger.
8. GAP-19 to GAP-23: verification and release.
