# One-dealership pilot runbook

## Pilot objective and boundary

The pilot proves that one named dealership can operate the complete CRM journey safely in production with approved branches, users, integrations, data, training, support, reconciliation, and measurable acceptance. This runbook is not pilot acceptance. [PILOT_ACCEPTANCE.md](../PILOT_ACCEPTANCE.md) defaults to **NO-GO / NOT APPROVED** until named reviewers sign concrete evidence.

Do not silently add a second dealership, branch, provider, automation, or migrated data source. Scope changes require a new risk review and acceptance baseline.

## 1. Approve exact scope

Record:

- Legal dealership/client organization name, pilot owner, start/end dates, timezone, and support/escalation contacts.
- Included branch IDs/names and explicit excluded branches.
- Named users, role, branch/team/assignment scope, training completion, and least-privilege permission review.
- Enabled modules and every server-side feature flag.
- Enabled telephony/messaging/storage/auth/push provider connection, provider approval ID, callback URL, template/number/sender, credential owner/expiry, consent/suppression policy, and test evidence.
- AI/social features individually disabled or supported by a provider-backed workflow with required human review/approval.
- Data source, migration batch IDs, row counts, rejected/quarantined rows, dedupe policy, ownership mapping, consent/retention basis, backup, and rollback linkage.
- Supported web browsers/Android devices/app versions and expected operational hours.

Tenant context must come from authenticated membership. Do not use a browser/mobile-supplied tenant ID as authorization proof. Agency support access requires a reason, short-lived elevation, visible state, and immutable audit.

## 2. Configure and verify users/data

1. Create the dealership, approved branches, teams, memberships, working hours, role assignments, and module flags through audited administration workflows.
2. Prove every role can perform only its allowed actions and cannot cross branch/team/assignment scope. Run explicit cross-tenant denial tests with a separate controlled tenant.
3. Seed/import only approved pilot data. Validate required tenant IDs, phone normalization/dedupe, relationship/current-process/conversation ownership, consent/suppression, lifecycle/status history, and source attribution.
4. Reconcile imported counts and quarantines. No batch becomes live until its backup, idempotency, rollback linkage, and client approval are recorded.
5. Confirm session revocation/deactivation, support elevation, audit exports, signed document access, and retention paths.

## 3. Train and rehearse

Train each included role using production-like staging. Cover login/MFA where required, lead ownership and SLA, messaging/telephony consent, test-ride location start/stop, booking/payment evidence, VIN allocation, delivery proof/OTP, RC documents, reminders, offline conflict/replay, lost device, and support escalation.

Run a tabletop for provider outage, Redis/queue backlog, webhook duplicate, lost mobile device, user deactivation, wrong-branch assignment, and rollback. Record attendance, questions, failed steps, retraining, and readiness approval.

## 4. Execute the critical journey

Use a consented pilot record and opaque evidence identifiers. Complete and verify every handoff:

1. Lead capture through an enabled source.
2. Tenant-safe phone deduplication and auditable duplicate outcome.
3. Race-safe assignment with relationship owner, current process owner, and conversation owner kept distinct.
4. Follow-up/SLA activity and customer conversation through an approved channel.
5. Test ride scheduled, explicit location start, OTP/authorization as configured, ride completion, and immediate location stop.
6. Negotiation with append-only lifecycle/audit history.
7. Booking created through valid state transitions.
8. Inventory/VIN allocated without cross-branch race or duplicate allocation.
9. Payment evidence recorded with immutable financial history and idempotency.
10. Delivery readiness checks completed.
11. Delivery job executed with proof/OTP, audit, and sensitive-object access controls.
12. Registration/RC tracked and documents accessed through short-lived signed URLs with download audit.
13. Customer vehicle created with historical attribution intact.
14. Reminder plan/instance scheduled and visible to the correct owner/tenant.

At each step record timestamp, acting role, opaque record/event IDs, expected/actual status, API correlation ID, audit/history evidence, queue/outbox/provider outcome, and reviewer. Also prove invalid transitions, unauthorized role access, and cross-tenant access are rejected.

Run the representative 75-concurrent load and soak checks against production-like staging before pilot GO. Use `scripts/release/load-test.mjs`; store the machine-readable result and never load-test production without the explicit two-part latch and change approval.

## 5. Daily pilot operation and reconciliation

At opening, verify API/readiness, database/Redis/storage, provider credentials/callbacks, queues/outbox, mobile minimum version, alerts/on-call, and known issues. During operating hours, monitor critical journey, SLA, error/latency, provider delivery, failed jobs, mobile crash/replay/location, and support cases.

At close, reconcile:

- Captured leads by source against dedupe, assignment, unassigned, and SLA counts.
- Conversation/call attempts against provider accepted/delivered/failed/unknown and consent/suppression.
- Test rides against active/completed/abandoned status and location-stop evidence.
- Bookings, VIN allocations, payments, delivery readiness/jobs/proofs, registrations/RC, vehicles, and reminders against source documents/provider records.
- PostgreSQL outbox against BullMQ completion/dead-letter and provider/webhook idempotency keys.
- Sensitive downloads, exports, support elevations, permission denials, deactivated sessions, and audit continuity.

Every variance gets an owner, severity, explanation, affected opaque IDs, corrective action, and next review time. Never directly mutate records to force counts to match.

## 6. Metrics and exit criteria

Before start, product and the dealership approve numeric targets and observation duration for availability, API p95 reads/writes, assignment/SLA, journey completion, duplicate rate, queue/outbox age, provider failure, mobile crash-free sessions/offline replay, support response, reconciliation variance, and critical/high defects. PRD latency objectives are read p95 under 500 ms and write p95 under 700 ms; do not weaken them through an undocumented pilot threshold.

Pilot acceptance requires:

- Every included role completes its assigned critical-journey tasks.
- Cross-tenant, permission, transition, webhook, queue, offline, location, object, audit, and revocation controls pass.
- No unresolved critical/high security or data-integrity issue.
- Backup/isolated restore, rollback, incident, monitoring, mobile, provider, and support procedures are demonstrated.
- Daily reconciliations have no unexplained material variance.
- Known limitations and disabled functionality are understood and accepted in writing.
- Dealership, product, engineering, operations, and security sign the exact release/pilot evidence.

Any missing signature or evidence remains NO-GO. A waiver must be written, scoped, time-limited, owned, and allowed by the release validator; critical/high security and other non-waivable gates cannot be waived.

## 7. Support and closeout

Publish one support route, severity model, operating hours, on-call contact, next-update promise, and escalation to engineering/security/provider. Use [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md) and [ROLLBACK.md](./ROLLBACK.md) for containment/recovery.

At the end, hold a dealership review covering metrics, reconciliations, incidents, limitations, training, support, data/consent, and expansion risks. Expansion to more branches/dealerships is a separate approval; pilot success does not automatically authorize it.
