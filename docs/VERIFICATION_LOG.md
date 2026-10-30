# Verification Log

Last updated: 2026-10-25
Scope: Milestone 0 discovery and verification for the Windows-first personal AI companion described in `docs/MASTER_PROMPT.md`.
Method: repository inspection with git and file reads; official documentation fetched with web tools. No provider account was created, no paid service was used, and the legacy WhatsApp bot was not started.
Environment: Windows, git 2.53.0.windows.1, Node v24.16.0, npm 11.13.0.

Status legend:

- VERIFIED: read from an official first-party source on the access date, or directly observed in the repository.
- SECONDARY: official source summarised indirectly (for example a search index snippet), or carried over from the master prompt without a fresh fetch. Re-verify before relying on it.
- PARTIAL: some parts verified, others still open.
- UNVERIFIED: not confirmed from an official source.
- DEFERRED: cannot be measured or decided until a later milestone.
- RECOMMENDATION: an analysis or proposal, not a fact.

## 1. Repository facts

| ID | Finding | Evidence | Status |
| --- | --- | --- | --- |
| R-01 | Repository is on branch `main`, HEAD `f0ec874 Add voice: send a voice note to the companion, it replies spoken`, and was clean before the M0 documentation files were added. | `git status --short`, `git log --oneline -3` | VERIFIED |
| R-02 | The repository is a working Node.js WhatsApp bot, not a desktop application. `package.json` name `whatsapp-persona-bot`, version `1.0.0`, `"type": "module"`, `"private": true`, `"license": "UNLICENSED"`. | `package.json` | VERIFIED |
| R-03 | Runtime dependency is Node `>=22.5.0`. Installed Node is v24.16.0. | `package.json`; `node -v` | VERIFIED |
| R-04 | Tracked source includes `src/index.js`, `src/env.js`, `src/logger.js`, `src/persona.js`, `src/rateLimiter.js`, `src/replyEngine.js`, `src/styleLearner.js`, `src/companion/companion.js`, `src/companion/db.js`, `src/companion/llm.js`, `src/companion/persona.js`, `src/companion/scheduler.js`, `src/companion/voice.js`, `src/companion/actions/reminderActions.js`, plus three scripts. | `git ls-files` | VERIFIED |
| R-05 | The only npm scripts are `start`, `reset-session`, `test-companion` and `reflect-now`. There is no test runner, lint script, typecheck script, CI configuration or build step for a desktop app. | `package.json` | VERIFIED |
| R-06 | Existing companion data layer uses `node:sqlite` `DatabaseSync` with WAL and tables `facts`, `reminders`, `journal`, `conversation_log`. Existing scheduling is `node-cron`; existing LLM path is Gemini first with Groq fallback; existing voice path is Groq Whisper STT and Orpheus TTS. | Source inspection of `src/companion/` (summary retained in `PROJECT_STATE.md`) | VERIFIED |
| R-07 | `node_modules/`, `.env`, `auth/`, `logs/`, `data/style-log.jsonl`, `data/companion.db*` and `latest-qr.png` are ignored. `.env` exists and must not be read. | `.gitignore`; directory listing | VERIFIED |
| R-08 | M0 created `docs/MASTER_PROMPT.md`, `AGENTS.md`, `opencode.json`, this log, the requirements matrix, the state file, the stack ADR and the Android v2 notes. M1 created the `companion/` scaffold; see section 7. | Directory listing and file reads | VERIFIED |
| R-09 | `docs/MASTER_PROMPT.md` contains sections 1-16 of the owner's prompt and is the governing document. | File read | VERIFIED |

## 2. Windows platform and packaging

