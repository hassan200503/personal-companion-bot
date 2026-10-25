# Android v2 Notes

Status: reserved for v2. Nothing here is built, promised or tested in v1.
Last updated: 2026-10-25

The master prompt explicitly makes Android v2 out of scope for v1. These notes preserve the platform constraints so the v1 architecture does not make v2 unnecessarily hard.

## Carried findings

These came from the owner's master prompt and remain SECONDARY until re-verified against current Android and Google Play documentation:

- Microphone foreground services cannot be started from boot or from the background on Android 15 and later targets. Voice capture will require a visible foreground service and a user action.
- Google Play policy prohibits autonomous accessibility automation except for verified accessibility tools. UI automation is not a viable Play-distributed feature for this product.
- Sideloaded apps face Restricted Settings on Android 13 and later and Enhanced Confirmation Mode on Android 15. Reports conflict about whether accessibility can still be enabled after sideloading; treat this as a support burden, not a reliable distribution route.

Tauri 2 lists Android among its supported targets and documents the Android SDK, NDK and Rust target prerequisites. This is VERIFIED as a capability statement only; no Android build was attempted. Source: `https://v2.tauri.app/start/prerequisites/`.

## Design implications

- Reuse the framework-neutral domain core: typed contracts, provider gateway, memory envelope, policy engine, risk classes and export format. Do not put Electron, Node filesystem or Windows-specific assumptions in that core.
- Expect a separate Android shell. Do not assume the desktop UI can be reused unchanged.
- Do not plan an always-listening wake word, covert recording or silent accessibility automation. These conflict with v1 non-goals and, on Android, with platform policy.
- Voice will need a visible foreground service, a persistent notification, the microphone permission and an explicit user start action. Verify the target-SDK rules before designing the flow.
- Use Android Keystore-backed encryption for secrets and the local database. The desktop DPAPI/Credential Manager design will not transfer directly.
- Plan for notification permission on Android 13 and later, battery-optimisation prompts, and background execution limits.
- The setup wizard and provider onboarding must tolerate a mobile browser and a paste-from-clipboard flow, but clipboard reads still require a user action.
- The export format and memory schema should be portable. Avoid Windows paths, registry assumptions and desktop-only identifiers in persisted records.

## Open questions for v2

- Is Play distribution required, or is sideloading acceptable? This changes the accessibility and microphone strategy.
- Which Android versions and architectures are supported?
- Does the product need background reminders while the app is closed? If so, which exact foreground-service type and permission will Play accept?
- Can the core be packaged as a shared TypeScript package, or does the Android shell need a different language and a contract-only boundary?
- What is the migration path for desktop data, if any? Multi-device sync is a v1 non-goal.

## What not to do now

- Do not add Android projects, Gradle files, Capacitor, React Native or Tauri mobile scaffolding in v1.
- Do not promise feature parity or a release date.
- Do not claim that accessibility automation will work on Android.
- Do not weaken the desktop permission model to make a future mobile port easier.
