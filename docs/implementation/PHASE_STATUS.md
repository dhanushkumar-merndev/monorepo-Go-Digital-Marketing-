# Phase Status

- **Current phase:** Phase 7 - Vehicle Inventory and Allocation.
- **Current status:** **Phase 7 implementation and strict local completion audit passed.** The
  complete migration journal was also applied to the user-confirmed test database.
- **Completed phases:** Phase 0 foundation, Phase 1 authentication/tenancy, Phase 2 organization,
  Phase 3 Lead CRM, Phase 4 telephony, Phase 6 test rides, and Phase 7 inventory. Phase 5's unified
  inbox passes its automated acceptance criteria but live-provider activation remains gated by the
  reliability issue in `KNOWN_ISSUES.md`.
- **Next phase:** Not started. Phase 8 - Booking, Billing, Payments, Finance and Documents may begin
  only with the prerequisites in `NEXT_PHASE_HANDOFF.md`.
- **Last updated:** 2026-08-09

## Phase 7 acceptance-criterion checklist

- [x] Canonical tenant-owned brands, models, variants, colours and physical units support Expected,
      Available, Reserved, Allocated, Demo, In Transfer, Delivered, Blocked, Cancelled and Removed.
- [x] VIN, chassis, engine and unit-reference uniqueness is database-enforced per tenant. Expected
      stock can receive late identifiers atomically before becoming Available.
- [x] Concurrent allocation uses a row lock, optimistic version and partial unique indexes; the
      integration race produces exactly one active allocation.
- [x] Reservations require a future expiry, can be extended/released with retained evidence, and are
      released safely by a 60-second server monitor or the idempotent reconciliation route.
- [x] Transfer headers and events are immutable. Completion changes the physical unit branch while
      retaining the historical Phase 6 Test Ride branch, demo reference, IDs and events.
- [x] Demo sale conversion, delivery, cancellation, removal and VIN reallocation require explicit
      permission and reason/evidence. Delivered has no ordinary transition back to Available.
- [x] Every protected route derives tenant from the authenticated context, requires the `INVENTORY`
      module and route permission, and enforces branch scope before reads or writes.
- [x] Inventory/Billing separation is preserved: Phase 7 has no payment mutation surface, Billing is
      read-only, and allocation accepts only an opaque booking reference plus readiness assertion.
- [x] Mutating API commands require idempotency keys and atomically retain command receipt, status
      history, audit and outbox evidence.
- [x] Web catalogue, stock/detail, creation/import, reservations, allocation/reallocation, transfer,
      demo, expected-arrival and aging views are functional with loading, empty, error and success
      states.
- [x] API/TanStack Query owns stock records and versions; URL routes own shareable view/search/unit
      state. The non-persisted Inventory Zustand store owns only form visibility/table density and
      resets on all established auth, tenant, membership and support-context boundaries.

## Partial or external requirements

- [ ] Hosted Cloudflare/Render/Supabase/Upstash/Tigris smoke, Linux OpenNext packaging and browser
      visual regression remain external release checks. The ordinary Next.js and Expo production
      builds passed locally.
- [ ] The migration journal was applied only to the user-confirmed development/test Supabase target;
      no production migration or seed was run.
- [ ] Phase 8 canonical Booking/readiness records do not exist yet. Phase 7 deliberately retains an
      opaque booking reference and does not invent financial or delivery-readiness state.
- [ ] Phase 5's aged-`PROCESSING` provider-success/process-crash ambiguity remains open and continues
      to block live WhatsApp activation; it does not affect Phase 7 inventory correctness.

## Last verified results (2026-08-09)

| Command                          | Result | Actual evidence                                                                                                               |
| -------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | Pass   | 11-workspace install was already up to date.                                                                                  |
| `pnpm format:check`              | Pass   | All matched repository files passed Prettier.                                                                                 |
| `pnpm lint`                      | Pass   | 8 applicable workspace lint tasks passed with zero warnings.                                                                  |
| `pnpm type-check`                | Pass   | 13/13 strict TypeScript tasks passed.                                                                                         |
| `pnpm test`                      | Pass   | 13/13 tasks; API unit 61/61, API integration 38/38, mobile 82/82, web 68/68, contracts 30/30 and other packages passed.       |
| `pnpm test:integration`          | Pass   | API migrated-PGlite 38/38 and database migration 17/17 passed.                                                                |
| `pnpm db:check`                  | Pass   | Drizzle accepted the 24-entry journal through `0023_fast_vivisector.sql`.                                                     |
| `pnpm build`                     | Pass   | API, shared packages, 20 web routes including inventory list/detail, and Android/iOS Expo exports passed.                     |
| `pnpm db:migrate`                | Pass   | User-confirmed test target recorded 24 migrations; `inventory_units` and 10 inventory permissions were verified. No seed ran. |

## Database and environment changes

- `0021_free_lightspeed.sql` adds the catalogue, physical units, reservation/allocation, immutable
  transfer/status history and command-receipt domain, permissions and nullable Phase 6 links.
- `0022_bitter_preak.sql` preflights exact initial Test Ride branch/unit consistency without guessing
  or rewriting existing history.
- `0023_fast_vivisector.sql` restores the durable Test Ride reference to tenant/unit so later physical
  transfers do not invalidate immutable ride-branch snapshots.
- No Phase 7 provider secret or client environment variable was added. `.env.example` records that
  inventory concurrency and expiry are PostgreSQL/NestJS concerns.
- Alpha seed enables `INVENTORY` and defines one deterministic canonical demo unit linked to
  `DEMO-EV-ZX-01`; the user-authorized migration run did not execute the seed.

## Final gate

`PHASE 7 COMPLETE - MANDATORY TESTS, BUILDS AND TEST-DATABASE MIGRATION PASSED`

`PHASE 8 NOT STARTED`