| ID | Finding | Source | Status |
| --- | --- | --- | --- |
| W-01 | Per-user and per-machine `Run`/`RunOnce` registry keys launch programs when a user logs on. Registry value data is limited to 260 characters. | `https://learn.microsoft.com/en-us/windows/win32/setupapi/run-and-runonce-registry-keys` | VERIFIED |
| W-02 | Task Scheduler is the Windows service for scheduled and trigger-based background execution. Use it for optional startup and scheduled work; the app must still expose a disable switch. | `https://learn.microsoft.com/en-us/windows/win32/taskschd/task-scheduler-start-page` | VERIFIED |
| W-03 | Windows has per-user and all-users Startup folders, exposed as `FOLDERID_Startup` and `FOLDERID_CommonStartup` (formerly `CSIDL_STARTUP` / `CSIDL_COMMON_STARTUP`). The dedicated "startup-folder" page returned 404; the shell known-folder documentation is the authoritative substitute. | `https://learn.microsoft.com/en-us/windows/win32/shell/csidl` | VERIFIED via alternate official page |
| W-04 | The notification area supports application icons through `Shell_NotifyIcon`. Overflow and visibility are user-controlled on Windows 7 and later; an app cannot force its icon to remain visible. | `https://learn.microsoft.com/en-us/windows/win32/shell/notification-area` | VERIFIED |
| W-05 | Microsoft UI Automation provides programmatic access to most desktop UI elements for assistive technology and test automation. It does not enable communication between processes started by different users through "Run as". | `https://learn.microsoft.com/en-us/dotnet/framework/ui-automation/ui-automation-overview` | VERIFIED |
| W-06 | UIA clients communicate across process boundaries. A client that needs to automate a higher-integrity (elevated) application must run at the same or higher integrity and be signed with a `uiAccess="true"` manifest. UIA does not bypass Windows security boundaries. | `https://learn.microsoft.com/en-us/dotnet/framework/ui-automation/ui-automation-security-overview` | VERIFIED |
| W-07 | Windows Credential Manager supports generic credentials through `CredWriteW`; credentials are scoped to the logged-on user. Credential Manager is not intended as a bulk data store. | `https://learn.microsoft.com/en-us/windows/win32/api/wincred/nf-wincred-credwritew` | VERIFIED |
| W-08 | Windows DPAPI (`CryptProtectData`) encrypts data with user or machine credentials, adds an integrity check, and by default can be decrypted only by the same user on the same machine. The `CRYPTPROTECT_LOCAL_MACHINE` flag changes the scope to the machine. | `https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata` | VERIFIED |
| W-09 | Electron `safeStorage` uses DPAPI on Windows. It protects secrets from other users on the same computer, but not from other applications running as the same user. The synchronous API is deprecated in Electron 45 and later; use the asynchronous API for new code. | `https://www.electronjs.org/docs/latest/api/safe-storage` | VERIFIED |
| W-10 | Electron has a built-in `Tray` API for the notification area, including Windows balloon notifications. On Windows, an unsigned executable's tray GUID is bound to the executable path; moving the executable breaks the icon unless a new GUID is used. Electron recommends a GUID only with a code-signed executable. | `https://www.electronjs.org/docs/latest/api/tray` | VERIFIED |
| W-11 | Electron `app.setLoginItemSettings` supports Windows `openAtLogin`, `path`, `args`, `enabled` and `name`. `enabled` toggles the startup-approved registry key used by Task Manager and Windows Settings. This is the preferred Electron startup adapter; the Run key/Startup folder remain fallbacks. | `https://www.electronjs.org/docs/latest/api/app#appsetloginitemsettingssettings-macos-windows` | VERIFIED |
| W-12 | Electron v45 publishes Windows binaries for Windows 10 and later, x64 and arm64. Electron also bundles Chromium and Node.js, which affects installer size and update cadence. | `https://github.com/electron/electron/blob/v45.0.0/README.md` | VERIFIED |
| W-13 | Tauri requires Microsoft C++ Build Tools and Microsoft Edge WebView2 on Windows. WebView2 is preinstalled on Windows 10 version 1803 and later and on Windows 11. Tauri supports Windows 7 and later as a build target. | `https://v2.tauri.app/start/prerequisites/` | VERIFIED |
| W-14 | Tauri provides an official system tray API in Rust and JavaScript. | `https://v2.tauri.app/learn/system-tray/` | VERIFIED |
| W-15 | Tauri provides an official Stronghold plugin for storing secrets and keys in an encrypted vault, supported on Windows. It is an application-managed vault, not Windows Credential Manager by itself. | `https://v2.tauri.app/plugin/stronghold/` | VERIFIED |
| W-16 | Tauri builds Windows installers as WiX MSI or NSIS setup executables. MSI builds must run on Windows. ARM64 builds are supported. | `https://v2.tauri.app/distribute/windows-installer/` | VERIFIED |
| W-17 | WebView2 Evergreen is included with Windows 11 and preinstalled on Windows 10 version 1803 and later. The Evergreen bootstrapper is small (about 2 MB); a fixed-version WebView2 runtime is large (hundreds of MB, more than 250 MB in Microsoft's guidance). Tauri can embed a bootstrapper or use the system runtime. | `https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution`; `https://v2.tauri.app/distribute/windows-installer/` | VERIFIED |
| W-18 | WPF is a Windows-only .NET UI framework using XAML. It is part of .NET and can use other .NET APIs. | `https://learn.microsoft.com/en-us/dotnet/desktop/wpf/overview/` | VERIFIED |
| W-19 | .NET `System.Security.Cryptography.ProtectedData` is a managed wrapper over DPAPI, supports `CurrentUser` and `LocalMachine` scopes, and is Windows-only. | `https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.protecteddata` | VERIFIED |
| W-20 | .NET provides managed UI Automation client classes in `System.Windows.Automation`; UIA does not work across different users. | `https://learn.microsoft.com/en-us/dotnet/framework/ui-automation/ui-automation-overview` | VERIFIED |
| W-21 | Windows provides `Windows.Media.SpeechRecognition.SpeechRecognizer` (WinRT/UWP API). Its offline behaviour and language-pack requirements were not verified. | `https://learn.microsoft.com/en-us/uwp/api/windows.media.speechrecognition.speechrecognizer` | PARTIAL |
| W-22 | Windows provides `Windows.Media.SpeechSynthesis.SpeechSynthesizer` and installed Microsoft-signed voices without a paid service. Offline behaviour and voice availability by locale were not verified. | `https://learn.microsoft.com/en-us/uwp/api/windows.media.speechsynthesis.speechsynthesizer` | PARTIAL |
| W-23 | As of 2026-10-25: Windows 11 26H2 is current (released 2026-09-29); 25H2 is supported to 2027-10-12; 24H2 Home/Pro ended updates on 2026-10-13; 23H2 Home/Pro has ended; consumer Windows 10 reached end of support on 2025-10-14, with only LTSC/Enterprise still supported. | `https://learn.microsoft.com/en-us/windows/release-health/windows11-release-information` | VERIFIED |
| W-24 | .NET's Windows install guidance limits Windows 10 support to LTSC/Enterprise editions; Windows 11 is the supported consumer path. | `https://learn.microsoft.com/en-us/dotnet/core/install/windows` | VERIFIED |
| W-25 | First local M1 package, unsigned NSIS x64: installer 121,556,431 bytes (115.9 MiB); unpacked app 376,500,216 bytes (359.1 MiB) across 73 files. SHA256 `CEE02741491F0BF7253E05879BC85E49FE2BBAED228FCC76A9228EC451165CDB`; Authenticode status `NotSigned`; default Electron icon. The installer was built but not installed, so installed size and first-run behaviour are not yet verified. | Local `npm run package` output; `Get-Item`, directory size, `Get-FileHash`, `Get-AuthenticodeSignature` | PARTIAL |
| W-26 | Recommended minimum OS for v1: 64-bit Windows 11 25H2 or 26H2. Windows 10 22H2 LTSC/Enterprise may be best-effort, but consumer Windows 10 is out of support and should not be a supported target. This is a change from the master prompt's provisional "Windows 10/11" wording and requires owner approval at G1. | Analysis of W-23, W-24, W-12, W-13 | RECOMMENDATION |
| W-27 | electron-builder's default Windows target is NSIS, producing a classic `.exe` installer. It supports per-user installation, portable builds and `electron-updater`. A stable `appId` is required because it becomes the AUMID and the basis for upgrade/uninstall identity. | `https://www.electron.build/docs/nsis`; `https://www.electron.build/docs/targets/`; `https://www.electron.build/docs/configuration/` | VERIFIED |
| W-28 | Playwright supports Electron automation through the experimental `_electron` API, for Electron v21 and later. Native dialogs must be stubbed in the main process. Treat Electron E2E as a supported-but-experimental dependency and keep a fallback plan. | `https://playwright.dev/docs/api/class-electron` | VERIFIED |

## 3. Hosted providers

| ID | Finding | Source | Status |
| --- | --- | --- | --- |
| P-01 | Gemini API Additional Terms (effective 2026-03-23): users must be 18+; the API is for professional or business use, not consumer use; API clients serving users in the EEA, Switzerland or the UK may use only Paid Services; unpaid-tier content and responses are used to improve Google products and may be read by human reviewers; EEA/CH/UK unpaid data is treated under the Paid Services data terms. | `https://ai.google.dev/gemini-api/terms` | VERIFIED |
| P-02 | Gemini has a free tier with free input/output tokens; free-tier content is used to improve Google products. Paid-tier content is not used to improve products. | `https://ai.google.dev/gemini-api/docs/pricing` | VERIFIED |
| P-03 | Gemini rate limits are applied per project and measured in RPM, TPM and RPD; free-tier limits are shown in AI Studio and are not published as fixed numbers in the documentation. Do not hard-code them. | `https://ai.google.dev/gemini-api/docs/rate-limits` | VERIFIED (official page via search index; direct fetch timed out) |
| P-04 | For paid Gemini services, prompts and responses are logged for a limited period for abuse prevention. Abuse-monitoring data is retained for 55 days. Grounding with Google Search/Maps stores prompts and outputs for 30 days. Zero data retention is available for eligible paid use under specific configurations. | `https://ai.google.dev/gemini-api/docs/zdr`; `https://ai.google.dev/gemini-api/docs/usage-policies`; `https://ai.google.dev/gemini-api/docs/logs-policy` | VERIFIED (official pages via search index) |
| P-05 | Gemini API keys are created in Google AI Studio (`https://aistudio.google.com/apikey`). Whether Kenya is an available region could not be verified because the available-regions page timed out. | `https://ai.google.dev/gemini-api/docs/available-regions` (timed out); AI Studio URL from official docs | PARTIAL |
| P-06 | Groq free-plan limits observed in official docs: `gpt-oss-120b` 30 RPM, 1K RPD, 8K TPM, 200K TPD; `whisper-large-v3-turbo` 20 RPM, 2K RPD; Orpheus 10 RPM, 100 RPD. Groq documents rate-limit response headers. Treat these as initial hints only. | `https://console.groq.com/docs/rate-limits` | VERIFIED |
| P-07 | Groq states it does not retain customer data by default; it may retain data temporarily (up to 30 days) for reliability and abuse prevention, offers zero data retention, and processes data in the United States. | `https://console.groq.com/docs/your-data` | VERIFIED |
| P-08 | Groq signup accepts email or GitHub and gives immediate free-tier access without a credit card. The official help page does not state a phone requirement, but the master prompt carries a secondary report that some providers, including Groq, may ask for phone verification. Test this at signup. API keys are managed at `https://console.groq.com/keys`. | `https://community.groq.com/help-center-14/how-do-i-create-a-free-groq-account-134`; `https://console.groq.com/keys` | PARTIAL |
| P-09 | OpenRouter Terms of Service (last updated 2026-08-31) require users to purchase prepaid Credits to make API calls, with a $5 minimum per transaction. Multiple accounts and resale are prohibited. Model providers may train on inputs; OpenRouter opts out where possible. | `https://openrouter.ai/terms` | VERIFIED |
| P-10 | OpenRouter free-model limits: 50 requests per day with fewer than 10 purchased credits; 1,000 requests per day with at least 10 purchased credits. Capacity is global and extra accounts do not multiply it. | `https://openrouter.ai/docs/api-reference/limits`; `https://openrouter.ai/docs/faq` | VERIFIED |
| P-11 | OpenRouter does not use prompts or completions for its own model training; prompt/completion logging is off by default and opt-in. Model providers may retain or train on data. Providers that log or cannot be confirmed are not routed to unless the account training toggle is enabled. Some free models explicitly log and train. | `https://openrouter.ai/privacy`; `https://openrouter.ai/docs/guides/privacy/data-collection`; `https://openrouter.ai/docs/faq` | VERIFIED |
| P-12 | OpenRouter's FAQ says new users receive a small free allowance, while the Terms say Credits are required for API calls. Whether free models can be used without any purchase is unresolved. Treat OpenRouter as requiring a $5 purchase (G4) until the owner tests it. | `https://openrouter.ai/docs/faq`; `https://openrouter.ai/terms` | UNVERIFIED |
| P-13 | Cerebras is not a permanently free provider. New accounts receive $5 in promotional credits after adding a verified payment method; credits expire 30 days after grant. Free-trial limits are 5 RPM, 30K uncached TPM and 1M TPD for `gpt-oss-120b`. Once credits expire, API access pauses until payment. Exclude Cerebras from the no-cost default catalog (G4 if the owner wants it). | `https://inference-docs.cerebras.ai/support/rate-limits`; `https://www.cerebras.ai/pricing` | VERIFIED |
| P-14 | Mistral Studio Free mode enables API keys without a credit card; usage and rate limits apply. Exact free limits are shown in the Admin Panel, not published as fixed numbers. | `https://docs.mistral.ai/getting-started/quickstarts/studio/activate-and-generate-api-key`; `https://docs.mistral.ai/admin/billing-usage/usage-limits` | VERIFIED |
| P-15 | Mistral uses API inputs and outputs to train its models subject to the user's opt-out, which is available in account settings. API inputs/outputs are retained for 30 rolling days for abuse monitoring unless zero data retention is activated. Mistral is a French/EU provider. | `https://legal.mistral.ai/terms/privacy-policy` | VERIFIED |
| P-16 | Mistral API keys are created in the Studio console at `https://console.mistral.ai/api-keys`. The console URL returned a transport error during verification; the official quickstart confirms the API Keys page. | `https://docs.mistral.ai/getting-started/quickstarts/studio/activate-and-generate-api-key` | PARTIAL |
| P-17 | Kenya eligibility was not verified for any provider. No account was created, and no provider terms fetched here list Kenya as excluded. This must be tested by the owner during provider onboarding; it is not a G1 blocker. | No official region page verified | UNVERIFIED |
| P-18 | Recommended default provider posture for v1: Groq as the lowest-friction, no-card default with no retention by default; Gemini and Mistral only after the owner authorises training-data use (G3); OpenRouter only if the owner approves the $5 purchase (G4) and the training toggle remains off; Cerebras excluded. Exact model lists and limits belong in the versioned provider catalog, not in code. | Analysis of P-01 to P-17 | RECOMMENDATION |

## 4. Code signing and distribution

| ID | Finding | Source | Status |
| --- | --- | --- | --- |
| S-01 | Unsigned Windows installers trigger SmartScreen warnings. Reputation attaches to the file hash while unsigned, so every release starts untrusted. Unsigned MSIX is refused; do not ship MSIX without a trusted signature. | `https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options` | VERIFIED |
| S-02 | Azure Artifact Signing (formerly Trusted Signing) costs about $9.99/month. Public Trust is available to organisations in the USA, Canada, EU and UK, and to individual developers in the USA and Canada only. It is not available to an individual developer in Kenya. | `https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options` | VERIFIED |
| S-03 | OV code-signing certificates cost roughly $150-300/year; EV certificates cost $400+/year. Both are paid routes and require owner approval under G4. | `https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options` | VERIFIED |
| S-04 | SignPath Foundation offers free code signing for qualifying open-source projects. Conditions include an OSI-approved licence, a public repository, a prior release, fully automated CI builds and MFA for the team. The certificate is issued to SignPath Foundation, so the publisher shown is SignPath Foundation. | `https://signpath.org/`; `https://signpath.org/terms.html`; `https://signpath.io/solutions/open-source-community` | VERIFIED |
| S-05 | The repository is currently `UNLICENSED` and private, so it does not qualify for SignPath Foundation without a deliberate open-source licensing decision. That decision is the owner's and may have product consequences. | `package.json`; S-04 | VERIFIED |
| S-06 | A self-signed certificate is free but does not build public trust; Windows shows an unknown-publisher/SmartScreen warning, and some managed environments block it outright. It is suitable only for development or managed enterprise deployment. | `https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options` | VERIFIED |
| S-07 | No-cost v1 distribution route: unsigned classic installer, published SHA256 checksums, a README that explains the expected SmartScreen warning and hash verification, and GitHub Releases. A trusted signature requires G4 (paid certificate) or an open-source SignPath application. | Analysis of S-01 to S-06 | RECOMMENDATION |
| S-08 | Unsigned Electron builds also lose stable tray-icon identity because the tray GUID is bound to the executable path. A signature whose subject contains an organisation lets the GUID persist across path changes. Plan a stable install path and a fresh GUID strategy for the unsigned v1. | `https://www.electronjs.org/docs/latest/api/tray` | VERIFIED |
| S-09 | winget community packages are submitted by pull request to `microsoft/winget-pkgs`; manifests carry the installer SHA256 and can be validated and installed locally. This was recorded as VERIFIED in the master prompt but was not re-fetched in this session. | Master prompt section 4; `https://github.com/microsoft/winget-pkgs` | SECONDARY |

## 5. Android v2 (reserved, not built)

| ID | Finding | Source | Status |
| --- | --- | --- | --- |
| A-01 | Microphone foreground services cannot be started from boot or from the background on Android 15 and later targets. Voice capture will require a visible foreground service and user action. | Master prompt section 4 | SECONDARY |
| A-02 | Google Play policy prohibits autonomous accessibility automation except for verified accessibility tools. UI automation is not a viable Play-distributed feature for this product. | Master prompt section 4 | SECONDARY |
| A-03 | Sideloaded apps face Restricted Settings on Android 13 and later and Enhanced Confirmation Mode on Android 15; reports conflict about whether accessibility can still be enabled. Treat sideloading as a support burden. | Master prompt section 4 | SECONDARY |
| A-04 | Tauri 2 supports Android targets with the Android SDK, NDK and Rust targets. This is relevant only if Tauri is chosen at G1; it was not built or tested here. | `https://v2.tauri.app/start/prerequisites/` | VERIFIED |
| A-05 | Android v2 design implications: reuse framework-neutral domain code; expect a separate UI shell; do not plan always-on microphone or silent accessibility automation; verify Keystore, notification permission and foreground-service rules before building. | Analysis | RECOMMENDATION |

## 6. Open unverified items and owner actions

| Item | Why it is open | Next action |
| --- | --- | --- |
| Gemini available regions and Kenya eligibility | Official page timed out twice | Owner tests AI Studio signup with a Kenyan account; re-fetch the region page later |
| Mistral phone/account verification | Quickstart says no card, but account verification details vary | Owner tests signup; record the exact steps in the provider guide |
| OpenRouter free allowance without purchase | FAQ and Terms conflict | Owner checks the OpenRouter dashboard or support before relying on it; default to G4 |
| Exact free-tier limits for Gemini and Mistral | Provider publishes them only in the console | Measure from the account's console and response headers; never hard-code |
| Windows install footprint | M2 package is measured but not installed on a clean machine | Install and uninstall on a clean Windows VM at M10/M11; record installed size and first-run behaviour |
| Framework-specific credential storage | G2 prototype passed with DPAPI and keytar under Electron 45 | Implement the production adapter in M2 and keep the native fallback documented |
| Framework-specific UIA | Depends on G1 stack and G6 | Prototype a read-only UIA call against an allow-listed app before promising automation |
| Speech offline behaviour and locale voices | WinRT APIs exist but offline/locale details were not verified | Prototype in the voice milestone after G6 |
| Trusted code signing for a private individual project | No free trusted route for a closed private repo in Kenya | Owner decides: unsigned v1, pay under G4, or open-source and apply to SignPath |
| Kenya data-protection obligations | No legal review | Record as open; do not claim compliance (master prompt section 11) |
| Encrypted SQLite packaging | Eight G2 prototype gates passed; production storage code is still absent | Implement M2 encrypted persistence and retain the gate evidence in section 9 |
| Credential Manager adapter on Electron 45 | G2 prototype passed; production adapter is not written | Implement the adapter and its tests in M2 |
| Backup and recovery semantics | Prototype passed with `VACUUM INTO`, restore, rekey and tamper rejection; production flow is not written | Implement the owner-confirmed M2 backup/restore flow and tests |

## 7. M1 build and test evidence

All commands below were run from `companion/` on 2026-10-25 unless stated otherwise.

| ID | Evidence | Result |
| --- | --- | --- |
| V-01 | `npm run verify` | PASS: ESLint clean; `tsc --noEmit` clean; 2 test files and 9 tests passed; main, preload and renderer builds completed |
| V-02 | `npx electron --version` from `companion/apps/desktop` | `v45.0.0` after the Electron binary downloaded. The first attempt timed out during the download and was retried |
| V-03 | `npm start` from `companion/` | The main process logged `desktop window created` with `renderer: file`. The command was terminated by the tool timeout after 15 seconds because the app stays open; no Electron process remained afterwards. No screenshot was captured |
| V-04 | `npm run package` from `companion/` | PASS: electron-builder 26.18.0 produced `release/Companion-0.1.0-x64.exe` (NSIS x64). Signing was skipped because no certificate is configured; the default Electron icon was used |
| V-04b | Started `release/win-unpacked/Companion.exe`, waited 6 seconds, checked `Get-Process -Name Companion`, then stopped it | PASS for launch: 4 `Companion` processes were running and the first reported `Responding = True`. The UI and IPC button were not exercised. No `Companion` process remained after the stop |
| V-05 | `Get-Item`, recursive file size, `Get-FileHash` and `Get-AuthenticodeSignature` on the installer | Installer 121,556,431 bytes; unpacked 376,500,216 bytes across 73 files; SHA256 `CEE02741491F0BF7253E05879BC85E49FE2BBAED228FCC76A9228EC451165CDB`; `NotSigned` |
| V-06 | `npm ls --depth=0` | Electron 45.0.0, electron-builder 26.18.0, Vite 8.3.5, TypeScript 6.0.3, Vitest 5.0.5, React 19.3.1, Zod 4.6.7, ESLint 10.13.0 |

Not yet verified: installing the NSIS package, first-run behaviour on a clean Windows VM, tray/startup behaviour, E2E automation, and CI execution on GitHub. Those remain open.

## 8. M2 G2 storage and key research

Research and prototype evidence. The approved packages were installed on 2026-10-25 and the eight gates were run on Windows with Electron 45 and Node 22. The G2 approval and the gate evidence are recorded below and in section 9; production storage code has not been written.

G2 was approved by the owner on 2026-10-25 for all four questions: the proposed SQLCipher-compatible package, the DPAPI-wrapped random database key with Windows Credential Manager provider keys and no escrow, passphrase backups, and the eight prototype gates. The gate evidence is recorded in section 9.

| ID | Evidence | Source | Status |
| --- | --- | --- | --- |
| D-01 | SQLCipher Community Edition is BSD-style licensed and requires the copyright, licence and dependency notices in a user-accessible location. SQLCipher Commercial Edition starts at $999 per application per year. Official SQLCipher is a C library, not a maintained Electron/Node binding. | `https://www.zetetic.net/sqlcipher/license/`; `https://www.zetetic.net/sqlcipher/community/`; `https://www.zetetic.net/sqlcipher/commercial/` | VERIFIED |
| D-02 | SQLite3MultipleCiphers is MIT licensed and implements a SQLCipher-compatible AES-256-CBC cipher as well as its own default sqleet/ChaCha20-Poly1305 scheme. Its docs state that temporary data is stored in memory by default and temp files are encrypted starting with 2.6.0. The package bundles 2.4.0, so the app sets `PRAGMA temp_store = MEMORY`; the prototype confirmed `temp_store = 2` and no temp files after a 20,000-row sort. | `https://github.com/utelle/SQLite3MultipleCiphers`; `https://utelle.github.io/SQLite3MultipleCiphers/docs/ciphers/cipher_sqlcipher/`; `https://utelle.github.io/SQLite3MultipleCiphers/docs/architecture/arch_temp_files/`; section 9 | VERIFIED |
| D-03 | `better-sqlite3-multiple-ciphers` 13.0.3 is MIT licensed, uses Node-API, bundles SQLite 3.53.4 and SQLite3MultipleCiphers 2.4.0, and provides prebuilt binaries for Electron 35+ on Windows x64 and arm64. It is a small, single-maintainer fork; prebuilt binaries for all platforms are bundled, so packaging must prune unused binaries and unpack the selected `.node` file from ASAR. It is not the official Zetetic SQLCipher build. | `https://github.com/m4heshd/better-sqlite3-multiple-ciphers/releases/tag/v13.0.3`; `https://www.npmjs.com/package/better-sqlite3-multiple-ciphers` | VERIFIED |
| D-04 | Electron `safeStorage` uses DPAPI on Windows. The synchronous methods are deprecated in Electron 45 and removed in Electron 46; the asynchronous `isAsyncEncryptionAvailable`, `encryptStringAsync` and `decryptStringAsync` methods must be used. `decryptStringAsync` returns `{ result, shouldReEncrypt }`. DPAPI protects against other users and casual offline disk access, but not against other applications running as the same user or an offline attacker who can recover the Windows account password. Prototype: async encryption was available; a 74-byte wrapped key was unwrapped by a sequential second Electron 45 process with `shouldReEncrypt = false`. | `https://www.electronjs.org/docs/latest/api/safe-storage`; `https://github.com/electron/electron/blob/main/docs/breaking-changes.md`; section 9 | VERIFIED |
| D-05 | Windows Credential Manager generic credentials are scoped to the logged-on user and are suitable for API keys, not bulk data. `@github/keytar` 7.10.6 is an MIT-licensed maintained fork of the archived `atom/node-keytar` and uses Credential Vault on Windows. Its Electron 45 prebuild/ABI and electron-builder packaging were tested: set, read, list and delete passed, including a packaged credential round trip. | `https://www.npmjs.com/package/@github/keytar`; W-07; section 9 | VERIFIED |
| D-06 | The prototype verified FTS5 in the encrypted database, encrypted WAL with `temp_store = MEMORY`, `VACUUM INTO` snapshots, wrong-key rejection, portable export/restore/rekey, passphrase and ciphertext tamper rejection, failed-migration rollback, page size 4096, and a raw key scan. `better-sqlite3`'s `backup()` API is incompatible with an encrypted source and target in 13.0.3; `VACUUM INTO` is the tested snapshot path. | Local prototype evidence, section 9 | VERIFIED |

## 9. M2 G2 prototype gate evidence

All eight gates passed on 2026-10-25. Environment: Windows, Electron 45.0.0, Node 22.23.4 for the Node gate, packaged Node 24.22.0, SQLite 3.53.4, `better-sqlite3-multiple-ciphers` 13.0.3 and `@github/keytar` 7.10.6. Probes were run outside the repository under `%TEMP%\opencode\g2-proto`. The temporary packaged probe was removed from the production main process after the evidence was captured; the dependency and packaging configuration remains.

| ID | Gate | Evidence | Result |
| --- | --- | --- | --- |
| G2-01 | Native module loads in Node 22 and Electron 45 | `npx -y node@22 probe.cjs` loaded the package and encrypted database; the packaged Electron main process loaded the same package and opened the database | PASS |
| G2-02 | Encryption at rest, wrong key and restart | Node 22 output: `cipher: sqlcipher`, `legacy: 0`, `kdfIter: 256000`, `pageSize: 4096`, `journalMode: wal`, `tempStore: 2`, `foreignKeys: 1`, `wrongKeyRejected: true`, `processRestartVerified: true`; DB 28,672 bytes, WAL 53,592 bytes; marker absent from both | PASS |
| G2-03 | FTS5 on the encrypted database | `fts5: true`; the probe created `notes_fts` and matched a row after reopening | PASS |
| G2-04 | WAL, temp, backup, export and restore | `VACUUM INTO` produced a 28,672-byte encrypted backup that reopened; portable export was 28,945 bytes; `exportVerified`, `restoreRekeyVerified`, `wrongPassphraseRejected` and `tamperRejected` were true; a 20,000-row sort under `temp_store = MEMORY` left `tempFilesAfterSort: 0`. `db.backup()` failed with `backup is not supported with incompatible source and target databases`; `sqlcipher_export` was absent; `serialize` failed | PASS with `VACUUM INTO` replacing the backup API |
| G2-05 | electron-builder native packaging | `npx electron-builder --win dir --x64` and `npm run package` succeeded; the only `.node` files in `app.asar.unpacked` were `@github/keytar/prebuilds/win32-x64/keytar.node` (162,816 bytes) and `better-sqlite3-multiple-ciphers/prebuilds/win32-x64.node` (2,365,952 bytes); no unused platform binaries | PASS |
| G2-06 | Credential Manager through keytar | `@github/keytar` set, read, listed and deleted a disposable generic credential under Electron 45; the packaged probe also passed the Credential Manager round trip | PASS |
| G2-07 | Key-material scan and DPAPI wrapping | `rawKeyAbsentFromAllFiles: true`; the unwrapped key was absent from every probe file and from the database, WAL, backup and portable export; the 74-byte key file was DPAPI-wrapped and opened by a sequential second Electron process | PASS |
| G2-08 | Restart and failed migration | A second Node process reopened the encrypted database; a simulated migration transaction rolled back, the migration table was absent, and the original data reopened (`failedMigrationRollbackVerified: true`) | PASS |
| G2-09 | Packaged probe | Temporary packaged probe with `COMPANION_STORAGE_PROBE=1` returned exit 0 and `{ "ok": true, "gate": "packaged-storage-probe", "electron": "45.0.0", "node": "24.22.0", "sqlite": "3.53.4", "dbBytes": 28672, "walBytes": 53592, "backupBytes": 28672, "fts5": true, "credentialManager": true, "plaintextAbsent": true }` | PASS |
| G2-10 | Final build and launch | `npm run verify` passed after probe removal: ESLint clean, `tsc` clean, 2 files / 9 tests, main bundle 743.4 KB. Final unsigned NSIS installer: 122,573,738 bytes (116.9 MiB), SHA256 `F24B0C22EA23E24ED8ACD0653FA31666D71BF6F357EE48FC9601BF5383E5D577`, `NotSigned`; unpacked app 379,071,247 bytes across 103 files; a normal packaged launch produced 4 responding processes and left none running | PASS |

The Node 22 output was:

```json
{
  "gate": "node-storage",
  "observed": {
    "cipher": "sqlcipher",
    "legacy": "0",
    "kdfIter": "256000",
    "pageSize": 4096,
    "journalMode": "wal",
    "tempStore": 2,
    "foreignKeys": 1
  },
  "dbBytes": 28672,
  "openWalBytes": 53592,
  "backupBytes": 28672,
  "exportBytes": 28945,
  "tempFilesAfterSort": 0,
  "fts5": true,
  "wrongKeyRejected": true,
  "processRestartVerified": true,
  "failedMigrationRollbackVerified": true,
  "backupVerified": true,
  "exportVerified": true,
  "tamperRejected": true,
  "wrongPassphraseRejected": true,
  "restoreRekeyVerified": true,
  "plaintextMarkerAbsent": true,
  "sqliteHeaderAbsent": true,
  "rawKeyAbsentFromAllFiles": true
}
```

The Electron keytar and restart probe produced:

```json
{"gate":"electron-safeStorage-keytar","asyncAvailable":true,"wrappedKeyLength":74,"keytarSetGetListDeleteVerified":true,"processRestartVerified":false}
{"gate":"electron-safeStorage-restart","asyncAvailable":true,"processRestartVerified":true,"wrappedKeyLength":74,"shouldReEncrypt":false}
```

The first line is the create-and-keytar pass; `processRestartVerified` is false there by design because the restart check runs in a sequential second process. A concurrent second child was invalid because it shared the same Electron userData and GPU cache, so it is not counted as a failure.

Remaining verification limits: the 4096-byte page size is recorded but production code must pin it, the installer has not been installed on a clean machine, CI has not run on GitHub, and no production storage, migration, credential, backup or restore code exists yet.

The gate evidence and packaging configuration were committed locally as `cbd31b5` (`G2: pass storage prototypes and record gate evidence`). Nothing has been pushed.
## 10. M4 provider gateway thin-slice evidence (2026-10-26)

| ID | Evidence | Result |
| --- | --- | --- |
| V-07 | Official Gemini pricing: `https://ai.google.dev/gemini-api/docs/pricing` | VERIFIED: Google documents a free tier with limited model access and warns that free-tier content may be used to improve products; limits are not treated as fixed app constants |
| V-08 | Official Gemini model page: `https://ai.google.dev/gemini-api/docs/models` | VERIFIED: `gemini-2.5-flash-lite` is a documented model; the catalog uses it as the Gemini free-tier default as of this date |
| V-09 | Official Groq limits: `https://console.groq.com/docs/rate-limits` | VERIFIED: account/org limits and response headers are documented; router records rate-limit failures and retry timing |
| V-10 | Official Mistral free mode and limits: `https://docs.mistral.ai/getting-started/quickstarts/studio/activate-and-generate-api-key` and `https://docs.mistral.ai/admin/billing-usage/usage-limits` | VERIFIED: free mode/API keys exist with limited, account-specific usage; exact quotas are not hard-coded |
| V-11 | `npm.cmd run verify` from `companion/` with approved elevated build execution; focused provider tests also rerun afterward | PASS: ESLint clean, TypeScript clean, 20 test files / 180 tests passed, Electron main/preload and Vite renderer builds completed |
| V-12 | Provider implementation review | PASS: Gemini REST adapter; structured 400/401/402/403/408/429/5xx mapping; provider-specific model selection during fallback; custom HTTPS OpenAI-compatible provider registration |

Important limitation: free-tier availability, regional eligibility and quotas remain provider-account facts and can change. The app does not promise unlimited free use. Full OS control, voice and UI automation remain behind the documented permission/risk gates; the current build does not claim to control everything.

## 11. Provider catalog revision evidence (2026-10-26)

| ID | Evidence | Result |
| --- | --- | --- |
| V-13 | Active `PROVIDER_CATALOG` and `getProviderCatalog()` inspection | PASS: exactly Gemini, DeepSeek, OpenAI/ChatGPT, Anthropic/Claude and Perplexity are exposed; Groq, OpenRouter, Together and Fireworks are not active defaults |
| V-14 | Provider implementation inspection | PASS: Gemini native REST, DeepSeek/OpenAI/Perplexity OpenAI-compatible APIs, and Anthropic Messages API are represented with separate endpoints and request formats |
| V-15 | `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run test -- --run` | PASS: 180 tests passed |
| V-16 | Official API references | OpenAI Chat Completions: `https://platform.openai.com/docs/api-reference/chat`; DeepSeek Chat Completions: `https://api-docs.deepseek.com/api/create-chat-completion/`; Anthropic API docs: `https://docs.anthropic.com/en/api/messages`; Perplexity API docs: `https://docs.perplexity.ai/` |

## 12. Live voice interaction evidence (2026-10-26)

| ID | Evidence | Result |
| --- | --- | --- |
| V-17 | Renderer voice implementation inspection | PASS: explicit start, continuous recognition, visible live state, interim transcript, spoken response, stop/cleanup paths |
| V-18 | `npm.cmd run verify` from `companion/` with approved elevated build execution | PASS: ESLint clean, TypeScript clean, 20 test files / 180 tests passed, Electron/Vite production build completed |
| V-19 | Privacy/safety inspection | PASS: no raw audio persistence; microphone is not started until the owner presses Start listening; arbitrary OS control is not enabled by voice alone |

## 13. Gemini validation fix evidence (2026-10-26)

| ID | Evidence | Result |
| --- | --- | --- |
| V-20 | Official Gemini API errors: `https://ai.google.dev/gemini-api/docs/api-errors` | VERIFIED: HTTP 404 can mean `model_not_found`; the previous fixed-model probe could therefore reject an otherwise valid key |
| V-21 | Gemini provider implementation inspection | PASS: `models.list` is queried with the key, only models advertising `generateContent` are selected, and the selected model is reused for completion |
| V-22 | `npm.cmd run verify` from `companion/` | PASS: lint, typecheck, 20 test files / 180 tests, and production build |

## 14. v3 brief baseline and registry (2026-10-29)

| ID | Command / inspection | Observed result |
| --- | --- | --- |
| V-23 | `git -C ... status --porcelain=v1`; `git log --oneline -15` | Clean worktree at baseline; HEAD `6244f85 Improve WhatsApp automation: search contact and send` |
| V-24 | `npm.cmd run verify` from `companion/` | ESLint 0 errors / 6 warnings; TypeScript clean; 20 test files / 182 tests passed; Electron main/preload and Vite renderer built |
| V-25 | Source inspection of `apps/desktop/src/main/index.ts` | Found: IPC grants every permission (`os.open`, `os.media`, `os.speak`, `os.telephony`, `os.exec`, `memory.read`, `memory.write`, `drafts.write`); `osTryCommand` auto-confirms class 3 results; no lock/elevation check |
| V-26 | Source inspection of `packages/core/src/os-control/windows.ts` | Found: WhatsApp returns `sent: true` after SendKeys exit 0; `playMedia` scrapes YouTube results HTML; no postcondition observation |
| V-27 | Source inspection of `apps/desktop/src/renderer/App.tsx` | Found: continuous dictation starts when a chat is active; mute is renderer-only; assistant text is spoken verbatim |
| V-28 | Source inspection of core modules | Found: storage, onboarding, provider router, conversation persistence and memory approval tests; no persona, greeting, proactive, learning-threshold, UIA or injection tests |
| V-29 | Adopted v3 brief and wrote `docs/REQUIREMENTS.md`, `docs/GAPS.md`, updated `docs/PROJECT_STATE.md` | Registry seeded from SC1-SC12 and K/V/O/W/M/P/L/S; v1 brief archived |

Baseline conclusion: the foundation builds and 182 tests pass, but the companion does not meet SC1-SC12. The first fix must close the trust boundary because the current IPC path can run arbitrary commands and auto-confirm them.

## 15. Safety slice: trust boundary, honest actions, greeting (2026-10-29)

| ID | Command / inspection | Observed result |
| --- | --- | --- |
| V-30 | `npm.cmd run verify` from `companion/` | ESLint 0 errors / 0 warnings; TypeScript clean; 21 test files / 201 tests passed; Electron main/preload and Vite renderer built |
| V-31 | `npm.cmd run test -- --run packages/core/src/security/security.test.ts packages/core/src/tools/tools.test.ts` | 2 files / 27 tests passed after integrating `TrustedIntentGuard` into policy and executor |
| V-32 | Manual PowerShell probe using `GetForegroundWindow`, `GetWindowThreadProcessId`, `GetWindowText`, `OpenInputDesktop(0, false, 0x0001)` | `{"screenLocked":false,"process":"explorer","title":""}`; probe shape and DllImports work on this machine |
| V-33 | Source inspection of `apps/desktop/src/main/index.ts` | Safe default permissions; `buildToolContext` supplies environment snapshot; `osTryCommand` no longer auto-confirms; `osConfirmTool` executes only the pending action after owner confirmation; `osRejectTool` added |
| V-34 | Source inspection of `packages/core/src/os-control/windows.ts` and `tools.ts` | WhatsApp returns `{typed, sent:false, verified:false}` unless observed; risk class 3 + `os.message.send` + confirmation; YouTube HTML scraping removed, official search page opened instead |
| V-35 | Source inspection of `apps/desktop/src/renderer/App.tsx` | Startup greeting with owner name/time; explicit Start listening; no auto-dictation; confirmation card with Confirm/Cancel; "Stop everything"; "stop" voice command pauses listening |
| V-36 | Source inspection of `packages/core/src/security/*` | Untrusted/system denial, locked/secure-desktop denial, probe-failure fail-closed, class 3/4 rules, sensitive-target denylist, confirmation hash binding, emergency-stop manager |
| V-37 | `docs/REQUIREMENTS.md`, `docs/GAPS.md`, `docs/PROJECT_STATE.md` updated | Statuses moved to PARTIAL where only source/unit evidence exists; no row marked PASS except M3 (scraping removed) and pre-existing W8 |

Safety-slice conclusion: the critical trust-boundary defects are closed at the core/unit/IPC-source level, and the full verify gate is green. The slice is not yet proven end-to-end in Electron, and the WhatsApp observation reader, injection corpus, real integrity probe, greeting completeness and media ranking remain open.

## 16. External-content injection boundary (2026-10-29)

| ID | Command / inspection | Observed result |
| --- | --- | --- |
| V-38 | `npm.cmd run test -- --run packages/core/src/security/untrusted-content.test.ts packages/core/src/security/security.test.ts` from `companion/` | PASS: 2 files / 22 tests passed. The corpus covers web, email, file, screen, filename, notification and audio text; each is denied for risk classes 1, 2 and 3. |
| V-39 | `npm.cmd run typecheck` from `companion/` | PASS: TypeScript completed with exit code 0 after adding `routeExternalContent`. |
| V-40 | Source inspection of `packages/core/src/security/untrusted-content.ts` | PASS: external content receives explicit `untrusted_content` provenance; it cannot produce `owner_ui` or `owner_voice`. |

Remaining limit: this is a core boundary/corpus check. No live screen, audio, notification or file producer has yet been wired to the route, and no Electron E2E has been run.

| V-41 | `npm.cmd run verify` from `companion/` with approved elevated build execution | PASS: ESLint clean, TypeScript clean, 22 test files / 208 tests passed, Electron main/preload and Vite renderer builds completed. |
| V-42 | `npm.cmd run test -- --run packages/core/src/voice/greeting.test.ts` and `npm.cmd run typecheck` | PASS: greeting composer tests 4/4; TypeScript completed with exit code 0. Coverage includes name, two-sentence limit, variation, pronunciation markup, mute and overnight quiet hours. |
| V-43 | `npm.cmd run verify` from `companion/` with approved elevated build execution | PASS: ESLint clean, TypeScript clean, 23 test files / 212 tests passed, Electron main/preload and Vite renderer builds completed. |
| V-44 | `npm.cmd start` from `companion/` with approved desktop execution, then clean Ctrl+C; process check afterward | PASS: encrypted storage opened, credential store available, desktop window created in ~0.9 s, and no Electron process remained after stop. Startup smoke only; not GUI feature E2E. |
| V-45 | `npm.cmd run verify` from `companion/` with approved elevated build execution | PASS: ESLint clean, TypeScript clean, 30 test files / 228 tests passed, Electron main/preload and Vite renderer builds completed. |
| V-46 | Direct `node --experimental-strip-types` invocation of `windows.ts` speech smoke | NOT RUN: Node native TS stripping could not resolve this repository's `.js` specifier to `.ts`; no audio result is claimed. Electron startup path was exercised separately. |
| V-47 | Bundled `spikes/runtime-smoke.ts` with project esbuild, then executed the bundle outside the sandbox | PASS: actual `speakText` returned `spoken:true`; actual `openTarget('calculator')` returned `opened:true, resolved:"calc"`. This covers one speech path and one launcher, not general UI automation. |
| V-48 | `npm.cmd run verify` from `companion/` with approved elevated build execution | PASS: ESLint clean, TypeScript clean, 30 test files / 229 tests passed, Electron main/preload and Vite renderer builds completed. |
| V-49 | `npm.cmd run verify` from `companion/` with approved elevated build execution | PASS: ESLint clean, TypeScript clean, 31 test files / 231 tests passed, Electron main/preload and Vite renderer builds completed after emergency-stop and decision-orchestration changes. |
| V-50 | Bundled `spikes/runtime-smoke.ts` with project esbuild, then executed it after process-observation changes | PASS: actual speech returned `spoken:true`; Calculator launch returned `opened:true,resolved:"calc"` only after `CalculatorApp.exe` was observed; exact test process was cleaned up. |
| V-51 | `npm.cmd run verify` from `companion/` with approved elevated build execution | PASS: ESLint clean, TypeScript clean, 31 test files / 231 tests passed, Electron main/preload and Vite renderer builds completed after process postcondition changes. |
| V-52 | `npm.cmd start` with live marker inspection of `%APPDATA%\\Companion\\heartbeat.json`, then external Ctrl+C and process check | PASS: heartbeat contained the live Electron PID/timestamp while running; Electron stopped and no process remained. No stop marker was written because Ctrl+C is an external termination, which is intentionally not treated as owner Stop. |
| V-53 | Disposable `spikes/uia-probe.ps1` against a newly launched Notepad process; exact test PID closed afterward | PASS: Windows UI Automation returned a unique Notepad window and 106 descendant elements with control types/pattern availability. User document text/titles were not recorded. An unrelated pre-existing Notepad process was not touched. |

## 17. Capability and learning-gap follow-up (2026-10-29)

| ID | Command / inspection | Observed result |
| --- | --- | --- |
| V-54 | `npm.cmd run test -- --run packages/core/src/memory/memory.test.ts packages/core/src/os-control/capability-store.test.ts` from `companion/` | PASS: 2 files / 6 tests passed. Rejected memory lookup is normalized and repository-backed; capability success rates retain explicit observation counts. |
| V-55 | `npm.cmd run verify` from `companion/` with approved elevated build execution | PASS: ESLint 0 errors / 0 warnings, TypeScript clean, 33 test files / 234 tests passed, Electron main/preload and Vite renderer production builds completed. |

These results do not close the owner-gated voice-model, vision, real-messaging or elevated-control checks, and do not establish GUI end-to-end coverage or production readiness.

| V-56 | Bundled `spikes/runtime-smoke.ts` with project esbuild, executed it, and checked `Get-Process CalculatorApp` afterward | PASS: actual speech returned `spoken:true`; Calculator returned `opened:true,resolved:"calc"`; the smoke fixture cleaned up its newly-created Calculator process and no CalculatorApp process remained. |

## 18. Proposal-only desktop learning boundary (2026-10-29)

| ID | Command / inspection | Observed result |
| --- | --- | --- |
| V-57 | `npm.cmd run test -- --run packages/core/src/memory/memory.test.ts apps/desktop/src/main/learning-policy.test.ts` from `companion/` | PASS: 2 files / 7 tests passed. Conversation recording can be disabled, and the desktop IPC path contains no provider-derived automatic profile mutation after a response. |
| V-58 | `npm.cmd run verify` from `companion/` with approved elevated build execution | PASS: ESLint 0 errors / 0 warnings, TypeScript clean, 34 test files / 236 tests passed, Electron main/preload and Vite renderer production builds completed. |

L5 is now PASS for the default desktop path. This does not mean conversation data is never stored: normal chat history remains local conversation data, and explicit owner-approved learning is still a separate unfinished workflow.

## 19. Live typed cognition and provider failure follow-up (2026-10-29)

| ID | Command / inspection | Observed result |
| --- | --- | --- |
| V-59 | `npm.cmd run test -- --run packages/core/src/conversation/engine.test.ts packages/core/src/cognition/decision-orchestrator.test.ts` from `companion/` | PASS: 2 files / 14 tests passed. Configured conversation engines produce speech from validated TurnDecision output; JSON mode is requested, one repair is bounded, and a throwing provider fails over to the next source. |
| V-60 | `npm.cmd run verify` from `companion/` with approved elevated build execution | PASS: ESLint 0 errors / 0 warnings, TypeScript clean, 34 test files / 238 tests passed, Electron main/preload and Vite renderer production builds completed. |

The live cognition path still does not execute plans: proposals must continue through the existing deterministic policy/executor path, and persona regression/provider-switch persistence remain open.

| V-61 | `npm.cmd start` with live heartbeat inspection, then external Ctrl+C, process and marker check | PASS: encrypted storage opened, credential store was available, the desktop window was created, a heartbeat recorded a live Electron PID/timestamp, and after external termination no matching companion Electron process or crash marker remained. No stop marker was expected because termination was external. |

## 20. Persona regression suite (2026-10-29)

| ID | Command / inspection | Observed result |
| --- | --- | --- |
| V-62 | `npm.cmd run test -- --run packages/core/src/cognition/persona-suite.test.ts` and `npm.cmd run verify` from `companion/` | PASS: the suite replayed 30 fixed prompts across three provider-output profiles (90 cases) and met its >=95% normalized-output rule threshold; the full gate passed with 35 files / 239 tests, clean lint/typecheck and both builds. |

This is a deterministic provider-profile regression suite, not a claim that three live hosted providers or the owner’s final persona have been validated.

## 21. Persisted startup control (2026-10-29)

| ID | Command / inspection | Observed result |
| --- | --- | --- |
| V-63 | `npm.cmd run verify` from `companion/` with approved elevated build execution; source inspection of startup IPC/tray path | PASS: 35 test files / 239 tests, lint/typecheck/build clean. Startup preference is stored under the local settings table, applied per-user through Electron login-item settings, and exposed through owner-authenticated IPC plus tray enable/disable actions; default remains disabled. |

The OS startup setting has not yet been verified across a reboot or Task Manager disable transition, so SC5 remains PARTIAL.

## 22. Windows installer artifact (2026-10-29)

| ID | Command / inspection | Observed result |
| --- | --- | --- |
| V-64 | `npm.cmd run package` from `companion/`; `Get-ChildItem apps/desktop/release`; `Get-FileHash .../Companion-0.1.0-x64.exe -Algorithm SHA256`; `Get-AuthenticodeSignature .../Companion-0.1.0-x64.exe` | PASS: NSIS packaging completed and produced `Companion-0.1.0-x64.exe` (122,715,309 bytes), blockmap and unpacked app including `dist/main/supervisor.js`. SHA-256: `DC57EBE6EB0C26F2E925F481F0C56DDEBC24D816005D6D0C0BCD1E79E20D45B5`. Authenticode status was `NotSigned`, as expected without G4 signing approval. |

The installer was not executed or installed on a clean machine; this is packaging evidence only.

## 23. Packaged runtime smoke (2026-10-29)

| ID | Command / inspection | Observed result |
| --- | --- | --- |
| V-65 | Launch generated `apps/desktop/release/win-unpacked/Companion.exe`, inspect `%APPDATA%\\Companion\\heartbeat.json` and exact executable path, then `taskkill /PID <launched PID> /T /F` | PASS: packaged runtime started, created the expected Electron process tree, wrote a heartbeat with the launched PID/timestamp, and no matching packaged process remained after terminating the exact test tree. This was not an installer/clean-machine test. |

## 24. Reusable UI Automation service (2026-10-29)

| ID | Command / inspection | Observed result |
| --- | --- | --- |
| V-66 | `npm.cmd run test -- --run packages/core/src/os-control/uia.test.ts`; bundled `spikes/uia-service-smoke.ts` with project esbuild and executed it; checked Notepad processes afterward | PASS: validation tests passed; the real service returned aggregate metadata for a Notepad window with 39 descendants/controls; the pre-existing Notepad PID remained untouched and no disposable test process remained. A first PID-only attempt failed closed with `target_window_not_found`, which is recorded as the expected safety behavior for a missing target window. |
| V-67 | `npm.cmd run verify` from `companion/` with approved elevated build execution | PASS: ESLint 0 errors / 0 warnings, TypeScript clean, 36 test files / 240 tests passed, Electron main/preload and Vite renderer production builds completed. |

The service is not yet integrated into typed app adapters or a 10-task benchmark, so O4 and SC3 remain PARTIAL.

## 27. Durable capability-store follow-up (2026-10-29)

| ID | Command / inspection | Observed result |
| --- | --- | --- |
| V-70 | `npm.cmd run test -- --run packages/core/src/os-control/capability-store.test.ts packages/core/src/os-control/uia.test.ts`; `npm.cmd run verify` from `companion/` | PASS: capability and UIA focused tests passed (3/3); the durable key-value-backed capability store round-tripped app/version data and the full gate passed with 37 files / 243 tests, clean lint/typecheck and both builds. |

The durable adapter is ready to connect to encrypted settings, but no production app adapter currently records live capability observations automatically.

## 28. Policy-bundle integrity (2026-10-29)

| ID | Command / inspection | Observed result |
| --- | --- | --- |
| V-71 | `npm.cmd run test -- --run packages/core/src/security/policy-bundle.test.ts packages/core/src/tools/tools.test.ts`; `npm.cmd run verify` from `companion/` | PASS: policy-bundle and tool-policy focused tests passed (15/15); the frozen built-in bundle verifies its SHA-256 invariants, tampered Class 4 policy is rejected, and the full gate passed with 38 files / 245 tests. |

Learning cannot mutate the policy bundle because it is frozen and policy evaluation verifies it before authorization.

## 29. Companion canary scan (2026-10-29)

| ID | Command / inspection | Observed result |
| --- | --- | --- |
| V-72 | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\spikes\\secret-canary-scan.ps1` from the repository root | PASS: scanned 4 selected companion/docs/spikes roots across 8 text extensions and found 0 high-confidence API-key/private-key patterns. Legacy secrets/config stores and generated dependencies were intentionally excluded. |

The scan is evidence for the companion source scope, not a claim about excluded legacy data or all generated/dependency content.

## 30. Clipboard restoration helper (2026-10-29)

| ID | Command / inspection | Observed result |
| --- | --- | --- |
| V-73 | `npm.cmd run verify` from `companion/` | PASS: ESLint clean, TypeScript clean, 39 test files / 248 tests passed, Electron main/preload, supervisor and Vite renderer builds completed. Clipboard helper tests prove restore on success and exception. |

The helper is not yet used by a paste-driven UIA adapter; no clipboard contents were accessed during tests beyond an in-memory fake.

## 25. Detached supervisor fixture (2026-10-29)

| ID | Command / inspection | Observed result |
| --- | --- | --- |
| V-68 | Bundled `spikes/supervisor-smoke.ts` with project esbuild and executed it; fixture uses a temporary directory, a disposable Node child and a separate Node restart command | PASS: the supervisor detected the fixture crash marker, spawned exactly the configured restart executable, observed the bounded restart marker, and cleaned the temporary directory and fixture child. Unit policy tests cover owner stop/external termination exit, live-hang restart and the three-restart cap. |

This proves the supervisor logic and fixture restart path, not a real crashed Electron process or sleep/resume cycle; SC5 remains PARTIAL.

## 26. Packaged supervisor external-termination smoke (2026-10-29)

| ID | Command / inspection | Observed result |
| --- | --- | --- |
| V-69 | Launch rebuilt `apps/desktop/release/win-unpacked/Companion.exe`, inspect its exact process tree and heartbeat, terminate the exact root PID externally, wait three seconds, and inspect the exact packaged executable path | PASS: packaged runtime created its Electron process tree and heartbeat; after external termination no matching packaged process remained and it was not restarted. This proves the external-termination branch, not a real crash/hang restart. |

## 31. Voice-first companion slice (2026-10-30)

| ID | Command / inspection | Observed result |
| --- | --- | --- |
| V-74 | `npm.cmd run verify` from `companion/` | PASS: ESLint 0 errors / 0 warnings, TypeScript clean, 42 test files / 286 tests passed, and Electron main/preload, supervisor and Vite renderer builds completed. New tests cover voice settings/events/quiet hours/noise filtering and proactive-question cleanup. |
| V-75 | `npm.cmd run build -w @companion/desktop`; `apps/desktop/resources/voice/CompanionVoice.exe voices`; `CompanionVoice.exe speak` in a live shell | PASS: `scripts/build-voice.mjs` compiled the helper (21,504 bytes); `voices` returned WinRT David/Zira/Mark and `en-US` recognition; `speak` emitted `speech_started`/`speech_done` and was audible. |
| V-76 | `CompanionVoice.exe listen`, `listen-sapi`; loopback TTS phrase test | BLOCKED for WinRT: `listen` failed with `speech_privacy` (Windows speech privacy not accepted). `listen-sapi` reached `ready`, but loopback TTS was misrecognized (one token at 0.003 confidence), so the fallback is not reliable input. The app maps the privacy failure to a visible warning and an `ms-settings:privacy-speech` button. |
| V-77 | `npm.cmd run package` from `companion/`; inspect installer and helper; launch `release/win-unpacked/Companion.exe` with CDP, click Chat, inspect panel and helper process, terminate the exact tree | PASS: packaging produced `Companion-0.1.0-x64.exe` (122,764,179 bytes, SHA-256 `45CDA73F2673822628F1C736162789B017CF31768E8ABF05B8057CF4C7621EBF`, unsigned). The packaged helper exists at `resources/voice/CompanionVoice.exe` (21,504 bytes). The unpacked app auto-started the bundled helper after Chat opened and showed the visible SAPI fallback warning; after `taskkill /T /F` no `Companion` or `CompanionVoice` process remained. |
| V-78 | CDP evaluation against the built app: open Chat, wait, read voice panel; call `personaProactive(null, [])`; inspect `%APPDATA%\\Companion\\logs\\companion.log`; repeat after the Gemini request fix | PASS after fix: Chat-tab auto-start reached `Listening live` and spawned `CompanionVoice`; the first proactive call returned `fallback` with a Gemini `INVALID_ARGUMENT` (`contents is not specified`); after adding an explicit user turn, the same call returned a model question (`What are we actually trying to get done today?`, source `model`). A typed chat turn also returned a provider reply. The test wrote one prompt into conversation `814f23b2-889a-40fc-9eb5-09a242dcb9e1`. |

The live WinRT microphone path, real owner speech, barge-in timing and raw-audio scan remain unverified; V-75/V-78 prove TTS, helper startup, auto-start and model proactivity, not recognition quality.
