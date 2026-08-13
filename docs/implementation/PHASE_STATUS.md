# Phase Status

- **Current phase:** Analytics + Reporting + Data-grid Add-on after Phase 14.
- **Current status:** **ANALYTICS ADD-ON CODE COMPLETE - EXTERNAL VALIDATION REMAINS.**
- **Completed local implementation:** Phases 0-14 plus the additive analytics/data-grid add-on.
- **Prototype status:** Runnable local web/API/worker/mobile prototype.
- **Production release status:** **NO-GO** until the external evidence gates below pass.
- **Last updated:** 2026-08-12 (Asia/Kolkata).

## Analytics add-on acceptance checklist

- [x] All 12 canonical role Overview surfaces and their authorization scopes are documented/audited.
- [x] Agency Admin receives client aggregates and cannot obtain customer/Lead PII or row drilldowns.
- [x] Client/management/operational analytics are aggregated on the server after effective scope.
- [x] Apache ECharts is the lazy modular chart engine with ARIA, resize, cleanup and text summaries.
- [x] Tenant-authoritative timezone dates, presets, comparison and shareable filter URLs are implemented.
- [x] The 48-surface table/list audit classifies every current grid/long list; all B surfaces are bounded
      through server page/cursor strategies and SQL filters precede pagination.
- [x] Lead/conversation network search and analytics text filters debounce by 300 ms; chat history uses
      opaque cursor loading and justified TanStack Virtual rendering.
- [x] Ten evidence-based additive indexes are generated in migration `0037`.
- [x] Analytics contracts, cross-tenant/branch/agency privacy integration and web UI tests are added.
- [x] `DESIGN.md`, canonical Analytics Add-on PRD, role matrix, table matrix, metric definitions,
      decisions, known issues, migrations and handoff are updated.
- [ ] Existing Phase 14 hosted infrastructure/provider/device/pilot evidence gates remain external.

## Phase 14 acceptance checklist

- [x] Hosted configuration fails closed for placeholder secrets, insecure Redis/object-storage URLs,
      invalid CORS and absent release identity; Sentry remains an optional production adapter.
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
| `pnpm --filter @gdm/api test:unit`             | Pass; 79/79 in the root gate.                                                                                               |
| `pnpm --filter @gdm/api test:integration`      | Pass; 63/63 in focused and root gates.                                                                                      |
| `pnpm --filter @gdm/database test:integration` | Pass; 25/25 across migration, compatibility and restore suites.                                                             |
| `pnpm --filter @gdm/web test`                  | Pass in root gate; 29 files and 109/109.                                                                                    |
| `pnpm --filter @gdm/mobile test`               | Pass; 21 suites and 86/86.                                                                                                  |
| `pnpm test`                                    | Pass; 13/13 workspace tasks, including API unit 79/79, API integration 63/63, web 109/109 and mobile 86/86.                 |
| `pnpm test:integration`                        | Pass; 7/7 workspace tasks, API 63/63 and database migration/recovery 25/25.                                                 |
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
