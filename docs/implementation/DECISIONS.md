# Architecture Decisions

## ADR-0044 - Test Ride inventory links preserve the ride snapshot across stock transfers

- **Date:** 2026-08-09
- **Decision:** Add nullable canonical `inventory_unit_id` links to Phase 6 jobs/bookings by exact
  tenant, branch and legacy demo reference when the physical unit is created. Preserve the original
  demo reference and ride branch as point-in-time evidence. The durable foreign key is tenant/unit,
  not current branch/unit, so a later authorized stock transfer changes only the unit's current
  branch and never rewrites historical ride records.
- **Reason:** Requiring the unit's current branch to equal every historical ride branch would make a
  legitimate transfer fail after the unit had served a ride. Tenant/unit integrity prevents
  cross-tenant linkage while the existing ride branch preserves historical attribution.
- **Alternatives considered:** Rewriting ride branches on transfer, dropping the canonical link,
  guessing ambiguous legacy references and retaining a tenant/branch/unit FK were rejected because
  they either corrupt history or prevent valid physical movement.
- **Status:** Accepted; migrations `0022`-`0023` and a transfer regression test pass.
- **Affected modules:** Test Ride and Inventory schemas/services, migrations `0021`-`0023`, Phase 7
  integration tests and migration documentation.

## ADR-0043 - Inventory commands combine row locks, versions, unique indexes and receipts

- **Date:** 2026-08-09
- **Decision:** Serialize reservation, allocation, reallocation and transfer commands on the
  physical-unit row, require the expected version and idempotency key, and retain a PostgreSQL
  request fingerprint/response receipt. Partial unique indexes independently prohibit more than one
  active reservation or allocation per unit and more than one active allocation per booking
  reference. Status/transfer history is append-only and meaningful changes emit audit/outbox
  evidence in the same transaction.
- **Reason:** Client checks alone cannot prevent simultaneous VIN allocation or safe offline/request
  replay. Layered database and service controls provide deterministic conflict handling without
  losing the first committed business result.
- **Alternatives considered:** In-memory locks, optimistic UI state, Redis-only locking and retrying
  with a new key were rejected because they fail across processes or can duplicate business state.
- **Status:** Accepted and covered by concurrent migrated-PGlite integration tests.
- **Affected modules:** Inventory contracts/schema/service, `inventory_command_receipts`, migrations
  and Phase 7 integration tests.

## ADR-0042 - Phase 7 owns physical stock, not commercial or Lead lifecycle state

- **Date:** 2026-08-09
- **Decision:** Make Inventory the canonical authority for catalogue, VIN/chassis/engine identity,
  branch location, reservation, allocation, demo designation, transfer and physical-unit status.
  Keep Phase 3 Lead status unchanged and keep payment/billing authority out of Inventory. Until
  Phase 8 creates canonical Booking/readiness records, allocation stores a tenant-owned opaque
  booking reference plus an explicit readiness assertion.
- **Reason:** Physical stock, customer sales lifecycle and financial verification have different
  permissions, correction rules and histories. Combining them would let inventory edits mutate
  customer/payment state and would prematurely implement Phase 8.
- **Alternatives considered:** Adding VIN states to Lead, allowing Billing to edit a unit, or creating
  partial Phase 8 booking/payment tables were rejected as unsafe scope expansion.
- **Status:** Accepted.
- **Affected modules:** Inventory schema/API/web, Lead lifecycle, Test Ride canonical-unit link,
  permission mappings and Phase 8 handoff.

## ADR-0041 - Location samples must match the exact tracking-session identity

- **Date:** 2026-08-09
- **Decision:** Enforce a composite database relationship from each location sample's tenant,
  session, test-ride job and executive user to the same four fields on its active-location session.
  Before adding the constraint, migration `0020_windy_magus.sql` explicitly detects inconsistent
  existing tuples and aborts; it never guesses a correction, changes an ID or rewrites history.
- **Reason:** Separate tenant-scoped foreign keys prevented cross-tenant rows but could not prevent a
  same-tenant sample from being associated with the wrong ride or executive through direct or faulty
  writes. The API already writes a consistent tuple, so the database should preserve that invariant.
- **Alternatives considered:** Trusting service code alone, deleting ambiguous samples, or silently
  remapping them to the session's job were rejected because location evidence requires fail-closed,
  history-preserving migration behavior.
- **Status:** Accepted; the complete 21-migration chain and direct invalid/valid tuple tests pass.
- **Affected modules:** `packages/database/src/schema/test-rides.ts`, migration `0020_windy_magus.sql`
  and the database migration integration suite.

## ADR-0040 - Offline test-ride completion replays through one server receipt

- **Date:** 2026-08-08
- **Decision:** Keep test-ride jobs and lifecycle server-authoritative. Mobile may retain only
  temporary tenant-bound location samples and allowed terminal commands in SQLite. Replay location
  samples before the terminal command, reuse one stable idempotency key for every command attempt,
  and atomically persist the request fingerprint, response snapshot, lifecycle change, audit and
  outbox evidence in PostgreSQL. Conflicting key reuse fails closed.
- **Reason:** An offline executive must be able to stop local tracking and record completion without
  duplicate completion, lost evidence or a client-authored final state when connectivity returns.
- **Alternatives considered:** Persisting the whole ride in Zustand, generating a new key per retry,
  replaying completion before queued locations and treating HTTP timeout as success were rejected.
- **Status:** Accepted and covered by mobile replay plus migrated-PGlite service integration tests.
- **Affected modules:** mobile SQLite/outbox and test-ride screens, `test_ride_command_receipts`,
  TestRidesService terminal commands and Phase 6 integration tests.

## ADR-0039 - Active location is an explicit ride session, not employee tracking

- **Date:** 2026-08-08
- **Decision:** Create a server location session only when the exact assigned executive explicitly
  starts an `EXECUTIVE_ASSIGNED` ride after disclosure and checklist/optional OTP validation. Accept
  samples only while that tenant/job/user session is ACTIVE and unexpired. Stop it transactionally on
  complete/cancel/no-show/manual stop, locally on auth/context teardown or permission failure, and by
  configured timeout. Android uses a location-type foreground service and ongoing notification with
  foreground/while-in-use permission; background-location permission remains prohibited.
- **Reason:** Managers need current active-job visibility, not employee history. Server ownership,
  timestamp/accuracy/stale projection, bounded retention and explicit stop boundaries enforce the
  privacy requirement even when a client is stale or unauthorized.
- **Alternatives considered:** Always-on background tracking, manager-started tracking, a persisted
  Zustand coordinate store and accepting samples based only on a client status were rejected.
- **Status:** Accepted; signed physical-device behavior remains external release evidence.
- **Affected modules:** Phase 6 contracts/config/schema/API, Android/Expo configuration, mobile
  location task, auth reset boundaries, web active monitor and migrations `0017`-`0018`.

## ADR-0038 - Zustand is the canonical shared transient client workflow layer

