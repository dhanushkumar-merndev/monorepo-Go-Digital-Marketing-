# API application

NestJS modular-monolith foundation for the Go Digital Automobile CRM. Phase 0
contains platform infrastructure only; it intentionally has no authentication,
tenancy or dealership workflow endpoints.

## Routes

- `GET /v1/health` checks PostgreSQL and Redis and returns `503` when either is unavailable.
- `GET /v1/health/live` reports process liveness without checking dependencies.
- `GET /v1/health/ready` checks PostgreSQL and Redis readiness.
- `/docs` serves Swagger UI and `/docs-json` serves the OpenAPI document.

Run from the repository root:

```sh
pnpm install
pnpm services:up
pnpm dev:api
```

`WORKER_MODE=disabled` starts no consumers, `embedded` starts one BullMQ worker in the API, and
`standalone` keeps the API producer-only while `pnpm dev:worker` or `pnpm start:worker` runs the
consumer entry point. All health responses expose the configured processing mode and location.

The API validates its environment through `@gdm/config`. PostgreSQL access is
created through `@gdm/database`; Redis/BullMQ and private S3-compatible storage
remain behind injectable ports. The Tigris adapter uses the standard AWS SDK S3
interface so a later S3 migration does not change application contracts.

The Dockerfile uses the repository root as its build context:

```sh
docker build -f apps/api/Dockerfile -t gdm-api .
```

The same image serves both Render process types: `node dist/main.js` for the web service and
`node dist/worker.js` for the background worker. See
`docs/implementation/DEPLOYMENT.md` for the Render, Supabase, Upstash and Tigris/R2 setup.
