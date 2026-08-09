# Next Phase Handoff

## Completed work

Phase 14 local implementation and the final Phases 8-14 code audit are complete. The repository is a
runnable local prototype. Production promotion remains NO-GO until real infrastructure, provider,
mobile-device and pilot evidence is supplied and validated.

## Modules and migrations

- Agency Admin MFA: `apps/api/src/auth/mfa.*`, encrypted authenticator/recovery/challenge persistence,
  login enforcement and the web enrollment/verification/recovery UI.
- Release security: hosted config validation, API/web security headers, release IDs, Sentry/Pino
  propagation, fail-closed private downloads and browser authorization-context resets.
- Messaging reliability: distributed/local rate limits, atomic processing leases, bounded events,
  jittered retry, ambiguous acceptance dead-lettering, raw-PII redaction and private-media deletion.
- Operations: recurring reminder and retention schedulers, release/load/evidence scripts, CI supply-chain
  gates, Docker hardening, Render manual promotion and EAS release profiles.
- `0034_wet_roxanne_simpson.sql`: report/integration permissions and exact Call/Recording transcript FK.
- `0035_jazzy_blonde_phantom.sql`: MFA enums, audit types, authenticators, recovery codes and login
  challenges.

## Important environment variables

In addition to the existing backend/provider variables, hosted environments must provide independent
values for `AUTH_MFA_ACTIVE_KEY_ID`, `AUTH_MFA_CHALLENGE_PEPPER`, `AUTH_MFA_ENCRYPTION_KEYS` and
`AUTH_MFA_RECOVERY_CODE_PEPPER`. The MFA keyring is a JSON map of key IDs to Base64-encoded 32-byte
keys; retain previous keys only while records encrypted under them are being rewrapped.

## Verified local commands

- Frozen install, formatting, migration drift, lint and TypeScript checks pass.
- API unit 76/76, API integration 59/59, database integration 25/25 and web 81/81 pass in their latest
  focused/full executions.
- Root production build passes, including Android and iOS Expo exports.
- Release audit and release-tool tests pass; empty release evidence returns NO-GO by design.
- OpenNext completes Next compilation on Windows but Windows denies a required symlink during final
  bundling. Run the checked-in Linux CI job for authoritative Cloudflare artifact evidence.

## Seed and local prototype

Copy `.env.example` to `.env`, keep the local-only defaults, start Docker backing services, migrate,
seed, then run API/web/worker as documented in `README.md`. Seed adapters are development-only and must
never be represented as official provider validation.

## Exact next action

Follow `docs/implementation/runbooks/PRODUCTION_RELEASE.md` in staging: freeze an immutable candidate,
run Linux CI, take and restore a Supabase recovery point, deploy the Render API migration-first, smoke
the worker and Cloudflare artifact, enable only approved providers, run load/soak and signed-device
checks, execute the one-dealership pilot, then populate and validate `RELEASE_EVIDENCE_TEMPLATE.md`.