- **Date:** 2026-08-08
- **Decision:** Use separate feature-scoped Zustand stores in Next.js and Expo when transient
  UI/workflow state is shared across components. Keep PostgreSQL/API/TanStack Query authoritative for
  server data, route/search parameters authoritative for deep-linkable state, React state for
  component-local concerns, SecureStore/auth architecture for credentials and SQLite for the durable
  mobile outbox. Stores are non-persistent by default and reset on logout, account/membership/tenant
  change, support-context change and terminal session loss.
- **Reason:** This supplies one predictable client-state rule without duplicating customer records,
  leaking mutable Next.js state between requests or weakening offline/idempotency boundaries.
- **Alternatives considered:** A giant persisted application store, one shared mutable web/mobile
  store and moving every `useState` or query result into Zustand were rejected.
- **Status:** Accepted and covered by web/mobile all-store reset and stale-context replacement tests.
  The 2026-08-09 audit added the mobile foundation store to the same reset boundary. Database
  migration: none.
- **Affected modules:** `DESIGN.md`, web/mobile authentication boundaries and Phase 5 inbox UI stores;
  Phase 6-14 prompts.

## ADR-0037 - Unified Inbox is channel-agnostic while Phase 5 activates official WhatsApp only

- **Date:** 2026-08-08
- **Decision:** Keep Conversation, Message, canonical Contact/Lead context, Conversation Owner,
  authorization and inbox UI channel-neutral. Phase 5 activates only official WhatsApp Business
  Platform messaging. Meta WABA/phone identity, signature/payload verification, approved-template and
  service-window rules stay at the WhatsApp/provider boundary. Instagram/Facebook remain Phase 13
  candidates; SMS/email and other approved channels remain future adapters to the same inbox.
- **Reason:** The final post-Phase-5 amendment supersedes older coarse PRD/client mapping that placed
  SMS/email adapters in Phase 5. One canonical inbox prevents duplicate customer models and false
  implementation claims while preserving a safe adapter seam.
- **Alternatives considered:** Disconnected per-channel inbox products, premature future adapters and
  personal WhatsApp QR/Web automation were rejected.
- **Status:** Accepted. Live Meta activation remains external and fail-closed.
- **Affected modules:** Messaging contracts/schema/provider/service, web/mobile Unified Inbox,
  `DESIGN.md`, traceability documents and Phase 5/13/14/99 prompts.

## ADR-0032 - Telephony permission codes use a typed varchar, not a mutable PostgreSQL enum

- **Date:** 2026-08-07
- **Decision:** Keep the TypeScript permission-code union authoritative, but store
  `permissions.code` as `varchar(100)` with its existing unique constraint. Migration `0012` changes
  the legacy enum-backed column before adding Phase 4 permission records.
- **Reason:** PostgreSQL does not safely allow a newly added enum value to be used by an insert in the
  same migration transaction. Real disposable-PostgreSQL validation exposed this issue before the
  migration was accepted. A typed varchar preserves stable codes while keeping permission migrations
  atomic and forward-compatible.
- **Alternatives considered:** Splitting the enum change and permission inserts into a second
  migration, using an unsafe transaction boundary, or hand-editing applied migration metadata were
  rejected.
- **Status:** Accepted and validated on migrated PGlite and disposable PostgreSQL.
- **Affected modules:** `packages/database/src/schema/authorization.ts`,
  `0012_phase4_telephony.sql`, authorization contracts and seed.

## ADR-0031 - Telephony is provider-authoritative, tenant-scoped and recording fail-closed

- **Date:** 2026-08-07
- **Decision:** Phase 4 uses one `TelephonyProvider` port and a development-only HMAC adapter.
  Authoritative provider events flow through durable generic webhook receipt plus an idempotent call
  event. Calls attach to existing Lead/Contact IDs and use existing assignment scope. A completed call
  requires an outcome unless a supervisor records an exception. Recording URLs are issued only after
  scope, active consent, availability and retention checks, and use existing private object storage.
- **Reason:** This preserves Phase 2 membership/team authorization and Phase 3 canonical customer and
  activity models while making retries/reconciliation deterministic. It prevents an unapproved vendor,
  unsafe Android recording or a generic manager/customer duplicate model from entering scope.
- **Alternatives considered:** Client-authoritative post-call state, public recording links,
  provider-specific domain tables, and treating `tel:` as a reliable duration/recording source were
  rejected.
- **Status:** Accepted for Phase 4. A real provider remains disabled pending credentials,
  documentation and compliance approval.
- **Affected modules:** `apps/api/src/telephony`, `packages/contracts/src/telephony`,
  `packages/database/src/schema/telephony.ts`, web/mobile telephony surfaces and migration `0012`.

## ADR-0028 — Phase 3 assignment consumes canonical Phase 2 team relationships

- **Date:** 2026-08-07
- **Decision:** A team-bound Lead queue accepts an assignee only when the user and membership are
  active, branch and department scope cover the queue, and an active effective-dated Phase 2 team
  membership exists. Team Manager Lead visibility is derived from active
  `team_manager_assignments`; no manager column is added to Lead records. Follow-up commands use the
  same durable idempotency-receipt pattern as other mobile replay commands.
- **Reason:** Authorization scope is permission to access a team, not proof that the employee is an
  actual team member. Reusing the canonical hierarchy removes the temporary Phase 3 assumption and
  prevents Team Managers from inheriting whole-branch visibility.
- **Alternatives considered:** Continuing to infer membership from `membership_team_scopes` and
  storing manager IDs on Leads were rejected as duplicate organization models.
- **Status:** Accepted
- **Affected modules:** Phase 2 hierarchy/authentication store, `apps/api/src/leads`, Lead web/mobile
  clients, migrations `0010`–`0011`

## ADR-0027 — Recovery migrations are additive and preserve Phase 3 identifiers/history

- **Date:** 2026-08-07
- **Decision:** Add migrations `0009`–`0011` after the existing Phase 3 migrations. Backfill one
  `RECOVERY_DEFAULT` department per existing branch before requiring `teams.department_id`, seed
  effective team membership from explicit selected team scopes, and fail with descriptive
  preflight errors for ambiguous branch/team queue or cross-tenant assignment history.
- **Reason:** Phase 2 was recovered after Phase 3. Rewriting/renumbering Phase 3 migrations or
  recreating Lead data would risk IDs, history and audit evidence.
- **Alternatives considered:** Dropping/recreating organization or Lead tables and guessing
  inconsistent mappings were rejected. Compatibility departments and inferred memberships are
  explicitly reviewable after migration.
- **Status:** Accepted; compatibility labels/membership must be reviewed in staging
- **Affected modules:** `packages/database/migrations/0009_*`, `0010_*`, `0011_*`, seed and migration
  integration tests

## ADR-0026 — Canonical organization hierarchy uses effective-dated relationships

- **Date:** 2026-08-07
- **Decision:** Phase 2 owns Department, Team membership, Team Manager assignment and reporting-line
  history. Relationships carry tenant/branch/department/team foreign keys, reason, actor and
  start/end timestamps. Reporting commands reject self-reporting, cycles and actor scope violations.
- **Reason:** Client hierarchies vary and cannot be represented safely by one manager field or
  hard-coded title chain. Effective-dated rows retain attribution and audit history.
