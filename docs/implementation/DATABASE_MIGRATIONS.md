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

## Phase 4 telephony migration

`0012_phase4_telephony.sql` is a forward-only Phase 4 migration. It first changes the legacy
`permissions.code` storage from PostgreSQL enum to `varchar(100)`, then creates telephony enums and
tenant-owned provider-connection, call, participant, event, recording, outcome, supervisor-exception
and reconciliation tables. It adds the new telephony permissions/mappings, composite tenant foreign
keys, provider event/call uniqueness, useful scoped indexes and a check that prevents a completed
call from being left `NOT_REQUIRED`.

The varchar conversion is intentional: PostgreSQL rejects use of a newly added enum value inside the
same migration transaction. The TypeScript permission union remains the application-level type. Do
not revert the column to an enum as part of a down script.

Before staging/production execution, take a recovery-point backup and run one migration worker before
API rollout. The migration was checked by Drizzle, applied in the canonical PGlite chain and applied
on the confirmed disposable development PostgreSQL database before a successful seed. Once call/event
or recording-reference history exists, rollback means restoring the recovery point or shipping a
reviewed compensating migration; never delete the history to make a down migration succeed.

## Phase 4 manual recording amendment

`0013_adorable_havok.sql` is the forward-only amendment to Phase 4. It adds
`MANUAL_UPLOAD` to the call-origin enum, a `telephony_recording_source` enum, and source,
filename, MIME type, byte length, checksum, uploader and notes columns to `call_recordings`. It adds
composite tenant membership/user foreign keys, checks that a manual upload has its required
provenance metadata and that a byte length is non-negative, then seeds the
`telephony.recordings.upload` permission and its approved role mappings.

Existing recordings receive the non-null `PROVIDER` default and existing provider references are not
rewritten. No audio binary is stored in PostgreSQL. The application only marks an upload available
after private object-storage metadata matches the requested content type/length and active consent;
the database retains the auditable reference, not the object contents.

Before a shared/staging/production run, take a recovery-point backup and apply the complete journal
once with `pnpm db:migrate`. Do not edit the migration after it has been applied. If a deployed change
needs correction, ship a reviewed forward migration or restore the recovery point; never delete
call/recording/audit data or edit Drizzle migration metadata. PGlite migration integration validation
covers the complete chain and the manual metadata constraints.

## Phase 5 messaging migrations

`0014_bouncy_pete_wisdom.sql` is the forward-only Phase 5 foundation. It creates tenant-owned
messaging connections, templates, conversations, participants, messages, media, append-only status
and assignment history, outbound outbox, opt-in and suppression tables. It also seeds the Phase 5
permissions and role mappings. Composite tenant foreign keys, provider/idempotency uniqueness,
active-conversation uniqueness and ordering indexes prevent cross-tenant references and duplicate
durable records.

`0015_slimy_lenny_balinger.sql` strengthens the generated foundation with tenant-aware queue, Team,
membership and actor foreign keys. `0016_steady_may_parker.sql` adds the canonical request
fingerprint used to reject conflicting reuse of an outbound idempotency key.

Before a shared, staging or production execution, take a recovery-point backup and apply the journal
once with `pnpm db:migrate`. Verify existing Branch, queue, Team, membership and user references
before rollout. These migrations contain messaging, consent and audit evidence; rollback means
restoring the pre-migration recovery point or shipping a reviewed forward compensating migration.
Do not delete conversation/message history or edit an already-applied migration.

## Phase 7 inventory migrations

`0021_free_lightspeed.sql` creates the tenant-owned catalogue, physical units, reservation,
allocation, transfer/event, status-history and idempotency-receipt tables. It adds nullable canonical
unit links to the existing Phase 6 test-ride job/booking rows while preserving their original demo
reference snapshots. Partial unique indexes enforce one active reservation/allocation per physical
unit and one active unit per booking reference. Database triggers make transfer/status history
append-only, allow only one terminal transfer event and reject unsafe unit-state transitions,
including every ordinary transition out of `DELIVERED`.

`0022_bitter_preak.sql` performs an explicit initial-link branch-consistency preflight and briefly
strengthens those nullable links to the initial tenant/branch/unit tuple. `0023_fast_vivisector.sql`
then restores the durable foreign key to tenant/unit because a physical unit may transfer branches
after a historical ride. The ride and demo-booking branch columns remain immutable point-in-time
snapshots; the canonical unit ID and original demo reference are preserved. This sequence never
guesses a mapping, rewrites an ID or changes ride/event history.

Apply all three forward-only migrations before enabling the Inventory module. Rollback means
restoring the reviewed pre-Phase-7 recovery point or shipping a forward compensating migration that
retains stock, ride, allocation, transfer, audit and outbox evidence; do not delete inventory history
or edit Drizzle metadata.

## Post-Phase-5 architecture amendment

**DATABASE MIGRATION: NONE.** The 2026-08-08 Unified Inbox/client-state amendment changes provider
boundaries, backend validation, retry/status behavior, UI-state ownership and documentation only.
It does not alter the Phase 5 table shape or the canonical journal through
`0016_steady_may_parker.sql`. The existing generic channel enum remains a dormant extension boundary;
it does not activate SMS, email, Instagram Direct or Facebook Messenger.

## Phase 8 commercial migrations

`0024_brave_white_queen.sql` creates the Phase 8 commercial domain: tenant commercial settings,
quotation projections plus immutable versions/components, discount approvals, booking snapshots,
append-only payment/reversal and verification evidence, finance and exchange event histories,
insurance, invoices, private document versions/verification/download events, readiness evaluations
and idempotency receipts. It installs 18 permissions with least-privilege role mappings. Composite
tenant and actor foreign keys prevent cross-tenant linkage. Database triggers reject mutation or
deletion of payment, quote version/component, booking item, invoice, finance/exchange event,
document-event and readiness history.

The same migration adds nullable `inventory_allocations.booking_id`. Its compatibility update links
only an exact tenant plus booking-reference match and leaves unmatched legacy references nullable;
it never invents a booking or rewrites an allocation ID. New allocations validate the canonical
confirmed booking when `BOOKING_BILLING` is enabled. Payment proof references use a tenant-aware
foreign key to a private commercial document version.

`0025_aberrant_shen.sql` adds the explicit nullable finance disbursement timestamp so Approved and
Disbursed remain separate operational milestones. `0026_goofy_changeling.sql` adds a unique index on
tenant, quotation and quotation version, preventing duplicate bookings from the same accepted offer.

Apply all three forward-only migrations together before enabling `BOOKING_BILLING`. Take a
recoverable backup first and verify there are no duplicate tenant/quotation/version booking rows
before applying `0026` if any pre-release Phase 8 database was used. The complete 27-entry journal
passes Drizzle check and 18 zero-to-latest PGlite integrity tests. No shared database was mutated in
the Phase 8 local checkpoint. Once payment, booking or document evidence exists, rollback means
restoring the pre-Phase-8 recovery point or a reviewed forward compensation; never delete immutable
commercial/audit history or edit an already-applied migration.
