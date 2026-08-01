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
2. Ensure `.env` contains a syntactically valid `DATABASE_URL`.
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

The runner uses the standard PostgreSQL URL supplied by Supabase or local Compose and records
applied hashes in `drizzle.__drizzle_migrations`. Production deployment must run one migration job
before rolling out API instances; application replicas must not race to mutate the schema on
startup.

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
