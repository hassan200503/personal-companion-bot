# Audit Report: Personal AI Companion (Windows v1)

Date: 2026-10-27
Commit under audit: 49f1c2e79bf410c181e302ae384a6ff7d477f45d
Branch: main (audit branch: audit/2026-10-27)
Audit worktree: C:\Users\kkc36\Documents\personal-companion-bot-audit-2026-10-27
Environment: Windows 11, Node v24.16.0, npm 11.13.0, TypeScript 6.0.3, Vitest 5.0.5, ESLint 10.13.0

## Verdict
GO-WITH-CONDITIONS

Rationale: The committed build is clean (typecheck, lint, 180 tests x3 with zero flakes, esbuild + Vite build pass), and the core safety controls (Class 4 block at registration and policy, confirmation flow, redaction, encrypted storage, credential store, FTS triggers, IPC session-token auth, bounded reflection) are implemented and partly tested. No Critical defect was found. However, confirmation is not actually bound to the action content hash (High), inferred memory confidence is not capped (High), delete-all-data leaves provider keys in the credential store (High), and Class 4 execution blocking has no test coverage. In addition, install/timing/usability/accessibility/live-provider/multi-day-soak items are MANUAL-REQUIRED because no VM or keys were available. Product docs (PROJECT_STATE, REQUIREMENTS_MATRIX) are stale relative to the code.

## Scoreboard (success targets)
| Target | Requirement | Status | Notes |
|---|---|---|---|
| S1 | A1 | MANUAL-REQUIRED | No clean VM |
| S2 | B13 | MANUAL-REQUIRED | No usability testers |
| S3 | C4 | PASS | Failover in router; router.test passes |
| S4 | C9 | PASS (unit) | Degraded mode + recovery in conversation engine |
| S5 | D6-D9 | PARTIAL | Correction/export work; deletion leaves credential-store keys |
| S6 | F3,F5 | PARTIAL | Confirmation flow works but not bound to content hash; no injection corpus |
| S7 | G1 | PASS (source) | No secret shapes in repo; runtime scan MANUAL |
| S8 | E1,E2,E6 | PARTIAL | Bounded loop + scheduler; no loop detector for repeated actions |
| S9 | B2,B4 | PASS (unit) | Idempotent re-run + Setup Doctor repair |
| S10 | I3 | PARTIAL | Docs stale vs code |

## Test quality (Section 3)
- Inventory: 180 tests, 20 files. Three runs: 180 passed each, 0 flakes. No skipped/only/xfail markers in summary.
- Stub hunt: no TODO/FIXME/NotImplemented/stub/sample-reply hits in TS/TSX. One process.env access (VITE_DEV_SERVER_URL, dev-only).
- Secret scan: only key-prefix hints and test canary strings; no live secrets.
- Mock vs real: real adapters exist (better-sqlite3-multiple-ciphers, @github/keytar) and are selected in production build (createDesktopCredentialStore/KeyProtector). Exercised against in-memory fakes in tests; no recorded-fixture live calls in default suite (hermetic).
- Docs vs code: PROJECT_STATE.md and REQUIREMENTS_MATRIX.md are stale (claim M2/M4 state, "No build", HEAD f0ec874) while code contains storage, memory, tools, onboarding, privacy, background, providers. Overclaims: "secure/private" wording in threat model; "always" not found. README not present in repo (none found).
- Hermetic default suite: passes with no network (npm audit 0 vulnerabilities; tests use fakes).

## Mutation spot-checks (scratch worktree)
| Behavior | Test caught? | Notes |
|---|---|---|
| Policy engine allowing Class 4 | NO | No test covers Class 4 execution path (only registration). Finding. |
| Confirmation not bound to action hash | n/a (design gap) | Confirmation uses randomUUID, not derived from action content. |
| Redaction disabled | YES | logger.test.ts fails. |
| Failover disabled | not run (router tests likely cover) | |
| Memory approval gate removed | not run | |
| Secret scrubber in logs | n/a (same as redaction) | |
| OAuth state check removed | n/a (no OAuth implemented) | |
| Circuit breaker never opening | not run | |
| Delete not removing search index | not run | FTS triggers cover delete. |
| Wizard step not idempotent | not run | detect() satisfied skips. |
"
## Requirement catalog (A-I)

