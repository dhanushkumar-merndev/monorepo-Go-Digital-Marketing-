# Next Phase Handoff

## Status

Phase 0 — Monorepo and Architecture Foundation is complete as of 2026-08-01. The repository is
ready for Phase 1 — Authentication, Tenancy and Authorization. Phase 1 must extend this foundation
without recreating the workspace or introducing dealership workflows.

## Modules created

| Module                       | Phase 0 contents                                                                                                                                                      |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`                   | Next.js App Router office shell, TanStack Query provider, responsive health state, loading/error boundaries and security headers                                      |
| `apps/api`                   | NestJS modular-monolith shell, versioned health API, OpenAPI, validated environment, correlation IDs, structured logging, standard errors and infrastructure adapters |
| `apps/mobile`                | Expo Router Android shell, NativeWind primitives, Query/Zustand/SQLite foundations, notification bootstrap and native error boundary                                  |
| `packages/contracts`         | Zod health, dependency-state, correlation-ID and API-error contracts                                                                                                  |
| `packages/database`          | Drizzle PostgreSQL connection, schema, migration runner and platform migration tests                                                                                  |
| `packages/config`            | Secret-safe server, web and mobile Zod environment validation                                                                                                         |
| `packages/design-tokens`     | Shared colour, typography, radius, spacing, shadow and semantic-status values plus web CSS variables                                                                  |
| `packages/ui`                | Project-owned web-only shadcn/Base UI button, card, alert, badge, skeleton and status-badge primitives                                                                |
| `packages/eslint-config`     | Strict shared flat ESLint policies for base, NestJS, Next.js and React Native                                                                                         |
| `packages/typescript-config` | Strict TypeScript baselines for libraries, NestJS, Next.js and React Native                                                                                           |

## Database migration

- Migration: `packages/database/migrations/0000_neat_shadowcat.sql`
- Metadata: `packages/database/migrations/meta/_journal.json` and `0000_snapshot.json`
- Tables: `outbox_events`, `webhook_events`, `audit_events`
- Controls: platform/client scope checks, client/provider/external webhook uniqueness, processing
  indexes, non-negative attempt checks and an audit trigger that rejects updates/deletes with
  SQLSTATE `55000`
- Application settings were not created because Phase 0 has no durable runtime setting.
- Migration execution and compensating/restore guidance is in
  `docs/implementation/DATABASE_MIGRATIONS.md`.

Phase 1 must add client-organization foreign keys to every client-owned structure once the client
organization table exists. Review delete behavior and existing data before adding validated
constraints; do not edit the applied Phase 0 migration.

## Routes and contracts

| Surface                | Contract                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| `GET /v1/health`       | Canonical PostgreSQL/Redis readiness report; `200` only when both are up, otherwise `503` |
| `GET /v1/health/live`  | Process-only liveness; no dependency calls                                                |
| `GET /v1/health/ready` | Explicit alias for dependency-aware readiness                                             |
| `GET /docs`            | Swagger UI                                                                                |
| `GET /docs-json`       | OpenAPI JSON                                                                              |
| API errors             | `{ error: { code, message, correlation_id, details, retryable } }` from `@gdm/contracts`  |

All protected Phase 1 routes must remain under `/v1`, use shared Zod contracts, update OpenAPI,
propagate the request correlation ID and use the same error envelope.

## Important files

- Workspace/tooling: `package.json`, `pnpm-workspace.yaml`, `turbo.json`,
  `.github/workflows/ci.yml`
- Architecture/setup: `README.md`, `docs/ARCHITECTURE.md`,
  `docs/implementation/LOCAL_DEVELOPMENT.md`
- API bootstrap/boundaries: `apps/api/src/application.ts`, `apps/api/src/app.module.ts`,
  `apps/api/src/common`, `apps/api/src/infrastructure`, `apps/api/src/observability`
- Data foundation: `packages/database/src/schema/platform.ts`,
  `packages/database/src/migration.integration.test.ts`
- Client shells: `apps/web/src/components/app-shell.tsx`,
  `apps/mobile/src/screens/foundation-screen.tsx`
- Design system: `packages/design-tokens/src/index.ts`,
  `packages/design-tokens/src/tokens.css`, `packages/ui/src/components`

## Environment variables

The canonical example is `.env.example`; `apps/web/.env.example` contains the web-only public
value.

| Category          | Existing variables                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| API runtime       | `NODE_ENV`, `API_HOST`, `API_PORT`, `LOG_LEVEL`, `CORS_ORIGINS`                                            |
| PostgreSQL        | `DATABASE_URL`, `DATABASE_POOL_MAX`                                                                        |
| Redis             | `REDIS_URL`, `REDIS_CONNECT_TIMEOUT_MS`                                                                    |
| Private S3/Tigris | `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` |
| Observability     | `SENTRY_DSN`                                                                                               |
| Public clients    | `NEXT_PUBLIC_API_URL`, `EXPO_PUBLIC_API_URL`                                                               |

Phase 1 must define and document validated server-only authentication/signing/session secrets.
Never place a credential in a `NEXT_PUBLIC_*` or `EXPO_PUBLIC_*` variable.

## Verified commands and results

The completion run used the repository root and the single `pnpm-lock.yaml`:

- `pnpm install --frozen-lockfile --force` and a subsequent exact frozen install — pass
- `pnpm format:check` — pass
- `pnpm db:check` — pass
- `pnpm lint` — pass, 8 tasks
- `pnpm type-check` — pass, 13 tasks
- `pnpm test` — pass, 36 tests
- `pnpm test:integration` — pass, 9 tests
- `pnpm build` — pass for NestJS, Next.js, Expo Android and shared packages
- Independent `pnpm dev:web`, `pnpm dev:api` and `pnpm dev:mobile` starts — pass
- Real PostgreSQL/Redis readiness transition and PostgreSQL migration smoke — pass
- Expo dependency check, Android prebuild/export and Gradle release-manifest task — pass

## Seed accounts and data

None. Phase 0 intentionally has no user, organization, membership or dealership tables. Phase 1
must provide development/test identities, organizations, memberships, branch/team scopes and all
role families required to prove the authorization matrix; credentials must remain development-only.

## Known limitations and deferred work

- Docker/Compose was not installed on the completion host; equivalent PostgreSQL and Redis
  behavior was exercised with rootless Podman. Run the documented Compose workflow on a Docker
  host before relying on it for a team environment.
- Hosted Supabase, Upstash and Tigris credentials, remote Sentry reporting and production storage
  smoke tests remain deployment work.
- FCM/EAS credentials, signed Android release artifacts and device UI validation remain deferred.
- BullMQ and S3 construction are provider-neutral Phase 0 seams. No worker or document workflow is
  implemented yet.
- The existing nullable tenant identifiers have scope checks but intentionally lack foreign keys
  until Phase 1 creates `client_organizations`.

See `docs/implementation/KNOWN_ISSUES.md` for evidence and workarounds.

## Exact Phase 1 prerequisites

Phase 1 is governed by `PROMPTS/01_AUTH_TENANCY.md`, the PRD and `AGENTS.md`. Before coding, inspect
this handoff and the existing contracts/migration rather than regenerating the project.

### Backend and database

- Implement users, authentication identities, refresh sessions, agencies, client organizations,
  memberships, branch scopes, team scopes where required, permission definitions,
  role-permission mappings, support-elevation sessions and authentication audit events.
- Add email/password login, rotating refresh tokens with reuse detection, current-session and
  all-session logout, password-reset architecture, suspended-account blocking, session/device
  listing and a provider-neutral future OAuth boundary.
- Preserve immutable authentication/support audit evidence and publish meaningful state changes
  through the transactional outbox when asynchronous work is introduced.
- Add reviewed Drizzle migrations, constraints, indexes, realistic development seeds and explicit
  rollback/compatibility notes. Do not modify migration `0000_neat_shadowcat.sql` after handoff.

### Authorization boundary

- Default deny. Every protected request must verify authenticated user, active membership, active
  client, tenant scope, permission, branch/team scope and object ownership/assignment when
  applicable.
- Derive tenant context from the authenticated membership/session. Never treat a browser/mobile
  tenant ID as authorization proof.
- Agency support elevation must require a reason, have a short lifetime, show a visible active
  support state and create immutable audit evidence.
- Deactivating or suspending a user must prevent new/refresh sessions while preserving historical
  attribution.

### Client work

- Web: login, forgot/reset password, session-expired, unauthorized, permitted tenant/client
  selector, profile, active sessions, and a role-aware shell/navigation.
- Mobile: login, secure token persistence, refresh recovery, logout, disabled-account handling and
  a role-aware shell. Do not store refresh tokens in the Phase 0 generic SQLite outbox.

### Required evidence before Phase 1 completion

- Cross-tenant denial, suspended-login/refresh denial, refresh-token rotation/reuse rejection,
  branch isolation, field-role denial from admin APIs and expiring/audited support elevation.
- Expired-access-token recovery on both clients and authorization tests for every role family
  named in the Phase 1 prompt.
- Updated OpenAPI, `.env.example`, seed documentation, migration guidance, UI loading/empty/error/
  disabled/success states, and all four implementation tracking documents.
- Fresh root install, formatting, migration check, lint, type-check, unit/integration tests and
  affected production builds must all remain green.
