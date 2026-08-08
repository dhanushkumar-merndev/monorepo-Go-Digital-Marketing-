# Next Phase Handoff

## Completed phase

Phase 5 — Unified Inbox and WhatsApp platform foundation. Local code and automated validation are
complete; live Meta/provider, device and hosted-release validation remain external prerequisites.

## Modules created or materially updated

| Module                                                     | Actual responsibility                                                                                                                                      |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/contracts/src/messaging`                         | Conversation, message, template, assignment, connection and media contracts.                                                                               |
| `packages/config/src/messaging.ts`                         | Backend-only credential, signature, service-window, media, retry and retention validation.                                                                 |
| `packages/database/src/schema/messaging.ts`                | Tenant-owned messaging domain, append-only history, consent/suppression and durable outbox.                                                                |
| `apps/api/src/messaging`                                   | Official-provider ports, development/WhatsApp Cloud adapters, scoped commands, signed webhooks, async processing, retry/DLQ, activation and private media. |
| `apps/api/src/leads/leads.service.ts`                      | Provider Lead entry and message/note activity in the canonical Lead timeline.                                                                              |
| `apps/web/src/features/messaging`                          | Unified inbox, customer context, composer, templates, assignments, integrations and failure recovery.                                                      |
| `apps/mobile/src/screens/*conversation*`                   | Assigned-conversation list/detail, send modes, media and failed-send recovery.                                                                             |
| `apps/web/src/features/messaging/inbox-ui.store.ts`        | Non-persisted web composer/customer-panel workflow state; URL remains authoritative for conversation selection and filters.                                |
| `apps/mobile/src/store/inbox-ui.store.ts`                  | Separate non-persisted mobile composer workflow state; SQLite remains authoritative for durable replay.                                                    |
| `DESIGN.md`                                                | Canonical client-state decision rules and one-inbox/channel-provider architecture contract.                                                                |
| `apps/mobile/src/data/messaging-outbox.ts`                 | Tenant-bound offline text/template commands using the existing SQLite replay boundary.                                                                     |
| `apps/api/src/background`, `apps/api/src/worker.module.ts` | Registers `messaging.webhook.process` on the shared BullMQ worker while PostgreSQL remains durable truth.                                                  |

## Database migrations

| Migration                       | Purpose                                                                          | Execution / rollback                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `0014_bouncy_pete_wisdom.sql`   | Phase 5 enums, tables, tenant integrity, indexes, permissions and role mappings. | Forward-only; preserve messages, consent, audit and outbox evidence.                     |
| `0015_slimy_lenny_balinger.sql` | Stronger tenant-aware queue, Team, membership and actor foreign keys.            | Preflight referenced organization records; restore recovery point or compensate forward. |
| `0016_steady_may_parker.sql`    | Canonical outbound request fingerprint for idempotency mismatch protection.      | Additive nullable column; do not edit after apply.                                       |

Apply the 17-entry journal once with a migration worker before the API/worker rollout. The canonical
PGlite chain passes. This session did not mutate an unknown shared or production database.
The post-Phase-5 architecture amendment has **DATABASE MIGRATION: NONE**.

## Routes and API contracts

All protected routes are below `/v1/messaging` and require client context, the `INBOX` module and the
listed messaging permission:

- connections: `GET /connections`, `PUT /connections/development`,
  `PUT /connections/whatsapp-cloud`, `POST /connections/:id/activate`, `GET /health`
- templates: `GET /templates`, `POST /connections/:id/templates/sync`
- inbox: `GET /conversations`, `GET /conversations/:id`, `POST /conversations/:id/messages`,
  `POST /conversations/:id/read`, `POST /conversations/:id/notes`,
  `POST /conversations/:id/assignment`
- failures: `GET /failures`, `POST /messages/:id/retry`, `POST /webhook-events/reconcile`
- media: `POST /media/uploads`, `POST /media/:id/complete`, `GET /media/:id/access`
- public provider callback: `GET|POST /v1/messaging/webhooks/:provider/:connectionKey`; GET verifies
  the callback and POST verifies the official signature before durable acceptance.

Free-form policy, approved-template status, opt-in/suppression, tenant/scope access and idempotency are
backend rules. Client disabled states are explanatory UI only.

## Environment variables

Backend only; never expose these to web/mobile:

- `MESSAGING_DEVELOPMENT_WEBHOOK_SECRET` (32+ characters)
- `MESSAGING_CREDENTIAL_ENCRYPTION_KEY` (32 bytes, base64; required before Cloud credentials)
- `MESSAGING_CREDENTIAL_KEY_ID`
- `MESSAGING_MEDIA_MAX_BYTES`, `MESSAGING_MEDIA_URL_TTL_SECONDS`,
  `MESSAGING_MEDIA_RETENTION_DAYS`
- `MESSAGING_OUTBOUND_MAX_ATTEMPTS`, `MESSAGING_SERVICE_WINDOW_HOURS`
- `MESSAGING_WEBHOOK_RAW_RETENTION_HOURS`

## Verified commands and results

| Command                          | Result on 2026-08-08                                                             |
| -------------------------------- | -------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | Pass; final frozen install reported the workspace up to date.                    |
| `pnpm format:check`              | Pass.                                                                            |
| `pnpm lint`                      | Pass; all workspace lint tasks.                                                  |
| `pnpm type-check`                | Pass; 13/13 tasks.                                                               |
| `pnpm test`                      | Pass; 289 tests, plus final affected mobile rerun 75/75.                         |
| `pnpm test:integration`          | Pass; API 31/31 and database migration 15/15.                                    |
| `pnpm db:check`                  | Pass; 17-entry journal.                                                          |
| `pnpm build`                     | Pass; API, web, Android, iOS and shared packages; affected mobile exports rerun. |

## Seed accounts and data

- Existing Phase 0–4 seed accounts remain unchanged.
- Alpha has `LEADS`, `TELEPHONY` and `INBOX`; Beta has `LEADS` only.
- Alpha messaging connection ID `23000000-0000-4000-8000-000000000001` uses provider
  `DEVELOPMENT`, business phone `+912040001111` and callback path
  `/v1/messaging/webhooks/DEVELOPMENT/development-messaging-20000000-0000-4000-8000-000000000001`.
- Templates `lead_follow_up_update` (UTILITY) and `dealership_offer` (MARKETING) are approved
  development fixtures. They are not proof of Meta approval.

## Known limitations and deferred work

- No live WABA/provider credentials or legal consent/retention approval were supplied. Cloud
  connections remain pending until callback verification, health and explicit activation.
- WhatsApp Cloud media upload/download is deliberately unavailable pending provider activation and
  reviewed retention; private development media remains functional.
- Offline mobile queues text/templates only. Media requires connectivity, and a cold restart still
  needs the API to reload the assigned-conversation cache.
- SQLite outbox payloads are OS-protected but not application-layer encrypted; do not queue documents
  or unnecessary sensitive content.
- No configured object scanner, physical-device smoke, live status/template-sync test, hosted staging
  smoke or Linux OpenNext packaging evidence exists yet.
- Current Linux recheck found no WSL distribution/kernel, an unavailable Podman WSL socket and no
  Docker CLI. Exact result: `CLOUDFLARE LINUX PACKAGING EXTERNAL VALIDATION REMAINS`.
- SMS, email, Instagram Direct and Facebook Messenger are not Phase 5 functionality. Phase 13 may
  add official adapters, but they must extend the canonical Conversation/Message inbox rather than
  introduce parallel inbox products.

## Exact prerequisites and recommendations for Phase 6

1. Preserve canonical Contact/Lead IDs and all three owners. A test-ride process owner must not replace
   the relationship owner or conversation owner.
2. Keep conversations/messages append-only and link future test-ride notifications through the
   provider-neutral messaging interface only after committed test-ride state.
3. Use an outbox/idempotency key for booking confirmations, reminders and reschedules so provider
   failure cannot roll back a committed appointment.
4. Apply migrations `0014`–`0016` once and verify the Alpha/Beta module flags before adding Phase 6
   flags or routes.
5. Retain backend branch/team/assignment authorization and default deny. Do not trust a client-sent
   tenant, owner or test-ride status.
6. Keep `DESIGN.md` mandatory for Phase 6 web/mobile screens and include loading, empty, error,
   disabled, conflict and success states.
7. Apply the `DESIGN.md` client-state decision rule: API/TanStack Query for server truth, URL for
   deep links, React state for isolated controls, feature-scoped Zustand for shared transient
   workflow, and SQLite/outbox for durable mobile replay. Reset stores on every auth/context change.
8. Do not expand Phase 6 into live WhatsApp activation, inventory, delivery or AI modules without the
   relevant phase authorization and external prerequisites.

## Gate

`PHASE 5 CODE COMPLETE — EXTERNAL VALIDATION REMAINS`

`READY TO BEGIN PHASE 6`

`NEXT: RUN PROMPTS/06_TEST_RIDES.md`
