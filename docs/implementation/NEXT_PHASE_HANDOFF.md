# Next Phase Handoff

## Completed phase

Phase 8 - Booking, Billing, Payments, Finance and Documents. Strict local audit passed on
2026-08-09. Phase 9 has not started.

## Modules created or changed

| Area                                          | Actual implementation                                                                                                                                                                                                       |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/contracts/src/commercial`           | Zod contracts/enums for quotation, booking, payment, finance, insurance, invoice, exchange, private documents, list summaries and readiness.                                                                                |
| `packages/database/src/schema/commercial.ts`  | Tenant-owned commercial settings, immutable quote/price history, booking snapshots, append-only payment evidence, finance/exchange events, invoices, insurance, private document versions/events and readiness evaluations. |
| `apps/api/src/commercial`                     | `/v1/commercial` controller/service, authorization, idempotency, audit/outbox, fail-closed scanner port and private object-storage workflow.                                                                                |
| `apps/api/src/inventory/inventory.service.ts` | When `BOOKING_BILLING` is enabled, allocation validates and links the canonical confirmed booking instead of trusting the client readiness assertion.                                                                       |
| `apps/web/src/features/commercial`            | Permission-aware booking list/detail, quotation-to-booking, discount, payment, finance, invoice, insurance, exchange, private document and readiness workflows.                                                             |
| `packages/database/src/seed.ts`               | Alpha commercial settings, module flag, role mappings and deterministic quotation/booking/payment/finance fixture.                                                                                                          |

## Database migrations

- `0024_brave_white_queen.sql`: commercial entities, permissions, tenant/actor foreign keys,
  allocation booking link, private payment-proof link, append-only triggers and compatibility
  backfill by exact tenant/reference only.
- `0025_aberrant_shen.sql`: `finance_cases.disbursed_at`.
- `0026_goofy_changeling.sql`: unique tenant/quotation/version booking constraint.

The canonical journal has 27 entries (`0000` through `0026`). All apply from zero in PGlite and
18 migration integrity tests pass. No shared/staging/production migration or seed ran in Phase 8.
Rollback after commercial evidence exists means restoring the pre-Phase-8 recovery point or a
reviewed forward compensation; never delete payment/document/audit history or edit applied files.

## Routes and API contracts

All routes require client context, `BOOKING_BILLING` and the declared `commercial.*` permission.
Important paths are:

- `GET /v1/commercial/bookings`, `GET /v1/commercial/bookings/:id`
- `POST /v1/commercial/quotations`, `.../:id/revisions`, `.../:id/discount-decision`
- `POST /v1/commercial/bookings`, `.../:id/cancel`
- `POST /v1/commercial/bookings/:id/payments`, `payments/:id/verify|reverse`
- `POST /v1/commercial/bookings/:id/finance`, `finance/:id/decision|disburse`
- `POST /v1/commercial/bookings/:id/insurance|invoices|exchange`
- `POST /v1/commercial/exchange/:id/decision`
- `POST /v1/commercial/documents/uploads`, `documents/:id/complete|verify`
- `GET /v1/commercial/documents/:id/download`
- `POST /v1/commercial/bookings/:id/readiness/evaluate`

Every mutating path except read-only readiness/download requires `Idempotency-Key`; readiness
evaluation itself writes immutable evidence but is safe to repeat. OpenAPI is generated from the
controller and shared Zod validation remains the request source of truth.

## Environment variables

No Phase 8 payment-provider or public financial variable exists. Private documents reuse the
existing Tigris/S3 configuration. The built-in scanner binding deliberately returns unavailable;
production must bind and test an approved scanner before any required document can become Approved.

## Verified commands and results

| Command                 | Result                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------- |
| `pnpm format:check`     | Pass.                                                                                   |
| `pnpm lint`             | Pass; 8 applicable tasks.                                                               |
| `pnpm type-check`       | Pass; 13/13 tasks.                                                                      |
| `pnpm test`             | Pass; API 61 unit + 42 integration, mobile 82, web 69, contracts 35 and other packages. |
| `pnpm test:integration` | Pass; API 42/42 and migrations 18/18.                                                   |
| `pnpm db:check`         | Pass.                                                                                   |
| `pnpm build`            | Pass; API, 22 web routes and Android/iOS Expo exports.                                  |

## Seed accounts and data

Existing Phase 7 seed accounts remain unchanged. Alpha now has `BOOKING_BILLING` enabled and the
deterministic `BK-DEV-2026-0001` finance booking for `Ananya Test Ride Customer`, with one verified
partial UPI entry and one Applied finance case. Commercial settings use INR, a 100,000-minor-unit
discount threshold, 50% payment gate and Booking/Identity/Address required documents.

## Known limitations

- Document upload/download privacy is implemented, but approval is fail-closed until a real scanner
  adapter reports `CLEAN`.
- No customer money is processed and no accounting ledger/provider integration exists by design.
- No shared database migration/seed, hosted smoke, Linux OpenNext package or browser visual
  regression ran in this local phase.

## Exact Phase 9 prerequisites and recommendations

1. Read the PRD and `PROMPTS/09_DELIVERY_RC.md`; do not infer delivery/RC state from this handoff.
2. Consume canonical `bookings.id`, `inventory_allocations.booking_id` and
   `bookings.selected_inventory_unit_id`; never accept an opaque booking/VIN assertion when the
   commercial module is enabled.
3. Extend readiness with Phase 9 PDI, delivery, registration and handover evidence without mutating
   existing Phase 8 readiness evaluations. New evaluations remain append-only snapshots.
4. Keep Delivery and RC operational ownership separate from relationship, process and conversation
   owners. Use role/branch/assignment scope in the API.
5. Delivery cannot proceed unless the latest server evaluation is ready. Re-evaluate immediately
   before the terminal handover transaction; never trust a cached web/mobile readiness result.
6. Registration documents must reuse the Phase 8 private document/version/download-audit boundary.
   Do not expose object keys or create a public bucket.
7. Treat the scanner issue as a release prerequisite if Phase 9 requires approved documents; keep
   the workflow visibly blocked rather than bypassing it.
8. Add Phase 9 migrations, shared contracts, API authorization/business tests, assigned-role web or
   mobile UI, realistic seed evidence, OpenAPI/docs and all mandatory workspace gates before the next
   checkpoint.
