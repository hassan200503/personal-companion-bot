# Project State

Last updated: 2026-10-30
Brief: `docs/AGENT_BRIEF.md` (v3 master brief, adopted 2026-10-29). The previous handoff brief is archived at `docs/archive/AGENT_BRIEF-v1-handoff.md`.
Current milestone: M1 voice-first companion slice
Status: Speech-first production slice (scope B) is in tree: renderer mic + VAD → Gemini transcription (consent-gated), WinRT helper TTS-only, hardened call/WhatsApp/media honesty, voice-first UI, and a spoken voice-guided onboarding flow that collects owner details, bot preferences, privacy preset and cloud-speech consent. Latest full verify: 44 files / 297 tests. Email, wake word, and signed/clean-machine install remain out of scope.

## What this project is

A Windows-first personal AI companion in `companion/`, built alongside the legacy WhatsApp persona bot in `src/`. The companion must greet its owner aloud, listen safely, act on the PC with observed results, remember only approved facts, stay the same character across providers, and never claim more than it verified.

The legacy bot is separate and must not be changed or restarted without the owner's approval. Never read `.env`, `auth/`, `data/style-log.jsonl` or `data/companion.db*`.

## Baseline (2026-10-29)

- Repository: `C:\Users\kkc36\Documents\personal-companion-bot`, branch `main`, clean before the v3 work.
- `git log --oneline -10` HEAD: `6244f85 Improve WhatsApp automation: search contact and send`.
- `npm.cmd run verify` from `companion/`: ESLint 0 errors / 6 warnings, TypeScript clean, 20 test files / 182 tests passed, Electron main/preload and Vite renderer built.
- `docs/AGENT_BRIEF.md` replaced with the v3 master brief; v1 archived.
- New registry `docs/REQUIREMENTS.md` grades every SC and K/V/O/W/M/P/L/S row from source inspection and the baseline run. New `docs/GAPS.md` records the fix order.
- Latest `npm.cmd run verify`: 0 lint errors/warnings, TypeScript clean, 21 test files / 201 tests passed, Electron main/preload and Vite renderer built (section 15).
- The existing tests are mostly storage, onboarding, provider and memory unit tests. New security/tool tests cover trusted-intent denial, lock/secure desktop, sensitive targets, class 3/4 policy, confirmation mismatch and the honest WhatsApp return. There is still no Electron E2E, real lock transition, fixture messenger or injection corpus.

## Already working (verified by tests or inspection)

- Encrypted SQLCipher-compatible storage, DPAPI-wrapped keys, Windows Credential Manager, migrations, snapshots, portable export/restore (20 storage tests).
- Resumable onboarding engine, system check and preset steps.
- Provider catalog, router with quota ledger/circuit breaker/fallback, mock provider and Gemini/OpenAI-compatible/Anthropic adapters (unit-tested; live accounts not tested).
- Conversation history persisted in SQLite with FTS5.
- Memory proposals, approval inbox, corrections and retrieval of approved memories.
- Tool registry blocks Class 4 registration; policy denies Class 4; audit log persists.
- Electron shell with sandboxed preload, session token on IPC, tray, pause/exit, update check, provider setup UI and chat UI.
- Trusted-intent guard, environment probe (locked/secure desktop + foreground process/title), sensitive-target denylist, fail-closed probe errors, class 3 confirmation, confirmation mismatch detection and emergency-stop core.
- IPC now grants a safe default permission set, supplies the real environment snapshot, marks non-owner sources untrusted, and never auto-confirms.
- WhatsApp returns typed/sent/verified honestly; no "Sent" claim without observation.
- `playMedia` opens the official search page instead of scraping HTML.
- Startup greeting with owner name and time of day; explicit Start listening instead of auto-dictation.
- Voice-first desktop slice: compiled `CompanionVoice.exe` for TTS; live listening via `VoiceCapture` + Gemini `transcribe` with persisted `cloudSpeechConsent`; echo guard pauses capture during TTS.
- OS honesty: `os.call` supports tel digits or contact/Phone Link search; WhatsApp observes outgoing bubbles before `sent/verified`; media prefers ranked local play and honest YouTube search fallback.
- Voice-guided onboarding: bot speaks setup steps; owner sets name/phone/dob, companion name/tone/boundaries, privacy preset, cloud speech, and Gemini provider before chat.
- Persona slice: persisted tone/name/boundaries, companion prompt injection, and model-backed proactive questions with quiet hours/daily cap.
- Email IMAP/SMTP with Keytar app-password, Class-3 `email.send` confirmation, important-mail proactive alerts, and web research tools (untrusted_content).
- Enterprise Talk/Settings shell: ChatStage, SettingsShell, AlertsRail, MemoryInbox, ConfirmModal; WinRT SSML prosody/pitch and barge-in chunked digests.
- Packaged runtime evidence: NSIS installer rebuilt after production hardening (`Companion-0.1.0-x64.exe`, SHA-256 `32E04C31DFB2FD78CC7C02996BBE8174B0F2138DF1AA2A14CADE86675143B8E8`, V-83); prior unpacked smoke verified bundled helper TTS.

## Safety slice status

