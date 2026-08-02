# Next Phase Handoff

## Completed phase

Phase 0 — Monorepo and Architecture Foundation, including the Phase 0 deployment amendment, is
complete as of 2026-08-01. The amendment changed deployment/runtime configuration only and added
the required BullMQ process controls. It did not start Phase 1 or add dealership workflows.

The configured topology is Cloudflare OpenNext for apps/web, a Render NestJS web service for
apps/api, and an optional Render worker from the same API image. The API uses Supabase PostgreSQL,
Upstash Redis/BullMQ and private Tigris or R2 storage. The Phase 0 standalone worker currently
instantiates only Redis/BullMQ; future processors may add database/storage modules when approved.

## Modules created or updated

| Module             | Actual Phase 0 state                                                                                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| apps/web           | Existing Next.js/shadcn shell plus OpenNext Cloudflare config, Wrangler config, runtime examples, Worker headers, deploy preflight and deployment tests                       |
| apps/api           | Existing NestJS foundation plus worker-mode lifecycle, provider-neutral processor registry, BullMQ worker factory, dist/worker.js, processing health state and shutdown tests |
| apps/mobile        | Existing Expo/NativeWind shell; deployment amendment made no mobile application changes                                                                                       |
| packages/contracts | Existing API error/health contracts plus discriminated background-processing health contract                                                                                  |
| packages/config    | Worker mode, Render PORT fallback, public API URL hardening and Tigris/generic S3 selection                                                                                   |
| packages/database  | Existing Drizzle foundation; migration tooling now prefers DIRECT_DATABASE_URL                                                                                                |
| Root and CI        | Environment-aware command wrapper, all required deployment scripts, OpenNext CI build and API Docker-image CI build                                                           |
| Deployment docs    | render.yaml, DEPLOYMENT.md, and updated architecture/setup/migration/tracking documents                                                                                       |

The shared UI, design-token, ESLint and TypeScript packages remain unchanged in responsibility.

## Database migrations

- Existing migration: packages/database/migrations/0000_neat_shadowcat.sql
- Existing metadata: packages/database/migrations/meta/_journal.json and 0000_snapshot.json
- Existing tables only: outbox_events, webhook_events, audit_events
- Deployment amendment migrations: none
- pnpm db:migrate prefers DIRECT_DATABASE_URL, falls back to DATABASE_URL, and must run as one
  controlled pre-deployment job. API/worker replicas do not migrate on startup.

Do not edit the applied Phase 0 migration. Phase 1 must add a new reviewed migration and add
tenant foreign keys only after client_organizations exists.

## Routes and API contracts

| Surface                      | Current contract                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| GET /v1/health               | Canonical PostgreSQL/Redis readiness; 200 only when both are up, otherwise 503      |
| GET /v1/health/live          | Process-only liveness                                                               |
| GET /v1/health/ready         | Dependency-aware readiness used by Render                                           |
| Health processing            | Object with mode, location and local_workers for disabled/local/external processing |
| GET /docs and GET /docs-json | Swagger UI and OpenAPI JSON                                                         |
| API errors                   | Standard error object with code, message, correlation_id, details and retryable     |

Every later protected route remains under NestJS /v1. Cloudflare has no business endpoint.

## Worker modes

| Mode       | API process                            | Dedicated worker        | Health from API            |
| ---------- | -------------------------------------- | ----------------------- | -------------------------- |
| disabled   | Queue producer only; no consumer       | Must not run            | disabled / 0 local workers |
| embedded   | Queue producer plus one local consumer | Must not run            | local / 1 local worker     |
| standalone | Queue producer only                    | dist/worker.js consumes | external / 0 local workers |

The production render.yaml selects standalone on both process types. The processor registry is
intentionally empty in production; Phase 1 must not invent dealership jobs unless its approved
scope genuinely needs one. Future processors must be idempotent and pair durable business changes
with the transactional outbox.

## Important files

- Cloudflare: apps/web/open-next.config.ts, apps/web/wrangler.jsonc,
  apps/web/next.config.ts, apps/web/.dev.vars.example,
  scripts/validate-web-deployment.mjs
- Render/container: render.yaml, apps/api/Dockerfile
- Worker runtime: apps/api/src/worker.ts, apps/api/src/worker.module.ts,
  apps/api/src/background, apps/api/src/infrastructure/redis
- Health/contracts: apps/api/src/health, packages/contracts/src/platform/health.ts
- Environment: .env.example, packages/config/src/api.ts,
  packages/config/src/shared.ts, packages/config/src/web.ts
- Root commands: package.json, scripts/run-workspace-command.mjs, turbo.json,
  apps/api/turbo.json
- CI: .github/workflows/ci.yml
- Operations: docs/implementation/DEPLOYMENT.md,
  docs/implementation/DATABASE_MIGRATIONS.md

## Environment variables

The canonical local example is .env.example. Cloudflare preview also has
apps/web/.dev.vars.example.

| Category                         | Variables and boundary                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------- |
| Public web                       | NEXT_PUBLIC_API_URL — exact public NestJS /v1 base; deployment requires HTTPS                  |
| API process                      | NODE_ENV, API_HOST, API_PORT or Render PORT, LOG_LEVEL, CORS_ORIGINS                           |
| PostgreSQL                       | DATABASE_URL, DIRECT_DATABASE_URL, DATABASE_POOL_MAX                                           |
| Supabase reserved backend inputs | SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY                                     |
| Redis/BullMQ                     | REDIS_URL, REDIS_CONNECT_TIMEOUT_MS, WORKER_MODE                                               |
| Tigris                           | TIGRIS_ENDPOINT, TIGRIS_BUCKET, TIGRIS_ACCESS_KEY_ID, TIGRIS_SECRET_ACCESS_KEY                 |
| R2/generic S3                    | S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_FORCE_PATH_STYLE |
| API observability                | SENTRY_DSN                                                                                     |
| Mobile public URL                | EXPO_PUBLIC_API_URL                                                                            |

