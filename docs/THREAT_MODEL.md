# Threat Model

Status: Draft for G2. Storage controls are specified in `docs/DECISIONS/ADR-0002-storage-encryption.md`; the prototype gates passed on 2026-10-25, but production storage is not implemented yet. Revisit at M11 after the acceptance run.

## Assets

- Conversation content, memories, goals, reminders, and personal preferences.
- Provider API keys and the local database encryption key.
- Audit records and permission grants.
- Portable backups and local database snapshots.
- The integrity of the tool registry, permission rules, and policy bundle.
- The owner's Windows account and the files the companion is allowed to touch.

## Trust boundaries

1. The sandboxed renderer is untrusted relative to the Electron main process.
2. The local main process is trusted to enforce policy, but it runs as the owner and is exposed to same-user malware.
3. Windows Credential Manager and DPAPI are OS trust anchors for secrets at rest.
4. Hosted AI providers are external recipients of prompt content. Their policies are not under the app's control.
5. Files, web pages, emails, tool output, and model output are untrusted data, even when they contain instructions.
6. GitHub Releases and downloaded updates are external inputs until their hashes and signatures are verified.

## Adversaries and failure modes

| Threat | Primary controls | Residual risk / milestone |
| --- | --- | --- |
| Another Windows user reads app data | User-scoped DPAPI-wrapped database key; SQLCipher-format encryption; Credential Manager for provider keys | Same-user malware is out of scope; M2 |
| Stolen disk or laptop | Database encryption at rest; DPAPI user scope; recommend BitLocker | An offline attacker who recovers the Windows password may decrypt data; M2/M11 |
| Stolen portable backup | Passphrase-derived AES-256-GCM envelope; strong KDF; no provider keys | Weak passphrase or lost passphrase; M2 |
| Same-user malware or keylogger | Least privilege, no plaintext keys on disk, short key lifetime, OS hardening | Same-user malware can read process memory or input; no full defence in v1 |
| Provider key theft from repo, logs, config, exports, or crash data | Credential Manager only; redacting logger; no keys in backups or fixtures; tests scan for key material | A compromised process can call the credential adapter; M2/M11 |
| Provider leaks or trains on content | Provider approval at G3; data-class routing; redaction before egress; local-only mode; show what each provider receives | Provider policy remains external; M3/M9 |
| Prompt injection from files, web pages, emails, or tool output | Treat all such content as data; tag provenance; no permission grants from content; stricter confirmation after untrusted input | Model may still be fooled; M7/M11 injection corpus |
| Prompt injection from screen text, filenames, notifications, or played audio | `routeExternalContent` assigns `untrusted_content`; corpus tests cover all seven origins and risk classes 1-3 | Runtime producers and Electron E2E coverage remain open; M4/M8 |
| Wake-word false accept or replayed voice | Push-to-talk is the current default; owner voice is not treated as sole authorization for Class 2/3; G1 is required before always-listening | Wake-word false-accept/hour and replay tests are manual and blocked by G1 |
| Hostile app spoofs a window or accessibility element | Check process/window identity and integrity; require observed postconditions; deny sensitive targets | Reusable UIA adapter and hostile-window fixture are not built; M4/M8 |
| Clipboard leakage during text entry | No clipboard paste path is currently exposed; future paste must snapshot, restore and test on success/failure/cancel | O7 and clipboard E2E remain open; M4 |
| Screenshots or vision grounding expose private content | Vision fallback is absent and remains off unless G2 authorizes screen egress; sensitive windows are denylisted | No screenshot-egress implementation or test; G2/M4 |
| TTS reads private content aloud | Renderer and `os.speak` apply safe-speech normalization; private details default to on-screen display | Full Electron audio-content E2E and speaker/privacy review remain open; M3/M4 |
| Tampered or over-privileged learned recipe | Recipes are not yet implemented; design requires app-version binding, postconditions and tool policy re-evaluation on every run | Recipe self-healing and permission non-escalation tests remain open; M7 |
| Runaway automation loop or repeated side effect | Tool executor uses bounded time/steps, abort signals, confirmations and global emergency stop | One-second cancellation measurement and long-loop E2E remain open; M4/M8 |
| Third-party privacy from contacts, last-seen or message content | Messaging is fixture-first; no monitoring; third-party content is excluded from learning by default; last-seen is on-demand only | Real WhatsApp accessibility behavior and privacy review require G3/manual test; M5/M8 |
| Hallucinated or unauthorized tool use | Typed schemas; policy engine outside the model; allow-lists; risk classes; confirmation bound to an action hash; audit log | Policy bugs and ambiguous user intent; M7 |
| Excessive permissions | Request each OS permission when needed; explain why; respect denial; privacy centre shows grants | Owner may over-grant; M5/M9 |
| Malicious files or pages | Sandbox, context isolation, CSP, no arbitrary navigation, no remote content in the renderer | Future file parsers and links expand the surface; M7/M11 |
| Malicious dependency update | Pin native and security-sensitive versions; review release notes; lockfile; dependency scanning; no auto-install at runtime | Single-maintainer native packages are a supply-chain risk; M11 |
| Unintended recording | Voice is off by default and deferred to G6; visible indicator; push-to-talk only; no always-on microphone | OS or hardware compromise; M11 |
| Memory poisoning or false inferences | Explicit vs inferred origin; inferences never auto-approved; conflict detection; owner correction and supersede history | Bad approved data remains until corrected; M6 |
| Accidental deletion | Confirmation for destructive actions; pre-restore and pre-migration snapshots; export before delete | Owner may confirm a destructive action; M9 |
| Provider outage or quota exhaustion | Mock-tested fallback, circuit breakers, degraded mode; history and notes remain local | All providers may be unavailable; M3/M4 |
| Compromised update channel | SHA256 verification, HTTPS, signed releases when available, rollback | Unsigned v1 has no trusted publisher identity; M10 |
| Local database corruption | WAL, integrity checks, local encrypted snapshots, restore path | Disk failure can exceed backup coverage; M2/M9 |

## Storage-specific assumptions

- The database key is random and is wrapped by Electron's asynchronous `safeStorage` API under the Windows user's DPAPI key. The unwrapped key is never written to disk.
- Provider keys are stored only as Windows Credential Manager generic credentials. They are not in SQLite, JSON, logs, exports, or backups.
- SQLCipher-compatible encryption protects the database, WAL, and (with `temp_store = MEMORY`) temporary data. The G2 prototype verified these properties; production code and a separate page-size assertion are still required.
- JavaScript cannot guarantee memory zeroization. Key material may remain in garbage-collected memory until the process exits. The app minimises lifetime and avoids logging.
- A local snapshot shares the DPAPI key and is not portable. A portable export uses a passphrase and can be restored on a new machine.
- No automatic escrow exists. Loss of the Windows profile without a portable export means the database cannot be decrypted.

## Out of scope for v1

- A compromised operating system, administrator/kernel malware, or physical coercion.
- Multi-user or multi-device sync.
- Protecting data after the owner deliberately exports it in plaintext.
- Guaranteeing provider behaviour or jurisdiction-specific legal compliance.
- Android, macOS, Linux, voice, and UI automation, which are deferred.

## Review triggers

Update this document when adding a provider, a new data class, a tool with side effects, voice capture, UI automation, cloud backup, update signing, or any change to the key hierarchy. G3, G4, G5, G6, or G7 may apply.
