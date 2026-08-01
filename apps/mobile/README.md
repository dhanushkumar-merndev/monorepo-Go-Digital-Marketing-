# Mobile application

Android-first Expo Router shell for field roles. Phase 0 contains platform infrastructure and
reusable native UI primitives only; it intentionally contains no lead, test-ride, delivery, or
location-tracking workflow.

## Run from the repository root

```bash
pnpm install
pnpm --filter @gdm/mobile dev
pnpm --filter @gdm/mobile android
```

Generate the Android native project from the reviewed Expo config when native development is
required:

```bash
pnpm --filter @gdm/mobile prebuild
```

The generated `android/` directory is ignored in Phase 0. The Expo config is the source of truth.
SDK 57 targets Android API 36. The config explicitly blocks call-log, SMS, contacts, legacy
external-storage, system-overlay, accessibility-service and location permissions. Notification
permission is requested only from the in-context button in the shell.

Remote push delivery still requires reviewed FCM/EAS credentials and authenticated backend device
registration. Those production integration steps are intentionally deferred; Phase 0 only
configures the native notification channel and permission UX.

## Local data

`expo-sqlite` creates platform-only migration metadata and a generic ordered outbox. No customer or
dealership data is cached in Phase 0. SQLCipher is not enabled yet because a reviewed device-key
management design is required before sensitive offline data is introduced.

## Verification

```bash
pnpm --filter @gdm/mobile lint
pnpm --filter @gdm/mobile type-check
pnpm --filter @gdm/mobile test
pnpm --filter @gdm/mobile build
```
