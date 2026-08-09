# Next Phase Handoff

## Completed phase

Phase 12 - Dashboards, Reports, Audit and Exports. Local API regression and migration validation passed
on 2026-08-09; final workspace-wide completion gates remain in progress.

## Phase 12 implementation

- `packages/contracts/src/reporting` defines report ranges, audit filters and export commands.
- `0031_panoramic_mimic.sql` creates tenant-scoped durable export jobs; `0032_stale_union_jack.sql`
  adds reporting/audit/export permissions to the retained compatibility enum.
- `apps/api/src/reports` supplies scoped canonical KPI, immutable audit search, durable export jobs,
  worker registration and short-lived private download URLs.
- `apps/web/src/features/reports` provides URL-state date filtering, dashboard/audit views, loading,
  empty/error states and export-status visibility.
- CSV and a standards-based minimal XLSX writer are persisted only through the private storage adapter.

## Next phase recommendation

Read `PROMPTS/13_EXTERNAL_INTEGRATIONS.md`; preserve the Phase 12 report contracts and do not expose
stored export object keys or signed URLs in long-lived client state.

## Modules created or changed

| Area                                           | Actual implementation                                                                                                                                           |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/contracts/src/reminders`             | Reminder type/category/threshold/status contracts and validated rule, list, preference, consent, reschedule, Vehicle-detail and Customer Activity commands.     |
| `packages/database/src/schema/reminders.ts`    | Tenant reminder definitions/rules/plans/preferences/instances/events/dispatch outbox/receipts and additive Customer Activity.                                   |
| `packages/database/src/schema/registration.ts` | Customer Vehicle model year, PUC, odometer and service-plan inputs retained alongside Phase 10 provenance.                                                      |
| `apps/api/src/reminders`                       | `/v1/reminders` rule, plan, queue, history, materialize, reschedule, consent/preference, Vehicle detail and Customer Activity authority plus BullMQ processors. |
| `apps/api/src/messaging`                       | Automated reminder-template queue boundary reuses official Messaging provider, template/consent/suppression and delivery-status authority.                      |
| `apps/web/src/features/reminders`              | URL-state queue views, rule config, plans, reschedule control and consent/preferences workspace.                                                                |
| `packages/database/src/seed.ts`                | Alpha approved post-sale templates/rules and deterministic schedule state fixtures.                                                                             |

## Database migration

- `0030_yellow_mister_fear.sql`: seven reminder/customer-activity enums, Customer Vehicle lifecycle
  fields, reminder definitions/rules/plans/preferences/instances/events/outbox/receipts, Customer
  Activity, six permissions/mappings, baseline definitions for existing tenants and immutable event
  triggers.

The journal has 31 entries (`0000` through `0030`). All apply from zero in PGlite; all 21 migration
integrity tests pass. No shared/staging/production migration or seed ran. Take a recovery point
before apply. Once reminder/customer activity evidence exists, use reviewed forward compensation;
never edit an applied migration or delete immutable history.

## Routes and contracts

Every route requires client context, `DELIVERY_RC`, a declared reminder/customer-activity permission
and server branch/object scope. Mutating commands require `Idempotency-Key` except the internal
worker operations.

- `GET /v1/reminders/definitions|rules|plans|instances`
- `GET /v1/reminders/instances/:instanceId/history`
- `POST /v1/reminders/rules`
- `POST /v1/reminders/vehicles/:vehicleId/generate|details|preferences|consent`
- `GET /v1/reminders/vehicles/:vehicleId/preferences`
- `POST /v1/reminders/instances/:instanceId/reschedule`
- `POST /v1/reminders/dispatch-due`
- `POST /v1/reminders/contacts/:contactId/activities`

Worker registrations: `reminders.materialize`, `reminders.dispatch`, and
`reminders.delivery.reconcile`. Reminder dispatch commits PostgreSQL first, queues through BullMQ
when available and invokes `MessagingService.queueAutomatedReminder`; it never exposes credentials
or sends directly from the browser.

## Environment variables

Phase 11 adds none. It reuses validated messaging, Redis/BullMQ and private provider configuration.
Rule schedules, preferences and consent references are tenant PostgreSQL data. Production template
approval, legal notice wording/DLT registration and provider credentials are not seeded or claimed.

## Verified commands and results

| Command                          | Result                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | Pass; all 11 workspaces up to date.                                                 |
| `pnpm format:check`              | Pass.                                                                               |
| `pnpm lint`                      | Pass; zero warnings.                                                                |
| `pnpm type-check`                | Pass; 13/13 tasks.                                                                  |
| `pnpm test`                      | Pass; API 61 unit + 55 integration, mobile 86, web 71, contracts 48 and DB unit 12. |
| `pnpm test:integration`          | Pass; API 55/55 and migrations 21/21.                                               |
| `pnpm db:check`                  | Pass; journal through `0030`.                                                       |
| `pnpm build`                     | Pass; 8/8 production build tasks passed, with 29 web routes including `/reminders`. |

## Seed accounts and data

Existing accounts remain. The Alpha external Customer Vehicle now has coverage/service lifecycle
data. Alpha includes approved `service_due_reminder` (Utility) and `upgrade_opportunity` (Marketing)
templates, fixed Service Due/Upgrade rules, an operational WhatsApp preference and deterministic
scheduled, failed and suppressed reminder instances. No seed claims live customer consent or a live
provider send.

## Known limitations and deferred work

- Actual provider delivery, delivery/read webhook reconciliation and DLT/legal consent validation
  require approved tenant provider accounts and authority; development adapters do not represent
  production activation.
- The worker has processor registrations and durable recovery state; hosted periodic scheduling,
  alerting and reconciliation smoke remain Phase 14 deployment work.
- Phase 12 owns reporting/dashboard/export surfaces. Do not add reporting projections outside its
  prompt.

## Exact Phase 12 prerequisites and recommendations

1. Read `PROMPTS/12_REPORTS_DASHBOARDS_EXPORTS.md` and implement only Phase 12.
2. Consume Customer Activity/reminder aggregates, not Lead status rewrites or direct provider data.
3. Preserve tenant/branch scope, sensitive-document boundaries, audit/outbox and export controls.
4. Use only real server-authoritative query results for charts/dashboards; do not mark fabricated
   metrics or provider health as production data.
5. Add the required migration/contracts/API/auth/tests/UI/seed/OpenAPI/env/docs, then run the strict
   completion audit before its checkpoint.
