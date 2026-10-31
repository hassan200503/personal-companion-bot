# G014 & G016: Read-Back Confirmation and Speaker Verification Architecture

**Status:** Designed, not implemented (requires UI/voice-service changes)  
**Date:** 2026-10-31  
**Priority:** P1 (Security/UX) - Defer to next sprint after P0/P1 core hardening

---

## G014: Read-Back Confirmation for Voice Class-2 Actions

### Current State
- `TrustedIntentGuard.evaluate()` sets `readBackRequired: true` for voice channel + risk class 2 (policy.ts:51)
- `ToolExecutor.execute()` reads the flag but never acts on it (executor.ts:89)
- Class-2 actions (os.open, os.play) execute immediately without confirmation

### Design

**Flow:**
1. Tool executor detects `readBackRequired && intentSource === 'owner_voice'`
2. Create pending confirmation (same hash as class-3 flow)
3. Return `{ status: 'needs_read_back', actionHash, readBackText }`
4. Main IPC handler calls `voice-service.speak(readBackText)` and awaits spoken confirmation
5. Renderer shows "Say 'yes' or 'no'" prompt
6. Voice transcript "yes" → renderer calls `osTryCommand` with confirmation hash
7. Tool executes with confirmed hash

**Implementation Tasks:**
```typescript
// 1. executor.ts: Add read-back branch
if (decision.requiresReadBack && !request.confirmationHash) {
  const pending = this.confirmation.createPending(tool.name, tool.version, request.input);
  const readBackText = formatReadBack(tool.name, request.input);
  return { status: 'needs_read_back', actionHash: pending.actionHash, readBackText };
}

// 2. main/index.ts: osTryCommand handles read-back
if (result.status === 'needs_read_back') {
  await voiceService.speak(result.readBackText);
  // Wait for voice "yes"/"no" - requires voice command routing
  return { ...result, pendingVoiceConfirmation: true };
}

// 3. App.tsx: Show read-back UI state
if (pendingAction?.readBack) {
  return <div>"Say 'yes' to proceed or 'no' to cancel"</div>;
}
```

**Acceptance Test:**
```typescript
it('speaks action before executing for voice class-2', async () => {
  const executor = new DefaultToolExecutor(registry, policy, confirmation);
  const ctx = { intentSource: 'owner_voice', ...baseCtx };
  
  // First call: requests read-back
  const result1 = await executor.execute({ toolName: 'os.open', input: { target: 'notepad' } }, ctx);
  expect(result1.status).toBe('needs_read_back');
  expect(result1.readBackText).toContain('notepad');
  
  // Second call: with confirmation
  const result2 = await executor.execute({ 
    toolName: 'os.open', 
    input: { target: 'notepad' },
    confirmationHash: result1.actionHash 
  }, ctx);
  expect(result2.status).toBe('completed');
});
```

**Files to Modify:**
- `packages/core/src/tools/executor.ts` (read-back branch)
- `packages/core/src/tools/contracts.ts` (ToolExecutionResult.readBackText)
- `apps/desktop/src/main/index.ts` (osTryCommand read-back flow)
- `apps/desktop/src/renderer/App.tsx` (voice confirmation UI)

---

## G016: Speaker Verification Architecture

### Current State
- `intentSource === 'owner_ui' || 'owner_voice'` treated as trusted (main/index.ts:1402)
- Renderer voice path always tags `owner_voice`
- No speaker verification exists
- Background/TV audio triggers commands as owner

### Design (Consent-Gated, Optional Feature)

**Requirements from Brief:**
- OPTIONAL: Must be consent-gated (G1 gate)
- On-device model only (no cloud biometrics)
- Never sole authorization (defense-in-depth only)
- Reject unknown voices for class-2+ actions
- Allow degraded mode if model unavailable

**Architecture:**

