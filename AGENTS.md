# GO DIGITAL AUTOMOBILE CRM — AGENTS.md

This file contains the permanent implementation rules for the **Go Digital Automobile CRM**. It applies to every coding session and every implementation phase.

The product source of truth is:

- `Go_Digital_Automobile_CRM_10_on_10_Final_Technical_PRD_v4_0.docx`

The PRD defines the product. The current phase prompt defines what may be implemented now. Implement only the assigned phase.

---

## 1. Repository architecture

Use a **pnpm workspace + Turborepo monorepo** with this target structure:

```text
apps/
  web/        Next.js App Router office dashboard
  api/        NestJS API and background workers
  mobile/     React Native Expo Android application
packages/
  contracts/  shared Zod schemas, enums and API contracts
  database/   Drizzle schema, migrations, repositories and DB utilities
  config/     shared environment validation and runtime configuration
  ui/         shared web-only shadcn/ui wrappers and design tokens
  eslint-config/
  typescript-config/
docs/
  implementation/
```

### Workspace and dependency rules

- Use **pnpm only**. Do not mix npm, Yarn or Bun lockfiles.
- Run `pnpm install` from the repository root.
- Keep one root lockfile: `pnpm-lock.yaml`.
- Let pnpm share/deduplicate the package store across workspace packages.
- Do not run separate `npm install` commands inside individual apps.
- Put app-specific dependencies in that app's `package.json`.
- Put genuinely shared tooling in the root or relevant shared package.
- Do not commit `node_modules`.
- The root `package.json` must use `"private": true`.
- Pin resolved dependency versions through the lockfile.
- Use the current stable runtime/package releases available at implementation time unless the PRD or repository pins a version.

If a standalone Next.js project already exists at the repository root, preserve useful code and move/migrate it into `apps/web`; do not delete working code blindly.

---

## 2. Technology constraints

### Web

Use:

- Next.js App Router
- TypeScript strict mode
- Tailwind CSS
- **shadcn/ui as the only reusable web UI component system**
- Lucide icons
- TanStack Query
- TanStack Table using shadcn Data Table patterns
- React Hook Form
- Zod
- Recharts only through shadcn chart composition

Do not install Material UI, Ant Design, Chakra UI, Bootstrap, Mantine or another full web UI framework.

Custom Tailwind composition is allowed for layout and presentation, but reusable controls must use shadcn/ui primitives or project-owned wrappers around them.

### Mobile

Use:

- React Native
- Expo prebuild
- Expo Router
- TypeScript
- NativeWind
- TanStack Query
- Zustand
- Expo SQLite
- FCM or `expo-notifications`

Web shadcn components cannot be imported into React Native. Build project-owned NativeWind primitives that follow the same design tokens and interaction language. Do not install a competing full mobile component framework without written architectural approval.

### Backend

Use:

- NestJS
- TypeScript
- REST API
- OpenAPI/Swagger
- Drizzle ORM
- Supabase PostgreSQL
- Upstash Redis
- BullMQ
- Tigris through an S3-compatible AWS SDK interface
- Pino structured logging
- Sentry-ready error handling
- Docker

---

## 3. Core architecture rules

- NestJS owns authorization, workflow transitions and all critical business rules.
- Web and mobile are presentation clients; never trust client-side validation alone.
- Use a modular monolith. Do not create premature microservices.
- Use `/v1` API versioning.
- PostgreSQL is the source of truth.
- Redis failure must not lose business data.
- Use transactions for multi-record business operations.
- Use the outbox pattern for reliable asynchronous side effects.
- Use idempotency keys for webhooks, retried commands and offline replay.
- Use provider-neutral adapters for telephony, messaging, storage and external integrations.
- Maintain append-only lifecycle/status history.
- Maintain immutable audit events for sensitive actions.
- Never silently allow an invalid workflow transition.
- Use explicit domain events for meaningful state changes.
- Do not add future modules merely because interfaces exist for them.

---

## 4. Multi-tenancy and authorization

- Every client-owned database row must include `client_organization_id NOT NULL`.
- Every protected request must verify tenant, active membership, permission and object scope.
- Default deny access.
- Never accept a browser/mobile-supplied tenant ID as authorization proof.
- Tenant context must come from the authenticated membership/session.
- Enforce branch, team, assignment and ownership scope in backend policies/repositories.
- Cross-tenant reads and writes must be prevented by design and covered by automated tests.
- Agency support access requires a reason, short-lived elevation, visible support state and immutable audit entry.
- Deactivating a user must revoke active sessions without breaking historical attribution.

---

## 5. Ownership model

Preserve these as separate concepts and fields:

- `relationship_owner_id` — long-term customer relationship and sales attribution
- `current_process_owner_id` — person responsible for the active operational stage
- `conversation_owner_id` — person or queue responsible for customer replies

Never replace them with one generic owner field.

---

## 6. Security and privacy rules

