# Database Migration Workflow

## Phase 0 schema

The initial Drizzle migration creates only these platform structures:

- `outbox_events` for transactionally recorded asynchronous intent, retries and dead-letter state;
- `webhook_events` for tenant/provider idempotency, verified receipt, normalized processing state
  and raw-payload expiry;
- `audit_events` for immutable platform/client audit evidence;
- Drizzle's `drizzle.__drizzle_migrations` metadata table when migrations are applied.

No user, membership, contact, lead, inventory, booking or other dealership table exists in this
phase. Application settings were not created because no Phase 0 runtime setting requires durable
storage.

## Create a migration

1. Change `packages/database/src/schema` only for an approved phase requirement.
2. Ensure `.env` contains a syntactically valid `DIRECT_DATABASE_URL` for migration/DDL access.
   Database commands fall back to `DATABASE_URL` when a separate direct URL is not supplied.
3. Generate SQL and metadata from the root:

   ```bash
   pnpm db:generate
   ```

4. Review the SQL, indexes, checks, defaults, tenant keys and generated snapshot. Add narrowly
   scoped custom SQL only when Drizzle cannot express a required database control, such as the
   audit immutability trigger.
5. Validate the migration history and run tests:

   ```bash
   pnpm db:check
   pnpm --filter @gdm/database test
   pnpm --filter @gdm/database test:integration
   ```

6. Update all four implementation tracking documents before merging the phase.

Never run `drizzle-kit push` against a shared or production database. Schema changes flow through
reviewed migration files.

## Apply migrations

```bash
pnpm db:migrate
```

The runner prefers `DIRECT_DATABASE_URL`, falls back to `DATABASE_URL`, and records applied hashes
in `drizzle.__drizzle_migrations`. Production deployment must run one migration job before rolling
out API instances; application replicas must not race to mutate the schema on startup.

## Supabase connection guidance

Use the Supabase connection string appropriate to the environment and network. The application
client disables server-side prepared statements so it remains compatible with transaction-pooler
connections. Migration jobs need a connection that permits DDL and should use a direct/session
connection where the selected Supabase plan and network permit it. Store the URL in the deployment
secret manager, never in the repository.

## Rollback considerations

Drizzle migrations are forward-only project artifacts. For a change not yet deployed, correct and
regenerate it. After deployment, create a reviewed compensating migration that preserves accepted
business/audit data. For a failed production migration, stop rollout and follow the database
restore runbook using the pre-deployment recovery point; do not manually delete rows or edit the
migration metadata table.

The Phase 0 migration is destructive to roll back because dropping `audit_events`,
`webhook_events`, or `outbox_events` removes evidence and pending work. In an empty local-only
database, a developer may recreate the named Compose volume explicitly after confirming no useful
data exists. That operation is deliberately not automated by a root script.

## Phase 2 recovery under Phase 3

Phase 2 was backfilled after the existing Phase 3 Lead migrations. The recovery is therefore
forward-only and deliberately preserves all Phase 3 table names, IDs and history.

Apply these journaled migrations in order:

1. `0009_mean_domino.sql` adds Departments, department scope, effective team membership, Team
   Manager history and reporting lines. It creates one `RECOVERY_DEFAULT` / `General` Department
   per existing Branch, maps every existing Team to it, aborts if any Team remains unmapped, then
   enforces `teams.department_id NOT NULL` and composite tenant/branch/department foreign keys.
2. `0010_phase2_organization_backfill.sql` installs `TEAM_MANAGER`, department/hierarchy
   permissions, safe role mappings, display job titles and compatibility department/team-membership
   rows derived only from explicit selected scopes.
3. `0011_yielding_barracuda.sql` preflights ambiguous queue branch/team and cross-tenant previous
   assignee data before adding the stronger Phase 3 composite foreign keys. It raises a descriptive
   exception instead of guessing or deleting inconsistent legacy rows.

Before staging execution, take a recoverable database backup. After execution, a Client Admin must
review/rename every compatibility Department and confirm inferred active team memberships. If
`0011` aborts, investigate and repair the identified invalid legacy relationship through an
approved, audited data correction, then retry the migration; do not weaken or remove its preflight.

### 2026-08-07 development PostgreSQL validation

The user-confirmed disposable development database had only canonical migration `0000` and its
three platform tables before validation; it was not `db push`-synchronized. `pnpm db:migrate` then
applied the real pending chain through `0011`, leaving all 12 journal entries present. `pnpm db:seed`
successfully created two development tenants and 13 `.test` users. Direct integrity queries found
zero invalid Team/Department, team-membership, Team Manager, reporting-line or queue-Team links;
transactional invalid cross-tenant membership/manager/department-Team and self-reporting inserts
were rejected. This is valid test evidence, not authorization to run production migrations.

There is no approved destructive down migration once organization or Lead history exists. Rollback
means stopping deployment and restoring the pre-migration recovery point, or shipping a reviewed
forward compensating migration that preserves historical evidence.