- **Alternatives considered:** A `manager_id` column on Team/User/Lead and a mandatory fixed
  Business Owner → GM → Showroom Manager → Team Manager tree were rejected.
- **Status:** Accepted
- **Affected modules:** organization/authorization schemas, administration contracts/API/web,
  authentication context and tests

## ADR-0025 — Stable role profiles are combined with job title and organization scope

- **Date:** 2026-08-07
- **Decision:** Preserve existing internal role codes and append `TEAM_MANAGER`. Map CRM Admin to
  `CLIENT_ADMIN`, Sales Consultant to `SALESPERSON`, and management/client wording through job title,
  department/team placement, permissions and scope. CRM Admin remains tenant-only and distinct from
  `AGENCY_ADMIN`.
- **Reason:** Renaming or multiplying role enums would break guards, sessions and migrations while
  providing less configurability for dealership-specific structures.
- **Alternatives considered:** One hard-coded role for every client title was rejected. Fully custom
  role profiles remain later scope; this phase reuses the canonical permission engine.
- **Status:** Accepted
- **Affected modules:** contracts, authorization schema/policy, seed, administration UI/API, PRD and
  phase prompts

## ADR-0024 — SLA uses durable business-time deadlines and idempotent database claiming

- **Date:** 2026-08-07
- **Decision:** Persist each first-action SLA start, warning and deadline using the branch timezone
  and seven-day working-hours calendar. Reconcile every minute from the API and through an
  authorized manual endpoint; compare-and-update the timer's prior state before emitting one
  escalation/outbox event.
- **Reason:** Deadlines must survive Redis loss and process restarts, behave deterministically
  outside working hours, and remain safe when more than one API instance runs the monitor.
- **Alternatives considered:** In-memory timers and Redis-only delayed jobs were rejected because
  neither is the business-data source of truth. A hardcoded commercial threshold was rejected;
  minutes and warning are versioned tenant settings with database defaults.
- **Status:** Accepted
- **Affected modules:** `apps/api/src/leads`, `packages/database/src/schema/leads.ts`

## ADR-0023 — Lead commands are optimistic, append-only and outbox-atomic

- **Date:** 2026-08-07
- **Decision:** Lifecycle, reassignment and sensitive work-item commands validate expected lead
  version and write current state, append-only history/outcome/assignment evidence, immutable audit
  and outbox records in one PostgreSQL transaction. Invalid transitions fail before all writes.
- **Reason:** Mobile replay and concurrent staff work must expose conflicts instead of silently
  overwriting workflow or attribution history.
- **Status:** Accepted
- **Affected modules:** `apps/api/src/leads`, `packages/contracts/src/leads`, Phase 3 tests

## ADR-0022 — Tenant-scoped contact candidates never trigger destructive automatic merge

- **Date:** 2026-08-07
- **Decision:** Normalize Indian phones to E.164 and HMAC them with tenant ID and a backend pepper.
  Exact phone matches reuse the contact while creating a legitimate repeat opportunity; email-only
  matches create a duplicate candidate. Review may link one contact to a canonical contact or keep
  both, but never moves/deletes history automatically or searches across tenants.
- **Reason:** Repeat vehicle enquiries are valid opportunities and a global phone merge would leak
  tenant/customer information or destroy attribution.
- **Alternatives considered:** Global uniqueness and silent destructive merging were rejected.
- **Status:** Accepted
- **Affected modules:** `packages/database/src/schema/leads.ts`, `apps/api/src/leads`

## ADR-0021 — Lead access uses live membership scope plus current-process assignment

- **Date:** 2026-08-07
- **Decision:** Derive tenant only from `AuthorizationContext`; apply branch/team scope and the live
  assignment policy in repositories/services. A Salesperson is restricted specifically to
  `current_process_owner_id`, while relationship and conversation owners remain separate fields.
  Protected lead routes also require the active tenant's `LEADS` module flag.
- **Reason:** The Phase 3 acceptance criterion is assigned-only salesperson visibility, and a
  historic relationship owner must not retain operational access after reassignment.
- **Status:** Accepted
- **Affected modules:** authorization guard/module access service, lead service, role permissions

## ADR-0020 — Administration updates return and audit resolved scope state

- **Date:** 2026-08-07
- **Decision:** Resolve membership role, branch scope and team scope inside the same transaction as
  an administrative change; return the resolved values and store explicit old/new scope modes and
  IDs in the audit event. Dealership-profile writes and their audit event are one transaction.
- **Reason:** The Phase 2 audit found a hardcoded `CLIENT_ADMIN` response with empty scopes and a
  profile write that could commit without its audit record. Both outcomes violate accurate access
  administration and immutable audit expectations.
- **Alternatives considered:** Returning only an acknowledgement or relying on a later client
  refetch was rejected because it hides an incorrect command result and does not repair audit
  integrity.
- **Status:** Accepted
- **Affected modules:** `apps/api/src/administration`, `packages/contracts`, Phase 2 PGlite tests

## ADR-0019 — Administrative configuration is tenant-owned and auditable

- **Date:** 2026-08-03
- **Decision:** Store module flags, integration readiness placeholders, lead-assignment/retention
  settings, agency defaults and branch working hours in tenant-aware administrative tables; record
  every sensitive administration command in the immutable platform audit stream.
- **Reason:** Phase 2 needs configuration without hard-coded commercial or privacy decisions and
  must preserve historical ownership/references.
- **Status:** Accepted
- **Affected modules:** `packages/database`, `packages/contracts`, `apps/api/src/administration`,
  `apps/web/src/features/administration`

## ADR-0001 — Workspace and application boundaries

- **Date:** 2026-08-01
- **Decision:** Use one private pnpm 11 workspace orchestrated by Turborepo, with `apps/web`,
  `apps/api`, `apps/mobile` and focused shared packages under `packages`.
- **Reason:** This is the permanent repository architecture in `AGENTS.md` and preserves one
  lockfile and reusable contracts without creating microservices.
- **Alternatives considered:** Standalone projects and per-application lockfiles were rejected
  because they violate the repository contract.
- **Status:** Accepted
- **Affected modules:** Repository root, all applications and packages

## ADR-0002 — Toolchain compatibility baseline

- **Date:** 2026-08-01
- **Decision:** Use Node.js 24 LTS for CI/containers, pnpm 11.18.0, and TypeScript 6.0.3.
- **Reason:** TypeScript 7.0.2 was the registry `latest` tag during implementation, but the current
  `typescript-eslint` 8.65.0 peer range is `<6.1.0`. TypeScript 6.0.3 is the newest compatible
  stable compiler and keeps strict lint/type-check support. pnpm 11.18.0 is the current stable
  package-manager release and supports the Node 24 baseline. Node 26 remains allowed for local
  compatibility checks but is not the production baseline.
- **Alternatives considered:** TypeScript 7 was rejected until the lint ecosystem declares
  compatibility; TypeScript 5 was older than required.
- **Status:** Accepted; revisit through a dedicated dependency upgrade
- **Affected modules:** Root tooling, all TypeScript projects, CI and API Docker image