1. FIXED: trusted-intent and IPC permission boundary; verified by unit tests and typecheck.
2. FIXED: Class 3 confirmation and no auto-confirm; confirmation UI exists; end-to-end test still pending.
3. FIXED: WhatsApp honesty and risk class; observation reader still absent.
4. FIXED: YouTube HTML scraping removed.
5. PARTIAL: lock/secure desktop and sensitive-target guard; no real integrity-level probe.
6. PARTIAL: greeting is composed, respects mute/quiet hours and was audibly spoken through WinRT; pronunciation overrides and startup-latency measurement remain open.
7. PARTIAL: visible mic state, consent-gated Gemini listen, persisted mute/consent; no wake word (G1).

## Open critical work

1. Add an injection corpus and explicit routing of screen/audio text as `untrusted_content`.
2. Add an Electron E2E test for confirmation, denial and locked-screen behavior.
3. Add a real integrity-level/elevated-window check and postcondition observation.
4. Replace substring media matching with ranked local results and an official fallback.
5. Add prompt compiler, Turn Decision contract, style normalizer and persona suite.

## Blocked

| Item | Reason | Unblock condition |
| --- | --- | --- |
| Wake word / always-listening default (SC6, V5) | G1 requires owner approval for on-device speech models and always-listening | Owner answers G1 |
| Local-only / wake-word ASR (V5) | Unpackaged WinRT recognition needs package identity; replaced for conversation by Gemini cloud ASR with consent | G1 for on-device models; owner enables cloud speech + Gemini key for current path |
| Vision fallback / screenshots leaving the PC (O8) | G2 | Owner answers G2 |
| Real WhatsApp sending and account risk (SC4, G3) | G3 | Owner answers G3 and provides a test account |
| UIA/elevated control beyond standard user (G4) | G4 | Owner answers G4 |
| Clean-machine install, GitHub CI, paid signing | Owner/VM/release work | Owner action |

## Next three tasks

1. Live packaged smoke: voice onboarding → cloud speech consent → spoken utterance → transcript → spoken reply; confirm no raw audio files.
2. Wire every screen/audio/file producer to `routeExternalContent`, then add an Electron E2E test for confirmation/denial/locked screen.
3. Optional email (Outlook) and local ASR/wake word after owner gates.

## Commands that work

Repository:

```text
git status --short
git log --oneline -10
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

`npm run verify` is the required gate before a commit. `npm start` opens a window and does not exit by itself. `npm run package` writes to `apps/desktop/release/` and is unsigned.

## Known defects

- No automated Electron GUI test; manual CDP smoke covered startup, Chat-tab voice auto-start, persona calibration, proactive questions and typed chat, but confirmation UI, media UI and lock transitions are not yet observed end-to-end.
- Real Windows lock/secure-desktop/elevated target transitions were not exercised; the foreground token-integrity probe and lifecycle markers are implemented and smoke-tested, but runtime security transition evidence is pending.
- `sendWhatsAppMessage` still has no UI-automation observation; it correctly reports `typed_but_unconfirmed`, but `sent/verified` can never become true yet.
- Greeting composer is integrated into the renderer with persisted mute/quiet-hour settings and was audibly spoken through WinRT; editable pronunciation and <=3 s UI-ready timing remain unmeasured.
- Mute is renderer state only; it stops the active listener and TTS, but the preference is not persisted and main-process TTS is not independently gated.
- WinRT microphone recognition is blocked by the Windows speech privacy setting on this machine; the SAPI fallback starts but misrecognized loopback TTS (for example, one token at 0.003 confidence), so it is not yet a usable conversation input.
- The voice helper and build script are Windows-only and require the Windows SDK `Windows.winmd` at build time; the packaged app ships the compiled helper and falls back if it is missing.
- Injection corpus covers seven external origins and classes 1-3; fixture messenger, ranked media, proactive and learning-policy tests now run. Desktop chat no longer copies conversation content into learning by default, but producer wiring, kill tests and soak remain open.
- NSIS packaging produced `apps/desktop/release/Companion-0.1.0-x64.exe` (2026-10-30 SHA-256 `32E04C31DFB2FD78CC7C02996BBE8174B0F2138DF1AA2A14CADE86675143B8E8`, V-83), and packaged runtime/supervisor external-termination smokes passed in V-65/V-69 plus the voice-helper smoke in V-77; the installer is unsigned, uses the default icon, and has not been installed on a clean machine; SmartScreen/uninstall/first-run remain unverified.
- `main` is pushed to GitHub; CI still has not been confirmed green on the remote.
- Logger redaction does not cover secrets embedded in free-text messages or error strings.
- Runtime memory and idle CPU were not measured.
- Third-party MIT notices for bundled native packages are not in the package.
- Legacy WhatsApp bot health was not exercised this session.

## Open questions for the owner

- G1: approve on-device Windows speech/wake word and always-listening default, or keep push-to-talk only?
- G2: allow vision fallback/screenshots to leave the machine?
- G3: approve real WhatsApp sending and accept the account risk? Provide a test account.
- G4: approve any elevated/UIAccess control or code signing?
- G6/G7/G8 if a later task needs spending, policy changes or a destructive operation.

## Handover note

Start with `docs/AGENT_BRIEF.md`, then this file, `docs/REQUIREMENTS.md`, `docs/GAPS.md`, `docs/VERIFICATION_LOG.md` section 14, and `docs/DECISIONS/`. The code is in `companion/`; the v3 brief is stricter than the old matrix. Trust code and test output over notes. Do not mark a row PASS without a recorded command and observed output. Do not push.
