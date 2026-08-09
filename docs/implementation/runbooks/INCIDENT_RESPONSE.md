# Incident, lost-device, provider-outage, and queue-recovery runbook

## Incident command

Use this runbook for production security, availability, data, provider, mobile-device, or asynchronous-processing incidents. The incident commander owns severity, actions, and communication; the operations lead owns containment/recovery; security owns privacy/credential/tenant impact; engineering owns diagnosis/fix; product/client support owns pilot communication. One person records UTC actions and evidence.

Suggested severity:

- **SEV-0:** confirmed cross-tenant disclosure, destructive corruption, credential compromise with active abuse, or unsafe automated customer contact. Contain immediately and involve security/executive authority.
- **SEV-1:** production critical journey unavailable, widespread auth failure, database outage, rapidly growing queues, or major provider failure with business impact.
- **SEV-2:** degraded non-critical module, isolated tenant impact, recoverable backlog, or partial provider impairment.
- **SEV-3:** low-impact defect with a safe workaround.

Never include secrets or unnecessary customer data in the incident channel. Preserve correlation IDs and opaque record IDs.

## Common response sequence

1. Declare incident ID, severity, commander, detected time, affected environment/tenants/features, and next update time.
2. Contain the smallest safe boundary: revoke access, disable a provider/feature, pause a queue, or remove traffic. Tenant uncertainty requires broader containment.
3. Preserve evidence before restarts or rotations: deployment/config versions, audit events, redacted logs, Sentry IDs, health/metrics, webhook receipts, queue/outbox counts, provider request IDs, and database recovery point.
4. Diagnose using correlation IDs and immutable histories. Do not edit business/audit history or provider receipts to make dashboards green.
5. Recover with an idempotent replay, compatible application rollback, forward fix, or approved restore.
6. Verify tenant isolation, data reconciliation, provider state, queue/outbox progress, and the affected critical-journey step.
7. Communicate confirmed facts, impact window, mitigation, and next update. Do not speculate about a breach.
8. Close with owner approval, customer/regulatory assessment where applicable, post-incident review, and tracked corrective actions.

## Lost or stolen mobile device

1. Verify the reporter through an approved channel without relying on the lost device.
2. Identify the user, tenant memberships, active sessions, device/push registration identifiers, last sync, active test ride/delivery/location job, and sensitive actions since loss.
3. Revoke all server sessions/refresh-token families for the user through the authenticated administration workflow. If identity is uncertain, temporarily deactivate the membership while preserving historical attribution.
4. Invalidate the device push token and any device-bound credential. Force the next API call/offline replay to fail authentication.
5. Stop active location work server-side and assign the operational job safely. Confirm tracking does not continue after the job ends.
6. If provider or application credentials may have been exposed, rotate them in the secret manager, revoke old values, and verify API/worker/mobile clients use the new version. Ordinary app tokens are not provider secrets.
7. Review immutable audit events, downloads, signed-URL requests, support elevation, offline replay, and cross-tenant denials from the loss window. Expire any still-valid signed URLs where supported.
8. Have the user enroll a replacement device, authenticate afresh, and verify minimum Android permissions, offline data isolation, notification registration, and session inventory.
9. Record revocation time, affected sessions/tokens, data exposure determination, notification decision, and reviewer. Do not remotely wipe a personal device unless an approved managed-device capability and policy exists.

## Provider outage or unsafe provider behavior

1. Determine affected provider, tenant connections, inbound/outbound direction, provider incident ID, failure codes, first/last time, and whether signatures or credentials are suspect.
2. If sends are unsafe or credentials/signatures are compromised, disable the provider adapter/tenant connection immediately and rotate/revoke credentials. If the provider is merely unavailable, stop new sends at the adapter boundary while retaining durable internal business commits and outbox work.
3. Continue verifying inbound webhook signatures. Persist verified unique events quickly when infrastructure permits; never accept unsigned events for convenience.
4. Preserve provider event/request IDs, idempotency keys, delivery windows, template versions, rate-limit headers, and redacted responses. Do not log message bodies or credentials unnecessarily.
5. Reconcile internal outbox/webhook records against provider status using the provider-neutral adapter. Distinguish never-sent, provider-accepted, delivered, failed, and unknown.
6. Recover gradually per tenant/provider with rate/concurrency limits and jitter. Replay only unknown/failed operations whose idempotency rule is proven. Do not resend accepted operations blindly.
7. Verify customer consent, suppression, template approval, conversation windows, ownership, media access, and human-approval requirements before resuming.
8. Close only after backlog age/count returns to baseline, sampled records reconcile, credentials/signatures work, and product/security approve re-enablement.

## BullMQ, Redis, outbox, or dead-letter recovery

PostgreSQL/outbox records are the durable business source; Redis/BullMQ failure must not lose business state.

1. Capture queue names, waiting/delayed/active/failed/dead-letter counts, oldest-job age, worker deployment, Redis health, outbox undispatched count/age, and recent error samples.
2. Pause only affected consumers gracefully. Stop retry storms by reducing concurrency/rate or disabling the failing provider; do not flush Redis or delete queues.
3. Determine whether failure is Redis connectivity, worker crash, payload/version mismatch, database/provider outage, poison job, or rate limit. Preserve the first failing payload metadata with sensitive fields redacted.
4. Restore infrastructure or deploy a compatible worker. For payload changes, use a reviewed version-aware transformer; do not hand-edit queue payloads.
5. Reconcile each candidate by durable command/outbox/provider idempotency key. A job with unknown external outcome is not automatically safe to replay.
6. Move poison work through the documented failed/dead-letter state with reason and audit evidence. Never mark a business operation successful just to drain a queue.
7. Resume one queue at low concurrency. Observe oldest age, throughput, retries, failures, database load, provider limits, duplicates, and outbox dispatch before increasing.
8. Compare final durable business records, outbox entries, job outcomes, webhook receipts, and provider status. Record every replay range/key and reviewer.

## Security and privacy follow-up

Security determines whether the incident involved personal data, documents, location, support access, consent/suppression, or credentials and whether client/regulatory notification or evidence preservation is required. Session/device deactivation must not remove historical attribution. Root-cause fixes use normal migrations and reviewed code; no direct history rewriting.
