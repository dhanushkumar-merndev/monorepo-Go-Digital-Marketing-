# Phase Status

- **Current phase:** Phase 14 - Production Release and final cross-phase audit.
- **Current status:** **CODE COMPLETE - EXTERNAL VALIDATION REMAINS.**
- **Completed local implementation:** Phases 0-14.
- **Prototype status:** Runnable local web/API/worker/mobile prototype.
- **Production release status:** **NO-GO** until the external evidence gates below pass.
- **Last updated:** 2026-08-09 (Asia/Kolkata).

## Phase 14 acceptance checklist

- [x] Hosted configuration fails closed for placeholder secrets, insecure Redis/object-storage URLs,
      invalid CORS, absent release identity, absent Sentry configuration and enabled production Swagger.
- [x] Agency Admin password and Google login require encrypted TOTP enrollment/verification before a
      refresh session exists; recovery codes are single-use and TOTP time-step replay is rejected.
- [x] Support-elevation expiry and every authorization-context transition clear TanStack Query and all
      feature Zustand state before another context renders.
- [x] Report/export scope, DST bounds, CSV formula neutralization, private-key redaction, permission
      mappings and exact Call/Recording transcript identity are corrected and integration-tested.
- [x] Messaging credentials support active plus previous decrypt-only keys; ingress/output rate limits,
      atomic webhook leases, bounded payloads, retry jitter, ambiguous-send dead-lettering and retention
      maintenance are implemented.
- [x] Commercial, delivery and RC document downloads require a verified clean scanner state.
- [x] Recurring reminder and messaging-retention BullMQ schedulers replay PostgreSQL-backed work.
- [x] Migrations `0034` and `0035` are additive and pass zero-to-latest, populated compatibility and
      PGlite snapshot/restore tests.
- [x] Manual migration-first Render promotion, non-root pruned Docker image, supply-chain gates,
      Cloudflare/OpenNext, EAS channels/versioning, release evidence validation, load tooling and runbooks
      are present.
- [x] Android and iOS production JS exports build locally.
- [ ] Linux OpenNext bundle, Docker smoke/SBOM/container scan, hosted restore, load/soak, signed mobile
      device matrix, official providers and one-dealership pilot are externally verified.

## Last verified local results

| Command/evidence                               | Actual result                                                                                                               |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`               | Pass; lockfile unchanged.                                                                                                   |
| `pnpm format:check`                            | Pass.                                                                                                                       |
| `pnpm db:check`                                | Pass; Drizzle metadata is consistent.                                                                                       |
| `pnpm lint`                                    | Pass; 8 workspace tasks.                                                                                                    |
| `pnpm type-check`                              | Pass; 13 workspace tasks including prerequisite builds.                                                                     |
| `pnpm --filter @gdm/api test:unit`             | Pass; 76/76.                                                                                                                |
| `pnpm --filter @gdm/api test:integration`      | Pass; 59/59 in the full gate.                                                                                               |
| `pnpm --filter @gdm/database test:integration` | Pass; 25/25 across migration, compatibility and restore suites.                                                             |
| `pnpm --filter @gdm/web test`                  | Pass; 81/81.                                                                                                                |
| `pnpm test`                                    | Pass; 13/13 workspace tasks, including API unit 76/76, API integration 59/59, web 81/81 and mobile 86/86.                   |
| `pnpm test:integration`                        | Pass; 7/7 workspace tasks and API 59/59.                                                                                    |
| `pnpm build`                                   | Pass; API, web, Android and iOS production outputs; 8/8 tasks.                                                              |
| `pnpm build:web:cloudflare`                    | Next/OpenNext build reaches bundle generation; Windows symlink creation fails with `EPERM`. Linux CI remains authoritative. |
| `pnpm security:audit:release`                  | Pass with only two exact `image-size` optional-peer exceptions; pruned runtime exclusion is CI-enforced.                    |
| Release tooling tests                          | Pass; 11/11. Blank evidence validator correctly returns NO-GO.                                                              |

## External release gates

- Supabase recovery point, PITR/RPO evidence and isolated hosted restore.
- Linux CI Docker image smoke, SBOM and High/Critical container scan.
- Production-like 75-concurrent load test and soak test against an explicitly approved target.
- Render, Cloudflare, Upstash, private object storage and Sentry deployment/alert-route smoke.
- Official messaging, telephony, AI/social approvals and provider reconciliation.
- Approved malware scanner producing real `CLEAN` evidence.
- Signed EAS artifact and physical-device permission, location, notification and offline replay matrix.
- Legal/privacy/DLT/retention approval, named pilot execution and signed release acceptance.
