# Phase 0 Architecture

## Scope

Phase 0 establishes deployable application shells and infrastructure seams. It intentionally
does not implement authentication, client organizations, memberships, users, leads, customer
communications, inventory, bookings or other dealership processes. Those modules require their
own phase-specific state, authorization, tenant-isolation and acceptance tests.

## Runtime boundaries

```text
Office browser ──> apps/web ──┐
                             ├──> apps/api (/v1) ──> Supabase PostgreSQL
Android app ────> apps/mobile ┘          │         ├──> Upstash Redis / BullMQ
                                        │         └──> Tigris S3 API
                                        └──> structured logs / error reporter
```

- `apps/api` is the future authority for authorization and business transitions. Phase 0 exposes
  only platform health endpoints and OpenAPI documentation.
- `apps/web` is a Next.js App Router shell. Its reusable controls come from the project-owned
  `@gdm/ui` shadcn package; there is no competing component framework.
- `apps/mobile` is an Expo Router application with project-owned NativeWind primitives. It shares
  semantic values from `@gdm/design-tokens` and never imports web components.
- PostgreSQL remains the source of truth. Redis is an availability/performance dependency for
  queues, not a future business-data source.

## Shared packages

| Package                  | Responsibility                                                | Explicit boundary                                           |
| ------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------- |
| `@gdm/contracts`         | Zod contracts for error and health payloads                   | Contains no runtime infrastructure or domain workflow       |
| `@gdm/config`            | Validates server, web and mobile environment values           | Public subpaths cannot return database, Redis or S3 secrets |
| `@gdm/database`          | Drizzle schema, migration runner and PostgreSQL connection    | Contains only Phase 0 platform tables                       |
| `@gdm/design-tokens`     | Colour, typography, radius, spacing, shadow and status values | Cross-platform values only; no React components             |
| `@gdm/ui`                | Web-only project-owned shadcn components                      | Must never be imported by React Native                      |
| `@gdm/eslint-config`     | Shared flat ESLint policy                                     | Tooling only                                                |
| `@gdm/typescript-config` | Strict compiler baselines                                     | Tooling only                                                |

## API request and failure contract

Ingress accepts a valid `X-Correlation-Id` or creates one, makes it available throughout the
request, returns it in `X-Correlation-Id`, and includes it in structured logs and error bodies.
All errors use this shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Input validation failed.",
    "correlation_id": "request-id",
    "details": [{ "field": "name", "reason": "required" }],
    "retryable": false
  }
}
```

The global exception boundary maps validation, authentication, authorization, missing resource,
conflict, rate-limit, provider and unexpected failures to stable PRD error codes. Logs redact
authorization headers, cookies, credentials, tokens and common password fields. The error
reporter interface uses a no-op adapter without a DSN and is ready for Sentry configuration.

## Health semantics

- `GET /v1/health` is the canonical dependency-aware health response. It probes PostgreSQL and
  Redis and returns the same readiness contract as `GET /v1/health/ready`.
- `GET /v1/health/live` is a process liveness probe and does not contact dependencies.
- `GET /v1/health/ready` independently probes PostgreSQL and Redis, reports real `up`/`down`
  states and latency, and returns `503` when either required dependency is unavailable. Probe
  failures are sanitized and never expose connection strings.

Redis failure therefore makes a worker/API instance unready, but future accepted business state
must still be committed through PostgreSQL and the outbox before asynchronous publication.

## Infrastructure adapters

- PostgreSQL uses `postgres` and Drizzle with prepared statements disabled for compatibility with
  Supabase transaction poolers.
- Redis and BullMQ construction stays behind API-owned factories/probes. Connections fail fast for
  readiness and do not use an offline command queue that could imply a successful operation.
- Object storage uses the AWS SDK S3 interface, private buckets and provider-neutral operations.
  Local development points the same adapter at MinIO; production points it at Tigris.
- Provider credentials exist only in validated server configuration and are never exposed through
  `NEXT_PUBLIC_*` or `EXPO_PUBLIC_*` values.

## Portability and deployment

The API Docker build uses the workspace root as its build context so internal packages and the
single lockfile remain intact. Runtime dependencies are injected through environment variables.
No domain contract depends on Vercel, Render, Supabase, Upstash or Tigris-only behavior, preserving
the PRD migration path to AWS equivalents.

## Phase 1 guardrails

Authentication and tenancy must arrive together with default-deny authorization, active
membership checks, session revocation and cross-tenant tests. The nullable tenant column on
platform-scoped audit/outbox rows is protected by a scope check; client-scoped rows require a
tenant identifier. Webhook rows are always client-owned and require it. Foreign keys to the client
organization table are intentionally deferred until that table is created in the approved phase.
