# Phase 0 Deployment

This document describes the configured deployment topology. It does not claim that any hosted
resource has been provisioned or deployed.

```text
Browser ──> Cloudflare Worker (OpenNext / apps/web)
                    │
                    └──> Render web service (NestJS / apps/api /v1)
                                  │
                                  ├──> Supabase PostgreSQL
                                  ├──> Upstash Redis / BullMQ
                                  └──> private Tigris or R2 bucket (S3 API)

Render background worker ──> Upstash Redis / BullMQ ──> NestJS processors
```

NestJS remains the only location for business logic, authentication, authorization, webhooks and
workflow rules. The Cloudflare Worker renders the web client and calls the versioned NestJS API;
it does not implement an alternate backend.

## Root commands

Run commands from the repository root. The wrapper loads the root `.env` before invoking the
actual workspace package.

| Command             | Workspace target and purpose                                     |
| ------------------- | ---------------------------------------------------------------- |
| `pnpm dev`          | Run all workspace `dev` tasks through Turborepo                  |
| `pnpm dev:web`      | Run `@gdm/web` with the Next.js development server               |
| `pnpm dev:api`      | Run `@gdm/api` in NestJS watch mode                              |
| `pnpm dev:mobile`   | Run `@gdm/mobile` with Expo                                      |
| `pnpm dev:worker`   | Run the `@gdm/api` worker entry point in watch mode              |
| `pnpm preview:web`  | Build the OpenNext artifact and run a local Wrangler preview     |
| `pnpm deploy:web`   | Build and deploy the OpenNext artifact with existing Worker vars |
| `pnpm start:api`    | Run the compiled NestJS HTTP entry point in production mode      |
| `pnpm start:worker` | Run the compiled NestJS worker entry point in standalone mode    |
| `pnpm build`        | Build all applications and packages through Turborepo            |

`dev:worker` and `start:worker` explicitly set `WORKER_MODE=standalone`; they do not depend on a
developer's `.env` default. Run `pnpm build` before either production start command.

## Cloudflare Workers

The web application uses `@opennextjs/cloudflare`, with adapter settings in
`apps/web/open-next.config.ts` and Worker settings in `apps/web/wrangler.jsonc`. The Worker has the
`nodejs_compat` and `global_fetch_strictly_public` compatibility flags. No Vercel-specific runtime
API is used.

For local preview:

```bash
cp .env.example .env
cp apps/web/.dev.vars.example apps/web/.dev.vars
pnpm preview:web
```

The root `.env` (or an exported process variable) supplies `NEXT_PUBLIC_API_URL` to the Next.js
build. `.dev.vars` supplies Wrangler runtime values and selects the development Next environment;
it does not replace the build-time variable.

Set `NEXT_PUBLIC_API_URL` to the public HTTPS NestJS base URL ending in `/v1`. For Cloudflare
production, define it as both a build variable and a Worker variable. Next.js inlines public
variables while building, while the runtime value is also available to server-rendered code. The
deployment script forwards `--keep-vars` to Wrangler so dashboard-managed variables are not
removed.

After an authorized operator has authenticated Wrangler and reviewed the account target:

```bash
pnpm deploy:web
```

The command first fails closed unless `NEXT_PUBLIC_API_URL` is an explicit HTTPS URL with the
exact `/v1` path. It then performs an external deployment and is intentionally not run by local
validation or CI. CI builds the same Worker artifact with `pnpm build:web:cloudflare`.

## Render API and background worker

`render.yaml` defines two services from the same production image:

| Service           | Docker command        | `WORKER_MODE` | Responsibility                           |
| ----------------- | --------------------- | ------------- | ---------------------------------------- |
| Web service       | `node dist/main.js`   | `standalone`  | REST/OpenAPI, health and queue producers |
| Background worker | `node dist/worker.js` | `standalone`  | BullMQ processors only                   |

Render supplies `PORT`; the API also accepts `API_PORT` for local and container use. The web
service readiness path is `/v1/health/ready`; the process-only liveness path is
`/v1/health/live`. Both NestJS entry points enable shutdown hooks. Render is configured with a
120-second shutdown window so workers can stop taking jobs, finish active work and close BullMQ,
Redis, database and storage connections.

For a low-cost pilot, omit the separate worker service and set the web service to
`WORKER_MODE=embedded`. Do not run both embedded processing and a standalone worker unless the
additional concurrency is intentional. Set `WORKER_MODE=disabled` when jobs must remain queued
without processing.

## BullMQ worker modes

| Mode         | HTTP API behavior                     | Dedicated worker entry point | Health processing state                 |
| ------------ | ------------------------------------- | ---------------------------- | --------------------------------------- |
| `disabled`   | Produces jobs; starts no local worker | Rejected                     | disabled, zero local workers            |
| `embedded`   | Produces and processes jobs locally   | Rejected                     | local processing and local worker count |
| `standalone` | Produces jobs; starts no local worker | Required                     | API reports processing as external      |

