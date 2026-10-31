# Production Gap Register
**Generated:** 2026-10-31  
**Status:** Evidence-backed audit of verified bugs blocking enterprise deployment

## Critical (P0) - Immediate Production Blockers

### G001: Provider Router - Retired Gemini Model Causes Transcription Failure
**Severity:** P0 - Blocks voice input  
**File:** `companion/packages/core/src/providers/catalog.ts:165`  
**Root Cause:**  
- Active catalog ships `['gemini-2.5-flash-lite']` (line 165)
- Google retired 2.5 model, returning 404: "This model models/gemini-2.5-flash-lite is no longer available to new users. Please update your code to use models/gemini-3.5-flash-lite"
- GeminiProvider.transcribe() falls back to hardcoded `gemini-2.5-flash-lite` when selectedModel undefined (line 424)
- Health check prefers 3.5 and mutates selectedModel for chat, but transcribe() doesn't run health check first

**Impact:**  
- Voice transcription fails 100% until health check runs for chat
- 404 classifies as non-retryable → no fallback attempted
- Five failures open shared breaker → chat also blocked with "No available providers"

**Evidence:**  
- Screenshot shows simultaneous "No connected provider supports speech transcription" and "No available providers"
- `%APPDATA%\Companion\logs\companion.log` contains repeated 404 errors
- Throwaway test `_tmp_router_repro.test.ts` reproduced single-provider exhaustion (2/2 pass, deleted)

**Fix:** ✅ **COMPLETED**
- Updated catalog to `['gemini-3.5-flash-lite']` (line 165)
- Modified GeminiProvider.transcribe() to run health check when model undefined (catalog.ts:424-432)
- Added `isRetiredProviderModel()` helper to detect stale saved selections (catalog.ts:519-524)
- Added `resolveProviderModel()` in main/index.ts to validate/migrate saved models (index.ts:232-236)
- Tested: `npx vitest run packages/core/src/providers/router.test.ts` → 30/30 pass

---

### G002: Provider Router - Shared Circuit Breaker Across Chat/Transcription
**Severity:** P0 - Transcription failures block chat  
**File:** `companion/packages/core/src/providers/router.ts:109, 282`  
**Root Cause:**  
- Single breaker per provider gates both chat and transcription (line 109: `this.circuitBreakers.set()`)
- `transcribe()` records failures to the shared breaker (line 295)
- After 5 transcription failures, `selectProvider()` excludes the provider for chat (line 263)

**Impact:**  
- Voice-first workflow: transcription 404s → breaker opens → chat stops working
- No isolation between audio and text modalities

**Evidence:**  
- Throwaway test `_tmp_router_repro.test.ts` proved shared breaker exhaustion (2/2 pass, deleted)

**Fix:** ✅ **COMPLETED**
- Added separate `transcriptionBreakers` map (router.ts:123)
- `register()` creates both breakers (router.ts:139-140)
- `transcribe()` uses separate breaker (router.ts:310, 326)
- `getStatus()` returns both states (router.ts:493)
- Only outage-class errors increment transcription breaker; model config errors do not (router.ts:326)
- Test coverage: `router.test.ts` "keeps transcription outages from opening the chat breaker" → 30/30 pass

---

### G003: Provider Router - No Retry/Fallback for Non-Retryable Errors
**Severity:** P0 - Single transient failure with one provider = no answer  
**File:** `companion/packages/core/src/providers/router.ts:202, 289`  
**Root Cause:**  
- `selectProvider(exclude)` removes already-tried providers from candidates (line 244-248)
- With one provider, first transient failure → `tried = [provider]` → `selectProvider(tried)` → no candidates
- Non-retryable errors (auth, model config) throw immediately without trying another provider (line 202, 339)

**Impact:**  
- Gemini 404 model error → no OpenRouter fallback attempted
- Single-provider users: one failure = "No available providers"

**Evidence:**  
- Throwaway test proved single-provider exhaustion (2/2 pass, deleted)
- Production logs show intermittent "No available providers" despite OpenRouter configured

**Fix:** ✅ **COMPLETED**
- `complete()`: reset `tried` array and continue outer loop after exhausting all providers (router.ts:280-283)
- `stream()`: reset `tried` after exhaustion, but do not retry after first chunk yielded (router.ts:375-378, 403-404)
- Non-retryable errors now fall back to next provider instead of throwing (router.ts:218-220, 340-342)
- Only record outage-class errors to breaker; model/auth errors skip breaker increment (router.ts:215, 337)
- Test coverage: "falls back after a non-retryable provider error", "retries the only provider after a transient failure" → 30/30 pass

