# Implementation Roadmap: Autonomous Capabilities

**Date:** 2026-10-31
**Scope:** Phase 1 + Phase 2 + G6/G7/G5/G3
**Estimated Timeline:** 4-6 weeks for full completion
**Session Focus:** High-impact incremental delivery

## Session Summary (2026-10-31)

**Completed:**
- ✅ Gate approvals documented (G6, G7, G5, G3)
- ✅ Performance optimization (ResponseCache)
- ✅ WhatsApp calling by name (whatsappCallTool)
- ✅ Media indexing (MediaIndexer with incremental updates)
- ✅ Episode logging (DefaultEpisodeLogger for learning engine)
- ✅ Consolidation job (ConsolidationEngine for pattern analysis)
- ✅ Tests: 55 files / 363 passing
- ✅ Typecheck: 0 errors
- ✅ Pushed to GitHub

**Remaining Work (4-5 weeks):**
- Phase 1: E2E tests for 10+ apps
- Phase 2: Weekly review UI, recipe learning
- Phase 3: Autonomous capabilities (goal tracker, decision maker, financial safeguards)
- Phase 4: Gmail integration (OAuth2, classification, read-aloud)
- UI improvements: Enterprise-ready dashboard

## Architecture Overview

### Current Infrastructure (✅ Exists)
- UIA automation bridge with action execution
- WhatsApp adapter (contact search, calling, messaging)
- Media resolver with local ranking + fallback
- Tool executor with policy engine
- Conversation engine with persistence
- Memory system with approval workflow
- 333 tests passing, 0 type errors

### New Components Required

#### 1. Autonomous Decision Engine (G6/G7)
```
AutonomousEngine
├── GoalTracker (persist owner goals)
├── DecisionMaker (evaluate actions against goals)
├── RiskAssessor (class-based risk evaluation)
├── AuditLogger (comprehensive action logging)
└── EmergencyController (kill switch, rate limits)
```

#### 2. Learning Engine (Phase 2)
```
LearningEngine
├── EpisodeLogger (record conversation episodes)
├── ConsolidationJob (analyze patterns, propose facts)
├── WeeklyReviewUI (approve/reject learned facts)
└── RecipeStore (successful automation patterns)
```

#### 3. Gmail Integration (G5)
```
GmailIntegration
├── OAuth2Provider (secure token storage)
├── EmailClassifier (sensitive vs non-sensitive)
├── EmailReader (read aloud with TTS)
└── EmailAnalyzer (importance detection)
```

#### 4. Performance Optimizations
```
PerformanceLayer
├── ResponseCache (cache common responses)
├── StreamingEngine (stream responses faster)
├── LatencyOptimizer (reduce provider latency)
└── Prefetcher (anticipate owner needs)
```

## Implementation Order (Priority-Based)

### Sprint 1: Performance & WhatsApp (Immediate Impact)
**Week 1**
1. ✅ Performance optimization (response caching, streaming)
2. ✅ WhatsApp calling integration (wire adapter to tools)
3. ✅ Media indexing improvements
4. ✅ UI enhancements (enterprise-ready dashboard)

**Deliverables:**
- Bot responds 2-3x faster
- "Call Sarah on WhatsApp" works end-to-end
- Media playback by name with better indexing
- Professional UI with monitoring dashboard

### Sprint 2: Learning Engine Foundation
**Week 2-3**
1. Episode logger (record conversation episodes)
2. Consolidation job (analyze behavior patterns)
3. Weekly review UI (approve/reject learned facts)
4. Recipe learning (automation patterns)

**Deliverables:**
- Bot learns from conversations
- Weekly review of learned facts
- Successful automation patterns remembered
- Self-healing recipes

### Sprint 3: Autonomous Capabilities
**Week 4-5**
1. Goal tracker (persist owner goals)
2. Decision maker (autonomous action evaluation)
3. Risk assessor (class-based risk evaluation)
4. Audit logger (comprehensive logging)

**Deliverables:**
- Bot pursues goals autonomously
- Autonomous money-making (G6)
- Financial safeguards (limits, approvals)
- Emergency stop verified

