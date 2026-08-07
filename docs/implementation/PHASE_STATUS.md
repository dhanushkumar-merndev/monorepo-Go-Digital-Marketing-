# Phase Status

- **Current phase:** Phase-order recovery; sequential Phase 2 and Phase 3 strict audits.
- **Current status:** **Phase 2 and Phase 3 code complete; external validation remains.** Repository
  formatting, lint, strict TypeScript, unit, integration, migration and normal production-build
  gates pass. Client PDFs and the replacement PRD reconcile with the phase mapping. The canonical
  migration chain now passes on the confirmed disposable development PostgreSQL database; Linux
  Cloudflare packaging remains unverified on this host.
- **Completed phases:** Phase 0 foundation and Phase 1 authentication/tenancy. Phase 2 and Phase 3
  have code-complete audit classifications subject to the external gates below.
- **Next phase:** Phase 4 is not started. Its provider-neutral implementation gate is open; it is
  not release-cleared by this audit.
- **Last updated:** 2026-08-07

## Phase-order recovery

- [x] Preserved all existing Phase 3 Lead/Contact IDs, ownership fields and append-only histories.
- [x] Added the missing canonical Phase 2 Department, team membership, Team Manager and reporting
      hierarchy beneath the existing Lead implementation.
- [x] Reused the existing membership/permission engine and stable role codes; appended only
      `TEAM_MANAGER` and department/hierarchy permissions.
- [x] Reconciled Phase 3 assignment and manager visibility to active Phase 2 relationships without
      adding manager IDs to Leads.
- [x] Added forward-only migrations `0009`–`0011`; no existing Phase 3 migration was rewritten or
      renumbered.
- [x] Reconciled the editable PRD, client analysis/mapping and Phase 2–14/audit prompts.
- [x] Cross-checked all four core-functions PDF pages and both user-roles PDF pages against the
      PRD, prompts and client mapping; no Phase 2/3 delta was found.

## Phase 2 strict-audit checklist

- [x] Tenant → Branch → Department → Team is canonical; Team requires a tenant/branch-valid
      Department.
- [x] Effective-dated team memberships, Team Manager assignments and reporting lines preserve
      actor, reason and history.
- [x] Valid Team Manager assignment and replacement succeed; prior assignments remain searchable.
- [x] Cross-tenant Department, team membership and Team Manager relationships fail through
      composite foreign keys and service-scoped lookup.
- [x] Self-reporting, reporting cycles, invalid role/team eligibility, unauthorized cross-team
      management and tenant/branch/department/team scope violations are rejected.
- [x] Authentication context hydrates live department scope and managed team IDs; backend policy is
      authoritative independently of UI visibility.
- [x] CRM Admin maps to tenant-scoped `CLIENT_ADMIN`, has no platform permissions and remains
      distinct from Agency/Super Admin.
- [x] Sales Consultant preserves the stable `SALESPERSON` role code; dealership titles use
      `job_title` plus department/team/scope rather than duplicate hard-coded roles.
- [x] Disabled users and suspended tenants remain blocked by the shared live-session guard.
- [x] Administration commands validate tenant/object scope and append immutable audit evidence.
- [x] Administration web controls are functional for Departments, team membership, Team Manager,
      reporting line, department scope and job title, with loading/error/empty/success states.
- [x] Migration ordering, foreign keys, unique-current constraints, indexes and compatibility
      backfills pass migrated-PGlite tests.
- [x] Canonical migrations `0000` through `0011` applied to the configured disposable development
      PostgreSQL database; it seeded two tenants/13 `.test` users with valid Departments, Teams,
      memberships, Team Manager assignments and reporting lines.
- [ ] Compatibility Department names and inferred team memberships still need review when a
      non-empty client/staging database is migrated.
- [ ] Replacement PRD opens in Word and its 67-page/81-table structure and Appendix F content were
      inspected, but page-image rendering remains unavailable because this host has no LibreOffice.

**Phase 2 classification:** `PHASE 2 CODE COMPLETE — EXTERNAL VALIDATION REMAINS`

## Phase 3 strict-audit checklist

- [x] Uses exactly `META`, `WHATSAPP_AD`, `GOOGLE_ADS`, `WEBSITE`, `WALK_IN`, `OTHER`; manual entry
      remains an entry method and client examples remain provider/source metadata.
- [x] Contacts/channels, consent, opportunities, source/campaign metadata, three owners,
      assignments/history, lifecycle/outcome history, follow-ups, notes, tasks, queues, SLA,
      escalations, duplicate candidates, public forms and command receipts are tenant-owned.
- [x] Duplicate capture and follow-up replay are idempotent; ambiguous contacts are never silently
      or destructively merged and checks never cross tenants.
- [x] Invalid transitions and concurrent stale versions are rejected without partial writes.
- [x] Rejected and Lost remain distinct/searchable; reopen preserves source and all prior history.
- [x] Round robin uses deterministic working hours and skips inactive, ineligible or non-member
      users; manual reassignment applies the same canonical eligibility and requires reason.