## ADR-0003 — Cross-platform tokens with web-only UI code

- **Date:** 2026-08-01
- **Decision:** Keep semantic values in `@gdm/design-tokens`, project-owned shadcn/Base UI web
  components in `@gdm/ui`, and project-owned NativeWind primitives inside the mobile app.
- **Reason:** Web and native can share colour, typography, radius, spacing, shadows and statuses,
  but React DOM components cannot run in React Native.
- **Alternatives considered:** A universal component kit and a second full UI framework were
  rejected by the PRD and platform constraints.
- **Status:** Accepted
- **Affected modules:** `packages/design-tokens`, `packages/ui`, `apps/web`, `apps/mobile`

## ADR-0004 — Phase 0 persistence scope and tenant markers

- **Date:** 2026-08-01
- **Decision:** Create only outbox, webhook-event and immutable audit-event base tables. Outbox and
  audit rows carry a checked `PLATFORM`/`CLIENT` scope; client scope requires
  `client_organization_id`. Webhook rows are always client-owned and require that identifier.
- **Reason:** The phase requires reliable platform primitives but explicitly forbids premature
  dealership/user schemas. Scope checks preserve the tenant invariant before Phase 1 creates the
  client organization table and composite foreign keys.
- **Alternatives considered:** Creating client/user tables now was out of scope. A nullable tenant
  identifier without a scope check was rejected as ambiguous and unsafe.
- **Status:** Accepted
- **Affected modules:** `packages/database`

## ADR-0005 — Portable managed-service adapters

- **Date:** 2026-08-01
- **Decision:** Use standard PostgreSQL/Drizzle, Redis/BullMQ, and AWS SDK S3 interfaces. Local
  development uses PostgreSQL, Redis and MinIO; hosted configuration targets Supabase, Upstash and
  Tigris.
- **Reason:** Provider-neutral seams satisfy the initial stack while retaining the PRD migration
  path to AWS and preventing credentials from reaching clients.
- **Alternatives considered:** Provider-specific domain APIs and public object URLs were rejected
  for portability and security.
- **Status:** Accepted
- **Affected modules:** `packages/database`, `apps/api`, `infrastructure/local`

## ADR-0006 — Readiness is dependency-aware; liveness is process-only

- **Date:** 2026-08-01
- **Decision:** Liveness does not call dependencies. Readiness probes PostgreSQL and Redis
  independently and returns a non-success status when either is unavailable.
- **Reason:** Orchestrators must distinguish a dead process from an instance that should not
  receive traffic, and the acceptance criteria require accurate dependency state.
- **Alternatives considered:** A static always-healthy response was rejected as misleading.
- **Status:** Accepted
- **Affected modules:** `apps/api`, `@gdm/contracts`

## ADR-0007 — Phase boundary for authentication and domain modules

- **Date:** 2026-08-01
- **Decision:** Phase 0 exposes public, non-sensitive health/OpenAPI surfaces only and defers auth,
  tenancy, users, files and every dealership workflow to their explicit prompts.
- **Reason:** The active phase prompt overrides the broader phase summary in PRD section 26 and
  prohibits business workflow implementation.
- **Alternatives considered:** Scaffolding partial auth/tenant tables was rejected because it would
  invent Phase 1 decisions and leave insecure mock functionality.
- **Status:** Accepted
- **Affected modules:** All applications and database schema

## ADR-0008 — Dependency installation and lifecycle-script policy

- **Date:** 2026-08-01
- **Decision:** Retain pnpm 11's default package-release-age protection, pin direct dependencies
  to mature compatible releases when a just-published release is quarantined, explicitly allow or
  deny dependency lifecycle scripts with `allowBuilds`, and use the `copy` package importer on this
  workspace volume.
- **Reason:** The release-age check reduces exposure to newly published supply-chain attacks. An
  explicit lifecycle policy prevents silent native/install scripts. The workspace is on a mounted
  filesystem where relinking the hard-linked virtual store repeatedly stalled; copying packages
  produced deterministic frozen installs while preserving the single workspace store and
  lockfile.
- **Alternatives considered:** Disabling the release-age protection, implicitly trusting every
  lifecycle script, mixing package managers, and retaining a hard-link importer that did not
  complete reliably on this volume were rejected.
- **Status:** Accepted; review any `allowBuilds` change as a security-sensitive dependency change
- **Affected modules:** `pnpm-workspace.yaml`, `pnpm-lock.yaml`, CI and local installation

## ADR-0009 — Cloudflare presentation and Render application boundary

- **Date:** 2026-08-01
- **Decision:** Deploy `apps/web` as an OpenNext Cloudflare Worker and deploy the NestJS modular
  monolith to Render from `apps/api/Dockerfile`. Cloudflare renders the presentation client only;
  every API, authentication, authorization, webhook and workflow rule remains in NestJS.
- **Reason:** This is the requested Phase 0 topology and preserves one authoritative backend while
  allowing the Next.js application to run on Cloudflare Workers. `NEXT_PUBLIC_API_URL` is the only
  public cross-runtime connection and an actual deploy requires an explicit HTTPS `/v1` URL.
- **Alternatives considered:** Vercel-specific runtime APIs were rejected by the amendment. Moving
  server rules into Cloudflare or splitting the NestJS modular monolith was rejected because it
  would duplicate authority and prematurely create another backend.
- **Status:** Accepted
- **Affected modules:** `apps/web`, `apps/api/Dockerfile`, `render.yaml`, root scripts, CI

## ADR-0010 — Explicit BullMQ process modes

- **Date:** 2026-08-01
- **Decision:** Validate `WORKER_MODE` as `disabled`, `embedded` or `standalone`, default to
  `disabled`, expose the configured mode/location/local-worker count in health contracts, and
  require the dedicated `dist/worker.js` entry point to run only in standalone mode.
- **Reason:** Development and pilot environments can choose no processing or an in-process worker,
  while production can scale an independently supervised Render worker without changing queue or
  processor contracts. Explicit health state prevents an operator from mistaking an intentionally
  disabled consumer for active processing.
- **Alternatives considered:** Always embedding workers would couple HTTP scaling and job
  concurrency. Always requiring a second process would increase pilot cost. Automatically
  selecting a mode was rejected as operationally ambiguous.
- **Status:** Accepted
- **Affected modules:** `packages/config`, `packages/contracts`, `apps/api/src/background`,
  `apps/api/src/worker.ts`, API health and root worker scripts

## ADR-0011 — Managed-service URLs and connection behavior

- **Date:** 2026-08-01
- **Decision:** Use `DATABASE_URL` for the Supabase runtime, prefer `DIRECT_DATABASE_URL` for
  reviewed Drizzle DDL, use the Upstash native `rediss://` endpoint, map a complete `TIGRIS_*` set
  onto the provider-neutral S3 adapter, and retain `S3_*` as the Cloudflare R2/generic path. Reject
  mixed storage providers. API queue producers use finite Redis retries with the offline queue
  disabled; BullMQ workers use infinite retries/offline queue and close gracefully. Root client
  commands strip backend environment values, and Turborepo exposes server values only to the API
  development task.
