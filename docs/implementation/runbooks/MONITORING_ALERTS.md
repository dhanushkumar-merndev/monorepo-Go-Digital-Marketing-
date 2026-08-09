# Production monitoring and alert runbook

## Objective

Production is not release-ready until telemetry covers user traffic, authentication, PostgreSQL, Redis/BullMQ, outbox, webhooks/providers, private objects, mobile, and the critical business journey. This document defines the minimum alert contract; it does not claim that a dashboard or alert exists. Each row must have a real dashboard/monitor ID, owner, routing test, and evidence before the `observability_alerts` gate becomes `VERIFIED`.

All telemetry must include environment, release, service, correlation/request ID, and a tenant-safe opaque organization identifier where needed. Never log passwords, access/refresh tokens, cookies, OTPs, integration secrets, full message/document contents, signed URLs, or unnecessary personal/location data.

## Ownership and routing

- API/worker uptime, errors, queues, database, Redis, and Tigris: operations primary, backend secondary.
- Auth, tenant-denial anomalies, support elevation, audit, and secret events: security primary.
- Web/mobile errors and critical-journey synthetic checks: web/mobile engineering primary.
- Provider webhook/delivery and consent/suppression: integrations/operations primary, product secondary.
- Pilot conversion and daily business reconciliation: product/client operations primary.

SEV-0/SEV-1 alerts page the on-call and open the incident channel. Ticket-only alerts must still name an owner and response target. Test every route using synthetic non-sensitive events before release and quarterly thereafter.

## Minimum signals and starting thresholds

Thresholds are initial guardrails and must be tuned from staging/pilot baselines without weakening PRD objectives.

| Area                 | Signal / initial trigger                                                                                           | Severity / response                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| API availability     | `/v1/health/live` fails 2 of 3 one-minute probes                                                                   | SEV-1, immediate                       |
| Dependency readiness | `/v1/health/ready` fails 2 consecutive probes                                                                      | SEV-1; identify DB vs Redis            |
| API errors           | 5xx >2% for 5 min with at least 50 requests, or any cross-tenant/security error                                    | SEV-1; security case immediate         |
| API latency          | Read p95 >500 ms or write p95 >700 ms for 10 min                                                                   | SEV-2; SEV-1 if critical journey fails |
| Authentication       | Login/refresh failure sharply exceeds baseline; lockouts or revoked-token use spike                                | Security SEV-2/SEV-1 by scope          |
| Database             | Connection use >80%, sustained CPU/storage pressure, replication/backup/PITR failure, or oldest transaction >5 min | SEV-1/2                                |
| Redis                | Connectivity failures, memory eviction, or unavailable rate-limit/queue state                                      | SEV-1 if queues/auth affected          |
| Queue/outbox         | Oldest ready job or undispatched outbox >5 min; failed/dead-letter growth >10 in 5 min                             | SEV-2; page if growing/critical        |
| Webhooks             | Signature failures >=5 in 5 min per provider/tenant, duplicates spike, or verified event age >5 min                | Security/integrations SEV-1/2          |
| Providers            | Error >5% for 5 min, rate-limit exhaustion, credential expiry, or delivery backlog exceeds window                  | SEV-2; unsafe sends SEV-0/1            |
| Objects              | Signed-access/presign failures >2%, checksum inventory failure, or public-access finding                           | SEV-1; public exposure SEV-0           |
| Web                  | Server/edge error >2%, auth callback failure, or critical page synthetic failure                                   | SEV-1/2                                |
| Mobile               | Crash-free sessions below approved baseline, login/replay/location failure spike                                   | Halt rollout; SEV-1/2                  |
| Critical journey     | Synthetic or pilot step cannot progress for 2 checks                                                               | SEV-1 during pilot/release             |
| Audit/support        | Audit write failure, unexplained support elevation, export/download anomaly                                        | Security SEV-0/1                       |

Use minimum-volume guards so a single ordinary failure does not create misleading percentages, except security/integrity events which page on the first confirmed occurrence.

## Required dashboards

1. **Release overview:** deployed SHA/image IDs, request volume, errors, p50/p95/p99, health, Sentry issues, web/mobile versions.
2. **Database/storage:** connections, latency, locks, long transactions, backup/PITR state, storage, Tigris errors and signed-access outcomes.
3. **Async work:** per-queue waiting/delayed/active/completed/failed/dead-letter, oldest age, retries, worker heartbeat, outbox undispatched age/count.
4. **Providers/webhooks:** per provider and tenant-safe connection, received/verified/rejected/duplicate/processed age, outbound accepted/delivered/failed/unknown, rate limits.
5. **Security/auth:** login/refresh/revocation/lockout, permission/tenant denials, support elevation, sensitive download/export, secret/config changes.
6. **Critical journey/pilot:** each journey-stage count/age/failure, assignment/SLA, test ride, booking/payment, delivery, registration/RC, reminder.

Dashboards must link from the release evidence by immutable snapshot/run ID where possible. Screenshots alone are insufficient if they omit time range, environment, release, and query definition.

## Sentry and structured logging

Set production environment and release to the immutable application version/SHA for API, worker, web, and mobile. Verify a synthetic event reaches the correct project, is symbolicated/source-mapped where approved, carries a correlation ID, and contains no secrets or personal payload. Configure ownership and alert rules for new critical issues, regression, error-frequency spikes, and mobile crashes/ANRs.

Structured logs must be queryable across API and worker by correlation ID, release, route/job/provider, outcome, and tenant-safe ID. Audit events remain the immutable business/security trail; application logs are not a substitute.

## Release-window checks

Before promotion, capture a 24-hour staging baseline and verify every alert route. At promotion, annotate dashboards with release/deployment IDs. Watch continuously during migrations, API/worker promotion, web alias change, provider enablement, mobile rollout, and pilot journey. Compare at 15, 30, 60, and 120 minutes and at next-day reconciliation.

Record alert test time, synthetic event ID, receiving person/channel, acknowledgement time, dashboard URL, and any suppression. Maintenance suppression must be narrow, time-limited, owned, and removed before GO.

## Alert response and closure

Every page links to [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md), a dashboard/query, first containment action, and owner. Close an alert only after the condition and business data are reconciled; restarting a worker or clearing a symptom is not sufficient. Tune noisy thresholds through reviewed configuration and preserve the original incident evidence.