Legend: PASS (verified with evidence), PARTIAL, FAIL, BLOCKED, MANUAL-REQUIRED.

### A. Install and lifecycle
- A1 Install <3min clean Windows: MANUAL-REQUIRED (no VM)
- A2 Installer verifies SHA256: MANUAL-REQUIRED (no installer run)
- A3 Classic installer, SmartScreen docs: MANUAL-REQUIRED
- A4 Per-user startup, removable: MANUAL-REQUIRED
- A5 Pause/Stop/Exit/Disable/Uninstall work, no self-restart: MANUAL-REQUIRED
- A6 Uninstall removes app+startup+creds, keeps data only if chosen: MANUAL-REQUIRED
- A7 Update check verifies hashes + rollback: FAIL (no update check code found)

### B. Onboarding engine and wizard
- B1 Persisted state machine + step registry + detect/run/verify/repair/rollback + module registration: PARTIAL (engine + registry exist; only 2 steps registered in main; executeStep does not call step.verify(); rollback unused)
- B2 Idempotent re-run: PASS
- B3 Resumable after kill at every step: PARTIAL (storage.loadState on init; not crash-tested here)
- B4 Setup Doctor repairs broken key/folder/startup/health: PARTIAL (repair() only re-checks completed steps)
- B5 OAuth PKCE: N/A (API-key providers only; no OAuth code)
- B6 Assisted mode clipboard on explicit click, masked preview, clear clipboard, key-shape hints: FAIL (no clipboard API use found)
- B7 No automated account creation: PASS (no browser automation/CAPTCHA deps)
- B8 Error classes with messages/fix actions: PARTIAL
- B9 Post-key pipeline store/validate/list/probe/quota/routing/health/coverage/schedule re-validation: PARTIAL
- B10 Presets Recommended/Privacy-first/Minimal: PARTIAL
- B11 Optional steps skippable; skipped providers -> memory-and-notes mode: PARTIAL
- B12 Keyboard-only + screen-reader names + contrast: MANUAL-REQUIRED
- B13 First useful reply <5min (5 testers): MANUAL-REQUIRED
- B14 Provider catalog data file with lastVerified + staleness; no dead URLs: PARTIAL (lastVerified 2026-10-26; link check not run)

### C. Provider gateway
- C1 Typed contracts + error taxonomy: PASS
- C2 429 honors Retry-After, backoff+jitter, retry cap, no tight loop: PARTIAL (Retry-After parsed; no backoff/jitter between attempts)
- C3 Circuit breaker open/half-open/close: PASS
- C4 Automatic failover, visible status: PASS
- C5 Quota ledger from headers/failures; no hard-coded quotas: PASS
- C6 Sensitive content/credentials/protected memories not to unauthorized provider incl. fallback: FAIL (no data-class routing or provider approval gating found)
- C7 Redaction before every outbound call: PARTIAL (logger redacts by key name; no outbound payload redaction verified)
- C8 One key per provider, no rotation: PASS
- C9 Degraded mode keeps history/memory/notes/reminders, queues, self-recovers: PARTIAL (degraded flag + recovery; queueing not found)
- C10 Switching providers keeps conversation/memory: PASS
- C11 Cancellation and timeouts: PASS
- C12 Live tests opt-in; default suite hermetic: PASS

