# Android mobile release runbook

## Release boundary

The Expo Android application is released through staged EAS profiles and must remain backward compatible through server deployment and rollback windows. This runbook does not prove a signed build or store approval. The `mobile_release` gate stays `NOT_VERIFIED` until build, signing, security, revocation, offline, location, and staged-rollout evidence belongs to the release SHA.

Production credentials, provider secrets, database/Redis/storage keys, signing keys, service-account JSON, and Sentry auth tokens must never be embedded in the application bundle or committed. Only public runtime configuration such as the HTTPS API origin and public push/application identifiers may be compiled into the client.

## Preconditions

- Clean immutable Git SHA with green mobile lint, type-check, unit tests, production build/prebuild checks, dependency scan, and security review.
- Production API compatibility across current store version, candidate, and application rollback version.
- `eas.json` uses distinct development, preview/internal, and production environments; production versioning is remotely managed and build numbers auto-increment.
- Android package/application ID, Play Console app, EAS project/owner, signing credentials, privacy declarations, notification credentials, and Sentry project are confirmed by two reviewers.
- Minimum Android permissions are documented. Core MVP does not request call log, SMS, contacts, accessibility, or background location. Active location starts only after explicit user action and stops when the job ends.
- Pilot accounts, device matrix, offline reset procedure, lost-device test account, rollout/rollback owner, support contacts, and release notes are ready.

## 1. Validate configuration and permissions

Inspect the resolved Expo configuration and generated Android manifest for the production profile. Verify HTTPS production API origin, no localhost/staging URL, no secret values, correct app ID/version/runtime policy, notification setup, cleartext traffic disabled, backups disabled as designed, and restricted permissions blocked.

Search the built bundle/artifact with approved secret-scanning tooling. A configuration key named `public` is not proof its value is safe. Record the scanner report and manifest diff.

## 2. Build internal/preview candidate

From the candidate SHA:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @gdm/mobile lint
pnpm --filter @gdm/mobile type-check
pnpm --filter @gdm/mobile test
eas build --platform android --profile preview --non-interactive
```

Record SHA, application version, Android versionCode, EAS build ID, artifact SHA-256, signing-certificate fingerprint, build profile/environment, and dependency/security report. Never download or record the signing private key.

## 3. Test the signed candidate

Test representative supported Android versions, a low-resource device, Wi-Fi/mobile transitions, airplane mode, process death, token expiry, and clock skew. Verify:

- Password/Google auth as enabled, tenant selection, permissions, refresh/logout, revoked session, deactivated membership, and lost-device revocation.
- No stale tenant/user/support state after logout or account switch.
- Assigned work, test ride, delivery/registration flows, documents/media, notifications, and deep links.
- Expo SQLite durable outbox survives process/device restart, replays in order through idempotency keys, does not duplicate, exposes failed/conflict state, and never uses Zustand persistence as the durable replay source.
- Offline data from one user/tenant is inaccessible after logout/switch and is removed according to policy.
- Location permission is requested in context; tracking begins only after explicit job action, visibly indicates active state, stops immediately at job end/logout/revocation, and does not request background location for core MVP.
- Notification denial has a usable fallback; push tokens rotate/remove correctly; sensitive content is not exposed on a locked screen beyond policy.
- Sentry release/crash evidence is symbolicated and redacted.

Run the server-side session/device revocation procedure and prove the installed candidate cannot refresh or replay queued commands afterward.

## 4. Build the production artifact

Only after preview acceptance:

```powershell
eas build --platform android --profile production --non-interactive
```

Verify the production artifact is generated from the identical approved SHA/config except intended profile values. Record the EAS build ID, version/versionCode, artifact hash, certificate fingerprint, API origin, runtime version, and reviewers. Complete Play Console data-safety/privacy declarations from actual behavior.

## 5. Stage rollout

1. Distribute to the named one-dealership internal/closed pilot first.
2. Confirm API/web/worker release is stable and the candidate completes the critical journey.
3. Observe crash-free sessions, ANRs, startup/login, API failures, offline replay, notification delivery, location stop, battery/data use, and support tickets for the agreed interval.
4. Increase store rollout only at documented checkpoints (for example internal -> closed pilot -> small production percentage -> broader rollout) with product, mobile engineering, operations, and security approval at each step.
5. Halt automatically on critical crash/auth/replay/location/privacy regression or server incompatibility. Do not rely on immediate store rollback; keep the API compatible and use server-side feature flags/containment.

OTA updates are allowed only when the runtime-version policy marks them compatible, review/signing controls pass, and the change does not alter native code, permissions, privacy behavior, or an incompatible API contract.

## 6. Rollback and revocation

Halt rollout, disable the smallest unsafe server-side feature, and retain API compatibility with installed candidates. Promote the last approved store build where the store allows; use an OTA update only under the constraints above. For auth/device risk, revoke server sessions and push tokens immediately. Follow [ROLLBACK.md](./ROLLBACK.md) and the lost-device section of [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md).

Close the release gate only when production signing and artifact identity are verified, staged pilot evidence is attached, alerts route correctly, revocation/offline/location tests pass, privacy/permission review is approved, and rollback/support owners sign.
