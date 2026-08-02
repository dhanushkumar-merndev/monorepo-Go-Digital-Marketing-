# Architecture Decisions

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
