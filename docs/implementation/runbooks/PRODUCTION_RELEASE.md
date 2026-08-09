# Production release and promotion runbook

## Purpose and release authority

This runbook controls promotion of one immutable Go Digital Automobile CRM revision from staging to production. It is an operating procedure, not evidence that a release occurred. A release remains **NO-GO** until the completed evidence document passes `scripts/release/validate-release-evidence.mjs` and every required human signs the same revision.

The release commander owns the timeline and decision log. Engineering owns the build, migrations, compatibility, and technical smoke tests. Operations owns backups, recovery readiness, monitoring, queues, and provider health. Security owns unresolved findings, secret handling, tenant isolation, and support-access review. Product owns feature scope and the pilot client. Only the release commander may announce GO after every owner has supplied evidence.

## Required inputs

- An immutable Git SHA and application version/tag.
- Green CI from that SHA for install, format, database checks, lint, type-check, unit tests, integration tests, production builds, dependency scan, and container scan.
- A completed release evidence JSON based on `scripts/release/release-evidence.no-go.json`.
- A reviewed P1 -> P2 -> P3 compatibility plan for every schema or contract change.
- Current staging and production environment inventories, with secrets referenced by name only.
- A pre-release database backup, object-storage inventory, and a successful isolated restore drill.
- Revision-specific rollback criteria and commands.
- Green representative load and soak results from production-like staging.
- Confirmed monitoring, alert routing, on-call coverage, and incident channel.
- Provider approvals for every enabled production provider; disabled provider features documented as such.
- A signed mobile candidate and one-dealership pilot plan.

Missing any non-waivable item is an immediate NO-GO. Never paste tokens, connection strings, customer data, OTP peppers, or provider secrets into evidence, chat, tickets, or logs.

## 1. Freeze and identify the candidate

1. Create the release record and name its release commander, commit SHA, version, change window, and rollback deadline.
2. Confirm `git status --short` is empty and `git rev-parse HEAD` exactly matches the candidate SHA.
3. Pin web, API, worker, and mobile artifacts to that same SHA. Record immutable build/deployment IDs, not mutable branch names.
4. Freeze migrations and environment-key changes. Any later code, configuration, migration, or secret change creates a new candidate and invalidates prior test evidence.
5. Copy `scripts/release/release-evidence.no-go.json` outside the source tree as the working evidence record. Keep every gate `NOT_VERIFIED` until a reviewer attaches concrete evidence.

## 2. Reproduce the code gate