No dealership job processor exists in Phase 0. Worker-mode tests use an in-test provider-neutral
processor without registering production business work. Redis-backed queues are not a source of
truth; later business changes must commit PostgreSQL state and an outbox event before queueing a
side effect.

Use the Upstash native Redis TLS URL (`rediss://...`), not its REST URL or token. API producers
use a bounded, fail-fast connection while worker connections tolerate transient Redis outages.
BullMQ uses blocking/polling Redis connections, so review Upstash's current BullMQ guidance and
choose a plan suitable for persistent worker traffic.

## Supabase PostgreSQL

- `DATABASE_URL` is the NestJS runtime connection. On an IPv4-only host such as Render, use the
  Supabase session-pooler URL when a direct IPv6 connection is unavailable.
- `DIRECT_DATABASE_URL` is preferred by `pnpm db:generate`, `pnpm db:check` and
  `pnpm db:migrate`. Use the direct or session connection selected for reviewed DDL operations.
  If it is absent, database commands fall back to `DATABASE_URL`.
- Run `pnpm db:migrate` as one controlled pre-deployment job. API replicas do not migrate on
  startup.
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are documented integration
  inputs for later approved features; Phase 0 connects through PostgreSQL and does not consume
  the Supabase Data API. The service-role key is backend-only and must never be placed in
  Cloudflare, `NEXT_PUBLIC_*`, `EXPO_PUBLIC_*`, a client bundle or logs.

## Private object storage

Tigris uses the named variables below and the standard AWS SDK S3 adapter. `TIGRIS_ENDPOINT`
defaults to `https://t3.storage.dev`, the region is `auto`, and path-style addressing remains
disabled.

Cloudflare R2 uses the provider-neutral `S3_*` variables instead:

```text
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=<private-bucket>
S3_ACCESS_KEY_ID=<R2-access-key>
S3_SECRET_ACCESS_KEY=<R2-secret-key>
S3_FORCE_PATH_STYLE=false
```

For an R2 deployment, remove or blank every `TIGRIS_*` entry in `render.yaml`—including the
pre-filled endpoint—and add the complete `S3_*` set. The validator rejects mixed providers.

Never configure a public bucket. The adapter returns short-lived signed URLs and destroys its SDK
client during application shutdown. Supply either the complete Tigris credential set or the
complete generic S3 credential set, not a mixture.

## Environment inventory

| Variable                    | Scope                    | Purpose                                                   |
| --------------------------- | ------------------------ | --------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`       | Cloudflare build/runtime | Public HTTPS NestJS URL ending in `/v1`                   |
| `DATABASE_URL`              | API and worker           | Supabase PostgreSQL runtime URL                           |
| `DIRECT_DATABASE_URL`       | Migration job only       | Direct/session URL used for reviewed DDL                  |
| `SUPABASE_URL`              | Backend, reserved        | Supabase project API URL for a later approved integration |
| `SUPABASE_ANON_KEY`         | Backend, reserved        | Supabase anon key; not currently consumed                 |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend secret, reserved | Supabase privileged key; never expose to a client         |
| `REDIS_URL`                 | API and worker           | Native Upstash `rediss://` connection                     |
| `WORKER_MODE`               | API and worker           | `disabled`, `embedded` or `standalone`                    |
| `TIGRIS_ACCESS_KEY_ID`      | API and worker secret    | Tigris S3 credential                                      |
| `TIGRIS_SECRET_ACCESS_KEY`  | API and worker secret    | Tigris S3 credential                                      |
| `TIGRIS_BUCKET`             | API and worker           | Private Tigris bucket                                     |
| `TIGRIS_ENDPOINT`           | API and worker           | Tigris S3 endpoint                                        |

`API_HOST`, `API_PORT`/`PORT`, `CORS_ORIGINS`, `DATABASE_POOL_MAX`,
`REDIS_CONNECT_TIMEOUT_MS`, `LOG_LEVEL`, `SENTRY_DSN` and the generic `S3_*` family are also
validated server inputs. Store all non-public values in Render, Supabase, Upstash, Tigris or R2
secret management rather than committing an `.env` file.

The root command wrapper strips backend variables before direct web/mobile commands. Turborepo's
global environment allowlist contains only public/non-secret build inputs; the API workspace has a
separate development-task allowlist for server configuration.

## Deployment order and smoke checks

1. Provision Supabase and apply reviewed Drizzle migrations once.
2. Provision Upstash and a private Tigris or R2 bucket.
3. Create the Render services from `render.yaml` and set every `sync: false` value.
4. Confirm `/v1/health/live`, `/v1/health/ready`, `/v1/health` and `/docs` on the Render URL.
5. Set the Cloudflare build/runtime `NEXT_PUBLIC_API_URL` and deploy the web Worker.
6. Confirm the web shell calls only the Render `/v1` API and check correlation IDs in API logs.
7. Exercise the selected worker mode and verify its processing state in the health response.

The deployment should be rolled back at the application/image level if smoke checks fail. Follow
`DATABASE_MIGRATIONS.md` for database rollback considerations; never edit production migration
metadata manually.