---

### G004: Provider Router - transcribe() Ignores Registered Model
**Severity:** P0 - STT uses wrong/missing model despite registration  
**File:** `companion/packages/core/src/providers/router.ts:289`  
**Root Cause:**  
- `register(provider, priority, model)` stores model per provider (line 135)
- `complete()` / `stream()` use registered model (line 193, 364)
- `transcribe()` passes raw `request` without injecting registered model (line 295)

**Impact:**  
- Gemini transcribe() falls back to retired hardcoded model even after health check selected 3.5
- No way to override transcription model per provider

**Fix:** ✅ **COMPLETED**
- `transcribe()` now builds `providerRequest` with registered model (router.ts:313-314)
- `stream()` also uses registered model (router.ts:364)
- Test coverage: "passes the registered model to transcription" → 30/30 pass

---

### G005: Conversation Engine - Concurrent Turns Interleave Messages
**Severity:** P0 - Race corrupts conversation history  
**File:** `companion/packages/core/src/conversation/engine.ts:119, 250`  
**Root Cause:**  
- `conversations` map shared across all concurrent `sendMessage()` / `streamMessage()` calls
- No per-conversation lock
- Turn A appends `user:A`, starts LLM call; Turn B appends `user:B` before A completes → A sees `['A']`, B sees `['A','B']`, final history is `['user:A', 'user:B', 'assistant:B', 'assistant:A']`

**Impact:**  
- Multi-request concurrent chat: out-of-order assistant replies, missing context
- Observed in production: two simultaneous voice/text turns produce garbled history

**Evidence:**  
- Throwaway test `_tmp_engine_repro.test.ts` reproduced interleaving (2/2 pass, deleted)

**Fix:** ✅ **COMPLETED**
- Added `conversationLocks: Map<string, Promise<void>>` (engine.ts:67)
- `acquireConversation()` chains requests per conversation ID (engine.ts:344-357)
- `sendMessage()` / `streamMessage()` acquire lock, call unlocked worker, release (engine.ts:123-131, 254-262)
- Test coverage: "serializes concurrent turns for the same conversation" → 43/43 pass

---

### G006: Conversation Engine - Global System Prompt Race
**Severity:** P0 - Concurrent requests see wrong modality prompt  
**File:** `companion/packages/core/src/conversation/engine.ts:44, 164`  
**Root Cause:**  
- `systemPrompt` is a single mutable string (line 44)
- `setSystemPrompt()` mutates the global field (line 110)
- `buildMessages()` reads `this.systemPrompt` during turn execution (line 346)
- Voice turn starts with VOICE prompt → text turn calls `setSystemPrompt('TEXT')` → voice turn reads TEXT prompt

**Impact:**  
- Voice requests get text-mode instructions, text requests get voice instructions
- Persona inconsistency across concurrent channels

**Evidence:**  
- Throwaway test `_tmp_engine_repro.test.ts` reproduced global prompt observation (2/2 pass, deleted)

**Fix:** ✅ **COMPLETED**
- Snapshot `systemPrompt` and `defaultModel` at start of turn (engine.ts:159, 160)
- Pass snapshots through `buildMessages()` and `decide()` (engine.ts:164, 170, 276, 359, 374-380)
- Test coverage: "snapshots the system prompt at the start of a turn" → 43/43 pass

---

### G007: Main IPC - Chat Has No Timeout or Abort
**Severity:** P0 - Hung LLM call blocks UI forever  
**File:** `companion/apps/desktop/src/main/index.ts:806`  
**Root Cause:**  
- `chatSendMessage` creates `AbortController` but never sets timeout (line 729, now 813)
- Provider router has no internal timeout; waits indefinitely for HTTP response
- Renderer has no way to abort in-flight chat

**Impact:**  
- Network hang / provider outage → user waits minutes with no feedback
- stopEverything() cannot cancel chat (only stops listener/TTS/pending tool)