- **Reason:** Runtime pooling, migration access and worker recovery have different operational
  requirements. Provider aliases make the requested hosted topology explicit without coupling
  storage code to Tigris or R2 SDKs.
- **Alternatives considered:** Using the Supabase service-role key in clients, the Upstash REST API
  for BullMQ, one Redis retry policy for every role, public object buckets and mixed Tigris/S3
  settings were rejected for security, correctness or incompatibility.
- **Status:** Accepted
- **Affected modules:** `packages/config`, `packages/database`, API Redis/storage adapters,
  `.env.example`, `render.yaml`, deployment documentation

## ADR-0012 — Hosted secrets stay outside the repository

- **Date:** 2026-08-02
- **Decision:** Keep real Supabase, Upstash, Tigris/R2 and Sentry values out of committed files
  and out of chat transcripts. Hosted backend secrets belong in Render service environment
  variables. Cloudflare receives only the public `NEXT_PUBLIC_API_URL`. Developers may create a
  private uncommitted `.env` from `.env.example` for local hosted-service testing.
- **Reason:** The Phase 0 deployment amendment intentionally separates public client configuration
  from backend-only credentials. Preserving that boundary prevents accidental service-role,
  database, Redis or object-storage secret exposure in client bundles, logs or repository history.
- **Alternatives considered:** Committing real keys to `.env.example`, placing backend secrets in
  Cloudflare Worker variables, or sending provider keys through chat were rejected as insecure.
- **Status:** Accepted
- **Affected modules:** `.env.example`, `render.yaml`, `apps/web/.dev.vars.example`, deployment
  documentation and operator setup

## ADR-0013 — One React version across the workspace, and a root `@babel/traverse`

- **Date:** 2026-08-02
- **Decision:** Pin `react`, `react-dom` and `react-test-renderer` in `apps/mobile` to 19.2.8 so the
  whole workspace resolves a single React, and add `@babel/traverse` 7.29.8 as a root
  devDependency.
- **Reason:** Phase 1 made `apps/mobile` depend on `@gdm/contracts` and `@gdm/config`. That forced
  Metro and jest-expo to transform files outside `apps/mobile`, which loads the
  `react-native-worklets` Babel plugin; that plugin requires `@babel/traverse` without declaring it,
  and pnpm's isolated `node_modules` cannot resolve an undeclared dependency, so both `pnpm test`
  and `pnpm build` failed for `@gdm/mobile`. Once transformation succeeded, a second defect
  surfaced: `apps/web` used React 19.2.8 while `apps/mobile` used 19.2.3, so two `react-native`
  instances existed and Jest resolved `Pressable` from the instance bound to the other React,
  producing intermittent "Invalid hook call" failures. React Native 0.86.2 declares
  `react: ^19.2.3`, so 19.2.8 is compatible.
- **Alternatives considered:** A pnpm `packageExtensions` entry adding `@babel/traverse` to
  `react-native-worklets` was tried first and rejected — it re-hashes the worklets package, which
  cascaded into a different `react-native` instance being linked and made the React duplication
  failure reproducible rather than intermittent. Downgrading `apps/web` to React 19.2.3 was
  rejected because Next.js 16 and `packages/ui` already target 19.2.8.
- **Status:** Accepted
- **Affected modules:** root `package.json`, `apps/mobile/package.json`, `pnpm-lock.yaml`,
  `@gdm/mobile` test and Android export builds

## ADR-0014 — The login response carries an explicit `AUTHENTICATED` status

- **Date:** 2026-08-02
- **Decision:** `AuthenticationService.login` returns `status: 'AUTHENTICATED'`, `LoginResult.payload`
  is typed as `LoginAuthenticatedResponse`, `presentGrant` returns `RefreshResponse`, and
  `LoginResponseDto` documents the `status` field in OpenAPI.
- **Reason:** `packages/contracts` models the login response as a discriminated union on `status`,
  but the API never emitted the discriminator. The response therefore failed the shared contract at
  runtime — both auth e2e tests failed with a Zod `invalid_value` on `status` — and
  `Omit<LoginResponse, 'requires_membership_selection'>` collapsed the union to `{ status }`, which
  made `apps/api` fail its own strict type-check in four places.
- **Alternatives considered:** Removing `status` from the contract union was rejected because the
  clients already narrow on it and the union is the intended shape for a future MFA challenge
  response. Casting inside the service was rejected because it would keep the runtime contract
  broken.
- **Status:** Accepted
- **Affected modules:** `apps/api/src/auth/authentication.service.ts`, `apps/api/src/auth/auth.dto.ts`,
  `apps/api/test/auth.e2e-spec.ts`, `apps/mobile/src/auth/auth-response.ts`, published OpenAPI

## ADR-0015 — Unwired MFA scaffolding is recorded, not silently retained as "done"

- **Date:** 2026-08-02
- **Decision:** Leave `TotpService`, `MfaSecretProtector` and the MFA contract schemas in place but
  record them as incomplete, out-of-scope surface owned by a later phase. Do not count them as
  Phase 1 functionality and do not extend them.
- **Reason:** Phase 1's prompt does not list MFA. The code is genuinely non-functional: neither
  service is registered in a Nest module, there is no MFA route, no MFA table or column, no
  `AUTH_MFA_ACTIVE_KEY_ID` in `packages/config` or `.env.example`, and neither client handles an
  `MFA_REQUIRED` response. Publishing MFA schemas in `packages/contracts` while the API cannot
  produce them is what broke the login contract typing (see ADR-0014).
- **Alternatives considered:** Deleting the services, tests and contract schemas during an audit was
  rejected as a scope decision for the owning phase rather than an audit fix. Wiring MFA up was
  rejected as implementing a future-phase feature.
- **Status:** Accepted, pending resolution by the owning phase
- **Affected modules:** `apps/api/src/auth/totp.service.ts`,
  `apps/api/src/auth/mfa-secret-protector.ts`, `packages/contracts/src/auth/contracts.ts`

## ADR-0016 — Google is a separately linked identity that enters the existing CRM session model

- **Date:** 2026-08-03
- **Decision:** Accept nonce-bound Google ID tokens, verified only by NestJS against the configured
  Web/server client ID, as an additional authentication method. Store Google's immutable subject
  and verified provider email on a separate `OAUTH`/`GOOGLE` identity. An invited user may activate
  only existing eligible memberships; an active local user must authenticate first and explicitly
  link the matching verified Google account. Unlinking is allowed only while another supported
  active login method remains.
- **Reason:** This preserves invitation-only tenancy and one authoritative CRM access/refresh
  session system while preventing untrusted profile fields, email-only account merging, public
  registration and provider sessions from bypassing backend authorization.
- **Alternatives considered:** Public Google registration, issuing Google tokens as CRM sessions,
  accepting platform client IDs as additional API audiences, and automatic email-based merging were
  rejected as incompatible with the security model. Authorization-code exchange was unnecessary
  because neither client needs Google APIs or offline Google access.
- **Status:** Accepted
- **Affected modules:** `apps/api/src/auth`, `packages/contracts/src/auth`,
  `packages/database/src/schema/authentication.ts`, migration `0003_mighty_wonder_man.sql`

