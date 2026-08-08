# Next Phase Handoff

## Completed phase

Phase 7 - Vehicle Inventory and Allocation. Implementation and strict local audit passed on
2026-08-09. The complete 24-entry journal was applied to the user-confirmed test database; no seed
or production deployment was performed.

## Modules created or materially updated

| Module                                          | Actual responsibility                                                                                                                                                                               |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/contracts/src/inventory`              | Exact stock states and Zod request/response contracts for catalogue, units, reservations, allocations, reallocation and transfers.                                                                  |
| `packages/database/src/schema/inventory.ts`     | Tenant-owned physical-stock authority, identity constraints, append-only evidence and idempotency receipts.                                                                                         |
| `packages/database/src/schema/test-rides.ts`    | Nullable canonical inventory-unit links that preserve historical ride branch/reference data across later transfers.                                                                                 |
| `apps/api/src/inventory`                        | Tenant/branch authorization, stock intake, late receipt identifiers, row-locked reservation/allocation/reallocation/transfer workflows, automatic expiry, audit/outbox evidence and OpenAPI routes. |
| `apps/api/src/test-rides/test-rides.service.ts` | Requires a canonical branch-scoped Demo unit when Inventory is enabled; legacy behavior remains only for tenants without that module.                                                               |
| `apps/web/src/features/inventory`               | Query-backed catalogue, stock/import, reservation/allocation/transfer/demo/expected/aging workspace and unit detail commands.                                                                       |
| Inventory web Zustand/URL state                 | Non-persisted form/density state only; view/search/unit selection belongs to the URL and resets with the common feature-store reset.                                                                |
| `packages/database/src/seed.ts`                 | Alpha Inventory module, least-privilege mappings and one deterministic demo unit linked additively to the Phase 6 fixture.                                                                          |

## Database migrations

| Migration                  | Purpose                                                                                                                                                                       | Execution / rollback                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `0021_free_lightspeed.sql` | Catalogue, physical units, status history, reservations, allocations, transfers/events, receipts, permissions, transition/immutability triggers and nullable Test Ride links. | Forward-only. Preserve stock/history/audit/outbox evidence; restore a recovery point or compensate forward. |
| `0022_bitter_preak.sql`    | Explicit initial branch-link compatibility preflight and temporary exact tuple constraint.                                                                                    | Fails closed on ambiguity; never remaps a ride, unit or event.                                              |
| `0023_fast_vivisector.sql` | Final tenant/unit Test Ride FK, allowing physical branch transfer while ride branch remains a historical snapshot.                                                            | Forward-only. Do not rewrite historical ride branches to follow current stock location.                     |

The final schema passes 17 migration integrity tests. On the development/test Supabase target,
`pnpm db:migrate` succeeded and verification returned 24 journal entries, `inventory_units`, and 10
inventory permissions. No seed ran.

## Routes and API contracts

All routes are under `/v1/inventory`, require an active client context, the `INVENTORY` module and
route-specific permissions:

- catalogue and stock: `GET/POST /catalogue`, `GET/POST /units`, `POST /units/import`,
  `GET /units/:unitId`, `POST /units/:unitId/transition`
- reservations: `POST /units/:unitId/reservations`, `POST /reservations/:id/extend`,
  `POST /reservations/:id/release`, `POST /reservations/reconcile`
- allocations: `POST /units/:unitId/allocations`, `POST /allocations/:id/release`,
  `POST /allocations/:id/reallocate`
- transfers: `POST /units/:unitId/transfers`, `POST /transfers/:id/complete`,
  `POST /transfers/:id/cancel`

Every mutation requires `Idempotency-Key`. Optimistic versions, PostgreSQL row locks, partial unique
indexes and immutable evidence are authoritative; client status or tenant IDs are never trusted.

## Environment variables

Phase 7 adds none. Inventory has no provider credential and exposes no secret/client variable.
Existing database settings are used by the API and migration worker. Do not add payment-provider
credentials as part of Phase 7.

## Verified commands and results

| Command                          | Result on 2026-08-09                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | Pass; 11-workspace install up to date.                                                    |
| `pnpm format:check`              | Pass.                                                                                     |
| `pnpm lint`                      | Pass; 8 applicable tasks, zero warnings.                                                  |
| `pnpm type-check`                | Pass; 13/13 tasks.                                                                        |
| `pnpm test`                      | Pass; 13/13 tasks, API 61 unit + 38 integration, mobile 82, web 68 and all package tests. |
| `pnpm test:integration`          | Pass; API 38/38 and database migrations 17/17.                                            |
| `pnpm db:check`                  | Pass; 24-entry journal.                                                                   |
| `pnpm build`                     | Pass; API, shared packages, 20 web routes and Android/iOS Expo exports.                   |
| `pnpm db:migrate`                | Pass on user-confirmed test DB; 24 entries/table/10 permissions verified; no seed.        |

## Seed accounts and data

- Existing credentials remain unchanged.
- Alpha enables `LEADS`, `TELEPHONY`, `INBOX`, `TEST_RIDES` and `INVENTORY`; Beta keeps only its
  previously enabled modules.
- Alpha's deterministic demo unit uses reference `DEMO-EV-ZX-01` and links to the existing Phase 6
  ride/booking without changing their reference or event history.
- This session did not run `pnpm db:seed` against the test database.

## Known limitations and deferred work

- Phase 8 Booking, price, payment, finance, insurance, invoice, document and readiness entities do
  not exist. Phase 7 allocation therefore retains an opaque booking reference and explicit
  readiness assertion only.
- Reservation expiry runs every 60 seconds while an API process is available and can also be invoked
  idempotently through the reconciliation route. Hosted availability/monitoring remains operational
  release work.
- No manufacturer/DMS feed was selected; expected arrivals and imports are operator-supplied,
  validated inventory commands.
- Hosted staging, Linux OpenNext and authenticated browser visual QA remain external.
- Existing Phase 4-6 provider/device/compliance limitations remain in `KNOWN_ISSUES.md`.

## Exact prerequisites and recommendations for Phase 8

1. Consume canonical Phase 3 `lead_id`/`contact_id` and Phase 7 `inventory_unit_id`; do not create a
   parallel customer, VIN or stock-status model.
2. Replace/resolve an opaque allocation booking reference only through an explicit compatibility
   migration. Detect missing or ambiguous matches, preserve allocation IDs/history, and never
   silently relink a VIN.
3. Keep quotation, discount, payment proof, verified payment, finance approval/disbursement,
   invoice, insurance, documents and readiness as separate tenant-owned records; do not expand the
   Lead or Inventory status enum with financial states.
4. Treat CRM payments as append-only status evidence, not an accounting ledger or money processor.
   Corrections must reverse/append, verified balance must not become negative, and Inventory roles
   must not gain payment authority.
5. Make document objects private with validated metadata, short-lived signed access, download audit
   and immutable version/verification events. Uploaded proof is not verified payment.
6. Delivery readiness must be server-derived from configured mandatory conditions and the current
   canonical allocation; Billing must never replace the VIN silently.
7. Keep API/TanStack Query authoritative, financial/customer/document data out of persisted Zustand,
   URL state deep-linkable, and all transient stores on the established reset boundary.
8. Re-run the full 24-entry baseline plus Phase 8 migrations, cross-tenant/permission tests and all
   production builds before declaring Phase 8 complete.

## Gate

`PHASE 7 COMPLETE - TEST DATABASE MIGRATED; NO SEED OR PRODUCTION DEPLOYMENT`

`PHASE 8 NOT STARTED`