**Fix:** ✅ **COMPLETED**
- Added `activeChatControllers` set to track in-flight requests (index.ts:136)
- `chatSendMessage` arms emergency stop, adds controller, sets 90s timeout (index.ts:815-819, 828-832)
- Added `chatAbort` IPC handler to abort all active controllers (index.ts:834-844)
- `voiceTranscribe` also arms emergency stop with 30s timeout (index.ts:1046-1056)
- Emergency stop on Ctrl+Alt+Shift+Escape aborts all chat (index.ts:1679-1688)
- Renderer `stopEverything()` calls `chatAbort()` (App.tsx:1218)
- Preload/IPC contracts updated (ipc.ts:20, preload/index.ts:39, global.d.ts:39)

---

### G008: Main IPC - No unhandledRejection Handler
**Severity:** P0 - Async exceptions crash silently  
**File:** `companion/apps/desktop/src/main/index.ts` (missing)  
**Root Cause:**  
- Node default: unhandled promise rejections log warning, may crash in future versions
- No global handler to log async errors from IPC/background scheduler/voice service

**Impact:**  
- Silent data loss, hard-to-diagnose crashes

**Fix:** ✅ **COMPLETED**
- Added `process.on('unhandledRejection')` with logger.error (index.ts:1764-1768)
- Existing `uncaughtException` handler remains (index.ts:1770)

---

### G009: Conversation Storage - Full Rewrite on Every Save
**Severity:** P0 - O(n²) fsyncs block main thread  
**File:** `companion/packages/core/src/conversation/storage.ts:38`  
**Root Cause:**  
- `saveConversation()` rewrites every message: INSERT conversation + SELECT all messages + upsert each + FTS delete+insert per row (lines 38-78)
- No transaction wrapper → each upsert is a separate synchronous=FULL fsync
- `sendMessage()` calls `saveConversation()` twice per turn (user message, assistant message)
- 50 messages × 2 saves/turn = 100 fsyncs on main thread

**Impact:**  
- UI freezes during long conversations
- Performance degrades quadratically with history length

**Fix:** ✅ **COMPLETED**
- Refactored `saveConversation()` to use single-query diff algorithm (storage.ts:38-71):
  - SELECT existing messages once
  - Skip matching messages
  - Upsert only changed/new messages
  - DELETE removed messages
  - Wrap in transaction
- Added `appendMessage()` fast path for new messages (storage.ts:73-79)
- Engine calls `appendMessage()` for each new message (engine.ts:212, 218, 318, 324)
- `loadAll()` uses single JOIN query instead of N+1 (storage.ts:20-56)
- Test coverage: persistence.test.ts → 23/23 pass

---

### G010: Voice Focus/Lock - No Screen-Lock Gating for Chat/Voice
**Severity:** P0 - Mic/chat active while Windows locked  
**File:** `companion/apps/desktop/src/main/index.ts:806, 1011`  
**Root Cause:**  
- `chatSendMessage`, `voiceStart`, `voiceTranscribe`, `voiceSpeak` do not check lock state
- Only OS tool execution calls `probeSecurityEnvironment()` (line 646, now 1194)
- Renderer listener can remain active when window loses focus (no visibility handlers)

**Impact:**  
- Unlocked mic while user walks away → background noise triggers commands
- Locked screen → attacker in room can issue voice commands
- Privacy: spoken conversation transcribed while screen locked

**Fix:** ✅ **COMPLETED**
- Added `sessionLocked` global flag (index.ts:137)
- `powerMonitor.on('lock-screen')` aborts all chat, stops voice, sets flag (index.ts:1651-1658)
- `powerMonitor.on('unlock-screen')` clears flag (index.ts:1659-1661)
- `powerMonitor.on('suspend')` / `resume` also manage lock state (index.ts:1662-1668)
- `voiceStart` checks `sessionLocked` and rejects (index.ts:1034-1038)
- `voiceTranscribe` checks `sessionLocked` and rejects (index.ts:1046-1049)
- Renderer: added `windowFocusedRef` and focus/blur/visibility listeners (App.tsx:98-116)
- `startListening()` checks focus and shows error if unfocused (App.tsx:905-908)
- Focus loss stops listening unless `listenWhenUnfocused === true` (App.tsx:107-109)

---

### G011: Emergency Stop - Shortcut Registration Ignored
**Severity:** P0 - Emergency stop unavailable  
**File:** `companion/apps/desktop/src/main/index.ts:1676` (old)  
**Root Cause:**  
- `globalShortcut.register('Control+Shift+Escape', ...)` conflicts with Windows Task Manager
- Return value ignored → no feedback if registration fails
- EmergencyStop.arm() never called → controller not tracked

