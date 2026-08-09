# Next Phase Handoff

## Completed phase

Phase 10 - Registration, RC and Customer-Owned Vehicles. Strict local audit passed on 2026-08-09.
Phase 11 has not started.

## Modules created or changed

| Area                                                | Actual implementation                                                                                                                                          |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/contracts/src/registration`               | Registration/RC states, request validation, document delivery modes, Customer Vehicle provenance and coverage contracts.                                       |
| `packages/database/src/schema/registration.ts`      | Tenant-safe settings/cases/events, private RC metadata/delivery evidence, canonical Customer Vehicles/events and command receipts.                             |
| `apps/api/src/registration`                         | `/v1/registration-cases` and `/v1/customer-vehicles`, assignment/scope, lifecycle, aging, corrections, private storage, closure, audit/outbox and idempotency. |
| `apps/web/src/features/registration`                | Registration queue/aging/settings/detail/workflow/document/timeline UI and Customer Vehicle list/detail/external/coverage UI.                                  |
| `apps/web/src/app/(app)/{registrations,customer-*}` | Four permission-gated App Router pages.                                                                                                                        |
| `packages/database/src/seed.ts`                     | RC Executive Pune/Mumbai scope, tenant SLA settings, assigned Documents Ready case and explicit external vehicle fixture.                                      |
| Authorization, navigation, OpenAPI, README/env/docs | Thirteen least-privilege permissions, role mappings, navigation entry, generated controller documentation and exact operations/decision/migration evidence.    |

## Database migration

- `0029_closed_trish_tilby.sql`: four enums; registration settings/cases/events/receipts; private RC
  documents and immutable delivery records; Customer Vehicles/events; tenant/actor/resource foreign
  keys; booking/VIN/registration uniqueness; 13 permissions and role mappings; three immutable
  history triggers.

The canonical journal has 30 entries (`0000` through `0029`). All apply from zero in PGlite and all
20 migration integrity tests pass. No shared/staging/production migration or seed ran in Phase 10.
Take a recovery point before apply. Once registration or vehicle evidence exists, use reviewed
forward compensation; never delete immutable evidence or edit an applied migration.

## Routes and contracts

All routes require client context, `DELIVERY_RC`, declared permission and backend object scope.
Mutating commands require `Idempotency-Key`.

- `GET/POST /v1/registration-cases`, `GET /v1/registration-cases/:caseId`
- `GET /v1/registration-cases/aging|executives|settings`, `POST .../settings`
- `POST /v1/registration-cases/:caseId/assign|start|rto-submit|number-allotment|rc-pending`
- `POST /v1/registration-cases/:caseId/rc-copy/initiate|complete`
- `POST /v1/registration-cases/:caseId/share|close|reopen|corrections`
- `POST /v1/registration-cases/documents/:documentId/review`
- `GET /v1/registration-cases/documents/:documentId/download?purpose=...`
- `GET /v1/customer-vehicles`, `GET /v1/customer-vehicles/:vehicleId`
- `POST /v1/customer-vehicles/dealership|external`
- `POST /v1/customer-vehicles/:vehicleId/coverage`

## Environment variables

Phase 10 adds none. RC copy upload/download reuses existing backend S3/Tigris configuration. The
default `FailClosedRcDocumentScanner` prevents verification/sharing/closure until a reviewed scanner
is bound. No RTO/government provider is configured or claimed.

## Verified commands and results

| Command                          | Result                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | Pass; all 11 workspace projects already up to date.                                            |
| `pnpm format:check`              | Pass.                                                                                          |
| `pnpm lint`                      | Pass; zero warnings.                                                                           |
| `pnpm type-check`                | Pass; 13/13 tasks.                                                                             |
| `pnpm test`                      | Pass; API 61 unit + 51 integration, mobile 86, web 71, contracts 45, config 27 and DB unit 12. |
| `pnpm test:integration`          | Pass; API 51/51 and migrations 20/20.                                                          |
| `pnpm db:check`                  | Pass; 30 entries through `0029`.                                                               |
| `pnpm build`                     | Pass; 8/8 tasks, 28 Next routes and Android/iOS Expo exports.                                  |

## Seed accounts and data

Existing accounts remain. `registration@seed.godigital.test` is the RC Registration Executive and
now has selected Pune plus Mumbai scope with assigned-only access. The deterministic Alpha Phase 10
case is Documents Ready and linked to the same canonical partial-payment booking and allocated unit
used by Phase 9, proving registration can proceed independently from delivery. The external vehicle
fixture uses the existing Contact but has no booking/delivery/inventory lineage.

## Known limitations and deferred work

- RC verification remains intentionally blocked until a production scanner returns `CLEAN`.
- RTO/government automation is not implemented without an approved API/provider contract.
- Phase 11 owns reminder rules, schedules, outbound reminder execution and customer lifecycle. Phase
  10 stores coverage dates only and sends no reminder.
- Shared database, hosted providers, browser visual regression and deployment smoke remain external
  Phase 14 work.

## Exact Phase 11 prerequisites and recommendations

1. Read the PRD and `PROMPTS/11_POST_SALE_REMINDERS.md`; implement only Phase 11.
2. Use `customer_vehicles.id` plus canonical Contact and branch relationship as reminder ownership
   truth. Never infer a dealership sale for `ownership_source = EXTERNAL`.
3. Consume insurance/warranty/AMC/RSA dates as inputs; do not duplicate or mutate vehicle identity.
4. Keep registration and delivery histories immutable. Reminder execution must append its own events
   and never rewrite a case, RC delivery record or Customer Vehicle event.
5. Reuse consent, suppression, quiet-hours, Unified Inbox/provider-neutral messaging, audit/outbox,
   idempotency and tenant rate/concurrency controls rather than sending directly from the client.
6. Add Phase 11 migrations, contracts, backend policy/tests, functional role UI, seed data,
   OpenAPI/env/docs and run the strict completion audit before its checkpoint.
