# Phase Status

- **Current phase:** Phase 8 - Booking, Billing, Payments, Finance and Documents.
- **Current status:** **Implementation and strict local completion audit passed.** All migrations
  apply from zero, all affected tests/builds pass, and no Critical/High Phase 8 issue is open.
- **Completed phases:** Phase 0 foundation, Phase 1 authentication/tenancy, Phase 2 organization,
  Phase 3 Lead CRM, Phase 4 telephony, Phase 6 test rides, Phase 7 inventory and Phase 8 commercial
  workflows. Phase 5 automated acceptance remains green; live WhatsApp activation remains gated by
  its documented provider-success/process-crash issue.
- **Next phase:** Phase 9 - Delivery and RC Operations is not started.
- **Last updated:** 2026-08-09

## Phase 8 acceptance-criterion checklist

- [x] Quotation price components and versions are immutable; discount/exchange reductions use
      integer minor currency units and configurable tenant thresholds.
- [x] Above-threshold discounts create a separately permissioned Pending approval. Only the exact
      current Approved/Not Required quotation version can create one booking.
- [x] Bookings consume canonical tenant/branch Lead, Contact and quotation identities, retain the
      exact price snapshot and link an exact active Phase 7 allocation without rewriting history.
- [x] Payment evidence is append-only. Pending proof is not paid, verification is separately
      permissioned, verified totals cannot exceed payable, and corrections append a linked reversal.
- [x] Full, Partial, Finance, Installment and Mixed payment types remain separate from finance,
      insurance, invoice, exchange and Lead lifecycle records.
- [x] Finance application, approval/rejection and disbursement are separate versioned milestones
      with provider references and append-only events.
- [x] Booking cancellation retains reason, notification decision and a required refund/settlement
      note whenever verified payment exists.
- [x] Commercial documents use private signed S3-compatible upload/download URLs, type/extension,
      MIME, size, checksum and metadata checks, version/status evidence and audited downloads.
- [x] Document approval fails closed unless the scanner reports `CLEAN`; upload alone never approves
      proof or changes payment state.
- [x] Readiness derives from canonical booking, allocation, verified payment threshold, finance,
      invoice, insurance, customer confirmation and configured approved document types and returns
      explicit blocking items.
- [x] Every route requires active tenant/module/permission context; backend resource lookup enforces
      tenant and branch scope and returns Not Found for inaccessible objects.
- [x] Mutations use idempotency receipts and commit domain outbox plus immutable audit evidence in
      the same PostgreSQL transaction as business state.
- [x] `/bookings` and `/bookings/[bookingId]` provide query-backed loading, empty, error and success
      states for booking search/detail, price breakdown, discount decision, quotation-to-booking,
      payment verification, finance, insurance, invoice, exchange, documents and readiness.

## External and deferred release checks

- [ ] No production malware-scanner provider was supplied. The default adapter is intentionally
      fail-closed (`PENDING_EXTERNAL_SCAN`), so document approval cannot be activated until a
      reviewed adapter is configured and tested.
- [ ] Hosted Cloudflare/Render/Supabase/Upstash/Tigris smoke, Linux OpenNext packaging and browser
      visual regression remain external release checks. Ordinary Next.js and Expo builds pass.
- [ ] Phase 8 migrations were validated from zero in PGlite but were not applied to a shared,
      staging or production database and the Phase 8 seed was not executed against one.
- [ ] Phase 5 live WhatsApp activation remains blocked by its documented Medium reliability issue;
      it does not affect Phase 8 internal commercial correctness.

## Last verified results (2026-08-09)

| Command                          | Result  | Actual evidence                                                                                                         |
| -------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | Pass    | Workspace was already up to date.                                                                                       |
| `pnpm format:check`              | Pass    | All repository files matched Prettier before the final focused regression; modified files were formatted again.         |
| `pnpm lint`                      | Pass    | 8 applicable workspace lint tasks passed with zero warnings; final API/web/database lint also passed.                   |
| `pnpm type-check`                | Pass    | 13/13 strict TypeScript tasks passed; final API/web/database checks also passed.                                        |
| `pnpm test`                      | Pass    | 13/13 tasks: API 61 unit + 42 integration, mobile 82, web 69, contracts 35 and all package tests passed.                |
| `pnpm test:integration`          | Pass    | API 42/42 and complete database migration suite 18/18 passed in parallel after raising the setup timeout to 30 seconds. |
| Focused Phase 8 regression       | Pass    | Commercial service 4/4, web 69/69 and migration 18/18 passed after the final audit changes.                             |
| `pnpm db:check`                  | Pass    | Drizzle accepted the Phase 8 journal.                                                                                   |
| `pnpm build`                     | Pass    | API/shared packages, 22 Next routes including booking list/detail, and Android/iOS Expo exports passed.                 |
| `pnpm db:migrate`                | Not run | No shared/external database mutation was authorized for this phase checkpoint.                                          |

## Database and environment changes

- `0024_brave_white_queen.sql` creates the commercial domain, 18 permissions, tenant-safe foreign
  keys, allocation compatibility link, append-only triggers and private document evidence.
- `0025_aberrant_shen.sql` adds the explicit finance disbursement timestamp.
- `0026_goofy_changeling.sql` prevents duplicate bookings from one quotation version.
- `.env.example` documents reuse of private S3/Tigris storage and the fail-closed scanner boundary;
  no payment-provider secret or browser/mobile financial secret was added.
- Alpha seed enables `BOOKING_BILLING`, configures explicit commercial thresholds and adds one
  deterministic partial-payment finance booking. It is development-only data.

## Final gate

`PHASE 8 COMPLETE - MANDATORY LOCAL TESTS, MIGRATION VALIDATION AND BUILDS PASSED`

`PHASE 9 NOT STARTED`
