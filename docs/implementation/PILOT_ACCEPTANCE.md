# One-dealership pilot acceptance

## Current decision

**NO-GO — NOT APPROVED — NOT VERIFIED**

This is a blank acceptance record. It must never be cited as evidence until a named dealership and release complete the [pilot runbook](./runbooks/PILOT_RUNBOOK.md), all results are attached, and every required authority signs the same immutable release. Delete no `NOT VERIFIED` marker without evidence.

## Pilot identity and scope

| Field                                              | Approved value |
| -------------------------------------------------- | -------------- |
| Release ID / Git SHA                               | NOT VERIFIED   |
| API/worker image digest                            | NOT VERIFIED   |
| Web deployment ID                                  | NOT VERIFIED   |
| Mobile build ID/versionCode                        | NOT VERIFIED   |
| Dealership legal/client organization name and ID   | NOT VERIFIED   |
| Pilot owner at dealership                          | NOT VERIFIED   |
| Start/end and timezone                             | NOT VERIFIED   |
| Included branch names/IDs                          | NOT VERIFIED   |
| Explicitly excluded branches                       | NOT VERIFIED   |
| Named users, roles, branch/team scope              | NOT VERIFIED   |
| Enabled modules/feature flags                      | NOT VERIFIED   |
| Enabled provider connections and approval IDs      | NOT VERIFIED   |
| Disabled provider/AI/social features               | NOT VERIFIED   |
| Migrated/seeded data batches and counts            | NOT VERIFIED   |
| Supported web browsers/mobile devices/app versions | NOT VERIFIED   |
| Support route, hours, on-call and escalation       | NOT VERIFIED   |

Scope change after approval resets acceptance to NO-GO.

## Readiness approvals

| Area                                                                                  | Status       | Evidence / accountable reviewer |
| ------------------------------------------------------------------------------------- | ------------ | ------------------------------- |
| Tenant, branch, team, assignment, ownership and permission isolation                  | NOT VERIFIED | NOT VERIFIED                    |
| User/session revocation, deactivation and least privilege                             | NOT VERIFIED | NOT VERIFIED                    |
| Agency support reason/elevation/visible state/audit                                   | NOT VERIFIED | NOT VERIFIED                    |
| Data migration, dedupe, ownership mapping, consent, retention and reconciliation      | NOT VERIFIED | NOT VERIFIED                    |
| Provider credentials/callbacks/signatures/idempotency/rate limits                     | NOT VERIFIED | NOT VERIFIED                    |
| Private storage, signed URLs, file validation/scanning adapter and download audit     | NOT VERIFIED | NOT VERIFIED                    |
| Backup, object inventory and isolated restore within applicable RPO/RTO               | NOT VERIFIED | NOT VERIFIED                    |
| Application/data rollback and incident tabletop                                       | NOT VERIFIED | NOT VERIFIED                    |
| Monitoring, Sentry/logs, uptime, queue/outbox and webhook alerts routed               | NOT VERIFIED | NOT VERIFIED                    |
| 75-concurrent representative load and soak results                                    | NOT VERIFIED | NOT VERIFIED                    |
| Signed mobile candidate, permissions/privacy, offline replay, location and revocation | NOT VERIFIED | NOT VERIFIED                    |
| Role training, attendance, competency and support rehearsal                           | NOT VERIFIED | NOT VERIFIED                    |
| Known limitations/disabled capabilities understood                                    | NOT VERIFIED | NOT VERIFIED                    |
| Critical/high security and data-integrity findings resolved                           | NOT VERIFIED | NOT VERIFIED                    |

## Critical journey acceptance

| Step                                                       | Status       | Opaque record/correlation/audit evidence | Dealership reviewer |
| ---------------------------------------------------------- | ------------ | ---------------------------------------- | ------------------- |
| 1. Lead capture                                            | NOT VERIFIED | NOT VERIFIED                             | NOT VERIFIED        |
| 2. Phone deduplication                                     | NOT VERIFIED | NOT VERIFIED                             | NOT VERIFIED        |
| 3. Race-safe assignment and three ownership fields         | NOT VERIFIED | NOT VERIFIED                             | NOT VERIFIED        |
| 4. Follow-up/SLA and approved conversation                 | NOT VERIFIED | NOT VERIFIED                             | NOT VERIFIED        |
| 5. Test ride, explicit location start, completion and stop | NOT VERIFIED | NOT VERIFIED                             | NOT VERIFIED        |
| 6. Negotiation and append-only history                     | NOT VERIFIED | NOT VERIFIED                             | NOT VERIFIED        |
| 7. Booking and valid transitions                           | NOT VERIFIED | NOT VERIFIED                             | NOT VERIFIED        |
| 8. Branch-safe VIN allocation                              | NOT VERIFIED | NOT VERIFIED                             | NOT VERIFIED        |
| 9. Idempotent payment and immutable financial history      | NOT VERIFIED | NOT VERIFIED                             | NOT VERIFIED        |
| 10. Delivery readiness                                     | NOT VERIFIED | NOT VERIFIED                             | NOT VERIFIED        |
| 11. Delivery, proof/OTP and audit                          | NOT VERIFIED | NOT VERIFIED                             | NOT VERIFIED        |
| 12. Registration/RC and audited signed document access     | NOT VERIFIED | NOT VERIFIED                             | NOT VERIFIED        |
| 13. Customer vehicle and historical attribution            | NOT VERIFIED | NOT VERIFIED                             | NOT VERIFIED        |
| 14. Reminder plan/instance and correct owner/tenant        | NOT VERIFIED | NOT VERIFIED                             | NOT VERIFIED        |
| Invalid transitions rejected                               | NOT VERIFIED | NOT VERIFIED                             | NOT VERIFIED        |
| Unauthorized role and cross-tenant access rejected         | NOT VERIFIED | NOT VERIFIED                             | NOT VERIFIED        |
| Webhook duplicate and offline replay remain idempotent     | NOT VERIFIED | NOT VERIFIED                             | NOT VERIFIED        |