Phase 0 accesses Supabase through PostgreSQL and does not consume the Supabase Data API. The
service-role key is backend-only, reserved and unused. Never put it in Cloudflare, a
NEXT_PUBLIC_/EXPO_PUBLIC_ variable, a bundle, fixture or log.

Choose one object-storage family. render.yaml is Tigris-oriented; an R2 deployment must remove all
TIGRIS_ entries and supply the complete generic S3_ set.

## Required root commands

- pnpm dev
- pnpm dev:web
- pnpm dev:api
- pnpm dev:mobile
- pnpm dev:worker
- pnpm preview:web
- pnpm deploy:web
- pnpm start:api
- pnpm start:worker
- pnpm build

The root wrapper loads the root .env, strips backend variables before direct web/mobile commands,
forces production for build/start/deploy commands, and forces standalone mode for dedicated
worker commands. Turborepo exposes backend runtime variables only to the API development task.
deploy:web uses pnpm run deploy explicitly to avoid collision with pnpm's built-in deploy command.

## Verified commands and results

The completion run used the repository root and one pnpm-lock.yaml:

- pnpm install and pnpm install --frozen-lockfile — pass
- pnpm format and pnpm format:check — pass
- pnpm db:check — pass
- pnpm lint — pass, 8 applicable tasks
- pnpm type-check — pass, 13 tasks
- pnpm test — pass, 63 tests
- pnpm test:integration — pass, 9 tests
- pnpm build — pass across NestJS, Next.js, Expo Android and shared packages
- pnpm dev — pass; web/API returned 200 and Expo Metro reported running
- pnpm build:web:cloudflare — pass; OpenNext generated .open-next/worker.js
- pnpm preview:web — pass; Wrangler returned 200 for the rendered shell
- Direct OpenNext-to-Wrangler deploy dry-run — pass without upload
- Root deploy wrapper preflight — missing/HTTP API URLs fail before build or upload
- Real PostgreSQL 17/Redis 8 disabled, embedded and standalone runtime checks — pass
- Existing NestJS Dockerfile built with Podman — pass
- Built image API readiness and standalone worker start — pass
- render.yaml YAML parse and official-field audit — pass

The Docker CLI was unavailable. Podman exercised the same Dockerfile and image process commands;
CI now includes the exact Docker CLI build.

## Seed accounts and data

None. Phase 0 has no user, organization, membership or dealership tables. Queue verification used
ephemeral validation data that was removed with the temporary Redis container.

## Known limitations and deferred work

- No real hosted deployment was performed. Run the staging sequence in DEPLOYMENT.md before
  production traffic.
- The standalone worker has structured Pino logging but no worker-specific Sentry reporter yet.
- The pre-existing API exception filter must sanitize explicit 5xx HttpException messages before
  Phase 1 exposes protected routes.
- FCM/EAS credentials, signed Android artifacts and device checks remain deferred.
- Phase 1 must create tenant/identity structures and prove authorization; the Phase 0 nullable
  tenant markers intentionally have no client-organization foreign keys yet.

See KNOWN_ISSUES.md for severity, evidence, workarounds and ownership.

## Exact prerequisites for Phase 1

Phase 1 is governed by PROMPTS/01_AUTH_TENANCY.md, the PRD and AGENTS.md. Read those files and this
handoff before changing code. Extend the existing workspace; do not regenerate it.

### Deployment and security prerequisites

1. Resolve or explicitly gate the open 5xx-message sanitization issue before exposing protected
   endpoints.
2. Keep the Cloudflare Worker presentation-only. Add all authentication/session/authorization
   logic to NestJS and shared contracts.
3. Select a hosted staging environment and confirm Supabase/Upstash/Tigris or R2 readiness before
   relying on asynchronous auth side effects.
4. Keep WORKER_MODE=disabled if Phase 1 adds no background work. If it adds approved email or
   security jobs, register explicit idempotent processors and test embedded/standalone behavior.

### Backend and database

- Implement users, authentication identities, refresh sessions, agencies, client organizations,
  memberships, branch/team scopes, permission definitions, role-permission mappings,
  support-elevation sessions and authentication audit events.
- Add email/password login, rotating refresh tokens with reuse detection, current/all-session
  logout, password-reset architecture, suspended-account blocking and session/device listing.
- Default deny every protected request. Derive tenant context from the authenticated
  membership/session; never trust a client-supplied tenant ID as authorization proof.
- Add a new Drizzle migration, constraints, indexes, realistic development seeds and explicit
  rollback/compatibility notes. Do not edit 0000_neat_shadowcat.sql.

### Web and mobile

- Web: login, forgot/reset password, session-expired, unauthorized, permitted tenant selector,
  profile, active sessions and role-aware navigation.
- Mobile: login, secure token persistence, refresh recovery, logout, disabled-account handling and
  a role-aware shell. Do not store refresh tokens in the generic SQLite outbox.

### Evidence required before Phase 1 completion

- Cross-tenant denial; branch/role isolation; suspended login/refresh denial; refresh rotation and
  reuse rejection; expiring/audited support elevation.
- Expired-access-token recovery on both clients and backend authorization tests for each assigned
  role family.
- Updated OpenAPI, environment examples, seed/migration documentation, complete UI states and all
  four tracking documents.
- Fresh install, format, migration check, lint, strict type-check, unit/integration tests and all
  affected production/Cloudflare/API image builds must remain green.
