# ADR-0001: Desktop stack for the Windows-first companion

- Status: Accepted at G1 on 2026-10-25
- Date: 2026-10-25
- Deciders: owner
- Author: implementation agent
- Supersedes: none
- Related: `docs/MASTER_PROMPT.md` sections 3, 5, 14, 15; `docs/VERIFICATION_LOG.md` sections 2 and 4

## Context

The repository currently contains a working Node.js WhatsApp persona bot. It must remain untouched. The companion is greenfield and must run on Windows, with x64 first and ARM64 as a stated goal. The owner has ruled out local language models and a paid cloud backend. All reasoning goes through free-tier hosted providers with failover; memory, tools, permissions and storage stay local.

The companion needs a tray icon, optional startup, background scheduling, encrypted local storage, credential storage, a resumable setup wizard, an accessible text UI, and later Windows UI Automation and push-to-talk voice. A single developer will maintain it. The core must be isolated behind typed contracts so Android v2 can reuse it. Distribution is through GitHub Releases, with a classic installer, SHA256 checksums and winget; no MSIX unless a trusted signature exists. There is no free trusted code-signing route for this private, `UNLICENSED` repository in Kenya (VERIFICATION_LOG S-01 to S-07).

## Decision

Use **Electron with TypeScript** for v1, inside a new `companion/` directory that is independent of the legacy bot.

- Language: TypeScript, `strict: true`.
- Runtime: Electron 45 or the current stable major at scaffold time, x64 first, ARM64 build later.
- UI: React with Vite, accessible by keyboard and screen reader; no UI kit until a demonstrated need.
- Main process owns the database, credentials, provider gateway, policy engine, tools and scheduler. The renderer is sandboxed with `contextIsolation: true`, `nodeIntegration: false`, a restrictive Content Security Policy, and a typed preload bridge. Renderer code never receives raw keys, filesystem paths it did not request, or unrestricted IPC.
- Domain core: framework-neutral TypeScript in `packages/core` for contracts, provider gateway, memory, policy, risk classes, scheduling and export/import. Electron-specific code stays in `apps/desktop` and native adapters in `packages/adapters-windows`.
- Local channel: validated Electron IPC (`ipcMain.handle` / `ipcRenderer.invoke`) with schema validation, sender-frame checks and a per-window session token passed through the preload bridge. Treat this as the authenticated local channel required by the master prompt. Do not open a localhost HTTP server unless a concrete requirement appears; that would add an authentication surface with no v1 benefit.
- Storage: SQLite with versioned migrations, FTS5 for lexical retrieval, and an encryption decision deferred to G2. Evaluate SQLCipher or an equivalent early in M2, including licensing, packaging and key-recovery implications. Keep the storage adapter behind an interface so a native SQLite module can replace a built-in one.
- Secrets: Windows Credential Manager for provider keys, with DPAPI-protected local state via Electron `safeStorage` where appropriate. The final key hierarchy and recovery design is G2.
- Startup: `app.setLoginItemSettings` with a user-visible toggle and a Task Scheduler fallback only if measured behaviour requires it. Never start hidden without an explicit preference.
- Tray: Electron `Tray` with a stable per-user install path. Because the app will be unsigned at v1, treat the tray GUID as path-bound and plan a fresh GUID if the install path changes.
- Packaging: `electron-builder` producing a per-user NSIS installer, portable archive for testing, and SHA256 checksums. No MSIX. Set a stable `appId` before the first release; it becomes the AUMID and the basis for upgrade/uninstall identity.
- Tests: Vitest for unit and integration tests; Playwright for Electron end-to-end tests; a deterministic mock provider; live provider tests opt-in only. Playwright's Electron support is experimental, so keep a fallback of main-process integration tests plus a thin renderer test.
- CI: GitHub Actions on `windows-latest` with Node 22+, `npm ci`, lint, typecheck, tests, build, checksums and artifact upload.
- Repository layout:

```text
companion/
  package.json                 # private npm workspaces root
  package-lock.json
  apps/desktop/                # Electron main, preload, renderer
  packages/core/               # framework-neutral domain and contracts
  packages/adapters-windows/   # Credential Manager, DPAPI, startup, tray, UIA later
  packages/provider-catalog/   # versioned JSON catalog and schema
  docs/                        # companion ADRs and threat model
```

The legacy bot stays at the repository root. The companion does not convert the root into a workspace, does not modify `package.json`, and does not touch `ecosystem.config.cjs`. This avoids breaking the running pm2 process.

Electron APIs, electron-builder and Playwright were checked against official documentation (VERIFICATION_LOG W-09 to W-12, W-27 and W-28). Vitest, React, Vite, ESLint and GitHub Actions are proposed tooling that will be pinned and verified during the M1 scaffold; they are not claimed as verified here.

## Why Electron

- It reuses the owner's existing TypeScript/Node skills and part of the legacy companion logic, which is the strongest predictor of a solo maintainer actually finishing the project.
- One language across main, preload, renderer and Android-v2 domain code.
- Official `Tray`, `setLoginItemSettings`, `safeStorage` and notification support cover the v1 Windows shell.
- Electron is a large, well-tested ecosystem with mature installer, updater, testing and accessibility tooling.
- It avoids a second Rust or C# toolchain in the critical path while the product is still being validated.

## Alternatives considered

### Tauri 2 with a Rust core and TypeScript UI

Strengths: much smaller installer and memory footprint; system WebView2; official tray; Stronghold vault; MSI/NSIS; ARM64; Android targets; Rust safety. Evidence: VERIFICATION_LOG W-13 to W-17 and A-04.