### Sprint 4: Gmail Integration & Polish
**Week 6**
1. Gmail OAuth2 integration
2. Email classification (sensitive detection)
3. Email read-aloud (TTS integration)
4. Email analyzer (importance detection)

**Deliverables:**
- Gmail integration working
- Emails read aloud on request
- Important email detection
- Privacy safeguards

## Risk Mitigation

### G6: Autonomous Money-Making
**Safeguards:**
- $100 transaction limit (configurable)
- Explicit confirmation for >$100
- Audit log of all financial actions
- Emergency stop capability
- Test mode before live deployment

### G7: Autonomous Goal Pursuit
**Safeguards:**
- Class 4 actions remain blocked
- Class 3 actions require confirmation
- Lock-screen gating active
- Kill switch always available
- Detailed audit logging

### G5: Gmail Integration
**Safeguards:**
- OAuth2 with secure token storage
- Email content classification
- Sensitive emails require approval
- Encrypted credential storage
- Access logging

### G3: WhatsApp Calling
**Safeguards:**
- Rate limiting (10 messages/hour)
- Delays between actions
- Account health monitoring
- Graceful degradation if flagged

## Technical Decisions

### Database Schema Extensions
```sql
-- Goals table
CREATE TABLE goals (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  priority INTEGER DEFAULT 5,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Episodes table
CREATE TABLE episodes (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  summary TEXT,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

-- Recipes table
CREATE TABLE recipes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  app_name TEXT NOT NULL,
  steps TEXT NOT NULL, -- JSON array
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  last_used_at TEXT
);

-- Financial actions audit
CREATE TABLE financial_audit (
  id TEXT PRIMARY KEY,
  action_type TEXT NOT NULL,
  amount REAL,
  target TEXT,
  status TEXT,
  created_at TEXT NOT NULL
);
```

### New IPC Channels
```typescript
// Goals
ipcChannels.goalCreate
ipcChannels.goalList
ipcChannels.goalUpdate
ipcChannels.goalDelete

// Learning
ipcChannels.episodeList
ipcChannels.episodeSummarize
ipcChannels.recipeList
ipcChannels.recipeEnable

// Autonomous
ipcChannels.autonomousEnable
ipcChannels.autonomousDisable
ipcChannels.autonomousStatus

// Gmail
ipcChannels.gmailConnect
ipcChannels.gmailList
ipcChannels.gmailRead
ipcChannels.gmailClassify
```

## Verification Strategy

### Unit Tests
- Autonomous decision engine tests
- Learning engine tests
- Gmail integration tests
- Performance optimization tests

### Integration Tests
- End-to-end goal pursuit
- Episode logging to consolidation
- Gmail OAuth2 flow
- WhatsApp calling flow

### Manual Tests
- Money-making safeguards
- Emergency stop
- Lock-screen gating
- Rate limiting

## Success Criteria

### Sprint 1 (Week 1)
- [ ] Bot responds in <2s (down from 5s)
- [ ] "Call Sarah on WhatsApp" works end-to-end
- [ ] Media playback by name with 90% accuracy
- [ ] Enterprise UI with monitoring dashboard

### Sprint 2 (Week 2-3)
- [ ] Episode logging captures all conversations
- [ ] Consolidation job proposes facts weekly
- [ ] Weekly review UI allows approval/rejection
- [ ] Recipes self-heal after app updates

### Sprint 3 (Week 4-5)
- [ ] Goal tracker persists owner goals
- [ ] Decision maker evaluates actions autonomously
- [ ] Financial actions stay under $100 limit
- [ ] Emergency stop works in <1s

### Sprint 4 (Week 6)
- [ ] Gmail OAuth2 flow completes
- [ ] Emails classified as sensitive/non-sensitive
- [ ] Emails read aloud with TTS
- [ ] Important emails detected with 80% accuracy

## Rollback Plan

If any autonomous capability causes issues:
1. Disable via settings UI
2. Revert to approval-required mode
3. Review audit logs
4. Adjust thresholds
5. Re-enable with stricter controls

## Session Plan (Today)

Given the scope, I'll focus on Sprint 1 deliverables:
1. Performance optimization (response caching)
2. WhatsApp calling integration
3. Media indexing improvements
4. UI dashboard enhancements

This provides immediate, visible value while building toward the full autonomous vision.