## Pilot metrics

Approve numeric targets before the pilot begins. Never backfill a target after seeing the result.

| Metric                                                  | Approved target  | Observation window | Actual result | Status / evidence |
| ------------------------------------------------------- | ---------------- | ------------------ | ------------- | ----------------- |
| Availability and critical-journey synthetic success     | NOT APPROVED     | NOT VERIFIED       | NOT VERIFIED  | NOT VERIFIED      |
| API read p95 (PRD objective <500 ms)                    | NOT APPROVED     | NOT VERIFIED       | NOT VERIFIED  | NOT VERIFIED      |
| API write p95 (PRD objective <700 ms)                   | NOT APPROVED     | NOT VERIFIED       | NOT VERIFIED  | NOT VERIFIED      |
| Lead assignment and SLA compliance                      | NOT APPROVED     | NOT VERIFIED       | NOT VERIFIED  | NOT VERIFIED      |
| Full-journey completion                                 | NOT APPROVED     | NOT VERIFIED       | NOT VERIFIED  | NOT VERIFIED      |
| Duplicate/idempotency error rate                        | NOT APPROVED     | NOT VERIFIED       | NOT VERIFIED  | NOT VERIFIED      |
| Oldest queue/outbox age and failed/dead-letter count    | NOT APPROVED     | NOT VERIFIED       | NOT VERIFIED  | NOT VERIFIED      |
| Provider delivery/failure/unknown reconciliation        | NOT APPROVED     | NOT VERIFIED       | NOT VERIFIED  | NOT VERIFIED      |
| Mobile crash-free sessions and offline replay conflicts | NOT APPROVED     | NOT VERIFIED       | NOT VERIFIED  | NOT VERIFIED      |
| Location sessions stopped at job end                    | NOT APPROVED     | NOT VERIFIED       | NOT VERIFIED  | NOT VERIFIED      |
| Daily business reconciliation variance                  | NOT APPROVED     | NOT VERIFIED       | NOT VERIFIED  | NOT VERIFIED      |
| Support acknowledgement/resolution                      | NOT APPROVED     | NOT VERIFIED       | NOT VERIFIED  | NOT VERIFIED      |
| Open critical/high defects                              | Target must be 0 | NOT VERIFIED       | NOT VERIFIED  | NOT VERIFIED      |

## Daily reconciliation and incidents

| Date (UTC/local) | Leads/source/dedupe/assignment | Provider/webhook | Ride/location | Booking/VIN/payment | Delivery/RC/vehicle/reminder | Queue/outbox | Audit/security | Variance decision |
| ---------------- | ------------------------------ | ---------------- | ------------- | ------------------- | ---------------------------- | ------------ | -------------- | ----------------- |
| NOT VERIFIED     | NOT VERIFIED                   | NOT VERIFIED     | NOT VERIFIED  | NOT VERIFIED        | NOT VERIFIED                 | NOT VERIFIED | NOT VERIFIED   | NOT VERIFIED      |

| Incident/defect ID | Severity     | Affected tenant/data/window | Resolution and verification | Residual risk/owner/date | Acceptance impact |
| ------------------ | ------------ | --------------------------- | --------------------------- | ------------------------ | ----------------- |
| NOT VERIFIED       | NOT VERIFIED | NOT VERIFIED                | NOT VERIFIED                | NOT VERIFIED             | NO-GO             |

No unexplained variance or unresolved critical/high security/data-integrity defect is acceptable.

## Known limitations and explicit exceptions

| Limitation/disabled feature | User/business impact | Workaround/control | Owner and removal date | Dealership approval | Release-validator gate/waiver evidence |
| --------------------------- | -------------------- | ------------------ | ---------------------- | ------------------- | -------------------------------------- |
| NOT VERIFIED                | NOT VERIFIED         | NOT VERIFIED       | NOT VERIFIED           | NOT APPROVED        | NOT VERIFIED                           |

Silence is not approval. Any waiver must be allowed by the release validator, written, scoped, time-limited, and signed. Critical/high security, tenant isolation, quality, restore, migration, rollback, load, mobile, critical-journey, and release-signoff gates are non-waivable.

## Final acceptance signatures

| Authority               | Named signer and role | Decision     | UTC time     | Signature/evidence reference |
| ----------------------- | --------------------- | ------------ | ------------ | ---------------------------- |
| Pilot dealership/client | NOT VERIFIED          | NOT APPROVED | NOT VERIFIED | NOT VERIFIED                 |
| Product owner           | NOT VERIFIED          | NOT APPROVED | NOT VERIFIED | NOT VERIFIED                 |
| Engineering owner       | NOT VERIFIED          | NOT APPROVED | NOT VERIFIED | NOT VERIFIED                 |
| Operations owner        | NOT VERIFIED          | NOT APPROVED | NOT VERIFIED | NOT VERIFIED                 |
| Security owner          | NOT VERIFIED          | NOT APPROVED | NOT VERIFIED | NOT VERIFIED                 |
| Pilot/release commander | NOT VERIFIED          | NO-GO        | NOT VERIFIED | NOT VERIFIED                 |

The pilot is accepted only when every required signer approves the exact release and evidence package. Until then the decision remains **NO-GO**.
