# Mobile application

Android-first Expo Router application for authenticated field roles. Phase 1 adds secure login,
rotating session recovery, disabled-account handling, logout and a guarded role-aware shell for
Salesperson, Test Ride Executive and Delivery Executive. Lead, test-ride, delivery and location
workflows remain deferred to their assigned phases.

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
dealership data is cached in Phase 1. SQLCipher is not enabled yet because a reviewed device-key
management design is required before sensitive offline data is introduced.

Access and refresh tokens are stored together as one versioned bundle in `expo-secure-store`.
They are never stored in Zustand persistence, SQLite or the generic outbox. Refresh rotation is
single-flight, persists the new bundle before retrying a failed request and replays a request at
most once. Revoked, reused and disabled sessions clear credentials and TanStack Query data.

## Authentication configuration

`EXPO_PUBLIC_API_URL` is the only public mobile API setting and must point to the NestJS `/v1`
base. Non-loopback staging and production traffic requires HTTPS. Do not add database URLs,
provider credentials or Supabase service-role keys to an `EXPO_PUBLIC_` variable.

The API binds every session to a server-authorized active membership. The mobile client does not
send a dealership or tenant identifier as authorization proof. Office/admin roles are rejected by
the mobile shell and must use the web dashboard; backend permission checks remain authoritative.

Remote FCM registration is not part of Phase 1. Login sends only app/platform session metadata.

## Verification

```bash
pnpm --filter @gdm/mobile lint
pnpm --filter @gdm/mobile type-check
pnpm --filter @gdm/mobile test
pnpm --filter @gdm/mobile build
```

For native configuration verification, also run:

```bash
pnpm --filter @gdm/mobile prebuild
```
