# Production rollback runbook

## Principles

A rollback changes application traffic only when the previous application is compatible with the current schema and queued payloads. Database migrations are forward-only by default. Never improvise destructive SQL, delete migration-ledger rows, replay non-idempotent commands, or restore a database merely to undo an application defect.

The release record must name the candidate SHA/image digest, previous known-good SHA/image digest, schema compatibility boundary, mobile compatibility range, feature/config changes, rollback deadline, and owner. If any of those are unknown, stop promotion.

## Rollback triggers

The release commander opens a rollback decision immediately for:

- Tenant isolation, authorization, secret exposure, audit integrity, or critical/high security regression.
- Data corruption, missing financial/lifecycle history, broken idempotency, or unexplained cross-system reconciliation variance.
- Critical journey failure without a safe feature disable.
- Sustained availability/error/latency breach, database saturation, queue backlog growth, or worker retry storm.
- Provider sends to the wrong tenant/customer, invalid webhook acceptance, or uncontrolled duplicate sends.
- Mobile crash/auth/offline replay/location regression affecting the staged cohort.
- Missing alerts, failed backup/restore evidence, or evidence validator decision `NO-GO`.

Security or cross-tenant triggers require immediate traffic/feature containment; do not wait for an error-rate threshold.

## Decision matrix

| Condition                                                   | Safe first action                                                      | Data action                                                                   |
| ----------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| One optional feature/provider is faulty                     | Disable its server-side tenant feature flag; stop its consumers        | Preserve outbox/webhook records for idempotent replay                         |
| Candidate app is faulty; schema remains backward compatible | Route to previous immutable web/API/worker artifacts                   | No schema rollback                                                            |
| New worker payload is incompatible                          | Pause affected queue, roll compatible worker, inspect payload versions | Transform/replay only through reviewed idempotent tooling                     |
| Additive P1 migration is faulty but data is intact          | Keep traffic on compatible app; deploy reviewed forward migration      | Forward fix, no column/table deletion                                         |
| Data is corrupt or unavailable                              | Contain writes and invoke incident/recovery authority                  | Consider PITR/restore only under DATABASE_RECOVERY.md                         |
| Mobile candidate is faulty                                  | Halt rollout and promote last approved store build/OTA-safe change     | Revoke sessions/tokens only when required; server remains backward compatible |

## 1. Contain and preserve evidence

1. Declare the incident/rollback decision, UTC time, trigger, affected tenants, and commander.
2. Stop further web/mobile promotion and provider flag changes.
3. Disable the smallest affected feature where safe. For tenant/security uncertainty, remove public traffic or disable the affected integration globally.
4. Pause affected BullMQ consumers gracefully; do not delete waiting, delayed, active, failed, or dead-letter jobs.
5. Preserve correlation IDs, deployment IDs, Sentry events, redacted logs, queue/outbox counts, webhook receipts, database metrics, and configuration version.
6. Keep credentials in the secret manager. Rotate only those reasonably exposed, then revoke old values and record audit events.

## 2. Confirm backward compatibility

Engineering must answer all of these before application rollback:

- Does the previous API understand the current additive schema and ignore new nullable fields/tables?
- Does the previous worker understand every queued job name and payload version?
- Can current web and already-distributed mobile clients call the previous API contract?
- Did configuration/secret names change, and are previous values still valid and secure?
- Was any P3 contract/removal applied? If yes, do not deploy the old application until a forward compatibility fix exists.
- Will reverting a provider flag strand inbound events or violate a delivery window?

Attach the compatibility review. A database backup does not make an incompatible rollback safe.

## 3. Roll back immutable application artifacts

1. Select the recorded previous known-good API/worker image digest. Deploy both from that digest; never rebuild an old branch.
2. Restore the previous compatible environment/configuration version without restoring or exposing old secrets.
3. Route the Vercel production alias to the recorded previous web deployment.
4. Keep workers paused until API readiness and schema compatibility pass, then resume one queue at a time with concurrency/rate limits.
5. Halt the EAS/store rollout. Use the last approved mobile binary or an OTA update only when its runtime-version policy and review rules explicitly permit it.

Record every deployment/control-plane operation ID and UTC time.

## 4. Verify rollback

Verify API liveness/readiness, authentication and session revocation, tenant/permission denial, one safe pilot read/write path, database writes/history/audit, outbox progression, queue lag/failures, webhook signature/idempotency, provider feature state, signed-object access, web asset/version, and mobile compatibility. Compare record counts and latest durable event IDs before and after rollback.

If queues are resumed, begin at low concurrency and observe duplicate prevention, provider rate limits, oldest-job age, failure rate, and outbox lag. Never mark failed jobs complete by direct Redis mutation.

## 5. Data recovery escalation

If data correctness cannot be established, stop writes and follow [DATABASE_RECOVERY.md](./DATABASE_RECOVERY.md). A production restore requires an explicit expected data-loss interval, provider/Tigris reconciliation plan, business approval, and security approval. Preserve the damaged database before recovery. After recovery, replay only verified signatures/events/commands through idempotent entry points and reconcile all external provider states.

## 6. Close

Keep heightened monitoring until error, latency, queue, provider, audit, and business reconciliation metrics return to baseline. Notify pilot users of impact and any confirmed data window. Capture root cause, affected records/tenants, containment, commands/control-plane IDs, verification, residual risk, and corrective actions. The failed candidate remains blocked; any fix is a new SHA and a new release evidence record.