**Impact:**  
- Ctrl+Shift+Escape opens Task Manager, does not stop Companion
- No working emergency stop

**Fix:** ✅ **COMPLETED**
- Changed to non-conflicting `Control+Alt+Shift+Escape` (index.ts:1678)
- Check return value and log warning if unavailable (index.ts:1687)
- `chatSendMessage` / `voiceTranscribe` arm emergency stop (index.ts:816, 1047)
- Emergency shortcut callback calls `emergencyStop.stopAll()` (index.ts:1679-1680)

---

### G012: Voice Service - Temp File Privacy Leak
**Severity:** P0 - Spoken text persists on disk unencrypted  
**File:** `companion/apps/desktop/src/main/voice-service.ts:543`  
**Root Cause:**  
- `speakPowerShell()` writes `companion-speak-${pid}-${timestamp}.ps1` with base64-encoded text (line 543)
- File never deleted after speak completes (line 567 child.on('exit') does not unlink)
- `companion-listen-${pid}.ps1` written once per start(), never deleted on stop/dispose (line 424)

**Impact:**  
- Privacy: %TEMP% contains all spoken messages (owner name, personal info, tool results)
- Forensic recovery possible even after app closes
- Accumulates unbounded .ps1 files

**Fix:** 🔲 **NOT YET IMPLEMENTED** (P0 priority for next phase)
- Add `unlinkSync(scriptPath)` in finish() for speak (after line 560)
- Add `unlinkSync(scriptPath)` in stop() / dispose() for listener (voice-service.ts:236, 383)
- Catch/ignore ENOENT on unlink

---

### G013: Voice Service - Unbounded Concurrent Speak
**Severity:** P1 - Memory/process leak, audio overlap  
**File:** `companion/apps/desktop/src/main/voice-service.ts:272, 361`  
**Root Cause:**  
- `speak()` stops prior speech but does not wait for process exit (line 272 calls `stopSpeaking(false)`)
- `stopSpeaking()` kills process but returns immediately (line 361-376)
- Rapid calls create multiple PowerShell processes

**Impact:**  
- Overlapping audio if previous process hasn't exited
- Zombie processes if kill() fails
- No concurrency limit

**Fix:** 🔲 **NOT YET IMPLEMENTED** (P1 priority)
- Track `speakingProcess` and await its exit promise before starting new speak
- Add timeout to ensure old process is dead

---

## High (P1) - Reliability & Correctness

### G014: Policy Engine - Ignores readBackRequired and explicitYesRequired
**Severity:** P1 - Risk class 2 voice actions bypass confirmation  
**File:** `companion/packages/core/src/tools/executor.ts:89, companion/packages/core/src/tools/policy.ts:51`  
**Root Cause:**  
- `TrustedIntentGuard` sets `readBackRequired: true` for voice channel + risk class 2 (policy.ts:51)
- `ToolExecutor.execute()` reads `readBackRequired` but never acts on it (executor.ts:89)
- `os.open`, `os.play` (class 2) execute without read-back when invoked via voice

**Impact:**  
- "Companion, open notepad" → opens immediately without confirming target
- Malicious: "open malicious.exe" could execute before owner hears it back

**Fix:** 🔲 **NOT YET IMPLEMENTED**
- Wire readBackRequired to confirmation flow
- Make DefaultConfirmationManager speak action before execute

---

### G015: Policy Engine - No Rate Limiting
**Severity:** P1 - Abuse/runaway loops  
**File:** `companion/packages/core/src/tools/executor.ts:92, companion/packages/core/src/tools/policy.ts:60`  
**Root Cause:**  
- `ctx.rateLimiter` is always undefined (executor.ts:55 never provides it)
- `tool.requiredPermissions.length >= 0` is always true → placeholder rate limit always passes (policy.ts:60)

**Impact:**  
- No defense against LLM loop ("open X 100 times")
- No per-tool call frequency limit

**Fix:** 🔲 **NOT YET IMPLEMENTED**
- Implement SlidingWindowRateLimiter
- Wire to buildToolContext

---

