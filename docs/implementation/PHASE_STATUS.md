# Phase Status

- **Current phase:** Phase 99 — Strict completion audit of Phase 0 deployment amendment
- **Current status:** Passed strict completion audit; no Phase 1 work started
- **Completed phases:** Phase 0 foundation and Phase 0 deployment amendment
- **Last updated:** 2026-08-02

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
- [x] Formatting check, lint, type-check, unit/integration tests, monorepo build, OpenNext
      build/preview and OCI image build passed in the strict audit.
- [x] No Phase 1 authentication, authorization, tenancy or dealership workflow was started.

## Last verified results

Strict audit checks were run from the repository root on 2026-08-02. Node.js 24 is the
CI/container baseline; repository commands passed on the available Node.js 26.4.0 host with
pnpm 11.18.0. The local sandbox blocked `tsx` IPC pipes and OpenNext localhost binding, so those
same commands were rerun outside the sandbox and passed.

| Check                            | Result | Actual evidence                                                                                  |
| -------------------------------- | ------ | ------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile` | Pass   | Workspace already matched the one root lockfile                                                  |
| `pnpm format:check`              | Pass   | Prettier reported all matched files use configured style                                         |
| `pnpm db:check`                  | Pass   | Drizzle migration metadata/snapshot reported valid with `DATABASE_URL` and `DIRECT_DATABASE_URL` |
| `pnpm lint`                      | Pass   | 8 applicable workspace lint tasks, zero warnings                                                 |
| `pnpm type-check`                | Pass   | 13 strict TypeScript tasks                                                                       |
| `pnpm test`                      | Pass   | 63 tests across API, web, mobile and shared packages after sandbox rerun                         |
| `pnpm test:integration`          | Pass   | 9 API/database integration tests after sandbox rerun                                             |
| `pnpm build`                     | Pass   | NestJS API/worker, Next.js, Expo Android export path and shared packages                         |
| `pnpm build:web:cloudflare`      | Pass   | OpenNext 1.20.2 emitted `.open-next/worker.js` after sandbox rerun                               |
| `pnpm preview:web`               | Pass   | Wrangler 4.118.0 returned `200` and 44,069 bytes for `GET /` on `localhost:8787`                 |
| API OCI image                    | Pass   | Existing Dockerfile built with Podman as `localhost/gdm-api:audit-phase0`                        |
| API/worker image smoke           | Pass   | Image honored Render `PORT=10000`, Tigris aliases and standalone split; readiness was 200        |

## Worker-mode runtime verification

Real PostgreSQL 17 and Redis 8 containers were used in the strict audit:

- **disabled:** API health returned `mode=disabled`, `location=disabled`, `local_workers=0`;
  PostgreSQL and Redis were both `up`.
- **embedded:** API health returned `mode=embedded`, `location=local`, `local_workers=1`.
  Container logs showed `Background worker started`.
- **standalone:** the HTTP API returned `location=external`, `local_workers=0`; a separate
  `dist/worker.js` process opened the BullMQ consumer connections and logged
  `Standalone background worker running`.
- **shutdown:** a 30-second SIGTERM grace period logged `Background worker stopped` and exited
  cleanly. A forced 10-second Podman removal killed the worker; Render is configured with
  `maxShutdownDelaySeconds: 120`.

## Scope and security review

Cloudflare contains presentation rendering only. All current and future authentication,
authorization, webhook and workflow authority stays in NestJS. The amendment added no business
route, processor or table. The database remains limited to `outbox_events`, `webhook_events`
and `audit_events`.

No real provider keys were added to the repository. Real Supabase, Upstash, Tigris/R2 and Sentry
values must be set in Render or a private uncommitted `.env`; Cloudflare should receive only the
public `NEXT_PUBLIC_API_URL`.

No real Cloudflare, Render, Supabase, Upstash, Tigris or R2 account was mutated during validation.
The remaining hosted-environment checks are recorded in `KNOWN_ISSUES.md`.