Run from a clean checkout with the repository-pinned Node and pnpm versions:

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm format:check
pnpm db:check
pnpm lint
pnpm type-check
pnpm test
pnpm test:integration
pnpm build
pnpm audit --prod --audit-level high
```

Build and scan the exact API/worker Docker image that will be promoted. Store command output, CI run URL, image digest, dependency report, SBOM if generated, and scan report. Critical or high security findings are non-waivable for the release validator. Do not treat a locally unavailable Docker daemon as a passing scan.

## 3. Validate P1 -> P2 -> P3 compatibility

Classify each database and API change:

- **P1 expand:** additive tables, columns, indexes, or contracts that the old application tolerates. Apply P1 while the old application remains live, then test both old and candidate code.
- **P2 transition:** candidate code reads/writes compatible old and new representations. Deploy this only after P1 is proven.
- **P3 contract:** removal, rename, `NOT NULL` tightening, or old representation cleanup. P3 is a later release after web, API, workers, mobile versions, queues, integrations, and rollback windows no longer require P1 compatibility.

Do not combine a destructive P3 change with the pilot cutover. Record the migration IDs, forward-only recovery action, old/new application compatibility result, lock/duration estimate, and the engineering reviewer. A database backup is not a substitute for compatibility.

## 4. Prepare production without traffic changes

1. Confirm production environment validation passes for API and worker independently. Check every required secret exists in the deployment control plane without printing values.
2. Verify database uses the intended production project and direct migration connection; runtime traffic uses the approved pooled connection.
3. Verify Redis TLS, private Tigris bucket access, signed-URL expiry, Sentry release/environment, CORS origins, secure cookie configuration, trusted proxies, and public API documentation policy.
4. Verify API and worker use the same release image digest and compatible environment configuration.
5. Verify all absent/unapproved provider adapters are disabled. Enabled callbacks must use production HTTPS URLs, signature verification, tenant-bound connection records, idempotency, and rate limits.
6. Confirm no real customer data is copied into staging and no development credentials exist in production.
7. Start the incident channel and confirm engineering, operations, security, and product contacts are present for the window.

## 5. Back up and apply P1 migrations

Follow [DATABASE_RECOVERY.md](./DATABASE_RECOVERY.md). Capture the database backup identifier, timestamp, measured RPO, Tigris inventory/checksum artifact, and isolated restore evidence. Confirm the actual recovery target before any command.

Place workers in the documented quiescent state only if the migration plan requires it. Do not delete queued work. Apply migrations once through the designated release job:

```powershell
$env:NODE_ENV = 'production'
if (-not $env:DATABASE_URL) { throw 'Inject the direct production migration connection through the approved secret manager.' }
pnpm db:migrate
```

Run this in an ephemeral release job whose environment is populated by the approved secret manager; do not type or save the connection string in shell history or release artifacts. Record migration output with secrets redacted, then verify the migration ledger, constraints, tenant-scoped indexes, and old-application health before continuing. If P1 fails, stop and use the reviewed forward fix or recovery decision; never manually delete partially migrated business data.

## 6. Promote application components

1. Promote API and worker from the already-scanned image digest. Keep automatic schema mutation out of application startup.
2. Wait for API liveness and readiness. Confirm both API and worker report the candidate release in logs/Sentry and that shutdown/drain behavior is healthy.
3. Verify BullMQ workers consume existing compatible jobs, outbox dispatch is advancing, failed/dead-letter counts are stable, and retries are idempotent.
4. Promote the reviewed OpenNext Worker artifact to Cloudflare from the candidate SHA. Verify environment binding, API origin, auth callback/origin, cache headers, Worker compatibility settings, and that no source maps or secrets are public.
5. Keep the mobile production build in staged/internal distribution until API/web smoke tests and pilot approval pass. Mobile clients must remain compatible with both sides of the deployment window.
6. Enable production provider flags one tenant and one provider at a time only after provider smoke evidence passes. Never enable AI/social automation without the required human approval workflow.

Record provider deployment IDs, image digest, Cloudflare Worker deployment/version ID, EAS build ID, configuration version, and exact promotion times.

## 7. Execute production smoke tests

Use dedicated release accounts in the pilot tenant. Never use cross-tenant identifiers supplied by a browser as authorization evidence.

Verify:

- Liveness and readiness, then authenticated login, refresh, logout, revocation, and permission denial.
- Tenant A cannot read or mutate Tenant B records; branch/team/assignment scope remains enforced.
- Lead capture, deduplication, assignment, follow-up, test ride, completion, negotiation, booking, VIN allocation, payment, readiness, delivery, registration/RC, vehicle creation, and reminder scheduling.
- Append-only lifecycle/ownership/financial history and immutable audit events exist for the smoke journey.
- Webhook signature rejection and duplicate-event idempotency for each enabled provider.
- Queue processing, outbox recovery, signed document/media URL expiry, and download audit.
- Mobile offline replay, duplicate replay safety, explicit-start/stop location tracking, notification registration, and lost-device session revocation.
- Sentry event ingestion, structured correlation IDs, uptime checks, queue alerts, webhook dashboards, and on-call delivery using synthetic/non-sensitive events.

The complete critical journey may run in production-like staging before the window; production smoke must still cover auth, tenant denial, health, one safe pilot path, providers, queues, and observability.

## 8. Decide GO or rollback

Run the evidence validator:

```powershell
node scripts/release/validate-release-evidence.mjs C:\secure-release-evidence\release.json --output C:\secure-release-evidence\validation.json
```

Exit code `0` and decision `GO` are necessary but not sufficient: the release commander must verify the JSON belongs to the deployed SHA and obtain named product, engineering, operations, security, and pilot approvals. Any failed smoke test, critical/high finding, unexplained data mismatch, missed RTO/RPO, alerting gap, or validator NO-GO triggers the rollback decision in [ROLLBACK.md](./ROLLBACK.md).

## 9. Observe and close

Hold heightened observation through the agreed window. Compare API errors/latency, auth failures, queue lag, webhook failures, provider delivery, outbox age, mobile crashes, database saturation, storage errors, and critical-journey conversions against the staging baseline. Reconcile pilot business records daily as described in [PILOT_RUNBOOK.md](./PILOT_RUNBOOK.md).

Close only after all owners approve the exact revision, evidence is stored under retention/access controls, the next-day reconciliation has no unexplained variance, and rollback/on-call coverage transitions to normal operations. P3 cleanup remains a separately reviewed later release.
