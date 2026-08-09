# Phase Status

- **Current phase:** Phase 13 - External Integrations, AI, Social and Client Onboarding.
- **Current status:** **Implementation and strict local completion audit passed.**
- **Completed phases:** Phases 0-4, 6-11; Phase 5 automated acceptance remains green. Live official
  messaging activation remains gated by its documented external provider-readiness issue.
- **Next phase:** Phase 14 - Production Release (hard stop before implementation per user instruction).
- **Last updated:** 2026-08-09

## Phase 12 acceptance-criterion checklist

- [x] Dashboard metrics read canonical tenant/branch-scoped domain records and declare KPI time basis,
      inclusion and relationship-owner attribution.
- [x] IANA timezone date boundaries are calculated server-side and return deterministic UTC bounds.
- [x] Audit search returns immutable actor/action/entity/correlation/reason metadata from `audit_events`.
- [x] CSV/XLSX export jobs are asynchronous, scope-snapshotted, private, expiring and audited.
- [x] Reporting permissions, seed mappings, OpenAPI endpoints, worker registration and URL-state web
      dashboard/audit/export views are included.

## Phase 12 verification

| Command                                               | Result                                               |
| ----------------------------------------------------- | ---------------------------------------------------- |
| `pnpm db:generate` / `pnpm db:check`                  | Pass; migrations `0031` and `0032` validated.        |
| `pnpm --filter @gdm/api test`                         | Pass; 61 unit and 55 integration tests.              |
| `pnpm format:check` / `pnpm lint` / `pnpm type-check` | Pass.                                                |
| `pnpm build`                                          | Pass; 8/8 production tasks and `/reports` web route. |

## Phase 13 acceptance-criterion checklist

- [x] Official WhatsApp/telephony adapters, encrypted credentials, durable webhooks and the unified
      inbox remain the canonical provider boundaries.
- [x] Tenant connection state, disconnect audit and onboarding evidence are available without secrets.
- [x] Creative and transcript records require explicit human review and cannot silently publish or mutate
      CRM data.
- [x] Transcript suggestions verify the recording belongs to the active tenant before persistence.
- [x] Integration/onboarding/AI permissions, migration constraints, routes and `/integrations` UI exist.

## Phase 13 verification

| Command                                                          | Result                                                    |
| ---------------------------------------------------------------- | --------------------------------------------------------- |
| `pnpm db:check` / `pnpm --filter @gdm/database test:integration` | Pass; 22 migration tests.                                 |
| `pnpm --filter @gdm/api test`                                    | Pass; 61 unit and 55 integration tests.                   |
| `pnpm type-check` / `pnpm lint` / `pnpm format:check`            | Pass.                                                     |
| `pnpm build`                                                     | Pass; 8/8 production tasks and `/integrations` web route. |

## Phase 11 acceptance-criterion checklist

- [x] The ten PRD reminder types are tenant-owned definitions: Service Due, Insurance/PUC/Warranty/
      AMC/Roadside Assistance expiry, RC Pending, Service Appointment, Exchange Eligibility and
      Upgrade Opportunity.
- [x] Fixed active rules safely match manufacturer, model, variant and optional model year. Rules
      support date bases/offsets or kilometre thresholds; no one-month service interval is hardcoded.
- [x] Customer Vehicle model year, PUC, odometer and service-plan fields are additive. A changed
      vehicle/rule version cancels only still-scheduled obsolete instances and materializes the new
      schedule without rewriting Customer Vehicle, Lead or prior reminder history.
- [x] Tenant/materialization and instance/outbox unique keys make duplicate materializer/dispatcher
      workers harmless. Plans, commands and queues remain PostgreSQL truth before BullMQ work.
- [x] Operational rules require approved Utility templates; promotional rules require approved
      Marketing templates. The messaging adapter independently enforces the same approved-template,
      suppression, consent, ownership and provider rules.
