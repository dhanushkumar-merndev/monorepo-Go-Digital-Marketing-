# Next Phase Handoff

## Completed work and gate status

- **Recovered phase:** Phase 2 organization, hierarchy, role/scope and administration.
- **Reconciled/audited phase:** Phase 3 Lead capture, lifecycle, assignment and SLA.
- **Next phase:** Phase 4 telephony is not started. Its provider-neutral development work may begin
  after the database gate or an explicit environment-only exception is accepted.
- **Verified date/host:** 2026-08-07, Windows, Node.js 24.18.1, pnpm 11.18.0.
- **Release qualifier:** Normal repository gates/builds and the local Cloudflare packaging result are
  recorded in `PHASE_STATUS.md`; do not infer an unrecorded hosted/device/provider result.

## Modules created or materially updated

| Module                                                 | Actual repository contract                                                                                                                    |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/database/src/schema/organizations.ts`        | Canonical Department under tenant/branch; Team requires Department                                                                            |
| `packages/database/src/schema/authorization.ts`        | TEAM_MANAGER, department scope/job title, effective team membership, Team Manager history and reporting lines                                 |
| `packages/contracts/src/administration` and `src/auth` | Department/hierarchy commands and responses; department/job-title/managed-team authentication context                                         |
| `apps/api/src/administration`                          | Tenant-safe Department/team/hierarchy commands, cycle validation, scoped management and immutable audit evidence                              |
| `apps/api/src/auth` / `src/authorization`              | Live department scope and managed-team hydration/policy                                                                                       |
| `apps/web/src/features/administration`                 | Department, Team Manager, team membership, reporting and department/job-title scope controls with data states                                 |
| `apps/api/src/leads`                                   | Canonical team eligibility/Team Manager visibility, idempotent follow-up replay, expanded activity timeline and public endpoint HTTP coverage |
| `apps/web/src/features/leads`                          | Functional duplicate resolution and idempotent follow-up command                                                                              |
| `apps/mobile`                                          | Assigned Lead actions and tenant-scoped conflict-preserving outbox; real follow-up command instead of UI-only status metadata                 |
| `docs/client-input`, PRD and `PROMPTS`                 | Recovery analysis, phase mapping, PRD Appendix F and reconciled Phase 2–14 dependency contracts                                               |

## Database migrations

Apply in journal order; never rewrite or squash after a shared environment applies them.

| Migration                               | Purpose                                                                                                | Execution / rollback consideration                                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `0005_thin_wrecking_crew.sql`           | Phase 3 Lead/contact/consent/history/work/SLA/public-form tables                                       | Existing reviewed Phase 3 migration; destructive rollback is not approved after business data exists                                      |
| `0006_third_tenebrous.sql`              | Lead permission enum values                                                                            | PostgreSQL enum removal is not an online rollback                                                                                         |
| `0007_white_preak.sql`                  | Source metadata and corrected external-event uniqueness                                                | Rollback would discard source evidence                                                                                                    |
| `0008_phase3_lead_permissions.sql`      | Lead permission rows and mappings                                                                      | Access changes require separate audit                                                                                                     |
| `0009_mean_domino.sql`                  | Department/hierarchy schema; safe existing-Team backfill before `NOT NULL`                             | Creates one `RECOVERY_DEFAULT` department per existing branch; review/rename after apply; do not drop history tables                      |
| `0010_phase2_organization_backfill.sql` | TEAM_MANAGER/permission rows, job titles, department scopes and team-membership compatibility evidence | Review team membership inferred from explicit selected team scope; enum values are intentionally used only after migration `0009` commits |
| `0011_yielding_barracuda.sql`           | Queue branch/team and prior-assignee tenant integrity                                                  | Preflight aborts on inconsistent legacy data; investigate and repair explicitly, then retry                                               |

PGlite applies all 12 journaled migrations and tests tenant/branch/department/team constraints. On
2026-08-07, the user-confirmed disposable development PostgreSQL database advanced from canonical
`0000` through `0011`, then seeded two tenants/13 `.test` users. A real staging PostgreSQL migration
and compatibility review remain release prerequisites.

## Routes and API contracts

All routes are under `/v1`.

### Phase 2

- `POST/PUT /administration/departments[/:departmentId]`
- `GET /administration/hierarchy`
- `POST /administration/teams/:teamId/members`
- `PATCH /administration/team-memberships/:teamMembershipId/end`
- `PUT /administration/teams/:teamId/manager`
- `PUT /administration/memberships/:membershipId/reporting-manager`
- Existing client/branch/team/user/membership/working-hours/settings/flags/audit routes remain.

### Phase 3

- `POST /public/lead-forms/:clientFormKey` resolves tenant/branch/queue from the form, rate-limits,
  validates consent/page evidence and uses bot/idempotency adapters.
- `GET/POST /leads`, `GET /leads/:leadId`, lifecycle, assignment, note, follow-up, task,
  duplicate-review and SLA routes remain backward-compatible.
- `POST /leads/:leadId/follow-ups` now requires `Idempotency-Key`, matching safe mobile replay.

## Environment variables

No new environment variable was introduced by Phase 2 recovery.

Phase 3 still requires backend-only `LEAD_PHONE_LOOKUP_PEPPER` and supports
`LEAD_PUBLIC_RATE_LIMIT_WINDOW_SECONDS`. No provider credential is present. Bot-enabled public forms
fail closed until a reviewed adapter is bound.

## Seed accounts/data

- `client.admin@seed.godigital.test` — CLIENT_ADMIN, job title CRM Admin.
- `sales.manager@seed.godigital.test` — SALES_MANAGER / Showroom Manager.
- `team.manager@seed.godigital.test` — TEAM_MANAGER with canonical Pune team assignment.
- `telecaller@seed.godigital.test` — Telecaller and canonical team member.
- `salesperson@seed.godigital.test` — SALESPERSON, job title Sales Consultant and canonical team
  member.
- Pune, Mumbai and Nashik seed branches have explicit departments; Alpha Pune retains the
  `PUNE-INBOUND` queue and `alpha-pune-website` public form.

Use only the documented development seed password. No real customer/provider data is committed.

## Known limitations and deferred work

- The two client requirement PDFs were reconciled against PRD Appendix F and the phase mapping; no
  Phase 2/3 delta was found. The replacement PRD's structure/Appendix F was inspected, but its page
  images still need an external LibreOffice or desktop-Word render check.
- Compatibility Department labels and inferred team memberships require staging review.
- Cloudflare/OpenNext Windows symlink packaging reproduced as an environment-only gate: Next.js
  passed, then OpenNext failed creating `@next/env` with `EPERM`. No WSL distribution or Docker CLI
  is available on this host; validate on Linux/WSL/CI.
- Mobile outbox payload is OS-sandboxed but not application-layer encrypted; it contains no tokens.
- Bot protection, password-reset delivery, live Google/native verification, hosted infrastructure,
  physical-device validation and later provider integrations remain external/deferred.
- No Phase 4+ business functionality was implemented.

## Verified commands and results

| Command                                               | Result                                                                            |
| ----------------------------------------------------- | --------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                      | Pass; 11 workspace projects already current                                       |
| `pnpm format:check`                                   | Pass after formatting the 31 files identified by the initial check                |
| `pnpm lint`                                           | Pass; 8/8 tasks after removing two unused test bindings                           |
| `pnpm type-check`                                     | Pass; 13/13 tasks                                                                 |
| `pnpm test`                                           | Pass; 275 tests                                                                   |
| `pnpm test:integration`                               | Pass; 43 tests (API 29, database migrations 14)                                   |
| `pnpm db:check`                                       | Pass; all 12 journaled migrations/snapshots valid                                 |
| `pnpm --filter @gdm/mobile exec expo install --check` | Pass; dependencies up to date                                                     |
| `pnpm build`                                          | Pass; 8/8 API/web/mobile/shared tasks, including Android and iOS exports          |
| `pnpm build:web:cloudflare`                           | Environment failure after successful Next build; OpenNext Windows symlink `EPERM` |
| `wsl.exe -l -q`                                       | Unavailable; exit 1, no installed Linux distribution                              |
| Linux container availability check                    | Unavailable; Podman/Docker absent and WSL has no installed distribution           |

## Exact prerequisites for Phase 4

1. Retain passing final formatting, lint, strict TypeScript, unit, integration, migration and normal
   production-build evidence from `PHASE_STATUS.md`.
2. Apply migrations `0009`–`0011` to staging after backup; review/rename every
   `RECOVERY_DEFAULT` department and confirm inferred active team memberships.
3. Run two-tenant staging smoke tests for cross-tenant hierarchy denial, Team Manager replacement,
   reporting-cycle denial, managed-team Lead visibility, idempotent public capture/follow-up replay,
   inactive/non-team queue skip and assignment history.
4. Render the replacement PRD on LibreOffice or desktop Word in CI and visually inspect the final
   pages before publishing it. The client PDFs are already reconciled; do not re-open their scope
   unless a new client amendment arrives.
5. Validate Cloudflare packaging on Linux/WSL/CI and retain artifact evidence.
6. Phase 4 may now begin. Implement the prompt's provider-neutral `TelephonyProvider`, development
   adapter, authoritative generic webhook, reconciliation and fail-closed recording-access rules.
   A live provider credential/selection is not required to start that work. Before a real provider
   is enabled, document webhook signing, tenant credentials, recording/retention consent,
   reconciliation and outage behavior.
7. Keep Android call-log, SMS, contacts and accessibility permissions out of core scope. Do not use
   SIM/mobile recording workarounds; provider-side recording requires legal/privacy approval.
8. Phase 4 must attach Calls to canonical Phase 3 Lead/Contact/activity and use Phase 2 user/team
   scope. It must not create another customer, team or manager model.
