# Mobile application

Expo Router application for authenticated Android and iOS field roles. Phase 1 adds email/password
and Google login, rotating session recovery, disabled-account handling, logout, and a guarded
role-aware shell for Salesperson, Test Ride Executive, and Delivery Executive. Lead, test-ride,
delivery, and location workflows remain deferred to their assigned phases.

## Run from the repository root

```bash
pnpm install
pnpm --filter @gdm/mobile dev
pnpm --filter @gdm/mobile android
```

Generate the Android native project from the reviewed Expo config when native development is
required:

```bash
pnpm --filter @gdm/mobile native:generate:android
```

On macOS, generate or run the iOS native project with `native:generate:ios` and `ios`. Signed
release artifacts should be produced through the reviewed EAS/native signing workflow, with
environment-specific OAuth clients.

Generated native directories are ignored. The Expo config is the source of truth.
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

`EXPO_PUBLIC_API_URL` must point to the NestJS `/v1` base. Google builds use
`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, which must equal the API's `GOOGLE_AUTH_WEB_CLIENT_ID`; native
sign-in requests an ID token whose audience is that Web/server client. iOS additionally uses
`EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` for app registration and its reversed URL scheme only. Android
registration is the package/SHA pair in Google Cloud and needs no Android client-ID environment
variable. Non-loopback staging and production traffic requires HTTPS. OAuth client IDs are
identifiers, not secrets; never add a Google client secret, database URL, provider token, or
Supabase service-role key to an `EXPO_PUBLIC_` variable.

Google authentication is implemented with `react-native-nitro-google-signin`, so it cannot run in
Expo Go. Create a development build signed with a registered Android certificate or configured
with the matching iOS OAuth client. The native provider token is passed directly to NestJS for
verification and is never stored; only the CRM session is written to `expo-secure-store`.

`eas.json` maps the `development`, `preview`, and `production` profiles to separate EAS
environments. Set `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, and the iOS client ID
in each applicable environment. Native EAS builds fail closed when required IDs are absent. Use
EAS environment selection rather than `NODE_ENV` to choose these values.

See [`docs/implementation/GOOGLE_AUTH_SETUP.md`](../../docs/implementation/GOOGLE_AUTH_SETUP.md)
for the exact package name, bundle identifier, SHA-1, OAuth clients, and environment separation.

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

The `build` command exports both Android and iOS production JavaScript bundles. It does not replace
signed Play Store or App Store artifact verification.

For native configuration verification, also run:

```bash
pnpm --filter @gdm/mobile native:generate:android
```