## ADR-0017 — GIS on web and native Google sign-in with explicit EAS environments

- **Date:** 2026-08-03
- **Decision:** Render Google's official GIS button in the web popup flow and use
  `react-native-nitro-google-signin` in Expo development/native builds. Native sign-in requests the
  API's Web/server audience, Android registration is the fixed package plus signing SHA, and iOS
  derives its reversed callback scheme from its iOS client ID. `eas.json` binds development,
  preview and production profiles to separate EAS environments; every EAS native build fails when
  the Web ID is missing and iOS additionally fails when its iOS ID is missing.
- **Reason:** The selected native provider flow is Expo-compatible, avoids storing provider tokens
  or secrets, supports server nonce verification and makes development/production credential
  selection explicit without overloading `NODE_ENV`.
- **Alternatives considered:** Expo Go was rejected because the native module requires a
  development build. Browser auth sessions inside the native app and public client secrets were
  rejected. Separate package/bundle IDs were not introduced because simultaneous installation of
  multiple variants is not a requirement.
- **Status:** Accepted; live signed-device verification remains a release prerequisite
- **Affected modules:** `apps/web/src/features/auth`, `apps/mobile/app.config.ts`,
  `apps/mobile/eas.json`, `apps/mobile/src/auth`, environment and deployment documentation

## ADR-0018 — CI uses non-production public OAuth IDs for release packaging checks

- **Date:** 2026-08-03
- **Decision:** Supply syntactically valid, non-production Google OAuth client identifiers to the
  Ubuntu CI job so production-mode Next.js, mobile export and OpenNext configuration checks can run.
  Keep all Google client secrets absent. Continue to require real environment-specific identifiers,
  registered origins, Android signing SHAs and the iOS bundle registration for release validation.
- **Reason:** OAuth client IDs are public identifiers, while the fail-closed production schemas
  require them. Without explicit CI values, the Linux job exits during configuration validation and
  never proves the OpenNext or Docker packaging steps that this Windows host cannot execute.
- **Alternatives considered:** Disabling production validation in CI, committing real provider
  credentials, or weakening the hosted-environment schemas were rejected. None would provide a
  safe, reproducible packaging gate.
- **Status:** Accepted; the workflow definition is repository-tested, but a hosted Linux CI run is
  still external release evidence.
- **Affected modules:** `.github/workflows/ci.yml`,
  `apps/web/src/lib/cloudflare-deployment-config.test.ts`

## ADR-0029 — Phase 4 starts provider-neutral and does not authorize unsafe mobile recording

- **Date:** 2026-08-07
- **Decision:** Phase 4 may implement the `TelephonyProvider` interface, development adapter,
  generic authoritative webhook, reconciliation, `tel:` fallback and consent-aware private-recording
  access without selecting a live telephony provider or supplying its credentials. A real provider
  remains disabled until its webhook signing, tenant credential storage, consent/recording-retention,
  reconciliation and outage behaviour are approved. SIM/mobile recording through call-log, SMS,
  contacts, accessibility, hidden microphone capture or other restricted-permission workarounds is
  prohibited.
- **Reason:** The approved Phase 4 prompt deliberately separates testable provider-neutral domain
  work from external provider/compliance activation. This preserves Phase 2 hierarchy and Phase 3
  Lead/Contact/activity authority while avoiding invented vendor selection or unsafe Android scope.
- **Alternatives considered:** Blocking all Phase 4 development until production credentials exist
  would leave the required adapter and webhook controls untested. Selecting a vendor without client
  approval, or treating `tel:` as a recording/duration source, would create unsupported claims and
  compliance risk.
- **Status:** Accepted for development; real-provider activation remains a release prerequisite.
- **Affected modules:** `PROMPTS/04_TELEPHONY.md`, future `apps/api` telephony module, contracts,
  database migrations, web/mobile Phase 4 clients and deployment configuration.

## ADR-0030 — Development seed resolves migration-owned roles and permissions by stable code

- **Date:** 2026-08-07
- **Decision:** Seed roles and permissions by their unique business codes, capture the returned
  database IDs, and use those resolved IDs for later mapping and membership inserts.
- **Reason:** Migrations `0010` and `0008` create canonical records with database-generated IDs.
  An ID-only seed upsert collided on the unique code after a real migration chain, preventing the
  supported development seed from running.
- **Alternatives considered:** Rewriting migration-generated IDs, deleting migration-owned records,
  or manually altering migration history were rejected because they would damage accepted references
  or invalidate migration evidence.
- **Status:** Accepted and verified on disposable PostgreSQL.
- **Affected modules:** `packages/database/src/seed.ts`, development migration/seed workflow.

## ADR-0031 — Manual recording uploads use the canonical recording model and staged private storage

- **Date:** 2026-08-08
- **Decision:** Add `MANUAL_UPLOAD` as a recording source and call origin. An authorized user first
  selects an already scoped Phase 3 Lead/Contact and active recording-consent record; the API creates
  the canonical Call/Recording/Call Event/Outbox/Audit evidence and an atomic idempotency receipt,
  then returns a short-lived private S3-compatible PUT URL. Completion verifies object metadata
  against the requested MIME type, byte length and optional SHA-256 before the recording becomes
  available. Provider recordings and manual recordings use the same `call_recordings` table, access
  policy, retention fields and timeline.
- **Reason:** A manual business recording can be lawfully attached without introducing a parallel
  customer/call model or unsafe device capture. Keeping binary data outside PostgreSQL limits the
  database to auditable metadata and uses existing private object-storage controls.
- **Alternatives considered:** Storing audio in PostgreSQL, accepting a browser data URL, a standalone
  manual-recordings table, or SIM/mobile capture were rejected for storage, provenance, tenancy or
  Android/privacy reasons.
- **Status:** Accepted for Phase 4. Real-provider recordings remain provider/consent dependent; AI
  transcript/summary, custom customer-profile fields and voice-note features remain future scope.
- **Affected modules:** `packages/contracts/src/telephony`, `packages/database/src/schema/telephony.ts`,
  migration `0013_adorable_havok.sql`, `apps/api/src/telephony`, S3 storage adapter, Lead timeline
  and web telephony UI.

## ADR-0032 — Existing canonical Contact remains the Phase 4 customer profile boundary

- **Date:** 2026-08-08
- **Decision:** Do not add DOB, anniversary, arbitrary custom fields, duplicate customer records or
  manager records as part of the manual-recording amendment. Calls are linked through the existing
  canonical Contact and legitimate repeat Lead opportunities.
- **Reason:** The Phase 4 requirement is calling/recording; the requested profile fields need a
  product-wide custom-field, privacy, retention and UI policy. Adding them here would be a future
  Phase 13 customer-profile/configuration feature.
- **Status:** Accepted.
- **Affected modules:** Phase 3 Contact/Lead model; no Phase 4 schema expansion beyond recording
  provenance.

## ADR-0033 - Canonical design system governs current and future UI work

