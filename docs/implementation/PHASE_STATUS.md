# Phase Status

- **Current phase:** Phase 9 - Delivery Operations.
- **Current status:** **Implementation and strict local completion audit passed.** All migrations
  apply from zero, affected tests/builds pass, and no Critical/High Phase 9 source issue is open.
- **Completed phases:** Phase 0 foundation, Phase 1 authentication/tenancy, Phase 2 organization,
  Phase 3 Lead CRM, Phase 4 telephony, Phase 6 test rides, Phase 7 inventory, Phase 8 commercial and
  Phase 9 delivery workflows. Phase 5 automated acceptance remains green; live WhatsApp activation
  remains gated by its documented external reliability issue.
- **Next phase:** Phase 10 - RC and Customer Vehicle Records is not started.
- **Last updated:** 2026-08-09

## Phase 9 acceptance-criterion checklist

- [x] One tenant-owned delivery operation consumes a confirmed Phase 8 booking, its canonical
      customer/Lead, active physical allocation and vehicle; opaque client booking or VIN assertions
      are not accepted.
- [x] Delivery, checklist/accessory/PDI and proof states are separate from the Lead pipeline and use
      the required Vehicle Allocated through Delivered/Delayed/Failed/Rescheduled/Cancelled states.
- [x] Required preparation checklist items block Ready and Start. Start performs a fresh canonical
      Phase 8 readiness evaluation and fails closed without activating location when readiness is
      blocked.
- [x] Assignment is limited to active branch-scoped `DELIVERY_EXECUTIVE` memberships. Mobile exposes
      only assigned work and the customer/vehicle/address fields needed to execute it.
- [x] Active location begins only after explicit disclosure and foreground permission, has a visible
      notification and server timeout, and stops locally plus server-side on completion, delay,
      failure, reschedule, cancellation or session/account cleanup.
- [x] Location samples are temporary, tenant/job/session bound, idempotent, stale-aware and excluded
      from completed/off-duty manager history.
- [x] Configured proof is mandatory for completion. Received-by proof can be committed atomically
      with offline completion; photo/signature uploads use private signed URLs, checksum/metadata
      validation, fail-closed scanning and audited short-lived downloads.
- [x] Delay, failure, cancellation, reassignment, reschedule requests/decisions and proof reviews
      require reasons and append immutable workflow/audit evidence.
- [x] Offline terminal mobile commands stop location immediately, persist in tenant-bound SQLite and
      replay in order with the same stable idempotency key, including lost-response retries.
- [x] Completion atomically marks delivery, inventory allocation and unit Delivered. Permanent RC is
      neither queried nor required, so registration can continue independently in Phase 10.
- [x] Every route requires active tenant, `DELIVERY_RC`, permission and object scope; cross-tenant job
      reads and private proof downloads return Not Found and are integration-tested.
- [x] `/deliveries`, `/deliveries/[jobId]` and mobile assigned/detail routes include permission-aware
      loading, empty, error, disabled and success states, active/stale monitoring, exception queues,
      proof review and audit timeline.

## External and deferred release checks

- [ ] No production delivery-proof malware scanner was supplied. Photo/signature proof remains
      pending and cannot be verified unless a reviewed adapter reports `CLEAN`.
- [ ] No delivery OTP provider was supplied. The adapter fails closed with a visible 503; default
      tenant proof configuration uses received-by evidence so this does not bypass a requirement.
- [ ] Physical-device foreground service, notification, location-stop, offline-replay and private
      proof upload UX still require signed-device validation before release.
- [ ] Hosted Cloudflare/Render/Supabase/Upstash/Tigris smoke, Linux OpenNext packaging and browser
      visual regression remain Phase 14 external checks. Local Next and Expo production builds pass.
- [ ] Phase 9 migrations and seed were validated locally but not applied to a shared, staging or
      production database.

## Last verified results (2026-08-09)

| Command                          | Result  | Actual evidence                                                                                         |
| -------------------------------- | ------- | ------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | Pass    | All 11 workspace projects were already up to date.                                                      |
| `pnpm format:check`              | Pass    | Repository matched Prettier after Phase 9 docs and source formatting.                                   |
| `pnpm lint`                      | Pass    | All applicable workspace lint tasks passed with zero warnings.                                          |
| `pnpm type-check`                | Pass    | 13/13 strict TypeScript tasks passed.                                                                   |
| `pnpm test`                      | Pass    | 13/13 tasks; API 61 unit + 46 integration, mobile 86, web 70, contracts 41 and package tests passed.    |
| `pnpm test:integration`          | Pass    | API 46/46 and complete database migration suite 19/19 passed.                                           |
| Focused Phase 9 regression       | Pass    | Delivery API 4/4, mobile 86/86, web 70/70, contracts 41/41 and migration 19/19 passed.                  |
| `pnpm db:check`                  | Pass    | Drizzle accepted the 29-entry migration journal (`0000` through `0028`).                                |
| `pnpm build`                     | Pass    | 8/8 build tasks; API/shared packages, 24 Next routes and Android/iOS Expo production exports completed. |
| `pnpm db:migrate`                | Not run | No shared/external database mutation was authorized for this checkpoint.                                |

The Windows host temporarily returned `uv_os_get_passwd ENOMEM` from Node despite 24 GB free. Tests
used a local process-only `geteuid` shim to bypass that host lookup; the shim was removed before the
checkpoint and does not alter product runtime behavior.

## Database and environment changes

- `0027_lush_silk_fever.sql` creates delivery settings/jobs, append-only status/checklist evidence,
  private proof/download evidence, OTP challenges, active-location sessions/samples, command
  receipts, 12 permissions and role mappings.
- `0028_sweet_tyger_tiger.sql` enforces exact tenant/session/job identity for location samples.
- `DELIVERY_OTP_PEPPER` is backend-only, requires an independent 32+ character hosted value and is
  never exposed through `NEXT_PUBLIC_*` or `EXPO_PUBLIC_*`.
- Alpha development seed enables `DELIVERY_RC`, adds delivery settings and one assigned preparation
  job backed by a separate confirmed allocated vehicle.

## Final gate

`PHASE 9 COMPLETE - MANDATORY LOCAL TESTS, MIGRATION VALIDATION AND BUILDS PASSED`

`PHASE 10 NOT STARTED`
