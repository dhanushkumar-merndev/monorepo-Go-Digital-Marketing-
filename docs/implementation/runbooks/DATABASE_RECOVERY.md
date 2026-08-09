# Database backup and isolated restore runbook

## Scope and safety boundary

This runbook verifies recoverability of Supabase PostgreSQL and the separate private Tigris object store. It does not claim a hosted restore has occurred. Database backups do not contain Tigris objects, so both evidence sets are mandatory.

The recovery operator and an independent reviewer must positively identify source and target projects before commands run. The restore target must be an isolated, disposable, access-restricted recovery project with outbound webhooks, messaging, telephony, notifications, scheduled jobs, and workers disabled. Never restore into production to perform a drill. Never use `--clean` until the reviewer has confirmed the target is the isolated recovery database.

The PRD targets are RPO at most 24 hours for the low-cost pilot or at most 1 hour where paid point-in-time recovery is enabled, and RTO at most 8 hours for pilot or 4 hours for production. Record the subscribed backup/PITR tier and measured results; do not infer them.

## Evidence required before the drill

- Release ID, source project reference, source database host fingerprint, backup/PITR identifier and UTC time.
- Recovery target project reference, database name, host fingerprint, owner, creation time, and proof it is not production.
- Encrypted evidence location and access list.
- Migration-ledger snapshot and expected migration count.
- Counts/checksums for tenant, membership, lead, ownership/lifecycle history, audit, outbox, queue metadata, booking/payment, delivery, registration/RC, and vehicle/reminder records.
- Tigris inventory containing key/version (if enabled), size, ETag/checksum, and last-modified time without object contents or signed URLs.
- Drill start time, recovery point time, completion time, measured RPO/RTO, exceptions, and reviewer decision.

Use aggregate counts or opaque identifiers in evidence. Do not export passwords, access/refresh tokens, complete documents, provider credentials, or unnecessary personal data.

## 1. Capture a pre-release logical backup

Prefer the provider-managed backup/PITR identifier for disaster recovery and capture a logical dump for portability and migration verification. Supply the direct source URI from the secret manager only to the process environment:

```powershell
if (-not $env:PGDATABASE_SOURCE_URI) { throw 'Inject the direct source URI through the approved secret manager.' }
pg_dump --dbname=$env:PGDATABASE_SOURCE_URI --format=custom --no-owner --no-acl --verbose --file=crm-pre-release.dump
Get-FileHash -Algorithm SHA256 -LiteralPath .\crm-pre-release.dump
Remove-Item Env:PGDATABASE_SOURCE_URI
```

Inject the URI into an ephemeral job rather than typing it into shell history. Store the dump encrypted with restricted access and approved retention. Capture `pg_dump --version`, database server version, dump byte size, SHA-256, start/end time, and provider backup identifier. A successful command without a non-zero file and checksum is not valid evidence.

## 2. Inventory Tigris separately

Use an approved S3-compatible inventory job with read-only credentials. Capture bucket identity, region/endpoint, object count, total bytes, key/version, ETag/checksum, and last-modified timestamp. Exclude object bodies and signed URLs from the report. Sample every business document class and retain the inventory under the same release ID.

Confirm private access remains enforced and that recovery credentials cannot send messages or invoke callbacks. If provider-native versioning or replication is not enabled, document that risk and the compensating copy/retention process as a release blocker or approved scoped exception.

## 3. Prepare the isolated recovery target

1. Create or reset the dedicated recovery project using the approved infrastructure process.
2. Verify its project reference, host, database name, and network allowlist differ from production. Have a second person confirm in the evidence record.
3. Disable API, workers, cron, webhooks, outbox dispatch, email/SMS/WhatsApp/telephony, push, and provider credentials.
4. Restrict access to the recovery team. Set an expiry/deletion ticket for recovered sensitive data.
5. Verify sufficient PostgreSQL version/extensions and storage capacity.

## 4. Restore and time the drill

Start the RTO timer from the declared incident-detection or recovery-decision time. Supply only the isolated target URI:

```powershell
if (-not $env:PGDATABASE_RECOVERY_URI) { throw 'Inject the isolated recovery URI through the approved secret manager.' }
pg_restore --dbname=$env:PGDATABASE_RECOVERY_URI --no-owner --no-acl --exit-on-error --verbose .\crm-pre-release.dump
Remove-Item Env:PGDATABASE_RECOVERY_URI
```

For a non-empty disposable target, use `--clean --if-exists` only after the target identity and destructive scope have been independently rechecked. For provider PITR, follow the provider control-plane restore procedure, record its operation ID/timestamps, and keep the restored project isolated.

Restore a controlled copy of sampled Tigris objects into a distinct recovery bucket/prefix. Preserve checksums and never point the restored database at production callbacks or provider credentials.

## 5. Verify business and security invariants

Run read-only checks and application smoke tests against the isolated target:

- Migration ledger is complete and ordered; schema constraints, foreign keys, unique/idempotency keys, and tenant indexes exist.
- Every client-owned sampled row has a non-null tenant ID and cannot be accessed through another tenant's authenticated context.
- Relationship, current-process, and conversation owners remain distinct and history is append-only.
- Audit events, lifecycle/status history, financial entries, webhook receipts, and outbox records retain identifiers and ordering.
- Aggregate counts/checksums match the pre-backup baselines or have a documented recovery-point delta.
- Object inventory count/checksum matches; sampled private objects open only through short-lived signed access and downloads are audited.
- Login/session revocation, readiness, a read-only critical-journey sample, and queue startup succeed while all external sends remain disabled.

Measure RPO as the difference between the newest verified durable business event and the declared incident/recovery point. Measure RTO through completed verification, not merely database availability.

## 6. Decide and close

The drill is PASS only when the measured RPO/RTO meet the applicable target, database and object evidence reconcile, tenant isolation is proven, and the independent reviewer signs. Any unexplained mismatch is a failed restore gate.

Export redacted logs, hashes, row-count results, object inventory, provider operation IDs, measured times, and reviewer identity to the release evidence store. Then expire access and destroy the isolated recovered data through the approved infrastructure process; record the deletion operation. Never use drill data for development or seed data.

## Production recovery decision

During a real incident, prefer forward repair or application rollback when the database is sound. Restoring production loses data after the recovery point and requires incident-commander, database owner, security, and business approval. Before restore, stop writes and workers, preserve the damaged state for forensics, choose the exact recovery point, account for Tigris separately, and publish the expected data-loss window. After restore, reconcile providers/webhooks/outbox idempotently before reopening traffic.