- [x] Marketing dispatch requires an enabled customer reminder preference and current granted
      category/channel opt-in. Withdrawal/denial or an active ALL/MARKETING suppression produces an
      append-only `SUPPRESSED` reminder, not a send.
- [x] Scheduled, queued, sent, delivered, failed, cancelled and suppressed states are durable;
      retry/dead-letter data is retained in the reminder outbox and official message delivery can be
      reconciled back to `DELIVERED`.
- [x] Customer preferences, append-only marketing consent evidence, rescheduling and customer
      feedback/complaints/escalations are audited and idempotent. Customer Activity is additive and
      never rewrites Phase 3 Lead history.
- [x] `/reminders` provides rule configuration, reminder types, customer plans, upcoming/failed/
      suppressed queues, status history/rescheduling controls and consent/preferences UX with
      loading, empty, error, disabled and success states.
- [x] Routes require active client context, `DELIVERY_RC`, explicit permission and backend
      tenant/branch scope. Integration tests cover duplicate workers, withdrawn marketing consent,
      template-category separation and safe vehicle-plan supersession.

## External and deferred release checks

- [ ] Hosted Cloudflare/Render/Supabase/Upstash/Tigris smoke, Linux OpenNext packaging and browser
      visual regression remain Phase 14 external checks.
- [ ] Production messaging connection/template approval, legal consent wording, DLT controls and a
      live provider delivery/reconciliation smoke require dealership/provider authority.
- [ ] Shared/staging/production migration and seed have not run. Take a recovery point before the
      forward-only Phase 11 migration.

## Last verified results (2026-08-09)

| Command                          | Result  | Actual evidence                                                                                   |
| -------------------------------- | ------- | ------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | Pass    | All 11 workspace projects already up to date.                                                     |
| `pnpm format:check`              | Pass    | Repository matched Prettier after Phase 11 source/docs updates.                                   |
| `pnpm lint`                      | Pass    | All 8 applicable workspace lint tasks passed with zero warnings.                                  |
| `pnpm type-check`                | Pass    | 13/13 strict TypeScript tasks passed.                                                             |
| `pnpm test`                      | Pass    | 13/13 tasks; API 61 unit + 55 integration, mobile 86, web 71, contracts 48 and DB unit 12 passed. |
| `pnpm test:integration`          | Pass    | API 55/55 and database migration 21/21 passed.                                                    |
| Focused Phase 11 regression      | Pass    | API reminder 4/4, contracts 48/48, web 71/71 and migrations 21/21 passed.                         |
| `pnpm db:check`                  | Pass    | Drizzle accepted the 31-entry journal (`0000` through `0030`).                                    |
| `pnpm build`                     | Pass    | 8/8 production build tasks passed; the web build generated 29 routes, including `/reminders`.     |
| `pnpm db:migrate`                | Not run | No shared/external database mutation was authorized.                                              |

The Windows host returns `uv_os_get_passwd ENOMEM` from Node despite available memory. Verification
uses a temporary process-only `os.userInfo` preload; it is removed before checkpoint and never ships
in product runtime.

## Database and environment changes

- `0030_yellow_mister_fear.sql` creates reminder definitions/rules/plans/preferences/instances/
  events/outbox/receipts and Customer Activity; it adds additive Customer Vehicle lifecycle inputs,
  six permissions/mappings, tenant foreign keys, unique materialization/outbox guards and immutable
  reminder/customer-activity triggers.
- Phase 11 adds no environment variable or provider secret. It reuses Phase 5 official messaging
  templates/connections, existing consent/suppression and BullMQ configuration.
- Alpha seed adds approved operational/marketing post-sale templates, scoped Service Due and Upgrade
  rules, an external vehicle with coverage/service inputs, preferences and scheduled/failed/
  suppressed reminder fixtures.

## Final gate

`PHASE 11 COMPLETE — ALL REQUIRED VERIFICATION GATES PASSED; CHECKPOINT READY`