### D. Memory
- D1 Categories + envelope fields + specialized payloads: PARTIAL
- D2 Pipeline stages exist and testable: PARTIAL
- D3 Inferred never auto-approved; origins recorded; inferred confidence capped: PARTIAL (confidence NOT capped in memory.propose tool / recorder)
- D4 Health/religion/politics/sexuality not inferred without opt-in: PARTIAL/FAIL (no filter found)
- D5 No credentials/tokens/cookies in memory DB: PASS
- D6 Correction creates superseding record; timeline: PASS
- D7 Deletion removes content + search index + embeddings: PARTIAL (soft delete + FTS trigger; no embeddings)
- D8 Export complete/readable; import round trip: PARTIAL
- D9 Memory survives restart + provider-independent: PASS
- D10 Encrypted at rest; wrong key fails safely: PASS
- D11 Migrations up/down on fixtures; failure leaves DB intact: PASS
- D12 Retrieval lexical+metadata+recency+access; provenance to prompt: PARTIAL
- D13 No profiles of others without consent-based reason: PARTIAL/FAIL (no check)

### E. Companion agent runtime
- E1 Each cycle bounded; loop detector aborts repeats: PARTIAL (bounded loop; no loop detector for repeated actions)
- E2 Reflection uses configured share of quota, yields, pauses: PARTIAL/FAIL (no reflection quota sharing)
- E3 Autonomous actions limited to Class 1 + pre-approved Class 2; else approval inbox: PARTIAL
- E4 Plans/task state persist across restart: FAIL (no plan store)
- E5 Policy bundle read-only + integrity-checked: PARTIAL
- E6 Pause/Stop within stated time + visible indicator: PASS
- E7 No unbounded sub-agents/recursive plans: PASS
- E8 Idle CPU/memory/network measured: MANUAL-REQUIRED
"
### F. Tools and permissions
- F1 Every tool declares required fields; registry validates at load: PARTIAL
- F2 Class 4 blocked on every path incl. model-crafted args: PARTIAL (code blocks; no execution test)
- F3 Class 3 confirmation shows real action/dest/content, bound to one-time hash, replay/double-click no-op: PARTIAL (hash is randomUUID, not derived from action)
- F4 Model arguments validated (schemas, allow-lists, traversal, symlinks, UNC, env expansion): PARTIAL
- F5 Injection corpus cannot trigger tools/grant permissions: FAIL (no corpus/test)
- F6 Outcome states honest: PASS
- F7 Audit log append-only, free of unnecessary private content: PARTIAL (append-only not enforced at DB level)
- F8 General statement authorizes nothing: MANUAL (not tested)
- F9 Email never sent silently: N/A (no email tool)
- F10 UI automation: not built -> confirm not built: PASS

### G. Security and privacy
- G1 No secret in DB/config/logs/backups/exports/crash dumps/git history: PASS (source scan clean; runtime scan MANUAL)
- G2 Credentials only in Windows credential facility, masked, never re-shown: PASS (adapter; UI masking not verified)
- G3 Egress audit: only provider endpoints + no telemetry: PASS
- G4 Dependencies vulns/licenses/lockfiles/pinned: PARTIAL (npm audit 0 vulns; licenses not reviewed)
- G5 Threat model exists, each threat maps to control+test: PARTIAL
- G6 Privacy center shows permissions/providers/folders/memories/retention/actions/confirmations/backup/export/delete: PARTIAL
- G7 Local IPC authenticated + loopback; unauth refused: PASS
- G8 Logs redact keys and private content: PARTIAL (free-text secrets not scrubbed)
- G9 Safe defaults: nothing leaves before ack; permissions just-in-time: PARTIAL

### H. Reliability
- H1 Crash during write leaves DB intact; queued work resumes: PARTIAL
- H2 Graceful shutdown saves state: PASS
- H3 Upgrade/rollback keep data: PARTIAL
- H4 Starts/runs degraded offline: PASS
- H5 One-hour soak no unbounded growth; multi-day MANUAL: MANUAL-REQUIRED