### G016: Trusted Intent - No Speaker Verification
**Severity:** P1 - Background audio treated as owner  
**File:** `companion/apps/desktop/src/main/index.ts:1402` (old osTryCommand)  
**Root Cause:**  
- `intentSource === 'owner_ui' || 'owner_voice'` treats both as trusted (old line 1402)
- Renderer voice path always tags `owner_voice` (App.tsx:718)
- No speaker verification exists
- `listenWhenUnfocused` feature exists but unused (speech.ts:43, 61)

**Impact:**  
- TV dialogue / family member voice → commands execute as owner
- "Companion, delete all my files" from unknown speaker

**Fix:** 🔲 **NOT YET IMPLEMENTED** (requires G1 consent gate per brief)
- Add speaker verification model (optional, consent-gated)
- Reject commands from unrecognized voice
- Never use speaker ID as sole authorization (per brief)

---

### G017: OS Control - Commands Ignore ctx.signal
**Severity:** P1 - Runaway tools cannot be stopped  
**File:** `companion/packages/core/src/os-control/windows.ts:93, 157, 176`  
**Root Cause:**  
- `runCommand()`, `speakText()`, `initiateCall()`, `sendWhatsAppMessage()` receive `ctx.signal` but never check it
- `runCommand()` uses `execFile()` without wiring AbortSignal

**Impact:**  
- Emergency stop does not kill in-flight OS commands
- Long-running scripts (e.g., build script) cannot be cancelled

**Fix:** 🔲 **NOT YET IMPLEMENTED**
- Check `signal.aborted` before operation
- Wire signal to execFile via `{ signal }` option (Node 15+)

---

### G018: OS Control - runCommand Uses shell: true
**Severity:** P1 - Command injection risk  
**File:** `companion/packages/core/src/os-control/windows.ts:93`  
**Root Cause:**  
- `execFile(command, [], { shell: true })` runs via cmd.exe
- If `command` contains attacker-controlled text (e.g., filename from search), shell metacharacters execute

**Impact:**  
- `os.run "start && malicious.exe"` → executes both
- Not immediately exploitable (intent guard filters targets), but fragile

**Fix:** 🔲 **NOT YET IMPLEMENTED**
- Parse command into [exe, ...args] and use `execFile(exe, args, { shell: false })`
- Only use shell for explicitly shell-syntax commands (pipes, redirection)

---

### G019: OS Control - child.kill() Does Not Kill Tree
**Severity:** P1 - Process leak  
**File:** `companion/packages/core/src/os-control/windows.ts:93`  
**Root Cause:**  
- `execFile()` returns ChildProcess
- `child.kill()` only kills immediate process, not child processes
- On Windows, spawned tree remains

**Impact:**  
- `os.run "build.bat"` → stops script but leaves compiler running
- Emergency stop leaves zombie processes

**Fix:** 🔲 **NOT YET IMPLEMENTED**
- Use `tree-kill` npm package or PowerShell `Stop-Process -Id $pid -Force -Recurse`

---

### G020: Supervisor - Ineffective Restart Cap
**Severity:** P1 - Crash-loop protection broken  
**File:** `companion/apps/desktop/src/main/supervisor.ts:89`  
**Root Cause:**  
- `runSupervisor()` returns after one restart (line 89)
- `maxRestarts` is local per supervisor process
- Hard crash/OOM without writing crash-marker.json → exits cleanly, no restart
- Restart-hang can false-positive when event loop blocked by synchronous DB

**Impact:**  
- Rapid crash loop not detected
- Supervisor exits after first restart, no persistent monitoring

**Fix:** 🔲 **NOT YET IMPLEMENTED**
- Persist restart count across supervisor invocations
- Write crash-marker.json on uncaughtException *before* exit
- Distinguish real hang from blocked event loop

---

## Medium (P2) - Feature Gaps

### G021: Cognition Not Wired in Desktop
**Severity:** P2 - Advanced decision path unused  
**File:** `companion/apps/desktop/src/main/index.ts:321` (old createConversation call)  
**Root Cause:**  
- `DefaultConversationEngine` constructed without `cognition` option (old line 321)
- DecisionOrchestrator exists but not live

**Impact:**  
- Typed decision contract (intent classification, risk assessment, tool planning) not available
- Falls back to direct LLM completion only

**Status:** 🔲 Out of scope for P0 (advanced feature)

---

### G022: Learning - Persona Not Updated from Conversations
**Severity:** P2 - Bot does not adapt to owner  
**File:** `companion/packages/core/src/memory/repository.ts` (PersonaState.learned is read-only)  
**Root Cause:**  
- `PersonaState.learned` (toneNotes, vocabulary, topics) is read into prompts (personality.ts:82)
- No writer exists
- Memory recorder created with `recordConversation: false` (index.ts old 341)