- Never expose provider credentials to web or mobile clients.
- Encrypt tenant integration secrets at rest.
- Use private object storage and short-lived signed URLs.
- Do not log passwords, access tokens, complete documents or unnecessary sensitive information.
- Validate file type, extension, MIME type and size.
- Keep an adapter point for malware scanning.
- Record document downloads and sensitive actions in audit logs.
- Use least-privilege permissions.
- Minimize Android permissions.
- Do not request Android call log, SMS, contacts or accessibility permissions for the core MVP.
- Active location tracking must begin only after explicit user action and stop immediately when the job ends.
- Consent, suppression and retention rules in the PRD must be enforced technically.

---

## 7. UI implementation rules

- Build functional screens, not static mockups.
- Every data screen must include loading, empty, error, disabled and success states.
- Use responsive layouts and keyboard-accessible interactions.
- Use shadcn forms, dialogs, sheets, tables, tabs, cards, badges, command menus and feedback primitives.
- Use Lucide icons consistently.
- Navigation and action visibility must reflect permissions.
- Hidden UI is not authorization; backend authorization remains mandatory.
- Do not show fake charts, fake data-sync success or fake integration status as completed production functionality.
- Use skeletons for meaningful loading states.
- Confirm destructive actions and explain consequences.
- Preserve a consistent design-token system across web and mobile.

---

## 8. Database and migration rules

- Use Drizzle migrations for all schema changes.
- Never manually mutate production schema outside the migration process.
- Add foreign keys, unique constraints, check constraints and indexes where business correctness requires them.
- Use optimistic or pessimistic concurrency controls for allocation and other race-sensitive workflows.
- Preserve append-only financial, ownership and lifecycle history.
- Use soft deactivation or explicit anonymization/deletion workflows where history must remain.
- Seed only realistic development/test data; never commit real customer data.
- Every migration must have documented execution and rollback considerations.

---

## 9. API and background-job rules

- Validate all input with shared Zod contracts or NestJS-compatible schemas derived from them.
- Return a consistent API error envelope.
- Include correlation/request IDs in logs and errors.
- Verify webhook signatures before durable acceptance.
- Acknowledge verified webhooks quickly and process asynchronously.
- Use unique provider/client/external-event identifiers.
- Use retries with exponential backoff and jitter.
- Use dead-letter handling and reconciliation jobs.
- Apply per-provider and per-tenant rate/concurrency limits.
- Never let provider failure roll back already-committed internal business state unnecessarily.

---

## 10. Scope control

For every phase:

- Implement only explicitly listed requirements.
- Create interfaces/placeholders for future phases only when the current phase genuinely depends on them.
- Do not implement future business modules.
- Do not rewrite completed modules without a demonstrated technical need.
- Do not change agreed status codes or workflows casually.
- Do not add unapproved libraries.
- Do not use mock-only functionality and mark it complete.
- Clearly label development adapters and unavailable provider features.
- When an irreversible business decision is missing, document the blocker instead of inventing a rule.

---

## 11. Required engineering quality for every phase

Every applicable phase must include:

- Database migration
- Shared contracts/enums
- Backend validation
- Authorization policy
- Business-rule tests
- Critical API integration tests
- Web or mobile UI for assigned roles
- Loading, empty and error states
- Seed data required to test the phase
- Updated OpenAPI documentation
- Updated `.env.example`
- Updated README/setup instructions
- Audit and observability hooks

No phase is complete when its affected lint, type-check, tests or production build fails.

---

## 12. Mandatory implementation tracking documents

Create these during Phase 0 if missing, then update them after every phase:

- `docs/implementation/PHASE_STATUS.md`
- `docs/implementation/DECISIONS.md`
- `docs/implementation/KNOWN_ISSUES.md`
- `docs/implementation/NEXT_PHASE_HANDOFF.md`

### `PHASE_STATUS.md` must contain

- Current phase
- Current status
- Completed phases
- Acceptance-criterion checklist
- Last verified test/build results
- Last updated date

### `DECISIONS.md` must contain

- Decision/ADR ID
- Date
- Decision
- Reason
- Alternatives considered when material
- Status
- Affected modules

### `KNOWN_ISSUES.md` must contain

- Open issue
- Severity
- Impact
- Reproduction or evidence
- Workaround
- Owning phase
- Resolution status

### `NEXT_PHASE_HANDOFF.md` must contain

- Completed phase
- Modules created
- Database migrations
- Routes and API contracts
- Important files
- Environment variables
- Verified commands and results
- Seed accounts/data
- Known limitations
- Deferred work
- Exact prerequisites and recommendations for the next phase

Never fill these with generic claims. They must describe the actual repository and actual command results.

---

## 13. Completion protocol

Before declaring a phase complete:

1. Inspect the actual repository state.
2. Compare implementation with every acceptance criterion.
3. Run dependency/install checks.
4. Run formatting checks.
5. Run linting.
6. Run TypeScript checks.
7. Run unit tests.
8. Run integration tests.
9. Run production builds for all affected applications/packages.
10. Review tenant isolation and authorization.
11. Review migrations and backward compatibility.
12. Fix all issues belonging to the current phase.
13. Update the four implementation tracking documents.
14. Report completed, partial and failed requirements honestly.

Do not say “complete” when mandatory tests or builds fail.