### I. Quality and honesty
- I1 Build/lint/typecheck/tests pass from clean checkout with documented commands: PARTIAL (npm run build wrapper times out in 30s; steps pass)
- I2 No unexplained skipped tests; zero flakes in 3 runs: PASS
- I3 Requirements matrix statuses match evidence: FAIL (matrix stale vs code)
- I4 README/docs claim nothing product can't do: PARTIAL (docs overstate; no README present)
- I5 Accessibility automated checks clean; keyboard-only works: MANUAL-REQUIRED
"
## Defects
- DEF-001 | High | F3 | Confirmation hash is random UUID, not derived from tool name/version/input. Evidence: tools/confirmation.ts createPending; tools/policy.ts actionHash (unused). Suggested: derive actionHash = SHA256(toolName+version+canonicalInput) and bind in confirmation manager.
- DEF-002 | High | D3 | Inferred memory confidence not capped. memory.propose sets confidence=1 regardless of origin; recorder accepts arbitrary confidence. Evidence: tools/first-tools.ts; memory/recorder.ts. Suggested: cap <=0.5 when origin==='inferred'.
- DEF-003 | High | G1 | deleteAllData does not delete provider keys from credential store. Evidence: privacy/contracts.ts deleteAllData. Suggested: iterate listProviderIds and delete each.
- DEF-004 | High | F2 | No test covers Class 4 execution blocking (only registration). Mutation experiment disabled policy check; all 180 tests still passed. Evidence: tools/tools.test.ts; tools/policy.ts. Suggested: add execution-path test.
- DEF-005 | Medium | B1 | Onboarding engine.executeStep never calls step.verify() after run(). Evidence: onboarding/engine.ts. Suggested: call step.verify().
- DEF-006 | Medium | B1 | Only 2 steps registered in main; modules do not self-register. Evidence: apps/desktop/src/main/index.ts openStorage. Suggested: module self-registration.
- DEF-007 | Medium | E1 | No loop detector for repeated tool actions. Evidence: no loopDetector references. Suggested: add repeat detection.
- DEF-008 | Medium | C2 | No exponential backoff with jitter between retry attempts. Evidence: providers/router.ts. Suggested: add backoff sleep.
- DEF-009 | Medium | C6 | No data-class routing / provider approval gating. Evidence: no dataClassification usage in conversation path. Suggested: implement routing policy.
- DEF-010 | Medium | G8 | Logger redacts by key name only; free-text secrets not scrubbed. Evidence: logger.ts. Suggested: regex scrubbing for token shapes.
- DEF-011 | Medium | I1 | Documented `npm run build` (workspace) times out at 30s; esbuild+vite steps pass. Evidence: V0-baseline. Suggested: investigate or document direct commands.
- DEF-012 | Medium | I3 | PROJECT_STATE.md and REQUIREMENTS_MATRIX.md stale (wrong HEAD, test counts, claims). Evidence: docs. Suggested: regenerate.
- DEF-013 | Low | B3 | Resumability not crash-tested. MANUAL follow-up.
- DEF-014 | Low | D4 | No filter preventing inference/storage of health/religion/politics/sexuality. Evidence: memory/recorder.ts, repository.ts. Suggested: sensitivity/origin gating.
- DEF-015 | Low | D12 | Retrieval no recency/access scoring or provenance in prompt. Evidence: memory/retriever.ts. Suggested: enhance scoring.
- DEF-016 | Low | H1 | Crash-during-write test not run. MANUAL follow-up.
"
## Owner manual checklist
- Run timed install on a clean Windows 10/11 VM (<3 min) and record (A1).
- Verify SmartScreen, hash check, access scope, stop, uninstall on a real machine (A2-A6).
- Run NVDA/Narrator on every screen; keyboard-only full flow (B12, I5).
- 5-person usability test: first useful reply <5 min (B13).
- Live provider checks with throwaway keys: failover, degraded mode, quota (C4, C9).
- Multi-day soak; measure idle CPU/memory/network (E8, H5).
- Legal/data-protection review including Kenya.
- Link-check all provider catalog URLs (B14).

## Reproduction commands
From companion/:
- npm run typecheck
- npm run lint
- npm run test
- npm run verify
From companion/apps/desktop/:
- node esbuild.mjs && npx vite build
Offline/hermetic: npm run test (uses fakes; no network needed).
"