- **Date:** 2026-08-08
- **Decision:** `DESIGN.md` is the canonical UI source for the CRM. The current Phase 0-4 refresh
  centralizes the dark-navy shell, application canvas, semantic tokens and shared web primitives;
  it does not alter API, database, authorization or workflow contracts.
- **Reason:** The reviewed design archive contains useful cross-role patterns but also many future
  modules. A durable design contract prevents copied placeholder screens, arbitrary status colours
  and new component libraries while retaining functional Phase 0-4 boundaries.
- **Status:** Accepted. Visual-browser/device QA remains a separate host-fixture prerequisite.
- **Affected modules:** `DESIGN.md`, `@gdm/design-tokens`, `@gdm/ui`, web AppShell, Lead and
  Telephony workspaces; all Phase 5+ UI work.

## ADR-0034 — Official provider boundary and encrypted per-tenant WhatsApp credentials

- **Date:** 2026-08-08
- **Decision:** Implement `MessagingProvider` with development and official WhatsApp Cloud adapters.
  Store each tenant's access token, app secret and verify token only as AES-256-GCM ciphertext with
  key ID/IV/authentication tag; store WABA/phone IDs, onboarding state, webhook/template/quality and
  messaging-limit metadata separately. A Cloud connection starts `PENDING_APPROVAL` and requires one
  provider callback path, successful verification/health and explicit activation. Personal WhatsApp
  QR, WhatsApp Web and unofficial automation are prohibited.
- **Reason:** This satisfies the provider-neutral and embedded-onboarding-ready boundary without
  exposing credentials or claiming that absent external approval is complete.
- **Alternatives considered:** Browser/mobile credentials, one agency-wide token, personal WhatsApp
  automation and automatic activation on configuration were rejected for tenancy, security,
  reliability and provider-policy reasons.
- **Status:** Accepted; live Meta activation remains external.
- **Affected modules:** messaging contracts/config/schema/API providers, `.env.example`, integration UI.

## ADR-0035 — PostgreSQL receipts precede asynchronous messaging work

- **Date:** 2026-08-08
- **Decision:** Verify provider signatures, normalize and uniquely persist each webhook receipt in
  PostgreSQL before acknowledging it. Dispatch `messaging.webhook.process` through the shared BullMQ
  queue; keep PostgreSQL status/attempt/error/dead-letter state authoritative and expose reconciliation
  for receipts left pending when Redis is unavailable. Outbound messages similarly commit Message,
  status, outbox, audit and domain-event evidence before provider dispatch.
- **Reason:** A queue outage must not lose customer messages, duplicate delivery must be harmless, and
  provider failure must not roll back committed CRM state.
- **Alternatives considered:** Processing before receipt, Redis-only queues, request-memory dedupe and
  generating a new Message on retry were rejected because they lose or duplicate business evidence.
- **Status:** Accepted and covered by migrated-PGlite integration tests.
- **Affected modules:** `webhook_events`, messaging outbox/status tables, API background registration,
  worker module and messaging service.

## ADR-0036 — Conversations attach to canonical Leads and retain a separate owner

- **Date:** 2026-08-08
- **Decision:** Every customer conversation references one canonical Phase 3 Contact and Lead.
  `conversation_owner_id`/membership and queue Team remain separate from relationship and
  current-process owners; assignment updates only the conversation owner plus append-only history.
  An unmatched official Click-to-WhatsApp referral creates a provider Lead on its first signed inbound
  message, never on a click and never for an unmatched message without referral evidence.
- **Reason:** This preserves the product's three-owner model, continuous customer timeline and safe
  CTWA attribution without inventing a second customer/lead system.
- **Alternatives considered:** A generic owner, standalone messaging contacts, click-time Lead creation
  and phone-only guessing for unknown inbound senders were rejected.
- **Status:** Accepted.
- **Affected modules:** Phase 3 Lead service/timeline, Phase 5 conversations/participants/assignments,
  inbound webhook processing, web/mobile customer context.

## ADR-0037 — Commercial money is integer status evidence, not a payment ledger

- **Date:** 2026-08-09
- **Decision:** Store every commercial amount as a bounded BIGINT minor-unit integer. A payment entry
  starts Pending and affects balance only after a separately permissioned append-only verification
  event. Corrections append one linked reversal; the original entry is never edited or deleted.
- **Reason:** The CRM must report operational payment status without processing customer money or
  pretending to be the accounting ledger. Append-only evidence preserves attribution and permits a
  deterministic verified balance that cannot become negative.
- **Alternatives considered:** Floating point, a mutable `paid_amount`, proof-implies-paid, editing the
  original receipt and integrating a provider without approval were rejected for correctness,
  auditability and scope.
- **Status:** Accepted and tested.
- **Affected modules:** Commercial contracts/schema/service, migration `0024`, booking UI and tests.

## ADR-0038 — Quotation versions are immutable and booking consumes one exact approved version

- **Date:** 2026-08-09
- **Decision:** Keep quotation projection fields for current workflow state while retaining immutable
  version and price-component rows. Tenant settings determine discount approval. One exact active
  Approved/Not Required quotation version may create one booking, whose items are an immutable
  snapshot.
- **Reason:** Users need revisions and approvals without retroactively changing a customer offer or
  an already confirmed booking.
- **Alternatives considered:** Updating quotation rows in place, hard-coded thresholds, copying only
  a total and allowing multiple bookings from one version were rejected.
- **Status:** Accepted and database-enforced through `0026_goofy_changeling.sql`.
- **Affected modules:** Commercial settings, quotation/booking schema/service/contracts and web flow.

## ADR-0039 — Commercial documents reuse private object storage and fail closed on scanning

- **Date:** 2026-08-09
- **Decision:** Store only tenant-bound document/version metadata in PostgreSQL, use short-lived
  signed PUT/GET URLs, audit every download and require `CLEAN` from a provider-neutral scanner
  before approval. The default adapter returns unavailable and leaves the document pending.
- **Reason:** MIME/extension/size/checksum checks and private storage do not establish malware safety.
  Missing external configuration must visibly block readiness rather than silently approve content.
- **Alternatives considered:** Public URLs, database blobs, client-supplied scan flags and treating
  upload completion as approval were rejected.
- **Status:** Accepted; production scanner activation remains an external prerequisite.
- **Affected modules:** Commercial document schema/service/UI, S3 adapter boundary, `.env.example`.

## ADR-0040 — Delivery readiness is a fresh append-only server evaluation

- **Date:** 2026-08-09
- **Decision:** Compute each readiness result from canonical booking, active allocation, verified
  payment threshold, finance, invoice, insurance, customer confirmation and approved configured
  document records, retaining explicit items in an immutable evaluation row.
- **Reason:** A client assertion or mutable boolean can become stale and cannot explain why delivery
  is blocked. Phase 9 can add PDI/registration/handover conditions without rewriting Phase 8 history.
- **Alternatives considered:** `readiness_asserted` from Inventory, a cached boolean on Booking and
  inferred payment proof were rejected.
- **Status:** Accepted and tested fail-closed.
- **Affected modules:** Commercial service/schema/contracts/UI and canonical Inventory allocation link.

