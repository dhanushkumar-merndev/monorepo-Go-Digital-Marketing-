# Next Phase Handoff

## Completed phase

Phase 9 - Delivery Operations. Strict local audit passed on 2026-08-09. Phase 10 has not started.

## Modules created or changed

| Area                                            | Actual implementation                                                                                                                                                 |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/contracts/src/delivery`               | Shared states, checklist/proof enums and Zod contracts for creation, assignment, readiness, schedule, location, proof, completion, exceptions and reschedule.         |
| `packages/config/src/delivery.ts`               | Backend-only OTP pepper validation with hosted-environment default rejection.                                                                                         |
| `packages/database/src/schema/delivery.ts`      | Tenant-safe delivery settings/jobs, append-only status/checklist evidence, proofs/download audits, OTP, location sessions/samples and command receipts.               |
| `apps/api/src/delivery`                         | `/v1/delivery` controller/service/module, fresh Commercial readiness, private proof adapters, authorization, idempotency, audit/outbox and terminal Inventory update. |
| `apps/mobile/src/{screens,data,platform,store}` | Assigned Today/Upcoming work, prep/proof/exceptions, explicit active tracking, tenant SQLite queues and exact-key offline terminal replay.                            |
| `apps/web/src/features/delivery`                | Manager totals, active/stale monitor, exception queue, create/assign/prep/schedule, proof review/download, reschedule decision and immutable timeline.                |
| `packages/database/src/seed.ts`                 | Alpha `DELIVERY_RC` flag/settings/permissions and one assigned preparation job backed by a separate confirmed allocated vehicle.                                      |

## Database migrations

- `0027_lush_silk_fever.sql`: delivery enums/tables, 12 permissions and mappings, composite
  tenant/actor/resource foreign keys, unique command identities and append-only status/checklist/
  proof-download triggers.
- `0028_sweet_tyger_tiger.sql`: exact `(client_organization_id, session_id, delivery_job_id)`
  location-sample identity through the matching session uniqueness constraint.

The canonical journal has 29 entries (`0000` through `0028`). All apply from zero in PGlite and all
19 migration integrity tests pass. No shared/staging/production migration or seed ran in Phase 9.
Rollback before business use can restore the pre-Phase-9 recovery point. After evidence exists, use
a reviewed forward compensation; never delete delivery/proof/audit history or edit applied files.

## Routes and API contracts

All routes require client context, `DELIVERY_RC`, the declared `delivery.*` permission and backend
branch/assignment scope. Important paths are:

- `GET/POST /v1/delivery`, `GET /v1/delivery/:jobId`
- `GET /v1/delivery/active`, `POST /v1/delivery/tracking/reconcile`
- `GET /v1/delivery/executives?branch_id=...`
- `GET/POST /v1/delivery/settings`
- `POST /v1/delivery/:jobId/assign|checklist|ready|schedule|start|location`
- `POST /v1/delivery/:jobId/proofs/received-by|initiate|complete`
- `POST /v1/delivery/:jobId/otp/request|verify`
- `POST /v1/delivery/:jobId/complete|delay|fail|cancel|reschedule`
- `POST /v1/delivery/:jobId/reschedule-decision`
- `POST /v1/delivery/proofs/:proofId/review`
- `GET /v1/delivery/proofs/:proofId/download?purpose=...`

Mutating workflow/proof commands require `Idempotency-Key`, except batched location samples, which
carry per-sample idempotency keys, and OTP request, whose durable challenge is not safe to replay.
OpenAPI is generated from the controller; shared Zod schemas remain the request source of truth.

## Environment variables

- `DELIVERY_OTP_PEPPER`: independent backend-only 32+ character secret. The local default is rejected
  in staging/production. It must never use `NEXT_PUBLIC_*` or `EXPO_PUBLIC_*`.
- Private delivery proof reuses existing S3/Tigris settings. The default scanner and OTP sender fail
  closed until reviewed providers are bound.

## Verified commands and results

| Command                          | Result                                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | Pass; all 11 projects already up to date.                                                    |
| `pnpm format:check`              | Pass.                                                                                        |
| `pnpm lint`                      | Pass; zero warnings.                                                                         |
| `pnpm type-check`                | Pass; 13/13 tasks.                                                                           |
| `pnpm test`                      | Pass; API 61 unit + 46 integration, mobile 86, web 70, contracts 41 and other package tests. |
| `pnpm test:integration`          | Pass; API 46/46 and migrations 19/19.                                                        |
| `pnpm db:check`                  | Pass.                                                                                        |
| `pnpm build`                     | Pass; API/shared packages, 24 Next routes and Android/iOS Expo exports.                      |

## Seed accounts and data

Existing accounts remain. Alpha enables `DELIVERY_RC`. `Dev Delivery Executive` is scoped to the
Pune branch and receives only delivery read/execute/checklist/proof-upload/location permissions.
The deterministic Alpha delivery job is in Vehicle Preparation with required checklist rows and is
backed by a new confirmed booking, active allocation and physical unit. It deliberately remains
commercial-readiness blocked so managers/executives can verify the fail-closed start path.

## Known limitations and deferred work

- Photo/signature proof cannot be verified until a production scanner reports `CLEAN`.
- OTP request fails visibly until Phase 13 supplies a provider; received-by remains the seeded proof
  requirement.
- Physical device, shared database, hosted providers, retention execution, browser visual regression
  and deployment smoke remain external Phase 14 work.
- Phase 9 creates no RC record and never requires permanent RC. Registration begins only in Phase 10.

## Exact Phase 10 prerequisites and recommendations

1. Read the PRD and `PROMPTS/10_RC_CUSTOMER_VEHICLE.md`; implement only Phase 10.
2. Consume the canonical delivered `delivery_jobs.id`, `bookings.id`, `inventory_units.id`, Contact
   and Lead identities. Never create a duplicate vehicle/customer record from browser-supplied VIN.
3. Keep delivery and registration parallel. A delivered job is valid without permanent RC, and a
   registration delay must not rewrite the delivery status/timeline.
4. Reuse private signed storage, fail-closed scanning and audited download evidence for temporary RC,
   permanent RC and registration documents; do not expose object keys.
5. Add a distinct customer-vehicle ownership/history model. Do not collapse relationship,
   current-process, conversation, delivery or registration ownership.
6. Preserve tenant/branch scope, append-only status history, idempotent commands and exact foreign
   keys. Cross-tenant vehicle/document access needs migrated integration coverage.
7. Treat the scanner/hosted/device issues in `KNOWN_ISSUES.md` as external prerequisites, not reasons
   to bypass proof or claim provider completion.
8. Add Phase 10 migrations, contracts, backend policies/tests, functional UI, seeds, OpenAPI/env/docs
   and run the strict completion audit before its checkpoint.