Costs: two languages and two build systems for one developer; the existing Node companion logic cannot be reused directly; UIA and Credential Manager require Rust/Windows crate work; cross-process debugging is slower; SQLCipher and native module work still needs evaluation. Tauri is the better choice if installer size or resource use becomes a hard requirement, or if the owner is already fluent in Rust.

### .NET with WPF or WinUI 3

Strengths: deepest first-party Windows integration; direct UIA, Credential Manager, DPAPI, speech, tray and startup APIs; excellent C# tooling; ARM64; strong security primitives. Evidence: VERIFICATION_LOG W-18 to W-24.

Costs: the core would be Windows-specific, which undermines the Android-v2 reuse requirement; the existing Node code is not reusable; WinUI 3 adds packaging and deployment complexity; WPF is mature but visually dated; .NET's Windows 10 support is limited to LTSC/Enterprise, matching the minimum-OS concern. .NET is the better choice if the owner is a C# developer and Android v2 is deprioritised, or if deep UIA becomes a v1 requirement.

### Electron with a .NET sidecar for Windows integration

Not selected as the primary architecture because it adds a second runtime and IPC boundary. It remains a fallback for UIA, Credential Manager and speech if a native Node addon is not viable after G6. Any such helper must be allow-listed, signed where required, and covered by the same audit and stop controls.

## Comparison

Scores are 1 (poor) to 5 (excellent), based on the stated solo-maintainer constraint and the existing Node code. Weights are a judgement, not a measurement.

| Criterion | Weight | Electron + TypeScript | Tauri 2 + Rust | .NET + WPF/WinUI |
| --- | ---: | ---: | ---: | ---: |
| Reuse of existing code and language | 25% | 5 | 2 | 1 |
| Maintainability by one developer | 20% | 5 | 2 | 3 |
| Windows integration (tray, startup, UIA, credentials) | 20% | 3 | 4 | 5 |
| Installer size and runtime footprint | 15% | 2 | 5 | 3 |
| Credential and secret protection | 10% | 3 | 4 | 5 |
| ARM64 and Android-v2 path | 10% | 4 | 5 | 2 |
| **Weighted score** | **100%** | **3.85** | **3.35** | **3.00** |

The result is sensitive to the owner's skills. If the owner is a strong C# developer and Android v2 is far away, .NET becomes competitive. If the installer must be under roughly 15 MB, Tauri wins. The recommendation is therefore conditional, and G1 exists to make that call.

## Consequences

Positive:

- Fastest credible path to a working Windows companion with the existing skill set.
- One language and one test model across the core and UI.
- Strong typing at the IPC boundary reduces the chance of a renderer compromise becoming filesystem or key access.
- Android v2 can reuse `packages/core` and the provider/memory/policy contracts without Electron.

Negative and mitigations:

- Large installer and memory use. The first M1 unsigned NSIS build is 115.9 MiB (121,556,431 bytes) and unpacks to 359.1 MiB (376,500,216 bytes). Runtime memory was not measured. Publish these numbers rather than hiding them; revisit if size becomes a hard requirement.
- Chromium security updates create a monthly-ish maintenance burden. Pin an Electron major, track security releases, and automate dependency updates with review.
- Electron has no turnkey UIA API. UIA is deferred behind G6; prototype a native helper and measure reliability before promising any desktop automation.
- Playwright's Electron automation is experimental. Keep core integration tests independent of it so an upstream break does not block the suite.
- No direct Credential Manager API in Electron. Use `safeStorage`/DPAPI for the vault key and add a small native adapter for Credential Manager in M2 if required.
- Unsigned builds trigger SmartScreen and lose stable tray identity. Use a per-user stable install path, publish SHA256, explain the warning in the README, and revisit signing at M10 under G4.
- SQLCipher packaging with Electron is unproven here. This is a G2 decision, not an assumption. If SQLCipher cannot be packaged reliably, evaluate an equivalent or application-level encryption with an explicit threat-model trade-off.

## Minimum OS

Recommendation: support 64-bit **Windows 11 25H2 and 26H2**. Treat Windows 10 22H2 LTSC/Enterprise as best-effort, and do not claim support for consumer Windows 10, whose support ended on 2025-10-14. Windows 11 24H2 Home/Pro ended updates on 2026-10-13, so it should not be the baseline. ARM64 follows x64 after the first working installer.

This changes the provisional "Windows 10/11" wording in the master prompt and requires owner approval at G1. Evidence: VERIFICATION_LOG W-23 and W-24.

## Signing and distribution

For v1, ship an unsigned classic installer, SHA256 checksums and a README that explains the expected SmartScreen warning and how to verify the hash. Do not ship MSIX. The repository is private and `UNLICENSED`, so it does not qualify for SignPath Foundation without an explicit open-source decision. Paid OV/EV certificates and Azure Artifact Signing are G4 and, for an individual in Kenya, Azure Artifact Signing public trust is unavailable. Revisit at M10.

## G1 decision

The owner approved all four questions on 2026-10-25:

1. Electron + TypeScript is the v1 stack.
2. Windows 11 25H2/26H2 x64 is the supported baseline, with Windows 10 LTSC/Enterprise best-effort and ARM64 after x64.
3. The companion lives in the isolated `companion/` layout, leaving the legacy WhatsApp bot and pm2 setup untouched.
4. v1 starts unsigned with SHA256 and a documented SmartScreen warning; signing is deferred to M10 and any spend to G4.

If a future owner reverses question 1, the fallback order is Tauri 2, then .NET. Either requires a revised ADR because the module boundaries and native adapters change.
