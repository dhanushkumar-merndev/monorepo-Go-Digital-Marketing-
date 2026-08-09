# Representative load and soak test runbook

## Safety and purpose

The dependency-free runner in `scripts/release/load-test.mjs` generates 75 concurrent representative read requests by default and emits a machine-readable JSON summary. Run it against a production-like non-production environment with a resettable pilot tenant. A local script test is not performance evidence, and this runbook does not authorize production load.

Remote non-production targets require HTTPS, an explicit environment label, and `LOAD_TEST_TARGET_CONFIRMATION` equal to the exact host. Production is blocked unless both `--allow-production` and an exact `LOAD_TEST_PRODUCTION_CONFIRMATION` are supplied under a separately approved change. The base URL may contain only an origin, never credentials or a path.

## Preconditions

- Candidate API/worker/database/schema/configuration matches the intended production revision and staging has comparable capacity documented.
- A dedicated staging tenant has representative, non-sensitive seeded leads, inventory, bookings, rides, delivery/registration records, conversations, users, permissions, and provider simulators or approved staging connections.
- A least-privilege staging test user can access only that tenant. Its short-lived bearer token is supplied in process memory and never saved in evidence.
- Monitoring captures API p50/p95/p99, errors, PostgreSQL connections/latency/locks, Redis, per-queue age/failure, outbox age, provider rate limits, worker CPU/memory, and event-loop/resource saturation.
- No migrations, deployments, imports, backup jobs, or unrelated tests overlap the measurement window.
- Evidence paths are new; the runner refuses to overwrite an existing output file.

## Default representative mix

The built-in mix exercises liveness/readiness plus authenticated lead, test-ride, inventory, booking, delivery, registration, and unified-inbox conversation list routes. It is read-only and derives tenant context from the bearer token. The mix deliberately sends no client-supplied tenant authorization header.

Review route query contracts and staging seed volume before each release. To use a changed mix, copy `scripts/release/scenarios.example.json`, retain relative paths and expected statuses, and attach the reviewed scenario file/hash to evidence. Non-GET/HEAD methods are blocked unless `--allow-writes` is explicit; writes are permitted only for resettable seeded data with reviewed idempotency and reconciliation.

## Run the 60-second load profile

In a fresh PowerShell process:

```powershell
$env:LOAD_TEST_BASE_URL = 'https://api.staging.your-approved-domain'
$env:LOAD_TEST_ENVIRONMENT = 'staging'
$env:LOAD_TEST_TARGET_CONFIRMATION = 'api.staging.your-approved-domain'
if (-not $env:LOAD_TEST_BEARER_TOKEN) { throw 'Inject a short-lived staging test-user token through the approved secret manager.' }
node scripts/release/load-test.mjs `
  --profile load `
  --concurrency 75 `
  --output C:\secure-release-evidence\load-release-id.json
$loadExit = $LASTEXITCODE
Remove-Item Env:LOAD_TEST_BEARER_TOKEN
if ($loadExit -ne 0) { throw 'Load gate failed; inspect the JSON result and telemetry.' }
```

The default read threshold is p95 at most 500 ms, maximum error rate 1%, at least 150 responses, and every scenario exercised. These align with the PRD read objective; a representative write scenario must use the stricter reviewed write objective of p95 under 700 ms rather than diluting mixed results.

## Run the soak profile

After the load run and resource recovery, use a new evidence file:

```powershell
$env:LOAD_TEST_BASE_URL = 'https://api.staging.your-approved-domain'
$env:LOAD_TEST_ENVIRONMENT = 'staging'
$env:LOAD_TEST_TARGET_CONFIRMATION = 'api.staging.your-approved-domain'
if (-not $env:LOAD_TEST_BEARER_TOKEN) { throw 'Inject a new short-lived staging test-user token through the approved secret manager.' }
node scripts/release/load-test.mjs `
  --profile soak `
  --concurrency 75 `
  --output C:\secure-release-evidence\soak-release-id.json
$soakExit = $LASTEXITCODE
Remove-Item Env:LOAD_TEST_BEARER_TOKEN
if ($soakExit -ne 0) { throw 'Soak gate failed; inspect the JSON result and telemetry.' }
```

The default soak duration is 900 seconds. Increase it when the approved plan needs to expose connection leaks, queue accumulation, provider throttling, or memory growth; record the reason and duration. Do not reduce duration or concurrency after a failure and call the new run equivalent.

## Interpret evidence

The JSON result is `PASS` only when minimum sample, error rate, p95, and every-scenario checks pass. It includes target origin/environment, configured concurrency/duration/timeout, aggregate requests/rate/latencies/failure samples, and per-scenario statuses. It excludes the bearer token and response bodies.

Performance acceptance also requires the matching telemetry window to show:

- No sustained database/Redis saturation, lock/connection leak, worker crash/restart, queue/outbox growth, provider rate-limit breach, or Tigris error.
- No tenant/permission/security anomaly, duplicate command/provider send, audit gap, or data mismatch.
- Stable resource use through the soak and an expected return to baseline afterward.
- Candidate SHA, configuration, scenario hash, seed snapshot, operator, UTC window, and dashboard snapshot/query IDs recorded.

An unavailable environment, missing token, connection error, threshold failure, incomplete scenario coverage, or absent telemetry is `NOT_VERIFIED`/NO-GO. Diagnose and fix the cause, reset the staging data as approved, and create a new evidence file for a complete rerun.
