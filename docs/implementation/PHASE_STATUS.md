# Phase Status

- **Current phase:** Phase 0 — Monorepo and Architecture Foundation
- **Current status:** Complete
- **Completed phases:** Phase 0
- **Last updated:** 2026-08-01

## Acceptance criteria

- [x] A fresh workspace installation succeeds from the root and creates one lockfile.
- [x] Web, API and mobile development entry points start independently.
- [x] API health/readiness reports PostgreSQL and Redis state accurately.
- [x] API failures use the shared consistent error envelope and correlation ID.
- [x] OpenAPI documentation loads.
- [x] Web uses project-owned shadcn/Base UI components and no competing UI framework.
- [x] Root formatting, lint, type-check, unit, integration and production-build commands pass.
- [x] No dealership workflow has been implemented.
- [x] Phase 0 handoff contains actual implementation and Phase 1 prerequisites.

## Last verified results

All commands were run from the repository root on 2026-08-01. Node.js 24 LTS is the CI and
container baseline; the completion run also passed on the available Node.js 26.4.0 host.

| Check                                    | Result | Evidence                                                                                                 |
| ---------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile --force` | Pass   | Re-fetched and copied the complete workspace dependency tree from the single lockfile                    |
| `pnpm install --frozen-lockfile`         | Pass   | Exact follow-up install completed without lockfile changes                                               |
| `pnpm format:check`                      | Pass   | Prettier reported all matched files formatted                                                            |
| `pnpm db:check`                          | Pass   | Drizzle reported the migration metadata and schema snapshot valid                                        |
| `pnpm lint`                              | Pass   | All 8 lint tasks passed with zero warnings                                                               |
| `pnpm type-check`                        | Pass   | All 13 strict TypeScript tasks passed                                                                    |
| `pnpm test`                              | Pass   | 36 tests passed across API, web, mobile and shared packages                                              |
| `pnpm test:integration`                  | Pass   | 9 API/database integration tests passed                                                                  |
| `pnpm build`                             | Pass   | NestJS, Next.js production and Expo Android export builds plus shared-package builds passed              |
| Expo/Android checks                      | Pass   | Expo dependency check, Android prebuild, production export and Gradle release-manifest processing passed |

## Runtime verification

- Web development and production servers returned `200` with the expected shell and security
  headers.
- API development watch mode compiled with zero errors. Liveness returned `200`; readiness
  returned `200` with real PostgreSQL and Redis, then `503` with Redis stopped while accurately
  retaining the database `up` state.
- An unknown API route returned the standard `NOT_FOUND` envelope and propagated the supplied
  correlation ID. `/docs-json` returned the valid versioned OpenAPI document.
- The mobile Expo/Metro server reported `packager-status:running`; the Android production bundle
  exported successfully. The merged release manifest contained no location, accessibility, call
  log, contacts, SMS, legacy storage or overlay permissions.
- Migration `0000_neat_shadowcat.sql` applied to both in-process PGlite and real PostgreSQL 17.
  Tests verified migration metadata, tenant-scope checks, webhook idempotency and immutable audit
  events.

## Scope and security review

The database contains only `outbox_events`, `webhook_events` and `audit_events`. The API exposes
only health and OpenAPI endpoints, and the clients expose foundation shells only. There are no
users, memberships, leads, inventory, bookings or dealership workflows. Client-scoped platform
rows already require `client_organization_id`; Phase 1 must add foreign keys when the client
organization table exists and prove cross-tenant authorization for every protected resource.
