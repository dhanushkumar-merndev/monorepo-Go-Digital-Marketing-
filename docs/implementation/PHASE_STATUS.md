# Phase Status

- **Current phase:** Phase 10 - Registration, RC and Customer-Owned Vehicles.
- **Current status:** **Implementation and strict local completion audit passed.** All migrations
  apply from zero, affected tests/builds pass, and no Critical/High Phase 10 source issue is open.
- **Completed phases:** Phase 0 foundation, Phase 1 authentication/tenancy, Phase 2 organization,
  Phase 3 Lead CRM, Phase 4 telephony, Phase 6 test rides, Phase 7 inventory, Phase 8 commercial,
  Phase 9 delivery and Phase 10 registration/customer vehicles. Phase 5 automated acceptance remains
  green; live WhatsApp activation remains gated by its documented external reliability issue.
- **Next phase:** Phase 11 - Post-Sale Reminders and Customer Lifecycle is not started.
- **Last updated:** 2026-08-09

## Phase 10 acceptance-criterion checklist

- [x] One tenant registration case reuses the confirmed Booking, canonical Contact and exact
      allocated Inventory Unit; database uniqueness permits only one case per booking.
- [x] Registration may start before Delivery and never queries or rewrites Delivery state. Case
      detail exposes the linked delivery only as independent read-only context.
- [x] The server enforces Documents Ready → Registration Started → RTO Submitted → Number Allotted
      → RC Pending → RC Received → RC Shared/Collected → Case Closed, plus reasoned Reopened.
- [x] RTO office/code, application reference, submission/allotment/receipt dates, temporary and
      permanent numbers, expected completion and pending reasons are durable tenant-owned data.
- [x] Status history is append-only. Corrections reference the prior event and update only the
      current projection; PostgreSQL rejects history updates/deletes.
- [x] Tenant-configured per-status SLA hours drive queue aging and overdue dashboards.
- [x] RC files use private tenant-scoped object keys, signed uploads/downloads, MIME/size/SHA-256
      metadata verification and fail-closed malware scanning. Object keys are never returned.
- [x] Only a clean reviewed RC can be downloaded/shared. Each access has a purpose and audit/outbox;
      each WhatsApp/email/SMS/courier/pickup delivery creates immutable evidence.
- [x] Closure rechecks application, RTO submission, permanent number, receipt, verified RC and
      delivery evidence. Reopening retains the original closure and requires reason/next action.
- [x] A dealership Customer Vehicle is created only after canonical Delivered status and reuses the
      Contact, booking, delivery and physical unit. Creation is idempotent.
- [x] External Customer Vehicles carry explicit `EXTERNAL` provenance and cannot claim booking,
      delivery, registration-case or inventory lineage.
- [x] Partial unique indexes prevent duplicate Customer Vehicles by tenant/booking, case-insensitive
      VIN and case-insensitive registration number. Number allotment updates an already-created
      dealership vehicle or is consumed when delivery later creates it.
- [x] Every route requires active tenant, `DELIVERY_RC`, explicit `registration.*` or
      `customer_vehicles.*` permission and backend branch/assignment scope. Cross-tenant access is
      returned as Not Found and integration-tested.
- [x] `/registrations`, `/registrations/[caseId]`, `/customer-vehicles` and
      `/customer-vehicles/[vehicleId]` provide permission-aware loading, empty, error, disabled and
      success states with workflow forms, document review, aging, coverage and timelines.
- [x] Phase 11 reminder scheduling and provider messaging remain out of Phase 10 scope.

## External and deferred release checks

- [ ] No production RC malware scanner was supplied. Uploads remain Pending Scan and cannot be
      Verified, shared or used for closure unless a reviewed adapter reports `CLEAN`.
- [ ] No approved RTO/government API or credentials were supplied. Phase 10 records staff-provided
      evidence and does not claim automated submission or retrieval.
- [ ] Hosted Cloudflare/Render/Supabase/Upstash/Tigris smoke, Linux OpenNext packaging and browser
      visual regression remain Phase 14 external checks. Local Next and Expo production builds pass.
- [ ] Phase 10 migration and seed were validated locally but not applied to a shared, staging or
      production database.

## Last verified results (2026-08-09)

| Command                          | Result  | Actual evidence                                                                                              |
| -------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile` | Pass    | All 11 workspace projects were already up to date.                                                           |
| `pnpm format:check`              | Pass    | Repository matched Prettier after Phase 10 source and documentation updates.                                 |
| `pnpm lint`                      | Pass    | All applicable workspace lint tasks passed with zero warnings.                                               |
| `pnpm type-check`                | Pass    | 13/13 strict TypeScript tasks passed.                                                                        |
| `pnpm test`                      | Pass    | 13/13 tasks; API 61 unit + 51 integration, mobile 86, web 71, contracts 45, config 27 and DB unit 12 passed. |
| `pnpm test:integration`          | Pass    | API 51/51 and complete database migration suite 20/20 passed.                                                |
| Focused Phase 10 regression      | Pass    | Registration API 5/5, contracts 45/45, web 71/71 and migrations 20/20 passed.                                |
| `pnpm db:check`                  | Pass    | Drizzle accepted the 30-entry migration journal (`0000` through `0029`).                                     |
| `pnpm build`                     | Pass    | 8/8 build tasks; API/shared packages, 28 Next routes and Android/iOS Expo production exports completed.      |
| `pnpm db:migrate`                | Not run | No shared/external database mutation was authorized for this checkpoint.                                     |

The Windows host returned `uv_os_get_passwd ENOMEM` from Node despite available memory. Tests and
builds used a local process-only `os.userInfo` fallback preload; it is removed before checkpoint and
does not alter product runtime behavior. The first sandboxed build reached only Wrangler's required
AppData registry/log write and failed with `EPERM`; the identical approved elevated build passed.

## Database and environment changes

- `0029_closed_trish_tilby.sql` creates registration settings/cases/events, private RC document
  metadata and immutable delivery records, canonical Customer Vehicles/events, command receipts,
  13 permissions/mappings, uniqueness guards and append-only triggers.
- Phase 10 adds no provider/public environment variable. RC material reuses existing private
  S3/Tigris settings; tenant SLA hours are stored in PostgreSQL.
- Alpha seed gives the RC Registration Executive Pune/Mumbai scope, creates assigned Documents Ready
  work and one explicit external Customer Vehicle for UI/API validation.

## Final gate

`PHASE 10 COMPLETE - MANDATORY LOCAL TESTS, MIGRATION VALIDATION AND BUILDS PASSED`

`PHASE 11 NOT STARTED`