## ADR-0041 - Delivery is a separate operational aggregate over canonical commercial inventory

- **Date:** 2026-08-09
- **Decision:** Create one tenant-owned delivery job per confirmed booking and reference the exact
  Phase 8 booking, customer/Lead and active Phase 7 allocation/unit. Delivery status, preparation
  checklist and handover proof do not mutate the Lead pipeline or registration state. Start always
  calls the Phase 8 readiness evaluator immediately before its locked transition.
- **Reason:** Delivery staff need an operational workflow without duplicating sales truth or trusting
  stale client readiness. Registration may finish after handover and cannot be a permanent-RC gate.
- **Alternatives considered:** Client-supplied VIN/readiness, one generic Lead stage and requiring
  permanent RC before handover were rejected.
- **Status:** Accepted and integration-tested.
- **Affected modules:** Delivery contracts/schema/API, Commercial readiness, Inventory delivered
  transition, web/mobile delivery workspaces.

## ADR-0042 - Active delivery location is job-bound temporary evidence

- **Date:** 2026-08-09
- **Decision:** Begin foreground location only after assigned-user disclosure and permission. Bind
  every sample to tenant, delivery job and exact active session, expose stale/current state only to
  authorized managers, expire samples by retention metadata and stop tracking at every terminal or
  exceptional boundary plus session/account cleanup.
- **Reason:** Managers need current operational visibility, not an employee movement history. Exact
  composite foreign keys prevent a valid tenant session from being attached to another delivery.
- **Alternatives considered:** Continuous/off-duty tracking, a tenant-only sample foreign key and
  mobile-supplied assignment authority were rejected.
- **Status:** Accepted and migration/integration-tested; signed physical-device validation remains.
- **Affected modules:** Delivery location schema/service, Expo foreground task/SQLite queue, manager
  active monitor and authorization.

## ADR-0043 - Offline delivery terminal commands reuse one durable operation identity

- **Date:** 2026-08-09
- **Decision:** Completion, delay, failure and reschedule stop native tracking immediately and use one
  UUID as both SQLite operation identity and HTTP `Idempotency-Key`. If connectivity is absent, a
  request fails, its response is lost or it returns a retryable server failure, the exact command and
  key replay in creation order. PostgreSQL command receipts return the original response.
- **Reason:** A lost response after a successful server commit must not create duplicate proof,
  inventory or lifecycle effects, and privacy cannot wait for connectivity.
- **Alternatives considered:** New key on replay, an in-memory queue and stopping location only after
  an HTTP success were rejected.
- **Status:** Accepted and tested.
- **Affected modules:** Mobile delivery outbox/location cleanup, delivery command receipts and API
  start/completion idempotency.

## ADR-0044 - Delivery proof is private, configurable and fail-closed

- **Date:** 2026-08-09
- **Decision:** Tenant settings choose required proof types. Received-by/OTP proof is retained as
  verified structured evidence; photo/signature proof uses private signed storage with MIME, size,
  SHA-256 checksum, metadata and provider-neutral malware scanning. Only clean proof can be verified,
  and each signed download requires a purpose and immutable audit event.
- **Reason:** Upload success is not evidence of safe content, and storage keys or long-lived URLs must
  never become customer-facing data.
- **Alternatives considered:** Public URLs, client-provided scan status, upload-implies-verification
  and mandatory OTP without a provider were rejected.
- **Status:** Accepted; scanner and OTP providers remain external prerequisites when enabled.
- **Affected modules:** Delivery settings/proofs/API, S3 adapter boundary, manager review and mobile
  proof capture.

## ADR-0045 - Registration and delivery are parallel aggregates over one booking

- **Date:** 2026-08-09
- **Decision:** Create one tenant registration case per canonical confirmed booking and exact
  allocated inventory unit. Registration may begin before delivery and never reads or rewrites the
  delivery status. A case detail may display the linked delivery as read-only context.
- **Reason:** Registration work starts during post-booking preparation, while permanent RC commonly
  finishes after handover. Treating either timeline as the other's gate would falsify operational
  history and delay valid delivery.
- **Alternatives considered:** A single combined delivery/RC status, requiring Delivered before
  registration start, and requiring permanent RC before delivery were rejected.
- **Status:** Accepted and integration-tested.
- **Affected modules:** Registration contracts/schema/API/web queue, Booking, Delivery and Inventory
  references.

## ADR-0046 - Registration corrections and RC delivery are append-only evidence

- **Date:** 2026-08-09
- **Decision:** Status changes append registration events. A correction updates the current
  projection only while appending a new event that identifies the prior event being corrected.
  PostgreSQL rejects updates/deletes of registration events, RC delivery records and customer
  vehicle events. Closure requires application/RTO submission, permanent number, received date,
  verified private RC and delivery evidence; reopening retains the original close event.
- **Reason:** Government-registration values can be corrected, but the dealership must retain what
  was recorded, who changed it, why and when. Mutable history or a client-side completion flag is
  insufficient audit evidence.
- **Alternatives considered:** Editing events in place, deleting rejected evidence, optional closure
  fields and reopening by resetting the row without an event were rejected.
- **Status:** Accepted, database-enforced and integration-tested.
- **Affected modules:** Registration cases/events, RC documents/delivery records, audit/outbox and
  closure/reopen/correction commands.

## ADR-0047 - Customer Vehicle is canonical, source-explicit and identity-idempotent

- **Date:** 2026-08-09
- **Decision:** A dealership-sale Customer Vehicle can be created only from an actually Delivered
  booking and reuses its Contact, booking, delivery and physical inventory identity. External
  vehicles require authorized manual entry and have no dealership booking/delivery/inventory links.
  Tenant plus booking, normalized VIN and normalized registration number are independently unique.
- **Reason:** Post-sale modules need one durable ownership record without duplicating customers or
  representing outside purchases as dealership revenue. Retries and reversed workflow order must
  not create duplicate vehicles.
- **Alternatives considered:** Browser-supplied dealership VIN lineage, one generic free-text asset,
  uniqueness by registration only and automatically manufacturing a sale for an external vehicle
  were rejected.
- **Status:** Accepted and integration-tested.
- **Affected modules:** Customer Vehicle schema/API/web, Registration number allotment, Delivery,
  Inventory and canonical Contact.

## ADR-0048 - RC material stays private and scanner verification fails closed

- **Date:** 2026-08-09
- **Decision:** RC copies use tenant-scoped private object keys and short-lived signed PUT/GET URLs.
  Completion verifies MIME, size and SHA-256 object metadata. Only a `CLEAN` scanner result can be
  verified; download and share require a stated purpose and produce audit/outbox plus immutable RC
  delivery evidence. Object keys and signed URLs are not persisted in browser state.
- **Reason:** RCs are sensitive government documents. Successful upload is neither safe-content
  evidence nor authorization to publish the object.
- **Alternatives considered:** Public URLs, database blobs, client-provided scan flags, long-lived
  links and unaudited download were rejected.
- **Status:** Accepted; production scanner activation remains an external prerequisite.
- **Affected modules:** RC document schema/service/UI, S3-compatible storage boundary and audit.