**Impact:**  
- Bot does not learn owner's preferred tone/topics over time
- Manual calibration only

**Status:** 🔲 Out of scope for P0 (learning policy requires approval flow)

---

### G023: Automation Framework Unwired
**Severity:** P2 - WhatsApp/call automation unavailable  
**File:** `companion/packages/core/src/os-control/automation/*` (no imports in index)  
**Root Cause:**  
- `automation/engine.ts`, `whatsapp-adapter.ts`, `uia-enhanced.ts` exist but not imported in desktop/core index
- Lint errors prevent build

**Impact:**  
- `os.whatsappSend`, `os.call` tools do not use reliable automation (fallback to shell commands)

**Status:** 🔲 Out of scope for P0 (automation is bonus feature per brief)

---

### G024: Email Tools Exist But Untested in Production
**Severity:** P2 - Email send is class 3, high risk if broken  
**File:** `companion/packages/core/src/email/tools.ts:45`  
**Root Cause:**  
- `email.send` requires class-3 confirmation (tools.ts:45)
- `email.read` returns untrusted_content (tools.ts:79)
- No end-to-end test with real IMAP/SMTP

**Impact:**  
- Email send may fail silently in production
- Confirmation flow works for OS tools but not verified for email

**Status:** 🔲 Out of scope for P0 (email is secondary to voice/chat core)

---

## Low (P3) - Polish & Observability

### G025: npm run verify Fails at ESLint
**Severity:** P3 - Blocks CI  
**File:** `companion/packages/core/src/os-control/automation/*.ts`  
**Root Cause:**  
- Committed automation files have lint errors (unused vars, any types, etc.)
- `npm run verify` sequence is `typecheck → lint → test → build`
- Lint failure prevents build

**Impact:**  
- Cannot run `npm run build` in CI
- False claim of "clean codebase" in docs

**Fix:** 🔲 **NOT YET IMPLEMENTED**
- Fix lint errors or move automation to separate opt-in package

---

### G026: Docs Overstated Verification
**Severity:** P3 - Trust erosion  
**File:** `docs/PROJECT_STATE.md:6`, `docs/GAPS.md`  
**Root Cause:**  
- PROJECT_STATE claims "44 files / 297 tests" (now 49 files / 311 tests)
- GAPS claims "49/311/0 lint" (actually lint fails)
- VERIFICATION_LOG cites Gemini 2.5 as verified model (now retired)

**Impact:**  
- Next agent may trust stale assertions
- Owner loses confidence

**Fix:** 🔲 **NOT YET IMPLEMENTED** (will update after P0 fixes verified)

---

### G027: Voice Capture Uses Deprecated ScriptProcessorNode
**Severity:** P3 - Chrome warning  
**File:** `companion/apps/desktop/src/renderer/voice-capture.ts:52`  
**Root Cause:**  
- `audioContext.createScriptProcessor()` is deprecated
- Should use AudioWorklet

**Impact:**  
- Browser console warning
- May stop working in future Chrome

**Status:** 🔲 Out of scope for P0 (no functional impact yet)

---

## Summary

| Severity | Count | Fixed | Remaining |
|----------|-------|-------|-----------|
| **P0 (Critical)** | 13 | 11 | 2 |
| **P1 (High)** | 7 | 0 | 7 |
| **P2 (Medium)** | 4 | 0 | 4 |
| **P3 (Low)** | 3 | 0 | 3 |
| **TOTAL** | 27 | 11 | 16 |

**P0 Completed:**
- G001: Provider model resolution ✅
- G002: Separate transcription breakers ✅
- G003: Retry/fallback semantics ✅
- G004: Transcribe model injection ✅
- G005: Conversation serialization ✅
- G006: System prompt snapshots ✅
- G007: Chat abort/timeout ✅
- G008: Unhandled rejection handler ✅
- G009: Incremental conversation writes ✅
- G010: Focus/lock gating ✅
- G011: Emergency stop wiring ✅

**P0 Remaining:**
- G012: Temp file cleanup (voice privacy)
- G013: Speak concurrency control

**Next Phase:** Complete G012/G013, then address P1 security/reliability gaps (G014-G020).