- [x] Three-owner fields remain separate; assignment/reassignment append audit, history and outbox
      evidence atomically.
- [x] SLA deadlines are deterministic, versioned, working-hours aware and claimed idempotently.
- [x] Sales Consultant sees only current-process assigned Leads; Team Manager sees only Leads in
      actively managed teams; branch and tenant scopes remain default-deny.
- [x] Public `POST /v1/public/lead-forms/{clientFormKey}` validates consent, phone/page/source data,
      rate limit, bot adapter and idempotency before atomic contact/Lead/assignment/outbox work.
- [x] Web implements Lead inbox/detail/timeline/manual capture/filtering, queues, rejected/lost,
      reopen, follow-up, SLA and functional duplicate decisions.
- [x] Mobile implements assigned Lead work and a tenant/idempotency/version-aware SQLite outbox;
      conflicts are retained and follow-ups use the real API command.
- [x] Activity timeline includes status, assignments, notes, follow-ups, tasks and duplicate
      decisions while immutable security audit remains separate.
- [ ] Mobile outbox payload is OS-sandboxed but not application-layer encrypted.
- [ ] Hosted bot/provider, device and deployment validation remains external.

**Phase 3 classification:** `PHASE 3 CODE COMPLETE — EXTERNAL VALIDATION REMAINS`

## Fresh verification results

| Command                                               | Result                         | Actual evidence                                                                                                        |
| ----------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                      | Pass                           | All 11 workspace projects already up to date; pnpm 11.18.0                                                             |
| `pnpm format:check`                                   | Pass after formatting          | Initial check identified 31 touched files; `pnpm format` fixed them; rerun passed                                      |
| `pnpm lint`                                           | Pass after audit fix           | Initial run found two unused hierarchy-test bindings; rerun: 8/8 tasks                                                 |
| `pnpm type-check`                                     | Pass                           | 13/13 strict TypeScript tasks                                                                                          |
| `pnpm test`                                           | Pass after stale-fixture fixes | 275 tests: API 88 (59 unit + 29 integration), web 59, mobile 72, config 24, contracts 18, database 12, design tokens 2 |
| `pnpm test:integration`                               | Pass                           | 43 tests: API/PGlite 29 and database migration/PGlite 14                                                               |
| `pnpm --filter @gdm/database test:integration`        | Pass                           | 14 tests after final cross-tenant Team Manager assertion                                                               |
| `pnpm --filter @gdm/api test:integration`             | Pass                           | 29 tests after final self-reporting assertion                                                                          |
| `pnpm db:check`                                       | Pass                           | All 12 journaled migrations/snapshots validate                                                                         |
| `pnpm --filter @gdm/mobile exec expo install --check` | Pass                           | Dependencies are up to date; configured React exclusions reported                                                      |
| `pnpm build`                                          | Pass                           | 8/8 tasks; Nest API, Next web (13 routes), Android 4.7 MB, iOS 4.5 MB and shared packages                              |
| `pnpm build:web:cloudflare`                           | Environment failure            | Next compile/type/page generation passed; OpenNext 1.20.2 bundle symlink failed with Windows `EPERM`                   |
| Linux container availability check                    | Unavailable                    | `podman` and `docker` are absent; WSL has no installed distribution, so no Linux rerun was possible                    |
| `pnpm db:migrate`                                     | Pass on development PostgreSQL | Applied real pending migrations `0001` through `0011` after existing canonical `0000`; journal now has 12 rows         |
| `pnpm db:seed`                                        | Pass on development PostgreSQL | Seeded 13 `.test` users across two tenants after resolving migration-created role/permission IDs by code               |

## Database and environment changes

- `0009_mean_domino.sql`: Phase 2 hierarchy schema and deterministic compatibility Department
  backfill before `teams.department_id NOT NULL`.
- `0010_phase2_organization_backfill.sql`: TEAM_MANAGER/permission mappings, role/job-title mapping,
  department scopes and team-membership compatibility rows.
- `0011_yielding_barracuda.sql`: preflight checks plus queue branch/team and previous-assignee tenant
  integrity.
- New backend-only Phase 3 variables: `LEAD_PHONE_LOOKUP_PEPPER` and optional
  `LEAD_PUBLIC_RATE_LIMIT_WINDOW_SECONDS`. Phase 2 introduced no environment variable.

## Final gate

`READY TO BEGIN PHASE 4`

The confirmed disposable development PostgreSQL database ran the complete canonical chain and
controlled two-tenant fixtures. Linux Cloudflare packaging, PRD page-image rendering, provider
credentials and device/compliance validation remain release-only items. Phase 4 itself may begin
with its required development adapter and `tel:` fallback without a live provider credential; its
prompt already defines the provider-neutral, authoritative-webhook and consent/recording boundaries.
No Phase 4 code was implemented.