```
┌─────────────────────────────────────┐
│  Voice Transcript Arrives           │
│  (from renderer VAD → Gemini STT)   │
└────────────┬────────────────────────┘
             │
   ┌─────────▼──────────┐
   │ Speaker Verify?    │
   │ (check consent)    │
   └─────────┬──────────┘
             │
        Yes  │  No → tag owner_voice
             │         (current behavior)
   ┌─────────▼────────────────┐
   │ Extract Voice Embedding  │
   │ (on-device MFCC/i-vector)│
   └─────────┬────────────────┘
             │
   ┌─────────▼────────────────┐
   │ Compare to Owner Profile │
   │ (cosine similarity)      │
   └─────────┬────────────────┘
             │
      ┌──────┴──────┐
      │ Match?      │
      ├─────────────┤
  Yes │         No  │
      │             │
      │   Reject + TTS:
      │   "I don't recognize
      │    that voice"
      │
  Tag owner_voice
  (trusted path)
```

**On-Device Model Options:**
1. **SpeechBrain** (PyTorch, embed via ONNX Runtime)
   - Pre-trained speaker embedding model
   - ~50MB model size
   - Inference: <100ms on CPU
   
2. **Simple MFCC + GMM** (lighter fallback)
   - Extract 13 MFCC coefficients
   - Train Gaussian Mixture Model on owner samples
   - <1MB model, faster but less accurate

**Implementation Phases:**

**Phase 1: Enrollment UI**
```typescript
// Settings > Voice > Speaker Verification (Beta)
// [X] Enable speaker verification (requires 5 voice samples)
// 
// Enrollment:
// 1. Read 5 calibration phrases aloud
// 2. Extract embeddings, save to encrypted profile
// 3. Gate: show consent warning about false rejections
```

**Phase 2: Runtime Verification**
```typescript
// voice-service.ts: Add verify() method
async verify(audioBuffer: ArrayBuffer): Promise<{ isOwner: boolean; confidence: number }> {
  if (!this.speakerModel) return { isOwner: true, confidence: 1.0 }; // Degraded mode
  
  const embedding = await this.extractEmbedding(audioBuffer);
  const similarity = cosineSimilarity(embedding, this.ownerProfile.voiceEmbedding);
  
  return {
    isOwner: similarity > THRESHOLD, // e.g., 0.7
    confidence: similarity
  };
}

// main/index.ts: voiceTranscribe flow
const transcription = await providerRouter.transcribe({ audio, mimeType }, signal);
let intentSource: IntentSource = 'owner_voice';

if (voiceSettings.speakerVerificationEnabled) {
  const verification = await voiceService.verify(audio);
  if (!verification.isOwner) {
    await voiceService.speak("I don't recognize that voice.");
    return { ok: false, error: 'speaker_not_recognized' };
  }
  logger.info('speaker verified', { confidence: verification.confidence });
}
```

**Phase 3: Fallback & Degraded Modes**
- Model load failure → disable verification, log warning
- Low confidence (0.5-0.7) → allow but log for review
- Enrollment < 3 samples → disable feature

**Security Properties:**
- ✅ Defense-in-depth (combines with lock/focus gating)
- ✅ No cloud dependency (all on-device)
- ✅ Consent-gated (explicit opt-in with warning)
- ✅ Graceful degradation (feature-flag controlled)
- ❌ NOT sole authorization (per brief requirement)

**Files to Create:**
- `packages/core/src/voice/speaker-verification.ts` (embedding extraction)
- `apps/desktop/src/main/speaker-model.ts` (ONNX/TensorFlow.js wrapper)
- `apps/desktop/src/renderer/SpeakerEnrollment.tsx` (UI flow)

**Acceptance Criteria:**
1. Unknown voice rejected for class-2+ actions
2. Owner voice passes with >70% confidence
3. Enrollment requires 5+ samples
4. Degrades gracefully if model unavailable
5. Never sole gate (combines with other checks)

---

## Status Summary

| Gap | Status | Reason |
|-----|--------|--------|
| **G014: Read-Back** | 🟡 Designed | Requires voice-service integration + renderer UI |
| **G016: Speaker Verify** | 🟡 Designed | Requires on-device ML model + consent flow |

**Recommendation:** Implement G014 first (simpler, no ML), then G016 as optional beta feature.

**Effort Estimate:**
- G014: 1-2 days (executor + IPC + UI)
- G016: 1 week (model selection, enrollment UI, integration, testing)
