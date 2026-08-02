# Phase Status

- **Current phase:** Phase 0 — Deployment Amendment
- **Current status:** Complete
- **Completed phases:** Phase 0 foundation and Phase 0 deployment amendment
- **Last updated:** 2026-08-01

## Deployment-amendment acceptance criteria

- [x] `apps/web` builds for Cloudflare Workers through OpenNext without Vercel runtime APIs.
- [x] Wrangler contains the OpenNext entry point, assets binding, current compatibility date,
      `nodejs_compat`, `global_fetch_strictly_public` and local preview/deploy commands.
- [x] A Cloudflare deployment fails closed unless `NEXT_PUBLIC_API_URL` is an explicit HTTPS
      `/v1` endpoint; local preview can use a loopback HTTP API.
- [x] `apps/api` uses its existing production Dockerfile for a Render web service and the same
      image for a separate `dist/worker.js` process.
- [x] Render's API command, worker command, readiness path, `PORT` behavior and graceful-shutdown
      window are captured in `render.yaml`.
- [x] Supabase PostgreSQL runtime and direct migration URLs, Upstash native Redis TLS, Tigris
      aliases and the generic Cloudflare R2 S3 configuration are validated/documented.
- [x] `WORKER_MODE=disabled|embedded|standalone` has explicit startup, health and shutdown
      behavior. No dealership processor was added.
- [x] Every required root command exists and targets `@gdm/web`, `@gdm/api` or `@gdm/mobile`
      as appropriate.
- [x] The Supabase service-role key is documented as backend-only, stripped from direct web/mobile
      commands, excluded from client Turborepo task environments and never exposed in a bundle.
- [x] Formatting, lint, type-check, unit/integration tests, monorepo build, OpenNext build/preview
      and OCI image build passed.
- [x] No Phase 1 authentication, authorization, tenancy or dealership workflow was started.

## Last verified results

All checks were run from the repository root on 2026-08-01. Node.js 24 is the CI/container
baseline; repository commands passed on the available Node.js 26.4.0 host with pnpm 11.18.0.

| Check                               | Result | Actual evidence                                                                           |
| ----------------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| `pnpm install`                      | Pass   | Workspace resolution completed and updated the one root lockfile                          |
| `pnpm install --frozen-lockfile`    | Pass   | Exact lockfile install completed without changes                                          |
| `pnpm format` / `pnpm format:check` | Pass   | Prettier completed for the final repository tree                                          |
| `pnpm db:check`                     | Pass   | Drizzle migration metadata/snapshot reported valid                                        |
| `pnpm lint`                         | Pass   | 8 applicable workspace lint tasks, zero warnings                                          |
| `pnpm type-check`                   | Pass   | 13 strict TypeScript tasks                                                                |
| `pnpm test`                         | Pass   | 63 tests across API, web, mobile and shared packages                                      |
| `pnpm test:integration`             | Pass   | 9 API/database integration tests                                                          |
| `pnpm build`                        | Pass   | NestJS API/worker, Next.js, Expo Android and shared packages                              |
| `pnpm dev`                          | Pass   | Web 200, API liveness 200 and Expo Metro `packager-status:running`                        |
| `pnpm build:web:cloudflare`         | Pass   | OpenNext 1.20.2 emitted `.open-next/worker.js`                                            |
| `pnpm preview:web`                  | Pass   | Wrangler 4.118.0 served the Worker shell at `localhost:8787`; `GET /` returned 200        |
| Cloudflare deploy dry run           | Pass   | OpenNext forwarded `--keep-vars --dry-run` to Wrangler without upload                     |
| Render Blueprint parse/audit        | Pass   | YAML parsed two services; current Render fields/commands matched the official schema      |
| API OCI image                       | Pass   | Existing Dockerfile built as `localhost/gdm-api:phase0-deployment-amendment` with Podman  |
| API/worker image smoke              | Pass   | Image honored Render `PORT=10000`, Tigris aliases and standalone split; readiness was 200 |

## Worker-mode runtime verification

Real PostgreSQL 17 and Redis 8 containers were used:

- **disabled:** API health returned `mode=disabled`, `location=disabled`,
  `local_workers=0`; a BullMQ validation job remained in `wait=1` with no active worker.
- **embedded:** API health returned `mode=embedded`, `location=local`, `local_workers=1`.
  SIGINT logged `Background worker stopped` before the process exited.
- **standalone:** the HTTP API returned `location=external`, `local_workers=0`; a separate
  `dist/worker.js` process opened the BullMQ consumer connections. Both root and container
  worker starts succeeded, and shutdown logged the worker close.
- Starting the dedicated worker directly with `WORKER_MODE=disabled` exited non-zero as
  designed. Root `dev:worker` and `start:worker` force standalone mode.

## Scope and security review

Cloudflare contains presentation rendering only. All current and future authentication,
authorization, webhook and workflow authority stays in NestJS. The amendment added no business
route, processor or table. The database remains limited to `outbox_events`, `webhook_events`
and `audit_events`.

No real Cloudflare, Render, Supabase, Upstash, Tigris or R2 account was mutated during validation.
The remaining hosted-environment checks are recorded in `KNOWN_ISSUES.md`.
